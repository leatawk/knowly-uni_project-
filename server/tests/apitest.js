// =====================================================
// API INTEGRATION TESTS
//
// Drives the real Express app over HTTP, so routes,
// middleware, validation, controllers and the error
// handler are all exercised together.
//
// These tests need PostgreSQL. When the database is not
// reachable they are skipped rather than failed, so
// "npm test" still runs on a machine without a database.
// =====================================================

const test = require("node:test");
const assert = require("node:assert");

const createApp = require("../app");
const db = require("../db");

let server;
let baseUrl;
let databaseReady = false;

test.before(async () => {
  try {
    await db.testConnection();
    databaseReady = true;
  } catch {
    databaseReady = false;
    return;
  }

  // Port 0 lets the operating system pick a free port.
  server = createApp().listen(0);

  await new Promise(resolve =>
    server.once("listening", resolve)
  );

  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) {
    await new Promise(resolve => server.close(resolve));
  }

  await db.pool.end();
});

// Small helper: returns status and parsed JSON body.
async function call(method, path, { body, token, key } = {}) {
  const headers = {};

  if (body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  if (key) headers["x-knowly-key"] = key;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  return {
    status: response.status,
    requestId: response.headers.get("x-request-id"),
    body: await response.json()
  };
}

function skipWithoutDatabase(t) {
  if (!databaseReady) {
    t.skip("PostgreSQL is not reachable");
    return true;
  }

  return false;
}

test("GET / reports the application name", async t => {
  if (skipWithoutDatabase(t)) return;

  const res = await call("GET", "/");

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.application, "Knowly");
});

test("GET /api/health reports the database", async t => {
  if (skipWithoutDatabase(t)) return;

  const res = await call("GET", "/api/health");

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.database, "connected");
});

test("Every response carries an X-Request-Id", async t => {
  if (skipWithoutDatabase(t)) return;

  const res = await call("GET", "/api/health");

  assert.ok(res.requestId, "X-Request-Id header is missing");
});

test("GET /api/categories returns the five main categories", async t => {
  if (skipWithoutDatabase(t)) return;

  const res = await call("GET", "/api/categories");

  assert.strictEqual(res.status, 200);

  const mains = res.body.categories.filter(
    row => row.parent_id === null
  );

  assert.strictEqual(mains.length, 5);
});

test("GET /api/products paginates", async t => {
  if (skipWithoutDatabase(t)) return;

  const res = await call("GET", "/api/products?page=1&limit=5");

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.page, 1);
  assert.strictEqual(res.body.limit, 5);
  assert.ok(Array.isArray(res.body.products));
});

test("Pagination is clamped to safe bounds", async t => {
  if (skipWithoutDatabase(t)) return;

  const res = await call(
    "GET",
    "/api/products?page=0&limit=99999"
  );

  assert.strictEqual(res.body.page, 1);
  assert.strictEqual(res.body.limit, 100);
});

test("A non-numeric product ID is rejected with 400", async t => {
  if (skipWithoutDatabase(t)) return;

  const res = await call("GET", "/api/products/abc");

  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.success, false);
});

test("An unknown route answers 404, not 200", async t => {
  if (skipWithoutDatabase(t)) return;

  const res = await call("GET", "/api/does-not-exist");

  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body.success, false);
});

test("A one-character search is rejected", async t => {
  if (skipWithoutDatabase(t)) return;

  const res = await call("GET", "/api/search?q=a");

  assert.strictEqual(res.status, 400);
});

test("An empty search lists saved products without failing", async t => {
  if (skipWithoutDatabase(t)) return;

  const res = await call("GET", "/api/search");

  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(res.body.products));
  assert.ok(Array.isArray(res.body.notices));
});

test("GET /api/retailers lists currencies and key status", async t => {
  if (skipWithoutDatabase(t)) return;

  const res = await call("GET", "/api/retailers");

  assert.strictEqual(res.status, 200);
  assert.ok(res.body.currencies.includes("USD"));
  assert.strictEqual(typeof res.body.keyRequired, "boolean");
});

test("Protected routes refuse an anonymous request", async t => {
  if (skipWithoutDatabase(t)) return;

  for (const path of ["/api/auth/me", "/api/saved"]) {
    const res = await call("GET", path);

    assert.strictEqual(
      res.status,
      401,
      `${path} should answer 401`
    );
  }
});

test("Register, log in and read the current user", async t => {
  if (skipWithoutDatabase(t)) return;

  // A fresh email on every run, so the test can repeat.
  const email = `test_${Date.now()}@example.com`;

  const registered = await call("POST", "/api/auth/register", {
    body: {
      name: "Test User",
      email,
      password: "StrongPass123"
    }
  });

  assert.strictEqual(registered.status, 201);
  assert.ok(registered.body.token);

  const loggedIn = await call("POST", "/api/auth/login", {
    body: { email, password: "StrongPass123" }
  });

  assert.strictEqual(loggedIn.status, 200);

  const me = await call("GET", "/api/auth/me", {
    token: loggedIn.body.token
  });

  assert.strictEqual(me.status, 200);
  assert.strictEqual(me.body.user.email, email);

  const wishlist = await call("GET", "/api/saved", {
    token: loggedIn.body.token
  });

  assert.strictEqual(wishlist.status, 200);
  assert.ok(Array.isArray(wishlist.body.products));
});

test("A wrong password is refused with 401", async t => {
  if (skipWithoutDatabase(t)) return;

  const res = await call("POST", "/api/auth/login", {
    body: {
      email: "nobody_here@example.com",
      password: "whatever123"
    }
  });

  assert.strictEqual(res.status, 401);
});

test("Comparing fewer than two products is rejected", async t => {
  if (skipWithoutDatabase(t)) return;

  const res = await call("POST", "/api/compare", {
    body: { ids: [1] }
  });

  assert.strictEqual(res.status, 400);
});

test("Comparing the same product twice is rejected", async t => {
  if (skipWithoutDatabase(t)) return;

  const res = await call("POST", "/api/compare", {
    body: { ids: [1, 1] }
  });

  assert.strictEqual(res.status, 400);
});

test("A manual store price needs the administrator key", async t => {
  if (skipWithoutDatabase(t)) return;

  const config = require("../config/env");

  if (!config.adminKey) {
    t.skip("No ADMIN_KEY configured");
    return;
  }

  const res = await call("POST", "/api/products/1/offers", {
    body: {
      storeName: "Test Store",
      price: 10,
      currency: "USD",
      url: "https://example.com/p"
    }
  });

  assert.strictEqual(res.status, 401);
});
