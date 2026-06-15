use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

use crate::state::{Config, ConfigError};

/// Event emitted when the protocol is initialized.
#[event]
pub struct ProtocolInitialized {
    pub admin: Pubkey,
    pub oracle: Pubkey,
    pub collateral_mint: Pubkey,
    pub protocol_fee_bps: u16,
    pub min_liquidity: u64,
    pub tee_validator: Pubkey,
}

/// Event emitted when protocol pause status changes.
#[event]
pub struct ProtocolPauseUpdated {
    pub admin: Pubkey,
    pub paused: bool,
}

/// Event emitted when oracle authority changes.
#[event]
pub struct OracleUpdated {
    pub admin: Pubkey,
    pub old_oracle: Pubkey,
    pub new_oracle: Pubkey,
}

/// Event emitted when MagicBlock / PER validator identity changes.
#[event]
pub struct TeeValidatorUpdated {
    pub admin: Pubkey,
    pub old_tee_validator: Pubkey,
    pub new_tee_validator: Pubkey,
}

/// Event emitted when the protocol collateral mint changes.
#[event]
pub struct CollateralMintUpdated {
    pub admin: Pubkey,
    pub old_collateral_mint: Pubkey,
    pub new_collateral_mint: Pubkey,
}

/// Accounts for protocol initialization.
///
/// This instruction is called once during deployment.
///
/// It creates the singleton Config PDA:
/// seeds = ["config"]
#[derive(Accounts)]
pub struct Initialize<'info> {
    /// Protocol admin.
    ///
    /// This signer pays for the config account and becomes protocol admin.
    #[account(mut)]
    pub admin: Signer<'info>,

    /// Global protocol configuration account.
    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [Config::SEED],
        bump,
    )]
    pub config: Account<'info, Config>,

    /// Collateral mint used by the protocol.
    ///
    /// Example:
    /// - USDC
    /// - test USDC
    /// - Token-2022 compatible collateral mint
    pub collateral_mint: InterfaceAccount<'info, Mint>,

    /// System program.
    pub system_program: Program<'info, System>,
}

impl<'info> Initialize<'info> {
    pub fn initialize(
        &mut self,
        protocol_fee_bps: u16,
        oracle: Pubkey,
        tee_validator: Pubkey,
        bumps: InitializeBumps,
    ) -> Result<()> {
        require!(
            protocol_fee_bps <= Config::MAX_PROTOCOL_FEE_BPS,
            ConfigError::FeeTooHigh
        );

        self.config.set_inner(Config {
            admin: self.admin.key(),
            oracle,
            collateral_mint: self.collateral_mint.key(),
            protocol_fee_bps,
            min_liquidity: Config::DEFAULT_MIN_LIQUIDITY,
            market_count: 0,
            paused: false,
            tee_validator,
            bump: bumps.config,
        });

        emit!(ProtocolInitialized {
            admin: self.admin.key(),
            oracle,
            collateral_mint: self.collateral_mint.key(),
            protocol_fee_bps,
            min_liquidity: Config::DEFAULT_MIN_LIQUIDITY,
            tee_validator,
        });

        Ok(())
    }
}

/// Accounts for pausing / unpausing the protocol.
#[derive(Accounts)]
pub struct SetProtocolPaused<'info> {
    /// Protocol admin.
    #[account(mut)]
    pub admin: Signer<'info>,

    /// Global config.
    #[account(
        mut,
        seeds = [Config::SEED],
        bump = config.bump,
        constraint = config.admin == admin.key() @ ConfigError::Unauthorized,
    )]
    pub config: Account<'info, Config>,
}

impl<'info> SetProtocolPaused<'info> {
    pub fn set_protocol_paused(&mut self, paused: bool) -> Result<()> {
        self.config.paused = paused;

        emit!(ProtocolPauseUpdated {
            admin: self.admin.key(),
            paused,
        });

        Ok(())
    }
}

/// Accounts for updating oracle authority.
#[derive(Accounts)]
pub struct UpdateOracle<'info> {
    /// Protocol admin.
    #[account(mut)]
    pub admin: Signer<'info>,

    /// Global config.
    #[account(
        mut,
        seeds = [Config::SEED],
        bump = config.bump,
        constraint = config.admin == admin.key() @ ConfigError::Unauthorized,
    )]
    pub config: Account<'info, Config>,
}

impl<'info> UpdateOracle<'info> {
    pub fn update_oracle(&mut self, new_oracle: Pubkey) -> Result<()> {
        let old_oracle = self.config.oracle;
        self.config.oracle = new_oracle;

        emit!(OracleUpdated {
            admin: self.admin.key(),
            old_oracle,
            new_oracle,
        });

        Ok(())
    }
}

/// Accounts for updating MagicBlock / PER validator identity.
#[derive(Accounts)]
pub struct UpdateTeeValidator<'info> {
    /// Protocol admin.
    #[account(mut)]
    pub admin: Signer<'info>,

    /// Global config.
    #[account(
        mut,
        seeds = [Config::SEED],
        bump = config.bump,
        constraint = config.admin == admin.key() @ ConfigError::Unauthorized,
    )]
    pub config: Account<'info, Config>,
}

impl<'info> UpdateTeeValidator<'info> {
    pub fn update_tee_validator(&mut self, new_tee_validator: Pubkey) -> Result<()> {
        let old_tee_validator = self.config.tee_validator;
        self.config.tee_validator = new_tee_validator;

        emit!(TeeValidatorUpdated {
            admin: self.admin.key(),
            old_tee_validator,
            new_tee_validator,
        });

        Ok(())
    }
}

/// Accounts for updating the protocol collateral mint.
#[derive(Accounts)]
pub struct UpdateCollateralMint<'info> {
    /// Protocol admin.
    #[account(mut)]
    pub admin: Signer<'info>,

    /// Global config.
    #[account(
        mut,
        seeds = [Config::SEED],
        bump = config.bump,
        constraint = config.admin == admin.key() @ ConfigError::Unauthorized,
    )]
    pub config: Account<'info, Config>,

    /// New collateral mint used by future markets.
    pub collateral_mint: InterfaceAccount<'info, Mint>,
}

impl<'info> UpdateCollateralMint<'info> {
    pub fn update_collateral_mint(&mut self) -> Result<()> {
        let old_collateral_mint = self.config.collateral_mint;
        self.config.collateral_mint = self.collateral_mint.key();

        emit!(CollateralMintUpdated {
            admin: self.admin.key(),
            old_collateral_mint,
            new_collateral_mint: self.collateral_mint.key(),
        });

        Ok(())
    }
}
