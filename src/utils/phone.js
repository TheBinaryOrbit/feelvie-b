// Strips spaces, dashes and brackets so "+91 98765-43210" becomes "+919876543210".
export const normalizePhone = (phone) => String(phone).replace(/[\s\-()]/g, '');

// Optional leading "+", then 10 to 15 digits, not starting with 0.
export const PHONE_REGEX = /^\+?[1-9]\d{9,14}$/;

export const isValidPhone = (phone) => PHONE_REGEX.test(normalizePhone(phone));
