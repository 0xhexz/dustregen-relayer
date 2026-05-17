import express from 'express';
import cors from 'cors';
import { createLogger } from '../logger.js';

const logger = createLogger('relayer');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'dustregen-relayer',
    timestamp: new Date().toISOString(),
    network: 'midnight-preview'
  });
});

// Start the relayer server
export async function startRelayer(port: number = 3000, host: string = 'localhost'): Promise<void> {
  return new Promise((resolve) => {
    const server = app.listen(port, host, () => {
      logger.info(`Relayer server started on http://${host}:${port}`);
      logger.info(`Health check: http://${host}:${port}/health`);
    });

    // Handle graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('Received SIGTERM, shutting down gracefully');
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });
  });
}