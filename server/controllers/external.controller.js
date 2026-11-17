// =====================================================
// EXTERNAL PROVIDER CONTROLLER
//
// Direct access to the four integrations, used for testing
// and for barcode lookups. The main website uses
// /api/search, which combines them.
//
// Each response states its market and currency, because
// Lebanese and Saudi prices are not comparable and
// international product data is not a Lebanese price.
// =====================================================

const food = require("../services/openFoodFacts");
const beauty = require("../services/openBeautyFacts");
const electronics = require("../services/lebtech");
const automotive = require("../services/automotive");
const repository = require("../services/productRepository");
const { badRequest } = require("../validators");

// ---------- GROCERIES (Open Food Facts) ----------

// GET /api/external/food/search?q=
async function searchFood(req, res) {
  const products = await food.searchProducts(req.searchTerm);

  res.json({
    success: true,
    count: products.length,
    products
  });
}

// GET /api/external/food/:barcode
async function foodByBarcode(req, res) {
  const product = await food.getProductByBarcode(
    req.params.barcode
  );

  if (!product) {
    return res.status(404).json({
      success: false,
      error: "Product not found"
    });
  }

  const stored = await repository.saveExternalProduct(
    product,
    "groceries-food"
  );

  res.json({
    success: true,
    product: stored,
    message: "Product saved"
  });
}

// ---------- BEAUTY (Open Beauty Facts) ----------

// GET /api/external/beauty/search?q=
async function searchBeauty(req, res) {
  const products = await beauty.searchProducts(
    req.searchTerm
  );

  res.json({
    success: true,
    count: products.length,
    products
  });
}

// GET /api/external/beauty/:barcode
async function beautyByBarcode(req, res) {
  const product = await beauty.getProductByBarcode(
    req.params.barcode
  );

  if (!product) {
    return res.status(404).json({
      success: false,
      error: "Product not found"
    });
  }

  const stored = await repository.saveExternalProduct(
    product,
    "beauty-personal-care"
  );

  res.json({
    success: true,
    product: stored,
    message: "Product saved"
  });
}

// ---------- ELECTRONICS (LebTech, Lebanon) ----------

// GET /api/external/lebtech/search?q=
async function searchElectronics(req, res) {
  const products = await electronics.searchProducts(
    req.searchTerm
  );

  res.json({
    success: true,
    market: "Lebanon",
    currency: "USD",
    count: products.length,
    products
  });
}

// GET /api/external/lebtech/prices?product=
async function electronicsPrices(req, res) {
  const reference = String(req.query.product || "").trim();

  if (!reference || reference.length > 500) {
    throw badRequest("Product reference required");
  }

  const offers = await electronics.getProductPrices(
    reference
  );

  res.json({
    success: true,
    market: "Lebanon",
    currency: "USD",
    count: offers.length,
    offers
  });
}

// ---------- AUTOMOTIVE (Speero, Saudi Arabia) ----------

// GET /api/external/automotive/search?q=
async function searchAutomotive(req, res) {
  const products = await automotive.searchProducts(
    req.searchTerm
  );

  res.json({
    success: true,
    market: "Saudi Arabia",
    currency: "SAR",
    count: products.length,
    products
  });
}

// GET /api/external/automotive/part/:oem
async function automotivePart(req, res) {
  const product = await automotive.getPartByOEM(
    req.params.oem
  );

  if (!product) {
    return res.status(404).json({
      success: false,
      error: "Part not found"
    });
  }

  res.json({
    success: true,
    market: "Saudi Arabia",
    currency: "SAR",
    product
  });
}

module.exports = {
  searchFood,
  foodByBarcode,
  searchBeauty,
  beautyByBarcode,
  searchElectronics,
  electronicsPrices,
  searchAutomotive,
  automotivePart
};
