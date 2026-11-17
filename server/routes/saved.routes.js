// =====================================================
// SAVED PRODUCTS AND COMPARISONS ROUTES
//
// requireUser is applied to the whole router, so none of
// these routes can be reached without a valid token.
// =====================================================

const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const auth = require("../services/auth");
const controller = require("../controllers/saved.controller");

const router = express.Router();

router.use(auth.requireUser);

router.get("/", asyncHandler(controller.list));

router.post(
  "/products",
  asyncHandler(controller.addProduct)
);

router.delete(
  "/products/:productId",
  asyncHandler(controller.removeProduct)
);

router.post(
  "/comparisons",
  asyncHandler(controller.addComparison)
);

router.delete(
  "/comparisons/:comparisonId",
  asyncHandler(controller.removeComparison)
);

module.exports = router;
