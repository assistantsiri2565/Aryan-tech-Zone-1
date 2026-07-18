const crypto = require('crypto');

function validateTransactionId(transactionId) {
  const txn = String(transactionId || '').trim().toUpperCase();

  if (!txn) {
    return { valid: false, reason: 'Transaction ID is required', fraud: false, message: 'Please enter your UPI transaction ID.' };
  }

  if (txn.length < 10 || txn.length > 22) {
    return { valid: false, reason: 'invalid_length', fraud: true, message: 'Invalid UPI transaction ID. Check your payment app and try again.' };
  }

  if (!/^[A-Z0-9]+$/.test(txn)) {
    return { valid: false, reason: 'invalid_chars', fraud: true, message: 'Transaction ID must contain only letters and numbers.' };
  }

  if (/^(.)\1+$/.test(txn)) {
    return { valid: false, reason: 'fake_pattern', fraud: true, message: 'This transaction ID looks fake. Pay first, then enter the real ID from your UPI app.' };
  }

  const blocked = ['012345678901', '123456789012', '987654321098', '111111111111', '000000000000', '999999999999'];
  if (blocked.includes(txn)) {
    return { valid: false, reason: 'fake_sequence', fraud: true, message: 'Fake transaction ID detected. Payment cancelled.' };
  }

  if (/^(TEST|FAKE|DEMO|SAMPLE|DUMMY)/.test(txn)) {
    return { valid: false, reason: 'fake_keyword', fraud: true, message: 'Fake transaction ID detected. Payment cancelled.' };
  }

  return { valid: true, normalized: txn };
}

function isTooFastPayment(orderCreatedAt) {
  if (!orderCreatedAt) return false;
  const created = new Date(orderCreatedAt);
  if (Number.isNaN(created.getTime())) return false;
  const diffSeconds = (Date.now() - created.getTime()) / 1000;
  return diffSeconds < 45;
}

function amountsMatch(expected, received) {
  return Math.abs(Number(expected) - Number(received)) < 0.01;
}

function getApproveToken(orderId) {
  const secret = process.env.APPROVE_SECRET || 'aryan-tech-zone-approve-2026';
  return crypto.createHmac('sha256', secret).update(String(orderId)).digest('hex').slice(0, 32);
}

function verifyApproveToken(orderId, token) {
  if (!orderId || !token) return false;
  const expected = getApproveToken(orderId);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(token)));
  } catch {
    return false;
  }
}

module.exports = {
  validateTransactionId,
  isTooFastPayment,
  amountsMatch,
  getApproveToken,
  verifyApproveToken
};
