import express from 'express';
import cors from 'cors';
import { createLogger } from '../config/logger';
import { validateSponsorshipRequest } from '@dustregen/contract';
import { sponsorTransaction } from '../transaction/sponsor';

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
    network: 'midnight-testnet-02'
  });
});

// Sponsorship endpoint
app.post('/api/v1/sponsor', async (req, res) => {
  try {
    const { user, gasAmount, userSignature } = req.body;
    
    // Validate request
    if (!validateSponsorshipRequest({ user, gasAmount: BigInt(gasAmount), userSignature })) {
      return res.status(400).json({ error: 'Invalid sponsorship request' });
    }
    
    logger.info(`Processing sponsorship for user: ${user}`);
    
    // Sponsor the transaction
    const result = await sponsorTransaction({
      user,
      gasAmount: BigInt(gasAmount),
      userSignature
    });
    
    res.json({
      success: true,
      transactionId: result.transactionId,
      sponsoredAmount: result.sponsoredAmount,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Sponsorship failed:', error);
    res.status(500).json({ 
      error: 'Sponsorship failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Relayer status endpoint
app.get('/api/v1/status', (req, res) => {
  res.json({
    active: true,
    totalSponsored: 0, // Would come from contract
    feePercentage: 0, // Would come from contract
    uptime: process.uptime()
  });
});

// Start the relayer server
export async function startRelayer(port: number = 3000, host: string = 'localhost'): Promise<void> {
  return new Promise((resolve) => {
    const server = app.listen(port, host, () => {
      logger.info(`Relayer server started on http://${host}:${port}`);
      logger.info(`Health check: http://${host}:${port}/health`);
      logger.info(`Sponsorship API: http://${host}:${port}/api/v1/sponsor`);
      
      // Don't resolve to keep server running
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