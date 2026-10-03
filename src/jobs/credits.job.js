import cron from 'node-cron';
import { logger } from '../utils/logger.js';
import { syncAllActive } from '../services/subscription.service.js';
import { expireLots } from '../services/wallet.service.js';

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

// Runs at minute 5 of every hour, and once shortly after startup.
export const startCreditsJob = () => {
  const task = cron.schedule('5 * * * *', () => runCreditsJob());
  setTimeout(() => runCreditsJob(), 10_000).unref();
  logger.info('[credits job] scheduled hourly');
  return task;
};
