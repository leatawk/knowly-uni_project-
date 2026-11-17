// =====================================================
// KNOWLY - STORE OFFERS IN POSTGRESQL
//
// Shared by every feature that saves or reads a retailer
// price: electronics tracking, grocery/beauty offers,
// automotive listings and manually verified prices.
//
// Rules enforced here:
//   - one row per real listing (no duplicates)
//   - price_history gets a row only for a first
//     observation or a real price change
//   - prices in different currencies are never ranked
//     against each other
// =====================================================

const DataSource = require("../models/DataSource");
const Store = require("../models/Store");
const Brand = require("../models/Brand");
const ProductVariant = require("../models/ProductVariant");
const Offer = require("../models/Offer");
const PriceHistory = require("../models/PriceHistory");
const { toNumber, safeURL } = require("./normalize");

const INACTIVE = "Not listed";

// What the customer sees instead of a provider name.
const SOURCE_LABELS = {
  "LebTech": "Store listing",
  "Speero": "Store listing",
  "Open Prices": "Reported by shoppers",
  "Knowly verified listing": "Verified listing"
};

// -------------------------------------
// Find-or-create helpers (inside a transaction)
// -------------------------------------

// -------------------------------------
// Reference rows
//
// The SQL lives in the models; these keep the names the
// rest of the application already imports.
// -------------------------------------

function ensureSource(client, name, type, description, baseUrl) {
  return DataSource.ensure(
    client,
    name,
    type,
    description,
    baseUrl
  );
}

function ensureStore(client, name, websiteUrl, country) {
  return Store.ensure(client, name, websiteUrl, country);
}

function ensureBrand(client, name) {
  return Brand.ensure(client, name);
}

function ensureVariant(client, productId, variant) {
  return ProductVariant.ensure(client, productId, variant);
}

// -------------------------------------
// Insert or update ONE offer
//
// existing: the matching row ({ id, price, currency })
//           or null when the listing is new.
// Returns { id, status } where status is
// "new" | "changed" | "unchanged".
// -------------------------------------

async function saveOffer(client, existing, offer) {
  const price = Number(offer.price).toFixed(2);
  let id;
  let status;

  if (existing) {
    id = existing.id;

    status =
      existing.price === null ||
      Number(existing.price).toFixed(2) !== price ||
      existing.currency !== offer.currency
        ? "changed"
        : "unchanged";

    await Offer.update(client, id, offer, price);

  } else {
    id = await Offer.insert(client, offer, price);
    status = "new";
  }

  // Record only a first observation or a real change.
  if (status !== "unchanged") {
    await PriceHistory.record(
      client,
      id,
      price,
      offer.currency,
      offer.recordedAt
    );
  }

  return { id, status };
}

// -------------------------------------
// Read offers
// -------------------------------------

function formatOffer(row, liveIds) {
  const store = row.store_name || "Unknown store";
  const availability = row.availability || "Unknown";

  return {
    id: String(row.id),
    store,
    storeName: store,
    storeUrl: safeURL(row.store_website),
    market: row.store_country || null,
    price: toNumber(row.price),
    currency: row.currency || "USD",
    condition: row.condition || "New",
    availability,
    variant: row.variant_name || null,
    url: safeURL(row.product_url),
    checkedAt: row.last_checked_at
      ? new Date(row.last_checked_at).toISOString()
      : null,
    sourceLabel: SOURCE_LABELS[row.source_name] || "Store listing",
    active: availability !== INACTIVE,
    live: Boolean(liveIds && liveIds.has(String(row.id)))
  };
}

function sortOffers(offers) {
  const rank = offer =>
    !offer.active ? 2 : offer.availability === "Out of stock" ? 1 : 0;

  return offers.sort((a, b) =>
    rank(a) - rank(b) ||
    a.currency.localeCompare(b.currency) ||
    a.price - b.price
  );
}

async function readOffers(productId, liveIds) {
  const rows = await Offer.findByProductId(productId);

  return sortOffers(
    rows.map(row => formatOffer(row, liveIds))
  );
}

async function readOffersForProducts(productIds) {
  const grouped = new Map();
  if (!productIds.length) return grouped;

  const rows = await Offer.findByProductIds(productIds);

  for (const row of rows) {
    const key = String(row.product_id);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(formatOffer(row));
  }

  for (const offers of grouped.values()) sortOffers(offers);

  return grouped;
}

// -------------------------------------
// Lowest verified price
//
// Prices are ranked only inside one currency. When a
// product has offers in several currencies, "best" is
// null and the caller shows one lowest price per currency.
// -------------------------------------

function summarize(offers) {
  const listed = offers.filter(offer => offer.active);

  const available = listed.filter(
    offer => offer.availability !== "Out of stock"
  );

  const pool = available.length ? available : listed;
  const lowest = new Map();

  for (const offer of pool) {
    const current = lowest.get(offer.currency);

    if (!current || offer.price < current.price) {
      lowest.set(offer.currency, offer);
    }
  }

  const lowestByCurrency = [...lowest.values()];

  return {
    best: lowestByCurrency.length === 1 ? lowestByCurrency[0] : null,
    lowestByCurrency,
    offerCount: listed.length,
    storeCount: new Set(listed.map(offer => offer.store)).size
  };
}

module.exports = {
  INACTIVE,
  ensureSource,
  ensureStore,
  ensureBrand,
  ensureVariant,
  saveOffer,
  readOffers,
  readOffersForProducts,
  summarize
};
