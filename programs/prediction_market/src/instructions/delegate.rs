use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::access_control::{
    instructions::CreatePermissionCpiBuilder,
    structs::{
        Member, MembersArgs, Permission, ACCOUNT_SIGNATURES_FLAG, AUTHORITY_FLAG,
        TX_BALANCES_FLAG, TX_LOGS_FLAG, TX_MESSAGE_FLAG,
    },
};
use ephemeral_rollups_sdk::anchor::{commit, delegate};

use crate::state::{
    Config, ConfigError, Market, MarketStatus, PositionError, PrivatePositionState,
    PrivateStateError, PRIVATE_POSITION_STATE_DISCRIMINATOR, TraderPosition,
};

/// Event emitted when a market shell is delegated into MagicBlock / PER.
#[event]
pub struct MarketDelegated {
    pub authority: Pubkey,
    pub market: Pubkey,
    pub market_id: u64,
    pub tee_validator: Pubkey,
    pub timestamp: i64,
}

/// Event emitted when a market shell is committed and undelegated.
#[event]
pub struct MarketCommittedAndUndelegated {
    pub authority: Pubkey,
    pub market: Pubkey,
    pub market_id: u64,
    pub status: MarketStatus,
    pub timestamp: i64,
}

/// Event emitted when a position shell is delegated into MagicBlock / PER.
#[event]
pub struct PositionDelegated {
    pub authority: Pubkey,
    pub market: Pubkey,
    pub trader: Pubkey,
    pub position: Pubkey,
    pub tee_validator: Pubkey,
    pub timestamp: i64,
}

/// Event emitted when a private position state account is delegated.
#[event]
pub struct PrivatePositionDelegated {
    pub authority: Pubkey,
    pub market: Pubkey,
    pub trader: Pubkey,
    pub private_position: Pubkey,
    pub tee_validator: Pubkey,
    pub timestamp: i64,
}

/// Event emitted when a position shell is committed and undelegated.
#[event]
pub struct PositionCommittedAndUndelegated {
    pub authority: Pubkey,
    pub market: Pubkey,
    pub trader: Pubkey,
    pub position: Pubkey,
    pub settled: bool,
    pub claimable_amount: u64,
    pub timestamp: i64,
}

