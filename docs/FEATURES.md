# Features

A list of what Eclipse currently does.

## Private AMM Markets

Eclipse creates binary YES/NO prediction markets with a private active trading layer.

**What it does:**

- Creates devnet USDC-backed prediction markets.
- Seeds each market with initial liquidity.
- Uses virtual YES/NO AMM shares instead of public outcome token mints during active trading.
- Keeps aggregate odds visible for price discovery.

## MagicBlock Private Trading

Active trading runs through MagicBlock TEE/PER.

**Hidden during the active window:**

- trader side
- trader virtual shares
- trader market-private balance
- exact per-wallet exposure

**Still public or inferable:**

- market existence
- initial liquidity
- funding/top-up movements
- aggregate AMM odds and reserves

## Buy, Sell, Deposit

Users can manage a market-specific private balance.

**Supported actions:**

- deposit USDC into a market-private balance
- buy YES or NO from that private balance
- use direct top-up plus trade when balance is too low
- sell YES or NO shares back into the AMM

## Fees

Eclipse has a protocol revenue model.

**Supported fees:**

- public `0.50 USDC` market creation fee
- uncertainty-weighted private AMM taker fee on buys and sells
- aggregate protocol fee accrual per market
- admin treasury withdrawal for accrued protocol fees

Individual trade side, size, shares, and per-trade fee are not emitted.

## Price Markets

Automated crypto price markets use MagicBlock/Pyth feeds.

**Supported assets:**

- BTC
- ETH
- SOL
- JUP

Price markets resolve against the observed close-window price after the deadline.

## Manual Markets

Manual markets can still be resolved by the configured resolver/admin path.

This is useful for devnet demos and clear YES/NO events that do not yet have an automated oracle policy.

## Wallet Integration

Phantom wallet support is built into the app.

**What it does:**

- connects Solana wallet accounts
- signs base-layer Solana transactions
- signs MagicBlock TEE/PER transactions
- requests MagicBlock auth tokens for private RPC access
- links to devnet faucets and explorers

## Market Browser

Browse and search prediction markets.

**Filters:**

- All
- Active
- Resolved
- Asset filters for supported crypto markets

**Display:**

- market question
- YES/NO odds
- live or resolved status
- asset and target price context

## Portfolio And Claims

Users can inspect their own private market positions after connecting a wallet.

**Supported flow:**

- view market-specific position
- settle after resolution
- commit the settled position state
- claim USDC from the Solana vault

## API

The app uses Next.js API routes.

**Main API groups:**

- `/api/markets`
- `/api/markets/prepare-create`
- `/api/markets/finalize`
- `/api/markets/withdraw-fees`
- `/api/trading/prepare-private`
- `/api/trading/prepare-sell`
- `/api/trading/prepare-settle`
- `/api/trading/prepare-claim`
- `/api/crank/run`
- `/api/oracles/price-feeds`

## Network Support

Running on Solana devnet.

**Configured:**

- Solana devnet RPC
- MagicBlock devnet TEE/PER RPC
- Devnet USDC mint
- deployed prediction market program

---

Experimental devnet build. Not audited. Do not use with real funds.
