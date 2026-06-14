import { Router } from 'express';
import { z } from 'zod';
import { coreService as magicblockService } from '../services/magicblock-indexer';
import { marketTracker } from '../services/marketTracker';

const router = Router();

// ════════════════════════════════════════════════════════════════════
// GET /api/markets - Get all markets (tracked + MagicBlock)
// ════════════════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  try {
    // Get markets from the current MagicBlock indexer
    const coreMarkets = await magicblockService.getAllMarkets();

    // Merge with our tracked markets (tracked appear first)
    const mergedMarkets = marketTracker.mergeWithCOREMarkets(coreMarkets.data);

    res.json({
      success: true,
      data: {
        count: mergedMarkets.length,
        trackedCount: marketTracker.getStats().totalMarkets,
        data: mergedMarkets,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

// ════════════════════════════════════════════════════════════════════
// GET /api/markets/tracked - Get only our tracked markets
// ════════════════════════════════════════════════════════════════════
router.get('/tracked', async (req, res) => {
  try {
    const markets = marketTracker.getAllMarkets();
    const stats = marketTracker.getStats();

    res.json({
      success: true,
      data: {
        ...stats,
        markets,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

// ════════════════════════════════════════════════════════════════════
// GET /api/markets/:marketId - Get specific market info
// ════════════════════════════════════════════════════════════════════
router.get('/:marketId', async (req, res) => {
  try {
    const { marketId } = req.params;
    const tracked = marketTracker.getMarket(marketId);

    // Otherwise fetch from MagicBlock
    const market = await magicblockService.getMarketInfo(marketId);

    if (!market && tracked) {
      const normalizedMarket = marketTracker.toNormalizedMarket(tracked);
      res.json({
        success: true,
        data: {
          ...normalizedMarket,
          isDarkMarket: false,
          isV3: false,
          tradingEnabled: false,
        },
        isTracked: true,
      });
      return;
    }

    if (!market) {
      res.status(404).json({
        success: false,
        error: 'Market not found',
      });
      return;
    }

    const tradingEnabled = market.delegated && !market.account.resolved;
    const mergedMarket = tracked
      ? marketTracker.mergeWithCOREMarkets([market])[0]
      : market;

    res.json({
      success: true,
      data: {
        ...mergedMarket,
        isDarkMarket: false,
        isV3: mergedMarket.delegated,
        tradingEnabled,
      },
      isTracked: Boolean(tracked),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

// ════════════════════════════════════════════════════════════════════
// POST /api/markets/create - Create new market
// ════════════════════════════════════════════════════════════════════
const createMarketSchema = z.object({
  question: z.string().min(10, 'Question must be at least 10 characters'),
  initialLiquidity: z.number().min(1000000, 'Minimum 1 token (1000000 units)'),
  endTimeHours: z.number().min(1).max(8760), // 1 hour to 1 year
  collateralMint: z.string().optional(), // Optional - uses default if not provided
  useCustomOracle: z.boolean().optional().default(false),
});

router.post('/create', async (req, res) => {
  try {
    const { question, initialLiquidity, endTimeHours, collateralMint, useCustomOracle } =
      createMarketSchema.parse(req.body);

    const endTime = Math.floor(Date.now() / 1000) + endTimeHours * 60 * 60;

    console.log(`\n🏗️  Creating market: "${question.slice(0, 50)}..." on MagicBlock`);
    const result = await magicblockService.createPrivacyMarket({
      question,
      endTime,
      initialLiquidity: BigInt(initialLiquidity),
    });
    const trackedMarket = marketTracker.trackMarket({
      publicKey: result.marketAddress,
      question,
      creator: result.creator,
      collateralMint: collateralMint || '',
      initialLiquidity: initialLiquidity.toString(),
      endTime,
      transactionSignature: result.signature,
      isCustomOracle: useCustomOracle,
      creatorPosition: result.creatorPosition,
      marketDelegationSignature: result.delegationSignature,
      creatorPositionDelegationSignature: result.creatorPositionDelegationSignature,
      privateStateInitializationSignature: result.privateStateInitializationSignature,
    });

    console.log(`✅ Market created: ${result.marketAddress} (tx: ${result.signature})`);

    res.json({
      success: true,
      data: {
        marketAddress: result.marketAddress,
        signature: result.signature,
        question,
        creator: result.creator,
        endTime: new Date(endTime * 1000).toISOString(),
        isCustomOracle: useCustomOracle,
        delegated: result.delegated,
        delegationSignature: result.delegationSignature,
        creatorPositionDelegationSignature: result.creatorPositionDelegationSignature,
        privateStateInitializationSignature: result.privateStateInitializationSignature,
        creatorPosition: result.creatorPosition,
        tracked: {
          ...trackedMarket,
        },
      },
    });
  } catch (error) {
    console.error('❌ Market creation failed:', error);
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

// ════════════════════════════════════════════════════════════════════
// Legacy endpoint (kept for backward compatibility)
// ════════════════════════════════════════════════════════════════════
const legacyCreateMarketSchema = z.object({
  question: z.string().min(10),
  initialLiquidity: z.string(),
  endTime: z.string(),
});

router.post('/', async (req, res) => {
  try {
    const { question, initialLiquidity, endTime } =
      legacyCreateMarketSchema.parse(req.body);

    const result = await magicblockService.createPrivacyMarket({
      question,
      initialLiquidity: BigInt(initialLiquidity),
      endTime: parseInt(endTime, 10),
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

const resolveMarketSchema = z.object({
  outcome: z.enum(['yes', 'no']),
});

router.post('/:marketId/resolve', async (req, res) => {
  try {
    const { marketId } = req.params;
    const { outcome } = resolveMarketSchema.parse(req.body);

    const result = await magicblockService.resolveMarketAndCommit(marketId, outcome);
    marketTracker.recordResolution(marketId, {
      resolveSignature: result.resolveSignature,
      commitSignature: result.commitSignature,
    });

    res.json({
      success: true,
      data: {
        marketId,
        outcome,
        ...result,
      },
    });
  } catch (error) {
    console.error('❌ Market resolution failed:', error);
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

export default router;
