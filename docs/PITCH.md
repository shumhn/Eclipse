# Eclipse Pitch

Private AMM prediction markets on Solana, powered by MagicBlock Ephemeral Rollups.

## Problem

Prediction markets need public prices, but they do not need to expose every trader's live position.

In normal on-chain markets, observers can often see:

- which side a wallet takes
- how much it trades
- how its position changes before resolution

That creates copy-trading, front-running, and social pressure around large or informed positions.

## Solution

Eclipse keeps the market itself public, while moving the active trading state into MagicBlock TEE/PER.

The result:

- public YES/NO odds for price discovery
- private trader side, virtual shares, and market-private balance during the active window
- final settlement committed back to Solana
- devnet USDC custody through the Solana vault

In one line:

```text
Public market odds, private trader positions.
```

## What We Built

### Frontend

- Next.js market browser and detail pages
- Phantom wallet integration
- Market creation flow with live MagicBlock/Pyth price feeds
- Private buy, sell, deposit, settle, and claim UI
- Fee preview for market creation and private AMM trading

### Backend

- Next.js API routes for market creation, trading, settlement, claims, and crank flows
- MagicBlock TEE/PER transaction preparation
- Market tracking and proof-signature display
- Keeper endpoints for expired price markets

### On-Chain

- Anchor prediction market program on Solana devnet
- Private virtual YES/NO AMM state
- Market-specific private trader positions
- Manual and MagicBlock/Pyth price resolution paths
- Aggregate protocol fee accrual and treasury withdrawal

## Revenue Model

- Fixed public market creation fee: `0.50 USDC`
- Private AMM buy/sell taker fee inside MagicBlock TEE/PER
- Individual side, size, shares, and per-trade fee are not emitted
- Only aggregate protocol fees per market are committed

## Stack

- Solana devnet
- Anchor
- MagicBlock Ephemeral Rollups / TEE RPC
- MagicBlock/Pyth price feeds
- Next.js
- Phantom React SDK
- Devnet USDC

## Demo Flow

1. Connect Phantom on devnet.
2. Create a crypto price market.
3. Delegate market/private state into MagicBlock.
4. Deposit into a market-private balance or use direct top-up plus trade.
5. Buy or sell YES/NO through the private AMM.
6. Resolve after the deadline from the configured price feed.
7. Settle and claim from the Solana vault.

## Honest Scope

Eclipse is a working devnet prototype, not a production deployment.

Current production work remaining:

- audits
- mainnet operations
- stronger oracle policy
- monitoring and alerting
- deeper adversarial testing

---

Built on Solana and MagicBlock.
