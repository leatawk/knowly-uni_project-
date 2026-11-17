// =====================================================
// SAVED PRODUCTS AND SAVED COMPARISONS CONTROLLER
//
// Every route here needs a logged-in user; the router
// applies auth.requireUser before these handlers run.
// =====================================================

const saved = require("../services/saved");

async function list(req, res) {
  res.json({
    success: true,
    ...(await saved.list(req.user.id))
  });
}

async function addProduct(req, res) {
  const result = await saved.saveProduct(
    req.user.id,
    req.body?.product
  );

  res.status(201).json({
    success: true,
    ...result
  });
}

async function removeProduct(req, res) {
  const result = await saved.removeProduct(
    req.user.id,
    req.params.productId
  );

  res.json({
    success: true,
    ...result
  });
}

async function addComparison(req, res) {
  const result = await saved.saveComparison(
    req.user.id,
    req.body
  );

  res.status(201).json({
    success: true,
    ...result
  });
}

async function removeComparison(req, res) {
  const result = await saved.removeComparison(
    req.user.id,
    req.params.comparisonId
  );

  res.json({
    success: true,
    ...result
  });
}

module.exports = {
  list,
  addProduct,
  removeProduct,
  addComparison,
  removeComparison
};