#[derive(Accounts)]
pub struct CreateMarketPermission<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [Config::SEED],
        bump = config.bump,
        constraint = !config.paused @ ConfigError::ProtocolPaused,
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [Market::SEED, market.id.to_le_bytes().as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    /// CHECK: Permission PDA derived from the market account by the permission program.
    #[account(mut, address = Permission::find_pda(&market.key()).0)]
    pub permission: UncheckedAccount<'info>,

    /// CHECK: MagicBlock permission program CPI target.
    #[account(mut)]
    pub permission_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> CreateMarketPermission<'info> {
    pub fn create_market_permission(&self) -> Result<()> {
        let authority = self.authority.key();
        require!(
            authority == self.market.creator || authority == self.config.admin,
            DelegateError::UnauthorizedDelegation
        );

        let authority_member = Member {
            flags: AUTHORITY_FLAG
                | TX_LOGS_FLAG
                | TX_BALANCES_FLAG
                | TX_MESSAGE_FLAG
                | ACCOUNT_SIGNATURES_FLAG,
            pubkey: authority,
        };

        let creator_member = Member {
            flags: ACCOUNT_SIGNATURES_FLAG,
            pubkey: self.market.creator,
        };

        let bump_seed = [self.market.bump];
        let market_id_bytes = self.market.id.to_le_bytes();
        let seeds: &[&[u8]] = &[Market::SEED, market_id_bytes.as_ref(), &bump_seed];
        let signer_seeds = &[seeds];

        CreatePermissionCpiBuilder::new(&self.permission_program)
            .permissioned_account(&self.market.to_account_info())
            .permission(&self.permission.to_account_info())
            .payer(&self.authority.to_account_info())
            .system_program(&self.system_program.to_account_info())
            .args(MembersArgs {
                members: Some(vec![authority_member, creator_member]),
            })
            .invoke_signed(signer_seeds)?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreatePositionPermission<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [Config::SEED],
        bump = config.bump,
        constraint = !config.paused @ ConfigError::ProtocolPaused,
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [TraderPosition::SEED, position.market.as_ref(), position.trader.as_ref()],
        bump = position.bump,
    )]
    pub position: Account<'info, TraderPosition>,

    /// CHECK: Permission PDA derived from the position account by the permission program.
    #[account(mut, address = Permission::find_pda(&position.key()).0)]
    pub permission: UncheckedAccount<'info>,

    /// CHECK: MagicBlock permission program CPI target.
    #[account(mut)]
    pub permission_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreatePrivatePositionPermission<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [Config::SEED],
        bump = config.bump,
        constraint = !config.paused @ ConfigError::ProtocolPaused,
    )]
    pub config: Account<'info, Config>,

    /// CHECK: Private position state is serialized manually.
    #[account(mut)]
    pub private_position: AccountInfo<'info>,

    /// CHECK: Permission PDA derived from the private position account.
    #[account(mut, address = Permission::find_pda(&private_position.key()).0)]
    pub permission: UncheckedAccount<'info>,

    /// CHECK: MagicBlock permission program CPI target.
    #[account(mut)]
    pub permission_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> CreatePrivatePositionPermission<'info> {
    pub fn create_private_position_permission(&self) -> Result<()> {
        let private_position = load_private_position_from_account_info(&self.private_position)?;
        let authority = self.authority.key();

        require!(
            authority == private_position.trader || authority == self.config.admin,
            DelegateError::UnauthorizedDelegation
        );

        let authority_member = Member {
            flags: AUTHORITY_FLAG
                | TX_LOGS_FLAG
                | TX_BALANCES_FLAG
                | TX_MESSAGE_FLAG
                | ACCOUNT_SIGNATURES_FLAG,
            pubkey: authority,
        };

        let trader_member = Member {
            flags: ACCOUNT_SIGNATURES_FLAG,
            pubkey: private_position.trader,
        };

        let bump_seed = [private_position.bump];
        let seeds: &[&[u8]] = &[
            PrivatePositionState::SEED,
            private_position.market.as_ref(),
            private_position.trader.as_ref(),
            &bump_seed,
        ];
        let signer_seeds = &[seeds];

        CreatePermissionCpiBuilder::new(&self.permission_program)
            .permissioned_account(&self.private_position.to_account_info())
            .permission(&self.permission.to_account_info())
            .payer(&self.authority.to_account_info())
            .system_program(&self.system_program.to_account_info())
            .args(MembersArgs {
                members: Some(vec![authority_member, trader_member]),
            })
            .invoke_signed(signer_seeds)?;

        Ok(())
    }
}

impl<'info> CreatePositionPermission<'info> {
    pub fn create_position_permission(&self) -> Result<()> {
        let authority = self.authority.key();
        require!(
            authority == self.position.trader || authority == self.config.admin,
            DelegateError::UnauthorizedDelegation
        );

        let authority_member = Member {
            flags: AUTHORITY_FLAG
                | TX_LOGS_FLAG
                | TX_BALANCES_FLAG
                | TX_MESSAGE_FLAG
                | ACCOUNT_SIGNATURES_FLAG,
            pubkey: authority,
        };

        let trader_member = Member {
            flags: ACCOUNT_SIGNATURES_FLAG,
            pubkey: self.position.trader,
        };

        let bump_seed = [self.position.bump];
        let seeds: &[&[u8]] = &[
            TraderPosition::SEED,
            self.position.market.as_ref(),
            self.position.trader.as_ref(),
            &bump_seed,
        ];
        let signer_seeds = &[seeds];

        CreatePermissionCpiBuilder::new(&self.permission_program)
            .permissioned_account(&self.position.to_account_info())
            .permission(&self.permission.to_account_info())
            .payer(&self.authority.to_account_info())
            .system_program(&self.system_program.to_account_info())
            .args(MembersArgs {
                members: Some(vec![authority_member, trader_member]),
            })
            .invoke_signed(signer_seeds)?;

        Ok(())
    }
}

