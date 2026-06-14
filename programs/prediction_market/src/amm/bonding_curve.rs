use anchor_lang::prelude::*;

/// Pythagorean AMM bonding curve for binary prediction markets.
///
/// Core invariant:
///
/// R = sqrt(YES^2 + NO^2)
///
/// Where:
/// - R   = collateral reserves
/// - YES = virtual YES share supply
/// - NO  = virtual NO share supply
///
/// Important:
/// This AMM is used only for private virtual shares inside MagicBlock / PER.
/// It does NOT mint public YES/NO SPL tokens.
pub struct PythagoreanCurve;

impl PythagoreanCurve {
    /// Calculate initial balanced YES/NO virtual shares for a new market.
    ///
    /// For balanced initial state:
    ///
    /// YES = NO = sqrt(R^2 / 2)
    ///
    /// Example:
    /// reserves = 1_000_000
    /// yes_supply ≈ 707_106
    /// no_supply  ≈ 707_106
    pub fn initial_balanced_supply(reserves: u64) -> Result<u64> {
        require!(reserves > 0, AmmError::InvalidReserves);

        let r = reserves as u128;
        let r_squared = checked_square(r)?;
        let token_amount = integer_sqrt(
            r_squared
                .checked_div(2)
                .ok_or(AmmError::DivisionByZero)?,
        );

        u128_to_u64(token_amount)
    }

    /// Calculate virtual shares to mint when a trader spends collateral
    /// to buy YES or NO.
    ///
    /// Formula:
    ///
    /// new_R = R + collateral_in
    /// new_target_supply = sqrt(new_R^2 - other_supply^2)
    /// shares_out = new_target_supply - old_target_supply
    ///
    /// Arguments:
    /// - reserves: current private collateral reserves
    /// - target_supply: supply of the side being bought
    /// - other_supply: supply of the opposite side
    /// - collateral_in: collateral spent by trader
    pub fn get_shares_to_mint(
        reserves: u64,
        target_supply: u64,
        other_supply: u64,
        collateral_in: u64,
    ) -> Result<u64> {
        require!(reserves > 0, AmmError::InvalidReserves);
        require!(collateral_in > 0, AmmError::InvalidAmount);

        let r = reserves as u128;
        let target = target_supply as u128;
        let other = other_supply as u128;
        let collateral = collateral_in as u128;

        let new_r = r.checked_add(collateral).ok_or(AmmError::Overflow)?;

        let new_r_squared = checked_square(new_r)?;
        let other_squared = checked_square(other)?;

        require!(
            new_r_squared >= other_squared,
            AmmError::InvalidInvariant
        );

        let new_target_squared = new_r_squared
            .checked_sub(other_squared)
            .ok_or(AmmError::Overflow)?;

        let new_target = integer_sqrt(new_target_squared);

        require!(new_target > target, AmmError::NoSharesToMint);

        let shares_out = new_target.checked_sub(target).ok_or(AmmError::Overflow)?;

        u128_to_u64(shares_out)
    }

    /// Calculate collateral to release when a trader sells YES or NO
    /// virtual shares back to the pool.
    ///
    /// Formula:
    ///
    /// new_target_supply = old_target_supply - shares_to_burn
    /// new_R = sqrt(new_target_supply^2 + other_supply^2)
    /// collateral_out = old_R - new_R
    ///
    /// Arguments:
    /// - reserves: current private collateral reserves
    /// - target_supply: supply of the side being sold
    /// - other_supply: supply of the opposite side
    /// - shares_to_burn: trader shares sold
    pub fn get_reserves_to_release(
        reserves: u64,
        target_supply: u64,
        other_supply: u64,
        shares_to_burn: u64,
    ) -> Result<u64> {
        require!(reserves > 0, AmmError::InvalidReserves);
        require!(shares_to_burn > 0, AmmError::InvalidAmount);
        require!(
            shares_to_burn <= target_supply,
            AmmError::InsufficientShares
        );

        let r = reserves as u128;
        let target = target_supply as u128;
        let other = other_supply as u128;
        let burn = shares_to_burn as u128;

        let new_target = target.checked_sub(burn).ok_or(AmmError::Overflow)?;

        let new_target_squared = checked_square(new_target)?;
        let other_squared = checked_square(other)?;

        let new_r_squared = new_target_squared
            .checked_add(other_squared)
            .ok_or(AmmError::Overflow)?;

        let new_r = integer_sqrt(new_r_squared);

        require!(r > new_r, AmmError::NoCollateralToRelease);

        let collateral_out = r.checked_sub(new_r).ok_or(AmmError::Overflow)?;

        u128_to_u64(collateral_out)
    }

