import { Router } from 'express';
import { cryptoPriceService } from '../services/crypto-prices';

const router = Router();

/**
 * GET /api/prices
 * Get current crypto prices
 */
router.get('/', async (req, res) => {
  try {
    const prices = await cryptoPriceService.fetchPrices();
    res.json({
      success: true,
      data: {
        prices,
        status: cryptoPriceService.getStatus(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /api/prices/:symbol
 * Get price for specific coin
 */
router.get('/:symbol', async (req, res) => {
  try {
    const price = await cryptoPriceService.getPrice(req.params.symbol);
    if (!price) {
      return res.status(404).json({
        success: false,
        error: 'Coin not found',
      });
    }
    res.json({
      success: true,
      data: price,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /api/prices/markets/generate
 * Generate market ideas based on current prices
 */
router.get('/markets/generate', async (req, res) => {
  try {
    const markets = await cryptoPriceService.generatePriceBasedMarkets();
    res.json({
      success: true,
      data: {
        markets,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

export default router;
