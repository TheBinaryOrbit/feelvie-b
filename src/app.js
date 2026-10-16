import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import routes from './routes/index.js';
import webhookRoutes from './routes/webhook.routes.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { uploadsRoot } from './services/storage.service.js';

const app = express();

// Lets req.ip (and the rate limiter) use X-Forwarded-For from trusted proxies.
app.set('trust proxy', env.trustProxy);

// Security and request logging
app.use(helmet());
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(morgan(env.isProd ? 'combined' : 'dev'));

// Uploaded files such as category images. helmet blocks cross-origin embedding by default,
// so allow it here: the app and admin panel load these images from another origin.
app.use(
  '/uploads',
  express.static(uploadsRoot(), {
    index: false,
    dotfiles: 'deny',
    maxAge: '7d',
    setHeaders: (res) => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'),
  })
);

// Razorpay webhooks need the raw body to verify the signature, so they are mounted
// before the JSON parser. They are also outside the API rate limiter.
app.use('/api/v1/webhooks', webhookRoutes);

// Body parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// API routes
app.use('/api/v1', apiLimiter, routes);

// 404 and error handling must be registered last
app.use(notFound);
app.use(errorHandler);

export default app;
