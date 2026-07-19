require("dotenv").config();
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { getAppPassword, isPlaceholderPassword } = require("./setup-gmail-utils");

const envPath = path.join(__dirname, ".env");

function updateEnv(key, value) {
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const regex = new RegExp(`^${key}=.*$`, "m");

  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content += `\n${key}=${value}\n`;
  }

  fs.writeFileSync(envPath, content.trim() + "\n");
}

async function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log("\n========================================");
  console.log("  Aryan Tech Zone - Gmail Setup");
  console.log("========================================\n");

  let appPassword = getAppPassword(process.argv.slice(2));

  if (!appPassword && process.stdin.isTTY) {
    console.log(
      "Gmail needs an App Password (NOT your normal Gmail password).\n",
    );
    console.log("Steps:");
    console.log("1. Open: https://myaccount.google.com/apppasswords");
    console.log("2. Sign in with: aryankumar112211225@gmail.com");
    console.log("3. Enable 2-Step Verification if asked");
    console.log("4. Create App Password → Mail → Windows Computer");
    console.log("5. Copy the 16-character password\n");

    appPassword = await prompt("Paste your Gmail App Password here: ");
  }

  if (!appPassword || isPlaceholderPassword(appPassword)) {
    console.log("\n❌ No valid Gmail App Password was provided.\n");
    console.log("Use a real 16-character Google App Password, not your normal Gmail password.\n");
    console.log("For Render, set EMAIL_PASS in the environment or in the Render dashboard.\n");
    process.exit(1);
  }

  updateEnv("EMAIL_USER", "aryankumar112211225@gmail.com");
  updateEnv("ADMIN_EMAIL", "aryankumar112211225@gmail.com");
  updateEnv("EMAIL_PASS", appPassword.replace(/\s/g, ""));

  console.log("\n✅ Saved Gmail App Password to backend/.env");
  console.log("Testing email connection...\n");

  delete require.cache[require.resolve("./email")];
  const email = require("./email");

  const check = await email.verifyEmailConnection();
  if (!check.ok) {
    console.log(`❌ ${check.message}`);
    console.log("Please check your App Password and try again.\n");
    process.exit(1);
  }

  console.log(`✅ ${check.message}`);
  console.log("\nRestart your server: npm start");
  console.log("Then run: npm run test-email\n");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
