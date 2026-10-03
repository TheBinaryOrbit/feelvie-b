import dotenv from 'dotenv';

dotenv.config();

const required = ['MONGO_URI', 'JWT_SECRET'];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGO_URI,
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '120d',
    adminExpiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '1d',
  },
  otp: {
    expiryMinutes: Number(process.env.OTP_EXPIRY_MINUTES) || 5,
    maxAttempts: Number(process.env.OTP_MAX_ATTEMPTS) || 5,
    mock: process.env.OTP_MOCK !== 'false',
  },
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  },
  jobs: {
    enabled: process.env.JOBS_ENABLED !== 'false',
  },
  vton: {
    apiUrl: process.env.VTON_API_URL || 'https://vton.feelvie.com/api/v1/tryon/generate',
    apiKey: process.env.VTON_API_KEY || '',
    timeoutMs: Number(process.env.VTON_TIMEOUT_MS) || 120000,
  },
  corsOrigin: process.env.CORS_ORIGIN || '*',
  isProd: process.env.NODE_ENV === 'production',
};