/// Delegate a market shell account into MagicBlock / PER.
///
/// Permission model:
/// - market creator can delegate their own market
/// - protocol admin can delegate any market as keeper/admin
///
/// Important:
/// The account marked with `#[account(mut, del)]` is delegated by the
/// MagicBlock SDK macro-generated method.
///
/// The actual live private trading state is NOT this account.
/// This is the public market shell that sponsors/anchors private state.
#[delegate]
#[derive(Accounts)]
pub struct DelegateMarket<'info> {
    /// Creator/admin delegating the market.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Global config.
    #[account(
        seeds = [Config::SEED],
        bump = config.bump,
        constraint = !config.paused @ ConfigError::ProtocolPaused,
    )]
    pub config: Account<'info, Config>,

    /// Market shell to delegate.
    ///
    /// CHECK:
    /// We deserialize and validate this manually because MagicBlock's
    /// `#[account(mut, del)]` delegation marker works on AccountInfo.
    #[account(mut, del)]
    pub market: AccountInfo<'info>,
}

impl<'info> DelegateMarket<'info> {
    pub fn validate_delegate_market(&self, expected_market_id: u64) -> Result<Market> {
        let market = load_market_from_account_info(&self.market)?;

        require!(
            market.id == expected_market_id,
            DelegateError::MarketIdMismatch
        );

        require!(
            market.status == MarketStatus::Active
                || market.status == MarketStatus::Ended
                || market.status == MarketStatus::Resolved
                || market.status == MarketStatus::SettlementOpen,
            DelegateError::MarketCannotBeDelegated
        );

        let authority = self.authority.key();

        require!(
            authority == market.creator || authority == self.config.admin,
            DelegateError::UnauthorizedDelegation
        );

        Ok(market)
    }

    pub fn emit_delegated(&self, market: &Market) -> Result<()> {
        let clock = Clock::get()?;

        emit!(MarketDelegated {
            authority: self.authority.key(),
            market: self.market.key(),
            market_id: market.id,
            tee_validator: self.config.tee_validator,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }
}

/// Commit and undelegate a market shell from MagicBlock / PER back to Solana L1.
///
/// Permission model:
/// - market creator
/// - protocol admin
/// - oracle
///
/// This is useful after resolution / settlement when the public shell should
/// reflect final lifecycle state on base Solana.
#[commit]
#[derive(Accounts)]
pub struct UndelegateMarket<'info> {
    /// Creator/admin/oracle committing the market back.
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
    )]
    pub market: Account<'info, Market>,
}

impl<'info> UndelegateMarket<'info> {
    pub fn validate_undelegate_market(&self) -> Result<()> {
        let authority = self.authority.key();

        require!(
            authority == self.market.creator
                || authority == self.config.admin
                || authority == self.config.oracle,
            DelegateError::UnauthorizedUndelegation
        );

        self.market.assert_not_cancelled()?;

        Ok(())
    }

    pub fn emit_committed_and_undelegated(&self) -> Result<()> {
        let clock = Clock::get()?;

        emit!(MarketCommittedAndUndelegated {
            authority: self.authority.key(),
            market: self.market.key(),
            market_id: self.market.id,
            status: self.market.status,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }
}

/// Delegate a trader position shell into MagicBlock / PER.
///
/// Permission model:
/// - trader can delegate their own position
/// - protocol admin can delegate as keeper/admin
///
/// The real private position state is created separately in:
/// initialize_private_position_state
#[delegate]
#[derive(Accounts)]
pub struct DelegatePosition<'info> {
    /// Trader/admin delegating the position.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Global config.
    #[account(
        seeds = [Config::SEED],
        bump = config.bump,
        constraint = !config.paused @ ConfigError::ProtocolPaused,
    )]
    pub config: Account<'info, Config>,

    /// Trader position shell to delegate.
    ///
    /// CHECK:
    /// We deserialize and validate this manually because MagicBlock's
    /// `#[account(mut, del)]` marker works on AccountInfo.
    #[account(mut, del)]
    pub position: AccountInfo<'info>,
}

