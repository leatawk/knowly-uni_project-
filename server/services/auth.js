// =====================================================
// KNOWLY ACCOUNTS
//
// Uses the existing public.app_users table.
// No extra npm packages: Node's built-in crypto is used for
//   - password hashing (scrypt, random salt per user)
//   - login tokens (signed with HMAC-SHA256, valid 7 days)
//
// Put a long random value in server/.env:
//   AUTH_SECRET=some-long-random-text
// Without it a temporary secret is generated at start-up
// and everyone is logged out when the server restarts.
// =====================================================

const crypto = require("crypto");
const { promisify } = require("util");
const User = require("../models/User");
const config = require("../config/env");
const tokens = require("../utils/token");
const {
  cleanEmail,
  validateRegistration
} = require("../validators");

const scrypt = promisify(crypto.scrypt);

const TOKEN_DAYS = 7;
const KEY_LENGTH = 64;
const SCRYPT = { N: 16384, r: 8, p: 1 };

const SECRET = (() => {
  const configured = String(config.authSecret || "");

  if (configured.length >= 32) return configured;

  if (configured) {
    console.warn("AUTH_SECRET is shorter than 32 characters. Using a temporary secret instead.");
  } else {
    console.warn("AUTH_SECRET is not set in server/.env. Logins will end when the server restarts.");
  }

  return crypto.randomBytes(48).toString("hex");
})();

// -------------------------------------
// Errors with a message the user can read
// -------------------------------------

function fail(status, message, extra = {}) {
  const error = new Error(message);
  error.status = status;
  error.expose = true;
  Object.assign(error, extra);
  return error;
}

// -------------------------------------
// Too many attempts protection
// (per IP address, kept in memory)
// -------------------------------------

const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;

const LIMITS = {
  login: 10,
  register: 8
};

function checkLimit(kind, ip) {
  const key = `${kind}|${ip}`;
  const now = Date.now();
  const entry = attempts.get(key);

  if (entry && now < entry.resetAt && entry.count >= LIMITS[kind]) {
    const minutes = Math.ceil((entry.resetAt - now) / 60000);

    throw fail(
      429,
      `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`
    );
  }
}

function countAttempt(kind, ip) {
  const key = `${kind}|${ip}`;
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now >= entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count++;
  }

  // Keep the map small.
  if (attempts.size > 5000) {
    for (const [name, value] of attempts) {
      if (now >= value.resetAt) attempts.delete(name);
    }
  }
}

function clearAttempts(kind, ip) {
  attempts.delete(`${kind}|${ip}`);
}

// -------------------------------------
// Passwords
// Stored as: scrypt$N$r$p$salt$hash
// -------------------------------------

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);

  const hash = await scrypt(password, salt, KEY_LENGTH, {
    ...SCRYPT,
    maxmem: 64 * 1024 * 1024
  });

  return [
    "scrypt",
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString("base64"),
    hash.toString("base64")
  ].join("$");
}

async function checkPassword(password, stored) {
  const parts = String(stored || "").split("$");

  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, N, r, p, salt, expected] = parts;
  const expectedBytes = Buffer.from(expected, "base64");

  const hash = await scrypt(password, Buffer.from(salt, "base64"), expectedBytes.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024
  });

  return (
    hash.length === expectedBytes.length &&
    crypto.timingSafeEqual(hash, expectedBytes)
  );
}

// Used when the email does not exist, so a wrong email and a
// wrong password take the same time to answer.
let dummyHash = null;

async function fakeCheck(password) {
  if (!dummyHash) dummyHash = await hashPassword("knowly-not-a-real-password");
  await checkPassword(password, dummyHash);
}

// -------------------------------------
// Tokens
//
// The signing and reading live in utils/token.js; this file
// supplies the secret and the user id.
// -------------------------------------

function createToken(userId) {
  return tokens.createToken(userId, SECRET, TOKEN_DAYS);
}

function readToken(token) {
  return tokens.readToken(token, SECRET);
}

// -------------------------------------
// Validation
// -------------------------------------

// -------------------------------------
// The user fields the website is allowed to see.
// The password hash is never returned.
// -------------------------------------

const publicUser = User.publicFields;

// -------------------------------------
// Register
// -------------------------------------

async function register(body, ip) {
  checkLimit("register", ip);

  // Every field rule lives in validators/auth.validator.js.
  const { name, email, password } =
    validateRegistration(body);

  countAttempt("register", ip);

  const passwordHash = await hashPassword(password);

  try {
    const user = await User.create({
      name,
      email,
      passwordHash
    });

    return {
      user: publicUser(user),
      token: createToken(user.id)
    };
  } catch (error) {
    if (error.code === "23505") {
      throw fail(409, "An account with this email already exists. Log in instead.", {
        fields: { email: "This email is already registered." }
      });
    }

    throw error;
  }
}

// -------------------------------------
// Log in
// -------------------------------------

async function login(body, ip) {
  checkLimit("login", ip);

  const input = body && typeof body === "object" ? body : {};
  const email = cleanEmail(input.email);
  const password = String(input.password || "");

  if (!email || !password) {
    throw fail(400, "Enter your email and password.");
  }

  if (password.length > 200) {
    throw fail(400, "Email or password is incorrect.");
  }

  const user = await User.findByEmail(email);

  let ok = false;

  if (user) {
    ok = await checkPassword(password, user.password_hash);
  } else {
    await fakeCheck(password);
  }

  if (!ok) {
    countAttempt("login", ip);
    throw fail(401, "Email or password is incorrect.");
  }

  clearAttempts("login", ip);

  return {
    user: publicUser(user),
    token: createToken(user.id)
  };
}

// -------------------------------------
// Who is logged in (Authorization: Bearer <token>)
// -------------------------------------

async function currentUser(req) {
  const header = String(req.get("authorization") || "");
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match) return null;

  const data = readToken(match[1].trim());
  if (!data) return null;

  const row = await User.findById(data.sub);

  return row ? publicUser(row) : null;
}

// Express middleware for routes that need an account.
function requireUser(req, res, next) {
  currentUser(req)
    .then(user => {
      if (!user) {
        return res.status(401).json({
          success: false,
          error: "Your session has ended. Log in again."
        });
      }

      req.user = user;
      next();
    })
    .catch(next);
}

module.exports = {
  register,
  login,
  currentUser,
  requireUser,

  // Used by the automated tests (tests/auth.test.js).
  _test: {
    hashPassword,
    checkPassword,
    createToken,
    readToken
  }
};
