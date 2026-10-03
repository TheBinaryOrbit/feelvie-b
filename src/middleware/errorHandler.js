import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

export const notFound = (req, _res, next) => {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};

export const errorHandler = (err, req, res, next) => {
  let error = err;

  // Mongoose: invalid ObjectId
  if (err.name === 'CastError') {
    error = ApiError.badRequest(`Invalid value for ${err.path}: ${err.value}`);
  }

  // Mongoose: duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {}).join(', ');
    error = ApiError.conflict(`Duplicate value for field: ${field}`);
  }

  // Mongoose: validation
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors).map((e) => e.message);
    error = ApiError.badRequest('Validation failed', details);
  }

  // JWT
  if (err.name === 'JsonWebTokenError') error = ApiError.unauthorized('Invalid token');
  if (err.name === 'TokenExpiredError') error = ApiError.unauthorized('Token expired');

  // Malformed JSON body
  if (err.type === 'entity.parse.failed') error = ApiError.badRequest('Malformed JSON body');

  const statusCode = error.statusCode || 500;
  const message = error.isOperational ? error.message : 'Internal server error';

  if (statusCode >= 500) logger.error(err);

  res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    ...(error.details && { details: error.details }),
    ...(!env.isProd && { stack: err.stack }),
  });
};
