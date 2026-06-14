use anchor_lang::prelude::*;
use anchor_lang::AccountsExit;
use ephemeral_rollups_sdk::anchor::{commit, ephemeral_accounts};
use ephemeral_rollups_sdk::ephem::{FoldableIntentBuilder, MagicIntentBundleBuilder};

use crate::amm::PythagoreanCurve;
use crate::state::{
    Config, ConfigError, Market, MarketError, MarketStatus, Outcome, PositionError,
    PrivateMarketState, PRIVATE_MARKET_STATE_DISCRIMINATOR, PrivatePositionState,
    PRIVATE_POSITION_STATE_DISCRIMINATOR, PrivateStateError, TraderPosition,
};

/// Event emitted when private market state is initialized inside MagicBlock / PER.
#[event]
pub struct PrivateMarketStateInitialized {
    pub market: Pubkey,
    pub creator: Pubkey,
    pub private_market_state: Pubkey,
    pub creator_private_position: Pubkey,
    pub reserves: u64,
    pub yes_supply: u64,
    pub no_supply: u64,
    pub timestamp: i64,
}

/// Event emitted when private trader position state is initialized inside MagicBlock / PER.
#[event]
pub struct PrivatePositionStateInitialized {
    pub market: Pubkey,
    pub trader: Pubkey,
    pub position: Pubkey,
    pub private_position: Pubkey,
    pub collateral_available: u64,
    pub timestamp: i64,
}

/// Event emitted when a private prediction is placed.
///
/// Important:
/// This event intentionally does NOT reveal:
/// - YES/NO side
/// - amount
/// - live YES supply
/// - live NO supply
///
/// The actual position remains inside MagicBlock / PER private state.
#[event]
pub struct PrivatePredictionPlaced {
    pub market: Pubkey,
    pub trader: Pubkey,
    pub timestamp: i64,
}

/// Event emitted when a private market is resolved inside MagicBlock / PER.
#[event]
pub struct PrivateMarketResolvedEr {
    pub market: Pubkey,
    pub resolver: Pubkey,
    pub outcome: Outcome,
    pub final_reserves: u64,
    pub final_yes_supply: u64,
    pub final_no_supply: u64,
    pub timestamp: i64,
}

/// Event emitted when a private position is settled inside MagicBlock / PER.
#[event]
pub struct PrivatePositionSettledEr {
    pub market: Pubkey,
    pub trader: Pubkey,
    pub position: Pubkey,
    pub claimable_amount: u64,
    pub idle_collateral: u64,
    pub winning_shares: u64,
    pub timestamp: i64,
}

/// Initialize the ER/PER-only private market state.
///
/// This should be called after:
/// - create_private_market
/// - delegate_market_into_tee
/// - delegate_position_into_tee for creator position
///
/// This validates the delegated creator private position inside PER.
///
/// The delegated market shell itself tracks live ER market totals.
#[derive(Accounts)]
pub struct InitializePrivateMarketState<'info> {
    /// Market creator.
    #[account(mut)]
    pub creator: Signer<'info>,

    /// Global config.
    #[account(
        seeds = [Config::SEED],
        bump = config.bump,
        constraint = !config.paused @ ConfigError::ProtocolPaused,
    )]
    pub config: Account<'info, Config>,

    /// Public market shell.
    ///
    /// This sponsors/anchors the ER private market state.
    #[account(
        seeds = [Market::SEED, market.id.to_le_bytes().as_ref()],
        bump = market.bump,
        constraint = market.creator == creator.key() @ MarketError::UnauthorizedCreator,
        constraint = market.status == MarketStatus::Active @ MarketError::MarketNotActive,
        constraint = market.collateral_mint == config.collateral_mint,
    )]
    pub market: Account<'info, Market>,

    /// Creator public position shell.
    ///
    /// This delegated PDA validates the creator's escrowed L1 position.
    ///
    /// CHECK:
    /// This delegated shell is deserialized manually to avoid Anchor write-back
    /// on exit.
    #[account(
        seeds = [TraderPosition::SEED, market.key().as_ref(), creator.key().as_ref()],
        bump,
    )]
    pub creator_position: AccountInfo<'info>,

    /// Delegated creator live position state.
    ///
    /// CHECK:
    /// Created on L1, delegated into MagicBlock, then loaded manually.
    #[account(
        seeds = [PrivatePositionState::SEED, market.key().as_ref(), creator.key().as_ref()],
        bump,
    )]
    pub private_position: AccountInfo<'info>,

}

