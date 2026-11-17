// =====================================================
// REQUEST ID AND REQUEST LOG
//
// Each request gets an ID, returned in X-Request-Id. The
// one log line per request (method, path, status, duration)
// makes it possible to find the request behind a failed
// operation.
// =====================================================

const { randomUUID } = require("crypto");

function requestId(req, res, next) {
  req.id = req.get("x-request-id") || randomUUID();
  res.set("X-Request-Id", req.id);

  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const ms = Number(
      (process.hrtime.bigint() - startedAt) / 1000000n
    );

    console.log(
      JSON.stringify({
        requestId: req.id,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: ms
      })
    );
  });

  next();
}

module.exports = requestId;
