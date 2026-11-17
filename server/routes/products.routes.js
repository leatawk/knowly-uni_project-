// =====================================================
// PRODUCT ROUTES
//
// Order matters: the fixed path /resolve is declared before
// the /:id pattern, so "resolve" is never read as an ID.
// =====================================================

const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const requireAdminKey = require("../middleware/requireAdminKey");
const { requireId } = require("../validators");
const controller = require("../controllers/products.controller");

const router = express.Router();

// Collection
router.get("/", asyncHandler(controller.list));

// Save a product from any category and load its prices
router.post("/resolve", asyncHandler(controller.resolve));

// One product
router.get(
  "/:id",
  requireId(),
  asyncHandler(controller.detail)
);

router.get(
  "/:id/price-history",
  requireId(),
  asyncHandler(controller.priceHistory)
);

// Store offers for one product
router.get(
  "/:id/offers",
  requireId(),
  asyncHandler(controller.listOffers)
);

// Manual retailer price: administrator only
router.post(
  "/:id/offers",
  requireId(),
  requireAdminKey,
  asyncHandler(controller.addOffer)
);

module.exports = router;
