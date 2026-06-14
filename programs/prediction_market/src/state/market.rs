use anchor_lang::prelude::*;

/// Public market shell.
///
/// During active delegated trading, this shell is the live ER market aggregate.
/// It is only committed back to Solana L1 at resolution / settlement time.
///
/// PDA:
/// seeds = ["market", market_id.to_le_bytes()]
#[account]
#[derive(InitSpace)]
pub struct Market {
    /// Incrementing market id.
    pub id: u64,

    /// Permissionless market creator.
    pub creator: Pubkey,

    /// Prediction question.
    ///
    /// Example:
    /// "Will BTC close above $100k on 2026-12-31?"
    #[max_len(256)]
    pub question: String,

    /// Unix timestamp when trading ends.
    pub end_time: u64,

    /// Unix timestamp when market was created.
    pub created_at: u64,

    /// Collateral mint used by this market.
    pub collateral_mint: Pubkey,

    /// Collateral vault token account.
    ///
    /// The vault should be an ATA:
    /// mint = collateral_mint
    /// authority = market PDA
    pub vault: Pubkey,

    /// Total collateral deposited into this market's vault.
    pub total_deposited: u64,

    /// Live collateral reserves while the market runs inside the ER.
    pub live_reserves: u64,

    /// Live aggregate YES exposure while trading stays inside the ER.
    pub live_yes_supply: u64,

    /// Live aggregate NO exposure while trading stays inside the ER.
    pub live_no_supply: u64,

    /// Final reserves after ER/PER resolution.
    ///
    /// This is filled/updated when the private state is settled/committed.
    pub final_reserves: u64,

    /// Sum of all settled claimable amounts.
    pub total_claimable_settled: u64,

    /// Sum of collateral already claimed by users.
    pub total_claimed: u64,

    /// Public lifecycle status.
    pub status: MarketStatus,

    /// Winning outcome.
    ///
    /// Only meaningful after the market is resolved.
    pub outcome: Outcome,

    /// PDA bump.
    pub bump: u8,
}

impl Market {
    pub const SEED: &'static [u8] = b"market";

    pub const MAX_QUESTION_LEN: usize = 256;

    pub fn assert_active(&self) -> Result<()> {
        require!(
            self.status == MarketStatus::Active,
            MarketError::MarketNotActive
        );
        Ok(())
    }

    pub fn assert_not_cancelled(&self) -> Result<()> {
        require!(
            self.status != MarketStatus::Cancelled,
            MarketError::MarketCancelled
        );
        Ok(())
    }

    pub fn assert_resolved_or_settlement_open(&self) -> Result<()> {
        require!(
            self.status == MarketStatus::Resolved
                || self.status == MarketStatus::SettlementOpen
                || self.status == MarketStatus::Closed,
            MarketError::MarketNotResolved
        );
        Ok(())
    }

    pub fn assert_creator(&self, signer: &Pubkey) -> Result<()> {
        require_keys_eq!(*signer, self.creator, MarketError::UnauthorizedCreator);
        Ok(())
    }

    pub fn is_after_end_time(&self, now: i64) -> bool {
        now >= self.end_time as i64
    }

    pub fn mark_resolved(&mut self, outcome: Outcome, final_reserves: u64) {
        self.outcome = outcome;
        self.final_reserves = final_reserves;
        self.status = MarketStatus::Resolved;
    }

    pub fn mark_settlement_open(&mut self) {
        self.status = MarketStatus::SettlementOpen;
    }

    pub fn mark_closed(&mut self) {
        self.status = MarketStatus::Closed;
    }

    pub fn winning_live_supply(&self) -> Result<u64> {
        match self.outcome {
            Outcome::Yes => Ok(self.live_yes_supply),
            Outcome::No => Ok(self.live_no_supply),
            Outcome::Invalid => Ok(0),
            Outcome::Undetermined => err!(MarketError::MarketNotResolved),
        }
    }
}

/// Public lifecycle status of the market shell.
#[derive(
    AnchorSerialize,
    AnchorDeserialize,
    Clone,
    Copy,
    PartialEq,
    Eq,
    InitSpace,
    Debug,
    Default,
)]
pub enum MarketStatus {
    /// Market is open for private trading inside MagicBlock / PER.
    #[default]
    Active,

    /// Trading end time has passed but outcome is not yet resolved.
    Ended,

    /// Oracle resolved the outcome.
    Resolved,

    /// Users can claim settled payouts.
    SettlementOpen,

    /// Market is fully settled/closed.
    Closed,

    /// Market was cancelled/voided.
    Cancelled,
}

/// Binary prediction outcome.
#[derive(
    AnchorSerialize,
    AnchorDeserialize,
    Clone,
    Copy,
    PartialEq,
    Eq,
    InitSpace,
    Debug,
    Default,
)]
pub enum Outcome {
    /// Not resolved yet.
    #[default]
    Undetermined,

    /// YES won.
    Yes,

    /// NO won.
    No,

    /// Market invalid/void.
    ///
    /// Useful for future cancellation / ambiguous resolution logic.
    Invalid,
}

#[error_code]
pub enum MarketError {
    #[msg("Market is not active")]
    MarketNotActive,

    #[msg("Market has not ended yet")]
    MarketNotEnded,

    #[msg("Market is already ended or resolved")]
    MarketAlreadyEnded,

    #[msg("Market is not resolved")]
    MarketNotResolved,

    #[msg("Market has been cancelled")]
    MarketCancelled,

    #[msg("Unauthorized market creator")]
    UnauthorizedCreator,

    #[msg("Question is too long")]
    QuestionTooLong,

    #[msg("Invalid end time")]
    InvalidEndTime,

    #[msg("Invalid outcome")]
    InvalidOutcome,

    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
}
