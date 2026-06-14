# Architecture

This document explains how Eclipse provides privacy-preserving prediction markets on Solana.

## Overview

Eclipse has three main components:

1. DAC Token Program - An Anchor program that wraps USDC into encrypted confidential tokens
2. Web Frontend - A Next.js app where users interact with markets
3. API Backend - An Express server that handles market operations and privacy services

## Privacy Layer

### The Problem

In standard prediction markets, every bet is publicly visible on-chain. If you place a large bet, other traders see it immediately and can:
- Front-run your order
- Copy your strategy
- Move the price against you before you finish trading

### The Solution

Eclipse uses Inco Network's Fully Homomorphic Encryption (FHE) to encrypt bet amounts on-chain. Here's how it works:

1. User wants to bet 1000 USDC on YES
2. The 1000 USDC is wrapped into DAC (Eclipse Confidential) tokens
3. The DAC balance is stored as an encrypted handle on-chain
4. The bet is placed using DAC tokens
5. Other traders see that a bet occurred but cannot see the amount
6. When the market resolves, DAC is unwrapped back to USDC

## DAC Token Program

The DAC token is a custom SPL token built with Anchor that integrates with Inco Lightning for FHE operations.

### Accounts

**DacMint** - The mint authority for DAC tokens
- Stores the USDC mint it wraps
- Tracks total supply (encrypted)
- Controls the vault that holds USDC collateral

**DacAccount** - A user's DAC token account
- Stores encrypted balance as a handle (128-bit ciphertext reference)
- Linked to the user's public key
- Can only be decrypted by the owner

**Vault** - Holds the USDC collateral
- PDA controlled by the DAC program
- 1:1 backing - every DAC is backed by USDC in the vault

### Instructions

**deposit** - Wrap USDC to DAC
- Transfers USDC from user to vault
- Encrypts amount via Inco Lightning
- Adds encrypted amount to user's balance handle

**withdraw** - Unwrap DAC to USDC
- Decrypts user's balance (requires proof from Inco co-validator)
- Transfers USDC from vault to user
- Updates encrypted balance handle

**transfer** - Send DAC between accounts
- Subtracts from sender's encrypted balance
- Adds to receiver's encrypted balance
- Amount stays encrypted throughout

### Program Addresses

| Component | Address |
|-----------|---------|
| DAC Program | `ByaYNFzb2fPCkWLJCMEY4tdrfNqEAKAPJB3kDX86W5Rq` |
| DAC SPL Mint | `JBxiN5BBM8ottNaUUpWw6EFtpMRd6iTnmLYrhZB5ArMo` |
| Mint Authority PDA | `TtFoW2UtEqkVGiGtbwwnzMxyGk1JyneqeNGiZEhcDRJ` |

## Inco Integration

Inco Network provides the FHE infrastructure. We use two components:

### Inco Lightning Program
Address: `5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj`

This on-chain program handles:
- Creating encrypted values (CPI from DAC program)
- Arithmetic on encrypted values (add, subtract)
- Comparison operations (for balance checks)

### Inco Co-Validator
Endpoint: `https://grpc.solana-devnet.alpha.devnet.inco.org`

This off-chain service handles:
- Decryption requests (when users want to withdraw)
- Signature verification (proves the requester owns the data)
- Returns signed plaintext that can be verified on-chain

## Dark Markets

Dark Markets are prediction markets that use DAC as collateral instead of USDC.

### How They Differ from Regular Markets

| Aspect | Regular Market | Dark Market |
|--------|---------------|-------------|
| Collateral | USDC | DAC (encrypted) |
| Bet visibility | Public | Hidden |
| Position sizes | Anyone can see | Only owner knows |
| Market odds | Public | Public |

### User Flow

1. User has USDC in their wallet
2. User clicks "Bet YES" on a Dark Market
3. Behind the scenes:
   - USDC is wrapped to DAC (automatic)
   - DAC is used to buy YES tokens
   - The amount is encrypted
4. Other users see aggregate volume but not individual bets
5. When market resolves:
   - Winning DAC is unwrapped to USDC
   - User receives USDC directly

The user only needs to think about USDC. The DAC wrapping is abstracted away.

## Frontend Architecture

