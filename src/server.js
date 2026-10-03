import app from './app.js';
import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { logger } from './utils/logger.js';
import { startCreditsJob } from './jobs/credits.job.js';

const start = async () => {
  await connectDB();

  const server = app.listen(env.port, () => {
    logger.info(`Server running in ${env.nodeEnv} mode on http://localhost:${env.port}`);
  });

  // Run with JOBS_ENABLED=false on extra instances if you scale out. The job is safe to
  // run on several instances, but one is enough.
  const creditsTask = env.jobs.enabled ? startCreditsJob() : null;

  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down gracefully`);
    creditsTask?.stop();
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
