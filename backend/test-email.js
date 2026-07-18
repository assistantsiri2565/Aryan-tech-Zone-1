require('dotenv').config();
const db = require('./db');
const email = require('./email');

async function main() {
  await db.initDatabase();

  console.log('\n📧 Aryan Tech Zone - Email Test\n');
  if (!email.isEmailConfigured()) {
    console.log('❌ Email is NOT configured.\n');
    console.log('Follow these steps:\n');
    console.log('1. Open: https://myaccount.google.com/apppasswords');
    console.log('2. Sign in with: aryankumar112211225@gmail.com');
    console.log('3. Create App Password (select Mail → Windows Computer)');
    console.log('4. Copy the 16-character password');
    console.log('5. Run: npm run setup-gmail\n');
    process.exit(1);
  }

  console.log('Checking Gmail connection...');
  const check = await email.verifyEmailConnection();
  if (!check.ok) {
    console.log(`❌ ${check.message}\n`);
    console.log('If password is wrong, create a new App Password at:');
    console.log('https://myaccount.google.com/apppasswords\n');
    process.exit(1);
  }

  console.log(`✅ ${check.message}\n`);
  console.log('Sending test invoice email...');

  const result = await email.sendWorkRequestEmail({
    orderId: 'ATZ-TEST-' + Date.now(),
    clientName: 'Test Client',
    clientEmail: 'test@example.com',
    clientPhone: '9876543210',
    serviceType: 'Website Development',
    projectTitle: 'Email Test - Please Ignore',
    projectDescription: 'This is a test email to verify your Gmail setup is working.',
    budget: 1000,
    deadline: null
  });

  if (result.sent) {
    console.log('\n✅ SUCCESS! Check your inbox: aryankumar112211225@gmail.com');
    console.log('   (Also check Spam/Promotions folder)\n');
  } else {
    console.log('\n❌ Failed to send test email.\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
