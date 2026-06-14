use anchor_lang::prelude::*;

/// Public position shell.
///
/// Important:
/// This is NOT the live private trading position.
///
/// For MagicBlock / PER-first architecture:
///
/// Solana L1 Position stores:
/// - market
/// - trader
/// - total collateral deposited
/// - collateral withdrawn before delegation
/// - whether the position has been delegated
/// - final claimable payout after settlement
/// - claimed status
///
/// MagicBlock / PER PrivatePositionState stores:
/// - live idle collateral
/// - live YES virtual shares
/// - live NO virtual shares
/// - private trading status
///
/// PDA:
/// seeds = ["position", market.key(), trader.key()]
#[account]
#[derive(InitSpace)]
pub struct TraderPosition {
    /// Market this position belongs to.
    pub market: Pubkey,

    /// Trader / owner of this position.
    pub trader: Pubkey,

    /// Total collateral deposited into this market by this trader.
    ///
    /// This is public aggregate information.
    /// It does not reveal YES/NO direction.
    pub collateral_deposited: u64,

    /// Collateral withdrawn before the private ER state becomes active.
    ///
    /// Once delegated / initialized in PER, live available collateral should
    /// be tracked in PrivatePositionState, not here.
    pub collateral_withdrawn: u64,

    /// Final claimable payout after ER/PER settlement.
    ///
    /// This gets written after:
    /// resolve_private_market_er
    /// → settle_private_position_er
    /// → commit/settlement sync
    pub claimable_amount: u64,

    /// Amount already claimed from the market vault.
    pub claimed_amount: u64,

    /// Whether this position shell has been delegated / activated for PER use.
    pub delegated: bool,

    /// Whether final payout has been settled for this position.
    pub settled: bool,

    /// Whether the user has fully claimed the settled payout.
    pub claimed: bool,

    /// PDA bump.
    pub bump: u8,
}

impl TraderPosition {
    pub const SEED: &'static [u8] = b"position";

    pub fn assert_trader(&self, signer: &Pubkey) -> Result<()> {
        require_keys_eq!(*signer, self.trader, PositionError::UnauthorizedTrader);
        Ok(())
    }

    pub fn assert_market(&self, market: &Pubkey) -> Result<()> {
        require_keys_eq!(*market, self.market, PositionError::PositionMarketMismatch);
        Ok(())
    }

    pub fn assert_not_claimed(&self) -> Result<()> {
        require!(!self.claimed, PositionError::PositionAlreadyClaimed);
        Ok(())
    }

    pub fn assert_not_settled(&self) -> Result<()> {
        require!(!self.settled, PositionError::PositionAlreadySettled);
        Ok(())
    }

    pub fn assert_settled(&self) -> Result<()> {
        require!(self.settled, PositionError::PositionNotSettled);
        Ok(())
    }

    pub fn assert_not_delegated(&self) -> Result<()> {
        require!(!self.delegated, PositionError::PositionAlreadyDelegated);
        Ok(())
    }

    pub fn assert_delegated(&self) -> Result<()> {
        require!(self.delegated, PositionError::PositionNotDelegated);
        Ok(())
    }

    /// Collateral still idle on the L1 shell before PER activation.
    ///
    /// Once PER state is initialized, live collateral accounting should move
    /// to PrivatePositionState.
    pub fn l1_idle_collateral(&self) -> Result<u64> {
        self.collateral_deposited
            .checked_sub(self.collateral_withdrawn)
            .ok_or(PositionError::ArithmeticOverflow.into())
    }

    pub fn add_deposit(&mut self, amount: u64) -> Result<()> {
        require!(amount > 0, PositionError::InvalidAmount);

        self.collateral_deposited = self
            .collateral_deposited
            .checked_add(amount)
            .ok_or(PositionError::ArithmeticOverflow)?;

        Ok(())
    }

    pub fn add_withdrawal(&mut self, amount: u64) -> Result<()> {
        require!(amount > 0, PositionError::InvalidAmount);

        let idle = self.l1_idle_collateral()?;
        require!(idle >= amount, PositionError::InsufficientCollateral);

        self.collateral_withdrawn = self
            .collateral_withdrawn
            .checked_add(amount)
            .ok_or(PositionError::ArithmeticOverflow)?;

        Ok(())
    }

    pub fn mark_delegated(&mut self) {
        self.delegated = true;
    }

    pub fn mark_undelegated(&mut self) {
        self.delegated = false;
    }

    pub fn settle(&mut self, claimable_amount: u64) -> Result<()> {
        self.assert_not_claimed()?;

        self.claimable_amount = claimable_amount;
        self.settled = true;

        Ok(())
    }

    pub fn claim(&mut self, amount: u64) -> Result<()> {
        require!(amount > 0, PositionError::InvalidAmount);
        self.assert_settled()?;
        self.assert_not_claimed()?;

        require!(
            amount <= self.claimable_amount,
            PositionError::ClaimAmountTooHigh
        );

        self.claimed_amount = self
            .claimed_amount
            .checked_add(amount)
            .ok_or(PositionError::ArithmeticOverflow)?;

        if self.claimed_amount >= self.claimable_amount {
            self.claimed = true;
        }

        Ok(())
    }
}

#[error_code]
pub enum PositionError {
    #[msg("Unauthorized trader")]
    UnauthorizedTrader,

    #[msg("Position does not belong to this market")]
    PositionMarketMismatch,

    #[msg("Position already claimed")]
    PositionAlreadyClaimed,

    #[msg("Position is already settled")]
    PositionAlreadySettled,

    #[msg("Position is not settled")]
    PositionNotSettled,

    #[msg("Position already delegated")]
    PositionAlreadyDelegated,

    #[msg("Position is not delegated")]
    PositionNotDelegated,

    #[msg("Invalid amount")]
    InvalidAmount,

    #[msg("Insufficient collateral")]
    InsufficientCollateral,

    #[msg("Claim amount is greater than claimable amount")]
    ClaimAmountTooHigh,

    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
}