```
apps/web/
├── src/
│   ├── app/           # Next.js pages
│   │   ├── markets/   # Market listing and detail pages
│   │   ├── portfolio/ # User positions
│   │   ├── orderbook/ # Privacy-preserving order book
│   │   └── agent/     # AI agent interface
│   ├── components/    # React components
│   ├── lib/
│   │   ├── api.ts     # API client
│   │   ├── trading.ts # Trading utilities
│   │   └── dac/       # DAC token client
│   └── hooks/         # React hooks
```

### Key Flows

**Connecting Wallet**
- Uses @phantom/react-sdk for multi-chain support
- Fetches SOL, USDC, and DAC balances on connect
- DAC balance shown as encrypted handle (actual value hidden)

**Placing a Bet**
1. User selects market and amount
2. Frontend calls `/api/dark-markets/prepare-bet`
3. Server returns unsigned transaction
4. User signs with Phantom
5. Frontend submits signed transaction
6. Server broadcasts to Solana

**Viewing Positions**
- Positions stored in privacy-preserving order book
- User sees their own positions with commitment hashes
- Public view shows aggregate statistics only

## Backend Architecture

```
apps/api/
├── src/
│   ├── routes/
│   │   ├── markets.ts      # Market CRUD
│   │   ├── trading.ts      # Trade execution
│   │   ├── darkMarkets.ts  # Dark Market operations
│   │   ├── orderbook.ts    # Privacy order book
│   │   └── agent.ts        # AI market creation
│   ├── services/
│   │   ├── core.ts          # CORE SDK wrapper
│   │   ├── darkMarkets.ts  # DAC market service
│   │   ├── inco.ts         # Inco SDK wrapper
│   │   └── ai-provider.ts  # AI for market generation
│   └── index.ts            # Express app
```

### Client-Side Signing

The server never holds user private keys. The flow is:

1. Client requests unsigned transaction from server
2. Server builds transaction with correct accounts and data
3. Server returns base64-encoded transaction
4. Client deserializes and signs with Phantom
5. Client submits signed transaction
6. Server broadcasts to network

This keeps user funds secure even if the server is compromised.

## CORE Integration

CORE Protocol provides the prediction market infrastructure. We use:

- `COREClient` - SDK for market operations
- `fetchMarkets()` - Get all markets
- `fetchMarket(address)` - Get specific market
- `createMarket()` - Create new market with custom collateral
- `buyTokensUsdc()` - Purchase YES/NO tokens

For Dark Markets, we specify DAC mint as the `baseMint` parameter when creating markets.

## AI Agent

The AI agent scans news sources and creates prediction markets automatically.

### News Sources
- CoinDesk RSS
- CoinTelegraph
- Custom feeds

### Market Generation
1. Agent fetches recent news
2. Google Gemini analyzes for prediction-worthy events
3. Agent formats as yes/no question
4. Market created via CORE SDK

### Configuration
- Runs on scheduled intervals
- Can be triggered manually via API
- Markets tagged as "Eclipse" for tracking

## Security Considerations

**Private Key Handling**
- Server private key used only for market creation
- User private keys never touch the server
- All user trades are client-signed

**Encryption**
- FHE handles encrypted arithmetic
- Decryption requires co-validator signature
- Balance handles are 128-bit ciphertext references

**On-Chain Security**
- DAC program checks all authority signatures
- Vault controlled by PDA (not externally owned account)
- USDC fully collateralized at all times

## Limitations

**Current Constraints**
- Running on devnet only
- DAC program not audited
- Inco integration uses alpha co-validator endpoint
- CORE SDK limits transaction building flexibility

**Future Work**
- Mainnet deployment with audited contracts
- Full Inco SDK integration for decryption
- MEV protection for transaction submission
- Batch transaction support for multiple bets

## Documentation

The web app includes comprehensive documentation at `/docs`:

- **Getting Started** - Step-by-step guide to placing your first bet
- **How It Works** - Detailed explanation of FHE and the privacy layer
- **Architecture** - Technical overview of all components
- **Smart Contracts** - DAC program details and CORE integration
- **FAQ** - Common questions and answers

For CORE integration details and proposed changes for native confidential token support, see [docs/CORE_INTEGRATION.md](./docs/CORE_INTEGRATION.md).
