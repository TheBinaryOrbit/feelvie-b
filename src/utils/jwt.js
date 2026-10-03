import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const TOKEN_TYPES = { USER: 'user', ADMIN: 'admin' };

export const signUserToken = (id) =>
  jwt.sign({ id, type: TOKEN_TYPES.USER }, env.jwt.secret, { expiresIn: env.jwt.expiresIn });

export const signAdminToken = (id) =>
  jwt.sign({ id, type: TOKEN_TYPES.ADMIN }, env.jwt.secret, { expiresIn: env.jwt.adminExpiresIn });

export const verifyToken = (token) => jwt.verify(token, env.jwt.secret);
