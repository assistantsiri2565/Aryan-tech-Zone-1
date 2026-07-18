const path = require('path');
const fs = require('fs');

const DB_TYPE = (process.env.DB_TYPE || 'sqlite').toLowerCase();

let db = null;
let mssqlPool = null;
let activeDbType = 'sqlite';

function getMssqlConfig(database) {
  return {
    server: process.env.DB_SERVER || 'localhost',
    port: parseInt(process.env.DB_PORT || '1433', 10),
    database: database || process.env.DB_NAME || 'AryanTechZone',
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || 'root',
    options: {
      encrypt: process.env.DB_ENCRYPT === 'true',
      trustServerCertificate: true,
      enableArithAbort: true
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    }
  };
}

async function setupMssqlTables(pool) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='WorkRequests' AND xtype='U')
    BEGIN
      CREATE TABLE WorkRequests (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        OrderId NVARCHAR(50) NOT NULL UNIQUE,
        ClientName NVARCHAR(100) NOT NULL,
        ClientEmail NVARCHAR(150) NOT NULL,
        ClientPhone NVARCHAR(20) NOT NULL,
        ServiceType NVARCHAR(100) NOT NULL,
        ProjectTitle NVARCHAR(200) NOT NULL,
        ProjectDescription NVARCHAR(MAX) NOT NULL,
        Budget DECIMAL(10,2) NOT NULL,
        Deadline DATE NULL,
        Status NVARCHAR(50) DEFAULT 'Pending Payment',
        CreatedAt DATETIME2 DEFAULT GETDATE(),
        UpdatedAt DATETIME2 DEFAULT GETDATE()
      );
    END

    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Payments' AND xtype='U')
    BEGIN
      CREATE TABLE Payments (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        OrderId NVARCHAR(50) NOT NULL,
        TransactionId NVARCHAR(100) NOT NULL,
        Amount DECIMAL(10,2) NOT NULL,
        UpiNumber NVARCHAR(100) NOT NULL,
        PaymentNote NVARCHAR(500) NULL,
        PaymentStatus NVARCHAR(50) DEFAULT 'PendingVerification',
        CreatedAt DATETIME2 DEFAULT GETDATE(),
        FOREIGN KEY (OrderId) REFERENCES WorkRequests(OrderId)
      );
    END

    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='EmailNotifications' AND xtype='U')
    BEGIN
      CREATE TABLE EmailNotifications (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        OrderId NVARCHAR(50) NOT NULL,
        EmailType NVARCHAR(50) NOT NULL,
        RecipientEmail NVARCHAR(150) NOT NULL,
        Subject NVARCHAR(300) NOT NULL,
        Body NVARCHAR(MAX) NOT NULL,
        Status NVARCHAR(30) DEFAULT 'Pending',
        ErrorMessage NVARCHAR(500) NULL,
        CreatedAt DATETIME2 DEFAULT GETDATE(),
        SentAt DATETIME2 NULL
      );
    END

    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FraudAttempts' AND xtype='U')
    BEGIN
      CREATE TABLE FraudAttempts (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        OrderId NVARCHAR(50) NOT NULL,
        TransactionId NVARCHAR(100) NOT NULL,
        ClientName NVARCHAR(100) NULL,
        ClientEmail NVARCHAR(150) NULL,
        ClientPhone NVARCHAR(20) NULL,
        Amount DECIMAL(10,2) NULL,
        Reason NVARCHAR(500) NOT NULL,
        IpAddress NVARCHAR(50) NULL,
        CreatedAt DATETIME2 DEFAULT GETDATE()
      );
    END

    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Payments_TransactionId')
      CREATE INDEX IX_Payments_TransactionId ON Payments(TransactionId);

    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Payments_OrderId')
      CREATE INDEX IX_Payments_OrderId ON Payments(OrderId);
  `);
}

async function initMssql() {
  const sql = require('mssql');

  const masterPool = await sql.connect(getMssqlConfig('master'));
  await masterPool.request().query(`
    IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'AryanTechZone')
      CREATE DATABASE AryanTechZone
  `);
  await masterPool.close();

  mssqlPool = await sql.connect(getMssqlConfig('AryanTechZone'));
  await setupMssqlTables(mssqlPool);
  console.log('✅ SQL Server connected (AryanTechZone database ready)');
}

function initSqlite() {
  const Database = require('better-sqlite3');
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, 'aryantechzone.db');
  db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS WorkRequests (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      OrderId TEXT NOT NULL UNIQUE,
      ClientName TEXT NOT NULL,
      ClientEmail TEXT NOT NULL,
      ClientPhone TEXT NOT NULL,
      ServiceType TEXT NOT NULL,
      ProjectTitle TEXT NOT NULL,
      ProjectDescription TEXT NOT NULL,
      Budget REAL NOT NULL,
      Deadline TEXT,
      Status TEXT DEFAULT 'Pending Payment',
      CreatedAt TEXT DEFAULT (datetime('now')),
      UpdatedAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS Payments (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      OrderId TEXT NOT NULL,
      TransactionId TEXT NOT NULL,
      Amount REAL NOT NULL,
      UpiNumber TEXT NOT NULL,
      PaymentNote TEXT,
      PaymentStatus TEXT DEFAULT 'PendingVerification',
      CreatedAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (OrderId) REFERENCES WorkRequests(OrderId)
    );

    CREATE TABLE IF NOT EXISTS EmailNotifications (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      OrderId TEXT NOT NULL,
      EmailType TEXT NOT NULL,
      RecipientEmail TEXT NOT NULL,
      Subject TEXT NOT NULL,
      Body TEXT NOT NULL,
      Status TEXT DEFAULT 'Pending',
      ErrorMessage TEXT,
      CreatedAt TEXT DEFAULT (datetime('now')),
      SentAt TEXT
    );

    CREATE TABLE IF NOT EXISTS FraudAttempts (
      Id INTEGER PRIMARY KEY AUTOINCREMENT,
      OrderId TEXT NOT NULL,
      TransactionId TEXT NOT NULL,
      ClientName TEXT,
      ClientEmail TEXT,
      ClientPhone TEXT,
      Amount REAL,
      Reason TEXT NOT NULL,
      IpAddress TEXT,
      CreatedAt TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS IX_WorkRequests_OrderId ON WorkRequests(OrderId);
    CREATE INDEX IF NOT EXISTS IX_Payments_OrderId ON Payments(OrderId);
    CREATE INDEX IF NOT EXISTS IX_Payments_TransactionId ON Payments(TransactionId);
  `);

  console.log(`✅ SQLite database ready at ${dbPath}`);
}

