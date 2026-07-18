const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3000/api'
  : '/api';

const UPI_ID = 'aryankumar112211225-1@okhdfcbank';
const UPI_NAME = 'Aryan Tech Zone';

let currentOrderId = null;
let currentWorkData = null;
let paymentPollTimer = null;

const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 50);
});

const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');
navToggle.addEventListener('click', () => navLinks.classList.toggle('open'));
navLinks.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => navLinks.classList.remove('open'));
});

function setProgressStep(step) {
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById(`progressStep${i}`);
    el.classList.remove('active', 'completed');
    if (i < step) el.classList.add('completed');
    if (i === step) el.classList.add('active');
  }
}

function showPanel(panelId) {
  document.querySelectorAll('.form-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(panelId).classList.add('active');
}

function setupUpiLinks(amount) {
  const upiUrl = `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent(UPI_NAME)}&am=${amount}&cu=INR`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiUrl)}`;

  document.getElementById('upiQrCode').src = qrUrl;
  document.getElementById('displayAmount').textContent = `₹${amount}`;
  document.getElementById('upiIdDisplay').textContent = UPI_ID;

  document.getElementById('paytmLink').href = `paytmmp://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent(UPI_NAME)}&am=${amount}&cu=INR`;
  document.getElementById('phonepeLink').href = `phonepe://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent(UPI_NAME)}&am=${amount}&cu=INR`;
  document.getElementById('gpayLink').href = upiUrl;
}

function showToast(message, type = 'success') {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 5000);
}

function freezePage(message) {
  document.getElementById('paymentFailMessage').textContent = message;
  document.getElementById('pageFreeze').classList.add('active');
  document.getElementById('paymentFailModal').classList.add('active');
  document.body.classList.add('frozen');
}

function unfreezePage() {
  document.getElementById('pageFreeze').classList.remove('active');
  document.getElementById('paymentFailModal').classList.remove('active');
  document.body.classList.remove('frozen');
  document.getElementById('transactionId').value = '';
  document.getElementById('transactionId').focus();
}

function stopPaymentPolling() {
  if (paymentPollTimer) {
    clearInterval(paymentPollTimer);
    paymentPollTimer = null;
  }
}

function showPaymentSuccess(transactionId) {
  stopPaymentPolling();
  unfreezePage();

  document.getElementById('orderDetails').innerHTML = `
    <strong>Order ID:</strong> ${currentOrderId}<br>
    <strong>Service:</strong> ${currentWorkData.serviceType}<br>
    <strong>Project:</strong> ${currentWorkData.projectTitle}<br>
    <strong>Amount Paid:</strong> ₹${currentWorkData.budget}<br>
    <strong>Transaction ID:</strong> ${transactionId}<br>
    <strong>Status:</strong> ✅ Payment Verified
  `;

  setProgressStep(3);
  showPanel('step3Panel');
  showToast('Payment verified successfully!');
}

function startPaymentPolling(orderId) {
  stopPaymentPolling();
  document.getElementById('verifyAmount').textContent = `₹${currentWorkData.budget}`;
  setProgressStep(2);
  showPanel('step2bPanel');

  const checkStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/payment-status/${encodeURIComponent(orderId)}`);
      const data = await res.json();

      if (data.verified) {
        showPaymentSuccess(data.transactionId);
        return;
      }

      if (data.status === 'PendingVerification') {
        document.getElementById('verifyStatus').textContent =
          'Waiting for bank confirmation... Check your email to approve once payment is received.';
      } else if (data.status === 'Rejected') {
        stopPaymentPolling();
        freezePage('Payment was rejected. Please pay via UPI and enter the correct transaction ID.');
        showPanel('step2Panel');
      }
    } catch {
      document.getElementById('verifyStatus').textContent = 'Checking payment status...';
    }
  };

  checkStatus();
  paymentPollTimer = setInterval(checkStatus, 5000);
}

document.getElementById('workForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('submitWorkBtn');
  btn.classList.add('loading');
  btn.textContent = 'Saving...';

  const formData = {
    clientName: document.getElementById('clientName').value.trim(),
    clientEmail: document.getElementById('clientEmail').value.trim(),
    clientPhone: document.getElementById('clientPhone').value.trim(),
    serviceType: document.getElementById('serviceType').value,
    projectTitle: document.getElementById('projectTitle').value.trim(),
    projectDescription: document.getElementById('projectDescription').value.trim(),
    budget: parseFloat(document.getElementById('budget').value),
    deadline: document.getElementById('deadline').value || null
  };

  try {
    const response = await fetch(`${API_BASE}/work-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to submit work request');

    currentOrderId = data.orderId;
    currentWorkData = formData;
    document.getElementById('orderId').value = currentOrderId;

    setupUpiLinks(formData.budget);
    setProgressStep(2);
    showPanel('step2Panel');
    showToast('Work details saved! Please complete UPI payment.');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.classList.remove('loading');
    btn.textContent = 'Continue to Payment →';
  }
});

document.getElementById('backToFormBtn').addEventListener('click', () => {
  stopPaymentPolling();
  unfreezePage();
  setProgressStep(1);
  showPanel('step1Panel');
});

document.getElementById('paymentForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('submitPaymentBtn');
  btn.classList.add('loading');
  btn.textContent = 'Verifying Payment...';

  const paymentData = {
    orderId: currentOrderId,
    transactionId: document.getElementById('transactionId').value.trim(),
    paymentNote: document.getElementById('paymentNote').value.trim(),
    amount: currentWorkData.budget,
    upiNumber: UPI_ID
  };

  try {
    const response = await fetch(`${API_BASE}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(paymentData)
    });

    const data = await response.json();

    if (response.status === 402) {
      freezePage(data.message || 'Payment verification failed. Please try again with the correct UPI transaction ID.');
      showPanel('step2Panel');
      return;
    }

    if (!response.ok) {
      throw new Error(data.message || 'Failed to verify payment');
    }

    if (data.status === 'pending_verification') {
      startPaymentPolling(currentOrderId);
      showToast('Payment submitted. Verifying with bank account...');
      return;
    }

    if (data.verified) {
      showPaymentSuccess(paymentData.transactionId);
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.classList.remove('loading');
    btn.textContent = 'Confirm Payment & Submit';
  }
});

document.getElementById('paymentRetryBtn').addEventListener('click', () => {
  unfreezePage();
  showToast('Please pay via UPI first, then enter the real transaction ID.', 'error');
});

document.getElementById('newRequestBtn').addEventListener('click', () => {
  stopPaymentPolling();
  unfreezePage();
  document.getElementById('workForm').reset();
  document.getElementById('paymentForm').reset();
  currentOrderId = null;
  currentWorkData = null;
  setProgressStep(1);
  showPanel('step1Panel');
});
