//! # Permissionless Private Prediction Market
//!
//! Solana + MagicBlock / Private Ephemeral Rollup architecture.
//!
//! Core thesis:
//! - Solana L1 stores public shell accounts, escrow vaults, and final settlement.
//! - MagicBlock / PER stores live private trading state.
//! - Live YES/NO positions are virtual and private.
//! - No public YES/NO SPL outcome tokens are minted during active trading.
//!
//! Flow:
//! initialize
//! → create_private_market
//! → open_position
//! → deposit_collateral
//! → delegate_market_into_tee
//! → delegate_position_into_tee
//! → initialize_private_market_state
//! → initialize_private_position_state
//! → place_private_prediction
//! → resolve_private_market_er
//! → settle_private_position_er
//! → commit_position_and_undelegate
//! → claim_settled_private_position
//! → commit_and_undelegate

use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::ephemeral;
use ephemeral_rollups_sdk::ephem::MagicIntentBundleBuilder;

pub mod amm;
pub mod instructions;
pub mod state;

pub use amm::*;
pub use instructions::*;
pub use state::*;

// Replace this with your deployed program id after `anchor keys sync`.
declare_id!("79RQQN3A4HHrogrBTwUw5py8UMhhyKFFb1CmVGagZ55t");

#[ephemeral]
#[program]
pub mod prediction_market {
    use super::*;

    // ------------------------------------------------------------------------
    // Protocol admin / config
    // ------------------------------------------------------------------------

    /// Initialize global protocol configuration.
    ///
    /// Called once during deployment.
    pub fn initialize(
        ctx: Context<Initialize>,
        protocol_fee_bps: u16,
        oracle: Pubkey,
        tee_validator: Pubkey,
    ) -> Result<()> {
        ctx.accounts
            .initialize(protocol_fee_bps, oracle, tee_validator, ctx.bumps)
    }

    /// Pause or unpause protocol-level actions.
    pub fn set_protocol_paused(ctx: Context<SetProtocolPaused>, paused: bool) -> Result<()> {
        ctx.accounts.set_protocol_paused(paused)
    }

    /// Update oracle / resolver authority.
    pub fn update_oracle(ctx: Context<UpdateOracle>, new_oracle: Pubkey) -> Result<()> {
        ctx.accounts.update_oracle(new_oracle)
    }

    /// Update MagicBlock / PER validator identity.
    pub fn update_tee_validator(
        ctx: Context<UpdateTeeValidator>,
        new_tee_validator: Pubkey,
    ) -> Result<()> {
        ctx.accounts.update_tee_validator(new_tee_validator)
    }

    /// Update the protocol collateral mint used by newly created markets.
    pub fn update_collateral_mint(ctx: Context<UpdateCollateralMint>) -> Result<()> {
        ctx.accounts.update_collateral_mint()
    }

    // ------------------------------------------------------------------------
    // Permissionless market creation
    // ------------------------------------------------------------------------

    /// Create a permissionless private prediction market.
    ///
    /// This creates:
    /// - Market shell PDA
    /// - creator TraderPosition shell PDA
    /// - collateral vault ATA
    ///
    /// It does NOT mint public YES/NO SPL tokens.
    pub fn create_private_market(
        ctx: Context<CreatePrivateMarket>,
        question: String,
        end_time: u64,
        initial_liquidity: u64,
    ) -> Result<()> {
        ctx.accounts
            .create_private_market(question, end_time, initial_liquidity, ctx.bumps)
    }

    /// Create a private prediction market resolved by a MagicBlock Pyth Lazer
    /// price feed inside the Ephemeral Rollup.
    ///
    /// YES means the configured price condition is true at resolution time.
    pub fn create_price_market(
        ctx: Context<CreatePrivateMarket>,
        question: String,
        end_time: u64,
        initial_liquidity: u64,
        target_price: i64,
        price_direction: PriceDirection,
        oracle_feed: Pubkey,
    ) -> Result<()> {
        ctx.accounts.create_price_market(
            question,
            end_time,
            initial_liquidity,
            target_price,
            price_direction,
            oracle_feed,
            ctx.bumps,
        )
    }

    // ------------------------------------------------------------------------
    // Public position shell + L1 collateral escrow
    // ------------------------------------------------------------------------

    /// Open a public position shell for a trader.
    ///
    /// The actual live position will later be initialized inside MagicBlock / PER.
    pub fn open_position(ctx: Context<OpenPosition>) -> Result<()> {
        ctx.accounts.open_position(ctx.bumps)
    }

    /// Deposit collateral into the market L1 vault.
    ///
    /// This does not reveal YES/NO direction because no trade happens here.
    pub fn deposit_collateral(ctx: Context<DepositCollateral>, amount: u64) -> Result<()> {
        ctx.accounts.deposit_collateral(amount)
    }

