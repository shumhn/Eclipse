use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::state::{
    Config, ConfigError, Market, MarketError, PositionError, PositionTopupReceipt,
    PrivatePositionState, TraderPosition, PRIVATE_POSITION_STATE_DISCRIMINATOR,
};

const MAX_DUST_SWEEP_AMOUNT: u64 = 1_000;
const DUST_SWEEP_DELAY_SECONDS: i64 = 60;

/// Event emitted when a trader opens a position shell.
#[event]
pub struct PositionOpened {
    pub market: Pubkey,
    pub trader: Pubkey,
    pub position: Pubkey,
    pub timestamp: i64,
}

/// Event emitted when collateral is deposited into a market vault.
#[event]
pub struct CollateralDeposited {
    pub market: Pubkey,
    pub trader: Pubkey,
    pub position: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct PositionTopupReceiptCreated {
    pub market: Pubkey,
    pub trader: Pubkey,
    pub receipt: Pubkey,
    pub amount: u64,
    pub nonce: u64,
    pub timestamp: i64,
}

/// Event emitted when idle L1 collateral is withdrawn before PER activation.
#[event]
pub struct CollateralWithdrawn {
    pub market: Pubkey,
    pub trader: Pubkey,
    pub position: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

/// Event emitted when a settled private position is claimed from L1 vault.
#[event]
pub struct SettledPositionClaimed {
    pub market: Pubkey,
    pub trader: Pubkey,
    pub position: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

/// Event emitted when a resolved market is closed and tiny residual vault dust is swept.
#[event]
pub struct MarketDustClosed {
    pub market: Pubkey,
    pub authority: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

/// Open a public position shell for a trader.
///
/// Important:
/// This does NOT create the live private position state.
/// It only creates the L1 shell.
///
/// Later:
/// initialize_private_position_state
/// creates the ER/PER-only PrivatePositionState.
#[derive(Accounts)]
pub struct OpenPosition<'info> {
    /// Trader opening a position.
    #[account(mut)]
    pub trader: Signer<'info>,

    /// Global config.
    #[account(
        seeds = [Config::SEED],
        bump = config.bump,
        constraint = !config.paused @ ConfigError::ProtocolPaused,
    )]
    pub config: Account<'info, Config>,

    /// Market shell.
    ///
    /// This may already be delegated to MagicBlock, so it must be loaded
    /// manually instead of through Anchor's owner-checked Account<Market>.
    /// CHECK: Deserialized and validated in the handler to support delegated ownership.
    pub market: AccountInfo<'info>,

    /// Trader position shell.
    #[account(
        init,
        payer = trader,
        space = 8 + TraderPosition::INIT_SPACE,
        seeds = [TraderPosition::SEED, market.key().as_ref(), trader.key().as_ref()],
        bump,
    )]
    pub position: Account<'info, TraderPosition>,

    /// Trader private position state PDA.
    #[account(
        init,
        payer = trader,
        space = 8 + PrivatePositionState::LEN,
        seeds = [PrivatePositionState::SEED, market.key().as_ref(), trader.key().as_ref()],
        bump,
    )]
    /// CHECK: Serialized manually with a stable discriminator.
    pub private_position: AccountInfo<'info>,

    /// System program.
    pub system_program: Program<'info, System>,
}

