import { ApiError } from '../utils/ApiError.js';

// Minimal request validator. Schema shape:
//   { body: { phone: { required: true, type: 'string', pattern: /.../, message: '...' } } }
// Swap for Joi or Zod when validation needs grow.
export const validate = (schema) => (req, _res, next) => {
  const errors = [];

  for (const location of ['body', 'params', 'query']) {
    const rules = schema[location];
    if (!rules) continue;

    for (const [field, rule] of Object.entries(rules)) {
      const value = req[location]?.[field];

      if (value === undefined || value === null || value === '') {
        if (rule.required) errors.push(`${location}.${field} is required`);
        continue;
      }
      if (rule.type && typeof value !== rule.type) {
        errors.push(`${location}.${field} must be of type ${rule.type}`);
        continue;
      }
      if (rule.pattern && !rule.pattern.test(String(value))) {
        errors.push(rule.message || `${location}.${field} is invalid`);
      }
    }
  }

  if (errors.length) return next(ApiError.badRequest('Validation failed', errors));
  next();
};
