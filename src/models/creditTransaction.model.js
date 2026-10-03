import mongoose from 'mongoose';

export const TRANSACTION_TYPES = ['credit', 'debit', 'expire'];
export const TRANSACTION_SOURCES = ['subscription', 'credit_pack', 'admin', 'usage', 'expiry'];

const breakdownSchema = new mongoose.Schema(
  {
    lot: { type: mongoose.Schema.Types.ObjectId, ref: 'CreditTransaction', required: true },
    credits: { type: Number, required: true },
  },
  { _id: false }
);

// Every change to a wallet is one transaction.
// - credit: a "lot" of credits. creditsRemaining goes down as credits are used or expire.
// - debit:  credits spent. breakdown lists which lots they came from, earliest expiry first.
// - expire: the unused remainder of a lot that passed expiresOn.
const creditTransactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    wallet: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', required: true },
    type: { type: String, enum: TRANSACTION_TYPES, required: true },
    source: { type: String, enum: TRANSACTION_SOURCES, required: true },

    // Credit lots only.
    creditsAdded: { type: Number, min: 0 },
    creditsRemaining: { type: Number, min: 0 },
    expiresOn: { type: Date },
    isExpired: { type: Boolean },

    // Debits and expiries only.
    creditsDeducted: { type: Number, min: 0 },
    breakdown: { type: [breakdownSchema], default: undefined },

    balanceAfter: { type: Number },
    description: { type: String, trim: true, maxlength: 300 },

    subscription: { type: mongoose.Schema.Types.ObjectId, ref: 'UserSubscription' },
    creditPack: { type: mongoose.Schema.Types.ObjectId, ref: 'CreditPack' },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },

    // Makes grants idempotent: the same subscription month or payment can only be credited once.
    grantKey: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

// Finding spendable lots for a user, earliest expiry first.
creditTransactionSchema.index({ user: 1, type: 1, expiresOn: 1, creditsRemaining: 1 });
// Finding lots to expire across all users.
creditTransactionSchema.index({ type: 1, isExpired: 1, expiresOn: 1 });
creditTransactionSchema.index({ user: 1, createdAt: -1 });

creditTransactionSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

export const CreditTransaction = mongoose.model('CreditTransaction', creditTransactionSchema);
