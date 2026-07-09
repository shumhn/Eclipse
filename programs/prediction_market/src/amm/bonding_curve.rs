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
        let token_amount = integer_sqrt(r_squared.checked_div(2).ok_or(AmmError::DivisionByZero)?);

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

        require!(new_r_squared >= other_squared, AmmError::InvalidInvariant);

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

        // Selling is a withdrawal path, so round the remaining reserves up.
        // That rounds collateral_out down and prevents dust extraction loops.
        let new_r = integer_sqrt_ceil(new_r_squared);

        require!(r > new_r, AmmError::NoCollateralToRelease);

        let collateral_out = r.checked_sub(new_r).ok_or(AmmError::Overflow)?;

        u128_to_u64(collateral_out)
    }

    /// Return the current side probability/quote in basis points.
    ///
    /// price_bps = target_supply / (target_supply + other_supply) * 10_000
    ///
    /// 10_000 = 1.0
    /// 5_000  = 0.5
    pub fn get_price_bps(_reserves: u64, target_supply: u64, other_supply: u64) -> Result<u64> {
        let total_supply = target_supply
            .checked_add(other_supply)
            .ok_or(AmmError::Overflow)?;
        require!(total_supply > 0, AmmError::InvalidReserves);

        let numerator = (target_supply as u128)
            .checked_mul(10_000)
            .ok_or(AmmError::Overflow)?;

        let price = numerator
            .checked_div(total_supply as u128)
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

#[cfg(test)]
mod tests {
    use super::*;

    const USDC: u64 = 1_000_000;

    #[test]
    fn balanced_initial_pool_quotes_fifty_fifty() {
        let reserves = 100 * USDC;
        let supply = PythagoreanCurve::initial_balanced_supply(reserves).unwrap();

        let yes_price = PythagoreanCurve::get_price_bps(reserves, supply, supply).unwrap();
        let no_price = PythagoreanCurve::get_price_bps(reserves, supply, supply).unwrap();

        assert_eq!(yes_price, 5_000);
        assert_eq!(no_price, 5_000);
    }

    #[test]
    fn buying_yes_mints_curve_shares_and_moves_quote() {
        let reserves = 100 * USDC;
        let yes_supply = PythagoreanCurve::initial_balanced_supply(reserves).unwrap();
        let no_supply = yes_supply;
        let collateral_in = 10 * USDC;

        let yes_shares =
            PythagoreanCurve::get_shares_to_mint(reserves, yes_supply, no_supply, collateral_in)
                .unwrap();

        assert!(yes_shares > 0);
        assert_ne!(yes_shares, collateral_in);

        let new_yes_supply = yes_supply + yes_shares;
        let yes_price =
            PythagoreanCurve::get_price_bps(reserves + collateral_in, new_yes_supply, no_supply)
                .unwrap();
        let no_price =
            PythagoreanCurve::get_price_bps(reserves + collateral_in, no_supply, new_yes_supply)
                .unwrap();

        assert!(yes_price > 5_000);
        assert!(no_price < 5_000);
        assert!(yes_price + no_price >= 9_999);
        assert!(yes_price + no_price <= 10_000);
    }

    #[test]
    fn selling_yes_releases_collateral_and_moves_quote_back() {
        let reserves = 100 * USDC;
        let yes_supply = PythagoreanCurve::initial_balanced_supply(reserves).unwrap();
        let no_supply = yes_supply;
        let collateral_in = 10 * USDC;

        let yes_shares =
            PythagoreanCurve::get_shares_to_mint(reserves, yes_supply, no_supply, collateral_in)
                .unwrap();
        let bought_reserves = reserves + collateral_in;
        let bought_yes_supply = yes_supply + yes_shares;
        let sell_shares = yes_shares / 2;

        let collateral_out = PythagoreanCurve::get_reserves_to_release(
            bought_reserves,
            bought_yes_supply,
            no_supply,
            sell_shares,
        )
        .unwrap();

        assert!(collateral_out > 0);
        assert!(collateral_out < collateral_in);

        let new_yes_supply = bought_yes_supply - sell_shares;
        let new_reserves = bought_reserves - collateral_out;
        let yes_price =
            PythagoreanCurve::get_price_bps(new_reserves, new_yes_supply, no_supply).unwrap();
        let bought_yes_price =
            PythagoreanCurve::get_price_bps(bought_reserves, bought_yes_supply, no_supply).unwrap();

        assert!(yes_price < bought_yes_price);
        PythagoreanCurve::validate_invariant(new_reserves, new_yes_supply, no_supply, 1).unwrap();
    }

    #[test]
    fn buy_then_sell_same_shares_does_not_overpay() {
        let reserves = 100 * USDC;
        let yes_supply = PythagoreanCurve::initial_balanced_supply(reserves).unwrap();
        let no_supply = yes_supply;

        for collateral_in in [USDC, 5 * USDC, 10 * USDC, 25 * USDC] {
            let shares = PythagoreanCurve::get_shares_to_mint(
                reserves,
                yes_supply,
                no_supply,
                collateral_in,
            )
            .unwrap();
            let collateral_out = PythagoreanCurve::get_reserves_to_release(
                reserves + collateral_in,
                yes_supply + shares,
                no_supply,
                shares,
            )
            .unwrap();

            assert!(
                collateral_out <= collateral_in,
                "sell-back should not release more collateral than the matching buy paid"
            );
        }
    }

    #[test]
    fn proportional_payout_never_exceeds_reserves() {
        let reserves = 125 * USDC;
        let winner_a_shares = 25 * USDC;
        let winner_b_shares = 75 * USDC;
        let total_winning_shares = winner_a_shares + winner_b_shares;

        let payout_a =
            PythagoreanCurve::proportional_payout(winner_a_shares, total_winning_shares, reserves)
                .unwrap();
        let payout_b =
            PythagoreanCurve::proportional_payout(winner_b_shares, total_winning_shares, reserves)
                .unwrap();

        assert!(payout_a + payout_b <= reserves);
        assert_eq!(payout_a, 31_250_000);
        assert_eq!(payout_b, 93_750_000);
    }

    #[test]
    fn creator_liquidity_covers_one_sided_markets() {
        let initial_reserves = USDC;
        let creator_yes = PythagoreanCurve::initial_balanced_supply(initial_reserves).unwrap();
        let creator_no = creator_yes;

        let alice_yes =
            PythagoreanCurve::get_shares_to_mint(initial_reserves, creator_yes, creator_no, USDC)
                .unwrap();
        let reserves_after_alice = initial_reserves + USDC;
        let yes_after_alice = creator_yes + alice_yes;

        let bob_yes = PythagoreanCurve::get_shares_to_mint(
            reserves_after_alice,
            yes_after_alice,
            creator_no,
            USDC,
        )
        .unwrap();
        let final_reserves = reserves_after_alice + USDC;
        let final_yes_supply = yes_after_alice + bob_yes;

        let creator_payout_if_yes =
            PythagoreanCurve::proportional_payout(creator_yes, final_yes_supply, final_reserves)
                .unwrap();
        let alice_payout =
            PythagoreanCurve::proportional_payout(alice_yes, final_yes_supply, final_reserves)
                .unwrap();
        let bob_payout =
            PythagoreanCurve::proportional_payout(bob_yes, final_yes_supply, final_reserves)
                .unwrap();

        assert!(creator_payout_if_yes > 0);
        assert!(alice_payout > USDC);
        assert!(bob_payout > USDC);
        assert!(creator_payout_if_yes + alice_payout + bob_payout <= final_reserves);

        let creator_payout_if_no =
            PythagoreanCurve::proportional_payout(creator_no, creator_no, final_reserves).unwrap();

        assert_eq!(creator_payout_if_no, final_reserves);
    }

    #[test]
    fn sell_idle_plus_winning_payout_does_not_exceed_vault() {
        let initial_reserves = 10 * USDC;
        let creator_yes = PythagoreanCurve::initial_balanced_supply(initial_reserves).unwrap();
        let creator_no = creator_yes;

        let alice_yes = PythagoreanCurve::get_shares_to_mint(
            initial_reserves,
            creator_yes,
            creator_no,
            5 * USDC,
        )
        .unwrap();
        let reserves_after_buy = initial_reserves + 5 * USDC;
        let yes_after_buy = creator_yes + alice_yes;

        let sell_shares = alice_yes / 2;
        let alice_idle = PythagoreanCurve::get_reserves_to_release(
            reserves_after_buy,
            yes_after_buy,
            creator_no,
            sell_shares,
        )
        .unwrap();
        let final_reserves = reserves_after_buy - alice_idle;
        let final_yes_supply = yes_after_buy - sell_shares;
        let alice_remaining_yes = alice_yes - sell_shares;

        let bob_no = PythagoreanCurve::get_shares_to_mint(
            final_reserves,
            creator_no,
            final_yes_supply,
            3 * USDC,
        )
        .unwrap();
        let final_reserves = final_reserves + 3 * USDC;
        let final_no_supply = creator_no + bob_no;
        let vault_balance = initial_reserves + 5 * USDC + 3 * USDC;

        let creator_yes_payout =
            PythagoreanCurve::proportional_payout(creator_yes, final_yes_supply, final_reserves)
                .unwrap();
        let alice_yes_payout = PythagoreanCurve::proportional_payout(
            alice_remaining_yes,
            final_yes_supply,
            final_reserves,
        )
        .unwrap()
            + alice_idle;
        assert!(creator_yes_payout + alice_yes_payout <= vault_balance);

        let creator_no_payout =
            PythagoreanCurve::proportional_payout(creator_no, final_no_supply, final_reserves)
                .unwrap();
        let bob_no_payout =
            PythagoreanCurve::proportional_payout(bob_no, final_no_supply, final_reserves).unwrap();
        assert!(creator_no_payout + bob_no_payout + alice_idle <= vault_balance);
    }
}

/// Absolute difference between two u128 values.
fn abs_diff_u128(a: u128, b: u128) -> u128 {
    if a >= b {
        a - b
    } else {
        b - a
    }
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

/// Integer square root rounded up.
fn integer_sqrt_ceil(x: u128) -> u128 {
    let floor = integer_sqrt(x);
    if floor.checked_mul(floor) == Some(x) {
        floor
    } else {
        floor + 1
    }
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
