use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::state::{
    Config, ConfigError, Market, MarketError, MarketOracleKind, MarketStatus, Outcome,
    PriceDirection, PrivatePositionState, TraderPosition, PRIVATE_POSITION_STATE_DISCRIMINATOR,
};

/// Event emitted when a new private prediction market is created.
///
/// Important:
/// This does NOT mint public YES/NO SPL tokens.
/// It only creates the public market shell and locks collateral into the vault.
#[event]
pub struct PrivateMarketCreated {
    pub market_id: u64,
    pub creator: Pubkey,
    pub market: Pubkey,
    pub creator_position: Pubkey,
    pub question: String,
    pub end_time: u64,
    pub initial_liquidity: u64,
    pub collateral_mint: Pubkey,
    pub vault: Pubkey,
    pub oracle_kind: MarketOracleKind,
    pub price_direction: PriceDirection,
    pub target_price: i64,
    pub oracle_feed: Pubkey,
    pub timestamp: i64,
}

/// Accounts for permissionless private market creation.
///
/// This creates:
/// - public Market shell PDA
/// - creator TraderPosition shell PDA
/// - market collateral vault ATA
///
/// It transfers creator's initial liquidity into the market vault.
///
/// It does NOT:
/// - create YES/NO SPL mints
/// - mint public outcome tokens
/// - reveal live market state
///
/// Live trading state will later be initialized inside MagicBlock / PER:
/// - PrivateMarketState
/// - PrivatePositionState
#[derive(Accounts)]
pub struct CreatePrivateMarket<'info> {
    /// Permissionless market creator.
    #[account(mut)]
    pub creator: Signer<'info>,

    /// Global protocol config.
    #[account(
        mut,
        seeds = [Config::SEED],
        bump = config.bump,
        constraint = !config.paused @ ConfigError::ProtocolPaused,
    )]
    pub config: Account<'info, Config>,

    /// Public market shell.
    ///
    /// PDA:
    /// seeds = ["market", config.market_count.to_le_bytes()]
    #[account(
        init,
        payer = creator,
        space = 8 + Market::INIT_SPACE,
        seeds = [Market::SEED, config.market_count.to_le_bytes().as_ref()],
        bump,
    )]
    pub market: Account<'info, Market>,

    /// Creator's public position shell.
    ///
    /// PDA:
    /// seeds = ["position", market.key(), creator.key()]
    #[account(
        init,
        payer = creator,
        space = 8 + TraderPosition::INIT_SPACE,
        seeds = [TraderPosition::SEED, market.key().as_ref(), creator.key().as_ref()],
        bump,
    )]
    pub creator_position: Account<'info, TraderPosition>,

    /// Creator's private position state PDA.
    ///
    /// Created on L1, then delegated into MagicBlock before private execution.
    #[account(
        init,
        payer = creator,
        space = 8 + PrivatePositionState::LEN,
        seeds = [PrivatePositionState::SEED, market.key().as_ref(), creator.key().as_ref()],
        bump,
    )]
    /// CHECK: Serialized manually with a stable discriminator.
    pub creator_private_position: AccountInfo<'info>,

    /// Protocol collateral mint.
    #[account(
        constraint = collateral_mint.key() == config.collateral_mint,
    )]
    pub collateral_mint: InterfaceAccount<'info, Mint>,

    /// Creator's collateral token account.
    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = creator,
        associated_token::token_program = token_program,
    )]
    pub creator_collateral: InterfaceAccount<'info, TokenAccount>,

    /// Market vault.
    ///
    /// ATA:
    /// mint = collateral_mint
    /// authority = market PDA
    ///
    /// This vault holds real collateral on Solana L1.
    #[account(
        init_if_needed,
        payer = creator,
        associated_token::mint = collateral_mint,
        associated_token::authority = market,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    /// Token program.
    pub token_program: Interface<'info, TokenInterface>,

    /// Associated token program.
    pub associated_token_program: Program<'info, AssociatedToken>,

    /// System program.
    pub system_program: Program<'info, System>,
}

impl<'info> CreatePrivateMarket<'info> {
    pub fn create_private_market(
        &mut self,
        question: String,
        end_time: u64,
        initial_liquidity: u64,
        bumps: CreatePrivateMarketBumps,
    ) -> Result<()> {
        self.create_market_with_oracle(
            question,
            end_time,
            initial_liquidity,
            MarketOracleKind::Manual,
            PriceDirection::Above,
            0,
            Pubkey::default(),
            bumps,
        )
    }

    pub fn create_price_market(
        &mut self,
        question: String,
        end_time: u64,
        initial_liquidity: u64,
        target_price: i64,
        price_direction: PriceDirection,
        oracle_feed: Pubkey,
        bumps: CreatePrivateMarketBumps,
    ) -> Result<()> {
        require_keys_neq!(
            oracle_feed,
            Pubkey::default(),
            MarketError::InvalidOracleFeed
        );

        self.create_market_with_oracle(
            question,
            end_time,
            initial_liquidity,
            MarketOracleKind::PythPrice,
            price_direction,
            target_price,
            oracle_feed,
            bumps,
        )
    }