impl<'info> InitializePrivateMarketState<'info> {
    pub fn initialize_private_market_state(
        &mut self,
        _bumps: InitializePrivateMarketStateBumps,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let creator_position = load_position_from_account_info_allow_delegated(&self.creator_position)?;

        require_keys_eq!(
            creator_position.market,
            self.market.key(),
            PositionError::PositionMarketMismatch
        );
        require_keys_eq!(
            creator_position.trader,
            self.creator.key(),
            PositionError::UnauthorizedTrader
        );
        require!(
            !creator_position.claimed,
            PositionError::PositionAlreadyClaimed
        );
        require!(
            !creator_position.settled,
            PositionError::PositionAlreadySettled
        );

        let initial_liquidity = creator_position.l1_idle_collateral()?;

        require!(
            initial_liquidity >= self.config.min_liquidity,
            PrivateRollupInstructionError::InsufficientLiquidity
        );

        let creator_private_position = load_private_position_state(&self.private_position)?;
        creator_private_position.assert_market(&self.market.key())?;
        creator_private_position.assert_trader(&self.creator.key())?;
        creator_private_position.assert_not_claimed()?;

        require!(
            creator_private_position.collateral_deposited == initial_liquidity
                && creator_private_position.collateral_available == 0
                && creator_private_position.yes_shares == initial_liquidity
                && creator_private_position.no_shares == initial_liquidity,
            PrivateRollupInstructionError::InvalidAccount
        );

        emit!(PrivateMarketStateInitialized {
            market: self.market.key(),
            creator: self.creator.key(),
            private_market_state: self.market.key(),
            creator_private_position: self.private_position.key(),
            reserves: initial_liquidity,
            yes_supply: initial_liquidity,
            no_supply: initial_liquidity,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }
}

/// Initialize a normal trader's ER/PER-only private position state.
///
/// This should be called after:
/// - open_position
/// - deposit_collateral
/// - delegate_position_into_tee
///
/// It validates the trader's delegated private position account inside PER.
#[derive(Accounts)]
pub struct InitializePrivatePositionState<'info> {
    /// Trader.
    #[account(mut)]
    pub trader: Signer<'info>,

    /// Global config.
    #[account(
        seeds = [Config::SEED],
        bump = config.bump,
        constraint = !config.paused @ ConfigError::ProtocolPaused,
    )]
    pub config: Account<'info, Config>,

    /// Public market shell.
    #[account(
        seeds = [Market::SEED, market.id.to_le_bytes().as_ref()],
        bump = market.bump,
        constraint = market.status == MarketStatus::Active @ MarketError::MarketNotActive,
        constraint = market.collateral_mint == config.collateral_mint,
    )]
    pub market: Account<'info, Market>,

    /// Trader public position shell.
    ///
    /// CHECK:
    /// This delegated shell is deserialized manually to avoid Anchor write-back
    /// on exit.
    #[account(
        seeds = [TraderPosition::SEED, market.key().as_ref(), trader.key().as_ref()],
        bump,
    )]
    pub position: AccountInfo<'info>,

    /// Delegated trader private position state.
    ///
    /// CHECK:
    /// Created on L1, delegated into MagicBlock, then loaded manually.
    #[account(
        seeds = [PrivatePositionState::SEED, market.key().as_ref(), trader.key().as_ref()],
        bump,
    )]
    pub private_position: AccountInfo<'info>,
}