async function initDatabase() {
  if (DB_TYPE === 'mssql') {
    try {
      await initMssql();
      activeDbType = 'mssql';
      return;
    } catch (err) {
      console.warn(`\n⚠️  SQL Server failed: ${err.message}`);
      console.warn('⚠️  Using SQLite fallback. Run: npm run setup-sql\n');
      initSqlite();
      activeDbType = 'sqlite';
      return;
    }
  }

  initSqlite();
  activeDbType = 'sqlite';
}

function normalizeWorkRequest(row) {
  if (!row) return null;
  return {
    OrderId: row.OrderId,
    ClientName: row.ClientName,
    ClientEmail: row.ClientEmail,
    ClientPhone: row.ClientPhone,
    ServiceType: row.ServiceType,
    ProjectTitle: row.ProjectTitle,
    ProjectDescription: row.ProjectDescription,
    Budget: row.Budget,
    Deadline: row.Deadline,
    Status: row.Status,
    CreatedAt: row.CreatedAt
  };
}

function normalizePayment(row) {
  if (!row) return null;
  return {
    Id: row.Id,
    OrderId: row.OrderId,
    TransactionId: row.TransactionId,
    Amount: row.Amount,
    UpiNumber: row.UpiNumber,
    PaymentNote: row.PaymentNote,
    PaymentStatus: row.PaymentStatus,
    CreatedAt: row.CreatedAt
  };
}

