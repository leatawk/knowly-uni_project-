// =====================================================
// 404 HANDLER
//
// Registered after every route, before the error handler.
// =====================================================

function notFound(req, res) {
  res.status(404).json({
    success: false,
    error: "Route not found"
  });
}

module.exports = notFound;
