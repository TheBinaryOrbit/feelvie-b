import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { verifyToken } from '../utils/jwt.js';
import { User } from '../models/user.model.js';

export const protect = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) throw ApiError.unauthorized('Authentication token missing');

  const decoded = verifyToken(token);
  const user = await User.findById(decoded.id);
  if (!user) throw ApiError.unauthorized('User no longer exists');

  req.user = user;
  next();
});

export const authorize =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(ApiError.forbidden('You do not have permission to perform this action'));
    }
    next();
  };

// Allows access to admins or to the user who owns the resource in req.params.id.
export const selfOrAdmin = (req, _res, next) => {
  if (req.user.role === 'admin' || req.user.id === req.params.id) return next();
  next(ApiError.forbidden('You can only access your own account'));
};
