const test = require("node:test");
const assert = require("node:assert/strict");

const { getAppPassword } = require("../setup-gmail-utils");

test("uses EMAIL_PASS from environment when available", () => {
  const password = getAppPassword([], {
    env: { EMAIL_PASS: "abc123" },
    stdinIsTTY: false,
  });

  assert.equal(password, "abc123");
});

test("uses CLI argument when provided", () => {
  const password = getAppPassword(["xyz789"], {
    env: {},
    stdinIsTTY: false,
  });

  assert.equal(password, "xyz789");
});