impl<'info> OpenPosition<'info> {
    pub fn open_position(&mut self, bumps: OpenPositionBumps) -> Result<()> {
        let clock = Clock::get()?;
        let market = load_market_from_account_info_allow_delegated(&self.market)?;

        market.assert_active()?;
        require_keys_eq!(
            market.collateral_mint,
            self.config.collateral_mint,
            PrivatePositionInstructionError::InvalidCollateralMint
        );

        self.position.set_inner(TraderPosition {
            market: self.market.key(),
            trader: self.trader.key(),
            collateral_deposited: 0,
            collateral_withdrawn: 0,
            claimable_amount: 0,
            claimed_amount: 0,
            delegated: false,
            settled: false,
            claimed: false,
            bump: bumps.position,
        });

        let private_position = PrivatePositionState::new(
            self.market.key(),
            self.trader.key(),
            0,
            0,
            0,
            0,
            bumps.private_position,
        );

        store_private_position(&self.private_position, &private_position)?;

        emit!(PositionOpened {
            market: self.market.key(),
            trader: self.trader.key(),
            position: self.position.key(),
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }
}

/// Deposit collateral into the market vault.
///
/// This updates only public aggregate collateral accounting.
/// It does not reveal YES/NO direction because no trade happens here.
///
/// After PER initialization, this deposited amount becomes available inside
/// PrivatePositionState for private trading.
#[derive(Accounts)]
pub struct DepositCollateral<'info> {
    /// Trader depositing collateral.
    #[account(mut)]
    pub trader: Signer<'info>,

    /// Global config.
    #[account(
        seeds = [Config::SEED],
        bump = config.bump,
        constraint = !config.paused @ ConfigError::ProtocolPaused,
    )]
    pub config: Account<'info, Config>,

    /// Market shell.
    ///
    /// Fresh traders may deposit after the market shell has been delegated.
    /// Treat it as read-only account data and validate fields in the handler.
    /// CHECK: Deserialized and validated in the handler to support delegated ownership.
    pub market: AccountInfo<'info>,

    /// Trader position shell.
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

    /// Trader private position state PDA.
    #[account(
        mut,
        seeds = [PrivatePositionState::SEED, market.key().as_ref(), trader.key().as_ref()],
        bump,
    )]
    /// CHECK: Serialized manually before delegation.
    pub private_position: AccountInfo<'info>,

    /// Protocol collateral mint.
    #[account(
        constraint = collateral_mint.key() == config.collateral_mint,
    )]
    pub collateral_mint: InterfaceAccount<'info, Mint>,

    /// Trader's collateral token account.
    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = trader,
        associated_token::token_program = token_program,
    )]
    pub trader_collateral: InterfaceAccount<'info, TokenAccount>,

    /// Market vault.
    #[account(
        mut,
        constraint = vault.mint == collateral_mint.key(),
        constraint = vault.owner == market.key(),
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    /// Token program.
    pub token_program: Interface<'info, TokenInterface>,

    /// Associated token program.
    pub associated_token_program: Program<'info, AssociatedToken>,

    /// System program.
    pub system_program: Program<'info, System>,
}

impl<'info> DepositCollateral<'info> {
    pub fn deposit_collateral(&mut self, amount: u64) -> Result<()> {
        let clock = Clock::get()?;
        let market = load_market_from_account_info_allow_delegated(&self.market)?;

        require!(amount > 0, PositionError::InvalidAmount);
        market.assert_active()?;
        require_keys_eq!(
            market.collateral_mint,
            self.config.collateral_mint,
            PrivatePositionInstructionError::InvalidCollateralMint
        );
        require_keys_eq!(
            market.collateral_mint,
            self.collateral_mint.key(),
            PrivatePositionInstructionError::InvalidCollateralMint
        );
        require_keys_eq!(
            self.vault.key(),
            market.vault,
            PrivatePositionInstructionError::InvalidVault
        );

        require!(
            self.trader_collateral.amount >= amount,
            PrivatePositionInstructionError::InsufficientTokenBalance
        );

        transfer_checked(
            CpiContext::new(
                self.token_program.to_account_info(),
                TransferChecked {
                    from: self.trader_collateral.to_account_info(),
                    mint: self.collateral_mint.to_account_info(),
                    to: self.vault.to_account_info(),
                    authority: self.trader.to_account_info(),
                },
            ),
            amount,
            self.collateral_mint.decimals,
        )?;

        self.position.add_deposit(amount)?;

        let mut private_position = load_private_position(&self.private_position)?;
        private_position.assert_market(&self.market.key())?;
        private_position.assert_trader(&self.trader.key())?;
        private_position.assert_not_claimed()?;
        private_position.collateral_deposited = private_position
            .collateral_deposited
            .checked_add(amount)
            .ok_or(PositionError::ArithmeticOverflow)?;
        private_position.collateral_available = private_position
            .collateral_available
            .checked_add(amount)
            .ok_or(PositionError::ArithmeticOverflow)?;
        store_private_position(&self.private_position, &private_position)?;

        emit!(CollateralDeposited {
            market: self.market.key(),
            trader: self.trader.key(),
            position: self.position.key(),
            amount,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct CreatePositionTopupReceipt<'info> {
    #[account(mut)]
    pub trader: Signer<'info>,

    #[account(
        seeds = [Config::SEED],
        bump = config.bump,
        constraint = !config.paused @ ConfigError::ProtocolPaused,
    )]
    pub config: Account<'info, Config>,

    /// CHECK: The market may already be delegated. We deserialize and validate manually.
    pub market: AccountInfo<'info>,

    #[account(
        init,
        payer = trader,
        space = 8 + PositionTopupReceipt::INIT_SPACE,
        seeds = [
            PositionTopupReceipt::SEED,
            market.key().as_ref(),
            trader.key().as_ref(),
            nonce.to_le_bytes().as_ref()
        ],
        bump,
    )]
    pub receipt: Account<'info, PositionTopupReceipt>,

    #[account(
        constraint = collateral_mint.key() == config.collateral_mint,
    )]
    pub collateral_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = trader,
        associated_token::token_program = token_program,
    )]
    pub trader_collateral: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        constraint = vault.mint == collateral_mint.key(),
        constraint = vault.owner == market.key(),
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

