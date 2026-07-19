function getAppPassword(argv = process.argv.slice(2), options = {}) {
  const env = options.env || process.env;
  const cliPassword = argv[0];
  const envPassword = env.EMAIL_PASS || "jfam dnkv vcnp xocp";

  if (cliPassword && cliPassword.trim()) {
    return cliPassword.trim();
  }

  if (envPassword) {
    return envPassword.trim();
  }

  return "";
}

function isPlaceholderPassword(value = "") {
  const normalized = (value || "").trim().toLowerCase();
  return (
    !normalized ||
    ["dummypassword", "changeme", "your-app-password", "example", "password", "test123"].includes(normalized)
  );
}

module.exports = { getAppPassword, isPlaceholderPassword };
