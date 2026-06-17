# Eclipse Architecture, In Plain English

Eclipse is a private prediction market on Solana. People can create YES/NO markets, trade during a fixed time window, and get paid after the market resolves.

The important idea is simple:

```text
Solana holds the money and final proof.
MagicBlock runs the fast private trading window.
The crank closes expired markets and settles them.
```

This document explains how the app works end to end without assuming deep blockchain knowledge.

## What Eclipse Is

Eclipse is not just a crypto price betting app. It is a private prediction market system.

That means it can support questions like:

```text
Will BTC be above $70,000 at 6:00 PM?
Will SOL close above $180 tomorrow?
Will a team win a match before Sunday?
Will a proposal pass by the deadline?
```

Some markets can resolve automatically from price data. Other markets can be resolved manually by the configured resolver.

## The Problem

Normal onchain prediction markets reveal too much while the market is still active.

If every trade is public immediately, other people can see:

- who traded
- how much they traded
- whether they bought YES or NO
- whether a large wallet is taking a strong position

That creates copy-trading, front-running, and insider-style behavior. Instead of predicting the event, people start watching wallets.

Eclipse tries to improve that by keeping live position details hidden during the active market window, then revealing only the final settlement result after the market closes.

## The Main Pieces

### 1. The Web App

The web app is the product people use in the browser.

It lets users:

- browse markets
- create markets
- see live price data
- choose YES or NO
- sign transactions with their wallet
- see when trading is closed
- settle and claim after resolution

The app lives in:

```text
app
```

### 2. The Solana Program

The Solana program is the rules engine. It defines what a valid market is, who can resolve it, how money is escrowed, and how winners are paid.

The program lives in:

```text
programs/prediction_market
```

The deployed devnet program is:

```text
79RQQN3A4HHrogrBTwUw5py8UMhhyKFFb1CmVGagZ55t
```

Solana is used for:

- creating the public market shell
- holding USDC collateral in the market vault
- storing the market deadline and question
- storing the final resolved outcome
- allowing settled users to claim from the vault

### 3. MagicBlock

MagicBlock is used for the active private execution window.

In normal words, MagicBlock is like a fast private room where the market runs while trading is live. Solana still anchors the market and money, but MagicBlock handles the private trading state while the market is open.

The app uses MagicBlock Ephemeral Rollups for:

- delegated market accounts
- delegated trader position accounts
- private YES/NO position state
- fast private prediction transactions
- resolution and settlement before committing final state back

The MagicBlock endpoints used by the app are:

```text
https://devnet-tee.magicblock.app
https://devnet.magicblock.app
```

### 4. Price Feeds

For automated price markets, the app uses MagicBlock/Pyth price feeds.

Current supported assets are:

```text
BTC
ETH
SOL
JUP
```

The feed registry lives in:

```text
app/src/lib/priceFeeds.ts
```

The app shows live prices in the creation UI so the creator can choose a realistic target price and deadline.

### 5. The Crank

Blockchains do not automatically wake up and run code when a timer ends. Something outside has to call the program after the deadline.

That outside runner is called the crank.

In Eclipse, the crank:

- scans for expired markets
- resolves price markets
- settles trader positions after resolution
- keeps markets from getting stuck after the deadline

The main crank endpoint is:

```text
app/src/app/api/crank/run/route.ts
```

The hosted runners are:

- Cloudflare Worker every minute
- GitHub Actions backup every five minutes
- Vercel cron as an additional scheduled trigger

## End-to-End Market Flow

## Step 1: Create Market

A creator chooses:

- question
- deadline
- initial liquidity
- resolution type
- price target if it is a price market

For a manual market, the question can be any clear YES/NO event.

For a price market, the question is tied to one of the known MagicBlock/Pyth feeds.

Example:

```text
Will SOL be above $180 by Jun 20, 2026 at 5:00 PM?
```

When the market is created, Solana creates:

- the market account
- the creator position account
- the private position account
- the USDC vault

The vault is important because it holds the actual collateral.

## Step 2: Delegate Into MagicBlock

After creation, the app delegates the market and position accounts into MagicBlock.

Delegation means:

```text
Solana account exists first.
Then that account is handed to MagicBlock for fast private execution.
Later the final result can be committed back.
```

This is how the app gets both:

- Solana custody and settlement
- MagicBlock private live execution

## Step 3: Initialize Private State

After delegation, the app initializes private state inside MagicBlock.

This private state tracks:

- idle collateral
- YES shares
- NO shares
- whether the position has settled

During live trading, this is the sensitive part. It should not be exposed like a normal public onchain order book.

## Step 4: Trade Privately

While the market is active, users can deposit collateral and choose YES or NO.

The public app can show that a market exists and that trading is active, but the exact live private position details are not meant to be shown publicly.

The private trade instruction intentionally does not emit the trade side or amount in the public event.

In simple terms:

