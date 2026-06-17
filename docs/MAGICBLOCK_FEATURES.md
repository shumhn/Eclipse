# Eclipse Features

This document lists what the current Eclipse codebase is built to do.

## Private Prediction Markets

Eclipse supports binary YES/NO markets.

Creators can make markets around:

- crypto prices
- time-based outcomes
- manually resolved events
- any clear YES/NO question with a deadline

The goal is not only crypto price betting. The goal is a private prediction market where active positions are protected during the trading window.

## MagicBlock Private Trading Window

Markets and positions are created on Solana first, then delegated into MagicBlock.

While a market is active, MagicBlock handles the live private state:

- trader collateral available for the market
- YES shares
- NO shares
- settlement status

The public event for a private trade intentionally avoids revealing the side and amount.

## Solana Escrow And Final Settlement

Solana is used for custody and final proof.

The Solana program handles:

- market creation
- vault creation
- collateral deposits
- final outcome storage
- final claimable payout
- vault claim transfer

This keeps the market anchored to Solana while MagicBlock handles the private active window.

## Manual YES/NO Markets

Manual markets can ask normal prediction-market questions.

Example:

```text
Will this proposal pass before Friday?
```

After the deadline, the configured resolver signs the final YES or NO outcome.

## Automated Price Markets

Automated price markets use MagicBlock/Pyth feed accounts.

Current supported assets:

```text
BTC
ETH
SOL
JUP
```

The creator chooses:

- asset
- above or below
- target price
- deadline

## Live Price UI

The create-market flow shows live price data for supported assets.

This helps creators choose realistic questions like:

```text
Will SOL be above $180 at 5:00 PM?
```

The UI also suggests target prices near the current live price.

## Crank-Based Resolution

Expired markets need an outside runner to close them.

The crank does that work:

- checks expired markets
- resolves automated price markets
- settles resolved positions
- prevents markets from staying stuck after the deadline

The current hosted crank setup uses Cloudflare Worker as the main runner and GitHub Actions as a backup.

## Wallet-Signed User Actions

For user actions, the app prepares transactions and the wallet signs them.

That means the app helps build the transaction, but the user wallet approves the action.

## Position Settlement

After a market resolves, positions can be settled.

Settlement turns private trading state into a final public claimable amount.

The claimable amount can include:

- unused collateral
- winning payout

After settlement, users can claim from the Solana vault.

## Devnet Deployment

The current app is a Solana devnet build.

Live app:

```text
https://eclipse-predict.vercel.app
```

Program ID:

```text
79RQQN3A4HHrogrBTwUw5py8UMhhyKFFb1CmVGagZ55t
```
