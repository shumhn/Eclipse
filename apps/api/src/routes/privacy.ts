import { Router } from 'express';

const router = Router();

/**
 * Privacy service status — now powered by MagicBlock TEE, not Inco FHE.
 */
router.get('/status', async (_req, res) => {
  try {
    res.json({
      success: true,
      data: {
        provider: 'MagicBlock Ephemeral Rollups (TEE)',
        status: 'active',
        mode: 'devnet',
        description: 'All trades execute inside a Trusted Execution Environment. Positions are hidden from the public ledger until the market resolves.',
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
