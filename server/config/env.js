// =====================================================
// ENVIRONMENT CONFIGURATION
//
// Every environment variable is read here, once, so no
// other file reaches into process.env directly. That keeps
// configuration in one place and makes the application
// portable between a laptop and a cloud platform.
// =====================================================

require("dotenv").config();

const toNumber = (value, fallback) => {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
};

const config = {
  // Cloud platforms assign the port, so process.env.PORT wins.
  port: toNumber(process.env.PORT, 4000),

  clientOrigin:
    process.env.CLIENT_ORIGIN || "http://localhost:5173",

  // Set TRUST_PROXY=1 behind Render, Railway or Nginx so
  // login rate limits see the visitor's real IP.
  trustProxy: process.env.TRUST_PROXY
    ? toNumber(process.env.TRUST_PROXY, 1)
    : null,

  // Serve the built React site from this same port.
  serveClient: process.env.SERVE_CLIENT === "true",

  // Protects manual retailer-price submission.
  adminKey: process.env.ADMIN_KEY || "",

  // Signs login tokens. Must be at least 32 characters;
  // services/auth.js falls back to a temporary secret and
  // warns when it is missing or too short.
  authSecret: process.env.AUTH_SECRET || "",

  jsonLimit: "100kb",

  // External providers. The defaults are the public
  // endpoints; override them only for testing.
  providers: {
    lebtechMcpUrl:
      process.env.LEBTECH_MCP_URL ||
      "https://lebtechlb.com/api/mcp",

    openPricesUrl: (
      process.env.OPEN_PRICES_URL ||
      "https://prices.openfoodfacts.org"
    ).replace(/\/+$/, "")
  },

  database: {
    host: process.env.DB_HOST,
    port: toNumber(process.env.DB_PORT, 5432),
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  }
};

module.exports = config;
