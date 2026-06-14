/**
 * Dark Markets Service (MagicBlock Edition)
 *
 * In the old codebase this handled DAC-wrapped tokens and Inco FHE.
 * Now all privacy is handled by MagicBlock TEE — every market is "dark" by default.
 */

import { PublicKey } from '@solana/web3.js';

// USDC Devnet mint — the only collateral we use now
export const USDC_MINT = new PublicKey('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr');

// Legacy constants kept for backward compatibility with routes that reference them
export const DAC_MINT = USDC_MINT; // No separate DAC token anymore
export const DAC_PROGRAM_ID = PublicKey.default;
export const INCO_LIGHTNING_PROGRAM_ID = PublicKey.default;

// No hardcoded V3 markets — we now fetch everything from the chain
export const V3_DARK_MARKETS: { address: string; question: string; yesMint: string; noMint: string }[] = [];
export const V3_USDC_MARKETS: { address: string; question: string; yesMint: string; noMint: string }[] = [];
export const ALL_V3_MARKETS = [...V3_DARK_MARKETS, ...V3_USDC_MARKETS];

/**
 * With MagicBlock TEE every market is "dark" (shielded), so this always returns false
 * for the old DAC-specific check but the UI can treat all markets as private.
 */
export function isDarkMarket(_collateralToken: string): boolean {
  return false; // All markets now use USDC via MagicBlock TEE
}
