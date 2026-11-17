// =====================================================
// PRODUCTS CONTROLLER
//
// Saved products, their store offers and their price
// history. Controllers only translate HTTP to and from the
// services and repositories; no SQL and no business rules.
// =====================================================

const Product = require("../models/Product");
const catalog = require("../services/catalog");
const offerStore = require("../services/offerStore");
const tracker = require("../services/priceTracker");
const { readPagination } = require("../validators");

// GET /api/products
async function list(req, res) {
  const filter = {
    search: String(req.query.search || "").trim(),
    category: String(req.query.category || "").trim()
  };

  const { page, limit, offset } = readPagination(req);

  const [total, products] = await Promise.all([
    Product.count(filter),
    Product.findPage(filter, { limit, offset })
  ]);

  res.json({
    total,
    page,
    limit,
    products
  });
}

// GET /api/products/:id
async function detail(req, res) {
  const product = await Product.findById(req.params.id);

  if (!product) {
    return res.status(404).json({
      success: false,
      error: "Product not found"
    });
  }

  res.json(product);
}

// GET /api/products/:id/price-history
async function priceHistory(req, res) {
  const history = await tracker.getProductHistory(
    req.params.id
  );

  res.json({
    count: history.length,
    history
  });
}

// GET /api/products/:id/offers
async function listOffers(req, res) {
  const list = await offerStore.readOffers(req.params.id);

  res.json({
    count: list.length,
    summary: offerStore.summarize(list),
    offers: list.map(offer => ({
      ...offer,
      // store_name is kept for older clients.
      store_name: offer.store
    }))
  });
}

// POST /api/products/:id/offers  (needs ADMIN_KEY)
async function addOffer(req, res) {
  const result = await catalog.addVerifiedOffer(
    req.params.id,
    req.body
  );

  res.status(201).json({
    success: true,
    ...result
  });
}

// POST /api/products/resolve
// Saves a product from any of the five categories and
// loads its store prices.
async function resolve(req, res) {
  const result = await catalog.resolve(req.body?.product);

  res.json({
    success: true,
    ...result
  });
}

module.exports = {
  list,
  detail,
  priceHistory,
  listOffers,
  addOffer,
  resolve
};
