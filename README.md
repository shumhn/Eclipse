<p align="center">
  <img src="app/public/eclipse-logo.svg" alt="Eclipse" width="84" />
</p>

<p align="center">
  <strong>Eclipse</strong>
</p>

<p align="center">
  <em>Private AMM Prediction Markets on Solana, Powered by MagicBlock</em>
</p>

<p align="center">
  <a href="https://eclipse-predict.vercel.app">Live App</a> |
  <a href="#the-problem">Problem</a> |
  <a href="#how-it-works">How It Works</a> |
  <a href="#privacy-model">Privacy</a> |
  <a href="#amm-design">AMM</a> |
  <a href="#magicblock-integration">MagicBlock</a> |
  <a href="#architecture">Architecture</a> |
  <a href="#getting-started">Getting Started</a>
</p>

---

## Overview

**Eclipse** is a permissionless binary prediction market protocol on Solana
devnet. Anyone can create a YES/NO market, seed it with USDC, and trade through
a virtual automated market maker. Solana holds the public market shell,
collateral vault, and final settlement state. MagicBlock's TEE-backed Private
Ephemeral Rollup executes the active trading lifecycle.

The market remains publicly discoverable and its aggregate odds remain visible,
but a trader's side, virtual shares, and live market balance are kept in
delegated private state while trading is active.

> **Public market odds. Private trader positions.**

### Key Features

| Feature | What Eclipse Provides |
| --- | --- |
| **Permissionless Markets** | Any wallet can create a binary market and seed its initial USDC liquidity |
| **Private YES/NO Trading** | Individual side, shares, and live balance execute inside MagicBlock TEE/PER state |
| **Continuous AMM Liquidity** | A virtual Pythagorean bonding curve quotes both outcomes without an order book |
| **Buy and Sell** | Traders can enter a position or sell virtual shares back to the AMM before close |
| **Crypto Price Markets** | A keeper fetches historical Pyth benchmarks for BTC, ETH, SOL, and JUP close-time settlement |
| **Manual Markets** | A configured resolver can settle clearly defined non-price YES/NO events |
| **Slippage Protection** | Buys enforce `min_shares_out`; sells enforce `min_collateral_out` |
| **Protocol Revenue** | Proportional creation fees and uncertainty-weighted private trading fees accrue per market |
| **End-to-End Settlement** | Positions settle in PER, commit to Solana, and claim USDC from the market vault |
| **Keeper Automation** | Protected crank routes advance expired price markets and eligible settlements |

### Devnet Deployment

