// =====================================================
// PRODUCT REQUEST VALIDATION
// =====================================================

const { badRequest, isId } = require("./common.validator");

// Middleware: rejects a product id that is not a positive
// whole number, before any database query runs.
function requireId(paramName = "id") {
  return (req, res, next) => {
    if (!isId(req.params[paramName])) {
      return next(badRequest("Invalid product ID"));
    }

    next();
  };
}

// Reads ?page= and ?limit= with safe bounds, so a request
// can never ask for an unlimited number of rows.
function readPagination(
  req,
  { maxLimit = 100, defaultLimit = 20 } = {}
) {
  const page = Math.max(
    1,
    Math.floor(Number(req.query.page) || 1)
  );

  const limit = Math.min(
    maxLimit,
    Math.max(
      1,
      Math.floor(Number(req.query.limit) || defaultLimit)
    )
  );

  return {
    page,
    limit,
    offset: (page - 1) * limit
  };
}

// Comparison: 2 to 5 different, valid product ids.
function validateComparisonIds(ids) {
  const invalid = ids.some(id => !isId(Number(id)));
  const duplicated =
    new Set(ids.map(String)).size !== ids.length;

  if (invalid || duplicated) {
    throw badRequest(
      "Select 2-5 different, valid products"
    );
  }

  return ids.map(id => ({ id: String(Number(id)) }));
}

module.exports = {
  requireId,
  readPagination,
  validateComparisonIds
};
