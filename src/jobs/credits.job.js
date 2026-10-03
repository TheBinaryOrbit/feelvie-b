import cron from 'node-cron';
import { logger } from '../utils/logger.js';
import { syncAllActive } from '../services/subscription.service.js';
import { expireLots } from '../services/wallet.service.js';
import { recoverStale } from '../services/generation.service.js';
import { expireUnpaid } from '../services/order.service.js';

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

// Cancels online orders that were not paid within the payment window and releases their stock.
export const runOrderExpiry = async (now = new Date()) => {
  try {
    const expired = await expireUnpaid(now);
    if (expired) logger.info(`[order expiry] cancelled ${expired} unpaid order(s)`);
    return expired;
  } catch (err) {
    logger.error(`[order expiry] failed: ${err.message}`);
    return 0;
  }
};

// Credits: minute 5 of every hour. Generation recovery and order expiry: every 10 minutes.
// All also run once shortly after startup.
export const startCreditsJob = () => {
  const tasks = [
    cron.schedule('5 * * * *', () => runCreditsJob()),
    cron.schedule('*/10 * * * *', () => {
      runGenerationRecovery();
      runOrderExpiry();
    }),
  ];
  setTimeout(() => {
    runCreditsJob();
    runGenerationRecovery();
    runOrderExpiry();
  }, 10_000).unref();
  logger.info('[jobs] credits scheduled hourly, generation recovery and order expiry every 10 minutes');
  return { stop: () => tasks.forEach((task) => task.stop()) };
};
