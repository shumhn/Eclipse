# Eclipse

Privacy for prediction markets on Solana. Hide your bet sizes from front-runners.

## The Problem

Prediction markets are transparent by design. When you place a bet, everyone sees it:
- Your wallet address
- The amount you bet
- Which side you took

This creates problems.

If you have conviction on a market and want to bet big, bots see your order the moment it hits. They copy it. They front-run it. By the time your trade executes, the price has moved against you.

Large traders lose their edge. Retail traders get squeezed. Market makers face adverse selection. The people with real information have no way to profit from it without revealing that information.

## Our Solution

Eclipse encrypts your bet amounts using Fully Homomorphic Encryption.

When you bet on a Dark Market:
1. Your USDC is wrapped into DAC (Eclipse Confidential) tokens
2. The amount is encrypted using Inco Network's FHE
3. Your bet is placed with the encrypted amount
4. Other traders see activity happening, but not the size
5. Market resolves, DAC is unwrapped back to USDC

You interact with USDC. We handle the privacy layer automatically.

## How It Works

### DAC Token

We built a custom SPL token program called DAC (Eclipse Confidential).

When you deposit USDC:
- USDC goes into a vault
- You receive an encrypted balance
- The balance is stored as a 128-bit ciphertext handle
- Only you can decrypt it (through Inco's co-validator)

The vault is 1:1 backed. Every DAC token has USDC behind it.

### Dark Markets

Markets using DAC as collateral are Dark Markets. They work like normal prediction markets except:

| Normal Market | Dark Market |
|---------------|-------------|
| Bet sizes visible | Bet sizes encrypted |
| Easy to front-run | Cannot see individual bets |
| Everyone copies winners | Strategy stays private |

The market odds are still public. Total volume is visible. But individual positions are hidden.

### The Trade Flow

1. Connect Phantom wallet
2. Select a Dark Market
3. Enter how much USDC you want to bet
4. We wrap your USDC to DAC in the same transaction
5. The bet is placed with your encrypted DAC
6. You sign one transaction, done

When the market resolves, winning positions are unwrapped to USDC automatically.

## Technical Details

### Deployed Contracts

| Component | Address (Devnet) |
|-----------|------------------|
| DAC Program | `ByaYNFzb2fPCkWLJCMEY4tdrfNqEAKAPJB3kDX86W5Rq` |
| DAC SPL Mint | `JBxiN5BBM8ottNaUUpWw6EFtpMRd6iTnmLYrhZB5ArMo` |
| Mint Authority PDA | `TtFoW2UtEqkVGiGtbwwnzMxyGk1JyneqeNGiZEhcDRJ` |
| Inco Lightning | `5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj` |

### Encryption

We use Inco Network for FHE. The encryption happens through their Lightning program on Solana.

When you deposit USDC:
```
USDC amount (plaintext) -> Inco Lightning CPI -> Balance handle (ciphertext)
```

The handle is a reference to encrypted data. Arithmetic operations (add, subtract) happen on the handles directly. The actual values never exist unencrypted on-chain.

### Client-Side Signing

Your private key never touches our server. The flow:
1. Client requests unsigned transaction
2. Server builds it with the right accounts
3. Client signs with Phantom
4. Client submits signed transaction

If our server gets compromised, your funds are safe.

## What We Built

### Frontend (Next.js)
- Market browser with Dark Market filter
- Phantom wallet integration
- Encrypted balance display
- One-click betting with auto-wrapping

### Backend (Express)
- Dark Markets API
- CORE Protocol integration
- Privacy-preserving order book
- AI agent for market creation

### On-Chain (Anchor)
- DAC token program
- Inco Lightning integration
- Deposit/withdraw/transfer instructions

## The Stack

- Solana (devnet)
- Anchor 0.31.1
- Inco Network FHE
- CORE Protocol
- Next.js 14
- Express.js
- Phantom React SDK
- Google Gemini (AI agent)

## Why This Matters

### For Traders
No more front-running. Your strategy stays private. You can bet with conviction without signaling it to everyone.

### For Markets
Better price discovery. Traders with real information can act on it. Liquidity improves when large orders do not move price before execution.

### For the Space
First real implementation of private betting on Solana using FHE. Shows that prediction markets can be both transparent (market-level) and private (position-level).

## Limitations

This is an experimental project.

- Running on devnet only
- DAC program not audited
- Inco integration uses alpha endpoints
- CORE SDK does not expose transaction building for client-side signing (workaround in place)

Do not use with real funds.

## What's Next

1. Mainnet deployment after security audit
2. Full Inco SDK integration for withdrawal decryption
3. Work with CORE team on native DAC market support
4. Batch transactions for multiple bets
5. MEV protection for transaction submission

## Demo

Visit the web app and:
1. Connect Phantom (set to devnet)
2. Click "Eclipse" filter on markets page
3. Pick a market
4. Enter bet amount
5. Sign the transaction
6. Your position is now encrypted

Check the order book page to see aggregate activity without individual positions.

---

Built on Solana
