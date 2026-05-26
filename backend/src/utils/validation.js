/**
 * Shared validation utilities
 */

/** Basic email validation regex. Reuse this across the codebase. */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates an email address.
 * @param {string} email
 * @param {number} [maxLength=255] - Maximum allowed email length
 * @returns {boolean}
 */
export function isValidEmail(email, maxLength = 255) {
  if (typeof email !== 'string') return false;
  const trimmed = email.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength && EMAIL_REGEX.test(trimmed);
}

/**
 * Extracts client IP address from request headers.
 * Handles proxy chains (X-Forwarded-For) and IPv6-mapped IPv4 addresses.
 * @param {object} req - Express request object
 * @returns {string} - Client IP address or 'unknown'
 */
export function extractIp(req) {
  const raw = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
  // Take first IP if comma-separated (proxy chain)
  const first = String(raw).split(',')[0].trim();
  // Strip IPv6 mapped IPv4 prefix (::ffff:1.2.3.4 -> 1.2.3.4)
  return first.replace(/^::ffff:/i, '') || 'unknown';
}
