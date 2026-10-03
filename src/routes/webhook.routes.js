import express, { Router } from 'express';
import * as webhookController from '../controllers/webhook.controller.js';

const router = Router();

// Raw body: the signature is computed over the exact bytes Razorpay sent.
router.post('/razorpay', express.raw({ type: '*/*', limit: '1mb' }), webhookController.razorpayWebhook);

export default router;
