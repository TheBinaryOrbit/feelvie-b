import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const TOKEN_TYPES = { USER: 'user', ADMIN: 'admin', SIGNUP: 'signup' };

export const SIGNUP_TOKEN_TTL_SECONDS = 10 * 60;

export const signUserToken = (id) =>
  jwt.sign({ id, type: TOKEN_TYPES.USER }, env.jwt.secret, { expiresIn: env.jwt.expiresIn });

export const signAdminToken = (id) =>
  jwt.sign({ id, type: TOKEN_TYPES.ADMIN }, env.jwt.secret, { expiresIn: env.jwt.adminExpiresIn });

// Proof that a phone number passed OTP verification but has no account yet. It only works on
// POST /auth/signup: `protect` and `protectAdmin` reject it.
export const signSignupToken = (phone) =>
  jwt.sign({ phone, type: TOKEN_TYPES.SIGNUP }, env.jwt.secret, { expiresIn: SIGNUP_TOKEN_TTL_SECONDS });

export const verifyToken = (token) => jwt.verify(token, env.jwt.secret);