    /// Return the current side price in basis points.
    ///
    /// price_bps = target_supply / reserves * 10_000
    ///
    /// 10_000 = 1.0
    /// 7_071  ≈ 0.7071
    pub fn get_price_bps(
        reserves: u64,
        target_supply: u64,
        _other_supply: u64,
    ) -> Result<u64> {
        require!(reserves > 0, AmmError::InvalidReserves);

        let numerator = (target_supply as u128)
            .checked_mul(10_000)
            .ok_or(AmmError::Overflow)?;

        let price = numerator
            .checked_div(reserves as u128)
            .ok_or(AmmError::DivisionByZero)?;

        u128_to_u64(price)
    }

    /// Compute proportional payout after market resolution.
    ///
    /// payout = user_winning_shares / total_winning_shares * reserves
    ///
    /// Used during settlement:
    /// - YES wins: user_winning_shares = user's YES shares
    /// - NO wins: user_winning_shares = user's NO shares
    pub fn proportional_payout(
        user_winning_shares: u64,
        total_winning_shares: u64,
        reserves: u64,
    ) -> Result<u64> {
        require!(reserves > 0, AmmError::InvalidReserves);
        require!(total_winning_shares > 0, AmmError::TotalWinningSharesZero);

        if user_winning_shares == 0 {
            return Ok(0);
        }

        let payout = (user_winning_shares as u128)
            .checked_mul(reserves as u128)
            .ok_or(AmmError::Overflow)?
            .checked_div(total_winning_shares as u128)
            .ok_or(AmmError::DivisionByZero)?;

        u128_to_u64(payout)
    }

    /// Validate that the market state is close to the Pythagorean invariant.
    ///
    /// Because integer square roots round down, exact equality is not always
    /// expected. This function allows a small caller-defined tolerance.
    pub fn validate_invariant(
        reserves: u64,
        yes_supply: u64,
        no_supply: u64,
        max_tolerance: u64,
    ) -> Result<()> {
        require!(reserves > 0, AmmError::InvalidReserves);

        let yes_squared = checked_square(yes_supply as u128)?;
        let no_squared = checked_square(no_supply as u128)?;

        let implied_r_squared = yes_squared
            .checked_add(no_squared)
            .ok_or(AmmError::Overflow)?;

        let implied_r = integer_sqrt(implied_r_squared);
        let reserves_u128 = reserves as u128;

        let diff = abs_diff_u128(implied_r, reserves_u128);

        require!(diff <= max_tolerance as u128, AmmError::InvalidInvariant);

        Ok(())
    }
}

/// Checked square for u128 values.
fn checked_square(value: u128) -> Result<u128> {
    value.checked_mul(value).ok_or(AmmError::Overflow.into())
}

/// Convert u128 to u64 safely.
fn u128_to_u64(value: u128) -> Result<u64> {
    require!(value <= u64::MAX as u128, AmmError::Overflow);
    Ok(value as u64)
}

/// Absolute difference between two u128 values.
fn abs_diff_u128(a: u128, b: u128) -> u128 {
    if a >= b { a - b } else { b - a }
}

/// Integer square root using Newton's method.
///
/// Returns floor(sqrt(x)).
fn integer_sqrt(x: u128) -> u128 {
    if x == 0 {
        return 0;
    }

    let mut z = x;
    let mut y = (x + 1) / 2;

    while y < z {
        z = y;
        y = (x / y + y) / 2;
    }

    z
}

#[error_code]
pub enum AmmError {
    #[msg("Invalid reserves")]
    InvalidReserves,

    #[msg("Invalid amount")]
    InvalidAmount,

    #[msg("Invalid bonding-curve invariant")]
    InvalidInvariant,

    #[msg("Arithmetic overflow")]
    Overflow,

    #[msg("Division by zero")]
    DivisionByZero,

    #[msg("No shares to mint")]
    NoSharesToMint,

    #[msg("No collateral to release")]
    NoCollateralToRelease,

    #[msg("Insufficient shares")]
    InsufficientShares,

    #[msg("Total winning shares cannot be zero")]
    TotalWinningSharesZero,
}
