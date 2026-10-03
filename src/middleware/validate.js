import { ApiError } from '../utils/ApiError.js';

// Lightweight request validator. Rule options per field:
//   required, type ('string' | 'number' | 'boolean' | 'object'), integer, min, max,
//   enum: [...], pattern (RegExp or { test }), message (overrides the pattern error)
// Swap for Joi or Zod when validation needs grow.
const checkField = (location, field, value, rule) => {
  const name = `${location}.${field}`;

  if (value === undefined || value === null || value === '') {
    return rule.required ? `${name} is required` : null;
  }
  if (rule.type && typeof value !== rule.type) return `${name} must be of type ${rule.type}`;
  if (rule.type === 'number' && !Number.isFinite(value)) return `${name} must be a finite number`;
  if (rule.integer && !Number.isInteger(value)) return `${name} must be an integer`;
  if (rule.min !== undefined && value < rule.min) return `${name} must be at least ${rule.min}`;
  if (rule.max !== undefined && value > rule.max) return `${name} must be at most ${rule.max}`;
  if (rule.enum && !rule.enum.includes(value)) return `${name} must be one of: ${rule.enum.join(', ')}`;
  if (rule.pattern && !rule.pattern.test(String(value))) return rule.message || `${name} is invalid`;
  return null;
};

export const validate = (schema) => (req, _res, next) => {
  const errors = [];

  for (const location of ['body', 'params', 'query']) {
    const rules = schema[location];
    if (!rules) continue;

    for (const [field, rule] of Object.entries(rules)) {
      const error = checkField(location, field, req[location]?.[field], rule);
      if (error) errors.push(error);
    }
  }

  if (errors.length) return next(ApiError.badRequest('Validation failed', errors));
  next();
};
