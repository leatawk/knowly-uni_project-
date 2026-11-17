// =====================================================
// RETAILERS CONTROLLER
//
// Lebanese store names and the currency list used by the
// verified-price form. keyRequired tells the frontend
// whether an ADMIN_KEY must be sent with a submission.
// =====================================================

const catalog = require("../services/catalog");
const config = require("../config/env");

async function list(req, res) {
  res.json({
    retailers: await catalog.retailers(),
    currencies: catalog.CURRENCIES,
    keyRequired: Boolean(config.adminKey)
  });
}

module.exports = { list };
