use anchor_lang::prelude::*;

/// Global protocol configuration.
///
/// This is a singleton PDA that controls protocol-wide settings:
/// - admin authority
/// - oracle / resolver authority
/// - collateral mint
/// - protocol fee
/// - minimum market liquidity
/// - MagicBlock / PER validator identity
///
/// PDA:
/// seeds = ["config"]
#[account]
#[derive(InitSpace)]
pub struct Config {
    /// Protocol admin.
    ///
    /// Admin can pause/unpause the protocol and update high-level settings
    /// in future versions.
    pub admin: Pubkey,

    /// Oracle / resolver authority.
    ///
    /// This account is allowed to resolve markets after the market end time.
    /// In production, this should ideally become:
    /// - multisig
    /// - optimistic oracle
    /// - dispute-based oracle
    /// - AI oracle with verification layer
    pub oracle: Pubkey,

    /// Collateral token mint.
    ///
    /// Example:
    /// - USDC mint
    /// - test USDC mint
    /// - any SPL Token / Token-2022 compatible collateral mint
    pub collateral_mint: Pubkey,

    /// Protocol fee in basis points.
    ///
    /// 100 bps = 1%
    /// 10_000 bps = 100%
    pub protocol_fee_bps: u16,

    /// Minimum collateral required to create a market.
    pub min_liquidity: u64,

    /// Number of markets created.
    ///
    /// Used to derive deterministic market PDA:
    /// seeds = ["market", market_id.to_le_bytes()]
    pub market_count: u64,

    /// Emergency pause flag.
    ///
    /// If true, market creation, deposits, and trading should stop.
    pub paused: bool,

    /// MagicBlock / Private Ephemeral Rollup validator identity.
    ///
    /// This is the validator / TEE identity used for delegation.
    /// On devnet, this can be the MagicBlock devnet validator identity.
    pub tee_validator: Pubkey,

    /// PDA bump.
    pub bump: u8,
}

impl Config {
    pub const SEED: &'static [u8] = b"config";

    /// Maximum protocol fee: 30%.
    ///
    /// This is high enough for experiments but should be lower in production.
    pub const MAX_PROTOCOL_FEE_BPS: u16 = 3_000;

    /// Default minimum liquidity.
    ///
    /// If collateral has 6 decimals, this equals 1.000000 token.
    pub const DEFAULT_MIN_LIQUIDITY: u64 = 1_000_000;

    /// Fixed fee charged on market creation to discourage spam.
    ///
    /// If collateral has 6 decimals, this equals 0.500000 token.
    pub const MARKET_CREATION_FEE: u64 = 500_000;

    pub fn assert_not_paused(&self) -> Result<()> {
        require!(!self.paused, ConfigError::ProtocolPaused);
        Ok(())
    }

    pub fn assert_admin(&self, signer: &Pubkey) -> Result<()> {
        require_keys_eq!(*signer, self.admin, ConfigError::Unauthorized);
        Ok(())
    }

    pub fn assert_oracle(&self, signer: &Pubkey) -> Result<()> {
        require_keys_eq!(*signer, self.oracle, ConfigError::Unauthorized);
        Ok(())
    }
}

#[error_code]
pub enum ConfigError {
    #[msg("The protocol is paused")]
    ProtocolPaused,

    #[msg("Unauthorized signer")]
    Unauthorized,

    #[msg("Protocol fee is too high")]
    FeeTooHigh,

    #[msg("Minimum liquidity must be greater than zero")]
    InvalidMinLiquidity,
}
