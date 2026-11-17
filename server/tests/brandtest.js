const test = require("node:test");
const assert = require("node:assert");
const N = require("../services/normalize");

test("Brand recovered from LebTech name when provider sends none", () => {
  const p = N.fromElectronics(
    { name: "Apple iPhone 17 Pro Max", externalId: "1", minPrice: 1400 },
    "electronics"
  );
  assert.strictEqual(p.brand, "Apple");
});

test("Provider brand always wins over the name", () => {
  const p = N.fromElectronics(
    { name: "Apple iPhone 17", brand: "Apple Inc", externalId: "2" },
    "electronics"
  );
  assert.strictEqual(p.brand, "Apple Inc");
});

test("Multi-word brand matched before a shorter one", () => {
  const p = N.fromElectronics(
    { name: "Western Digital Blue 1TB SSD", externalId: "3" },
    "electronics"
  );
  assert.strictEqual(p.brand, "Western Digital");
});

test("Unknown brand stays null, nothing invented", () => {
  const p = N.fromElectronics(
    { name: "Wireless Charger Pro 20W", externalId: "4" },
    "electronics"
  );
  assert.strictEqual(p.brand, null);
});

test("Brand only matched at the start of the name", () => {
  const p = N.fromElectronics(
    { name: "Charging cable for Apple devices", externalId: "5" },
    "electronics"
  );
  assert.strictEqual(p.brand, null);
});

test("Grocery 'Apple Juice' never gains the brand Apple", () => {
  const p = N.fromFacts(
    { name: "Apple Juice", barcode: "12345678", quantity: "1 L" },
    "groceries"
  );
  assert.strictEqual(p.brand, null);
});

test("Saved grocery row keeps no brand; electronics row recovers one", () => {
  const grocery = N.fromSaved({
    id: 1, name: "Apple Juice", category_slug: "groceries-food"
  });
  assert.strictEqual(grocery.brand, null);

  const phone = N.fromSaved({
    id: 2, name: "Samsung Galaxy S26", category_slug: "electronics"
  });
  assert.strictEqual(phone.brand, "Samsung");
});

test("Case is ignored, canonical spelling returned", () => {
  const p = N.fromElectronics(
    { name: "SAMSUNG Galaxy Tab S10", externalId: "6" },
    "electronics"
  );
  assert.strictEqual(p.brand, "Samsung");
});
