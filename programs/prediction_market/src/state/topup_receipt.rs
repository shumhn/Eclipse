use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct PositionTopupReceipt {
    pub market: Pubkey,
    pub trader: Pubkey,
    pub amount: u64,
    pub nonce: u64,
    pub consumed: bool,
    pub bump: u8,
}

impl PositionTopupReceipt {
    pub const SEED: &'static [u8] = b"position_topup_receipt";

    pub fn assert_unconsumed(&self) -> Result<()> {
        require!(!self.consumed, TopupReceiptError::TopupReceiptAlreadyConsumed);
        Ok(())
    }

    pub fn mark_consumed(&mut self) {
        self.consumed = true;
    }
}

#[error_code]
pub enum TopupReceiptError {
    #[msg("Top-up receipt has already been consumed")]
    TopupReceiptAlreadyConsumed,

    #[msg("Top-up receipt belongs to a different market")]
    TopupReceiptMarketMismatch,

    #[msg("Top-up receipt belongs to a different trader")]
    TopupReceiptTraderMismatch,

    #[msg("Top-up receipt amount is invalid")]
    InvalidTopupReceiptAmount,
}