async function logEmailNotification(data) {
  if (activeDbType === 'mssql') {
    const sql = require('mssql');
    await mssqlPool.request()
      .input('OrderId', sql.NVarChar(50), data.orderId)
      .input('EmailType', sql.NVarChar(50), data.emailType)
      .input('RecipientEmail', sql.NVarChar(150), data.recipientEmail)
      .input('Subject', sql.NVarChar(300), data.subject)
      .input('Body', sql.NVarChar(sql.MAX), data.body)
      .input('Status', sql.NVarChar(30), data.status)
      .input('ErrorMessage', sql.NVarChar(500), data.errorMessage || null)
      .query(`
        INSERT INTO EmailNotifications (OrderId, EmailType, RecipientEmail, Subject, Body, Status, ErrorMessage, SentAt)
        VALUES (@OrderId, @EmailType, @RecipientEmail, @Subject, @Body, @Status, @ErrorMessage,
          CASE WHEN @Status = 'Sent' THEN GETDATE() ELSE NULL END)
      `);
    return;
  }

  db.prepare(`
    INSERT INTO EmailNotifications (OrderId, EmailType, RecipientEmail, Subject, Body, Status, ErrorMessage, SentAt)
    VALUES (@orderId, @emailType, @recipientEmail, @subject, @body, @status, @errorMessage,
      CASE WHEN @status = 'Sent' THEN datetime('now') ELSE NULL END)
  `).run({
    orderId: data.orderId,
    emailType: data.emailType,
    recipientEmail: data.recipientEmail,
    subject: data.subject,
    body: data.body,
    status: data.status,
    errorMessage: data.errorMessage || null
  });
}

async function getPendingEmails() {
  if (activeDbType === 'mssql') {
    const result = await mssqlPool.request().query(`
      SELECT TOP 20 * FROM EmailNotifications WHERE Status = 'Pending' ORDER BY CreatedAt ASC
    `);
    return result.recordset;
  }

  return db.prepare(`
    SELECT * FROM EmailNotifications WHERE Status = 'Pending' ORDER BY CreatedAt ASC LIMIT 20
  `).all();
}

async function markEmailSent(id) {
  if (activeDbType === 'mssql') {
    const sql = require('mssql');
    await mssqlPool.request()
      .input('Id', sql.Int, id)
      .query(`UPDATE EmailNotifications SET Status = 'Sent', SentAt = GETDATE() WHERE Id = @Id`);
    return;
  }

  db.prepare(`UPDATE EmailNotifications SET Status = 'Sent', SentAt = datetime('now') WHERE Id = ?`).run(id);
}