impl<'info> InitializePrivatePositionState<'info> {
    pub fn initialize_private_position_state(
        &mut self,
        _bumps: InitializePrivatePositionStateBumps,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let position = load_position_from_account_info_allow_delegated(&self.position)?;
        require_keys_eq!(
            position.market,
            self.market.key(),
            PositionError::PositionMarketMismatch
        );
        require_keys_eq!(
            position.trader,
            self.trader.key(),
            PositionError::UnauthorizedTrader
        );
        require!(
            !position.claimed,
            PositionError::PositionAlreadyClaimed
        );
        require!(
            !position.settled,
            PositionError::PositionAlreadySettled
        );

        let collateral_available = position.l1_idle_collateral()?;

        let private_position = load_private_position_state(&self.private_position)?;
        private_position.assert_market(&self.market.key())?;
        private_position.assert_trader(&self.trader.key())?;
        private_position.assert_not_claimed()?;

        require!(
            private_position.collateral_deposited == collateral_available
                && private_position.collateral_available == collateral_available
                && private_position.yes_shares == 0
                && private_position.no_shares == 0,
            PrivateRollupInstructionError::InvalidAccount
        );

        emit!(PrivatePositionStateInitialized {
            market: self.market.key(),
            trader: self.trader.key(),
            position: self.position.key(),
            private_position: self.private_position.key(),
            collateral_available,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }
}

/// Private ER/PER trading accounts.
///
/// Retained for backwards compatibility while migrating to sealed predictions.
#[ephemeral_accounts]
#[derive(Accounts)]
pub struct TradePrivateEr<'info> {
    /// Trader.
    #[account(mut)]
    pub trader: Signer<'info>,

    /// Global config.
    #[account(
        seeds = [Config::SEED],
        bump = config.bump,
        constraint = !config.paused @ ConfigError::ProtocolPaused,
    )]
    pub config: Account<'info, Config>,

    /// Public market shell.
    #[account(
        seeds = [Market::SEED, market.id.to_le_bytes().as_ref()],
        bump = market.bump,
        constraint = market.status == MarketStatus::Active @ MarketError::MarketNotActive,
        constraint = market.collateral_mint == config.collateral_mint,
    )]
    pub market: Account<'info, Market>,

    /// Trader public position shell.
    #[account(
        mut,
        sponsor,
        seeds = [TraderPosition::SEED, market.key().as_ref(), trader.key().as_ref()],
        bump = position.bump,
        constraint = position.market == market.key() @ PositionError::PositionMarketMismatch,
        constraint = position.trader == trader.key() @ PositionError::UnauthorizedTrader,
        constraint = position.delegated @ PositionError::PositionNotDelegated,
        constraint = !position.claimed @ PositionError::PositionAlreadyClaimed,
        constraint = !position.settled @ PositionError::PositionAlreadySettled,
    )]
    pub position: Account<'info, TraderPosition>,

    /// ER/PER-only market state.
    ///
    /// CHECK:
    /// Loaded/stored manually.
    #[account(
        mut,
        eph,
        seeds = [PrivateMarketState::SEED, market.key().as_ref()],
        bump,
    )]
    pub market_state: AccountInfo<'info>,

    /// ER/PER-only trader private position.
    ///
    /// CHECK:
    /// Loaded/stored manually.
    #[account(
        mut,
        eph,
        seeds = [PrivatePositionState::SEED, market.key().as_ref(), trader.key().as_ref()],
        bump,
    )]
    pub private_position: AccountInfo<'info>,
}

/// Place a private prediction inside ER/PER.
///
/// Traders allocate idle collateral from their private position to either the
/// YES or NO side. 1 unit of collateral mints 1 virtual YES or NO share.
#[commit]
#[derive(Accounts)]
pub struct PlacePrivatePrediction<'info> {
    #[account(mut)]
    pub trader: Signer<'info>,

    #[account(
        seeds = [Config::SEED],
        bump = config.bump,
        constraint = !config.paused @ ConfigError::ProtocolPaused,
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [Market::SEED, &market.id.to_le_bytes()],
        bump = market.bump,
        constraint = market.status == MarketStatus::Active @ MarketError::MarketNotActive,
        constraint = market.collateral_mint == config.collateral_mint,
    )]
    pub market: Account<'info, Market>,

    /// CHECK:
    /// Delegated public position shell used only for validation. Live hidden
    /// exposure lives in the private position account.
    #[account(
        seeds = [TraderPosition::SEED, market.key().as_ref(), trader.key().as_ref()],
        bump,
    )]
    pub position: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [PrivatePositionState::SEED, market.key().as_ref(), trader.key().as_ref()],
        bump,
    )]
    /// CHECK:
    /// Loaded/stored manually by handler.
    pub private_position: AccountInfo<'info>,
}

