
// =====================================================
// ELECTRONICS PRICE TRACKING
//
// Fetches the live Lebanese store listings of a product,
// saves every genuinely different listing as its own
// offer (colour, storage, SIM, condition, product page)
// and records price changes in price_history.
// =====================================================

const db = require("../db");
const PriceHistory = require("../models/PriceHistory");
const electronics = require("./lebtech");
const store = require("./offerStore");
const {
  canonicalURL,
  safeURL,
  describeVariant
} = require("./normalize");

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED = new Set([
  "electronics",
  "computers-accessories"
]);

const pending = new Map();

let blockedUntil = 0;
let consecutiveLimits = 0;

function clean(value, max = 255) {
  return typeof value === "string"
    ? value.trim().slice(0, max)
    : "";
}

function toPrice(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) &&
    number >= 0 &&
    number <= 9999999999
    ? number.toFixed(2)
    : null;
}

// =====================================
// DETECT RATE LIMITING
// =====================================

function isRateLimited(error) {
  return (
    Number(error?.code || error?.status) === 429 ||
    /(?:\b429\b|error.?1015|rate.?limit)/i.test(
      String(error?.message || "")
    )
  );
}

function startCooldown(error) {
  consecutiveLimits++;

  const reported = Number(
    error?.retryAfter ||
    String(error?.message || "").match(
      /"retry_after"\s*:\s*(\d+)/
    )?.[1] || 30
  );

  const exponentialSeconds = Math.min(
    600,
    30 * 2 ** Math.min(consecutiveLimits - 1, 5)
  );

  const waitSeconds = Math.max(
    30,
    reported,
    exponentialSeconds
  );

  blockedUntil = Date.now() + waitSeconds * 1000;

  console.warn(
    `Price requests paused for ${waitSeconds} seconds due to rate limiting.`
  );

  return waitSeconds;
}

// =====================================
// NORMALIZE STORE LISTINGS
//
// A listing is identified by store + condition +
// variant + product page. Two listings are merged only
// when all four are identical (a true duplicate) or when
// the store gives nothing to tell them apart.
// =====================================

function normalizeOffers(rawOffers, productName) {
  const unique = new Map();

  for (const item of rawOffers) {
    const storeName = clean(item.storeName);
    const amount = toPrice(item.price);

    if (
      !storeName ||
      storeName.toLowerCase() === "unknown store" ||
      amount === null
    ) {
      continue;
    }

    const condition =
      clean(item.condition, 50) || "New";

    const currency =
      clean(item.currency, 10).toUpperCase() || "USD";

    const availability =
      typeof item.availability === "boolean"
        ? (
            item.availability
              ? "In stock"
              : "Out of stock"
          )
        : clean(item.availability, 50) || "Unknown";

    const parsedTime = Date.parse(
      item.checkedAt || item.fetchedAt || ""
    );

    const checkedAt = Number.isFinite(parsedTime)
      ? new Date(parsedTime).toISOString()
      : new Date().toISOString();

    const url = canonicalURL(item.url);
    const variant = describeVariant(item, productName);

    const offer = {
      storeName,
      amount,
      condition,
      currency,
      availability,
      url,
      variant,
      checkedAt
    };

    const key = [
      storeName.toLowerCase(),
      condition.toLowerCase(),
      variant ? variant.key : "",
      url || ""
    ].join("|");

    const previous = unique.get(key);

    if (
      !previous ||
      Number(amount) < Number(previous.amount)
    ) {
      unique.set(key, offer);
    }
  }

  return [...unique.values()].sort(
    (a, b) => Number(a.amount) - Number(b.amount)
  );
}

// =====================================
// READ SAVED PRICE HISTORY
// =====================================

async function getProductHistory(productId) {
  if (!/^[1-9][0-9]*$/.test(String(productId))) {
    const error = new Error("Invalid product ID");
    error.status = 400;
    throw error;
  }

  return PriceHistory.findByProductId(productId);
}

// =====================================
// USE PREVIOUSLY SAVED PRICES
// =====================================

