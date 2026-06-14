use anchor_lang::prelude::*;

pub const PRIVATE_MARKET_STATE_DISCRIMINATOR: [u8; 8] = *b"PMSTATE1";
pub const PRIVATE_POSITION_STATE_DISCRIMINATOR: [u8; 8] = *b"PPSTATE1";

/// Private market lifecycle status.
///
/// This is stored as `u8` inside `PrivateMarketState` because the state is
/// serialized manually into MagicBlock / PER ephemeral accounts.
#[repr(u8)]
pub enum PrivateMarketStatus {
    Active = 1,
    Ended = 2,
    Resolved = 3,
    SettlementOpen = 4,
    Closed = 5,
    Cancelled = 6,
}

/// Private market outcome.
///
/// This is also stored as `u8` inside `PrivateMarketState`.
#[repr(u8)]
pub enum PrivateOutcome {
    Undetermined = 0,
    Yes = 1,
    No = 2,
    Invalid = 3,
}

/// ER/PER-only live market state.
///
/// Important:
/// This is the actual live trading state for the MagicBlock / PER market.
///
/// It should live inside an ephemeral account created with `#[eph]`.
/// The public `Market` account on Solana L1 is only a shell.
///
/// Stores:
/// - live reserves
/// - live YES virtual supply
/// - live NO virtual supply
/// - private market status
/// - private outcome
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub struct PrivateMarketState {
    /// Public market shell this private state belongs to.
    pub market: Pubkey,

    /// Collateral mint.
    pub collateral_mint: Pubkey,

    /// Unix timestamp when trading ends.
    pub end_time: u64,

    /// Unix timestamp when the market was created.
    pub created_at: u64,

    /// Live collateral reserves tracked inside PER.
    pub reserves: u64,

    /// Live virtual YES supply.
    pub yes_supply: u64,

    /// Live virtual NO supply.
    pub no_supply: u64,

    /// Private market lifecycle status.
    pub status: u8,

    /// Private market outcome.
    pub outcome: u8,

    /// PDA / ephemeral bump.
    pub bump: u8,
}

impl PrivateMarketState {
    pub const SEED: &'static [u8] = b"private_market_state";

    /// Manual serialized size without Anchor discriminator.
    ///
    /// Pubkey + Pubkey + u64 + u64 + u64 + u64 + u64 + u8 + u8 + u8
    pub const LEN: usize = 32 + 32 + 8 + 8 + 8 + 8 + 8 + 1 + 1 + 1;

    pub fn new(
        market: Pubkey,
        collateral_mint: Pubkey,
        end_time: u64,
        created_at: u64,
        reserves: u64,
        yes_supply: u64,
        no_supply: u64,
        bump: u8,
    ) -> Self {
        Self {
            market,
            collateral_mint,
            end_time,
            created_at,
            reserves,
            yes_supply,
            no_supply,
            status: PrivateMarketStatus::Active as u8,
            outcome: PrivateOutcome::Undetermined as u8,
            bump,
        }
    }

    pub fn assert_active(&self) -> Result<()> {
        require!(
            self.status == PrivateMarketStatus::Active as u8,
            PrivateStateError::PrivateMarketNotActive
        );
        Ok(())
    }

    pub fn assert_resolved(&self) -> Result<()> {
        require!(
            self.status == PrivateMarketStatus::Resolved as u8
                || self.status == PrivateMarketStatus::SettlementOpen as u8
                || self.status == PrivateMarketStatus::Closed as u8,
            PrivateStateError::PrivateMarketNotResolved
        );
        Ok(())
    }

    pub fn assert_not_cancelled(&self) -> Result<()> {
        require!(
            self.status != PrivateMarketStatus::Cancelled as u8,
            PrivateStateError::PrivateMarketCancelled
        );
        Ok(())
    }

    pub fn is_after_end_time(&self, now: i64) -> bool {
        now >= self.end_time as i64
    }

    pub fn mark_ended(&mut self) {
        self.status = PrivateMarketStatus::Ended as u8;
    }

