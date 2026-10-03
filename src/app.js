import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

const app = express();

// Security and body parsing
app.use(helmet());
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(morgan(env.isProd ? 'combined' : 'dev'));

// API routes
app.use('/api/v1', apiLimiter, routes);

// 404 and error handling must be registered last
app.use(notFound);
app.use(errorHandler);

export default app;
