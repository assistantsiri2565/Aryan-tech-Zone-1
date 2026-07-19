require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const email = require('./email');
const paymentVerify = require('./payment-verify');
const adminAuth = require('./admin-auth');
const UPI_ID = process.env.UPI_ID || process.env.UPI_NUMBER || 'aryankumar112211225-1@okhdfcbank';

const app = express();
const PORT = process.env.PORT || 3000;

function parseCookies(req) {
  const cookieHeader = req.headers.cookie || '';
  return cookieHeader.split(';').reduce((acc, part) => {
    const [key, ...valueParts] = part.trim().split('=');
    if (!key) return acc;
    acc[key] = decodeURIComponent(valueParts.join('='));
    return acc;
  }, {});
}

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));
app.use((req, res, next) => {
  const cookies = parseCookies(req);
  req.adminSession = cookies.adminAuth === '1';
  next();
});

function generateOrderId() {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ATZ-${dateStr}-${random}`;
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', company: 'Aryan Tech Zone', database: db.getDbType() });
});

app.post('/api/work-request', async (req, res) => {
  try {
    const { clientName, clientEmail, clientPhone, serviceType, projectTitle, projectDescription, budget, deadline } = req.body;

    if (!clientName || !clientEmail || !clientPhone || !serviceType || !projectTitle || !projectDescription || !budget) {
      return res.status(400).json({ message: 'Please fill all required fields' });
    }

    if (budget < 100) {
      return res.status(400).json({ message: 'Minimum budget is ₹100' });
    }

    const orderId = generateOrderId();
    const workData = {
      orderId,
      clientName,
      clientEmail,
      clientPhone,
      serviceType,
      projectTitle,
      projectDescription,
      budget,
      deadline: deadline || null
    };

    await db.insertWorkRequest(workData);

    try {
      const emailResult = await email.sendWorkRequestEmail(workData);
      if (!emailResult.sent) {
        console.warn('⚠️  Work saved but email NOT sent - configure Gmail in backend/.env');
      }
    } catch (emailErr) {
      console.error('Work request email failed:', emailErr.message);
    }

    res.status(201).json({
      message: 'Work request saved successfully',
      orderId
    });
  } catch (err) {
    console.error('Work request error:', err);
    res.status(500).json({ message: 'Failed to save work request. Please try again.' });
  }
});

app.post('/api/payment', async (req, res) => {
  try {
    const { orderId, transactionId, amount, upiNumber, paymentNote } = req.body;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (!orderId || !transactionId || !amount) {
      return res.status(400).json({ verified: false, message: 'Order ID, transaction ID, and amount are required' });
    }

    const workRequest = await db.getWorkRequest(orderId);
    if (!workRequest) {
      return res.status(404).json({ verified: false, message: 'Work request not found. Please submit the form first.' });
    }

    const workData = {
      orderId: workRequest.OrderId,
      clientName: workRequest.ClientName,
      clientEmail: workRequest.ClientEmail,
      clientPhone: workRequest.ClientPhone,
      serviceType: workRequest.ServiceType,
      projectTitle: workRequest.ProjectTitle,
      projectDescription: workRequest.ProjectDescription,
      budget: workRequest.Budget,
      deadline: workRequest.Deadline
    };

    const validation = paymentVerify.validateTransactionId(transactionId);

    if (!validation.valid) {
      await db.insertFraudAttempt({
        orderId,
        transactionId,
        clientName: workData.clientName,
        clientEmail: workData.clientEmail,
        clientPhone: workData.clientPhone,
        amount,
        reason: validation.reason,
        ipAddress: clientIp
      });

      if (validation.fraud) {
        await email.sendFakeTransactionAlert(workData, {
          transactionId,
          amount,
          reason: validation.message
        });
      }

      return res.status(402).json({
        verified: false,
        fraud: !!validation.fraud,
        message: validation.message || 'Payment verification failed. Please try again.'
      });
    }

    const normalizedTxnId = validation.normalized;

    if (!paymentVerify.amountsMatch(workRequest.Budget, amount)) {
      await db.insertFraudAttempt({
        orderId,
        transactionId: normalizedTxnId,
        clientName: workData.clientName,
        clientEmail: workData.clientEmail,
        clientPhone: workData.clientPhone,
        amount,
        reason: 'amount_mismatch',
        ipAddress: clientIp
      });

      await email.sendFakeTransactionAlert(workData, {
        transactionId: normalizedTxnId,
        amount,
        reason: 'Amount mismatch — payment amount does not match order budget'
      });

      return res.status(402).json({
        verified: false,
        fraud: true,
        message: 'Payment amount does not match your order. Transaction cancelled.'
      });
    }

    if (paymentVerify.isTooFastPayment(workRequest.CreatedAt)) {
      await db.insertFraudAttempt({
        orderId,
        transactionId: normalizedTxnId,
        clientName: workData.clientName,
        clientEmail: workData.clientEmail,
        clientPhone: workData.clientPhone,
        amount,
        reason: 'too_fast',
        ipAddress: clientIp
      });

      await email.sendFakeTransactionAlert(workData, {
        transactionId: normalizedTxnId,
        amount,
        reason: 'Payment submitted too quickly — likely fake (no time to complete UPI payment)'
      });

      return res.status(402).json({
        verified: false,
        fraud: true,
        message: 'Please complete UPI payment first, then enter the transaction ID from your payment app.'
      });
    }

    if (await db.isTransactionIdUsed(normalizedTxnId)) {
      await db.insertFraudAttempt({
        orderId,
        transactionId: normalizedTxnId,
        clientName: workData.clientName,
        clientEmail: workData.clientEmail,
        clientPhone: workData.clientPhone,
        amount,
        reason: 'duplicate_transaction_id',
        ipAddress: clientIp
      });

      await email.sendFakeTransactionAlert(workData, {
        transactionId: normalizedTxnId,
        amount,
        reason: 'Duplicate transaction ID — this UPI ID was already used'
      });

      return res.status(402).json({
        verified: false,
        fraud: true,
        message: 'This transaction ID was already used. Enter your own payment reference.'
      });
    }

    const existingPayment = await db.getPaymentByOrderId(orderId);
    if (existingPayment && existingPayment.PaymentStatus === 'PendingVerification') {
      return res.status(409).json({
        verified: false,
        status: 'pending_verification',
        message: 'Payment is already being verified. Please wait.'
      });
    }

    const paymentData = {
      orderId,
      transactionId: normalizedTxnId,
      amount,
      upiNumber: upiNumber || UPI_ID,
      paymentNote: paymentNote || null,
      paymentStatus: 'PendingVerification'
    };

    await db.insertPayment(paymentData);

    await email.sendPaymentPendingEmail(paymentData, workData);
    await email.sendAdminSmsNotification(paymentData, workData);

    res.status(202).json({
      verified: false,
      status: 'pending_verification',
      message: 'Payment submitted for verification. Please wait while we confirm your UPI payment.',
      orderId
    });
  } catch (err) {
    console.error('Payment error:', err);
    res.status(500).json({ verified: false, message: 'Failed to process payment. Please try again.' });
  }
});

app.get('/api/payment-status/:orderId', async (req, res) => {
  try {
    const payment = await db.getPaymentByOrderId(req.params.orderId);
    if (!payment) {
      return res.status(404).json({ status: 'not_found' });
    }

    res.json({
      orderId: payment.OrderId,
      status: payment.PaymentStatus,
      verified: payment.PaymentStatus === 'Verified',
      transactionId: payment.TransactionId
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to check payment status' });
  }
});

app.post('/api/admin/login', express.json(), async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const valid = username === 'Aryan_Tech_Zone' && password === 'Aryan9319@';
    if (!valid) {
      return res.status(401).json({ ok: false, message: 'Invalid admin credentials.' });
    }

    res.setHeader('Set-Cookie', 'adminAuth=1; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400');
    req.adminSession = true;
    res.json({ ok: true, message: 'Admin login successful.' });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Login failed.' });
  }
});

app.get('/api/admin/payments', async (req, res) => {
  try {
    if (!req.adminSession) {
      return res.status(401).json({ ok: false, message: 'Unauthorized.' });
    }

    const pendingPayments = [];
    const allPayments = [];

    const paymentRows = await db.getAllPayments();
    for (const payment of paymentRows) {
      const workRequest = await db.getWorkRequest(payment.OrderId);
      allPayments.push({
        orderId: payment.OrderId,
        customer: workRequest ? workRequest.ClientName : 'Unknown',
        email: workRequest ? workRequest.ClientEmail : '',
        amount: payment.Amount,
        transactionId: payment.TransactionId,
        upiNumber: payment.UpiNumber,
        status: payment.PaymentStatus,
        createdAt: payment.CreatedAt,
        projectTitle: workRequest ? workRequest.ProjectTitle : ''
      });
    }

    const pending = allPayments.filter((item) => item.status !== 'Verified');
    pendingPayments.push(...pending);

    res.json({ ok: true, payments: pendingPayments });
  } catch (err) {
    console.error('Admin payments error:', err);
    res.status(500).json({ ok: false, message: 'Failed to load payments.' });
  }
});

app.post('/api/admin/verify-payment', async (req, res) => {
  try {
    if (!req.session || !req.session.adminLoggedIn) {
      return res.status(401).json({ ok: false, message: 'Unauthorized.' });
    }

    const { orderId } = req.body || {};
    if (!orderId) {
      return res.status(400).json({ ok: false, message: 'Order ID is required.' });
    }

    const payment = await db.getPaymentByOrderId(orderId);
    if (!payment) {
      return res.status(404).json({ ok: false, message: 'Payment not found.' });
    }

    if (payment.PaymentStatus === 'Verified') {
      return res.json({ ok: true, message: 'Payment already verified.' });
    }

    await db.updatePaymentStatus(orderId, 'Verified');
    await db.markWorkRequestPaid(orderId);

    const workRequest = await db.getWorkRequest(orderId);
    if (workRequest) {
      const paymentData = {
        orderId: payment.OrderId,
        transactionId: payment.TransactionId,
        amount: payment.Amount,
        upiNumber: payment.UpiNumber,
        paymentNote: payment.PaymentNote
      };
      await email.sendPaymentEmail(paymentData, {
        orderId: workRequest.OrderId,
        clientName: workRequest.ClientName,
        clientEmail: workRequest.ClientEmail,
        clientPhone: workRequest.ClientPhone,
        serviceType: workRequest.ServiceType,
        projectTitle: workRequest.ProjectTitle,
        projectDescription: workRequest.ProjectDescription,
        budget: workRequest.Budget,
        deadline: workRequest.Deadline
      });
    }

    res.json({ ok: true, message: 'Payment verified successfully.' });
  } catch (err) {
    console.error('Verify payment error:', err);
    res.status(500).json({ ok: false, message: 'Failed to verify payment.' });
  }
});

app.post('/api/admin/logout', async (req, res) => {
  res.setHeader('Set-Cookie', 'adminAuth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  req.adminSession = false;
  res.json({ ok: true, message: 'Logged out.' });
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

async function startServer() {
  try {
    await db.initDatabase();
  } catch (err) {
    console.error('\n❌ Database initialization failed:', err.message);
    console.error('Run: npm run setup-sql   (to test SQL Server connection)\n');
    process.exit(1);
  }

  app.listen(PORT, async () => {
    console.log(`\n🚀 Aryan Tech Zone server running at http://localhost:${PORT}`);
    console.log(`🗄️  Database: ${db.getDbType()}`);

    const emailStatus = await email.verifyEmailConnection();
    if (emailStatus.ok) {
      console.log(`📧 ${emailStatus.message}`);
      const retry = await email.retryPendingEmails();
      if (retry.sent > 0) {
        console.log(`📧 Sent ${retry.sent} pending email(s) from SQL Server queue`);
      }
    } else {
      console.log(`⚠️  ${emailStatus.message}`);
      console.log('   → Run: npm run setup-gmail   (one-time Gmail setup)');
    }

    console.log(`💳 UPI ID: ${UPI_ID}\n`);
  });
}

startServer();
