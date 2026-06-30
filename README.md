# Eclipse

Private AMM prediction markets on Solana, powered by MagicBlock Ephemeral Rollups.

Eclipse is a devnet prediction market prototype where Solana holds the public market shell, collateral vaults, and final settlement state, while MagicBlock's TEE-backed Ephemeral Rollup executes the active trading lifecycle. Traders buy virtual YES/NO AMM shares during the market window; individual wallet positions are kept in delegated private state, and final outcomes are committed back to Solana after resolution.

Live app: https://eclipse-predict.vercel.app<br>
Program ID: `79RQQN3A4HHrogrBTwUw5py8UMhhyKFFb1CmVGagZ55t`<br>
Network: Solana devnet<br>
Collateral mint: Devnet USDC `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`

---

## What Eclipse Does

Eclipse lets users create and trade binary YES/NO markets with a privacy-preserving live trading layer.

- Create private binary prediction markets.
- Create automated crypto price markets for `BTC`, `ETH`, `SOL`, and `JUP`.
- Resolve price markets from MagicBlock/Pyth price feeds.
- Support manually resolved YES/NO markets.
- Seed each market with initial USDC liquidity.
- Delegate market and position accounts into MagicBlock.
- Buy and sell through a virtual AMM instead of public YES/NO token mints.
- Fund a market-specific private position before trading, or use the direct top-up plus trade flow.
- Keep individual side, shares, and position state inside TEE/PER while the market is active.
- Keep aggregate AMM odds visible for price discovery.
- Settle winners after resolution and claim USDC from the Solana vault.

This is a devnet build, not a production deployment.

---

## Demo Pitch

Eclipse is built around one simple idea: prediction markets need public price
discovery, but they do not need to expose every trader's live position.

The demo shows:

- instant YES/NO trading through a private virtual AMM
- market odds that stay public and refresh as aggregate state changes
- user side, shares, and private balance kept inside MagicBlock TEE/PER state
- oracle-style crypto price markets that can resolve after the deadline
- final settlement and claim flow back through the Solana collateral vault

In one line:

```text
Public market odds, private trader positions.
```

---

## Privacy Model

The short version:

```text
Public odds, private positions.
```

Eclipse does not try to hide the existence of a market, the oracle price, or the aggregate AMM odds. Those are public by design so users can price trades.

What is private during the active window:

- a wallet's YES/NO side
- a wallet's virtual shares
- a wallet's private position balance
- the final per-wallet claim until settlement writes the claimable amount back

What remains visible or inferable:

- the market account exists on Solana
- market creation and initial liquidity are visible
- funding/top-up transactions can reveal collateral moved into a market
- aggregate AMM reserves and YES/NO supply are visible so the UI can show odds
- if only one trader moves a market between refreshes, observers may infer approximate side/size from the aggregate odds movement

This is why the honest pitch is:

> Eclipse hides user-level position and order-flow details inside MagicBlock TEE state while keeping aggregate market prices visible for discovery and settlement.

---

## How The AMM Works

Each market has a virtual YES/NO AMM state:

- `live_reserves`
- `live_yes_supply`
- `live_no_supply`

The app displays odds from aggregate virtual supply:

```text
yes_price = yes_supply / (yes_supply + no_supply)
no_price  = no_supply  / (yes_supply + no_supply)
```

When a user buys YES or NO, the program mints virtual shares inside the private position state and updates the aggregate market state. No public YES/NO SPL outcome tokens are minted during active trading.

When a user sells YES or NO, the program burns private virtual shares, releases USDC back into that user's market-private balance, and updates the aggregate AMM state.

One winning virtual share is a claim on the final market reserves. The frontend quote shows:

- average price
- estimated shares
- projected payout if the selected side resolves correctly
- estimated USDC received when selling shares

---

## Market Lifecycle

### 1. Create

A user creates a binary market with:

- question
- resolution timestamp
- initial USDC liquidity
- resolution mode
- optional price target, direction, and feed

Price market example:

```text
Will BTC be above $64,811 on Jun 22, 2026, 12:02 PM?
```

### 2. Delegate

The app delegates the market shell and private state into MagicBlock. Solana remains the base layer for custody and settlement, while the active trading state runs in the Ephemeral Rollup.

### 3. Fund Position

Each market has a market-specific private position balance. A user can:

- deposit into the market first, then trade from that private balance
- or use the direct flow that tops up and trades in one path

Wallet-level Shielded USDC and market-specific private position balance are separate.

### 4. Trade

Users buy or sell YES/NO while the market is active. Trades are submitted to the MagicBlock TEE/PER RPC. Public trade events intentionally do not reveal side, amount, or per-wallet share data.

### 5. Resolve

After the deadline:

