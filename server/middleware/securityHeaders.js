// =====================================================
// SECURITY HEADERS
// =====================================================

function securityHeaders(req, res, next) {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin"
  });

  next();
}

module.exports = securityHeaders;