| Item | Value |
| --- | --- |
| **Live application** | [eclipse-predict.vercel.app](https://eclipse-predict.vercel.app) |
| **Network** | Solana Devnet |
| **Program ID** | `79RQQN3A4HHrogrBTwUw5py8UMhhyKFFb1CmVGagZ55t` |
| **Collateral** | Devnet USDC |
| **USDC mint** | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |
| **Execution layer** | MagicBlock TEE / Private Ephemeral Rollup |
| **Current trading fee** | 100 bps maximum at 50/50 odds, reduced by the uncertainty multiplier |
| **Minimum liquidity** | 1 USDC |
| **Status** | Working devnet prototype; not audited for mainnet |

---

## The Problem

### Public Markets Expose Every Trader

Traditional on-chain prediction markets make transaction-level behavior easy to
observe. A public order can reveal the trader, selected outcome, position size,
entry timing, and subsequent position changes.

That creates several problems:

- Large positions can be copied before the market fully reprices.
- Traders may follow visible wallets instead of forming independent beliefs.
- A visible order can leak conviction before it finishes executing.
- Searchers can react to public order flow and worsen execution.
- Sensitive political, corporate, or personal forecasts become wallet history.

### Privacy Alone Is Not Enough

A useful prediction market still needs public price discovery. Users must be
able to see the market, understand its rules, compare YES and NO, and estimate
their return before signing.

Eclipse separates these two concerns:

| Market Requirement | Eclipse Design |
| --- | --- |
| Discoverable market | Public Solana market shell |
| Verifiable custody | Public market-owned USDC vault |
| Live price discovery | Public aggregate AMM state |
| Private trader intent | Side and shares remain in TEE/PER position state |
| Fast execution | Active trades execute on MagicBlock |
| Verifiable settlement | Final outcome and claimable payout commit to Solana |

The result is not a fully invisible market. It is a public market with a private
user-level execution layer.

---

## Who Is It For?

| User | What They Get |
| --- | --- |
| **Independent Traders** | Less exposure of live side, size, and position changes |
| **Large Traders** | Reduced copy-trading and public order-flow leakage |
| **Market Creators** | Permissionless creation, configurable resolution, and initial liquidity ownership |
| **Communities and DAOs** | Binary markets for clear events without maintaining a separate order book |
| **Crypto Applications** | Automated price-condition markets for supported Pyth-backed assets |
| **Researchers and Builders** | A working reference for Solana custody plus MagicBlock private execution |

---

## Why an AMM?

Order books require matching buyers and sellers at compatible prices. Thin
markets can remain empty even when users want to trade.

Eclipse uses an AMM so every valid market begins with two-sided liquidity:

| Property | Order Book | Eclipse Virtual AMM |
| --- | --- | --- |
| Requires a matching counterparty | Yes | No |
| Quotes immediately after creation | Only with posted orders | Yes |
| Best for | Deep, active markets | New or long-tail binary markets |
| Price source | Best bid and ask | Bonding curve state |
| User position representation | Orders or outcome tokens | Private virtual shares |
| Liquidity source | Market makers | Creator seed plus trader collateral |

The creator's initial liquidity produces balanced virtual YES and NO supply.
Trading then moves the curve and changes the displayed odds.

---

## MagicBlock Integration

MagicBlock is the active execution and privacy layer of Eclipse, not a branding
dependency. The private market lifecycle uses its permissions, delegated
accounts, authenticated TEE RPC, Ephemeral Rollup execution, and commit flow.

### What Runs Where

| Solana Base Layer | MagicBlock TEE / PER |
| --- | --- |
| Protocol configuration | Active market execution |
| Public market shell | Live virtual AMM reserves and supplies |
| Market-owned USDC vault | Trader idle balance |
| Public aggregate funding | Trader YES and NO shares |
| Final market outcome | Buy and sell execution |
| Settled claimable amount | Uncertainty-weighted fee calculation |
| USDC claim transfer | Position settlement calculation |

### End-to-End MagicBlock Flow

1. Create a market shell, creator position, and collateral vault on Solana.
2. Create MagicBlock permission accounts for the market and position state.
3. Delegate the market and user position accounts to the configured validator.
4. Initialize private market and private position state in the Ephemeral Rollup.
5. Authenticate the trader with the TEE RPC.
6. Execute buys, sells, top-up consumption, and fee accounting inside PER.
7. Resolve the market and calculate each claim inside PER.
8. Commit the aggregate market and settled position shell back to Solana.
9. Claim USDC from the public market vault.

```mermaid
flowchart LR
    Wallet["Trader Wallet"] --> App["Eclipse Next.js App"]
    App --> L1["Solana Devnet"]
    L1 --> Vault["Market USDC Vault"]
    L1 --> Delegate["MagicBlock Delegation"]
    Delegate --> PER["TEE / Private Ephemeral Rollup"]
    PER --> AMM["Private Position + Virtual AMM"]
    AMM --> Commit["Commit Settled State"]
    Commit --> L1
    L1 --> Claim["USDC Claim"]
```

---

## How It Works

### For Market Creators

1. **Connect a wallet** - Use a supported Solana wallet on devnet.
2. **Define the market** - Enter the question, close time, liquidity, and
   resolution source.
3. **Fund liquidity** - Deposit at least 1 USDC plus a 1% creation fee based on that liquidity.
4. **Create on Solana** - The wallet signs creation of the market, creator
   position, and vault.
5. **Activate privacy** - The app creates permissions, delegates state, and
   initializes the private AMM.
6. **Monitor the market** - Aggregate YES/NO odds and volume remain visible.
7. **Resolve and settle** - The configured resolution path determines the
   result after the deadline.

### For Traders

1. **Choose a market** - Review the question, close time, target, and live odds.
2. **Choose YES or NO** - The selected side is used only for the private trade.
3. **Enter an amount** - The UI estimates average cost, shares, fees, and
   projected payout.
4. **Fund the market position** - Deposit first or use the top-up-and-trade flow.
5. **Sign the private trade** - The transaction is sent to MagicBlock TEE/PER.
6. **Manage the position** - Buy more or sell shares before market close.
7. **Settle after resolution** - The private position calculates the final
   claimable amount.
8. **Claim USDC** - The settled amount is transferred from the Solana vault.

### Complete Market Lifecycle

```mermaid
sequenceDiagram
    participant C as Creator
    participant T as Trader
    participant A as Eclipse App
    participant S as Solana
    participant M as MagicBlock TEE/PER
    participant O as Resolver

    C->>A: Define market and initial liquidity
    A->>S: Create market, position, and USDC vault
    A->>M: Create permissions and delegate state
    A->>M: Initialize private AMM

    T->>A: Select side and amount
    A->>S: Fund position or create top-up receipt
    A->>M: Consume funding and execute private trade
    M->>M: Update virtual shares, reserves, odds, and fees

    opt Sell before close
        T->>M: Sell private virtual shares
        M->>M: Burn shares and credit idle collateral
    end

    O->>M: Resolve after market deadline
    M->>M: Calculate proportional winner payouts
    M->>S: Commit market and settled position
    T->>S: Claim USDC from market vault
```

---

## Privacy Model

Eclipse protects user-level trading state during the active market window. It
does not claim to hide all blockchain activity.

### Private During Active Trading

- selected YES or NO side
- live YES and NO virtual shares
- market-specific idle trading balance inside PER
- exact per-trade fee
- private position state before settlement

### Public or Potentially Inferable

- existence and rules of the market
- creator wallet and initial liquidity
- market and position shell accounts
- USDC funding and top-up transfers into the market vault
- aggregate AMM reserves and YES/NO supply
- aggregate odds and market volume
- aggregate protocol fees after commit
- final outcome and settled claimable amount
- final wallet claim from the public vault
- TEE transaction or event metadata showing that a wallet interacted, even
  though side, amount, shares, and the per-trade fee are omitted

### Honest Privacy Boundary

Funding privacy and trade privacy are different. A deposit can reveal that a
wallet moved collateral into a market, but it does not directly reveal whether
that collateral bought YES, bought NO, remained idle, or was later sold.

Aggregate odds must remain visible for price discovery. In a low-activity
market, an observer comparing state changes may infer the approximate direction
or size of a trade. Eclipse therefore provides user-level state privacy, not
perfect traffic-analysis resistance.

> Eclipse hides live per-wallet position and order-flow details inside
> MagicBlock TEE state while keeping aggregate market prices public.

---

## AMM Design

Eclipse does not mint public YES and NO SPL tokens. It tracks virtual outcome
shares in private trader accounts and aggregate supply in the market state.

### Pythagorean Invariant

The bonding curve follows:

```text
R = sqrt(YES^2 + NO^2)
```

Where:

- `R` is active collateral reserves.
- `YES` is aggregate virtual YES supply.
- `NO` is aggregate virtual NO supply.

For a balanced new market:

```text
YES = NO = sqrt(R^2 / 2)
```

This starts the market close to 50/50.

### Displayed Odds

```text
yes_price = YES / (YES + NO)
no_price  = NO  / (YES + NO)
```

These values are curve quotes expressed in basis points. They are useful market
prices, not guarantees that an outcome has that real-world probability.

### Buying

For a buy on one side:

```text
new_R              = R + net_collateral_in
new_target_supply  = sqrt(new_R^2 - other_supply^2)
shares_out         = new_target_supply - old_target_supply
```

The program:

1. calculates the uncertainty-weighted fee,
2. sends the net amount into AMM reserves,
3. mints virtual shares to the private position,
4. updates the aggregate market state, and
5. rejects execution if `shares_out < min_shares_out`.

### Selling

For a sale:

```text
new_target_supply = old_target_supply - shares_burned
new_R             = sqrt(new_target_supply^2 + other_supply^2)
gross_out         = old_R - new_R
net_out           = gross_out - protocol_fee
```

The sell path rounds remaining reserves upward, which rounds trader output
downward and prevents repeated rounding from extracting vault dust. Execution
fails if `net_out < min_collateral_out`.

### Resolution Payout

Winning shares divide final active reserves proportionally:

```text
winning_payout =
    user_winning_shares
    / total_winning_shares
    * final_reserves

claimable_amount =
    idle_collateral
    + winning_payout
```

A virtual share is **not** a fixed 1 USDC claim. Its final value depends on:

- final AMM reserves,
- total virtual shares on the winning side, and
- the trader's share of that winning supply.

If a market is invalidated, the settlement path returns the position's deposited
collateral according to the program's invalid-market branch.

### Example

Suppose final active reserves are 120 USDC and total winning YES supply is 80
virtual shares. A trader owns 20 winning YES shares:

```text
winning_payout = 20 / 80 * 120 = 30 USDC
```

If that trader also has 4 USDC sitting idle after a previous sale:

```text
claimable_amount = 4 + 30 = 34 USDC
```

---

## Revenue Model

Eclipse earns from market creation and private trading activity. It does not
take a side in the outcome.

| Revenue Stream | Implementation | Privacy |
| --- | --- | --- |
| **Market Creation Fee** | Exactly 1% of initial liquidity, with no protocol cap | Public, because market creation is public |
| **Private Trading Fee** | Configurable taker fee on buys and sells, weighted by current uncertainty | Calculated inside TEE/PER |
| **Treasury Withdrawal** | Admin withdraws only aggregate accrued protocol fees | No per-trade side or size is emitted |

### Uncertainty-Weighted Trading Fee

The configured protocol fee is multiplied by:

```text
uncertainty = 4 * p * (1 - p)
```

The multiplier is highest at 50/50 and falls toward zero as a side approaches
0% or 100%.

```text
fee = trade_amount * configured_fee_rate * uncertainty
```

The configured rate is stored in the protocol config and can be updated by the
admin within the on-chain cap. The market stores only the aggregate accrued fee.

### Why This Model Fits Eclipse

- The proportional creation fee discourages spam without making small markets expensive.
- A 1 USDC market pays 0.01 USDC; a 100 USDC market pays 1 USDC.
- The fee scales linearly with creator-provided liquidity and has no hidden fixed surcharge.
- Trading fees scale with actual protocol usage.
- Fees do not depend on which side wins.
- Private fee calculation preserves the same execution boundary as the trade.
- Aggregate withdrawal gives the treasury a clean, auditable revenue path.

---

## Resolution

### Supported Modes

| Mode | Use Case | Current Status |
| --- | --- | --- |
| **Manual Resolver** | Clearly defined binary events | Supported |
| **Keeper-Supplied Pyth Benchmark** | Crypto target markets using a historical Pyth benchmark fetched by the app | Supported on devnet |

### Automated Assets

| Asset | Symbol | Resolution Feed |
| --- | --- | --- |
| Bitcoin | `BTCUSD` | MagicBlock/Pyth |
| Ethereum | `ETHUSD` | MagicBlock/Pyth |
| Solana | `SOLUSD` | MagicBlock/Pyth |
| Jupiter | `JUPUSD` | MagicBlock/Pyth |

### Price Resolution Rule

For an `Above` market:

```text
YES if observed_price >= target_price
NO otherwise
```

For a `Below` market:

```text
YES if observed_price < target_price
NO otherwise
```

The current keeper fetches a historical Pyth benchmark at the configured market
close and submits its price and publish time to the PER instruction. The program
checks that the supplied feed account matches the market and that the supplied
publish time is between `end_time` and `end_time + 60 seconds`.

Important devnet trust boundary: the current Rust instruction does **not** parse
an attested historical price from the supplied feed account or cryptographically
bind the submitted price and publish time to that account. The app uses the
configured oracle wallet and Pyth Benchmarks API operationally, but the price
instruction itself does not yet enforce the configured oracle signer. Before
mainnet, this path needs an authorized resolver constraint plus verifiable oracle
attestation or an on-chain historical oracle proof.

---

## Architecture

### High-Level Architecture

```text
+------------------------------------------------------------------+
|                        ECLIPSE FRONTEND                           |
|                                                                  |
|  Markets  |  Create  |  Trade  |  Portfolio  |  Resolve/Claim   |
|                             |                                    |
|                  Wallet-signed transactions                      |
+-----------------------------+------------------------------------+
                              |
              +---------------+----------------+
              |                                |
+-------------v----------------+   +-----------v-------------------+
|       SOLANA DEVNET          |   |   MAGICBLOCK TEE / PER        |
|                              |   |                               |
| Protocol Config PDA          |   | Active market state           |
| Public Market PDA            |   | Private trader position       |
| Trader Position Shell        |   | Buy and sell execution        |
| Market USDC Vault            |   | Fee calculation               |
| Final Outcome and Claim      |   | Resolution and settlement     |
+-------------+----------------+   +-----------+-------------------+
              ^                                |
              |       Commit settled state     |
              +--------------------------------+
                              |
                   MagicBlock/Pyth Feeds
```

### Technology Stack

| Technology | Role |
| --- | --- |
| **Solana** | Public market accounts, USDC custody, configuration, and final claims |
| **MagicBlock** | Permissions, account delegation, TEE RPC, private execution, and commits |
| **Anchor 0.32** | Rust program framework and account validation |
| **Pyth / MagicBlock feeds** | Live display data and keeper-sourced historical close benchmarks |
| **Next.js 16** | App, server routes, crank endpoints, and documentation |
| **React 19** | Trading and portfolio interfaces |
| **Lightweight Charts** | Live crypto price visualization |
| **Phantom / Wallet Adapter** | User authentication and transaction signing |

### Account Model

```mermaid
erDiagram
    Config ||--o{ Market : "configures"
    Market ||--|| Vault : "owns"
    Market ||--o{ TraderPosition : "has"
    Market ||--|| PrivateMarketState : "delegates"
    TraderPosition ||--|| PrivatePositionState : "delegates"
    TraderPosition ||--o{ PositionTopupReceipt : "funds"

    Config {
        Pubkey admin
        Pubkey oracle
        Pubkey collateral_mint
        u16 protocol_fee_bps
        u64 min_liquidity
        Pubkey tee_validator
        bool paused
    }

    Market {
        u64 id
        Pubkey creator
        string question
        u64 end_time
        u64 live_reserves
        u64 live_yes_supply
        u64 live_no_supply
        u64 protocol_fees_accrued
        enum status
        enum outcome
    }

    TraderPosition {
        Pubkey trader
        u64 collateral_deposited
        u64 claimable_amount
        bool delegated
        bool settled
        bool claimed
    }

    PrivatePositionState {
        u64 collateral_available
        u64 yes_shares
        u64 no_shares
        u8 claimed
    }
```

### PDA Map

```text
Config                  -> ["config"]
Market                  -> ["market", market_id]
TraderPosition          -> ["position", market, trader]
PrivateMarketState      -> ["private_market_state", market]
PrivatePositionState    -> ["private_position_state", market, trader]
PositionTopupReceipt    -> ["position_topup_receipt", market, trader, nonce]
```

---

## On-Chain Program

**Program:** `programs/prediction_market`

**Program ID:** `79RQQN3A4HHrogrBTwUw5py8UMhhyKFFb1CmVGagZ55t`

**Framework:** Anchor 0.32.1 / Rust

### Instruction Set

| Category | Instruction | Purpose |
| --- | --- | --- |
| **Config** | `initialize` | Create global protocol configuration |
| | `set_protocol_paused` | Pause or resume protocol actions |
| | `update_oracle` | Change the resolver authority |
| | `update_protocol_fee_bps` | Change the private trading fee rate |
| | `update_tee_validator` | Change the delegated validator identity |
| | `update_collateral_mint` | Change collateral for newly created markets |
| **Market** | `create_private_market` | Create a manual binary market |
| | `create_price_market` | Create a Pyth-backed crypto price market |
| **Position** | `open_position` | Create a public trader position shell |
| | `deposit_collateral` | Fund the market vault before private activation |
| | `withdraw_collateral` | Withdraw idle collateral before PER activation |
| | `create_position_topup_receipt` | Fund an already delegated position |
| **Permissions** | `create_market_permission` | Create the market permission PDA |
| | `create_position_permission` | Create the public position permission PDA |
| | `create_private_position_permission` | Create the private position permission PDA |
| | `create_topup_receipt_permission` | Create a top-up permission PDA |
| **Delegation** | `delegate_market_into_tee` | Delegate market state |
| | `delegate_position_into_tee` | Delegate public position shell |
| | `delegate_private_position_into_tee` | Delegate private trader state |
| | `delegate_topup_receipt_into_tee` | Delegate a funding receipt |
| **Private State** | `initialize_private_market_state` | Initialize live AMM state |
| | `initialize_private_position_state` | Initialize private trader state |
| **Trading** | `place_private_prediction` | Buy YES or NO from private balance |
| | `sell_private_prediction` | Sell virtual shares to the AMM |
| | `consume_position_topup_receipt_er` | Credit a delegated top-up |
| | `consume_topup_and_place_private_prediction_er` | Fund and buy in one private path |
| **Resolution** | `resolve_private_market_er` | Resolve a manual market in PER |
| | `resolve_price_market_with_observed_price_er` | Resolve from a keeper-supplied price and bounded publish time |
| **Settlement** | `settle_private_position_er` | Calculate a trader's final payout |
| | `settle_private_position_by_keeper_er` | Keeper/admin settlement path |
| | `commit_market` | Commit market state to Solana |
| | `commit_and_undelegate` | Commit and return market ownership |
| | `commit_position` | Commit settled position state |
| | `commit_position_and_undelegate` | Commit and return position ownership |
| | `claim_settled_private_position` | Transfer claimable USDC to the trader |
| **Revenue/Cleanup** | `withdraw_protocol_fees` | Transfer aggregate fees to treasury |
| | `close_market_dust` | Sweep only tiny rounding dust after settlement |

---

## Frontend and API Flow

The backend validates API request schemas and prepares transactions, while the
program enforces its account and state constraints. User-owned actions remain
wallet-signed.

### Market Creation

```text
POST /api/markets/prepare-create
    -> wallet signs and sends the Solana transaction
POST /api/markets/finalize
    -> permissions, delegation, private state, and proof tracking
```

### Private Trade

```text
wallet obtains MagicBlock TEE authentication
    -> app prepares position funding when required
    -> app prepares buy or sell instruction
    -> wallet signs and sends to TEE/PER RPC
    -> app refreshes private position and aggregate odds
```

### Main API Groups

| Route | Responsibility |
| --- | --- |
| `/api/markets` | List and create markets |
| `/api/markets/[id]` | Read one market |
| `/api/markets/tracked` | Read tracked market metadata and proof signatures |
| `/api/markets/prepare-create` | Build the wallet-signed creation transaction |
| `/api/markets/finalize` | Complete MagicBlock activation |
| `/api/markets/withdraw-fees` | Withdraw aggregate protocol revenue |
| `/api/oracles/price-feeds` | Read supported live crypto feeds |
| `/api/positions` | Read a wallet position with TEE auth when required |
| `/api/trading/prepare-position` | Open or fund the position shell |
| `/api/trading/prepare-funds` | Consume private funding |
| `/api/trading/prepare-private` | Build a private buy |
| `/api/trading/prepare-sell` | Build a private sale |
| `/api/trading/prepare-settle` | Build private position settlement |
| `/api/trading/prepare-claim` | Build the final Solana claim |
| `/api/trading/commit-position` | Commit position state |
| `/api/trading/resolve` | Run the configured resolution path |
| `/api/tee/signature` | Verify a TEE transaction signature |
| `/api/crank/*` | Resolve price markets and advance settlement |

---

## Security and Correctness

Eclipse includes several protections appropriate for a devnet protocol:

| Protection | Implementation |
| --- | --- |
| **Checked arithmetic** | AMM calculations use checked `u128` intermediates and safe `u64` conversion |
| **Curve-derived updates** | Buy and sell outputs are derived from the Pythagorean curve with checked arithmetic; unit tests validate the resulting invariant |
| **Conservative sell rounding** | Sell output rounds down to prevent repeated dust extraction |
| **Buy slippage** | `min_shares_out` rejects a worse-than-approved execution |
| **Sell slippage** | `min_collateral_out` rejects a worse-than-approved execution |
| **Double-claim prevention** | Position settlement and claim flags prevent repeated payouts |
| **Vault bounds** | Claims require sufficient market vault collateral |
| **Feed-address binding** | Price resolution requires the supplied feed account address to match the market configuration |
| **Submitted-time bounds** | The submitted publish time must be within 60 seconds after market close |
| **Emergency pause** | Admin can pause protocol actions |
| **Fee cap** | On-chain configuration limits the protocol fee parameter |
| **Dust-only cleanup** | Market cleanup accepts only a tiny remaining vault balance |

### Tested Scenarios

Rust AMM tests cover:

- balanced 50/50 initialization,
- buying either side and moving the quote,
- selling shares and moving the quote back,
- buy-then-sell never releasing more than was paid,
- uncertainty fee behavior,
- proportional payouts never exceeding reserves,
- one-sided market liquidity,
- mixed buy/sell settlement staying within vault collateral, and
- integer rounding behavior.

Integration suites cover the Solana market lifecycle and a real MagicBlock PER
smoke path, including creation fee accrual, private fee accrual, resolution,
settlement, commit, and claim.

> This repository has not received a production security audit. Devnet test
> coverage is evidence of implementation behavior, not a mainnet safety
> guarantee.

---

## Keeper and Automation

Expired markets can be advanced through the protected crank:

```text
app/src/app/api/crank/run/route.ts
```

It coordinates:

1. scanning supported tracked markets,
2. resolving eligible expired price markets,
3. settling positions when the required state is available, and
4. returning structured execution evidence.

The route is protected by `CRANK_SECRET` or `CRON_SECRET`.

A deployable Cloudflare Worker lives in:

```text
workers/crank
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- Rust and Cargo
- Solana CLI
- Anchor CLI 0.32.1
- A devnet wallet with SOL
- Devnet USDC for market creation and trading

### 1. Install Dependencies

```bash
npm install
cd app
npm install
cd ..
```

### 2. Configure the Frontend

Create `app/.env.local`:

```bash
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_PROGRAM_ID=79RQQN3A4HHrogrBTwUw5py8UMhhyKFFb1CmVGagZ55t

SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_PRIVATE_KEY=[server-wallet-secret-array]
SOLANA_ADMIN_PRIVATE_KEY=[optional-dedicated-admin-secret-array]
SOLANA_ORACLE_PRIVATE_KEY=[optional-dedicated-oracle-secret-array]
PREDICTION_MARKET_PROGRAM_ID=79RQQN3A4HHrogrBTwUw5py8UMhhyKFFb1CmVGagZ55t

MARKET_SCAN_LIMIT=256
CRANK_SECRET=replace-with-a-strong-secret
CRON_SECRET=replace-with-a-strong-secret

# Optional for hosted Pyth access
PYTH_API_KEY=
```

Never commit wallet secrets or TEE authentication tokens.

### 3. Run the Application

```bash
cd app
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Run the Local Crank

```bash
curl -X POST http://localhost:3000/api/crank/run \
  -H "Authorization: Bearer replace-with-a-strong-secret"
```

### 5. Build and Test

```bash
# Program build
anchor build

# Anchor integration tests
anchor test

# Rust AMM unit tests
cargo test

# Frontend type check
cd app
npm run type-check

# Production frontend build
npm run build
```

### 6. Deploy the Program

```bash
anchor keys list
anchor deploy --provider.cluster devnet
```

Deployment authority, program ID, protocol config, oracle, collateral mint, and
TEE validator must agree before the app is pointed at a new deployment.

---

## Repository Structure

```text
private-markets-solana/
|-- programs/
|   `-- prediction_market/
|       `-- src/
|           |-- amm/
|           |   `-- bonding_curve.rs       # AMM quotes, fees, payouts, tests
|           |-- instructions/
|           |   |-- initialize.rs          # Protocol configuration
|           |   |-- create_private_market.rs
|           |   |-- delegate.rs            # MagicBlock permissions/delegation
|           |   |-- private_position.rs    # L1 funding, claims, fees, dust
|           |   `-- private_rollup.rs      # Private trade/resolve/settle logic
|           |-- state/
|           |   |-- config.rs
|           |   |-- market.rs
|           |   |-- position.rs
|           |   |-- private_state.rs
|           |   `-- topup_receipt.rs
|           `-- lib.rs                     # Anchor instruction entrypoints
|
|-- app/
|   `-- src/
|       |-- app/
|       |   |-- markets/                    # Listing and market detail pages
|       |   |-- portfolio/                  # Private position dashboard
|       |   |-- docs/                       # In-app protocol documentation
|       |   `-- api/                        # Market, trading, oracle, crank APIs
|       |-- components/
|       |   |-- CreateMarketModal.tsx
|       |   |-- TradePanel.tsx
|       |   |-- ClaimPanel.tsx
|       |   |-- ResolvePanel.tsx
|       |   |-- MarketCard.tsx
|       |   `-- PriceChart.tsx
|       |-- lib/
|       |   |-- api.ts                      # Client quote and API helpers
|       |   |-- trading.ts
|       |   |-- priceFeeds.ts
|       |   `-- magicblock/
|       `-- services/
|           `-- magicblock-indexer.ts       # Account reads and tx preparation
|
|-- tests/
|   |-- prediction-market-l1.ts             # Base-layer integration flow
|   `-- per-smoke.ts                        # Devnet TEE/PER end-to-end smoke
|
|-- workers/
|   `-- crank/                              # Scheduled market automation
|-- Anchor.toml
|-- Cargo.toml
`-- package.json
```

---

## Current Limitations

- Eclipse is deployed for devnet experimentation, not production capital.
- The program and app have not received an external security audit.
- Aggregate odds, reserves, market volume, and final claims are intentionally
  public.
- Funding and top-up movements can reveal market participation.
- Sparse activity can make a trade approximately inferable from aggregate state
  changes.
- TEE privacy depends on MagicBlock's trust, attestation, RPC, and validator
  model.
- Manual markets depend on the configured resolver authority.
- Price markets depend on the trusted keeper/backend fetching the correct Pyth
  historical benchmark. The current price instruction bounds the submitted time
  but does not cryptographically verify the submitted value or require the
  configured oracle signer.
- Price resolution currently supports only the configured crypto feeds.
- Solana Explorer may finalize a TEE transaction without decoding its private
  inner instruction details.
- Historical markets from incompatible pre-AMM deployments are filtered from
  the primary UI.

---

## Roadmap

| Status | Milestone |
| --- | --- |
| Complete | Permissionless Solana market creation and USDC vaults |
| Complete | Private MagicBlock AMM buys, sells, and position state |
| Complete | Dynamic odds, fee quotes, and projected payouts |
| Complete | Manual and keeper-assisted close-window price resolution on devnet |
| Complete | Position settlement, Solana commit, and USDC claims |
| Complete | Creation fees, private trading fees, and treasury withdrawal |
| Complete | Slippage protection and conservative rounding |
| Complete | Keeper routes and Cloudflare crank worker |
| Next | Expand full multi-wallet end-to-end settlement coverage |
| Next | Enforce price-resolver authority and verifiable oracle provenance |
| Next | Add resolver decentralization and dispute handling |
| Next | External program security audit |
| Next | Production monitoring, rate limits, and incident controls |
| Future | Mainnet beta after audit and oracle hardening |

---

## Project Status

Eclipse currently demonstrates the complete devnet lifecycle:

```text
Create
  -> Seed Liquidity
  -> Delegate to MagicBlock
  -> Fund Private Position
  -> Buy or Sell YES/NO
  -> Resolve at Market Close
  -> Settle Private Position
  -> Commit to Solana
  -> Claim USDC
```

It is a working private AMM prediction market prototype with honest privacy
boundaries, proportional reserve-backed settlement, protocol revenue, and a
usable end-to-end frontend.

---

<p align="center">
  <strong>Eclipse - Public market odds, private trader positions.</strong>
</p>
