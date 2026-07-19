const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const nodemailer = require("nodemailer");
const db = require("./db");

let transporter = null;

function isEmailConfigured() {
  const pass = (process.env.EMAIL_PASS || "").replace(/\s/g, "");
  if (!process.env.EMAIL_USER || !process.env.ADMIN_EMAIL) return false;
  if (!pass || pass === "qzgi tsru vauw tjas") return false;
  if (["dummypassword", "changeme", "your-app-password", "example", "password", "test123"].includes(pass.toLowerCase())) {
    return false;
  }
  return true;
}

function getTransporter() {
  if (!isEmailConfigured()) return null;

  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS.replace(/\s/g, ""),
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
    });
  }
  return transporter;
}

async function verifyEmailConnection() {
  const transport = getTransporter();
  if (!transport) {
    return {
      ok: false,
      message: "Gmail App Password missing in backend/.env (EMAIL_PASS=)",
    };
  }
  try {
    await transport.verify();
    return { ok: true, message: `Gmail ready → ${process.env.ADMIN_EMAIL}` };
  } catch (err) {
    return { ok: false, message: `Gmail failed: ${err.message}` };
  }
}

function invoiceHeader(title, subtitle) {
  return `
    <div style="background: linear-gradient(135deg, #1e40af, #06b6d4); padding: 28px; border-radius: 12px 12px 0 0; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 22px;">${title}</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">${subtitle}</p>
      <p style="color: rgba(255,255,255,0.8); margin: 4px 0 0; font-size: 13px;">Aryan Tech Zone | 100+ IT Professionals</p>
    </div>
  `;
}

function invoiceRow(label, value, highlight) {
  return `
    <tr>
      <td style="padding: 10px 0; color: #64748b; width: 160px; border-bottom: 1px solid #e2e8f0;">${label}</td>
      <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; ${highlight ? "font-weight: bold; color: #1e40af;" : ""}">${value}</td>
    </tr>
  `;
}

async function sendAdminSmsNotification(paymentData, workData) {
  const mobile = process.env.ADMIN_MOBILE || '9319704764';
  const message = `New payment pending approval. Order ${paymentData.orderId}. Amount ₹${paymentData.amount}. Verify at /admin`;
  console.log(`📱 SMS notification (simulated): ${mobile} -> ${message}`);
  return { sent: true, mobile, message };
}

async function saveEmailLog(
  orderId,
  emailType,
  recipient,
  subject,
  body,
  status,
  errorMessage,
) {
  try {
    await db.logEmailNotification({
      orderId,
      emailType,
      recipientEmail: recipient,
      subject,
      body,
      status,
      errorMessage,
    });
  } catch (err) {
    console.error("Failed to log email to database:", err.message);
  }
}

async function sendWorkRequestEmail(workData) {
  const adminEmail = process.env.ADMIN_EMAIL;
  const date = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const subject = `[Work Request] ${workData.serviceType} - ${workData.projectTitle} | ${workData.orderId}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
      ${invoiceHeader("📋 NEW WORK REQUEST", "Client submitted a project form")}
      <div style="background: #f8fafc; padding: 24px;">
        <div style="background: white; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
          <p style="margin: 0 0 4px; color: #64748b; font-size: 12px; text-transform: uppercase;">Order Number</p>
          <p style="margin: 0; font-size: 20px; font-weight: bold; color: #1e40af;">${workData.orderId}</p>
          <p style="margin: 8px 0 0; color: #64748b; font-size: 13px;">Date: ${date}</p>
        </div>
        <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px;">
          ${invoiceRow("Client Name", workData.clientName)}
          ${invoiceRow("Email", workData.clientEmail)}
          ${invoiceRow("Phone", workData.clientPhone)}
          ${invoiceRow("Service", workData.serviceType, true)}
          ${invoiceRow("Project", workData.projectTitle)}
          ${invoiceRow("Budget", `₹${workData.budget}`, true)}
          ${invoiceRow("Deadline", workData.deadline || "Not specified")}
          ${invoiceRow("Status", "⏳ Pending Payment")}
        </table>
        <div style="margin-top: 16px; padding: 16px; background: white; border-radius: 8px; border-left: 4px solid #06b6d4;">
          <p style="margin: 0 0 8px; color: #64748b; font-size: 12px; text-transform: uppercase;">Project Description</p>
          <p style="margin: 0; color: #1e293b; line-height: 1.6;">${workData.projectDescription}</p>
        </div>
      </div>
    </div>
  `;

  const transport = getTransporter();
  if (!transport) {
    await saveEmailLog(
      workData.orderId,
      "WorkRequest",
      adminEmail,
      subject,
      html,
      "Pending",
      "Gmail App Password not configured",
    );
    console.warn(
      "⚠️  Work request saved in SQL Server. Email pending — add Gmail App Password to .env",
    );
    return { sent: false, reason: "not_configured", pending: true };
  }

  try {
    const info = await transport.sendMail({
      from: `"Aryan Tech Zone" <${process.env.EMAIL_USER}>`,
      to: adminEmail,
      replyTo: workData.clientEmail,
      subject,
      html,
    });

    await saveEmailLog(
      workData.orderId,
      "WorkRequest",
      adminEmail,
      subject,
      html,
      "Sent",
      null,
    );
    console.log(`✅ Work request email sent to ${adminEmail}`);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    await saveEmailLog(
      workData.orderId,
      "WorkRequest",
      adminEmail,
      subject,
      html,
      "Pending",
      err.message,
    );
    console.error("Work request email failed:", err.message);
    throw err;
  }
}