    /// Withdraw idle L1 collateral before PER activation.
    ///
    /// Once the position is delegated/activated in PER, withdrawals should go
    /// through private settlement logic instead.
    pub fn withdraw_collateral(ctx: Context<WithdrawCollateral>, amount: u64) -> Result<()> {
        ctx.accounts.withdraw_collateral(amount)
    }

    /// Claim final settled payout from the Solana L1 vault.
    ///
    /// This happens after ER/PER settlement writes claimable_amount into
    /// the public TraderPosition shell.
    pub fn claim_settled_private_position(
        ctx: Context<ClaimSettledPrivatePosition>,
    ) -> Result<u64> {
        ctx.accounts.claim_settled_private_position()
    }

    // ------------------------------------------------------------------------
    // MagicBlock / PER delegation
    // ------------------------------------------------------------------------

    /// Delegate market shell into MagicBlock / PER.
    ///
    /// Permission:
    /// - market creator
    /// - protocol admin
    pub fn create_market_permission(ctx: Context<CreateMarketPermission>) -> Result<()> {
        ctx.accounts.create_market_permission()
    }

    /// Create a MagicBlock permission PDA for a trader position shell.
    ///
    /// This mirrors the working payroll flow, where the delegated public PDA
    /// first gets a permission account before the permission itself is delegated.
    pub fn create_position_permission(ctx: Context<CreatePositionPermission>) -> Result<()> {
        ctx.accounts.create_position_permission()
    }

    /// Create a MagicBlock permission PDA for a private position state account.
    pub fn create_private_position_permission(
        ctx: Context<CreatePrivatePositionPermission>,
    ) -> Result<()> {
        ctx.accounts.create_private_position_permission()
    }

    /// Delegate market shell into MagicBlock / PER.
    ///
    /// Permission:
    /// - market creator
    /// - protocol admin
    pub fn delegate_market_into_tee(ctx: Context<DelegateMarket>, market_id: u64) -> Result<()> {
        let market = ctx.accounts.validate_delegate_market(market_id)?;

        let market_id_bytes = market_id.to_le_bytes();
        let seeds: &[&[u8]] = &[Market::SEED, market_id_bytes.as_ref()];

        ctx.accounts.delegate_market(
            &ctx.accounts.authority,
            seeds,
            ephemeral_rollups_sdk::cpi::DelegateConfig {
                validator: Some(ctx.accounts.config.tee_validator),
                ..Default::default()
            },
        )?;

        ctx.accounts.emit_delegated(&market)?;

        msg!(
            "Market {} delegated into MagicBlock / PER. Live state can now execute privately.",
            market_id
        );

        Ok(())
    }

    /// Delegate trader position shell into MagicBlock / PER.
    ///
    /// Permission:
    /// - trader
    /// - protocol admin
    pub fn delegate_position_into_tee(
        ctx: Context<DelegatePosition>,
        market: Pubkey,
        trader: Pubkey,
    ) -> Result<()> {
        let position = ctx.accounts.validate_delegate_position(market, trader)?;

        let seeds: &[&[u8]] = &[TraderPosition::SEED, market.as_ref(), trader.as_ref()];

        ctx.accounts.delegate_position(
            &ctx.accounts.authority,
            seeds,
            ephemeral_rollups_sdk::cpi::DelegateConfig {
                validator: Some(ctx.accounts.config.tee_validator),
                ..Default::default()
            },
        )?;

        ctx.accounts.emit_delegated(&position)?;

        msg!(
            "Position for trader {} in market {} delegated into MagicBlock / PER.",
            trader,
            market
        );

        Ok(())
    }

    /// Delegate private position state into MagicBlock / PER.
    pub fn delegate_private_position_into_tee(
        ctx: Context<DelegatePrivatePosition>,
        market: Pubkey,
        trader: Pubkey,
    ) -> Result<()> {
        let private_position = ctx
            .accounts
            .validate_delegate_private_position(market, trader)?;

        let seeds: &[&[u8]] = &[PrivatePositionState::SEED, market.as_ref(), trader.as_ref()];

        ctx.accounts.delegate_private_position(
            &ctx.accounts.authority,
            seeds,
            ephemeral_rollups_sdk::cpi::DelegateConfig {
                validator: Some(ctx.accounts.config.tee_validator),
                ..Default::default()
            },
        )?;

        ctx.accounts.emit_delegated(&private_position)?;

        msg!(
            "Private position for trader {} in market {} delegated into MagicBlock / PER.",
            trader,
            market
        );

        Ok(())
    }

    /// Commit and undelegate market shell back to Solana L1.
    ///
    /// Usually called after market resolution / settlement.
    pub fn commit_market(ctx: Context<UndelegateMarket>) -> Result<()> {
        ctx.accounts.validate_undelegate_market()?;
        ctx.accounts.market.exit(&crate::ID)?;

        MagicIntentBundleBuilder::new(
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        )
        .commit(&[ctx.accounts.market.to_account_info()])
        .build_and_invoke()?;

        msg!("Market committed back to Solana L1.");

        Ok(())
    }

