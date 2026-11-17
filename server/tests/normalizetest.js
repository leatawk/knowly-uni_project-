// Run with:  npm test   (inside the server folder)
const test = require("node:test");
const assert = require("node:assert/strict");
const N = require("../services/normalize");

test("variant: colour and SIM from the listing title", () => {
  const variant = N.describeVariant(
    { title: "Apple iPhone 17 Pro Max 256GB Cosmic Orange eSIM" },
    "Apple iPhone 17 Pro Max 256GB"
  );
  assert.equal(variant.label, "Cosmic Orange, eSIM");
  assert.equal(variant.key, "color=cosmic-orange|sim=esim");
});

test("variant: read from the store link when the title has nothing", () => {
  const variant = N.describeVariant(
    { url: "https://shop.example/p/iphone-17-pro-max-256gb-deep-blue" },
    "Apple iPhone 17 Pro Max 256GB"
  );
  assert.equal(variant.label, "Deep Blue");
});

test("variant: storage and RAM for a laptop", () => {
  const variant = N.describeVariant(
    { title: "MacBook Air 13 M4 16GB RAM 512GB Midnight" },
    "MacBook Air 13 M4"
  );
  assert.equal(variant.label, "512GB, 16GB RAM, Midnight");
});

test("variant: nothing extra means no variant", () => {
  assert.equal(
    N.describeVariant({ title: "Apple iPhone 17 Pro Max 256GB" }, "Apple iPhone 17 Pro Max 256GB"),
    null
  );
});

test("store links lose tracking parameters", () => {
  assert.equal(
    N.canonicalURL("https://shop.example/p/1?utm_source=x&color=blue#reviews"),
    "https://shop.example/p/1?color=blue"
  );
  assert.equal(N.canonicalURL("javascript:alert(1)"), null);
});

test("every source becomes the same product format", () => {
  const phone = N.fromElectronics(
    { externalId: "abc", name: "Galaxy S25", brand: "Samsung", minPrice: 900, shopCount: 3 },
    ""
  );
  const food = N.fromFacts({ barcode: "3017620422003", name: "Nutella", brand: "Ferrero, Nutella", quantity: "400 g" }, "groceries");
  const part = N.fromAutomotive({ oem: "04465-33471", name: "Front Brake Pads", price: "285.50" });

  for (const product of [phone, food, part]) {
    for (const field of ["key", "name", "brand", "category", "price", "currency", "market", "specifications"]) {
      assert.ok(field in product, `${product.name} has ${field}`);
    }
  }

  assert.equal(phone.currency, "USD");
  assert.equal(phone.market, "Lebanon");
  assert.equal(food.price, null, "no invented grocery price");
  assert.equal(food.brand, "Ferrero");
  assert.equal(part.currency, "SAR");
  assert.equal(part.market, "Saudi Arabia");
});