async function insertWorkRequest(data) {
  if (activeDbType === 'mssql') {
    const sql = require('mssql');
    const result = await mssqlPool.request()
      .input('OrderId', sql.NVarChar(50), data.orderId)
      .input('ClientName', sql.NVarChar(100), data.clientName)
      .input('ClientEmail', sql.NVarChar(150), data.clientEmail)
      .input('ClientPhone', sql.NVarChar(20), data.clientPhone)
      .input('ServiceType', sql.NVarChar(100), data.serviceType)
      .input('ProjectTitle', sql.NVarChar(200), data.projectTitle)
      .input('ProjectDescription', sql.NVarChar(sql.MAX), data.projectDescription)
      .input('Budget', sql.Decimal(10, 2), data.budget)
      .input('Deadline', sql.Date, data.deadline || null)
      .query(`
        INSERT INTO WorkRequests
          (OrderId, ClientName, ClientEmail, ClientPhone, ServiceType, ProjectTitle, ProjectDescription, Budget, Deadline, Status)
        OUTPUT INSERTED.Id
        VALUES
          (@OrderId, @ClientName, @ClientEmail, @ClientPhone, @ServiceType, @ProjectTitle, @ProjectDescription, @Budget, @Deadline, 'Pending Payment')
      `);
    return result.recordset[0];
  }

  const stmt = db.prepare(`
    INSERT INTO WorkRequests
      (OrderId, ClientName, ClientEmail, ClientPhone, ServiceType, ProjectTitle, ProjectDescription, Budget, Deadline, Status)
    VALUES
      (@orderId, @clientName, @clientEmail, @clientPhone, @serviceType, @projectTitle, @projectDescription, @budget, @deadline, 'Pending Payment')
  `);

  const result = stmt.run({
    orderId: data.orderId,
    clientName: data.clientName,
    clientEmail: data.clientEmail,
    clientPhone: data.clientPhone,
    serviceType: data.serviceType,
    projectTitle: data.projectTitle,
    projectDescription: data.projectDescription,
    budget: data.budget,
    deadline: data.deadline || null
  });

  return { Id: result.lastInsertRowid };
}

async function insertPayment(data) {
  const status = data.paymentStatus || 'PendingVerification';

  if (activeDbType === 'mssql') {
    const sql = require('mssql');
    const result = await mssqlPool.request()
      .input('OrderId', sql.NVarChar(50), data.orderId)
      .input('TransactionId', sql.NVarChar(100), data.transactionId)
      .input('Amount', sql.Decimal(10, 2), data.amount)
      .input('UpiNumber', sql.NVarChar(100), data.upiNumber)
      .input('PaymentNote', sql.NVarChar(500), data.paymentNote || null)
      .input('PaymentStatus', sql.NVarChar(50), status)
      .query(`
        INSERT INTO Payments (OrderId, TransactionId, Amount, UpiNumber, PaymentNote, PaymentStatus)
        OUTPUT INSERTED.Id
        VALUES (@OrderId, @TransactionId, @Amount, @UpiNumber, @PaymentNote, @PaymentStatus)
      `);

    return result.recordset[0];
  }

  const insertStmt = db.prepare(`
    INSERT INTO Payments (OrderId, TransactionId, Amount, UpiNumber, PaymentNote, PaymentStatus)
    VALUES (@orderId, @transactionId, @amount, @upiNumber, @paymentNote, @paymentStatus)
  `);

  const result = insertStmt.run({
    orderId: data.orderId,
    transactionId: data.transactionId,
    amount: data.amount,
    upiNumber: data.upiNumber,
    paymentNote: data.paymentNote || null,
    paymentStatus: status
  });

  return { Id: result.lastInsertRowid };
}

async function markWorkRequestPaid(orderId) {
  if (activeDbType === 'mssql') {
    const sql = require('mssql');
    await mssqlPool.request()
      .input('OrderId', sql.NVarChar(50), orderId)
      .query(`UPDATE WorkRequests SET Status = 'Payment Received', UpdatedAt = GETDATE() WHERE OrderId = @OrderId`);
    return;
  }

  db.prepare(`UPDATE WorkRequests SET Status = 'Payment Received', UpdatedAt = datetime('now') WHERE OrderId = ?`).run(orderId);
}

async function updatePaymentStatus(orderId, status) {
  if (activeDbType === 'mssql') {
    const sql = require('mssql');
    await mssqlPool.request()
      .input('OrderId', sql.NVarChar(50), orderId)
      .input('PaymentStatus', sql.NVarChar(50), status)
      .query(`UPDATE Payments SET PaymentStatus = @PaymentStatus WHERE OrderId = @OrderId`);
    return;
  }

  db.prepare(`UPDATE Payments SET PaymentStatus = ? WHERE OrderId = ?`).run(status, orderId);
}