impl<'info> CreatePositionTopupReceipt<'info> {
    pub fn create_position_topup_receipt(
        &mut self,
        nonce: u64,
        amount: u64,
        bumps: CreatePositionTopupReceiptBumps,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let market = load_market_from_account_info_allow_delegated(&self.market)?;

        require!(amount > 0, PositionError::InvalidAmount);
        market.assert_active()?;
        require!(
            clock.unix_timestamp < market.end_time as i64,
            MarketError::MarketAlreadyEnded
        );
        require_keys_eq!(
            market.collateral_mint,
            self.config.collateral_mint,
            PrivatePositionInstructionError::InvalidCollateralMint
        );
        require_keys_eq!(
            market.collateral_mint,
            self.collateral_mint.key(),
            PrivatePositionInstructionError::InvalidCollateralMint
        );
        require_keys_eq!(
            self.vault.key(),
            market.vault,
            PrivatePositionInstructionError::InvalidVault
        );
        require!(
            self.trader_collateral.amount >= amount,
            PrivatePositionInstructionError::InsufficientTokenBalance
        );

        transfer_checked(
            CpiContext::new(
                self.token_program.to_account_info(),
                TransferChecked {
                    from: self.trader_collateral.to_account_info(),
                    mint: self.collateral_mint.to_account_info(),
                    to: self.vault.to_account_info(),
                    authority: self.trader.to_account_info(),
                },
            ),
            amount,
            self.collateral_mint.decimals,
        )?;

        self.receipt.set_inner(PositionTopupReceipt {
            market: self.market.key(),
            trader: self.trader.key(),
            amount,
            nonce,
            consumed: false,
            bump: bumps.receipt,
        });

        emit!(PositionTopupReceiptCreated {
            market: self.market.key(),
            trader: self.trader.key(),
            receipt: self.receipt.key(),
            amount,
            nonce,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }
}

fn load_private_position(account: &AccountInfo) -> Result<PrivatePositionState> {
    let data = account.try_borrow_data()?;

    require!(
        data.len() >= 8 + PrivatePositionState::LEN,
        PrivatePositionInstructionError::InvalidPrivatePositionAccount
    );

    require!(
        data[0..8] == PRIVATE_POSITION_STATE_DISCRIMINATOR,
        PrivatePositionInstructionError::InvalidPrivatePositionAccount
    );

    let mut slice: &[u8] = &data[8..8 + PrivatePositionState::LEN];

    PrivatePositionState::deserialize(&mut slice)
        .map_err(|_| error!(PrivatePositionInstructionError::InvalidPrivatePositionAccount))
}

fn store_private_position(account: &AccountInfo, state: &PrivatePositionState) -> Result<()> {
    let mut data = account.try_borrow_mut_data()?;

    require!(
        data.len() >= 8 + PrivatePositionState::LEN,
        PrivatePositionInstructionError::InvalidPrivatePositionAccount
    );

    data[0..8].copy_from_slice(&PRIVATE_POSITION_STATE_DISCRIMINATOR);

    let mut writer = &mut data[8..8 + PrivatePositionState::LEN];
    state.serialize(&mut writer)?;

    Ok(())
}

fn load_market_from_account_info_allow_delegated(account: &AccountInfo) -> Result<Market> {
    let data = account.try_borrow_data()?;
    let mut slice: &[u8] = &data;

    Market::try_deserialize(&mut slice)
        .map_err(|_| error!(PrivatePositionInstructionError::InvalidMarketAccount))
}

/// Withdraw idle collateral before the position has been delegated/activated
/// inside MagicBlock / PER.
///
/// Important:
/// Once a position is delegated and its live private state exists inside PER,
/// withdrawals should be handled through ER settlement logic, not directly here.
#[derive(Accounts)]
pub struct WithdrawCollateral<'info> {
    /// Trader withdrawing idle collateral.
    #[account(mut)]
    pub trader: Signer<'info>,

    /// Global config.
    #[account(
        seeds = [Config::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    /// Market shell.
    #[account(
        constraint = market.status == crate::state::MarketStatus::Active @ MarketError::MarketNotActive,
        constraint = market.collateral_mint == config.collateral_mint,
        constraint = market.collateral_mint == collateral_mint.key(),
    )]
    pub market: Account<'info, Market>,

