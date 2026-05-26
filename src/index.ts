import { createApp } from './app';
import { ENV } from './config';
import logger from './utils/logger';

async function main(): Promise<void> {
  const app = createApp();
  const port = ENV.PORT;

  app.listen(port, '0.0.0.0', () => {
    logger.info(`MAC Server started on port ${port}`);
    logger.info(`Webhook URL: ${ENV.WEBHOOK_URL || `http://localhost:${port}/webhook`}`);
    logger.info(`Agent: ${ENV.AGENT_NAME} / ${ENV.COMPANY_NAME}`);
  });
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
