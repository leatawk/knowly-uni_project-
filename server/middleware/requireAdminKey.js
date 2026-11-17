// =====================================================
// ADMINISTRATOR AUTHORISATION
//
// Manual retailer prices may only be submitted with the
// ADMIN_KEY from server/.env. When no key is configured
// the check is skipped, which keeps local development
// simple; /api/retailers reports whether a key is needed.
// =====================================================

const config = require("../config/env");

function requireAdminKey(req, res, next) {
  if (!config.adminKey) {
    return next();
  }

  if (req.get("x-knowly-key") !== config.adminKey) {
    return res.status(401).json({
      success: false,
      error:
        "A valid access key is required to add store prices."
    });
  }

  next();
}

module.exports = requireAdminKey;
