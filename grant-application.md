# Agentic Engineering Grant Application — Eclipse

> **Grant:** Agentic Engineering Grant by Superteam
> **Submit here:** https://superteam.fun/earn/grants/agentic-engineering
> **Grant Amount:** 200 USDG (fixed)
> **Applicant:** Suman Giri (github.com/shumhn)
> **Date:** June 24, 2026

---

## Step 1: Basics

**Project Title**
> Eclipse Prediction Market

**One Line Description**
> Private prediction market on Solana using MagicBlock TEE for zero-fee, MEV-protected trades that settle back to L1 on resolution.

**Applicant Name**
> Suman Giri

**TG Username**
> t.me/shu_mhn

**Wallet Address**
> Fkdd4QoUNv9r5MgkCz2iQxJBB6UAWxSdco6mKzPR9Zey

---

## Step 2: Details

**Project Details**

### Problem

The current landscape of AMMs and prediction markets on public blockchains suffers from MEV front-running and high transaction costs, severely degrading the user experience for high-frequency traders. Furthermore, traders' positions are public, preventing them from taking significant bets without revealing their strategies or market sentiment to competitors. High-frequency prediction markets cannot function efficiently on L1s without exposing traders to front-running and excessive gas fees.

### Solution

Eclipse Prediction Market solves this by integrating MagicBlock's Ephemeral Rollups (TEE). We've built a Pythagorean AMM bonding curve where all trading occurs inside a hardware-encrypted enclave. This provides zero-gas-fee, instant 20-millisecond trades with complete MEV protection. Most importantly, while the aggregate AMM odds remain visible, individual trade sizes and portfolio balances are shielded from the public L1 blockchain until the market resolves, creating a decentralized "dark pool" prediction market.

### How It Works

1. **User deposits USDC** — Funds are delegated from the Solana L1 into the MagicBlock TEE smart contract vault.
2. **Instant Private Trading** — The user trades YES/NO shares against the AMM bonding curve inside the Ephemeral Rollup with zero gas fees and 20ms latency.
3. **Shielded Positions** — No trades are broadcast to a public mempool, completely eliminating MEV bots.
4. **Market Resolution** — Once the oracle resolves the market outcome, the TEE pushes a cryptographic settlement proof (`ScheduledCommit`) back to the Solana L1, paying out the winners.

### Architecture

- **Frontend:** Next.js with MagicBlock TEE SDK integration for Auth Token generation.
- **Smart Contract:** Solana Anchor program deployed on Devnet (`79RQQN3A4HHrogrBTwUw5py8UMhhyKFFb1CmVGagZ55t`).
- **Oracles:** Pyth/Lazer network price feed integrations.
- **Rollup Layer:** MagicBlock Ephemeral Rollups (TEE).
- **Deployment:** Vercel (live at https://eclipse-predict.vercel.app).

---

**Deadline**
> 24 July 2026 (Asia/Calcutta)

---

**Proof of Work**

**Live Deployment:**
- 🌐 Production app: https://eclipse-predict.vercel.app

**GitHub Repositories:**
- 🔗 https://github.com/shumhn/Eclipse

**Development History (62 commits, fully AI-assisted using solana.new skills):**
```
b1782c8 optimize: switch to helius rpc and fast indexer
4309ccd polish market demo ui
51bc55c correct market quote math
88ac610 add private funding flow
e3c8783 fix amm market state
6437689 polish market UI components
988a614 style(ui): simplify claim success state by removing redundant checkmark and text
95bda3c fix(ui): route commit/undelegate transaction to TEE explorer
9a2959f feat(ui): add comprehensive transaction proof tracking to ClaimPanel
903735f fix(ui): route user to newly created market from success modal
45d393e fix(ui): default create market to exact current date and time
... and 51 more commits
```

**What's Built & Working:**
- ✅ Complete Pythagorean AMM Math Engine in Rust.
- ✅ Permissionless Market Creation.
- ✅ L1 Escrow Delegation & Undelegation via Anchor.
- ✅ Complete MagicBlock TEE integration for private state transitions.
- ✅ Frontend TEE Explorer integration to prove MEV-protected tx routing.
- ✅ Custom TEE Authentication Token fetcher.
- ✅ Live Demo on Vercel connected to Devnet RPC.

**Solana.new Skills Used:**
- `apply-grant` — This application
- Full project built end-to-end using agentic engineering workflow

---

**Personal X Profile**
> https://x.com/devsh_

**Personal GitHub Profile**
> https://github.com/shumhn

**Colosseum Crowdedness Score**
> ✅ Completed: Cluster v1-c3 (Solana Prediction Markets) - Score: 149 (Below Average / Unsaturated). See `competitive_analysis.md` for full breakdown.

**AI Session Transcript**
> ✅ Exported to `agent-session.jsonl` in the project root.
> Attach this file to the grant form as proof of AI-assisted development.

---

## Step 3: Milestones

**Goals and Milestones**

**Milestone 1 — "Sell" Feature Implementation (Week 1)**
- Implement `PythagoreanCurve::get_reserves_to_release` math in the Anchor contract.
- Build `sell_private_prediction_er` instruction for early position exits.
- Wire frontend TradePanel to new sell backend endpoint.

**Milestone 2 — UI/UX Overhaul & Mobile Polish (Week 2)**
- Redesign the market discovery dashboard.
- Optimize mobile layout for seamless trading.
- Implement real-time price charts using the AMM reserve data.

**Milestone 3 — Mainnet-beta Deployment (Week 3)**
- Conduct thorough security testing of the TEE state transitions.
- Deploy the Anchor program to Solana Mainnet-beta.
- Register production MagicBlock Ephemeral Rollup nodes.

**Milestone 4 — Public Launch (Week 4)**
- Launch the public beta.
- Onboard initial liquidity providers.
- Execute the first 1,000 completely private, zero-fee trades.

---

**Primary KPI**
> 1,000 Total Private Trades executed on the platform, proving the demand for zero-fee, MEV-protected prediction markets.

---

**Final Tranche Reminder**
To receive the final tranche, you must submit:
1. Colosseum project link
2. GitHub repo (https://github.com/shumhn/Eclipse)
3. AI subscription receipt (Claude/Gemini)

---

## Files Ready to Submit

| File | Location | Status |
|------|----------|--------|
| Grant Application | `./grant-application.md` | ✅ Ready |
| Competitive Analysis | `./competitive_analysis.md` | ✅ Ready |
| Session Transcript | `./agent-session.jsonl` | ✅ Exported |

---

> **Submit here:** https://superteam.fun/earn/grants/agentic-engineering
