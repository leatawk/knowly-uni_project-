// =====================================================
// ASYNC HANDLER
//
// Express 5 forwards rejected promises on its own, but
// wrapping every async controller keeps the behaviour
// explicit and identical on Express 4. A rejected promise
// reaches the central error handler instead of hanging.
// =====================================================

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
