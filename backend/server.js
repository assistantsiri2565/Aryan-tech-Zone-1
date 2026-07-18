require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const email = require('./email');
const paymentVerify = require('./payment-verify');
const UPI_ID = process.env.UPI_ID || process.env.UPI_NUMBER || 'aryankumar112211225-1@okhdfcbank';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

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

    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const approveToken = paymentVerify.getApproveToken(orderId);
    const approveUrl = `${baseUrl}/api/admin/approve-payment?orderId=${encodeURIComponent(orderId)}&token=${approveToken}`;

    await email.sendPaymentPendingEmail(paymentData, workData, approveUrl);

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

app.get('/api/admin/approve-payment', async (req, res) => {
  try {
    const { orderId, token } = req.query;

    if (!paymentVerify.verifyApproveToken(orderId, token)) {
      return res.status(403).send('<h1>Invalid or expired approval link.</h1>');
    }

    const payment = await db.getPaymentByOrderId(orderId);
    if (!payment) {
      return res.status(404).send('<h1>Payment not found.</h1>');
    }

    if (payment.PaymentStatus === 'Verified') {
      return res.send('<h1>✅ Payment already approved.</h1><p>Order: ' + orderId + '</p>');
    }

    await db.updatePaymentStatus(orderId, 'Verified');
    await db.markWorkRequestPaid(orderId);

    const workRequest = await db.getWorkRequest(orderId);
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

    const paymentData = {
      orderId: payment.OrderId,
      transactionId: payment.TransactionId,
      amount: payment.Amount,
      upiNumber: payment.UpiNumber,
      paymentNote: payment.PaymentNote
    };

    await email.sendPaymentEmail(paymentData, workData);

    res.send(`
      <html><body style="font-family:Arial;text-align:center;padding:40px;">
        <h1 style="color:#10b981;">✅ Payment Approved!</h1>
        <p>Order <strong>${orderId}</strong> is confirmed.</p>
        <p>₹${payment.Amount} — Transaction: ${payment.TransactionId}</p>
        <p>Client has been notified. You can close this page.</p>
      </body></html>
    `);
  } catch (err) {
    console.error('Approve payment error:', err);
    res.status(500).send('<h1>Error approving payment.</h1>');
  }
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
