// =====================================================
// KNOWLY - EXPRESS APPLICATION
//
// Builds the app and returns it without listening, so the
// tests can drive it directly. index.js starts the server.
//
// Middleware order matters and is deliberate:
//   1. security headers and request ID
//   2. CORS
//   3. express.json()  - before any route reading req.body
//   4. the built website, when SERVE_CLIENT=true
//   5. the /api routes
//   6. the 404 handler
//   7. the central error handler, registered last
// =====================================================

const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");

const config = require("./config/env");
const securityHeaders = require("./middleware/securityHeaders");
const requestId = require("./middleware/requestId");
const notFound = require("./middleware/notFound");
const errorHandler = require("./middleware/errorHandler");
const apiRoutes = require("./routes");

function createApp() {
  const app = express();

  // Behind Render, Railway or Nginx, so login rate limits
  // see the visitor's real IP instead of the proxy's.
  if (config.trustProxy) {
    app.set("trust proxy", config.trustProxy);
  }

  app.disable("x-powered-by");

  app.use(securityHeaders);
  app.use(requestId);

  app.use(
    cors({
      origin: config.clientOrigin,
      exposedHeaders: ["X-Request-Id"]
    })
  );

  app.use(express.json({ limit: config.jsonLimit }));

  // With SERVE_CLIENT=true and the client built
  // (npm run build), the whole site runs on this one port.
  const clientDist = path.join(
    __dirname,
    "..",
    "client",
    "dist"
  );

  if (
    config.serveClient &&
    fs.existsSync(path.join(clientDist, "index.html"))
  ) {
    app.use(
      express.static(clientDist, {
        index: "index.html",
        maxAge: "1h"
      })
    );

    console.log("Serving the built website from client/dist");
  }

  app.get("/", (req, res) => {
    res.json({
      application: "Knowly",
      version: "1.0.0"
    });
  });

  app.use("/api", apiRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