    /// Commit and undelegate market shell back to Solana L1.
    ///
    /// Usually called after market resolution / settlement.
    pub fn commit_and_undelegate(ctx: Context<UndelegateMarket>) -> Result<()> {
        ctx.accounts.validate_undelegate_market()?;
        ctx.accounts.market.exit(&crate::ID)?;

        MagicIntentBundleBuilder::new(
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        )
        .commit_and_undelegate(&[ctx.accounts.market.to_account_info()])
        .build_and_invoke()?;

        ctx.accounts.emit_committed_and_undelegated()?;

        msg!("Market committed and undelegated back to Solana L1.");

        Ok(())
    }

    /// Commit and undelegate trader position shell back to Solana L1.
    ///
    /// Usually called after settle_private_position_er has written final
    /// claimable_amount into the public position shell.
    pub fn commit_position(ctx: Context<UndelegatePosition>) -> Result<()> {
        ctx.accounts.validate_undelegate_position()?;
        ctx.accounts.position.exit(&crate::ID)?;

        MagicIntentBundleBuilder::new(
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        )
        .commit(&[ctx.accounts.position.to_account_info()])
        .build_and_invoke()?;

        msg!("Position committed back to Solana L1.");

        Ok(())
    }

    /// Commit and undelegate trader position shell back to Solana L1.
    ///
    /// Usually called after settle_private_position_er has written final
    /// claimable_amount into the public position shell.
    pub fn commit_position_and_undelegate(ctx: Context<UndelegatePosition>) -> Result<()> {
        ctx.accounts.validate_undelegate_position()?;
        ctx.accounts.position.exit(&crate::ID)?;

        MagicIntentBundleBuilder::new(
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        )
        .commit_and_undelegate(&[ctx.accounts.position.to_account_info()])
        .build_and_invoke()?;

        ctx.accounts.emit_committed_and_undelegated()?;

        msg!("Position committed and undelegated back to Solana L1.");

        Ok(())
    }

    // ------------------------------------------------------------------------
    // MagicBlock / PER private live state
    // ------------------------------------------------------------------------

    /// Initialize ER/PER-only private market state and creator private position.
    ///
    /// This converts creator's initial L1 liquidity into balanced virtual
    /// YES/NO exposure inside PER.
    pub fn initialize_private_market_state(
        ctx: Context<InitializePrivateMarketState>,
    ) -> Result<()> {
        ctx.accounts.initialize_private_market_state(ctx.bumps)
    }

    /// Initialize ER/PER-only private position state for a normal trader.
    ///
    /// The trader's deposited L1 collateral becomes private available collateral.
    pub fn initialize_private_position_state(
        ctx: Context<InitializePrivatePositionState>,
    ) -> Result<()> {
        ctx.accounts.initialize_private_position_state(ctx.bumps)
    }

    /// Place a private prediction inside MagicBlock / PER.
    ///
    /// Traders allocate idle collateral to either the YES or NO side.
    /// No public YES/NO SPL tokens are minted during this operation.
    pub fn place_private_prediction(
        ctx: Context<PlacePrivatePrediction>,
        amount: u64,
        predict_yes: bool,
    ) -> Result<()> {
        ctx.accounts.place_private_prediction(amount, predict_yes)
    }

    /// Resolve private market inside MagicBlock / PER.
    ///
    /// Permission:
    /// - configured oracle only
    pub fn resolve_private_market_er(
        ctx: Context<ResolvePrivateMarketEr>,
        yes_wins: bool,
    ) -> Result<()> {
        ctx.accounts.resolve_private_market_er(yes_wins)
    }

    /// Resolve a MagicBlock/Pyth price market inside ER/PER.
    pub fn resolve_price_market_er(ctx: Context<ResolvePriceMarketEr>) -> Result<()> {
        ctx.accounts.resolve_price_market_er()
    }

    /// Settle a private position after market resolution.
    ///
    /// This calculates:
    /// claimable_amount = idle_collateral + proportional_winning_payout
    ///
    /// Then writes claimable_amount into the public TraderPosition shell.
    pub fn settle_private_position_er(ctx: Context<SettlePrivatePositionEr>) -> Result<u64> {
        ctx.accounts.settle_private_position_er()
    }

    /// Keeper/admin path to settle a private position after market resolution.
    ///
    /// This gives the off-chain scheduler an Epoch-style last-mile path:
    /// resolve expired price markets, settle trader positions, then users only
    /// need the final L1 claim when claimable_amount is available.
    pub fn settle_private_position_by_keeper_er(
        ctx: Context<SettlePrivatePositionByKeeperEr>,
    ) -> Result<u64> {
        ctx.accounts.settle_private_position_by_keeper_er()
    }
}