    /// Trader position shell.
    #[account(
        mut,
        seeds = [TraderPosition::SEED, market.key().as_ref(), trader.key().as_ref()],
        bump = position.bump,
        constraint = position.market == market.key() @ PositionError::PositionMarketMismatch,
        constraint = position.trader == trader.key() @ PositionError::UnauthorizedTrader,
        constraint = !position.delegated @ PositionError::PositionAlreadyDelegated,
        constraint = !position.claimed @ PositionError::PositionAlreadyClaimed,
        constraint = !position.settled @ PositionError::PositionAlreadySettled,
    )]
    pub position: Account<'info, TraderPosition>,

    /// Protocol collateral mint.
    #[account(
        constraint = collateral_mint.key() == config.collateral_mint,
    )]
    pub collateral_mint: InterfaceAccount<'info, Mint>,

    /// Trader collateral token account.
    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = trader,
        associated_token::token_program = token_program,
    )]
    pub trader_collateral: InterfaceAccount<'info, TokenAccount>,

    /// Market vault.
    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = market,
        associated_token::token_program = token_program,
        constraint = vault.key() == market.vault @ PrivatePositionInstructionError::InvalidVault,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    /// Token program.
    pub token_program: Interface<'info, TokenInterface>,

    /// Associated token program.
    pub associated_token_program: Program<'info, AssociatedToken>,

    /// System program.
    pub system_program: Program<'info, System>,
}

