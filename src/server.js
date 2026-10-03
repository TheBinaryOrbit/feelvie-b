import app from './app.js';
import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { logger } from './utils/logger.js';

const start = async () => {
  await connectDB();

  const server = app.listen(env.port, () => {
    logger.info(`Server running in ${env.nodeEnv} mode on http://localhost:${env.port}`);
  });

  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down gracefully`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection:', reason);
    server.close(() => process.exit(1));
  });
};

start();
