// =====================================================
// COMPARE CONTROLLER
// =====================================================

const catalog = require("../services/catalog");
const { validateComparisonIds } = require("../validators");

async function compare(req, res) {
  const ids = req.body?.ids;
  let items = req.body?.items;

  if (!Array.isArray(items) && Array.isArray(ids)) {
    items = validateComparisonIds(ids);
  }

  const result = await catalog.compare(items);

  res.json({
    count: result.products.length,
    ...result,
    products: result.products.map(product => ({
      ...product,
      // These four are kept for older clients.
      brand_name: product.brand,
      category_name: product.categoryName,
      best_price: product.best?.price ?? null,
      best_currency: product.best?.currency ?? null,
      best_store: product.best?.store ?? null
    }))
  });
}

module.exports = { compare };