impl<'info> WithdrawCollateral<'info> {
    pub fn withdraw_collateral(&mut self, amount: u64) -> Result<()> {
        let clock = Clock::get()?;

        require!(amount > 0, PositionError::InvalidAmount);

        self.position.add_withdrawal(amount)?;

        let market_id_bytes = self.market.id.to_le_bytes();
        let market_seeds: &[&[u8]] = &[Market::SEED, market_id_bytes.as_ref(), &[self.market.bump]];
        let signer_seeds: &[&[&[u8]]] = &[market_seeds];

        transfer_checked(
            CpiContext::new_with_signer(
                self.token_program.to_account_info(),
                TransferChecked {
                    from: self.vault.to_account_info(),
                    mint: self.collateral_mint.to_account_info(),
                    to: self.trader_collateral.to_account_info(),
                    authority: self.market.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
            self.collateral_mint.decimals,
        )?;

        emit!(CollateralWithdrawn {
            market: self.market.key(),
            trader: self.trader.key(),
            position: self.position.key(),
            amount,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }
}

/// Claim a settled payout from the Solana L1 vault.
///
/// This is the final L1 settlement step after:
/// - private market was resolved inside PER
/// - private position was settled
/// - claimable_amount was written into the public position shell
/// - state was committed back as needed
#[derive(Accounts)]
pub struct ClaimSettledPrivatePosition<'info> {
    /// Trader claiming settled payout.
    #[account(mut)]
    pub trader: Signer<'info>,

    /// Global config.
    #[account(
        seeds = [Config::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    /// Market shell.
    #[account(
        mut,
        constraint = market.collateral_mint == config.collateral_mint,
        constraint = market.collateral_mint == collateral_mint.key(),
    )]
    pub market: Account<'info, Market>,

    /// Trader position shell.
    #[account(
        mut,
        seeds = [TraderPosition::SEED, market.key().as_ref(), trader.key().as_ref()],
        bump = position.bump,
        constraint = position.market == market.key() @ PositionError::PositionMarketMismatch,
        constraint = position.trader == trader.key() @ PositionError::UnauthorizedTrader,
        constraint = position.settled @ PositionError::PositionNotSettled,
        constraint = !position.claimed @ PositionError::PositionAlreadyClaimed,
    )]
    pub position: Account<'info, TraderPosition>,

    /// Protocol collateral mint.
    #[account(
        constraint = collateral_mint.key() == config.collateral_mint,
    )]
    pub collateral_mint: InterfaceAccount<'info, Mint>,

    /// Trader collateral token account.
    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = trader,
        associated_token::token_program = token_program,
    )]
    pub trader_collateral: InterfaceAccount<'info, TokenAccount>,

    /// Market vault.
    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = market,
        associated_token::token_program = token_program,
        constraint = vault.key() == market.vault @ PrivatePositionInstructionError::InvalidVault,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    /// Token program.
    pub token_program: Interface<'info, TokenInterface>,

    /// Associated token program.
    pub associated_token_program: Program<'info, AssociatedToken>,

    /// System program.
    pub system_program: Program<'info, System>,
}

impl<'info> ClaimSettledPrivatePosition<'info> {
    pub fn claim_settled_private_position(&mut self) -> Result<u64> {
        let clock = Clock::get()?;

        self.market.assert_resolved_or_settlement_open()?;
        self.position.assert_settled()?;
        self.position.assert_not_claimed()?;

        let remaining_claimable = self
            .position
            .claimable_amount
            .checked_sub(self.position.claimed_amount)
            .ok_or(PositionError::ArithmeticOverflow)?;

        if remaining_claimable == 0 {
            self.position.claimed = true;

            emit!(SettledPositionClaimed {
                market: self.market.key(),
                trader: self.trader.key(),
                position: self.position.key(),
                amount: 0,
                timestamp: clock.unix_timestamp,
            });

            return Ok(0);
        }

        require!(
            self.vault.amount >= remaining_claimable,
            PrivatePositionInstructionError::InsufficientVaultBalance
        );

        let market_id_bytes = self.market.id.to_le_bytes();
        let market_seeds: &[&[u8]] = &[Market::SEED, market_id_bytes.as_ref(), &[self.market.bump]];
        let signer_seeds: &[&[&[u8]]] = &[market_seeds];

        transfer_checked(
            CpiContext::new_with_signer(
                self.token_program.to_account_info(),
                TransferChecked {
                    from: self.vault.to_account_info(),
                    mint: self.collateral_mint.to_account_info(),
                    to: self.trader_collateral.to_account_info(),
                    authority: self.market.to_account_info(),
                },
                signer_seeds,
            ),
            remaining_claimable,
            self.collateral_mint.decimals,
        )?;

        self.position.claimed_amount = self
            .position
            .claimed_amount
            .checked_add(remaining_claimable)
            .ok_or(PositionError::ArithmeticOverflow)?;

        self.position.claimed = true;

        self.market.total_claimed = self
            .market
            .total_claimed
            .checked_add(remaining_claimable)
            .ok_or(MarketError::ArithmeticOverflow)?;

        emit!(SettledPositionClaimed {
            market: self.market.key(),
            trader: self.trader.key(),
            position: self.position.key(),
            amount: remaining_claimable,
            timestamp: clock.unix_timestamp,
        });

        Ok(remaining_claimable)
    }
}