    fn create_market_with_oracle(
        &mut self,
        question: String,
        end_time: u64,
        initial_liquidity: u64,
        oracle_kind: MarketOracleKind,
        price_direction: PriceDirection,
        target_price: i64,
        oracle_feed: Pubkey,
        bumps: CreatePrivateMarketBumps,
    ) -> Result<()> {
        let clock = Clock::get()?;

        require!(
            question.len() <= Market::MAX_QUESTION_LEN,
            MarketError::QuestionTooLong
        );

        require!(
            end_time > clock.unix_timestamp as u64,
            MarketError::InvalidEndTime
        );

        require!(
            initial_liquidity >= self.config.min_liquidity,
            CreatePrivateMarketError::InsufficientInitialLiquidity
        );

        require!(
            self.creator_collateral.amount >= initial_liquidity,
            CreatePrivateMarketError::InsufficientCreatorCollateral
        );

        let market_id = self.config.market_count;

        // Transfer real collateral from creator into the Solana L1 vault.
        //
        // This collateral remains on Solana as escrow.
        // Trading exposure will be represented privately inside MagicBlock / PER.
        transfer_checked(
            CpiContext::new(
                self.token_program.to_account_info(),
                TransferChecked {
                    from: self.creator_collateral.to_account_info(),
                    mint: self.collateral_mint.to_account_info(),
                    to: self.vault.to_account_info(),
                    authority: self.creator.to_account_info(),
                },
            ),
            initial_liquidity,
            self.collateral_mint.decimals,
        )?;

        // Initialize public market shell.
        self.market.set_inner(Market {
            id: market_id,
            creator: self.creator.key(),
            question: question.clone(),
            end_time,
            created_at: clock.unix_timestamp as u64,
            collateral_mint: self.collateral_mint.key(),
            vault: self.vault.key(),
            total_deposited: initial_liquidity,
            live_reserves: 0,
            live_yes_supply: 0,
            live_no_supply: 0,
            final_reserves: 0,
            total_claimable_settled: 0,
            total_claimed: 0,
            status: MarketStatus::Active,
            outcome: Outcome::Undetermined,
            oracle_kind,
            price_direction,
            target_price,
            oracle_feed,
            resolver_price: 0,
            bump: bumps.market,
        });

        // Initialize creator's public position shell.
        //
        // The creator's initial liquidity becomes their deposited collateral.
        // Later, initialize_private_market_state will convert this into
        // balanced private YES/NO virtual exposure inside PER.
        self.creator_position.set_inner(TraderPosition {
            market: self.market.key(),
            trader: self.creator.key(),
            collateral_deposited: initial_liquidity,
            collateral_withdrawn: 0,
            claimable_amount: 0,
            claimed_amount: 0,
            delegated: false,
            settled: false,
            claimed: false,
            bump: bumps.creator_position,
        });

        let creator_private_position = PrivatePositionState::new(
            self.market.key(),
            self.creator.key(),
            initial_liquidity,
            0,
            initial_liquidity,
            initial_liquidity,
            bumps.creator_private_position,
        );

        store_creator_private_position(&self.creator_private_position, &creator_private_position)?;

        // Increment market count.
        self.config.market_count = self
            .config
            .market_count
            .checked_add(1)
            .ok_or(MarketError::ArithmeticOverflow)?;

        emit!(PrivateMarketCreated {
            market_id,
            creator: self.creator.key(),
            market: self.market.key(),
            creator_position: self.creator_position.key(),
            question,
            end_time,
            initial_liquidity,
            collateral_mint: self.collateral_mint.key(),
            vault: self.vault.key(),
            oracle_kind,
            price_direction,
            target_price,
            oracle_feed,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }
}

fn store_creator_private_position(
    account: &AccountInfo,
    state: &PrivatePositionState,
) -> Result<()> {
    let mut data = account.try_borrow_mut_data()?;

    require!(
        data.len() >= 8 + PrivatePositionState::LEN,
        CreatePrivateMarketError::InvalidPrivatePositionAccount
    );

    data[0..8].copy_from_slice(&PRIVATE_POSITION_STATE_DISCRIMINATOR);

    let mut writer = &mut data[8..8 + PrivatePositionState::LEN];
    state.serialize(&mut writer)?;

    Ok(())
}

#[error_code]
pub enum CreatePrivateMarketError {
    #[msg("Initial liquidity is below the protocol minimum")]
    InsufficientInitialLiquidity,

    #[msg("Creator does not have enough collateral")]
    InsufficientCreatorCollateral,

    #[msg("Invalid private position account")]
    InvalidPrivatePositionAccount,
}
