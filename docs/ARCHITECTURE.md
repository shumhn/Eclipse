# Architecture

This document explains the current Eclipse devnet architecture.

Eclipse is a private AMM prediction market on Solana. Solana anchors custody and settlement, while MagicBlock TEE/PER handles the active private trading window.

## Components

Eclipse has three main components:

1. **Anchor program** - creates markets, stores vaults, controls settlement, and exposes private AMM instructions.
2. **Next.js app** - user interface and API routes for creation, trading, settlement, claims, and keeper flows.
3. **MagicBlock TEE/PER** - delegated execution layer for private market and position state.

## Privacy Model

Eclipse does not hide the market itself. It hides user-level live trading details.

**Public by design:**

- market question
- market creator
- initial liquidity
- aggregate AMM odds and reserves
- final resolved outcome

**Private during active trading:**

- trader side
- trader virtual shares
- trader market-private balance
- exact per-wallet exposure

This keeps price discovery public while reducing copy-trading and front-running of individual positions.

## Market State

Each market stores a public shell on Solana and a delegated private state in MagicBlock.

Core AMM fields:

- `live_reserves`
- `live_yes_supply`
- `live_no_supply`
- `final_reserves`
- `protocol_fees_accrued`

The UI computes odds from aggregate virtual supply:

```text
yes_price = yes_supply / (yes_supply + no_supply)
no_price  = no_supply  / (yes_supply + no_supply)
```

Winning virtual shares split resolved AMM reserves proportionally. One share is not a fixed one-dollar claim.

## User Flow

1. User connects Phantom on devnet.
2. User creates or opens a market.
3. App prepares a wallet-signed market creation or trading transaction.
4. Market and position state are delegated into MagicBlock.
5. User deposits into a market-private balance or uses direct top-up plus trade.
6. User buys or sells YES/NO through the private AMM.
7. After expiry, the market resolves.
8. Position is settled and committed back.
9. User claims USDC from the Solana vault.

## Frontend Architecture

```text
app/src
├── app/                    # Next.js App Router pages and API routes
│   ├── markets/            # Market listing and detail pages
│   ├── portfolio/          # Wallet-specific positions
│   └── api/                # Creation, trading, oracle, crank, and claim routes
├── components/             # React components
├── lib/                    # API client, trading helpers, price feeds
├── services/               # MagicBlock/Solana service layer
└── hooks/                  # Live price feed hooks
```

## Program Architecture

```text
programs/prediction_market/src
├── instructions/
│   ├── create_private_market.rs
│   ├── private_position.rs
│   ├── private_rollup.rs
│   ├── delegate.rs
│   └── initialize.rs
├── state/
│   ├── market.rs
│   ├── position.rs
│   ├── private_state.rs
│   └── config.rs
└── amm/
    └── bonding_curve.rs
```

## Creation Path

Market creation is wallet-signed.

1. `POST /api/markets/prepare-create`
2. Wallet signs and sends the Solana transaction.
3. `POST /api/markets/finalize`
4. App delegates market and private state into MagicBlock.
5. App records proof signatures for the UI.

Market creation charges a public fixed fee to the protocol treasury.

## Private Trading Path

Private trading is wallet-signed.

1. Wallet obtains a MagicBlock TEE auth token.
2. App prepares funding/top-up if market-private balance is too low.
3. App prepares a private buy or sell transaction.
4. Wallet signs and sends to MagicBlock TEE/PER.
5. App refreshes private position and aggregate AMM odds.

Private trading charges an uncertainty-weighted taker fee inside the PER path. Only aggregate fee accrual is committed.

## Resolution

Eclipse supports two resolution modes:

- **Manual resolver** - configured resolver/admin commits the final YES/NO outcome.
- **MagicBlock/Pyth price market** - crank compares the observed close-window price against the market target.

For `above` price markets:

```text
YES if observed_price >= target_price
NO otherwise
```

For `below` markets, the comparison is inverted.

## Keeper / Crank

The crank endpoints live in:

```text
app/src/app/api/crank
```

They handle:

- resolving expired price markets
- settling resolved positions when possible
- keeping devnet markets moving through the lifecycle

## Security Considerations

- User private keys never touch the server.
- Wallet signs base-layer and PER transactions directly.
- Public events do not emit individual private trade side, size, shares, or per-trade fee.
- Slippage protection is enforced for private buy/sell preparation.
- Protocol fees accrue as aggregate market-level accounting.

## Limitations

- Devnet only.
- Not audited.
- Aggregate AMM odds remain visible by design.
- Funding/top-up movements can reveal collateral movement.
- Sparse markets may allow approximate inference from aggregate odds movement.
- Production rollout needs stronger oracle policy, monitoring, and operational hardening.

---

Current architecture: Solana custody and settlement, MagicBlock private execution, public AMM odds, private trader positions.
