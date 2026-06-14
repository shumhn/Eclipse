# CORE Protocol Integration

This document explains how Eclipse integrates with CORE Protocol and the changes needed for native confidential token support.

## Current Architecture

### How CORE Works

CORE Protocol uses a GlobalConfig account that stores protocol-wide settings:

```rust
pub struct GlobalConfig {
    pub admin: Pubkey,
    pub collateral_token_mint: Pubkey,  // Single collateral token for all markets
    pub fee: u64,
    pub creator_fee: u64,
    // ...
}
```

When creating a market, there's a constraint:

```rust
#[account(
    constraint = collateral_token_mint.key() == global_config.collateral_token_mint
)]
pub collateral_token_mint: Box<InterfaceAccount<'info, Mint>>,
```

This means every market created through a CORE protocol instance must use the same collateral token.

### The Limitation

CORE's current design assumes:
1. One collateral token per protocol instance
2. All markets share this collateral token
3. Token must be a standard SPL token or Token-2022

For Eclipse, we need markets that use DAC (our confidential token) as collateral. We worked around this by:
1. Creating DAC as a standard SPL token (owned by Token Program)
2. Making our program's PDA the mint authority
3. Using CORE's SDK which appears to support custom base mints

However, this approach has limitations:
- DAC is just a standard SPL token with a custom wrapper program
- True confidential transfers require Token-2022 with ConfidentialTransfer extension
- CORE doesn't natively understand encrypted balances

## Proposed Changes

### Phase 1: Multi-Collateral Support

Modify GlobalConfig to support multiple collateral tokens:

```rust
pub struct GlobalConfig {
    pub admin: Pubkey,
    pub default_collateral_mint: Pubkey,
    pub approved_collateral_mints: Vec<Pubkey>,  // Allow multiple tokens
    // ...
}
```

Update the market creation constraint:

```rust
#[account(
    constraint = approved_collateral_mints.contains(&collateral_token_mint.key())
)]
pub collateral_token_mint: Box<InterfaceAccount<'info, Mint>>,
```

This allows protocol admins to whitelist multiple collateral tokens, including DAC.

### Phase 2: Token-2022 Confidential Transfer Support

Token-2022 includes a ConfidentialTransfer extension that enables encrypted balances natively. To support this:

1. Update token interface usage:

```rust
use anchor_spl::token_2022::{
    Token2022,
    spl_token_2022::extension::confidential_transfer,
};
```

2. Add instruction to transfer with confidential amounts:

```rust
pub fn transfer_confidential<'info>(
    ctx: Context<TransferConfidential>,
    new_decryptable_available_balance: AeCiphertext,
    proof_instruction_offset: i8,
) -> Result<()> {
    confidential_transfer::instruction::transfer(
        ctx.accounts.token_program.key,
        ctx.accounts.source.key,
        ctx.accounts.destination.key,
        ctx.accounts.mint.key,
        new_decryptable_available_balance,
        ctx.accounts.authority.key,
        &[],
        proof_instruction_offset,
    )?;
    Ok(())
}
```

3. Update market state to track encrypted reserves:

```rust
pub struct Market {
    pub id: u64,
    pub question: String,
    // ... existing fields

    // New fields for confidential markets
    pub is_confidential: bool,
    pub encrypted_reserves_handle: Option<[u8; 64]>,  // ElGamal ciphertext
    pub auditor_pubkey: Option<Pubkey>,  // For compliance/auditing
}
```

### Phase 3: Inco FHE Integration

For full FHE support (not just encrypted balances but encrypted computation), integrate with Inco Lightning:

```rust
use inco_lightning::cpi::{
    encrypt_value,
    add_encrypted,
    compare_encrypted,
};

pub fn place_confidential_bet<'info>(
    ctx: Context<PlaceConfidentialBet>,
    encrypted_amount_handle: u64,  // Inco handle reference
    side: bool,  // true = yes, false = no
) -> Result<()> {
    // Verify the encrypted amount is valid
    require!(
        inco_lightning::verify_handle(encrypted_amount_handle),
        ErrorCode::InvalidHandle
    );

    // Add to market's encrypted total
    let new_total = add_encrypted(
        ctx.accounts.inco_program.to_account_info(),
        ctx.accounts.market.encrypted_reserves_handle,
        encrypted_amount_handle,
    )?;

    ctx.accounts.market.encrypted_reserves_handle = new_total;

    Ok(())
}
```

## Integration Path

### What We Have Now

```
User USDC -> DAC Wrapper -> Standard SPL DAC -> CORE Market
```

The DAC token is a standard SPL token. Privacy comes from our wrapper program that tracks encrypted balances off-chain via Inco.

### What We Need

```
User USDC -> Confidential Token -> CORE Market (native support)
```

The market itself understands encrypted amounts and can perform operations without revealing values.

### Migration Steps

1. **CORE Program Update**
   - Add `approved_collateral_mints` array to GlobalConfig
   - Update constraints to allow any approved mint
   - Deploy updated program

2. **Confidential Token Support**
   - Add Token-2022 ConfidentialTransfer handling
   - Create new instructions for confidential transfers
   - Update market state for encrypted reserves

3. **Inco Integration**
   - Add CPI calls to Inco Lightning program
   - Implement encrypted arithmetic for market operations
   - Create audit/compliance mechanisms

## Code Locations

### CORE Protocol

Repository: `github.com/core-protocol/core_protocol_solana`

Key files:
- `programs/core_protocol_solana/src/state/global_config.rs` - Protocol configuration
- `programs/core_protocol_solana/src/instructions/create_market.rs` - Market creation
- `programs/core_protocol_solana/src/instructions/mint_decision_tokens.rs` - Trading

### Eclipse

Key files:
- `programs/dac-token/` - DAC token program
- `apps/api/src/services/darkMarkets.ts` - Dark Markets service
- `apps/api/src/services/inco.ts` - Inco integration

## Timeline

This integration requires coordination with the CORE team:

1. **Short Term**: Use DAC as standard SPL token (current approach)
2. **Medium Term**: CORE adds multi-collateral support
3. **Long Term**: Native confidential transfer and FHE integration

## References

- [Token-2022 Confidential Transfers](https://spl.solana.com/token-2022/extensions#confidential-transfer)
- [Inco Network Documentation](https://docs.inco.org/)
- [CORE Protocol](https://github.com/core-protocol/core_protocol_solana)