impl<'info> PlacePrivatePrediction<'info> {
    pub fn place_private_prediction(
        &mut self,
        amount: u64,
        predict_yes: bool,
    ) -> Result<()> {
        require!(amount > 0, PrivateStateError::InvalidAmount);

        let clock = Clock::get()?;

        require!(
            self.market.status == MarketStatus::Active,
            MarketError::MarketNotActive
        );
        require!(
            clock.unix_timestamp < self.market.end_time as i64,
            PrivateRollupInstructionError::MarketEnded
        );
        let position = load_position_from_account_info_allow_delegated(&self.position)?;
        require_keys_eq!(
            position.market,
            self.market.key(),
            PositionError::PositionMarketMismatch
        );
        require_keys_eq!(
            position.trader,
            self.trader.key(),
            PositionError::UnauthorizedTrader
        );
        require!(
            !position.claimed,
            PositionError::PositionAlreadyClaimed
        );
        require!(
            !position.settled,
            PositionError::PositionAlreadySettled
        );

        let mut private_position = load_private_position_state(&self.private_position)?;
        private_position.assert_trader(&self.trader.key())?;
        private_position.assert_market(&self.market.key())?;
        private_position.assert_not_claimed()?;

        private_position.spend_collateral(amount)?;

        if predict_yes {
            private_position.add_yes_shares(amount)?;
            self.market.live_yes_supply = self.market
                .live_yes_supply
                .checked_add(amount)
                .ok_or(PrivateStateError::ArithmeticOverflow)?;
        } else {
            private_position.add_no_shares(amount)?;
            self.market.live_no_supply = self.market
                .live_no_supply
                .checked_add(amount)
                .ok_or(PrivateStateError::ArithmeticOverflow)?;
        }

        self.market.live_reserves = self.market
            .live_reserves
            .checked_add(amount)
            .ok_or(PrivateStateError::ArithmeticOverflow)?;

        store_private_position_state(&self.private_position, &private_position)?;
        emit!(PrivatePredictionPlaced {
            market: self.market.key(),
            trader: self.trader.key(),
            timestamp: clock.unix_timestamp,
        });

        MagicIntentBundleBuilder::new(
            self.trader.to_account_info(),
            self.magic_context.to_account_info(),
            self.magic_program.to_account_info(),
        )
        .commit(&[
            self.private_position.to_account_info(),
        ])
        .build_and_invoke()?;

        Ok(())
    }
}

/// Resolve private market inside ER/PER.
///
/// Permission:
/// - configured oracle only
///
/// This updates the delegated market shell, which is the live ER market
/// aggregate in the simplified design.
#[commit]
#[derive(Accounts)]
pub struct ResolvePrivateMarketEr<'info> {
    /// Oracle / resolver.
    #[account(mut)]
    pub oracle: Signer<'info>,

    /// Global config.
    #[account(
        seeds = [Config::SEED],
        bump = config.bump,
        constraint = config.oracle == oracle.key() @ ConfigError::Unauthorized,
    )]
    pub config: Account<'info, Config>,

    /// Public market shell.
    #[account(
        mut,
        seeds = [Market::SEED, &market.id.to_le_bytes()],
        bump = market.bump,
        constraint = market.collateral_mint == config.collateral_mint,
    )]
    pub market: Account<'info, Market>,

}

impl<'info> ResolvePrivateMarketEr<'info> {
    pub fn resolve_private_market_er(&mut self, yes_wins: bool) -> Result<()> {
        let clock = Clock::get()?;

        let market_id_bytes = self.market.id.to_le_bytes();
        let (expected_market, expected_bump) = Pubkey::find_program_address(
            &[Market::SEED, market_id_bytes.as_ref()],
            &crate::ID,
        );

        require_keys_eq!(
            expected_market,
            self.market.key(),
            PrivateRollupInstructionError::InvalidMarketPda
        );

        require!(
            expected_bump == self.market.bump,
            PrivateRollupInstructionError::InvalidMarketPda
        );

        require!(
            clock.unix_timestamp >= self.market.end_time as i64,
            MarketError::MarketNotEnded
        );

        require!(
            self.market.status == MarketStatus::Active
                || self.market.status == MarketStatus::Ended,
            PrivateRollupInstructionError::MarketAlreadyResolved
        );

        let outcome = if yes_wins {
            Outcome::Yes
        } else {
            Outcome::No
        };

        let final_reserves = self.market.live_reserves;
        self.market.mark_resolved(outcome, final_reserves);
        self.market.mark_settlement_open();
        self.market.exit(&crate::ID)?;

        emit!(PrivateMarketResolvedEr {
            market: self.market.key(),
            resolver: self.oracle.key(),
            outcome,
            final_reserves,
            final_yes_supply: self.market.live_yes_supply,
            final_no_supply: self.market.live_no_supply,
            timestamp: clock.unix_timestamp,
        });

        MagicIntentBundleBuilder::new(
            self.oracle.to_account_info(),
            self.magic_context.to_account_info(),
            self.magic_program.to_account_info(),
        )
        .commit(&[self.market.to_account_info()])
        .build_and_invoke()?;

        Ok(())
    }
}

