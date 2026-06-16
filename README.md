# Eclipse: Privacy-Preserving Prediction Markets

Eclipse is a fully decentralized, **permissionless prediction market** built on **Solana** and powered by **MagicBlock Private Ephemeral Rollups (TEEs)** and **AI Agents**.

Prediction markets are powerful, but their public nature destroys trading alpha. Eclipse solves this by moving the active trading lifecycle into a shielded execution environment, while leveraging AI to autonomously spawn highly relevant, real-time markets.

**Your strategy stays private. The odds stay fair. The markets are permissionless.**

---

## The Problem

Prediction markets on blockchains are transparent by design. When you place a bet with high conviction, the entire world sees it:
- Your wallet address
- The exact amount you bet
- The side you took

This creates massive structural problems:
1. **Front-Running & MEV:** If you spot an edge and place a large order, bots see it in the mempool and front-run you. By the time your trade executes, the price has moved against you.
2. **Loss of Edge (Adverse Selection):** Traders with genuine alpha or inside information have no way to profit from it without instantly signaling the market and giving away their strategy to copy-traders.
3. **Stale Markets:** Creating markets manually is slow. In a fast-moving world, by the time a market is launched manually, the news has already been priced in.

##  Our Solution

**Eclipse** solves these issues by combining **Trusted Execution Environments (TEEs)** for absolute privacy with **AI Agents** for autonomous market creation.

When you trade on Eclipse, your funds are shielded into a MagicBlock TEE. The global market odds are visible, but **individual order sizes and trader identities are completely encrypted**. Traders can act on real information with massive size without moving the public chain until settlement.

---

## ⚡ Core Features

### 1.  Private by Default (The "Dark" Markets)
By utilizing MagicBlock's Ephemeral Rollups running inside a Trusted Execution Environment, Eclipse acts as a **Private Ephemeral Rollup (PER)**. 
- **Ephemeral:** When a market is created, its state transitions are delegated *off* the Solana L1 and into the MagicBlock TEE.
- **Private:** Trades, bids, asks, and positions are shielded from the public mempool. Whales cannot be front-run.
- **Settlement:** When the market resolves, the TEE halts ephemeral execution and commits the final, settled state back to the Solana L1 for public redemption.

### 2. AI-Driven Autonomous Markets
Eclipse features a backend AI Agent (powered by Google Gemini) that autonomously scrapes global news, Twitter, and crypto trends to instantly spin up timely prediction markets on-chain. While the AI acts as a primary market creator to ensure fresh liquidity, the protocol itself remains entirely open.

### 3.  100% Permissionless
There are no gatekeepers, whitelist databases, or centralized admin checks. Deployed natively on the Solana L1:
- **Anyone** can call the `create_market` instruction to launch their own market.
- **Anyone** can provide liquidity.
- **Anyone** can trade.

### 4. 📈 Pythagorean Bonding Curve AMM
Eclipse utilizes a **Pythagorean Bonding Curve** (`x² + y² = r²`) rather than a traditional order book or CPMM. This curve is heavily optimized for binary prediction markets, ensuring prices accurately reflect market probabilities while maintaining deep liquidity even in one-sided events.

---

## The Trade Flow

1. **Market Creation & Delegation:**
   A user (or the AI Agent) creates a new prediction market on the Solana L1. Using the `#[delegate]` macro, the newly created market accounts are immediately delegated off the public network and into the MagicBlock TEE validator.

2. **Deposit & Shield Funds:**
   Users connect their Phantom wallet and deposit Base USDC. The UI uses the MagicBlock Payments API to instantly bridge this into **Shielded USDC** inside the Ephemeral Vault.
   
3. **Private Trading (0-Latency):**
   Users buy YES or NO tokens using their Shielded USDC. These transactions are routed directly to the Ephemeral RPC. They execute with zero gas fees, zero latency, and absolute privacy.

4. **Resolution & State Commit (Commit-at-close):**
   Once the event concludes, the oracle (which can be the AI Agent) determines the outcome (YES or NO) and triggers the resolution. Using the `#[commit]` macro, the market is pulled out of the private rollup, and the final state is permanently written back to the public Solana blockchain.

5. **Redemption:**
   Holders of the winning token burn their shares to redeem their portion of the USDC prize pool on the base layer.

---

## Tech Stack

- **Smart Contracts:** Rust & Anchor framework (v0.32.1)
- **Privacy Engine:** MagicBlock Ephemeral Rollups (`@magicblock-labs/ephemeral-rollups-sdk`)
- **Frontend:** Next.js 14, React, TailwindCSS
- **Backend API & AI Agent:** Express.js, Google Gemini Pro
- **Blockchain:** Solana Devnet

---

##  Running Locally

### 1. Prerequisites
- Node.js (v18+)
- Solana CLI & Anchor 0.32+
- Phantom Wallet (Set to Devnet)

### 2. Install Dependencies
```bash
npm install
cd apps/web && npm install
cd ../api && npm install
```

### 3. Start the Backend API & AI Agent
The backend indexer must be running to serve markets and run the AI Agent.
```bash
cd apps/api
cp .env.example .env
```
*(Ensure `SOLANA_PRIVATE_KEY` and `GEMINI_API_KEY` are set in the `.env`)*

```bash
npm run dev
```

### 4. Start the Web App
In a new terminal window:
```bash
cd apps/web
cp .env.example .env
npm run dev
```

### 5. Start Trading
Open **[http://localhost:3000](http://localhost:3000)** in your browser. Connect your Devnet wallet, deposit some Devnet USDC, wrap it into the TEE, and start trading on private AI-generated markets!
