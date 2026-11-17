// =====================================================
// VALIDATORS
//
// Every check on data arriving from the browser lives in
// this folder, so the rules can be read in one place.
//
// Request-shape checks run as middleware, before the
// controller does any work. Business rules that depend on
// stored data stay in the services.
// =====================================================

module.exports = {
  ...require("./common.validator"),
  ...require("./product.validator"),
  ...require("./search.validator"),
  ...require("./offer.validator"),
  ...require("./auth.validator")
};