/// Settle one private position after market resolution.
///
/// This calculates:
///
/// claimable_amount = idle_collateral + proportional winning payout
///
/// and writes final claimable amount into the public TraderPosition shell.
///
/// Important:
/// This is the privacy boundary:
/// - during live trading, YES/NO shares stay private
/// - after settlement, claimable amount becomes public
#[commit]
#[derive(Accounts)]
pub struct SettlePrivatePositionEr<'info> {
    /// Trader or authorized keeper settling this position.
    ///
    /// For now, trader must sign.
    /// Later you can allow keeper/admin/oracle to settle many positions.
    #[account(mut)]
    pub trader: Signer<'info>,

    /// Global config.
    #[account(
        seeds = [Config::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    /// Public market shell.
    #[account(
        seeds = [Market::SEED, market.id.to_le_bytes().as_ref()],
        bump = market.bump,
        constraint = market.status == MarketStatus::SettlementOpen
            || market.status == MarketStatus::Resolved
            || market.status == MarketStatus::Closed @ MarketError::MarketNotResolved,
        constraint = market.collateral_mint == config.collateral_mint,
    )]
    pub market: Account<'info, Market>,

    /// Public position shell.
    #[account(
        mut,
        seeds = [TraderPosition::SEED, market.key().as_ref(), trader.key().as_ref()],
        bump = position.bump,
        constraint = position.market == market.key() @ PositionError::PositionMarketMismatch,
        constraint = position.trader == trader.key() @ PositionError::UnauthorizedTrader,
        constraint = !position.claimed @ PositionError::PositionAlreadyClaimed,
        constraint = !position.settled @ PositionError::PositionAlreadySettled,
    )]
    pub position: Account<'info, TraderPosition>,

    /// ER/PER-only trader private position state.
    ///
    /// CHECK:
    /// Loaded/stored manually.
    #[account(
        mut,
        seeds = [PrivatePositionState::SEED, market.key().as_ref(), trader.key().as_ref()],
        bump,
    )]
    pub private_position: AccountInfo<'info>,
}

impl<'info> SettlePrivatePositionEr<'info> {
    pub fn settle_private_position_er(&mut self) -> Result<u64> {
        let clock = Clock::get()?;

        let mut private_position = load_private_position_state(&self.private_position)?;

        self.market.assert_resolved_or_settlement_open()?;
        private_position.assert_trader(&self.trader.key())?;
        private_position.assert_market(&self.market.key())?;
        private_position.assert_not_claimed()?;

        let idle_collateral = private_position.collateral_available;

        let claimable_amount = if self.market.outcome == Outcome::Invalid {
            private_position.collateral_deposited
        } else {
            let winning_supply = self.market.winning_live_supply()?;
            require!(
                winning_supply > 0,
                PrivateStateError::WinningSupplyIsZero
            );

            let winning_shares = match self.market.outcome {
                Outcome::Yes => private_position.yes_shares,
                Outcome::No => private_position.no_shares,
                Outcome::Invalid | Outcome::Undetermined => 0,
            };

            let winning_payout = PythagoreanCurve::proportional_payout(
                winning_shares,
                winning_supply,
                self.market.final_reserves,
            )?;

            idle_collateral
                .checked_add(winning_payout)
                .ok_or(PrivateStateError::ArithmeticOverflow)?
        };

        self.position.settle(claimable_amount)?;
        private_position.mark_claimed();

        store_private_position_state(&self.private_position, &private_position)?;
        self.position.exit(&crate::ID)?;

        let winning_shares = match self.market.outcome {
            Outcome::Yes => private_position.yes_shares,
            Outcome::No => private_position.no_shares,
            Outcome::Invalid | Outcome::Undetermined => 0,
        };

        emit!(PrivatePositionSettledEr {
            market: self.market.key(),
            trader: self.trader.key(),
            position: self.position.key(),
            claimable_amount,
            idle_collateral,
            winning_shares,
            timestamp: clock.unix_timestamp,
        });

        MagicIntentBundleBuilder::new(
            self.trader.to_account_info(),
            self.magic_context.to_account_info(),
            self.magic_program.to_account_info(),
        )
        .commit(&[
            self.position.to_account_info(),
            self.private_position.to_account_info(),
        ])
        .build_and_invoke()?;

        Ok(claimable_amount)
    }
}

