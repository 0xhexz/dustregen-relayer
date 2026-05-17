import express, { Express } from 'express';
import cors from 'cors';
import { createSponsorRouter } from './routes/sponsor';
import { errorMiddleware } from './middleware';
import { createIpRateLimiter, createAddressRateLimiter } from './rateLimit';
import { SponsorWallet } from '../wallet/sponsor';
import { ISponsorMutex } from '../queue/mutex';
import { DustMonitor } from '../monitor/dust';
import { NetworkConfig } from '../config/network';

export function createRelayerApp(
  cfg: NetworkConfig,
  sponsor: SponsorWallet,
  mutex: ISponsorMutex,
  monitor: DustMonitor,
): Express {
  const app = express();

  // Standard middleware
  app.use(cors());
  app.use(express.json());

  // IP-based rate limiting (global)
  app.use(createIpRateLimiter());

  // Health endpoint
  app.get('/health', (_req, res) => {
    const snapshot = monitor.current();
    res.json({
      status: 'healthy',
      service: 'dustregen-relayer',
      timestamp: new Date().toISOString(),
      network: 'midnight-preprod',
      pending: mutex.pending,
      dust: snapshot ? {
        dustSpecks: snapshot.dustSpecks.toString(),
        capacityPct: snapshot.capacityPct,
        nightStars: snapshot.nightStars.toString(),
      } : null,
    });
  });

  // Address-based rate limiting on sponsor route
  app.post('/sponsor', createAddressRateLimiter());

  // Sponsor route
  app.use(createSponsorRouter(cfg, sponsor, mutex));

  // Error middleware (must be last)
  app.use(errorMiddleware);

  return app;
}
