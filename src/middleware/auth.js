import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { verifyToken, TOKEN_TYPES } from '../utils/jwt.js';
import { User } from '../models/user.model.js';
import { Admin } from '../models/admin.model.js';

const readBearerToken = (req) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw ApiError.unauthorized('Authentication token missing');
  return verifyToken(token);
};

// App users. Tokens issued before token types existed have no type and count as user tokens.
export const protect = asyncHandler(async (req, _res, next) => {
  const decoded = readBearerToken(req);
  if (decoded.type && decoded.type !== TOKEN_TYPES.USER) {
    throw ApiError.unauthorized('A user token is required');
  }

  const user = await User.findById(decoded.id);
  if (!user) throw ApiError.unauthorized('User no longer exists');
  if (!user.isActive) throw ApiError.forbidden('Account is deactivated');

  req.user = user;
  next();
});

// For public routes that show extra details to logged-in users. Sets req.user when a valid
// user token is sent, and otherwise continues as a guest. It never rejects the request.
export const optionalAuth = asyncHandler(async (req, _res, next) => {
  try {
    const decoded = readBearerToken(req);
    if (!decoded.type || decoded.type === TOKEN_TYPES.USER) {
      const user = await User.findById(decoded.id);
      if (user?.isActive) req.user = user;
    }
  } catch {
    // Missing, invalid or expired token: treat as a guest.
  }
  next();
});

export const protectAdmin = asyncHandler(async (req, _res, next) => {
  const decoded = readBearerToken(req);
  if (decoded.type !== TOKEN_TYPES.ADMIN) throw ApiError.unauthorized('An admin token is required');

  const admin = await Admin.findById(decoded.id);
  if (!admin) throw ApiError.unauthorized('Admin no longer exists');
  if (!admin.isActive) throw ApiError.forbidden('Admin account is deactivated');

  req.admin = admin;
  next();
});

// Only the user whose id is in req.params.id.
export const selfOnly = (req, _res, next) => {
  if (req.user.id === req.params.id) return next();
  next(ApiError.forbidden('You can only access your own account'));
};
