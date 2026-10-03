import { processWebhook } from '../services/webhook.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Razorpay only needs a 2xx to stop retrying. A 400 (bad signature) or 500 (processing
// error) makes it retry later, which is safe because every handler is idempotent.
export const razorpayWebhook = asyncHandler(async (req, res) => {
  const result = await processWebhook(
    req.body,
    req.headers['x-razorpay-signature'],
    req.headers['x-razorpay-event-id']
  );
  res.status(200).json({ success: true, ...result });
});