async function sendPaymentEmail(paymentData, workData) {
  const adminEmail = process.env.ADMIN_EMAIL;
  const date = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const subject = `[Payment Invoice] ₹${paymentData.amount} received | ${paymentData.orderId}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
      ${invoiceHeader("💰 PAYMENT INVOICE", "Payment received from client")}
      <div style="background: #f8fafc; padding: 24px;">
        <div style="background: #d1fae5; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 16px;">
          <p style="margin: 0; font-size: 32px; font-weight: bold; color: #059669;">₹${paymentData.amount}</p>
          <p style="margin: 4px 0 0; color: #065f46; font-weight: 600;">PAID</p>
        </div>
        <div style="background: white; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
          <p style="margin: 0 0 4px; color: #64748b; font-size: 12px;">INVOICE NO.</p>
          <p style="margin: 0; font-size: 18px; font-weight: bold;">${paymentData.orderId}</p>
          <p style="margin: 8px 0 0; color: #64748b; font-size: 13px;">Date: ${date}</p>
        </div>
        <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px;">
          ${invoiceRow("Transaction ID", paymentData.transactionId, true)}
          ${invoiceRow("UPI ID", paymentData.upiNumber, true)}
          ${invoiceRow("Client", `${workData.clientName} (${workData.clientPhone})`)}
          ${invoiceRow("Email", workData.clientEmail)}
          ${invoiceRow("Service", workData.serviceType)}
          ${invoiceRow("Project", workData.projectTitle)}
          ${paymentData.paymentNote ? invoiceRow("Note", paymentData.paymentNote) : ""}
        </table>
        <p style="margin-top: 16px; color: #10b981; font-weight: bold; text-align: center;">✅ Ready to start work!</p>
      </div>
    </div>
  `;

  const transport = getTransporter();
  if (!transport) {
    await saveEmailLog(
      paymentData.orderId,
      "Payment",
      adminEmail,
      subject,
      html,
      "Pending",
      "Gmail App Password not configured",
    );
    console.warn(
      "⚠️  Payment saved in SQL Server. Email pending — add Gmail App Password to .env",
    );
    return { sent: false, reason: "not_configured", pending: true };
  }

  try {
    const adminInfo = await transport.sendMail({
      from: `"Aryan Tech Zone" <${process.env.EMAIL_USER}>`,
      to: adminEmail,
      replyTo: workData.clientEmail,
      subject,
      html,
    });

    await saveEmailLog(
      paymentData.orderId,
      "Payment",
      adminEmail,
      subject,
      html,
      "Sent",
      null,
    );
    console.log(`✅ Payment invoice sent to ${adminEmail}`);

    const clientSubject = `Payment Confirmed - ${workData.projectTitle} | Aryan Tech Zone`;
    const clientHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto;">
        ${invoiceHeader("Thank You!", `Dear ${workData.clientName}`)}
        <div style="padding: 24px; background: #f8fafc;">
          <p>Your payment of <strong>₹${paymentData.amount}</strong> for <strong>"${workData.projectTitle}"</strong> has been confirmed.</p>
          <p><strong>Order ID:</strong> ${paymentData.orderId}<br>
          <strong>Transaction ID:</strong> ${paymentData.transactionId}</p>
          <p>Our team will contact you shortly.</p>
        </div>
      </div>
    `;

    await transport.sendMail({
      from: `"Aryan Tech Zone" <${process.env.EMAIL_USER}>`,
      to: workData.clientEmail,
      subject: clientSubject,
      html: clientHtml,
    });

    return { sent: true, messageId: adminInfo.messageId };
  } catch (err) {
    await saveEmailLog(
      paymentData.orderId,
      "Payment",
      adminEmail,
      subject,
      html,
      "Pending",
      err.message,
    );
    console.error("Payment email failed:", err.message);
    throw err;
  }
}

async function sendFakeTransactionAlert(workData, attempt) {
  const adminEmail = process.env.ADMIN_EMAIL;
  const date = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const subject = `🚨 FAKE PAYMENT ATTEMPT | ${workData.orderId}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; border: 2px solid #ef4444; border-radius: 12px; overflow: hidden;">
      ${invoiceHeader("🚨 FAKE TRANSACTION ALERT", "Someone tried to submit a fake payment")}
      <div style="background: #fef2f2; padding: 24px;">
        <p style="color: #b91c1c; font-weight: bold; font-size: 16px;">⚠️ Payment was NOT received. This attempt was blocked.</p>
        <table style="width: 100%; margin-top: 16px; background: white; border-radius: 8px;">
          ${invoiceRow("Order ID", workData.orderId, true)}
          ${invoiceRow("Fake Txn ID", attempt.transactionId, true)}
          ${invoiceRow("Reason", attempt.reason)}
          ${invoiceRow("Client Name", workData.clientName)}
          ${invoiceRow("Client Email", workData.clientEmail)}
          ${invoiceRow("Client Phone", workData.clientPhone)}
          ${invoiceRow("Amount Claimed", `₹${attempt.amount}`)}
          ${invoiceRow("Time", date)}
        </table>
        <p style="margin-top: 16px; color: #64748b;">No payment was recorded. The client was blocked and asked to try again.</p>
      </div>
    </div>
  `;

  const transport = getTransporter();
  if (!transport) {
    await saveEmailLog(
      workData.orderId,
      "FraudAlert",
      adminEmail,
      subject,
      html,
      "Pending",
      "Gmail not configured",
    );
    return { sent: false };
  }

  try {
    await transport.sendMail({
      from: `"Aryan Tech Zone Alert" <${process.env.EMAIL_USER}>`,
      to: adminEmail,
      subject,
      html,
    });
    await saveEmailLog(
      workData.orderId,
      "FraudAlert",
      adminEmail,
      subject,
      html,
      "Sent",
      null,
    );
    console.log(`🚨 Fake payment alert sent to ${adminEmail}`);
    return { sent: true };
  } catch (err) {
    await saveEmailLog(
      workData.orderId,
      "FraudAlert",
      adminEmail,
      subject,
      html,
      "Pending",
      err.message,
    );
    console.error("Fake payment alert failed:", err.message);
    return { sent: false };
  }
}

async function sendPaymentPendingEmail(paymentData, workData) {
  const adminEmail = process.env.ADMIN_EMAIL;
  const date = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const subject = `[Verify Payment] ₹${paymentData.amount} | ${paymentData.orderId}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
      ${invoiceHeader("⏳ PAYMENT VERIFICATION NEEDED", "Check your HDFC bank / UPI app first")}
      <div style="background: #fffbeb; padding: 24px;">
        <p style="color: #92400e; font-weight: bold;">A client submitted a payment. Verify ₹${paymentData.amount} is in your account before approving.</p>
        <table style="width: 100%; margin-top: 16px; background: white; border-radius: 8px;">
          ${invoiceRow("Order ID", paymentData.orderId, true)}
          ${invoiceRow("Transaction ID", paymentData.transactionId, true)}
          ${invoiceRow("UPI ID", paymentData.upiNumber)}
          ${invoiceRow("Client", `${workData.clientName} (${workData.clientPhone})`)}
          ${invoiceRow("Email", workData.clientEmail)}
          ${invoiceRow("Project", workData.projectTitle)}
          ${invoiceRow("Amount", `₹${paymentData.amount}`, true)}
          ${invoiceRow("Submitted", date)}
        </table>
        <div style="text-align: center; margin-top: 24px;">
          <p style="font-weight: bold; color: #065f46;">Open the admin verification page and approve this payment manually.</p>
        </div>
        <p style="margin-top: 16px; color: #64748b; font-size: 13px; text-align: center;">Use your admin credentials at /admin and verify the payment once you see ₹${paymentData.amount} in your HDFC/UPI account.</p>
      </div>
    </div>
  `;

  const transport = getTransporter();
  if (!transport) {
    await saveEmailLog(
      paymentData.orderId,
      "PaymentPending",
      adminEmail,
      subject,
      html,
      "Pending",
      "Gmail not configured",
    );
    return { sent: false };
  }

  try {
    await transport.sendMail({
      from: `"Aryan Tech Zone" <${process.env.EMAIL_USER}>`,
      to: adminEmail,
      replyTo: workData.clientEmail,
      subject,
      html,
    });
    await saveEmailLog(
      paymentData.orderId,
      "PaymentPending",
      adminEmail,
      subject,
      html,
      "Sent",
      null,
    );
    return { sent: true };
  } catch (err) {
    console.error("Payment pending email failed:", err.message);
    return { sent: false };
  }
}

async function retryPendingEmails() {
  if (!isEmailConfigured()) return { retried: 0, sent: 0 };

  const pending = await db.getPendingEmails();
  let sent = 0;
  const transport = getTransporter();

  for (const row of pending) {
    try {
      await transport.sendMail({
        from: `"Aryan Tech Zone" <${process.env.EMAIL_USER}>`,
        to: row.RecipientEmail,
        subject: row.Subject,
        html: row.Body,
      });
      await db.markEmailSent(row.Id);
      sent++;
      console.log(`✅ Retried email sent: ${row.Subject}`);
    } catch (err) {
      console.error(`Retry failed for email ${row.Id}:`, err.message);
    }
  }

  return { retried: pending.length, sent };
}

module.exports = {
  isEmailConfigured,
  verifyEmailConnection,
  sendWorkRequestEmail,
  sendPaymentEmail,
  sendFakeTransactionAlert,
  sendPaymentPendingEmail,
  retryPendingEmails,
};
