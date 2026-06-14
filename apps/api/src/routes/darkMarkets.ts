import { Router } from 'express';
import { coreService } from '../services/magicblock-indexer';

const router = Router();

/**
 * Dark Markets are now fully handled by MagicBlock TEE.
 * Every market is "dark" (shielded) by default.
 * This route returns all markets from the indexer.
 */
router.get('/', async (_req, res) => {
  try {
    const markets = await coreService.getAllMarkets();

    res.json({
      success: true,
      data: {
        count: markets.count,
        data: markets.data,
        privacyInfo: {
          provider: 'MagicBlock Ephemeral Rollups (TEE)',
          note: 'All markets are shielded by default — positions are hidden until resolution.',
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * Get a specific market
 */
router.get('/:marketAddress', async (req, res) => {
  try {
    const { marketAddress } = req.params;
    const market = await coreService.getMarketInfo(marketAddress);

    if (!market) {
      res.status(404).json({ success: false, error: 'Market not found' });
      return;
    }

    const yesSupply = parseInt(market.account.yes_token_supply_minted, 16) || 1;
    const noSupply = parseInt(market.account.no_token_supply_minted, 16) || 1;
    const total = yesSupply + noSupply;

    const prices =
      total > 2
        ? { yes: Math.round((noSupply / total) * 100) / 100, no: Math.round((yesSupply / total) * 100) / 100 }
        : { yes: 0.5, no: 0.5 };

    res.json({
      success: true,
      data: {
        market,
        prices,
        liquidity: { yesSupply: yesSupply.toString(), noSupply: noSupply.toString(), totalSupply: total.toString() },
        privacyInfo: { provider: 'MagicBlock TEE', note: 'Shielded market — trades are private.' },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
