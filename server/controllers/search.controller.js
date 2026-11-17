// =====================================================
// SEARCH CONTROLLER
//
// One search for all five categories. The catalog service
// decides which providers to ask and returns every product
// in the same shape.
// =====================================================

const catalog = require("../services/catalog");

async function search(req, res) {
  const result = await catalog.search(
    req.query.q,
    String(req.query.category || "")
  );

  res.json({
    success: true,
    count: result.products.length,
    ...result
  });
}

module.exports = { search };