- manual markets are resolved by the configured resolver/admin path
- price markets resolve by comparing the close-time MagicBlock/Pyth price against the target

For `above` markets:

```text
YES if observed_price >= target_price
NO otherwise
```

For `below` markets, the comparison is inverted.

### 6. Settle And Claim

After resolution, the position is settled and claimable USDC can be committed back to the public position shell. The user then claims from the Solana vault.

---

## Architecture

```text
Browser / Wallet
   |
   v
Next.js app
   |
   |-- Solana devnet RPC
   |     - market shell PDAs
   |     - collateral vaults
   |     - public creation/funding/final settlement
   |
   |-- MagicBlock TEE / Ephemeral RPC
   |     - delegated market state
   |     - delegated private position state
   |     - active YES/NO trade execution
   |
   |-- Price feeds
         - MagicBlock/Pyth live feeds
         - Hermes/Pyth fallback for UI display
```

Important program path:

```text
programs/prediction_market
```

Important app paths:

```text
app/src/components/CreateMarketModal.tsx
app/src/components/TradePanel.tsx
app/src/components/MarketCard.tsx
app/src/components/PriceChart.tsx
app/src/lib/api.ts
app/src/lib/priceFeeds.ts
app/src/services/magicblock-indexer.ts
app/src/app/api/markets/prepare-create/route.ts
app/src/app/api/markets/finalize/route.ts
app/src/app/api/trading/prepare-funds/route.ts
app/src/app/api/trading/prepare-private/route.ts
app/src/app/api/positions/route.ts
app/src/app/api/crank/run/route.ts
```

---

## Program Instructions

The Anchor program exposes the full lifecycle:

- `initialize` - initialize protocol config.
- `set_protocol_paused` - pause or unpause protocol actions.
- `update_oracle` - update the configured oracle/resolver authority.
- `update_tee_validator` - update the MagicBlock/PER validator identity.
- `update_collateral_mint` - update the collateral mint used by newly created markets.
- `create_private_market` - create a manual private prediction market.
- `create_price_market` - create a MagicBlock/Pyth price market.
- `open_position` - create a trader position shell.
- `deposit_collateral` - deposit USDC into the market vault before private activation.
- `create_position_topup_receipt` - fund an already delegated private position through a receipt.
- `withdraw_collateral` - withdraw idle L1 collateral before PER activation.
- `create_market_permission` - create the MagicBlock permission account for a market.
- `create_position_permission` - create the MagicBlock permission account for a position shell.
- `create_private_position_permission` - create the MagicBlock permission account for private position state.
- `create_topup_receipt_permission` - create the MagicBlock permission account for a top-up receipt.
- `delegate_market_into_tee` - delegate market state into MagicBlock.
- `delegate_position_into_tee` - delegate public trader position shell.
- `delegate_private_position_into_tee` - delegate private position state.
- `delegate_topup_receipt_into_tee` - delegate a top-up receipt for private consumption.
- `commit_market` / `commit_and_undelegate` - commit market state back to Solana.
- `commit_position` / `commit_position_and_undelegate` - commit settled position state back to Solana.
- `initialize_private_market_state` - initialize delegated AMM state.
- `initialize_private_position_state` - initialize delegated private trader state.
- `place_private_prediction` - place a private YES/NO trade from available private balance.
- `sell_private_prediction` - sell private YES/NO shares back to the AMM.
- `consume_position_topup_receipt_er` - consume a delegated top-up receipt into private balance.
- `consume_topup_and_place_private_prediction_er` - top up and trade through the private path.
- `resolve_private_market_er` - resolve a manual market inside the ER.
- `resolve_price_market_er` - resolve a price market from the configured price feed.
- `resolve_price_market_with_observed_price_er` - resolve a price market with an observed historical price.
- `settle_private_position_er` - compute a user's final claim in the ER.
- `settle_private_position_by_keeper_er` - keeper/admin settlement path.
- `claim_settled_private_position` - claim settled USDC from the Solana vault.

---

## Frontend/API Flow

Market creation is wallet-signed:

1. `POST /api/markets/prepare-create`
2. wallet signs and sends the base-layer transaction
3. `POST /api/markets/finalize`
4. app delegates the market/private state and records proof signatures

Private trading is also wallet-signed:

1. wallet gets a MagicBlock TEE auth token
2. app prepares funding if the market private balance is too low
3. app prepares a private trade for the Ephemeral RPC
4. wallet signs and sends to MagicBlock TEE/PER
5. app refreshes the user's private position and aggregate AMM odds

The market page refreshes active market state frequently so YES/NO odds move with the AMM.

Main API groups:

