// =====================================================
// AUTHENTICATION CONTROLLER
//
// Password hashing, rate limiting and token checks live in
// services/auth.js. This file only shapes the responses.
// =====================================================

const auth = require("../services/auth");

// POST /api/auth/register
async function register(req, res) {
  const result = await auth.register(req.body, req.ip);

  res.status(201).json({
    success: true,
    ...result
  });
}

// POST /api/auth/login
async function login(req, res) {
  const result = await auth.login(req.body, req.ip);

  res.json({
    success: true,
    ...result
  });
}

// GET /api/auth/me  (protected)
function currentUser(req, res) {
  res.json({
    success: true,
    user: req.user
  });
}

// POST /api/auth/logout
// The token is held by the browser, so logging out only
// needs the browser to forget it.
function logout(req, res) {
  res.json({ success: true });
}

module.exports = {
  register,
  login,
  currentUser,
  logout
};
