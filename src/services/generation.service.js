import { env } from '../config/env.js';
import { Generation } from '../models/generation.model.js';
import { ApiError } from '../utils/ApiError.js';
import { paginate } from '../utils/pagination.js';
import { logger } from '../utils/logger.js';
import * as walletService from './wallet.service.js';
import * as vtonService from './vton.service.js';

export const TRYON_CREDIT_COST = 1;
// A user can have this many generations running at the same time.
export const MAX_CONCURRENT_PER_USER = 2;
// A generation still "processing" after this long is treated as lost (for example a crash).
export const STALE_AFTER_MS = 10 * 60 * 1000;

const failAndRefund = async (generation, message) => {
  let refund = null;
  if (generation.debitTransaction) {
    refund = await walletService.refundDebit(generation.debitTransaction, {
      description: 'Refund: try-on generation failed',
      generation: generation._id,
    });
  }
  generation.status = 'failed';
  generation.error = message;
  generation.completedAt = new Date();
  generation.durationMs = generation.completedAt - generation.createdAt;
  if (refund) {
    generation.refundTransaction = refund._id;
    generation.creditsRefunded = refund.creditsRefunded;
  }
  return generation.save();
};

/**
 * Charges 1 credit, sends the images to the try-on service and waits for the result.
 * If the service fails or times out, the credit is refunded and the generation is
 * saved as failed.
 */
export const createTryOn = async (user, files) => {
  const personImage = files?.personImage?.[0];
  const garmentImage = files?.garmentImage?.[0];
  const missing = [!personImage && 'personImage', !garmentImage && 'garmentImage'].filter(Boolean);
  if (missing.length) {
    throw ApiError.badRequest('Validation failed', missing.map((field) => `${field} file is required`));
  }

  // Fail before charging anything if the try-on service is not set up.
  if (!env.vton.apiKey) throw new ApiError(503, 'Image generation is not configured. Set VTON_API_KEY');

  const balance = await walletService.getBalance(user._id);
  if (balance < TRYON_CREDIT_COST) {
    throw new ApiError(402, 'Not enough credits. Subscribe or buy a credit pack to generate images', {
      balance,
      required: TRYON_CREDIT_COST,
    });
  }

  const running = await Generation.countDocuments({
    user: user._id,
    status: 'processing',
    createdAt: { $gt: new Date(Date.now() - STALE_AFTER_MS) },
  });
  if (running >= MAX_CONCURRENT_PER_USER) {
    throw ApiError.tooManyRequests(`You can run ${MAX_CONCURRENT_PER_USER} generations at a time. Wait for one to finish`);
  }

  const generation = await Generation.create({ user: user._id, type: 'tryon', status: 'processing' });

  try {
    const debit = await walletService.debitCredits({
      userId: user._id,
      credits: TRYON_CREDIT_COST,
      source: 'generation',
      description: 'Virtual try-on generation',
      generation: generation._id,
    });
    generation.debitTransaction = debit._id;
    generation.creditsCharged = TRYON_CREDIT_COST;
    await generation.save();
  } catch (err) {
    // Lost a race for the last credit. Nothing was charged.
    await Generation.deleteOne({ _id: generation._id });
    if (err.statusCode === 400 && /Insufficient/.test(err.message)) {
      throw new ApiError(402, 'Not enough credits. Subscribe or buy a credit pack to generate images');
    }
    throw err;
  }

  let result;
  try {
    result = await vtonService.generateTryOn({ personImage, garmentImage });
  } catch (err) {
    const failed = await failAndRefund(generation, err.message || 'Image generation failed');
    const status = [503, 504].includes(err.statusCode) ? err.statusCode : 502;
    throw new ApiError(status, `${err.message || 'Image generation failed'}. Your credit has been refunded`, {
      generationId: String(failed._id),
      creditsRefunded: failed.creditsRefunded,
    });
  }

  generation.set({
    status: 'completed',
    personImageUrl: result.personImageUrl,
    garmentImageUrl: result.garmentImageUrl,
    outputImageUrl: result.outputImageUrl,
    providerJobId: result.providerJobId,
    completedAt: new Date(),
  });
  generation.durationMs = generation.completedAt - generation.createdAt;
  await generation.save();

  return { generation, balance: await walletService.getBalance(user._id) };
};

export const listForUser = (userId, { status } = {}, pagination) => {
  const filter = { user: userId };
  if (status) filter.status = status;
  return paginate(Generation, filter, pagination);
};

export const getForUser = async (userId, id) => {
  const generation = await Generation.findOne({ _id: id, user: userId });
  if (!generation) throw ApiError.notFound('Generation not found');
  return generation;
};

export const listAll = ({ status, userId } = {}, pagination) => {
  const filter = {};
  if (status) filter.status = status;
  if (userId) filter.user = userId;
  return paginate(Generation, filter, pagination, { populate: { path: 'user', select: 'phone name email' } });
};

export const getById = async (id) => {
  const generation = await Generation.findById(id).populate('user', 'phone name email');
  if (!generation) throw ApiError.notFound('Generation not found');
  return generation;
};

// Used by the scheduled job: fails and refunds generations lost to a crash or restart.
export const recoverStale = async (now = new Date()) => {
  const stale = await Generation.find({
    status: 'processing',
    createdAt: { $lte: new Date(now.getTime() - STALE_AFTER_MS) },
  });
  for (const generation of stale) {
    try {
      await failAndRefund(generation, 'Generation did not finish. Your credit has been refunded');
    } catch (err) {
      logger.error(`Could not recover generation ${generation._id}: ${err.message}`);
    }
  }
  return stale.length;
};
