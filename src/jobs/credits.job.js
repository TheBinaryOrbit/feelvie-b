import cron from 'node-cron';
import { logger } from '../utils/logger.js';
import { syncAllActive } from '../services/subscription.service.js';
import { expireLots } from '../services/wallet.service.js';
import { recoverStale } from '../services/generation.service.js';

let running = false;

// Grants monthly credits that are due (yearly plans get one lot per month) and expires old lots.
export const runCreditsJob = async (now = new Date()) => {
  if (running) return null;
  running = true;
  try {
    const grants = await syncAllActive(now);
    const expiry = await expireLots(now);
    if (grants.lots || expiry.credits) {
      logger.info(`[credits job] granted ${grants.lots} lot(s), expired ${expiry.credits} credit(s)`);
    }
    return { grants, expiry };
  } catch (err) {
    logger.error(`[credits job] failed: ${err.message}`);
    return null;
  } finally {
    running = false;
  }
};

// Fails and refunds generations stuck in "processing", for example after a restart.
export const runGenerationRecovery = async (now = new Date()) => {
  try {
    const recovered = await recoverStale(now);
    if (recovered) logger.info(`[generation recovery] refunded ${recovered} stuck generation(s)`);
    return recovered;
  } catch (err) {
    logger.error(`[generation recovery] failed: ${err.message}`);
    return 0;
  }
};

// Credits: minute 5 of every hour. Generation recovery: every 10 minutes. Both also run
// once shortly after startup.
export const startCreditsJob = () => {
  const tasks = [
    cron.schedule('5 * * * *', () => runCreditsJob()),
    cron.schedule('*/10 * * * *', () => runGenerationRecovery()),
  ];
  setTimeout(() => {
    runCreditsJob();
    runGenerationRecovery();
  }, 10_000).unref();
  logger.info('[jobs] credits scheduled hourly, generation recovery every 10 minutes');
  return { stop: () => tasks.forEach((task) => task.stop()) };
};
