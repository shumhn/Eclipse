# Eclipse

Private prediction markets on Solana, powered by MagicBlock Ephemeral Rollups.

Eclipse is a devnet private prediction market built on Solana using MagicBlock Private Ephemeral Rollups. Markets run as binary YES/NO questions with private live positioning during the trading window, then commit the resolved outcome back to Solana when the market closes. The current automated oracle-backed flow supports BTC, ETH, SOL, and JUP price markets, while the same private market flow also supports manually resolved YES/NO outcomes.

Live app: https://eclipse-predict.vercel.app  
Program ID: `79RQQN3A4HHrogrBTwUw5py8UMhhyKFFb1CmVGagZ55t`  
Network: Solana devnet

---

## The Problem

Normal onchain prediction markets are transparent while they are still active. That creates bad market behavior:

- **Visible positions:** traders reveal wallet, size, and direction before the event resolves.
- **Copy-trading and insider positioning:** a strong trader can accidentally signal the answer to everyone else.
- **Front-running risk:** public state changes can leak market intent before settlement.
- **Manual resolution overhead:** markets need a reliable close-time path so expired markets do not stay stuck.
- **Weak creation UX:** market creators need clear questions, deadlines, resolution rules, and reliable data sources.

For prediction markets, this matters a lot. If everyone can see who bought YES or NO before the deadline, the market becomes less about prediction and more about watching other wallets.

---

## The Eclipse Approach

Eclipse uses Solana for custody, public shells, and final settlement, while MagicBlock handles the fast live execution layer.

From the MagicBlock prediction-market model:

- **State runs inside an Ephemeral Rollup**
- **Positions stay hidden during the active resolution window**
- **Outcomes are committed onchain at close**
- **The design reduces floor manipulation and insider positioning**

In practice, the app creates Solana accounts for the market and trader position, delegates those accounts into MagicBlock, executes private prediction actions through the Ephemeral Rollup, and commits final outcomes back to Solana after expiry.

---

## What Works Today

This repo currently supports:

- Create private binary prediction markets.
- Create automated crypto price markets using MagicBlock/Pyth feeds.
- Current automated price assets: `BTC`, `ETH`, `SOL`, `JUP`.
- Support manually resolved YES/NO markets.
- Show live MagicBlock/Pyth prices in the create-market flow.
- Suggest target prices from the live price, such as `+1%`, `+3%`, `+5%`.
- Generate cleaner market questions with a real resolution date/time.
- Delegate markets and positions into MagicBlock.
- Trade through the private market flow.
- Auto-resolve expired automated price markets through a crank endpoint.
- Settle resolved positions through keeper/admin settlement paths.
- Deploy the Next.js app on Vercel.

This is a devnet build.

---

## Architecture

```text
User / Admin
   |
   v
Next.js App
   |
   |-- Solana devnet RPC
   |     - creates market shell accounts
   |     - stores escrow vaults
   |     - stores final resolved state
   |
   |-- MagicBlock Ephemeral RPC
   |     - delegated market state
   |     - delegated position state
   |     - private trading lifecycle
   |
   |-- Resolution sources
         - live BTC / ETH / SOL / JUP prices
         - close-time price resolution
         - manually resolved YES/NO outcomes
```

### Solana Program

The Anchor program lives in:

```text
programs/prediction_market
```

Important instruction groups:

- `create_private_market` - creates a manually resolved private prediction market.
- `create_price_market` - creates an automated price market with target, direction, and feed.
- `delegate_market_into_tee` - delegates the market shell into MagicBlock.
- `delegate_position_into_tee` - delegates a trader position shell.
- `delegate_private_position_into_tee` - delegates the private position state.
- `place_private_prediction` - places a YES/NO prediction during the active window.
- `resolve_private_market_er` - resolves a manually resolved market after expiry.
- `resolve_price_market_er` - resolves an expired price market using the MagicBlock/Pyth feed.
- `settle_private_position_er` - settles a trader after resolution.
- `settle_private_position_by_keeper_er` - keeper/admin settlement path.

### Frontend / API

The Next.js app lives in:

```text
app
```

Important app paths:

- `app/src/components/CreateMarketModal.tsx` - market creation UI.
- `app/src/components/PriceChart.tsx` - live price chart.
- `app/src/hooks/useMagicBlockLivePriceFeeds.ts` - live feed subscription/fallback.
- `app/src/lib/priceFeeds.ts` - supported BTC/ETH/SOL/JUP feed registry.
- `app/src/services/magicblock-indexer.ts` - Solana + MagicBlock service layer.
- `app/src/app/api/crank/run/route.ts` - unified resolve + settle crank.

---

## Market Lifecycle

### 1. Create

An admin/user creates a binary private prediction market. For a manually resolved market, the question can be any clear YES/NO event with a deadline:

```text
Will Team A win the final by Sunday, 8:00 PM?
```

For an automated crypto price market, the question is tied to a live MagicBlock/Pyth feed:

```text
Will SOL be above $77.57 on Jun 16, 2026, 12:00 PM?
```

The market stores:

- question
- end time
- initial liquidity
- resolution source: manual resolver or MagicBlock/Pyth price feed
- optional price direction: `above` or `below`
- optional target price
- optional MagicBlock/Pyth feed account

### 2. Delegate

The public market shell and trader position state are delegated into MagicBlock. The base Solana layer still anchors the market, but active trading state moves into the Ephemeral Rollup.

### 3. Trade

Users trade YES/NO while the market is active. The app closes trading after the configured resolution timestamp.

### 4. Resolve

After `end_time`, the market resolves from its configured source.

For manually resolved markets, the configured resolver signs the final YES/NO outcome.

For price markets, the crank reads the selected MagicBlock/Pyth price feed and resolves:

```text
YES if observed_price >= target_price
NO otherwise
```

For `below` markets, the comparison is inverted.

### 5. Commit + Settle

The resolved outcome and final settlement state are committed back to Solana. Users can then claim based on the winning side and their settled claimable amount.

---

## Resolution Sources

Eclipse currently supports two resolution modes:

| Mode | Use Case | Status |
| --- | --- | --- |
| Manual resolver | Manually resolved YES/NO markets | Supported |
| MagicBlock/Pyth price feed | Automated crypto price markets | Supported |

Automated price feeds are intentionally limited for now:

| Asset | Feed Type |
| --- | --- |
| BTC | MagicBlock/Pyth |
| ETH | MagicBlock/Pyth |
| SOL | MagicBlock/Pyth |
| JUP | MagicBlock/Pyth |

The app uses MagicBlock live account updates first and Hermes/Pyth fallback polling when needed for automated price markets.

---

## Crank / Resolution

Expired markets are resolved by the app crank endpoint:

```text
app/src/app/api/crank/run/route.ts
```

The crank does two jobs:

1. Resolve expired price markets by reading the selected live feed at close.
2. Settle resolved positions when settlement is available.

On Vercel, the crank route is protected with `CRANK_SECRET` / `CRON_SECRET`.

For a free hosted crank, use the Cloudflare Worker in:

```text
workers/crank
```

It triggers once per minute and calls the Vercel crank endpoint:

```text
https://eclipse-predict.vercel.app/api/crank/run
```

Cloudflare Worker setup:

```bash
cd workers/crank
npm install
npx wrangler secret put CRANK_SECRET
npm run deploy
```

Use the same `CRANK_SECRET` value that is configured on Vercel.

There is also a GitHub Actions fallback in `.github/workflows/crank.yml`, which runs every 5 minutes.

Manual markets can still be resolved by the configured oracle/admin path.

---

## Local Setup

### 1. Install dependencies

```bash
pnpm install
cd app
pnpm install
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

MARKET_SCAN_LIMIT=50
CRANK_SECRET=local-secret
CRON_SECRET=local-secret
```

### 3. Run the app

```bash
cd app
pnpm dev
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

### Build frontend

```bash
cd app
pnpm build
```

### Run frontend lint

```bash
cd app
pnpm lint
```

### Run Anchor tests

```bash
anchor test
```

### Check program ID

```bash
anchor keys list
```

### Deploy program to devnet

```bash
anchor deploy --provider.cluster devnet
```

---

## Project Status

Eclipse is a working devnet private prediction market prototype using Solana, MagicBlock Ephemeral Rollups, and MagicBlock/Pyth price feeds.

The app is focused on proving the full lifecycle:

1. Create a private prediction market.
2. Delegate active state into MagicBlock.
3. Trade while positions stay private during the active window.
4. Resolve after the configured deadline.
5. Commit the final outcome back to Solana.
6. Settle winning positions.
