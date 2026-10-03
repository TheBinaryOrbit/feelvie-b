import mongoose from 'mongoose';

export const GENERATION_TYPES = ['tryon'];
export const GENERATION_STATUSES = ['processing', 'completed', 'failed'];

// One document per image generation request: the user's history.
const generationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: GENERATION_TYPES, default: 'tryon' },
    status: { type: String, enum: GENERATION_STATUSES, default: 'processing' },

    // Hosted by the try-on service.
    personImageUrl: { type: String },
    garmentImageUrl: { type: String },
    outputImageUrl: { type: String },
    providerJobId: { type: String },

    creditsCharged: { type: Number, default: 0 },
    creditsRefunded: { type: Number, default: 0 },
    debitTransaction: { type: mongoose.Schema.Types.ObjectId, ref: 'CreditTransaction' },
    refundTransaction: { type: mongoose.Schema.Types.ObjectId, ref: 'CreditTransaction' },

    error: { type: String },
    completedAt: { type: Date },
    durationMs: { type: Number },
  },
  { timestamps: true }
);

generationSchema.index({ user: 1, createdAt: -1 });
// Finding generations stuck in "processing" after a crash.
generationSchema.index({ status: 1, createdAt: 1 });

generationSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

export const Generation = mongoose.model('Generation', generationSchema);