async function getPaymentByOrderId(orderId) {
  if (activeDbType === 'mssql') {
    const sql = require('mssql');
    const result = await mssqlPool.request()
      .input('OrderId', sql.NVarChar(50), orderId)
      .query(`SELECT TOP 1 * FROM Payments WHERE OrderId = @OrderId ORDER BY Id DESC`);
    return normalizePayment(result.recordset[0]);
  }

  const row = db.prepare(`SELECT * FROM Payments WHERE OrderId = ? ORDER BY Id DESC LIMIT 1`).get(orderId);
  return normalizePayment(row);
}

async function isTransactionIdUsed(transactionId) {
  if (activeDbType === 'mssql') {
    const sql = require('mssql');
    const result = await mssqlPool.request()
      .input('TransactionId', sql.NVarChar(100), transactionId)
      .query(`
        SELECT COUNT(*) AS cnt FROM Payments
        WHERE TransactionId = @TransactionId
        AND PaymentStatus IN ('Verified', 'PendingVerification')
      `);
    return result.recordset[0].cnt > 0;
  }

  const row = db.prepare(`
    SELECT COUNT(*) AS cnt FROM Payments
    WHERE TransactionId = ? AND PaymentStatus IN ('Verified', 'PendingVerification')
  `).get(transactionId);
  return row.cnt > 0;
}

async function insertFraudAttempt(data) {
  if (activeDbType === 'mssql') {
    const sql = require('mssql');
    await mssqlPool.request()
      .input('OrderId', sql.NVarChar(50), data.orderId)
      .input('TransactionId', sql.NVarChar(100), data.transactionId)
      .input('ClientName', sql.NVarChar(100), data.clientName || null)
      .input('ClientEmail', sql.NVarChar(150), data.clientEmail || null)
      .input('ClientPhone', sql.NVarChar(20), data.clientPhone || null)
      .input('Amount', sql.Decimal(10, 2), data.amount || null)
      .input('Reason', sql.NVarChar(500), data.reason)
      .input('IpAddress', sql.NVarChar(50), data.ipAddress || null)
      .query(`
        INSERT INTO FraudAttempts (OrderId, TransactionId, ClientName, ClientEmail, ClientPhone, Amount, Reason, IpAddress)
        VALUES (@OrderId, @TransactionId, @ClientName, @ClientEmail, @ClientPhone, @Amount, @Reason, @IpAddress)
      `);
    return;
  }

  db.prepare(`
    INSERT INTO FraudAttempts (OrderId, TransactionId, ClientName, ClientEmail, ClientPhone, Amount, Reason, IpAddress)
    VALUES (@orderId, @transactionId, @clientName, @clientEmail, @clientPhone, @amount, @reason, @ipAddress)
  `).run({
    orderId: data.orderId,
    transactionId: data.transactionId,
    clientName: data.clientName || null,
    clientEmail: data.clientEmail || null,
    clientPhone: data.clientPhone || null,
    amount: data.amount || null,
    reason: data.reason,
    ipAddress: data.ipAddress || null
  });
}

async function getWorkRequest(orderId) {
  if (activeDbType === 'mssql') {
    const sql = require('mssql');
    const result = await mssqlPool.request()
      .input('OrderId', sql.NVarChar(50), orderId)
      .query(`SELECT * FROM WorkRequests WHERE OrderId = @OrderId`);
    return normalizeWorkRequest(result.recordset[0]);
  }

  const row = db.prepare('SELECT * FROM WorkRequests WHERE OrderId = ?').get(orderId);
  return normalizeWorkRequest(row);
}

module.exports = {
  initDatabase,
  insertWorkRequest,
  insertPayment,
  markWorkRequestPaid,
  updatePaymentStatus,
  getPaymentByOrderId,
  isTransactionIdUsed,
  insertFraudAttempt,
  getWorkRequest,
  logEmailNotification,
  getPendingEmails,
  markEmailSent,
  getDbType: () => activeDbType
};