async function savedSnapshot(externalId, reason) {
  const matched = await db.pool.query(
    `
    SELECT id
    FROM public.products
    WHERE source_name = 'LebTech'
      AND external_id = $1
    ORDER BY id
    LIMIT 1
    `,
    [externalId]
  );

  const productId = matched.rows[0]?.id || null;

  if (!productId) {
    return {
      productId: null,
      offers: [],
      history: [],
      stats: null,
      warning:
        `${reason} No previously saved offers exist for this product yet.`,
      fromSavedData: true
    };
  }

  const offers = await store.readOffers(productId);

  return {
    productId,
    offers,
    history: await getProductHistory(productId),
    stats: null,
    warning: offers.length
      ? `${reason} Showing previously saved prices, which may be outdated.`
      : `${reason} No previously saved offers exist for this product yet.`,
    fromSavedData: true
  };
}

// =====================================
// FETCH AND TRACK LIVE PRICES
// =====================================

async function performTracking(
  product,
  categorySlug,
  externalId,
  name
) {
  let liveOffers;

  try {
    liveOffers =
      await electronics.getProductPrices(externalId);

    blockedUntil = 0;
    consecutiveLimits = 0;

  } catch (error) {
    if (!isRateLimited(error)) {
      throw error;
    }

    const wait = startCooldown(error);

    return savedSnapshot(
      externalId,
      `Live prices are temporarily rate limited. Retry in at least ${wait} seconds.`
    );
  }

  if (!Array.isArray(liveOffers)) {
    throw new Error(
      "Pricing service returned an unexpected response"
    );
  }

  const validOffers = normalizeOffers(liveOffers, name);

  if (validOffers.length === 0) {
    return savedSnapshot(
      externalId,
      "No usable live store offers were returned."
    );
  }

  const client = await db.pool.connect();

  let productId;
  const liveIds = new Set();

  const stats = {
    listingsReceived: liveOffers.length,
    offersTracked: validOffers.length,
    newOffers: 0,
    priceChanges: 0,
    unchangedOffers: 0,
    skippedOffers:
      liveOffers.length - validOffers.length,
    noLongerListed: 0
  };

  try {
    await client.query("BEGIN");

    await client.query(
      `
      SELECT pg_advisory_xact_lock(
        hashtext('knowly-price-track'),
        hashtext($1)
      )
      `,
      [externalId]
    );

    const category = await client.query(
      `
      SELECT id
      FROM public.categories
      WHERE slug = $1
      LIMIT 1
      `,
      [categorySlug]
    );

    if (!category.rows.length) {
      throw new Error(
        "Product category is missing from PostgreSQL"
      );
    }

    const sourceId = await store.ensureSource(
      client,
      "LebTech",
      "MCP",
      "Lebanese retailer prices",
      "https://lebtechlb.com/api/mcp"
    );

    const brandId = await store.ensureBrand(
      client,
      clean(product.brand)
    );

    // PRODUCT

    const existing = await client.query(
      `
      SELECT id
      FROM public.products
      WHERE source_name = 'LebTech'
        AND external_id = $1
      ORDER BY id
      LIMIT 1
      FOR UPDATE
      `,
      [externalId]
    );

    if (existing.rows.length) {
      productId = existing.rows[0].id;

      await client.query(
        `
        UPDATE public.products
        SET
          name = $2,
          category_id = $3,
          brand_id = COALESCE($4, brand_id),
          image_url = COALESCE($5, image_url),
          product_url = COALESCE($6, product_url),
          updated_at = NOW()
        WHERE id = $1
        `,
        [
          productId,
          name,
          category.rows[0].id,
          brandId,
          safeURL(product.image),
          safeURL(product.productUrl)
        ]
      );
    } else {
      const inserted = await client.query(
        `
        INSERT INTO public.products
          (
            name,
            brand_id,
            category_id,
            image_url,
            specifications,
            source_type,
            source_name,
            external_id,
            product_url
          )
        VALUES (
          $1, $2, $3, $4, $5::jsonb,
          'external', 'LebTech', $6, $7
        )
        RETURNING id
        `,
        [
          name,
          brandId,
          category.rows[0].id,
          safeURL(product.image),
          JSON.stringify({
            catalogCategory:
              clean(product.category, 100) || null,
            market: "Lebanon"
          }),
          externalId,
          safeURL(product.productUrl)
        ]
      );

      productId = inserted.rows[0].id;
    }

    // OFFERS ALREADY SAVED FOR THIS PRODUCT

    const saved = await client.query(
      `
      SELECT
        id,
        store_id,
        variant_id,
        COALESCE("condition", 'New') AS condition,
        product_url,
        price,
        currency,
        availability
      FROM public.offers
      WHERE product_id = $1
        AND (data_source_id = $2 OR data_source_id IS NULL)
      ORDER BY id
      FOR UPDATE
      `,
      [productId, sourceId]
    );

    const free = saved.rows.map(row => ({
      ...row,
      url: canonicalURL(row.product_url)
    }));

    const take = test => {
      const index = free.findIndex(test);
      return index === -1 ? null : free.splice(index, 1)[0];
    };

    const same = (a, b) => String(a ?? "") === String(b ?? "");

    // The lowest listing of each store + condition may
    // take over an offer saved before variants existed.
    const firstOfGroup = new Set();
    const liveUrls = new Set(
      validOffers.map(offer => offer.url).filter(Boolean)
    );

    // STORE LISTINGS

    for (const offer of validOffers) {
      const website = offer.url
        ? new URL(offer.url).origin
        : null;

      const storeId = await store.ensureStore(
        client,
        offer.storeName,
        website,
        "Lebanon"
      );

      const variantId = await store.ensureVariant(
        client,
        productId,
        offer.variant
      );

      const inGroup = row =>
        same(row.store_id, storeId) &&
        row.condition === offer.condition;

      const group = `${storeId}|${offer.condition}`;
      const isFirst = !firstOfGroup.has(group);
      firstOfGroup.add(group);

      const previous =
        // 1. the same listing
        take(row =>
          inGroup(row) &&
          same(row.variant_id, variantId) &&
          same(row.url, offer.url)
        ) ||
        // 2. the same product page, saved before its
        //    variant was known
        (offer.url && take(row =>
          inGroup(row) && row.url === offer.url
        )) ||
        // 3. an older offer of this store that no
        //    current listing matches
        (isFirst && take(row =>
          inGroup(row) &&
          row.variant_id === null &&
          (!row.url || !liveUrls.has(row.url))
        )) ||
        null;

      const result = await store.saveOffer(client, previous, {
        productId,
        storeId,
        variantId,
        sourceId,
        price: offer.amount,
        currency: offer.currency,
        condition: offer.condition,
        availability: offer.availability,
        url: offer.url,
        checkedAt: offer.checkedAt
      });

      liveIds.add(String(result.id));

      if (result.status === "new") stats.newOffers++;
      if (result.status === "changed") stats.priceChanges++;
      if (result.status === "unchanged") stats.unchangedOffers++;
    }

    // Saved listings the stores no longer show keep their
    // last price but are flagged, so they are never
    // presented as a current price.

    const gone = free
      .filter(row => row.availability !== store.INACTIVE)
      .map(row => row.id);

    if (gone.length) {
      await client.query(
        `
        UPDATE public.offers
        SET availability = $2
        WHERE id = ANY($1::bigint[])
        `,
        [gone, store.INACTIVE]
      );

      stats.noLongerListed = gone.length;
    }

    await client.query("COMMIT");

  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return {
    productId,
    offers: await store.readOffers(productId, liveIds),
    history: await getProductHistory(productId),
    stats,
    warning: "",
    fromSavedData: false
  };
}

// =====================================
// RATE-LIMIT-SAFE ENTRY POINT
// =====================================

async function trackProduct(product, categorySlug) {
  const externalId = clean(
    product?.externalId,
    100
  );

  const name = clean(product?.name, 500);

  if (
    !UUID.test(externalId) ||
    !name ||
    !ALLOWED.has(categorySlug)
  ) {
    const error = new Error(
      "Invalid product or category"
    );

    error.status = 400;
    throw error;
  }

  // Respect cooldown before contacting the provider.

  const remaining = Math.max(
    Math.ceil((blockedUntil - Date.now()) / 1000),
    electronics.rateLimitRemaining
      ? electronics.rateLimitRemaining()
      : 0
  );

  if (remaining > 0) {
    return savedSnapshot(
      externalId,
      `Live prices are temporarily rate limited. Retry in ${remaining} seconds.`
    );
  }

  // Avoid duplicate requests for the same product.

  if (pending.has(externalId)) {
    return pending.get(externalId);
  }

  const task = performTracking(
    product,
    categorySlug,
    externalId,
    name
  ).finally(() => {
    pending.delete(externalId);
  });

  pending.set(externalId, task);

  return task;
}

module.exports = {
  trackProduct,
  getProductHistory
};
