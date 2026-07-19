const { Pool } = require('pg');

let pool = null;

function getPoolConfig() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for PostgreSQL');
  }

  return {
    connectionString,
    ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false }
  };
}

async function setupPostgresTables(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "WorkRequests" (
      "Id" SERIAL PRIMARY KEY,
      "OrderId" VARCHAR(50) NOT NULL UNIQUE,
      "ClientName" VARCHAR(100) NOT NULL,
      "ClientEmail" VARCHAR(150) NOT NULL,
      "ClientPhone" VARCHAR(20) NOT NULL,
      "ServiceType" VARCHAR(100) NOT NULL,
      "ProjectTitle" VARCHAR(200) NOT NULL,
      "ProjectDescription" TEXT NOT NULL,
      "Budget" DECIMAL(10,2) NOT NULL,
      "Deadline" DATE,
      "Status" VARCHAR(50) DEFAULT 'Pending Payment',
      "CreatedAt" TIMESTAMP DEFAULT NOW(),
      "UpdatedAt" TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS "Payments" (
      "Id" SERIAL PRIMARY KEY,
      "OrderId" VARCHAR(50) NOT NULL REFERENCES "WorkRequests"("OrderId"),
      "TransactionId" VARCHAR(100) NOT NULL,
      "Amount" DECIMAL(10,2) NOT NULL,
      "UpiNumber" VARCHAR(100) NOT NULL,
      "PaymentNote" VARCHAR(500),
      "PaymentStatus" VARCHAR(50) DEFAULT 'PendingVerification',
      "CreatedAt" TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS "EmailNotifications" (
      "Id" SERIAL PRIMARY KEY,
      "OrderId" VARCHAR(50) NOT NULL,
      "EmailType" VARCHAR(50) NOT NULL,
      "RecipientEmail" VARCHAR(150) NOT NULL,
      "Subject" VARCHAR(300) NOT NULL,
      "Body" TEXT NOT NULL,
      "Status" VARCHAR(30) DEFAULT 'Pending',
      "ErrorMessage" VARCHAR(500),
      "CreatedAt" TIMESTAMP DEFAULT NOW(),
      "SentAt" TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS "FraudAttempts" (
      "Id" SERIAL PRIMARY KEY,
      "OrderId" VARCHAR(50) NOT NULL,
      "TransactionId" VARCHAR(100) NOT NULL,
      "ClientName" VARCHAR(100),
      "ClientEmail" VARCHAR(150),
      "ClientPhone" VARCHAR(20),
      "Amount" DECIMAL(10,2),
      "Reason" VARCHAR(500) NOT NULL,
      "IpAddress" VARCHAR(50),
      "CreatedAt" TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS "IX_WorkRequests_OrderId" ON "WorkRequests"("OrderId");
    CREATE INDEX IF NOT EXISTS "IX_Payments_OrderId" ON "Payments"("OrderId");
    CREATE INDEX IF NOT EXISTS "IX_Payments_TransactionId" ON "Payments"("TransactionId");
  `);
}

async function initPostgres() {
  pool = new Pool(getPoolConfig());
  const client = await pool.connect();
  try {
    await setupPostgresTables(client);
    console.log('✅ PostgreSQL connected (Render database ready)');
  } finally {
    client.release();
  }
}

async function insertWorkRequest(data) {
  const result = await pool.query(`
    INSERT INTO "WorkRequests"
      ("OrderId", "ClientName", "ClientEmail", "ClientPhone", "ServiceType", "ProjectTitle", "ProjectDescription", "Budget", "Deadline", "Status")
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Pending Payment')
    RETURNING "Id"
  `, [
    data.orderId, data.clientName, data.clientEmail, data.clientPhone,
    data.serviceType, data.projectTitle, data.projectDescription,
    data.budget, data.deadline || null
  ]);
  return result.rows[0];
}

async function insertPayment(data) {
  const status = data.paymentStatus || 'PendingVerification';
  const result = await pool.query(`
    INSERT INTO "Payments" ("OrderId", "TransactionId", "Amount", "UpiNumber", "PaymentNote", "PaymentStatus")
    VALUES ($1,$2,$3,$4,$5,$6)
    RETURNING "Id"
  `, [data.orderId, data.transactionId, data.amount, data.upiNumber, data.paymentNote || null, status]);
  return result.rows[0];
}

async function markWorkRequestPaid(orderId) {
  await pool.query(`UPDATE "WorkRequests" SET "Status" = 'Payment Received', "UpdatedAt" = NOW() WHERE "OrderId" = $1`, [orderId]);
}

async function updatePaymentStatus(orderId, status) {
  await pool.query(`UPDATE "Payments" SET "PaymentStatus" = $1 WHERE "OrderId" = $2`, [status, orderId]);
}

async function getPaymentByOrderId(orderId) {
  const result = await pool.query(`SELECT * FROM "Payments" WHERE "OrderId" = $1 ORDER BY "Id" DESC LIMIT 1`, [orderId]);
  return result.rows[0] || null;
}

async function getAllPayments() {
  const result = await pool.query(`SELECT * FROM "Payments" ORDER BY "Id" DESC`);
  return result.rows;
}

async function isTransactionIdUsed(transactionId) {
  const result = await pool.query(`
    SELECT COUNT(*) AS cnt FROM "Payments"
    WHERE "TransactionId" = $1 AND "PaymentStatus" IN ('Verified', 'PendingVerification')
  `, [transactionId]);
  return parseInt(result.rows[0].cnt, 10) > 0;
}

async function insertFraudAttempt(data) {
  await pool.query(`
    INSERT INTO "FraudAttempts" ("OrderId", "TransactionId", "ClientName", "ClientEmail", "ClientPhone", "Amount", "Reason", "IpAddress")
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
  `, [
    data.orderId, data.transactionId, data.clientName || null, data.clientEmail || null,
    data.clientPhone || null, data.amount || null, data.reason, data.ipAddress || null
  ]);
}

async function getWorkRequest(orderId) {
  const result = await pool.query(`SELECT * FROM "WorkRequests" WHERE "OrderId" = $1`, [orderId]);
  return result.rows[0] || null;
}

async function logEmailNotification(data) {
  await pool.query(`
    INSERT INTO "EmailNotifications" ("OrderId", "EmailType", "RecipientEmail", "Subject", "Body", "Status", "ErrorMessage", "SentAt")
    VALUES ($1,$2,$3,$4,$5,$6,$7, CASE WHEN $6 = 'Sent' THEN NOW() ELSE NULL END)
  `, [
    data.orderId, data.emailType, data.recipientEmail, data.subject,
    data.body, data.status, data.errorMessage || null
  ]);
}

async function getPendingEmails() {
  const result = await pool.query(`SELECT * FROM "EmailNotifications" WHERE "Status" = 'Pending' ORDER BY "CreatedAt" ASC LIMIT 20`);
  return result.rows;
}

async function markEmailSent(id) {
  await pool.query(`UPDATE "EmailNotifications" SET "Status" = 'Sent', "SentAt" = NOW() WHERE "Id" = $1`, [id]);
}

module.exports = {
  initPostgres,
  insertWorkRequest,
  insertPayment,
  markWorkRequestPaid,
  updatePaymentStatus,
  getPaymentByOrderId,
  getAllPayments,
  isTransactionIdUsed,
  insertFraudAttempt,
  getWorkRequest,
  logEmailNotification,
  getPendingEmails,
  markEmailSent
};
