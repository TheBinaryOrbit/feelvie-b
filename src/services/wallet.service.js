import mongoose from 'mongoose';
import { Wallet } from '../models/wallet.model.js';
import { CreditTransaction } from '../models/creditTransaction.model.js';
import { ApiError } from '../utils/ApiError.js';
import { paginate } from '../utils/pagination.js';
import { logger } from '../utils/logger.js';

// The only module that changes credits. Everything else calls grantCredits / debitCredits.

const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));

const spendableFilter = (userId, now = new Date()) => ({
  user: toObjectId(userId),
  type: 'credit',
  creditsRemaining: { $gt: 0 },
  expiresOn: { $gt: now },
});

export const getOrCreateWallet = (userId) =>
  Wallet.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

const liveBalance = async (userId) => {
  const [row] = await CreditTransaction.aggregate([
    { $match: spendableFilter(userId) },
    { $group: { _id: null, total: { $sum: '$creditsRemaining' } } },
  ]);
  return row?.total || 0;
};

// Recomputes the cached balance from the lots and returns the wallet.
export const recalcBalance = async (userId) => {
  const balance = await liveBalance(userId);
  return Wallet.findOneAndUpdate(
    { user: userId },
    { $set: { balance }, $setOnInsert: { user: userId } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

/**
 * Adds a lot of credits. Idempotent when grantKey is given: a second call with the
 * same key returns the existing lot. Returns null when the lot would already be expired.
 */
export const grantCredits = async ({
  userId,
  credits,
  source,
  expiresOn,
  grantKey,
  description,
  subscription,
  creditPack,
  payment,
  admin,
  generation,
}) => {
  if (!Number.isInteger(credits) || credits <= 0) {
    throw ApiError.badRequest('Credits to grant must be a positive whole number');
  }
  if (!(expiresOn instanceof Date) || Number.isNaN(expiresOn.getTime())) {
    throw ApiError.badRequest('A valid expiry date is required');
  }
  if (expiresOn <= new Date()) return null;

  if (grantKey) {
    const existing = await CreditTransaction.findOne({ grantKey });
    if (existing) return existing;
  }

  const wallet = await getOrCreateWallet(userId);

  let lot;
  try {
    lot = await CreditTransaction.create({
      user: userId,
      wallet: wallet._id,
      type: 'credit',
      source,
      creditsAdded: credits,
      creditsRemaining: credits,
      expiresOn,
      isExpired: false,
      description,
      subscription,
      creditPack,
      payment,
      admin,
      generation,
      grantKey,
    });
  } catch (err) {
    // Two concurrent grants with the same key: the loser returns the winner's lot.
    if (err.code === 11000 && grantKey) return CreditTransaction.findOne({ grantKey });
    throw err;
  }

  await Wallet.updateOne({ _id: wallet._id }, { $inc: { lifetimeCredited: credits } });
  const updated = await recalcBalance(userId);
  lot.balanceAfter = updated.balance;
  await lot.save();
  return lot;
};

const refundTaken = (taken) =>
  Promise.all(
    taken.map(({ lot, credits }) =>
      CreditTransaction.updateOne({ _id: lot }, { $inc: { creditsRemaining: credits } })
    )
  );

/**
 * Spends credits from the lots that expire first. Each lot is decremented with an atomic
 * conditional update, so two concurrent debits can never spend the same credits.
 */
export const debitCredits = async ({ userId, credits, source = 'usage', description, admin, generation }) => {
  if (!Number.isInteger(credits) || credits <= 0) {
    throw ApiError.badRequest('Credits to deduct must be a positive whole number');
  }

  const available = await liveBalance(userId);
  if (available < credits) {
    throw ApiError.badRequest(`Insufficient credits. Available: ${available}, required: ${credits}`);
  }

  const taken = [];
  let needed = credits;

  // A few passes in case another request spends from the same lots at the same time.
  for (let attempt = 0; attempt < 3 && needed > 0; attempt += 1) {
    const lots = await CreditTransaction.find(spendableFilter(userId)).sort({ expiresOn: 1, createdAt: 1 });

    for (const lot of lots) {
      if (needed === 0) break;
      const take = Math.min(lot.creditsRemaining, needed);
      const updated = await CreditTransaction.findOneAndUpdate(
        { _id: lot._id, creditsRemaining: { $gte: take }, expiresOn: { $gt: new Date() } },
        { $inc: { creditsRemaining: -take } },
        { new: true }
      );
      if (!updated) continue;
      taken.push({ lot: lot._id, credits: take });
      needed -= take;
    }
  }

  if (needed > 0) {
    await refundTaken(taken);
    // Usually another request spent the last credits at the same moment.
    const nowAvailable = await liveBalance(userId);
    if (nowAvailable < credits) {
      throw ApiError.badRequest(`Insufficient credits. Available: ${nowAvailable}, required: ${credits}`);
    }
    throw ApiError.conflict('Credits changed while processing. Please try again');
  }

  const wallet = await getOrCreateWallet(userId);
  await Wallet.updateOne({ _id: wallet._id }, { $inc: { lifetimeDebited: credits } });
  const updated = await recalcBalance(userId);

  return CreditTransaction.create({
    user: userId,
    wallet: wallet._id,
    type: 'debit',
    source,
    creditsDeducted: credits,
    breakdown: taken,
    balanceAfter: updated.balance,
    description,
    admin,
    generation,
  });
};

const REFUND_REPLACEMENT_DAYS = 7;

/**
 * Gives back the credits of a debit, for example when a generation fails.
 * Credits go back into the lots they came from. If a lot has expired in the meantime, a
 * replacement lot valid for 7 days is granted instead, so the user never loses out.
 * Idempotent: refundOf is unique, so a debit can only be refunded once.
 */
export const refundDebit = async (debitId, { description, generation } = {}) => {
  const existing = await CreditTransaction.findOne({ refundOf: debitId });
  if (existing) return existing;

  const debit = await CreditTransaction.findOne({ _id: debitId, type: 'debit' });
  if (!debit) throw ApiError.notFound('Debit transaction not found');

  // Claim the refund first so concurrent callers cannot both restore credits.
  let refund;
  try {
    refund = await CreditTransaction.create({
      user: debit.user,
      wallet: debit.wallet,
      type: 'refund',
      source: 'refund',
      creditsRefunded: debit.creditsDeducted,
      breakdown: debit.breakdown,
      refundOf: debit._id,
      description: description || 'Refund',
      generation: generation || debit.generation,
    });
  } catch (err) {
    if (err.code === 11000) return CreditTransaction.findOne({ refundOf: debitId });
    throw err;
  }

  let replacement = 0;
  for (const { lot, credits } of debit.breakdown || []) {
    const restored = await CreditTransaction.findOneAndUpdate(
      { _id: lot, isExpired: false, expiresOn: { $gt: new Date() } },
      { $inc: { creditsRemaining: credits } }
    );
    if (!restored) replacement += credits;
  }

  if (replacement > 0) {
    await grantCredits({
      userId: debit.user,
      credits: replacement,
      source: 'refund',
      expiresOn: new Date(Date.now() + REFUND_REPLACEMENT_DAYS * 24 * 60 * 60 * 1000),
      grantKey: `refund:${debit._id}`,
      description: `${refund.description} (original credits had expired)`,
      generation: refund.generation,
    });
  }

  // Restored credits undo the debit. Replacement credits are counted as newly credited by grantCredits.
  const restoredCredits = debit.creditsDeducted - replacement;
  if (restoredCredits > 0) {
    await Wallet.updateOne({ _id: debit.wallet }, { $inc: { lifetimeDebited: -restoredCredits } });
  }
  const wallet = await recalcBalance(debit.user);
  refund.balanceAfter = wallet.balance;
  return refund.save();
};

// Spendable credits right now.
export const getBalance = (userId) => liveBalance(userId);

/**
 * Zeroes every lot whose expiresOn has passed and records an `expire` transaction for
 * the unused remainder. Safe to run repeatedly and from several processes.
 */
export const expireLots = async (now = new Date()) => {
  const due = await CreditTransaction.find({
    type: 'credit',
    isExpired: false,
    expiresOn: { $lte: now },
  }).select('_id');

  const affectedUsers = new Set();
  let expiredCredits = 0;

  for (const { _id } of due) {
    // Returns the lot as it was before the update, so creditsRemaining is what expired.
    const before = await CreditTransaction.findOneAndUpdate(
      { _id, isExpired: false },
      { $set: { isExpired: true, creditsRemaining: 0 } },
      { new: false }
    );
    if (!before) continue;

    affectedUsers.add(String(before.user));
    if (before.creditsRemaining <= 0) continue;

    expiredCredits += before.creditsRemaining;
    await Wallet.updateOne({ _id: before.wallet }, { $inc: { lifetimeExpired: before.creditsRemaining } });
    const wallet = await recalcBalance(before.user);
    await CreditTransaction.create({
      user: before.user,
      wallet: before.wallet,
      type: 'expire',
      source: 'expiry',
      creditsDeducted: before.creditsRemaining,
      breakdown: [{ lot: before._id, credits: before.creditsRemaining }],
      balanceAfter: wallet.balance,
      description: `Unused credits expired on ${before.expiresOn.toISOString().slice(0, 10)}`,
      subscription: before.subscription,
      creditPack: before.creditPack,
    });
  }

  for (const userId of affectedUsers) await recalcBalance(userId);
  if (expiredCredits) logger.info(`[credits] expired ${expiredCredits} credits across ${affectedUsers.size} wallet(s)`);
  return { lots: due.length, credits: expiredCredits };
};

// Wallet plus the lots that can still be spent, earliest expiry first.
export const getSummary = async (userId) => {
  const wallet = await recalcBalance(userId);
  const activeLots = await CreditTransaction.find(spendableFilter(userId))
    .sort({ expiresOn: 1, createdAt: 1 })
    .select('source creditsAdded creditsRemaining expiresOn description subscription creditPack createdAt');

  return {
    wallet,
    balance: wallet.balance,
    nextExpiry: activeLots[0]
      ? { credits: activeLots[0].creditsRemaining, expiresOn: activeLots[0].expiresOn }
      : null,
    activeLots,
  };
};

export const listTransactions = (userId, { type } = {}, pagination) => {
  const filter = { user: userId };
  if (type) filter.type = type;
  return paginate(CreditTransaction, filter, pagination);
};
