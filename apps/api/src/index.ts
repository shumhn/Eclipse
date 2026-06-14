// Load environment variables FIRST, before any other imports
import dotenv from 'dotenv';
import path from 'path';

// Load .env - try multiple paths for different execution contexts
// In production (Vercel), env vars are set via dashboard
if (process.env.NODE_ENV !== 'production') {
  const envPaths = [
    path.resolve(process.cwd(), '.env'),                    // From api directory
    path.resolve(process.cwd(), 'apps/api/.env'),           // From monorepo root
  ];

  for (const envPath of envPaths) {
    const result = dotenv.config({ path: envPath });
    if (!result.error && process.env.SOLANA_RPC_URL) {
      console.log('Loaded .env from:', envPath);
      break;
    }
  }
}

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import marketRoutes from './routes/markets';
import tradingRoutes from './routes/trading';
import agentRoutes from './routes/agent';
import privacyRoutes from './routes/privacy';
import pricesRoutes from './routes/prices';
import orderbookRoutes from './routes/orderbook';
import darkMarketsRoutes from './routes/darkMarkets';

const app = express();
const port = process.env.PORT || 3001;

// CORS configuration for production and development
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  process.env.FRONTEND_URL,
  // Vercel preview URLs
].filter(Boolean) as string[];

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    // Allow Vercel preview deployments
    if (origin.includes('.vercel.app')) return callback(null, true);

    // Check allowed origins
    if (allowedOrigins.includes(origin)) return callback(null, true);

    callback(null, true); // Allow all for hackathon demo
  },
  credentials: true,
}));
app.use(express.json());

// Routes
app.use('/api/markets', marketRoutes);
app.use('/api/trading', tradingRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/privacy', privacyRoutes);
app.use('/api/prices', pricesRoutes);
app.use('/api/orderbook', orderbookRoutes);
app.use('/api/dark-markets', darkMarketsRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Only start the server if not in serverless environment
if (process.env.VERCEL !== '1') {
  app.listen(port, () => {
    console.log(`Eclipse API running on port ${port}`);
  });
}

// Export for Vercel serverless
export default app;