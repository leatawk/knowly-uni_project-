// =====================================================
// SEARCH REQUEST VALIDATION
// =====================================================

const { badRequest } = require("./common.validator");

// Middleware: trims ?q= and enforces a length range. The
// trimmed term is placed on req.searchTerm so controllers
// never re-read the raw query string.
function requireQuery({
  min = 2,
  max = 100,
  message
} = {}) {
  return (req, res, next) => {
    const term = String(req.query.q || "").trim();

    if (term.length < min || term.length > max) {
      return next(
        badRequest(
          message || `Enter ${min}-${max} characters`
        )
      );
    }

    req.searchTerm = term;
    next();
  };
}

module.exports = { requireQuery };
