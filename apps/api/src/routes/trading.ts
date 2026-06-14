import { Router } from 'express';
import { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';
import bs58 from 'bs58';
import { coreService as magicblockService } from '../services/magicblock-indexer';
import { z } from 'zod';

const router = Router();

// USDC Devnet mint address
const USDC_DEVNET_MINT = new PublicKey('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr');

// ============================================================================
// Execute trade (server-side — uses the server wallet)
// ============================================================================
const executeTradeSchema = z.object({
  market: z.string(),
  side: z.enum(['yes', 'no']),
  amount: z.string(),
});

// ============================================================================
// Prepare trade (client-side — returns unsigned transaction)
// ============================================================================
const prepareTradeSchema = z.object({
  market: z.string(),
  side: z.enum(['yes', 'no']),
  amountUsdc: z.number(), // Expecting USDC amount
  walletAddress: z.string(),
});

const preparePositionSchema = z.object({
  market: z.string(),
  amountUsdc: z.number(),
  walletAddress: z.string(),
});

const delegatePositionSchema = z.object({
  market: z.string(),
  walletAddress: z.string(),
});

router.post('/prepare', async (req, res) => {
  try {
    const { market, side, amountUsdc, walletAddress } = prepareTradeSchema.parse(req.body);
    console.log(`[Trading] Prepare: market=${market}, side=${side}, amount=${amountUsdc}, wallet=${walletAddress}`);

    const tx = await magicblockService.prepareTradeTransaction({
      market,
      side,
      amountUsdc,
      walletAddress,
    });

    res.json({
      success: true,
      data: {
        transaction: tx.serialize({ requireAllSignatures: false }).toString('base64'),
      },
    });
  } catch (error) {
    console.error('[Trading] Prepare error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/prepare-position', async (req, res) => {
  try {
    const { market, amountUsdc, walletAddress } = preparePositionSchema.parse(req.body);
    console.log(`[Trading] Prepare position: market=${market}, amount=${amountUsdc}, wallet=${walletAddress}`);

    const result = await magicblockService.preparePositionSetupTransaction({
      market,
      amountUsdc,
      walletAddress,
    });

    res.json({
      success: true,
      data: {
        transaction: result.transaction.serialize({ requireAllSignatures: false }).toString('base64'),
        positionAddress: result.positionAddress,
        alreadyExists: result.alreadyExists,
        sendTo: 'base',
      },
    });
  } catch (error) {
    console.error('[Trading] Prepare position error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/delegate-position', async (req, res) => {
  try {
    const { market, walletAddress } = delegatePositionSchema.parse(req.body);
    console.log(`[Trading] Delegate position: market=${market}, wallet=${walletAddress}`);

    const result = await magicblockService.delegatePosition(market, walletAddress);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[Trading] Delegate position error:', error);
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

router.post('/prepare-private', async (req, res) => {
  try {
    const { market, side, amountUsdc, walletAddress } = prepareTradeSchema.parse(req.body);
    console.log(`[Trading] Prepare private: market=${market}, side=${side}, amount=${amountUsdc}, wallet=${walletAddress}`);

    const result = await magicblockService.preparePrivateTradeTransaction({
      market,
      side,
      amountUsdc,
      walletAddress,
    });

    res.json({
      success: true,
      data: {
        transaction: result.transaction.serialize({ requireAllSignatures: false }).toString('base64'),
        positionAddress: result.positionAddress,
        sendTo: 'ephemeral',
      },
    });
  } catch (error) {
    console.error('[Trading] Prepare private error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/execute', async (req, res) => {
  try {
    const { market, side, amount } = executeTradeSchema.parse(req.body);
    console.log(`[Trading] Execute: market=${market}, side=${side}, amount=${amount}`);

    const result = await magicblockService.executeTrade({ market, side, amount: BigInt(amount) });

    res.json({
      success: true,
      data: {
        signature: result?.signature || null,
        market,
        side,
        amount,
        executedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[Trading] Execute failed:', error);
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// ============================================================================
// Get market prices and liquidity
// ============================================================================
router.get('/market/:marketId/info', async (req, res) => {
  try {
    const { marketId } = req.params;
    const marketInfo = await magicblockService.getMarketInfo(marketId);

    if (!marketInfo) {
      res.status(404).json({ success: false, error: 'Market not found' });
      return;
    }

    const yesSupply = parseInt(marketInfo.account.yes_token_supply_minted, 16) || 1;
    const noSupply = parseInt(marketInfo.account.no_token_supply_minted, 16) || 1;
    const total = yesSupply + noSupply;

    const prices =
      total > 2
        ? {
            yes: Math.round((noSupply / total) * 100) / 100,
            no: Math.round((yesSupply / total) * 100) / 100,
          }
        : { yes: 0.5, no: 0.5 };

    res.json({
      success: true,
      data: {
        market: marketInfo,
        prices,
        liquidity: {
          yesSupply: yesSupply.toString(),
          noSupply: noSupply.toString(),
          totalSupply: total.toString(),
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ============================================================================
// Submit a client-signed transaction
// ============================================================================
const submitTransactionSchema = z.object({
  signedTransaction: z.string(), // Base64 encoded signed transaction
});

router.post('/submit', async (req, res) => {
  try {
    const { signedTransaction } = submitTransactionSchema.parse(req.body);
    console.log('[Trading] Submitting signed transaction');

    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');

    const transactionBuffer = Buffer.from(signedTransaction, 'base64');
    const signature = await connection.sendRawTransaction(transactionBuffer, {
      skipPreflight: false,
    });
    await connection.confirmTransaction(signature, 'confirmed');

    console.log(`[Trading] Confirmed: ${signature}`);

    res.json({
      success: true,
      data: {
        signature,
        executedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[Trading] Submit failed:', error);
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// ============================================================================
// Server wallet status (diagnostic)
// ============================================================================
router.get('/status', async (_req, res) => {
  try {
    const privateKey = process.env.SOLANA_PRIVATE_KEY;
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

    if (!privateKey) {
      res.json({ success: true, data: { configured: false, error: 'SOLANA_PRIVATE_KEY not set' } });
      return;
    }

    const keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
    const connection = new Connection(rpcUrl);
    const walletAddress = keypair.publicKey.toString();

    const solBalance = await connection.getBalance(keypair.publicKey);

    let usdcBalance = 0;
    let usdcAccount: string | null = null;
    try {
      const usdcAta = await getAssociatedTokenAddress(USDC_DEVNET_MINT, keypair.publicKey);
      const accountInfo = await getAccount(connection, usdcAta);
      usdcBalance = Number(accountInfo.amount) / 1_000_000;
      usdcAccount = usdcAta.toString();
    } catch {
      // Token account doesn't exist
    }

    res.json({
      success: true,
      data: {
        configured: true,
        wallet: walletAddress,
        solBalance: solBalance / LAMPORTS_PER_SOL,
        usdcMint: USDC_DEVNET_MINT.toString(),
        usdcAccount,
        usdcBalance,
        canTrade: usdcBalance > 0,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

const resolveMarketSchema = z.object({
  market: z.string(),
  outcome: z.enum(['yes', 'no']),
});

router.post('/resolve', async (req, res) => {
  try {
    const { market, outcome } = resolveMarketSchema.parse(req.body);
    console.log(`[Trading] Resolve market=${market}, outcome=${outcome}`);

    const result = await magicblockService.resolveMarketAndCommit(market, outcome);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[Trading] Resolve error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

const prepareSettleSchema = z.object({
  market: z.string(),
  walletAddress: z.string(),
});

router.post('/prepare-settle', async (req, res) => {
  try {
    const { market, walletAddress } = prepareSettleSchema.parse(req.body);
    console.log(`[Trading] Prepare settle: market=${market}, wallet=${walletAddress}`);

    const result = await magicblockService.prepareSettleTransaction({ market, walletAddress });

    res.json({
      success: true,
      data: {
        transaction: result.transaction.serialize({ requireAllSignatures: false }).toString('base64'),
        positionAddress: result.positionAddress,
        sendTo: 'ephemeral',
      },
    });
  } catch (error) {
    console.error('[Trading] Prepare settle error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/commit-position', async (req, res) => {
  try {
    const { market, walletAddress } = prepareSettleSchema.parse(req.body);
    console.log(`[Trading] Commit position: market=${market}, wallet=${walletAddress}`);

    const result = await magicblockService.commitPosition(market, walletAddress);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[Trading] Commit position error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/prepare-claim', async (req, res) => {
  try {
    const { market, walletAddress } = prepareSettleSchema.parse(req.body);
    console.log(`[Trading] Prepare claim: market=${market}, wallet=${walletAddress}`);

    const result = await magicblockService.prepareClaimTransaction({ market, walletAddress });

    res.json({
      success: true,
      data: {
        transaction: result.transaction.serialize({ requireAllSignatures: false }).toString('base64'),
        sendTo: 'base',
      },
    });
  } catch (error) {
    console.error('[Trading] Prepare claim error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
