import mongoose from 'mongoose';

// Log of Razorpay webhook deliveries. The unique eventId lets retries of an
// already-processed event be acknowledged without running the handler again.
const webhookEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true },
    event: { type: String, required: true },
    status: { type: String, enum: ['processing', 'processed', 'ignored', 'failed'], default: 'processing' },
    error: { type: String },
    attempts: { type: Number, default: 1 },
  },
  { timestamps: true }
);

export const WebhookEvent = mongoose.model('WebhookEvent', webhookEventSchema);
