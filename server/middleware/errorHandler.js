// =====================================================
// CENTRAL ERROR HANDLER
//
// Registered last, after the routes and the 404 handler.
// Every thrown or rejected error from a controller arrives
// here, so each request gets exactly one response and the
// error wording lives in one place.
//
// error.expose = true marks a problem caused by the request
// itself (wrong password, invalid form), which is safe to
// show the user and is not logged as a crash. Anything else
// is logged in full on the server and answered with a
// generic message, so stack traces and secrets never reach
// the browser.
// =====================================================

function statusFor(error) {
  if (error.type === "entity.parse.failed") return 400;
  if (error.status) return error.status;

  // 22P02 = PostgreSQL "invalid input syntax" (bad ID).
  if (error.code === "22P02") return 400;

  return 502;
}

function messageFor(error, status) {
  const rateLimited =
    error.code === "RATE_LIMITED" || error.status === 429;

  if (error.expose) {
    return error.message;
  }

  if (rateLimited) {
    return "Live prices are paused for a moment because too many requests were sent. Please try again shortly.";
  }

  if (error.type === "entity.parse.failed") {
    return "The request could not be read.";
  }

  if (status === 400) {
    return error.message;
  }

  // Connection refused, bad credentials, missing database.
  if (/^ECONNREFUSED|^28|^3D000/.test(String(error.code))) {
    return "The database is not reachable. Check that PostgreSQL is running.";
  }

  if (status === 502) {
    return "A product data service is temporarily unavailable. Please try again in a moment.";
  }

  return "Something went wrong on the server. Please try again.";
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const status = statusFor(error);

  if (!error.expose) {
    console.error(
      JSON.stringify({
        requestId: req.id || null,
        method: req.method,
        path: req.originalUrl,
        status,
        error: error.message,
        code: error.code || null
      })
    );

    if (error.stack) {
      console.error(error.stack);
    }
  }

  res.status(status).json({
    success: false,
    error: messageFor(error, status),
    requestId: req.id || undefined,
    ...(error.expose && error.fields
      ? { fields: error.fields }
      : {})
  });
}

module.exports = errorHandler;