/// Load PrivateMarketState from an ER/PER account.
pub fn load_private_market_state(account: &AccountInfo) -> Result<PrivateMarketState> {
    let data = account.try_borrow_data()?;

    require!(
        data.len() >= 8 + PrivateMarketState::LEN,
        PrivateStateError::PrivateMarketStateNotInitialized
    );

    require!(
        data[0..8] == PRIVATE_MARKET_STATE_DISCRIMINATOR,
        PrivateStateError::PrivateMarketStateNotInitialized
    );

    let mut slice: &[u8] = &data[8..8 + PrivateMarketState::LEN];

    PrivateMarketState::deserialize(&mut slice)
        .map_err(|_| error!(PrivateStateError::PrivateMarketStateNotInitialized))
}

/// Store PrivateMarketState into an ER/PER account.
pub fn store_private_market_state(
    account: &AccountInfo,
    state: &PrivateMarketState,
) -> Result<()> {
    let mut data = account.try_borrow_mut_data()?;

    require!(
        data.len() >= 8 + PrivateMarketState::LEN,
        PrivateStateError::PrivateMarketStateNotInitialized
    );

    data[0..8].copy_from_slice(&PRIVATE_MARKET_STATE_DISCRIMINATOR);

    let mut writer = &mut data[8..8 + PrivateMarketState::LEN];
    state.serialize(&mut writer)?;

    Ok(())
}

/// Load PrivatePositionState from an ER/PER account.
pub fn load_private_position_state(account: &AccountInfo) -> Result<PrivatePositionState> {
    let data = account.try_borrow_data()?;

    require!(
        data.len() >= 8 + PrivatePositionState::LEN,
        PrivateStateError::PrivatePositionStateNotInitialized
    );

    require!(
        data[0..8] == PRIVATE_POSITION_STATE_DISCRIMINATOR,
        PrivateStateError::PrivatePositionStateNotInitialized
    );

    let mut slice: &[u8] = &data[8..8 + PrivatePositionState::LEN];

    PrivatePositionState::deserialize(&mut slice)
        .map_err(|_| error!(PrivateStateError::PrivatePositionStateNotInitialized))
}

/// Store PrivatePositionState into an ER/PER account.
pub fn store_private_position_state(
    account: &AccountInfo,
    state: &PrivatePositionState,
) -> Result<()> {
    let mut data = account.try_borrow_mut_data()?;

    require!(
        data.len() >= 8 + PrivatePositionState::LEN,
        PrivateStateError::PrivatePositionStateNotInitialized
    );

    data[0..8].copy_from_slice(&PRIVATE_POSITION_STATE_DISCRIMINATOR);

    let mut writer = &mut data[8..8 + PrivatePositionState::LEN];
    state.serialize(&mut writer)?;

    Ok(())
}

fn load_position_from_account_info_allow_delegated(account: &AccountInfo) -> Result<TraderPosition> {
    let data = account.try_borrow_data()?;
    let mut slice: &[u8] = &data;
    TraderPosition::try_deserialize(&mut slice)
        .map_err(|_| error!(PrivateRollupInstructionError::InvalidAccount))
}


#[error_code]
pub enum PrivateRollupInstructionError {
    #[msg("Insufficient liquidity")]
    InsufficientLiquidity,

    #[msg("Market has already ended")]
    MarketEnded,

    #[msg("Market is already resolved")]
    MarketAlreadyResolved,

    #[msg("Slippage tolerance exceeded")]
    SlippageExceeded,

    #[msg("Invalid private state account")]
    InvalidPrivateStateAccount,

    #[msg("Invalid market PDA")]
    InvalidMarketPda,

    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,

    #[msg("Vault does not match market vault")]
    InvalidVault,

    #[msg("Invalid account data")]
    InvalidAccount,
}