    pub fn mark_resolved_yes(&mut self) {
        self.status = PrivateMarketStatus::Resolved as u8;
        self.outcome = PrivateOutcome::Yes as u8;
    }

    pub fn mark_resolved_no(&mut self) {
        self.status = PrivateMarketStatus::Resolved as u8;
        self.outcome = PrivateOutcome::No as u8;
    }

    pub fn mark_invalid(&mut self) {
        self.status = PrivateMarketStatus::Resolved as u8;
        self.outcome = PrivateOutcome::Invalid as u8;
    }

    pub fn mark_settlement_open(&mut self) {
        self.status = PrivateMarketStatus::SettlementOpen as u8;
    }

    pub fn mark_closed(&mut self) {
        self.status = PrivateMarketStatus::Closed as u8;
    }

    pub fn winning_supply(&self) -> Result<u64> {
        match self.outcome {
            x if x == PrivateOutcome::Yes as u8 => Ok(self.yes_supply),
            x if x == PrivateOutcome::No as u8 => Ok(self.no_supply),
            x if x == PrivateOutcome::Invalid as u8 => Ok(0),
            _ => err!(PrivateStateError::PrivateMarketNotResolved),
        }
    }
}

/// ER/PER-only live trader position.
///
/// Important:
/// This is where the private trading exposure lives.
///
/// The public `TraderPosition` shell on Solana L1 should NOT reveal:
/// - YES shares
/// - NO shares
/// - exact live collateral available
///
/// This private state stores:
/// - idle collateral
/// - virtual YES shares
/// - virtual NO shares
/// - claim/settlement flag
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub struct PrivatePositionState {
    /// Public market shell.
    pub market: Pubkey,

    /// Trader / owner.
    pub trader: Pubkey,

    /// Total collateral deposited by trader for this market.
    pub collateral_deposited: u64,

    /// Idle collateral still available for trading or settlement.
    pub collateral_available: u64,

    /// Private virtual YES shares.
    pub yes_shares: u64,

    /// Private virtual NO shares.
    pub no_shares: u64,

    /// 0 = not settled/claimed, 1 = settled/claimed.
    ///
    /// Stored as u8 for manual serialization stability.
    pub claimed: u8,

    /// PDA / ephemeral bump.
    pub bump: u8,
}

impl PrivatePositionState {
    pub const SEED: &'static [u8] = b"private_position_state";

    /// Manual serialized size without Anchor discriminator.
    ///
    /// Pubkey + Pubkey + u64 + u64 + u64 + u64 + u8 + u8
    pub const LEN: usize = 32 + 32 + 8 + 8 + 8 + 8 + 1 + 1;

    pub fn new(
        market: Pubkey,
        trader: Pubkey,
        collateral_deposited: u64,
        collateral_available: u64,
        yes_shares: u64,
        no_shares: u64,
        bump: u8,
    ) -> Self {
        Self {
            market,
            trader,
            collateral_deposited,
            collateral_available,
            yes_shares,
            no_shares,
            claimed: 0,
            bump,
        }
    }

    pub fn assert_trader(&self, signer: &Pubkey) -> Result<()> {
        require_keys_eq!(
            *signer,
            self.trader,
            PrivateStateError::PrivatePositionTraderMismatch
        );
        Ok(())
    }

    pub fn assert_market(&self, market: &Pubkey) -> Result<()> {
        require_keys_eq!(
            *market,
            self.market,
            PrivateStateError::PrivatePositionMarketMismatch
        );
        Ok(())
    }

    pub fn assert_not_claimed(&self) -> Result<()> {
        require!(
            self.claimed == 0,
            PrivateStateError::PrivatePositionAlreadyClaimed
        );
        Ok(())
    }

    pub fn add_collateral(&mut self, amount: u64) -> Result<()> {
        require!(amount > 0, PrivateStateError::InvalidAmount);

        self.collateral_deposited = self
            .collateral_deposited
            .checked_add(amount)
            .ok_or(PrivateStateError::ArithmeticOverflow)?;

        self.collateral_available = self
            .collateral_available
            .checked_add(amount)
            .ok_or(PrivateStateError::ArithmeticOverflow)?;

        Ok(())
    }