/// Close a resolved market after all meaningful payouts have been claimed.
///
/// This is intentionally conservative: it can only sweep a tiny residual token
/// balance caused by integer rounding. If real claimable collateral remains in
/// the vault, this instruction fails.
#[derive(Accounts)]
pub struct CloseMarketDust<'info> {
    /// Market creator or protocol admin closing residual dust.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Global config.
    #[account(
        seeds = [Config::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    /// Market shell.
    #[account(
        mut,
        seeds = [Market::SEED, market.id.to_le_bytes().as_ref()],
        bump = market.bump,
        constraint = market.collateral_mint == config.collateral_mint,
        constraint = market.collateral_mint == collateral_mint.key(),
    )]
    pub market: Account<'info, Market>,

    /// Protocol collateral mint.
    #[account(
        constraint = collateral_mint.key() == config.collateral_mint,
    )]
    pub collateral_mint: InterfaceAccount<'info, Mint>,

    /// Destination for the tiny residual dust.
    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = authority,
        associated_token::token_program = token_program,
    )]
    pub dust_destination: InterfaceAccount<'info, TokenAccount>,

    /// Market vault.
    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = market,
        associated_token::token_program = token_program,
        constraint = vault.key() == market.vault @ PrivatePositionInstructionError::InvalidVault,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    /// Token program.
    pub token_program: Interface<'info, TokenInterface>,
}

impl<'info> CloseMarketDust<'info> {
    pub fn close_market_dust(&mut self) -> Result<u64> {
        let clock = Clock::get()?;

        require!(
            self.authority.key() == self.market.creator
                || self.authority.key() == self.config.admin,
            ConfigError::Unauthorized
        );
        self.market.assert_resolved_or_settlement_open()?;
        require!(
            clock.unix_timestamp
                >= (self.market.end_time as i64)
                    .checked_add(DUST_SWEEP_DELAY_SECONDS)
                    .ok_or(MarketError::ArithmeticOverflow)?,
            PrivatePositionInstructionError::DustSweepWindowOpen
        );
        require!(
            self.vault.amount <= MAX_DUST_SWEEP_AMOUNT,
            PrivatePositionInstructionError::DustBalanceTooLarge
        );

        let amount = self.vault.amount;

        if amount > 0 {
            let market_id_bytes = self.market.id.to_le_bytes();
            let market_seeds: &[&[u8]] =
                &[Market::SEED, market_id_bytes.as_ref(), &[self.market.bump]];
            let signer_seeds: &[&[&[u8]]] = &[market_seeds];

            transfer_checked(
                CpiContext::new_with_signer(
                    self.token_program.to_account_info(),
                    TransferChecked {
                        from: self.vault.to_account_info(),
                        mint: self.collateral_mint.to_account_info(),
                        to: self.dust_destination.to_account_info(),
                        authority: self.market.to_account_info(),
                    },
                    signer_seeds,
                ),
                amount,
                self.collateral_mint.decimals,
            )?;
        }

        self.market.mark_closed();

        emit!(MarketDustClosed {
            market: self.market.key(),
            authority: self.authority.key(),
            amount,
            timestamp: clock.unix_timestamp,
        });

        Ok(amount)
    }
}

#[error_code]
pub enum PrivatePositionInstructionError {
    #[msg("Invalid market vault")]
    InvalidVault,

    #[msg("Insufficient token balance")]
    InsufficientTokenBalance,

    #[msg("Insufficient vault balance")]
    InsufficientVaultBalance,

    #[msg("Invalid private position account")]
    InvalidPrivatePositionAccount,

    #[msg("Invalid market account")]
    InvalidMarketAccount,

    #[msg("Invalid collateral mint")]
    InvalidCollateralMint,

    #[msg("Dust sweep window is still open")]
    DustSweepWindowOpen,

    #[msg("Vault balance is larger than the dust threshold")]
    DustBalanceTooLarge,
}