impl<'info> DelegatePosition<'info> {
    pub fn validate_delegate_position(
        &self,
        expected_market: Pubkey,
        expected_trader: Pubkey,
    ) -> Result<TraderPosition> {
        let position = load_position_from_account_info(&self.position)?;

        require_keys_eq!(
            position.market,
            expected_market,
            PositionError::PositionMarketMismatch
        );

        require_keys_eq!(
            position.trader,
            expected_trader,
            PositionError::UnauthorizedTrader
        );

        require!(!position.claimed, PositionError::PositionAlreadyClaimed);
        require!(!position.settled, PositionError::PositionAlreadySettled);
        require!(!position.delegated, PositionError::PositionAlreadyDelegated);

        let authority = self.authority.key();

        require!(
            authority == position.trader || authority == self.config.admin,
            DelegateError::UnauthorizedDelegation
        );

        Ok(position)
    }

    pub fn emit_delegated(&self, position: &TraderPosition) -> Result<()> {
        let clock = Clock::get()?;

        emit!(PositionDelegated {
            authority: self.authority.key(),
            market: position.market,
            trader: position.trader,
            position: self.position.key(),
            tee_validator: self.config.tee_validator,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }
}

/// Delegate a private position state account into MagicBlock / PER.
#[delegate]
#[derive(Accounts)]
pub struct DelegatePrivatePosition<'info> {
    /// Trader/admin delegating the private position.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Global config.
    #[account(
        seeds = [Config::SEED],
        bump = config.bump,
        constraint = !config.paused @ ConfigError::ProtocolPaused,
    )]
    pub config: Account<'info, Config>,

    /// Private position state to delegate.
    ///
    /// CHECK:
    /// Serialized manually and validated before delegation.
    #[account(mut, del)]
    pub private_position: AccountInfo<'info>,
}

impl<'info> DelegatePrivatePosition<'info> {
    pub fn validate_delegate_private_position(
        &self,
        expected_market: Pubkey,
        expected_trader: Pubkey,
    ) -> Result<PrivatePositionState> {
        let private_position = load_private_position_from_account_info(&self.private_position)?;

        require_keys_eq!(
            private_position.market,
            expected_market,
            PrivateStateError::PrivatePositionMarketMismatch
        );

        require_keys_eq!(
            private_position.trader,
            expected_trader,
            PrivateStateError::PrivatePositionTraderMismatch
        );

        require!(
            private_position.claimed == 0,
            PrivateStateError::PrivatePositionAlreadyClaimed
        );

        let authority = self.authority.key();

        require!(
            authority == private_position.trader || authority == self.config.admin,
            DelegateError::UnauthorizedDelegation
        );

        Ok(private_position)
    }

    pub fn emit_delegated(&self, private_position: &PrivatePositionState) -> Result<()> {
        let clock = Clock::get()?;

        emit!(PrivatePositionDelegated {
            authority: self.authority.key(),
            market: private_position.market,
            trader: private_position.trader,
            private_position: self.private_position.key(),
            tee_validator: self.config.tee_validator,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }
}

/// Commit and undelegate a trader position shell back to Solana L1.
///
/// Permission model:
/// - trader
/// - protocol admin
///
/// Usually called after:
/// - private position has been settled
/// - claimable_amount has been written/synced to the public shell
#[commit]
#[derive(Accounts)]
pub struct UndelegatePosition<'info> {
    /// Trader/admin committing the position back.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Global config.
    #[account(
        seeds = [Config::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    /// Trader position shell.
    #[account(
        mut,
        seeds = [TraderPosition::SEED, position.market.as_ref(), position.trader.as_ref()],
        bump = position.bump,
    )]
    pub position: Account<'info, TraderPosition>,
}

