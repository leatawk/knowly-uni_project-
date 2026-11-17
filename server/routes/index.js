// =====================================================
// API ROUTER
//
// Every Knowly endpoint is mounted here under /api, so the
// full list of resources can be read in one place.
//
//   GET    /api/health
//   GET    /api/categories
//   GET    /api/products
//   POST   /api/products/resolve
//   GET    /api/products/:id
//   GET    /api/products/:id/price-history
//   GET    /api/products/:id/offers
//   POST   /api/products/:id/offers          (ADMIN_KEY)
//   GET    /api/search
//   POST   /api/compare
//   POST   /api/auth/register
//   POST   /api/auth/login
//   POST   /api/auth/logout
//   GET    /api/auth/me                      (token)
//   GET    /api/saved                        (token)
//   POST   /api/saved/products               (token)
//   DELETE /api/saved/products/:productId    (token)
//   POST   /api/saved/comparisons            (token)
//   DELETE /api/saved/comparisons/:id        (token)
//   GET    /api/retailers
//   GET    /api/external/...                 (providers)
//   POST   /api/track/lebtech
// =====================================================

const express = require("express");

const router = express.Router();

router.use("/health", require("./health.routes"));
router.use("/categories", require("./categories.routes"));
router.use("/products", require("./products.routes"));
router.use("/search", require("./search.routes"));
router.use("/compare", require("./compare.routes"));
router.use("/auth", require("./auth.routes"));
router.use("/saved", require("./saved.routes"));
router.use("/retailers", require("./retailers.routes"));
router.use("/external", require("./external.routes"));
router.use("/track", require("./tracking.routes"));

module.exports = router;
