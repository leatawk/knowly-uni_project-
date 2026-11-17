const test = require("node:test");
const assert = require("node:assert");
const { rankComparison } = require("../services/catalog.js");

// Product helper: key, market, quantity, and lowest offer per currency.
const P = (key, offers, market = "Lebanon", quantity = "") => ({
  key,
  market,
  quantity,
  lowestByCurrency: offers.map(o => ({
    price: o.price,
    currency: o.currency,
    market: o.market === undefined ? market : o.market,
    store: o.store || "Store"
  }))
});

test("THE BUG: multi-currency product is still rankable on shared USD", () => {
  // A has USD + LBP (so summarize() gives best = null), B has USD only.
  const r = rankComparison([
    P("a", [{ price: 1200, currency: "USD" }, { price: 107000000, currency: "LBP" }]),
    P("b", [{ price: 1300, currency: "USD" }])
  ]);
  assert.strictEqual(r.rankable, true);
  assert.strictEqual(r.rankCurrency, "USD");
  assert.strictEqual(r.lowestKey, "a");
});

test("Single shared currency: cheapest named", () => {
  const r = rankComparison([
    P("a", [{ price: 50, currency: "USD" }]),
    P("b", [{ price: 40, currency: "USD" }])
  ]);
  assert.strictEqual(r.rankable, true);
  assert.strictEqual(r.lowestKey, "b");
});

test("No shared currency: not rankable, no winner", () => {
  const r = rankComparison([
    P("a", [{ price: 50, currency: "USD" }]),
    P("b", [{ price: 4500000, currency: "LBP" }])
  ]);
  assert.strictEqual(r.rankable, false);
  assert.strictEqual(r.lowestKey, null);
  assert.strictEqual(r.rankCurrency, null);
  assert.deepStrictEqual(r.currencies.sort(), ["LBP", "USD"]);
});

test("Unpriced product blocks ranking", () => {
  const r = rankComparison([
    P("a", [{ price: 50, currency: "USD" }]),
    P("b", [])
  ]);
  assert.strictEqual(r.rankable, false);
  assert.strictEqual(r.lowestKey, null);
});

test("Lebanese vs Saudi prices are never ranked, even in one currency", () => {
  const r = rankComparison([
    P("a", [{ price: 100, currency: "SAR", market: "Saudi Arabia" }], "Saudi Arabia"),
    P("b", [{ price: 90, currency: "SAR", market: "Lebanon" }], "Lebanon")
  ]);
  assert.strictEqual(r.rankable, false);
  assert.strictEqual(r.lowestKey, null);
  assert.deepStrictEqual(r.markets.sort(), ["Lebanon", "Saudi Arabia"]);
});

test("Tie names no winner but stays rankable", () => {
  const r = rankComparison([
    P("a", [{ price: 42, currency: "USD" }]),
    P("b", [{ price: 42, currency: "USD" }])
  ]);
  assert.strictEqual(r.rankable, true);
  assert.strictEqual(r.lowestKey, null);
});

test("USD preferred when several currencies are shared", () => {
  const r = rankComparison([
    P("a", [{ price: 10, currency: "LBP" }, { price: 20, currency: "USD" }]),
    P("b", [{ price: 99, currency: "LBP" }, { price: 15, currency: "USD" }])
  ]);
  assert.strictEqual(r.rankCurrency, "USD");
  assert.strictEqual(r.lowestKey, "b");
});

test("Different package sizes flagged", () => {
  const r = rankComparison([
    P("a", [{ price: 5, currency: "USD" }], "Lebanon", "400 g"),
    P("b", [{ price: 7, currency: "USD" }], "Lebanon", "750 g")
  ]);
  assert.strictEqual(r.sizeMismatch, true);
  assert.strictEqual(r.rankable, true);
});

test("Same size, spacing ignored, no mismatch", () => {
  const r = rankComparison([
    P("a", [{ price: 5, currency: "USD" }], "Lebanon", "400 g"),
    P("b", [{ price: 7, currency: "USD" }], "Lebanon", "400g")
  ]);
  assert.strictEqual(r.sizeMismatch, false);
});

test("Three products, one missing the shared currency", () => {
  const r = rankComparison([
    P("a", [{ price: 10, currency: "USD" }]),
    P("b", [{ price: 12, currency: "USD" }]),
    P("c", [{ price: 900000, currency: "LBP" }])
  ]);
  assert.strictEqual(r.rankable, false);
});

test("Missing market strings do not block ranking", () => {
  const r = rankComparison([
    P("a", [{ price: 10, currency: "USD", market: "" }], ""),
    P("b", [{ price: 12, currency: "USD", market: "" }], "")
  ]);
  assert.strictEqual(r.rankable, true);
  assert.strictEqual(r.lowestKey, "a");
});
