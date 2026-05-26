import express from 'express';
import { webhookHandler } from './handlers/webhook.handler';
import logger from './utils/logger';

export function createApp(): express.Application {
  const app = express();

  // LINE Webhook requires raw body for signature verification
  app.use('/webhook', express.raw({ type: 'application/json' }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'MAC - My Agent Capture', timestamp: new Date().toISOString() });
  });

  // LINE Webhook
  app.post('/webhook', webhookHandler);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  // Error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('Unhandled error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Internal Server Error' });
  });

  return app;
}
