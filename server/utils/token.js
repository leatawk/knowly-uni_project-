// =====================================================
// LOGIN TOKENS
//
// Format: base64url(payload).base64url(signature)
// Signed with HMAC-SHA256 using Node's built-in crypto, so
// Knowly needs no extra token package.
//
// The secret is passed in rather than read here, so this
// file stays a pure helper and services/auth.js keeps
// control of configuration.
// =====================================================

const crypto = require("crypto");

const TOKEN_DAYS = 7;

function sign(value, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(value)
    .digest("base64url");
}

function createToken(userId, secret, days = TOKEN_DAYS) {
  const now = Math.floor(Date.now() / 1000);

  const payload = Buffer.from(
    JSON.stringify({
      sub: String(userId),
      iat: now,
      exp: now + days * 24 * 60 * 60
    })
  ).toString("base64url");

  return `${payload}.${sign(payload, secret)}`;
}

// Returns the payload, or null when the token is missing,
// malformed, altered or expired.
function readToken(token, secret) {
  const [payload, signature, extra] = String(token || "").split(".");

  if (!payload || !signature || extra !== undefined) {
    return null;
  }

  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(signature);

  // Constant-time comparison, so the server does not leak
  // how much of a forged signature was correct.
  if (
    expected.length !== given.length ||
    !crypto.timingSafeEqual(expected, given)
  ) {
    return null;
  }

  try {
    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    );

    if (
      !/^[1-9][0-9]*$/.test(String(data.sub)) ||
      !Number.isFinite(data.exp) ||
      data.exp * 1000 < Date.now()
    ) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

module.exports = {
  TOKEN_DAYS,
  sign,
  createToken,
  readToken
};
