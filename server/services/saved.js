// =====================================================
// KNOWLY - SAVED PRODUCTS (WISHLIST) AND SAVED COMPARISONS
//
// Everything here belongs to the logged-in user
// (req.user from auth.requireUser).
//
//   wishlists          existing table: user_id + product_id
//   saved_comparisons  added by database/migrations.js
// =====================================================

const db = require("../db");
const Product = require("../models/Product");
const Wishlist = require("../models/Wishlist");
const SavedComparison = require("../models/SavedComparison");
const catalog = require("./catalog");

const MAX_SAVED_PRODUCTS = 200;
const MAX_SAVED_COMPARISONS = 50;

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  error.expose = true;
  return error;
}

function validId(value) {
  return /^[1-9][0-9]{0,18}$/.test(String(value || ""));
}

// A product reference from the frontend -> its PostgreSQL id.
// Products found in a search are saved first (catalog.resolve).
async function productIdFor(ref) {
  if (!ref || typeof ref !== "object") {
    throw fail(400, "Unknown product.");
  }

  if (validId(ref.id)) {
    if (await Product.exists(ref.id)) {
      return String(ref.id);
    }
  }

  const detail = await catalog.resolve(ref);

  if (!detail.product.id) {
    throw fail(
      503,
      "This product cannot be saved right now because its store prices are temporarily unavailable. Try again in a minute."
    );
  }

  return String(detail.product.id);
}

// -------------------------------------
// Everything the user saved
// -------------------------------------

async function list(userId) {
  const wishedIds = await Wishlist.findProductIds(userId);

  const compared = { rows: await SavedComparison.findForUser(userId) };

  // One query for every product the page needs.
  const ids = [
    ...wishedIds,
    ...compared.rows.flatMap(row => row.product_ids.map(String))
  ];

  const products = await catalog.productsByIds([...new Set(ids)]);
  const byId = new Map(products.map(product => [product.id, product]));

  return {
    products: wishedIds
      .map(id => byId.get(id))
      .filter(Boolean),

    comparisons: compared.rows
      .map(row => ({
        id: String(row.id),
        name: row.name,
        createdAt: row.created_at,
        products: row.product_ids
          .map(id => byId.get(String(id)))
          .filter(Boolean)
      }))
      // A comparison whose products were removed is not shown.
      .filter(comparison => comparison.products.length >= 2)
  };
}

// -------------------------------------
// Wishlist
// -------------------------------------

async function saveProduct(userId, ref) {
  const productId = await productIdFor(ref);

  const saved = await Wishlist.countForUser(userId);

  if (saved >= MAX_SAVED_PRODUCTS) {
    throw fail(400, `You can save up to ${MAX_SAVED_PRODUCTS} products. Remove some first.`);
  }

  // UNIQUE(user_id, product_id): saving twice changes nothing.
  await Wishlist.add(userId, productId);

  return list(userId);
}

async function removeProduct(userId, productId) {
  if (!validId(productId)) throw fail(400, "Invalid product ID");

  await Wishlist.remove(userId, productId);

  return list(userId);
}

// -------------------------------------
// Saved comparisons
// -------------------------------------

function shortName(name) {
  const clean = String(name || "Product").replace(/\s+/g, " ").trim();
  return clean.length > 60 ? `${clean.slice(0, 57)}...` : clean;
}

async function saveComparison(userId, body) {
  const input = body && typeof body === "object" ? body : {};
  const items = input.items;

  if (!Array.isArray(items) || items.length < 2 || items.length > 5) {
    throw fail(400, "A comparison needs 2 to 5 products.");
  }

  const ids = [];

  // One after another, to stay gentle on live price sources.
  for (const item of items) {
    ids.push(await productIdFor(item));
  }

  if (new Set(ids).size !== ids.length) {
    throw fail(400, "A comparison needs different products.");
  }

  const names = await Product.findNamesByIds(ids);

  const nameById = new Map(
    names.map(row => [String(row.id), row.name])
  );

  const typed = String(input.name || "").replace(/\s+/g, " ").trim().slice(0, 200);
  const name = typed || ids.map(id => shortName(nameById.get(id))).join(" vs ").slice(0, 200);

  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    await SavedComparison.lockForUser(client, userId);

    // The same set of products is saved only once.
    const sorted = [...ids].sort((a, b) => Number(a) - Number(b));

    const existing =
      await SavedComparison.findBySortedProductIds(
        client,
        userId,
        sorted
      );

    if (!existing) {
      const total = await SavedComparison.countForUser(
        client,
        userId
      );

      if (total >= MAX_SAVED_COMPARISONS) {
        throw fail(400, `You can save up to ${MAX_SAVED_COMPARISONS} comparisons. Delete some first.`);
      }

      await SavedComparison.insert(client, userId, name, ids);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return list(userId);
}

async function removeComparison(userId, comparisonId) {
  if (!validId(comparisonId)) throw fail(400, "Invalid comparison ID");

  await SavedComparison.remove(userId, comparisonId);

  return list(userId);
}

module.exports = {
  list,
  saveProduct,
  removeProduct,
  saveComparison,
  removeComparison
};
