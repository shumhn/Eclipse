import { Router } from 'express';
import { z } from 'zod';
import { orderBookService } from '../services/orderbook';

const router = Router();

/**
 * Get aggregated order book data for a market
 */
router.get('/:marketAddress/aggregates', async (req, res) => {
  try {
    const { marketAddress } = req.params;
    const aggregates = await orderBookService.getMarketAggregates(marketAddress);

    res.json({
      success: true,
      data: aggregates
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

/**
 * Get a user's encrypted positions
 */
router.get('/user/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const portfolio = await orderBookService.getUserPositions(walletAddress);

    res.json({
      success: true,
      data: portfolio
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// Stubs for legacy endpoints that are no longer needed
router.post('/record', async (req, res) => {
  res.json({ success: true, message: 'Recorded via MagicBlock TEE natively' });
});

router.post('/activity', async (req, res) => {
  res.json({ success: true, data: [] });
});

export default router;
