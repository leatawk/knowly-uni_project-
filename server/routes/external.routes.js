// =====================================================
// EXTERNAL PROVIDER ROUTES
//
// Order matters: /search is declared before /:barcode, so
// "search" is never read as a barcode.
// =====================================================

const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { requireQuery } = require("../validators");
const controller = require("../controllers/external.controller");

const router = express.Router();

// ---------- Groceries ----------

router.get(
  "/food/search",
  requireQuery({
    min: 1,
    message: "Enter a grocery product name"
  }),
  asyncHandler(controller.searchFood)
);

router.get(
  "/food/:barcode",
  asyncHandler(controller.foodByBarcode)
);

// ---------- Beauty ----------

router.get(
  "/beauty/search",
  requireQuery({
    min: 1,
    message: "Enter a beauty product name"
  }),
  asyncHandler(controller.searchBeauty)
);

router.get(
  "/beauty/:barcode",
  asyncHandler(controller.beautyByBarcode)
);

// ---------- Electronics (Lebanon) ----------

router.get(
  "/lebtech/search",
  requireQuery(),
  asyncHandler(controller.searchElectronics)
);

router.get(
  "/lebtech/prices",
  asyncHandler(controller.electronicsPrices)
);

// ---------- Automotive (Saudi Arabia) ----------

router.get(
  "/automotive/search",
  requireQuery(),
  asyncHandler(controller.searchAutomotive)
);

router.get(
  "/automotive/part/:oem",
  asyncHandler(controller.automotivePart)
);

module.exports = router;
