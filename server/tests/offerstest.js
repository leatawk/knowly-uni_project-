const test = require("node:test");
const assert = require("node:assert/strict");
const { summarize } = require("../services/offerStore");

const offer = (store, price, currency = "USD", extra = {}) => ({
  store, price, currency, availability: "In stock", active: true, ...extra
});

test("lowest price of one currency", () => {
  const result = summarize([offer("A", 1410), offer("B", 1400), offer("C", 1450)]);
  assert.equal(result.best.store, "B");
  assert.equal(result.storeCount, 3);
});

test("different currencies are never ranked together", () => {
  const result = summarize([offer("A", 329000, "LBP"), offer("B", 4.5, "USD")]);
  assert.equal(result.best, null);
  assert.deepEqual(result.lowestByCurrency.map(o => o.currency).sort(), ["LBP", "USD"]);
});

test("delisted and out-of-stock offers do not win", () => {
  const result = summarize([
    offer("Gone", 900, "USD", { active: false, availability: "Not listed" }),
    offer("Empty", 950, "USD", { availability: "Out of stock" }),
    offer("Here", 1000)
  ]);
  assert.equal(result.best.store, "Here");
  assert.equal(result.offerCount, 2);
});

test("no offers means no price", () => {
  const result = summarize([]);
  assert.equal(result.best, null);
  assert.equal(result.lowestByCurrency.length, 0);
});