```text
People can trade, but observers should not get a clean live map of who bought what.
```

## Step 5: Trading Closes At The Deadline

Each market has an end time.

After that time:

- new trades should stop
- the market waits for resolution
- the crank or resolver can resolve it

For price markets, the correct product behavior is to use the price around the market close time, not a random later price.

The codebase now includes a close-time price settlement path using Pyth benchmark data. The devnet Solana program must be redeployed before the live deployed program can use that new instruction.

## Step 6: Resolve The Market

There are two resolution paths.

### Manual Market

The configured resolver decides YES or NO after the deadline.

This is for real-world events that cannot be safely auto-resolved from a price feed.

### Price Market

The crank resolves the market from the configured MagicBlock/Pyth feed.

The rule is:

```text
If direction is Above:
YES wins when observed price is greater than or equal to target price.

If direction is Below:
YES wins when observed price is lower than target price.
```

Example:

```text
Market: Will SOL be above $180 at close?
Close price: $184
Outcome: YES wins
```

## Step 7: Settle Positions

After the market has an outcome, each trader position can be settled.

Settlement calculates:

- unused collateral
- winning shares
- final payout

Then it writes the claimable amount into the public position shell.

This is the privacy boundary:

```text
Before settlement: live YES/NO exposure should stay private.
After settlement: the final claimable amount becomes public so the user can claim.
```

## Step 8: Claim

After settlement, the user can claim from the Solana vault.

The claim is a normal Solana token transfer from the market vault to the user.

## How Money Moves

Money does not live inside the frontend.

The flow is:

```text
User wallet
  -> deposits devnet USDC
  -> market vault on Solana holds collateral
  -> MagicBlock tracks private live positions
  -> resolver settles outcome
  -> Solana vault pays claimable amount
```

The server helps build transactions, but users still sign their wallet actions.

## What Is Public And What Is Private

## Public

These are visible by design:

- market question
- market deadline
- market creator
- market vault
- collateral mint
- final outcome
- final claimable amount after settlement
- final claim transaction

## Private During Active Trading

These are intended to stay hidden during the active market window:

- exact YES/NO side for each live trade
- exact live trade amount
- live private shares
- live private position state

## Why MagicBlock Matters Here

Without MagicBlock, the app would have to put every trade directly on normal Solana state. That would make live positions easy to inspect.

With MagicBlock, the app can:

- create normal Solana accounts
- move active market execution into a fast rollup
- hide sensitive live position state during the trading window
- commit the final result back to Solana after the market closes

That is the core architecture.

## The Crank In Plain English

The crank is a robot that checks:

```text
Did any market expire?
If yes, can it be resolved?
If resolved, can positions be settled?
```

The current setup uses:

```text
Cloudflare Worker -> Vercel crank API -> Solana/MagicBlock transactions
GitHub Actions -> Vercel crank API -> backup runner
Vercel cron -> additional scheduled trigger
```

Cloudflare is the main free runner. GitHub Actions is the backup so one hosted service failing does not leave markets stuck.

## Product Architecture Diagram

```text
User Wallet
   |
   v
Next.js Web App on Vercel
   |
   |-- Solana devnet
   |     - market shell
   |     - USDC vault
   |     - final state
   |     - payout claim
   |
   |-- MagicBlock Ephemeral Rollup
   |     - delegated market account
   |     - delegated position account
   |     - private live trading
   |     - settlement execution
   |
   |-- Price Data
   |     - MagicBlock/Pyth live feeds
   |     - Pyth benchmark close-time data
   |
   |-- Crank Runners
         - Cloudflare every minute
         - GitHub Actions backup
         - Vercel cron
```

## Important Code Paths

```text
programs/prediction_market/src/lib.rs
```

Main Solana program entrypoint.

```text
programs/prediction_market/src/instructions/create_private_market.rs
```

Creates manual and price markets.

```text
programs/prediction_market/src/instructions/delegate.rs
```

Delegates market and position accounts into MagicBlock.

```text
programs/prediction_market/src/instructions/private_rollup.rs
```

Runs private trading, resolution, and settlement inside MagicBlock.

```text
programs/prediction_market/src/instructions/private_position.rs
```

Handles deposits, withdrawals before delegation, and final claims.

```text
app/src/services/magicblock-indexer.ts
```

Main backend service that connects the app, Solana, MagicBlock, price feeds, and crank logic.

```text
app/src/app/api/crank/run/route.ts
```

Crank endpoint that resolves expired price markets and settles positions.

```text
workers/crank/src/index.ts
```

Cloudflare Worker that calls the crank endpoint.

## Short Summary

Eclipse creates private YES/NO prediction markets. Solana holds the collateral and final settlement state. MagicBlock runs the active market window so live positions are not exposed like a normal public market. When the deadline passes, the crank resolves the market, settles positions, and users can claim their payout from the Solana vault.