- `/api/markets` - list markets and prepare/create/finalize market creation.
- `/api/markets/[id]` - fetch one market by id or address.
- `/api/markets/tracked` - read tracked market proofs and metadata.
- `/api/oracles/price-feeds` - fetch supported live crypto price feeds.
- `/api/positions` - fetch a wallet's position, using a TEE auth token when private state is delegated.
- `/api/trading/prepare-position` - open/fund a position shell or create a top-up receipt.
- `/api/trading/prepare-funds` - consume private funding/top-up inside the TEE path.
- `/api/trading/prepare-private` - prepare a private YES/NO trade for the Ephemeral RPC.
- `/api/trading/prepare-sell` - prepare a private YES/NO share sale for the Ephemeral RPC.
- `/api/trading/prepare-settle` - prepare private settlement after resolution.
- `/api/trading/prepare-claim` - prepare the final Solana claim transaction.
- `/api/trading/commit-position` - commit position state back to Solana.
- `/api/trading/delegate-position` and `/api/trading/delegate-topup` - delegation helpers.
- `/api/trading/resolve` - resolver/admin resolution path.
- `/api/trading/submit` - submit a signed base-layer transaction.
- `/api/tee/signature` - verify a TEE transaction signature against MagicBlock RPC.
- `/api/crank/run`, `/api/crank/price-markets`, `/api/crank/settle-positions` - keeper/crank endpoints.
- `/api/sports/events` and `/api/ai/sports-markets` - sports discovery and AI-assisted market generation helpers.

---

## Resolution Sources

| Mode | Use Case | Status |
| --- | --- | --- |
| Manual resolver | Any clear YES/NO event | Supported |
| MagicBlock/Pyth price feed | Automated crypto price markets | Supported |

Supported automated assets:

| Asset | Symbol | Feed |
| --- | --- | --- |
| BTC | `BTCUSD` | MagicBlock/Pyth |
| ETH | `ETHUSD` | MagicBlock/Pyth |
| SOL | `SOLUSD` | MagicBlock/Pyth |
| JUP | `JUPUSD` | MagicBlock/Pyth |

---

## Local Setup

### 1. Install dependencies

```bash
npm install
cd app
npm install
```

### 2. Configure environment

Create `app/.env.local`:

```bash
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_PROGRAM_ID=79RQQN3A4HHrogrBTwUw5py8UMhhyKFFb1CmVGagZ55t

SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_PRIVATE_KEY=[...]
SOLANA_ADMIN_PRIVATE_KEY=[...]
SOLANA_ORACLE_PRIVATE_KEY=[...]

MARKET_SCAN_LIMIT=256
CRANK_SECRET=local-secret
CRON_SECRET=local-secret

# Optional
PYTH_API_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
```

### 3. Run the app

```bash
cd app
npm run dev
```

Open:

```text
http://localhost:3000
```

### 4. Run the crank locally

```bash
curl -X POST http://localhost:3000/api/crank/run \
  -H "Authorization: Bearer local-secret"
```

---

## Useful Commands

Build the Solana program:

```bash
anchor build
```

Run Anchor tests:

```bash
anchor test
```

Deploy to devnet:

```bash
anchor deploy --provider.cluster devnet
```

Check program id:

```bash
anchor keys list
```

Run the web app:

```bash
cd app
npm run dev
```

Type-check the web app:

```bash
cd app
npm run type-check
```

Build the web app:

```bash
cd app
npm run build
```

---

## Crank / Keeper

Expired markets can be advanced by:

```text
app/src/app/api/crank/run/route.ts
```

The crank handles:

1. resolving expired price markets
2. settling resolved positions when possible

The crank route is protected by `CRANK_SECRET` / `CRON_SECRET`.

There is also a Cloudflare Worker in:

```text
workers/crank
```

Worker setup:

```bash
cd workers/crank
npm install
npx wrangler secret put CRANK_SECRET
npm run deploy
```

---

## Current Limitations

- Devnet only.
- Old pre-AMM-fix markets are filtered out of the main UI.
- Aggregate AMM odds and reserves are intentionally visible.
- Funding/top-up movements can be visible even though trade side and private position are hidden.
- If a market has very little activity, a single trade may be inferable from aggregate odds movement.
- Solana Explorer may show MagicBlock TEE transactions as finalized but without decoded inner private instructions.
- The hosted app depends on MagicBlock devnet RPC, Solana devnet RPC, and supported price feed availability.

---

## Project Status

Eclipse is a working devnet prototype for private AMM prediction markets:

1. Create a market on Solana.
2. Delegate active market and position state into MagicBlock.
3. Trade YES/NO through private TEE/PER state.
4. Keep aggregate odds public while individual positions remain private.
5. Resolve from manual input or MagicBlock/Pyth price feeds.
6. Settle and claim from the Solana collateral vault.
