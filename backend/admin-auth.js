const crypto = require('crypto');

function getAdminSecret() {
  return process.env.ADMIN_SECRET || 'aryantechzone2026';
}

function getBaseUrl() {
  return (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function buildVerifyUrl(orderId, action) {
  const key = getAdminSecret();
  return `${getBaseUrl()}/api/admin/verify-payment?orderId=${encodeURIComponent(orderId)}&action=${action}&key=${encodeURIComponent(key)}`;
}

function isValidAdminKey(key) {
  return key === getAdminSecret();
}

function generateAdminSecret() {
  return crypto.randomBytes(16).toString('hex');
}

module.exports = {
  getAdminSecret,
  getBaseUrl,
  buildVerifyUrl,
  isValidAdminKey,
  generateAdminSecret
};
