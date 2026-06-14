# Features

A list of what Eclipse does.

## Dark Markets

Markets that use DAC (encrypted) tokens as collateral.

**What it does:**
- Creates prediction markets where bet amounts are hidden
- Uses Inco FHE to encrypt position sizes on-chain
- Shows aggregate market data without revealing individual bets

**How to use:**
- Go to Markets page
- Click "Eclipse" filter
- Select a market and place your bet
- Your USDC is auto-wrapped to DAC

## DAC Token (Eclipse Confidential)

A custom SPL token with encrypted balances.

**What it does:**
- Wraps USDC into privacy-preserving tokens
- Stores balances as encrypted handles using Inco Lightning
- Allows transfers without revealing amounts
- 1:1 backed by USDC in vault

**Addresses (Devnet):**
- Program: `ByaYNFzb2fPCkWLJCMEY4tdrfNqEAKAPJB3kDX86W5Rq`
- Mint: `4UNGxzRPHLeDtuNYDMm4oJGGLpyYZz4rKeLmdiqenL9x`
- Vault: `HF76kBeLpciBeCrpZvEBxbG6FGZNifUmCumFaVZBFVTk`

## Privacy-Preserving Order Book

An order book that shows activity without revealing individual positions.

**What it does:**
- Stores encrypted positions off-chain
- Shows aggregate statistics (total volume, position count)
- Generates commitment hashes for position verification
- Keeps individual bet sizes private

**What you see:**
- Number of YES positions
- Number of NO positions
- Estimated probability
- Recent activity (timestamps only, no amounts)

## Client-Side Signing

Users sign their own transactions. Server never holds private keys.

**What it does:**
- Server builds unsigned transactions
- Returns base64-encoded transaction data
- User signs with Phantom
- User submits signed transaction

**Why it matters:**
- Your funds are safe even if our server is compromised
- You control your keys at all times

## Auto-Wrapping

USDC to DAC conversion happens automatically when betting.

**What it does:**
- Detects when you are betting on a Dark Market
- Wraps your USDC to DAC in the same transaction
- No extra steps needed

**User experience:**
- You only think about USDC
- We handle the DAC conversion
- One signature, done

## Wallet Integration

Phantom wallet support with balance display.

**What it does:**
- Connects via @phantom/react-sdk
- Shows SOL balance
- Shows USDC balance
- Shows DAC account status
- Links to devnet faucets

**DAC balance display:**
- Shows encrypted handle (not actual amount)
- Indicates if DAC account exists
- Balance is private - only you know the real value

## AI Agent

Creates prediction markets from news automatically.

**What it does:**
- Scans crypto news feeds
- Identifies prediction-worthy events
- Generates yes/no questions
- Creates markets via CORE SDK

**News sources:**
- CoinDesk
- CoinTelegraph
- Custom RSS feeds

**Powered by:**
- Google Gemini

## Market Browser

Browse and search prediction markets.

**Filters:**
- All: Every market
- Active: Not yet resolved, not expired
- Eclipse: DAC-collateralized markets
- Resolved: Markets that have ended

**Search:**
- Search by market question text

**Display:**
- Market question
- Current YES/NO prices
- Time remaining
- Liquidity

## Position Tracking

Track your encrypted positions.

**Portfolio page shows:**
- Your positions (by commitment hash)
- Position status (pending, active, settled)
- Encrypted amount (handle only)
- Market information

**You can:**
- Verify position exists via commitment hash
- View settlement outcome
- Track winnings

## Market Detail Page

View full market information and place bets.

**Shows:**
- Market question
- Current prices
- Price history chart
- Order placement form
- Market metadata

**Actions:**
- Place YES bet
- Place NO bet
- View on Solana Explorer

## API

Full REST API for all operations.

**Market endpoints:**
- GET /api/markets - List markets
- GET /api/markets/:id - Get market
- POST /api/markets/create - Create market

**Dark Markets:**
- GET /api/dark-markets - List Dark Markets
- POST /api/dark-markets/prepare-bet - Prepare bet transaction

**Trading:**
- POST /api/trading/prepare - Prepare transaction
- POST /api/trading/submit - Submit signed transaction

**Order Book:**
- POST /api/orderbook/submit - Submit position
- GET /api/orderbook/stats - Get statistics
- GET /api/orderbook/activity - Get activity feed

## Network Support

Running on Solana devnet.

**Configured:**
- Solana devnet RPC
- Devnet USDC mint
- Devnet DAC program
- Inco devnet co-validator

**Faucets:**
- SOL: https://faucet.solana.com
- USDC: https://spl-token-faucet.com

---

All features are experimental. Not audited. Devnet only.
