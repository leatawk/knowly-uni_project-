// =====================================================
// CATEGORIES CONTROLLER
// =====================================================

const Category = require("../models/Category");

async function list(req, res) {
  const categories = await Category.findMainWithChildren();

  res.json({
    count: categories.length,
    categories
  });
}

module.exports = { list };