impl<'info> UndelegatePosition<'info> {
    pub fn validate_undelegate_position(&self) -> Result<()> {
        let authority = self.authority.key();

        require!(
            authority == self.position.trader || authority == self.config.admin,
            DelegateError::UnauthorizedUndelegation
        );

        Ok(())
    }

    pub fn emit_committed_and_undelegated(&self) -> Result<()> {
        let clock = Clock::get()?;

        emit!(PositionCommittedAndUndelegated {
            authority: self.authority.key(),
            market: self.position.market,
            trader: self.position.trader,
            position: self.position.key(),
            settled: self.position.settled,
            claimable_amount: self.position.claimable_amount,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }
}

/// Load a Market from AccountInfo manually.
fn load_market_from_account_info(account: &AccountInfo) -> Result<Market> {
    require_keys_eq!(*account.owner, crate::ID, DelegateError::InvalidAccountOwner);
    let data = account.try_borrow_data()?;
    let mut slice: &[u8] = &data;
    Market::try_deserialize(&mut slice).map_err(|_| error!(DelegateError::InvalidMarketAccount))
}

fn load_market_from_account_info_allow_delegated(account: &AccountInfo) -> Result<Market> {
    let data = account.try_borrow_data()?;
    let mut slice: &[u8] = &data;
    Market::try_deserialize(&mut slice).map_err(|_| error!(DelegateError::InvalidMarketAccount))
}

/// Load a TraderPosition from AccountInfo manually.
fn load_position_from_account_info(account: &AccountInfo) -> Result<TraderPosition> {
    require_keys_eq!(*account.owner, crate::ID, DelegateError::InvalidAccountOwner);
    let data = account.try_borrow_data()?;
    let mut slice: &[u8] = &data;
    TraderPosition::try_deserialize(&mut slice).map_err(|_| error!(DelegateError::InvalidPositionAccount))
}

fn load_position_from_account_info_allow_delegated(account: &AccountInfo) -> Result<TraderPosition> {
    let data = account.try_borrow_data()?;
    let mut slice: &[u8] = &data;
    TraderPosition::try_deserialize(&mut slice).map_err(|_| error!(DelegateError::InvalidPositionAccount))
}

fn load_private_position_from_account_info(account: &AccountInfo) -> Result<PrivatePositionState> {
    require_keys_eq!(*account.owner, crate::ID, DelegateError::InvalidAccountOwner);

    let data = account.try_borrow_data()?;

    require!(
        data.len() >= 8 + PrivatePositionState::LEN,
        DelegateError::InvalidPrivatePositionAccount
    );

    require!(
        data[0..8] == PRIVATE_POSITION_STATE_DISCRIMINATOR,
        DelegateError::InvalidPrivatePositionAccount
    );

    let mut slice: &[u8] = &data[8..8 + PrivatePositionState::LEN];

    PrivatePositionState::deserialize(&mut slice)
        .map_err(|_| error!(DelegateError::InvalidPrivatePositionAccount))
}

#[error_code]
pub enum DelegateError {
    #[msg("Unauthorized delegation")]
    UnauthorizedDelegation,

    #[msg("Unauthorized undelegation")]
    UnauthorizedUndelegation,

    #[msg("Invalid account owner")]
    InvalidAccountOwner,

    #[msg("Invalid market account")]
    InvalidMarketAccount,

    #[msg("Invalid position account")]
    InvalidPositionAccount,

    #[msg("Invalid private position account")]
    InvalidPrivatePositionAccount,

    #[msg("Market id mismatch")]
    MarketIdMismatch,

    #[msg("Market cannot be delegated in current status")]
    MarketCannotBeDelegated,

    #[msg("Invalid MagicBlock / PER validator")]
    InvalidTeeValidator,

    #[msg("Market error")]
    MarketError,

    #[msg("Position error")]
    PositionError,
}
