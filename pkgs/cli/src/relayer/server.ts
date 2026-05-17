import express, { Express } from 'express';
import path from 'path';
import cors from 'cors';
import { createSponsorRouter } from './routes/sponsor.js';
import { errorMiddleware } from './middleware.js';
import { createIpRateLimiter, createAddressRateLimiter } from './rateLimit.js';
import { SponsorWallet } from '../wallet/sponsor.js';
import { ISponsorMutex, IPoolAllocator } from '../queue/mutex.js';
import { DustMonitor } from '../monitor/dust.js';
import { NetworkConfig } from '../config/network.js';
import { RelayerMetrics } from './metrics.js';

export { RelayerMetrics } from './metrics.js';

export function createRelayerApp(
  cfg: NetworkConfig,
  sponsor: SponsorWallet,
  mutex: ISponsorMutex,
  monitor: DustMonitor,
  poolAllocator?: IPoolAllocator,
): Express {
  const app = express();

  const metrics: RelayerMetrics = { totalSponsored: 0, totalFailed: 0 };

  // Serve static files from public/ directory
  const publicPath = path.join(__dirname, '../../public');
  app.use(express.static(publicPath));

  // Standard middleware
  app.use(cors());
  app.use(express.json());

  // Health endpoint
  app.get('/health', (_req, res) => {
    const snapshot = monitor.current();
    res.json({
      status: 'healthy',
      service: 'dustregen-relayer',
      timestamp: new Date().toISOString(),
      network: 'midnight-preprod',
      pending: mutex.pending,
      totalSponsored: metrics.totalSponsored,
      totalFailed: metrics.totalFailed,
      dust: snapshot ? {
        dustSpecks: snapshot.dustSpecks.toString(),
        capacityPct: snapshot.capacityPct,
        nightStars: snapshot.nightStars.toString(),
      } : null,
    });
  });

  // IP-based rate limiting on sponsor route
  app.use('/sponsor', createIpRateLimiter());

  // Address-based rate limiting on sponsor route
  app.post('/sponsor', createAddressRateLimiter());

  // Sponsor route
  app.use(createSponsorRouter(cfg, sponsor, mutex, metrics, monitor, poolAllocator));

  // Error middleware (must be last)
  app.use(errorMiddleware);

  return app;
}
