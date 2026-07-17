# Confidential Prediction Markets on Solana: Integrating Inco Lightning with CORE Exchange

> Archived research note: this file captures an earlier Inco/CORE/FHE exploration. The current Eclipse implementation uses MagicBlock TEE/PER and a custom Anchor private AMM program. See `README.md` and `docs/ARCHITECTURE.md` for the current shipped devnet architecture.

## Abstract

This document presents a technical analysis and architectural proposal for implementing privacy-preserving prediction markets on Solana. We examine three distinct approaches for integrating Inco Lightning's encrypted computation primitives with CORE Exchange's prediction market infrastructure. The goal is to enable traders to place positions without revealing their trading amounts, wallet identities, or aggregate market sentiment until resolution. We provide concrete implementation paths, evaluate tradeoffs, and propose a phased development roadmap.

---

## Table of Contents

1. [Background and Motivation](#1-background-and-motivation)
2. [Current State of Technology](#2-current-state-of-technology)
3. [Problem Statement](#3-problem-statement)
4. [Technical Architecture Options](#4-technical-architecture-options)
5. [Recommended Approach: Privacy Wrapper Architecture](#5-recommended-approach-privacy-wrapper-architecture)
6. [Implementation Specification](#6-implementation-specification)
7. [Security Analysis](#7-security-analysis)
8. [Performance Considerations](#8-performance-considerations)
9. [Future Extensions](#9-future-extensions)
10. [Conclusion](#10-conclusion)
11. [References](#11-references)

---

## 1. Background and Motivation

### 1.1 The Transparency Problem in Prediction Markets

Prediction markets are valuable mechanisms for aggregating distributed knowledge and forecasting future events. On blockchain platforms, these markets benefit from censorship resistance, global accessibility, and trustless settlement. However, the same transparency that enables trust creates significant problems:

**Front-running and MEV extraction.** When a trader submits a large order, validators and searchers can observe the pending transaction and place their own orders first. This extracts value from the original trader and degrades market efficiency.

**Whale tracking.** Observers can identify large wallet addresses and track their positions across markets. This allows others to copy strategies without contributing to price discovery. It also exposes traders to targeted attacks or social pressure.

**Market manipulation through sentiment visibility.** When current YES/NO token distributions are visible, manipulators can create false signals by making conspicuous trades, then exit when others follow.

**Privacy loss for participants.** Users may wish to express beliefs about sensitive topics (political outcomes, corporate events, regulatory decisions) without those beliefs being permanently associated with their wallet address.

### 1.2 Why Inco Lightning

Inco Lightning is a covalidator network that enables encrypted computation on Solana. Unlike homomorphic encryption schemes that operate entirely on-chain (which would be prohibitively expensive), Inco uses a threshold network to store encrypted data off-chain while allowing Solana programs to operate on handles that reference this data.

Key properties relevant to prediction markets:

1. **Encrypted arithmetic.** Addition, subtraction, multiplication, and comparison operations on encrypted values without decryption.

2. **Conditional selection.** The `e_select` operation chooses between two encrypted values based on an encrypted boolean condition. This enables branching logic without revealing which branch was taken.

3. **Access control.** The `allow` function grants specific addresses permission to decrypt specific handles. This enables selective disclosure.

4. **Attestation.** The covalidator network signs decryption results, allowing on-chain verification of revealed values.

### 1.3 CORE Exchange Overview

CORE Exchange is a Solana-based prediction market protocol with the following architecture:

**V2 AMM Markets.** Automated market makers where initial liquidity is split between YES and NO token pools. Prices are determined algorithmically based on pool ratios.

**P2P Markets.** Peer-to-peer markets where creators take a position on one side and other traders can take the opposite position.

**Custom Oracles.** Market creators can designate a specific wallet address as the settlement authority, bypassing CORE's AI-powered resolution system.

**Token Structure.** Each market has three tokens: a collateral token (typically USDC), a YES outcome token, and a NO outcome token. At resolution, winning tokens can be redeemed for collateral.

---

## 2. Current State of Technology

### 2.1 Inco Lightning Primitives

The Inco Lightning SDK provides the following core types and operations:

```rust
// Encrypted types (handles to off-chain encrypted data)
pub struct Euint128(pub u128);  // Encrypted unsigned 128-bit integer
pub struct Ebool(pub u128);     // Encrypted boolean

// Input functions
new_euint128(ctx, ciphertext, type) -> Euint128  // From client-encrypted data
as_euint128(ctx, plaintext) -> Euint128          // From known plaintext

// Arithmetic operations
e_add(ctx, a, b, scalar) -> Euint128   // Encrypted addition
e_sub(ctx, a, b, scalar) -> Euint128   // Encrypted subtraction
e_mul(ctx, a, b, scalar) -> Euint128   // Encrypted multiplication

// Comparison operations
e_eq(ctx, a, b, scalar) -> Ebool       // Encrypted equality
e_ge(ctx, a, b, scalar) -> Ebool       // Encrypted greater-than-or-equal
e_lt(ctx, a, b, scalar) -> Ebool       // Encrypted less-than

// Control flow
e_select(ctx, condition, if_true, if_false, scalar) -> Euint128

// Access control
allow(ctx, handle, grant, owner) -> ()
is_allowed(ctx, handle) -> bool

// Attestation
is_validsignature(ctx, sig_count, handles, plaintexts) -> Vec<Result>
```

### 2.2 CORE Market Structure

A CORE market account contains:

```typescript
interface MarketType {
  creator: Pubkey;             // Market creator address
  question: string;            // Market question text
  end_time: bigint;            // Resolution deadline (Unix timestamp)
  resolved: boolean;           // Whether outcome has been determined
  winning_token_id: string;    // 'yes' or 'no' after resolution
  resolvable: boolean;         // Whether market can be resolved
  yes_token_mint: Pubkey;      // YES outcome token mint
  no_token_mint: Pubkey;       // NO outcome token mint
  collateral_token: Pubkey;    // Collateral token mint (e.g., USDC)
}
```

Trading operations interact with:
- The market account
- AMM pool accounts (for V2 markets)
- User token accounts for collateral and outcome tokens
- Global configuration account

### 2.3 Solana Confidential Transfers

Solana's Token-2022 program includes a Confidential Transfer extension using ElGamal encryption and zero-knowledge proofs. This is conceptually relevant but currently disabled for security audit. The approach differs from Inco:

- Solana's system encrypts data client-side and stores ciphertext on-chain
- Operations require ZK proofs generated client-side
- Computation happens on-chain with encrypted data

Inco's approach:
- Client encrypts data which is stored off-chain by covalidators
- On-chain programs work with handles (references to encrypted data)
- Computation happens in the covalidator network via CPI calls
- Lower transaction size and compute requirements

---

## 3. Problem Statement

We seek to implement prediction markets where:

1. **Position amounts are hidden.** Neither the total amount nor individual position sizes should be visible until a user chooses to reveal them.

2. **Wallet linkage is minimized.** It should not be trivial to associate positions with wallet addresses by analyzing on-chain data.

3. **Market integrity is maintained.** Despite hidden amounts, the market must correctly track total positions and enable accurate settlement.

4. **Settlement is trustless.** Winners must be able to claim their winnings without trusting a third party, with cryptographic proof of their entitled amount.

5. **Integration with existing infrastructure is feasible.** The solution should work with or alongside CORE Exchange's existing protocol, not require a complete rewrite.

---

## 4. Technical Architecture Options

### 4.1 Option A: Native Protocol Modification

**Approach:** Modify CORE Exchange's on-chain program to replace all balance storage with Inco encrypted types.

```rust
// Modified CORE market account
#[account]
pub struct ConfidentialMarket {
    pub creator: Pubkey,
    pub question: String,
    pub end_time: i64,
    pub resolved: bool,
    pub winning_token_id: u8,

    // Encrypted aggregate positions
    pub total_yes_amount: Euint128,   // Previously: plaintext u64
    pub total_no_amount: Euint128,    // Previously: plaintext u64

    // Encrypted pool state for AMM
    pub yes_pool_balance: Euint128,
    pub no_pool_balance: Euint128,
}
```

**Advantages:**
- Most complete privacy protection
- Single protocol to maintain
- Cleanest user experience

**Disadvantages:**
- Requires forking and maintaining CORE codebase
- Breaking change for existing markets
- Complex upgrade path
- May conflict with CORE team's roadmap

**Assessment:** Not recommended for hackathon timeline. Could be proposed to CORE team as future feature.

### 4.2 Option B: Wrapper Protocol (Recommended)

**Approach:** Build a separate program that wraps CORE markets with a privacy layer. Users deposit into the wrapper, which manages encrypted positions and interacts with CORE on behalf of users.

```
User -> ConfidentialWrapper -> CORE Market
         ^                        ^
         |                        |
    Encrypted positions      Standard CORE
    Masked wallet identity   operations
```

**Advantages:**
- Works with existing CORE markets
- No modifications to CORE protocol required
- Can be developed and deployed independently
- Incremental adoption possible

**Disadvantages:**
- Additional program complexity
- Users interact with wrapper, not CORE directly
- Some operations require coordination between programs

**Assessment:** Recommended approach. Balances privacy goals with practical implementation constraints.

### 4.3 Option C: Client-Side Privacy with Stealth Addresses

**Approach:** Keep CORE markets unchanged. Implement privacy at the client layer using stealth addresses and encrypted off-chain order book.

```
User generates stealth address per trade
    -> Trades appear as unrelated addresses on-chain
    -> Off-chain service tracks mapping (encrypted)
    -> User proves ownership at settlement
```

**Advantages:**
- No on-chain program changes
- Works with any Solana market protocol
- Lower development complexity

**Disadvantages:**
- Amounts still visible on-chain
- Requires off-chain infrastructure
- Stealth address management complexity
- Less robust privacy guarantees

**Assessment:** Useful as complementary technique. Insufficient as primary solution.

---

## 5. Recommended Approach: Privacy Wrapper Architecture

### 5.1 Overview

The Confidential Market Wrapper (CMW) is a Solana program that provides privacy-preserving access to CORE markets. It maintains encrypted position records and manages interactions with underlying CORE markets.

```
                    +------------------------+
                    |  Confidential Market   |
                    |       Wrapper (CMW)    |
                    +------------------------+
                    |                        |
                    |  - Encrypted positions |
                    |  - Masked identities   |
                    |  - Settlement proofs   |
                    |                        |
                    +-----------+------------+
                                |
                    +-----------v------------+
                    |     CORE Exchange       |
                    |       Markets          |
                    +------------------------+
                    |                        |
                    |  - YES/NO tokens       |
                    |  - AMM pools           |
                    |  - Settlement          |
                    |                        |
                    +------------------------+
```

### 5.2 Core Data Structures

```rust
use inco_lightning::types::{Euint128, Ebool};

/// Wrapped market linking to underlying CORE market
#[account]
pub struct WrappedMarket {
    /// Underlying CORE market address
    pub core_market: Pubkey,

    /// Wrapper authority PDA
    pub authority: Pubkey,
    pub authority_bump: u8,

    /// Encrypted aggregate positions (for privacy-preserved sentiment)
    pub encrypted_yes_total: Euint128,
    pub encrypted_no_total: Euint128,

    /// Position counter (public, for indexing)
    pub position_count: u64,

    /// Market state
    pub is_active: bool,
    pub is_settled: bool,
    pub winning_side: Option<bool>,  // None until settled, Some(true)=YES, Some(false)=NO
}

/// Individual position in a wrapped market
#[account]
pub struct ConfidentialPosition {
    /// Associated wrapped market
    pub wrapped_market: Pubkey,

    /// Position owner
    pub owner: Pubkey,

    /// Encrypted position amount
    pub encrypted_amount: Euint128,

    /// Position side (YES=true, NO=false)
    /// This could also be encrypted for maximum privacy
    pub side: bool,

    /// Whether position has been claimed after settlement
    pub claimed: bool,

    /// Position index (for PDA derivation)
    pub index: u64,

    /// Bump seed for PDA
    pub bump: u8,
}
```

### 5.3 Instruction Flow

#### 5.3.1 Wrapping a CORE Market

```rust
pub fn wrap_market(
    ctx: Context<WrapMarket>,
    core_market: Pubkey,
) -> Result<()> {
    // Verify CORE market exists and is active
    // Initialize WrappedMarket account
    // Create wrapper authority PDA
    // Initialize encrypted totals to encrypted zero
}
```

#### 5.3.2 Opening a Confidential Position

```rust
/// remaining_accounts:
///   [0] position_allowance_pda (mut)
///   [1] owner_address (readonly)
pub fn open_position<'info>(
    ctx: Context<'_, '_, '_, 'info, OpenPosition<'info>>,
    side: bool,                    // YES or NO
    encrypted_amount: Vec<u8>,     // Client-encrypted amount
) -> Result<()> {
    let inco = ctx.accounts.inco_lightning_program.to_account_info();
    let signer = ctx.accounts.authority.to_account_info();

    // 1. Create encrypted handle from client ciphertext
    let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
    let amount_handle: Euint128 = new_euint128(cpi_ctx, encrypted_amount, 0)?;

    // 2. Transfer collateral from user to wrapper vault
    // (Standard SPL token transfer - amount is public here)
    // This could be enhanced with stealth addresses for more privacy

    // 3. Update encrypted market totals
    let market = &mut ctx.accounts.wrapped_market;
    if side {
        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        market.encrypted_yes_total = e_add(cpi_ctx, market.encrypted_yes_total, amount_handle, 0)?;
    } else {
        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        market.encrypted_no_total = e_add(cpi_ctx, market.encrypted_no_total, amount_handle, 0)?;
    }

    // 4. Store encrypted position
    let position = &mut ctx.accounts.position;
    position.wrapped_market = market.key();
    position.owner = ctx.accounts.owner.key();
    position.encrypted_amount = amount_handle;
    position.side = side;
    position.claimed = false;
    position.index = market.position_count;

    market.position_count += 1;

    // 5. Grant decryption access to owner
    if ctx.remaining_accounts.len() >= 2 {
        let cpi_ctx = CpiContext::new(
            inco.clone(),
            Allow {
                allowance_account: ctx.remaining_accounts[0].clone(),
                signer: signer.clone(),
                allowed_address: ctx.remaining_accounts[1].clone(),
                system_program: ctx.accounts.system_program.to_account_info(),
            }
        );
        allow(cpi_ctx, amount_handle.0, true, ctx.accounts.owner.key())?;
    }

    Ok(())
}
```

#### 5.3.3 Executing Batch Trade on CORE

The wrapper periodically batches positions and executes trades on the underlying CORE market. This provides additional privacy by aggregating multiple user positions into single market operations.

```rust
pub fn execute_batch_trade(
    ctx: Context<ExecuteBatchTrade>,
) -> Result<()> {
    // 1. Decrypt aggregated totals (requires threshold of covalidators)
    // 2. Calculate net position to execute on CORE
    // 3. Execute trade via CPI to CORE program
    // 4. Update internal accounting

    // Note: Batch execution reveals aggregate amounts, not individual positions
}
```

#### 5.3.4 Claiming Winnings After Settlement

```rust
/// remaining_accounts:
///   Ed25519 signature instruction data (for attestation verification)
pub fn claim_winnings<'info>(
    ctx: Context<'_, '_, '_, 'info, ClaimWinnings<'info>>,
    decrypted_amount: Vec<u8>,    // Claimed plaintext amount
    handle_bytes: Vec<u8>,         // Position handle as bytes
) -> Result<()> {
    let market = &ctx.accounts.wrapped_market;
    let position = &mut ctx.accounts.position;

    // 1. Verify market is settled
    require!(market.is_settled, ErrorCode::MarketNotSettled);
    require!(!position.claimed, ErrorCode::AlreadyClaimed);

    // 2. Verify position is on winning side
    let winning_side = market.winning_side.ok_or(ErrorCode::InvalidState)?;
    require!(position.side == winning_side, ErrorCode::NotWinner);

    // 3. Verify decryption via Ed25519 signature attestation
    let cpi_ctx = CpiContext::new(
        ctx.accounts.inco_lightning_program.to_account_info(),
        VerifySignature {
            instructions: ctx.accounts.instructions.to_account_info(),
            signer: ctx.accounts.authority.to_account_info(),
        },
    );

    is_validsignature(
        cpi_ctx,
        1,                          // Expected signature count
        Some(vec![handle_bytes]),   // Handle being verified
        Some(vec![decrypted_amount.clone()]), // Claimed plaintext
    )?;

    // 4. Parse verified amount and transfer winnings
    let amount = parse_amount(&decrypted_amount)?;
    require!(amount > 0, ErrorCode::ZeroAmount);

    // Transfer from vault to winner
    // ...

    position.claimed = true;

    Ok(())
}
```

---

## 6. Implementation Specification

### 6.1 Program Architecture

```
confidential-core-wrapper/
├── programs/
│   └── confidential-wrapper/
│       ├── src/
│       │   ├── lib.rs              # Program entrypoint
│       │   ├── instructions/
│       │   │   ├── mod.rs
│       │   │   ├── wrap_market.rs
│       │   │   ├── open_position.rs
│       │   │   ├── close_position.rs
│       │   │   ├── execute_batch.rs
│       │   │   ├── settle_market.rs
│       │   │   └── claim_winnings.rs
│       │   ├── state/
│       │   │   ├── mod.rs
│       │   │   ├── wrapped_market.rs
│       │   │   └── position.rs
│       │   ├── errors.rs
│       │   └── utils.rs
│       └── Cargo.toml
├── tests/
│   └── confidential-wrapper.ts
└── Anchor.toml
```

### 6.2 Dependencies

```toml
[dependencies]
anchor-lang = { version = "0.31.1", features = ["init-if-needed"] }
anchor-spl = "0.31.1"
inco-lightning = { version = "0.1.4", features = ["cpi"] }
```

### 6.3 PDA Seeds

| Account | Seeds |
|---------|-------|
| WrappedMarket | `["wrapped_market", core_market_pubkey]` |
| WrapperAuthority | `["authority", wrapped_market_pubkey]` |
| ConfidentialPosition | `["position", wrapped_market_pubkey, owner_pubkey, position_index]` |
| PositionVault | `["vault", wrapped_market_pubkey]` |

### 6.4 Client SDK Integration

```typescript
import { encryptValue } from '@inco/solana-sdk/encryption';
import { decrypt } from '@inco/solana-sdk/attested-decrypt';
import { hexToBuffer, handleToBuffer, plaintextToBuffer } from '@inco/solana-sdk/utils';

// Open a confidential position
async function openConfidentialPosition(
  program: Program,
  market: PublicKey,
  side: 'yes' | 'no',
  amount: bigint,
  wallet: Keypair,
) {
  // 1. Encrypt amount client-side
  const encryptedAmount = await encryptValue(amount);

  // 2. Derive position PDA
  const positionIndex = await getNextPositionIndex(market);
  const [positionPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('position'),
      market.toBuffer(),
      wallet.publicKey.toBuffer(),
      new BN(positionIndex).toArrayLike(Buffer, 'le', 8),
    ],
    program.programId
  );

  // 3. Build transaction
  // First simulate to get handle for allowance PDA
  const simTx = await program.methods
    .openPosition(side === 'yes', hexToBuffer(encryptedAmount))
    .accounts({
      wrappedMarket: market,
      position: positionPda,
      owner: wallet.publicKey,
      // ... other accounts
    })
    .transaction();

  // Simulate and extract handle
  const handle = await getHandleFromSimulation(simTx);
  const [allowancePda] = deriveAllowancePda(handle, wallet.publicKey);

  // 4. Execute with allowance accounts
  const signature = await program.methods
    .openPosition(side === 'yes', hexToBuffer(encryptedAmount))
    .accounts({
      wrappedMarket: market,
      position: positionPda,
      owner: wallet.publicKey,
      // ... other accounts
    })
    .remainingAccounts([
      { pubkey: allowancePda, isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: false, isWritable: false },
    ])
    .rpc();

  return { signature, positionPda, positionIndex };
}

// Claim winnings with attestation
async function claimWinnings(
  program: Program,
  position: PublicKey,
  wallet: Keypair,
) {
  // 1. Fetch position and extract handle
  const positionAccount = await program.account.confidentialPosition.fetch(position);
  const handle = positionAccount.encryptedAmount.toString();

  // 2. Decrypt with attestation
  const result = await decrypt([handle], {
    address: wallet.publicKey,
    signMessage: async (msg) => nacl.sign.detached(msg, wallet.secretKey),
  });

  const plaintext = result.plaintexts[0];
  const ed25519Instructions = result.ed25519Instructions;

  // 3. Build claim transaction with Ed25519 verification
  const claimIx = await program.methods
    .claimWinnings(
      handleToBuffer(handle),
      plaintextToBuffer(plaintext)
    )
    .accounts({
      position,
      owner: wallet.publicKey,
      instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      // ... other accounts
    })
    .instruction();

  // 4. Build transaction with Ed25519 instructions first
  const tx = new Transaction();
  ed25519Instructions.forEach(ix => tx.add(ix));
  tx.add(claimIx);

  // 5. Execute
  const signature = await sendAndConfirmTransaction(connection, tx, [wallet]);

  return { signature, claimedAmount: BigInt(plaintext) };
}
```

---

## 7. Security Analysis

### 7.1 Threat Model

**Adversary capabilities:**
- Full visibility into on-chain transactions and state
- Ability to submit transactions and observe ordering
- Limited ability to coordinate with validators (no >1/3 stake assumption)

**Out of scope:**
- Covalidator network compromise (>t of n threshold)
- Side-channel attacks on client devices
- Social engineering

### 7.2 Privacy Properties

**Position amount privacy.** Individual position amounts are stored as Inco handles. The underlying plaintext values are held by the covalidator network and only accessible to:
- The position owner (via `allow` grant)
- The program during settlement (via attestation verification)

**Wallet linkage.** Position accounts are PDAs derived from owner address. This creates linkage. Mitigation options:
- Use fresh wallet addresses per position
- Implement stealth address scheme (future enhancement)
- Use relayer for transaction submission

**Aggregate visibility.** The encrypted totals (`encrypted_yes_total`, `encrypted_no_total`) leak aggregate market sentiment when batch trades are executed. This is a deliberate tradeoff: complete aggregate hiding would require more complex protocols.

### 7.3 Attack Vectors and Mitigations

| Attack | Description | Mitigation |
|--------|-------------|------------|
| Replay of claimed positions | Attacker resubmits claim transaction | `claimed` flag prevents double-claiming |
| Forged attestation | Attacker creates fake decryption proof | Ed25519 signature verification against covalidator keys |
| Front-running batch execution | MEV extraction on aggregate trades | Commit-reveal scheme for batch parameters (future) |
| Timing analysis | Correlating deposits with position opens | Add random delay, batch multiple operations |
| Amount inference from gas | Transaction size reveals amount size | Use constant-size encrypted payloads |

### 7.4 Trust Assumptions

1. **Inco covalidator threshold.** Security depends on honest majority of covalidators. If t+1 of n collude, they can decrypt all encrypted values.

2. **CORE market integrity.** The underlying CORE market must function correctly. The wrapper inherits any bugs or vulnerabilities in CORE.

3. **Oracle correctness.** Settlement depends on correct oracle resolution. Custom oracles should be trusted entities.

---

## 8. Performance Considerations

### 8.1 Transaction Size

Inco encrypted inputs (ciphertext) are larger than plaintext values. Typical sizes:
- Plaintext u64 amount: 8 bytes
- Inco encrypted ciphertext: ~200-400 bytes
- Impact: Higher transaction fees, but within Solana limits

### 8.2 Compute Units

Inco CPI operations consume compute units for cross-program invocation and signature verification:
- `new_euint128`: ~5,000 CU
- `e_add`: ~10,000 CU
- `allow`: ~15,000 CU
- `is_validsignature`: ~20,000 CU

Total for `open_position`: ~50,000-80,000 CU (well within 200,000 default limit)

### 8.3 Latency

- Handle creation: Near-instant (deterministic from input)
- Decryption: Requires covalidator network round-trip (~1-3 seconds)
- Settlement claims: Include Ed25519 verification (~minimal additional latency)

### 8.4 Scalability

Position storage: Each position requires ~256 bytes of account space. At 1M positions, storage cost would be approximately 1.79 SOL (at current rent-exempt minimums).

Batch execution can aggregate unlimited positions into single CORE trades, bounded only by compute limits of the batch transaction.

---

## 9. Future Extensions

### 9.1 Native CORE Integration

Present this architecture to CORE team as a proposal for native confidential markets. Benefits:
- Eliminates wrapper overhead
- Better UX with single protocol
- Option flag: `confidential: bool` on market creation

### 9.2 Stealth Address Enhancement

Implement stealth address scheme for position accounts:
```
User generates master viewing key
Per-position: derive one-time address
Positions unlinked to master identity on-chain
User scans for positions using viewing key
```

### 9.3 Aggregate Hiding

Use encrypted AMM state where pool ratios are also encrypted:
- More complex: price discovery requires encrypted computation
- Higher gas costs
- Research needed on encrypted AMM algorithms

### 9.4 Cross-Market Privacy

Enable positions across multiple markets without linking wallet:
- Unified privacy pool
- Zero-knowledge proofs of market membership
- Significantly more complex cryptography

### 9.5 Mobile Wallet Integration

Optimize client SDK for mobile wallets:
- Encryption in secure enclave
- Reduced network round-trips
- Push notifications for position status

---

## 10. Conclusion

This document presents a practical architecture for confidential prediction markets on Solana using Inco Lightning's encrypted computation primitives. The recommended wrapper approach provides meaningful privacy improvements while remaining compatible with existing CORE Exchange infrastructure.

Key contributions:
1. Analysis of three architectural options with tradeoffs
2. Detailed specification of wrapper program structure
3. Client SDK integration patterns for encrypted operations
4. Security analysis covering major threat vectors
5. Roadmap for future privacy enhancements

The wrapper architecture can be implemented within a hackathon timeline while providing a foundation for more comprehensive privacy features. Position amounts remain encrypted throughout the trading lifecycle, with attestation-based verification enabling trustless settlement.

Privacy in prediction markets is not merely a nice-to-have feature. It addresses fundamental economic problems: front-running destroys market efficiency, whale tracking discourages participation, and permanent transaction records create chilling effects on controversial markets. The architecture presented here takes a significant step toward addressing these problems while maintaining the transparency and trustlessness that make blockchain-based markets valuable.

---

## 11. References

1. Inco Lightning Documentation. https://docs.inco.org/svm

2. CORE Exchange SDK Documentation. https://docs.core.exchange

3. Solana Token-2022 Confidential Transfers. https://www.solana-program.com/docs/confidential-balances/overview

4. Anchor Framework Documentation. https://www.anchor-lang.com/docs

5. Inco Lightning Solana SDK. https://github.com/Inco-fhevm/lightning-rod-solana

6. Private Raffle Example. https://github.com/Inco-fhevm/raffle-example-solana

7. Solana Program Library. https://github.com/solana-labs/solana-program-library

---

## Appendix A: Account Sizes

| Account | Size (bytes) | Rent-exempt minimum (SOL) |
|---------|--------------|---------------------------|
| WrappedMarket | 200 | 0.00203928 |
| ConfidentialPosition | 160 | 0.00168960 |
| Allowance PDA | 40 | 0.00089088 |

## Appendix B: Error Codes

```rust
#[error_code]
pub enum ConfidentialWrapperError {
    #[msg("Market is not yet settled")]
    MarketNotSettled,

    #[msg("Position has already been claimed")]
    AlreadyClaimed,

    #[msg("Position is not on winning side")]
    NotWinner,

    #[msg("Invalid market state")]
    InvalidState,

    #[msg("Claimed amount is zero")]
    ZeroAmount,

    #[msg("Attestation verification failed")]
    AttestationFailed,

    #[msg("Unauthorized operation")]
    Unauthorized,

    #[msg("Market is not active")]
    MarketNotActive,

    #[msg("Position side mismatch")]
    SideMismatch,
}
```

## Appendix C: Environment Configuration

```bash
# Co-validator public key for encryption
SERVER_PUBLIC_KEY=0486ca2bbf34bea44c6043f23ebc5b67ca7ccefc3710498385ecc161460a1f8729db2a361cb0d7f40847a99a75572bc10e36a365218f4bae450dc61348330bb717

# Co-validator endpoint for decryption requests
COVALIDATOR_ENDPOINT=https://grpc.solana-devnet.alpha.devnet.inco.org

# Solana cluster
RPC_URL=https://api.devnet.solana.com

# Inco Lightning Program ID
INCO_LIGHTNING_PROGRAM_ID=5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj
```

---

*Document prepared for CORE Exchange Privacy Track submission. January 2026.*
