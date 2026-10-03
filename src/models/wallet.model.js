import mongoose from 'mongoose';

// One wallet per user. `balance` is a cache: the source of truth is the sum of
// creditsRemaining on unexpired credit lots in CreditTransaction.
const walletSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    balance: { type: Number, default: 0, min: 0 },
    lifetimeCredited: { type: Number, default: 0 },
    lifetimeDebited: { type: Number, default: 0 },
    lifetimeExpired: { type: Number, default: 0 },
  },
  { timestamps: true }
);

walletSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

export const Wallet = mongoose.model('Wallet', walletSchema);
