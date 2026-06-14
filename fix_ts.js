const fs = require('fs');
const path = require('path');

function replaceInFile(filePath, replacements) {
    const fullPath = path.resolve(__dirname, filePath);
    if (!fs.existsSync(fullPath)) return;
    let content = fs.readFileSync(fullPath, 'utf8');
    for (const [search, replace] of replacements) {
        content = content.split(search).join(replace);
    }
    fs.writeFileSync(fullPath, content);
}

// Fix TradePanel.tsx
replaceInFile('src/components/TradePanel.tsx', [
    ['const { isConnected, signTransaction } = usePhantom();', 'const { isConnected } = usePhantom();'],
    ['if (!walletAddress || !signTransaction) {', 'const phantom = (window as any).phantom?.solana;\n    if (!walletAddress || !phantom) {'],
    ['setError(\'Wallet not connected or missing signing capability\');', 'setError(\'Wallet not connected or Phantom missing\');'],
    ['signTransaction as any,', '(tx) => phantom.signTransaction(tx),']
]);

// Fix wrap/page.tsx
replaceInFile('src/app/wrap/page.tsx', [
    ['const { isConnected, signTransaction } = usePhantom();', 'const { isConnected } = usePhantom();'],
    ['if (!walletAddress || !amount || parseFloat(amount) <= 0 || !signTransaction) {', 'const phantom = (window as any).phantom?.solana;\n    if (!walletAddress || !amount || parseFloat(amount) <= 0 || !phantom) {'],
    ['setError(\'Invalid amount or missing wallet capabilities\');', 'setError(\'Invalid amount or Phantom missing\');'],
    ['signTransaction as any', '(tx) => phantom.signTransaction(tx)']
]);

// Fix unwrap/page.tsx
replaceInFile('src/app/unwrap/page.tsx', [
    ['const { isConnected, signTransaction, signMessage } = usePhantom();', 'const { isConnected } = usePhantom();'],
    ['if (!walletAddress || !signMessage) throw new Error("Wallet not fully connected");', 'const phantom = (window as any).phantom?.solana;\n    if (!walletAddress || !phantom) throw new Error("Wallet not fully connected");'],
    ['signMessage as any', 'async (msg: Uint8Array) => (await phantom.signMessage(msg)).signature'],
    ['if (!walletAddress || !amount || parseFloat(amount) <= 0 || !signTransaction) {', 'const phantom = (window as any).phantom?.solana;\n    if (!walletAddress || !amount || parseFloat(amount) <= 0 || !phantom) {'],
    ['setError(\'Invalid amount or missing wallet capabilities\');', 'setError(\'Invalid amount or Phantom missing\');'],
    ['signTransaction as any', '(tx) => phantom.signTransaction(tx)']
]);

// Fix markets/[id]/page.tsx
replaceInFile('src/app/markets/[id]/page.tsx', [
    ['isDarkMarket, ', ''],
    ['isDarkMarket={market.isDarkMarket}', ''],
    ['collateralToken={market.account.collateral_token}', '']
]);

// Fix MarketCard.tsx
replaceInFile('src/components/MarketCard.tsx', [
    ['isDarkMarket,', ''],
    ['isDarkMarket={market.isDarkMarket}', ''],
    ['{market.isDarkMarket && (', '{false && (']
]);

// Fix markets/page.tsx
replaceInFile('src/app/markets/page.tsx', [
    ['fetchDarkMarkets, isDarkMarket', 'fetchMarkets'],
    ['fetchDarkMarkets, ', 'fetchMarkets, '],
    ['fetchDarkMarkets', 'fetchMarkets'],
    ['m.isDarkMarket', 'false'],
    ['m.isV3', 'true']
]);

// Fix CreateMarketModal.tsx
replaceInFile('src/components/CreateMarketModal.tsx', [
    ['DAC_MINT, ', ''],
    ['collateralMint: isDarkMarket ? DAC_MINT : undefined,', 'collateralMint: undefined,']
]);

// Fix PhantomWalletButton.tsx
replaceInFile('src/components/PhantomWalletButton.tsx', [
    ['import { DacTokenClient, DAC_TOKEN_PROGRAM_ID, findDacMintPda, findDacAccountPda } from "@/lib/dac/client";', ''],
    ['dacInitialized: boolean;', ''],
    ['dacBalanceHandle: string | null;', ''],
    ['dacInitialized: false,', ''],
    ['dacBalanceHandle: null,', ''],
    ['let dacInitialized = false;', ''],
    ['let dacBalanceHandle: string | null = null;', ''],
    ['const dacClient = new DacTokenClient(connection);', ''],
    ['const dacAccount = await dacClient.getUserAccount(publicKey);', ''],
    ['if (dacAccount && dacAccount.state === \'Initialized\') {', 'if (false) {'],
    ['dacInitialized = true;', ''],
    ['if (dacAccount.balanceHandle > BigInt(0)) {', 'if (false) {'],
    ['dacBalanceHandle = dacAccount.balanceHandle.toString(16).slice(0, 12) + \'...\';', ''],
    ['dacInitialized,', ''],
    ['dacBalanceHandle,', ''],
    ['{/* DAC Confidential Token Section */}', '{/* DAC Confidential Token Section */}'],
    ['{balances.dacInitialized ? (', '{false ? ('],
    ['{balances.dacBalanceHandle || \'Empty\'}', '{\'Empty\'}']
]);

console.log("Replacements done");
