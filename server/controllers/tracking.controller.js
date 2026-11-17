// =====================================================
// PRICE TRACKING CONTROLLER
//
// Saves new and changed retailer prices. Running it again
// for the same product must not create duplicate offers or
// repeated price-history rows; that rule lives in
// services/priceTracker.js.
// =====================================================

const tracker = require("../services/priceTracker");

// POST /api/track/lebtech
async function trackElectronics(req, res) {
  const result = await tracker.trackProduct(
    req.body?.product,
    req.body?.categorySlug
  );

  res.json({
    success: true,
    ...result
  });
}

module.exports = { trackElectronics };