    pub fn spend_collateral(&mut self, amount: u64) -> Result<()> {
        require!(amount > 0, PrivateStateError::InvalidAmount);
        require!(
            self.collateral_available >= amount,
            PrivateStateError::InsufficientPrivateCollateral
        );

        self.collateral_available = self
            .collateral_available
            .checked_sub(amount)
            .ok_or(PrivateStateError::ArithmeticOverflow)?;

        Ok(())
    }

    pub fn release_collateral(&mut self, amount: u64) -> Result<()> {
        require!(amount > 0, PrivateStateError::InvalidAmount);

        self.collateral_available = self
            .collateral_available
            .checked_add(amount)
            .ok_or(PrivateStateError::ArithmeticOverflow)?;

        Ok(())
    }

    pub fn add_yes_shares(&mut self, amount: u64) -> Result<()> {
        require!(amount > 0, PrivateStateError::InvalidAmount);

        self.yes_shares = self
            .yes_shares
            .checked_add(amount)
            .ok_or(PrivateStateError::ArithmeticOverflow)?;

        Ok(())
    }

    pub fn add_no_shares(&mut self, amount: u64) -> Result<()> {
        require!(amount > 0, PrivateStateError::InvalidAmount);

        self.no_shares = self
            .no_shares
            .checked_add(amount)
            .ok_or(PrivateStateError::ArithmeticOverflow)?;

        Ok(())
    }

    pub fn remove_yes_shares(&mut self, amount: u64) -> Result<()> {
        require!(amount > 0, PrivateStateError::InvalidAmount);
        require!(
            self.yes_shares >= amount,
            PrivateStateError::InsufficientPrivateShares
        );

        self.yes_shares = self
            .yes_shares
            .checked_sub(amount)
            .ok_or(PrivateStateError::ArithmeticOverflow)?;

        Ok(())
    }

    pub fn remove_no_shares(&mut self, amount: u64) -> Result<()> {
        require!(amount > 0, PrivateStateError::InvalidAmount);
        require!(
            self.no_shares >= amount,
            PrivateStateError::InsufficientPrivateShares
        );

        self.no_shares = self
            .no_shares
            .checked_sub(amount)
            .ok_or(PrivateStateError::ArithmeticOverflow)?;

        Ok(())
    }

    pub fn winning_shares(&self, outcome: u8) -> Result<u64> {
        match outcome {
            x if x == PrivateOutcome::Yes as u8 => Ok(self.yes_shares),
            x if x == PrivateOutcome::No as u8 => Ok(self.no_shares),
            x if x == PrivateOutcome::Invalid as u8 => Ok(0),
            _ => err!(PrivateStateError::PrivateMarketNotResolved),
        }
    }

    pub fn mark_claimed(&mut self) {
        self.claimed = 1;
    }
}

#[error_code]
pub enum PrivateStateError {
    #[msg("Private market is not active")]
    PrivateMarketNotActive,

    #[msg("Private market has not ended yet")]
    PrivateMarketNotEnded,

    #[msg("Private market is not resolved")]
    PrivateMarketNotResolved,

    #[msg("Private market has been cancelled")]
    PrivateMarketCancelled,

    #[msg("Private market state is not initialized")]
    PrivateMarketStateNotInitialized,

    #[msg("Private position state is not initialized")]
    PrivatePositionStateNotInitialized,

    #[msg("Private position belongs to a different trader")]
    PrivatePositionTraderMismatch,

    #[msg("Private position belongs to a different market")]
    PrivatePositionMarketMismatch,

    #[msg("Private position already claimed")]
    PrivatePositionAlreadyClaimed,

    #[msg("Invalid private market status")]
    InvalidPrivateMarketStatus,

    #[msg("Invalid private market outcome")]
    InvalidPrivateOutcome,

    #[msg("Invalid amount")]
    InvalidAmount,

    #[msg("Insufficient private collateral")]
    InsufficientPrivateCollateral,

    #[msg("Insufficient private shares")]
    InsufficientPrivateShares,

    #[msg("Winning supply is zero")]
    WinningSupplyIsZero,

    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
}
