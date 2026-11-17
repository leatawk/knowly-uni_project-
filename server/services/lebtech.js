
// =====================================================
// LEBANESE ELECTRONICS PRICES (LebTech MCP)
//
// The provider allows roughly 5 requests per 10 seconds
// per IP address and re-checks shop prices nightly.
// To stay inside that limit this file:
//   - keeps ONE connection open instead of reconnecting
//     for every search (a new connection costs 3-4 requests)
//   - spaces calls a little apart
//   - caches answers for 30 minutes
//   - shares identical requests that are already running
//   - stops calling the provider during a rate-limit pause
// =====================================================

const config = require("../config/env");

const ENDPOINT = config.providers.lebtechMcpUrl;

const CACHE_MS = 30 * 60 * 1000;
const MIN_GAP_MS = 1500;
const MAX_CACHE_ENTRIES = 300;

const cache = new Map();
const pending = new Map();

let session = null;
let queue = Promise.resolve();
let lastCallAt = 0;

let blockedUntil = 0;
let consecutiveLimits = 0;

// =====================================
// RATE LIMITING
// =====================================

function isRateLimited(error) {
  return (
    error?.code === "RATE_LIMITED" ||
    Number(error?.code || error?.status) === 429 ||
    /(?:\b429\b|error.?1015|rate.?limit|too many requests)/i.test(
      String(error?.message || "")
    )
  );
}

function rateLimitRemaining() {
  return Math.max(
    0,
    Math.ceil((blockedUntil - Date.now()) / 1000)
  );
}

function rateLimitError(seconds) {
  const error = new Error(
    `Live prices are temporarily rate limited. Retry in ${seconds} seconds.`
  );

  error.code = "RATE_LIMITED";
  error.status = 429;
  error.retryAfter = seconds;

  return error;
}

function startCooldown(error) {
  consecutiveLimits++;

  const reported = Number(
    String(error?.message || "").match(
      /"?retry[_-]after"?\s*[:=]\s*(\d+)/i
    )?.[1] || 0
  );

  const seconds = Math.min(
    600,
    Math.max(
      30,
      reported,
      30 * 2 ** Math.min(consecutiveLimits - 1, 5)
    )
  );

  blockedUntil = Date.now() + seconds * 1000;

  console.warn(
    `Electronics price requests paused for ${seconds} seconds (rate limit).`
  );

  return seconds;
}

// =====================================
// ONE SHARED CONNECTION
// =====================================

async function openSession() {
  const { Client } = await import(
    "@modelcontextprotocol/sdk/client/index.js"
  );
  const { StreamableHTTPClientTransport } = await import(
    "@modelcontextprotocol/sdk/client/streamableHttp.js"
  );

  const client = new Client({
    name: "knowly",
    version: "1.0.0"
  });

  const transport = new StreamableHTTPClientTransport(
    new URL(ENDPOINT)
  );

  await client.connect(transport);

  return client;
}

function getSession() {
  if (!session) {
    const opening = openSession();

    session = opening;

    opening.catch(() => {
      if (session === opening) session = null;
    });
  }

  return session;
}

async function dropSession() {
  const current = session;
  session = null;

  if (current) {
    try {
      const client = await current;
      await client.close();
    } catch {
      // The connection was already unusable.
    }
  }
}

function readResponse(response) {
  if (response.isError) {
    const error = new Error("LebTech returned a tool error");
    error.final = true;
    throw error;
  }

  if (response.structuredContent) {
    return response.structuredContent;
  }

  const text = (response.content || [])
    .filter(item => item.type === "text")
    .map(item => item.text)
    .join("\n");

  try {
    return JSON.parse(text);
  } catch {
    const block = text.match(
      /```(?:json)?\s*([\s\S]*?)```/
    );

    if (block) {
      try {
        return JSON.parse(block[1]);
      } catch {
        // Falls through to the error below.
      }
    }

    console.error(
      "Unexpected LebTech response:",
      text.slice(0, 500)
    );

    const error = new Error(
      "LebTech returned an unexpected response format"
    );

    error.final = true;
    throw error;
  }
}

async function request(name, args) {
  const client = await getSession();

  const response = await client.callTool(
    { name, arguments: args },
    undefined,
    { timeout: 20000 }
  );

  return readResponse(response);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callTool(name, args) {
  if (rateLimitRemaining() > 0) {
    throw rateLimitError(rateLimitRemaining());
  }

  // Calls run one after another, slightly spaced.
  const task = queue.then(async () => {
    if (rateLimitRemaining() > 0) {
      throw rateLimitError(rateLimitRemaining());
    }

    const gap = lastCallAt + MIN_GAP_MS - Date.now();
    if (gap > 0) await wait(gap);

    try {
      const data = await request(name, args);
      consecutiveLimits = 0;
      return data;

    } catch (error) {
      if (isRateLimited(error)) {
        await dropSession();
        throw rateLimitError(startCooldown(error));
      }

      const timedOut = /timed? ?out/i.test(
        String(error?.message || "")
      );

      if (error.final || timedOut) throw error;

      // The saved connection may have expired:
      // reconnect once and try again.
      await dropSession();

      try {
        const data = await request(name, args);
        consecutiveLimits = 0;
        return data;

      } catch (retryError) {
        if (!retryError.final) await dropSession();

        if (isRateLimited(retryError)) {
          throw rateLimitError(startCooldown(retryError));
        }

        throw retryError;
      }
    } finally {
      lastCallAt = Date.now();
    }
  });

  queue = task.catch(() => {});

  return task;
}

// =====================================
// RESPONSE HELPERS
// =====================================

function findArray(data, keys) {
  const queue = [data];
  const visited = new Set();

  while (queue.length) {
    const current = queue.shift();

    if (!current || typeof current !== "object") {
      continue;
    }

    if (visited.has(current)) continue;
    visited.add(current);

    if (Array.isArray(current)) {
      return current;
    }

    for (const key of keys) {
      if (Array.isArray(current[key])) {
        return current[key];
      }
    }

    for (const key of ["data", "result", "payload"]) {
      if (current[key]) {
        queue.push(current[key]);
      }
    }
  }

  return [];
}

function money(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    return money(value[0]);
  }

  if (typeof value === "object") {
    return money(
      value.amount ??
      value.min ??
      value.low ??
      value.value
    );
  }

  if (typeof value === "string") {
    const cleaned = value.replace(/[$,]/g, "").trim();
    if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
    value = cleaned;
  }

  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function normalizeProduct(item) {
  const p = item.product || item;

  const externalId =
    p.product_id ??
    p.id ??
    p.slug ??
    p.product_url ??
    p.url ??
    null;

  const shopCount =
    p.shop_count ??
    p.shops_count ??
    p.store_count ??
    (Array.isArray(p.shops) ? p.shops.length : null);

  return {
    externalId:
      externalId == null ? null : String(externalId),
    name:
      p.name ||
      p.title ||
      p.product_name ||
      p.model ||
      "Unnamed product",
    brand: p.brand || p.brand_name || null,
    category: p.category || null,
    image: p.image_url || p.image || p.thumbnail || null,
    minPrice: money(
      p.lowest_price_usd ??
      p.min_price_usd ??
      p.best_price_usd ??
      p.cheapest_price_usd ??
      p.lowest_price ??
      p.min_price ??
      p.best_price ??
      p.price_range ??
      p.price
    ),
    currency: "USD",
    shopCount,
    productUrl:
      p.product_url ||
      p.url ||
      p.page ||
      p.lebtech_url ||
      null,
    specifications:
      plainObject(p.specs) ||
      plainObject(p.specifications) ||
      plainObject(p.attributes) ||
      {},
    source: "LebTech"
  };
}

function normalizeOffer(item) {
  const store = item.shop || item.store || {};
  const details =
    plainObject(item.attributes) ||
    plainObject(item.specs) ||
    plainObject(item.variant) ||
    {};

  return {
    storeName:
      item.shop_name ||
      item.store_name ||
      (typeof store === "string" ? store : store.name) ||
      "Unknown store",
    price: money(
      item.price_usd ??
      item.final_price_usd ??
      item.price ??
      item.amount
    ),
    currency: item.currency || "USD",
    availability:
      item.availability ??
      item.in_stock ??
      null,
    condition: item.condition || null,
    url:
      item.shop_url ||
      item.product_url ||
      item.offer_url ||
      item.url ||
      item.link ||
      (typeof store === "object" ? store.url : null) ||
      null,
    checkedAt:
      item.checked_at ||
      item.updated_at ||
      null,

    // Details that tell one listing of a store from
    // another (colour, storage, SIM ...).
    title:
      item.title ||
      item.listing_title ||
      item.product_title ||
      item.product_name ||
      item.name ||
      null,
    variant:
      typeof item.variant === "string"
        ? item.variant
        : item.variant_name || null,
    attributes: {
      color: item.color ?? item.colour ?? details.color ?? details.colour ?? null,
      storage: item.storage ?? item.capacity ?? details.storage ?? null,
      ram: item.ram ?? details.ram ?? null,
      sim: item.sim ?? details.sim ?? null
    }
  };
}

// =====================================
// CACHE
// =====================================

async function cachedCall(key, action) {
  const saved = cache.get(key);

  if (saved && Date.now() < saved.expiresAt) {
    return saved.data;
  }

  if (pending.has(key)) {
    return pending.get(key);
  }

  const task = action()
    .then(data => {
      if (cache.size >= MAX_CACHE_ENTRIES) {
        cache.delete(cache.keys().next().value);
      }

      cache.set(key, {
        data,
        expiresAt: Date.now() + CACHE_MS
      });

      return data;
    })
    .finally(() => {
      pending.delete(key);
    });

  pending.set(key, task);

  return task;
}

// =====================================
// SEARCH PRODUCTS
// =====================================

async function searchProducts(query) {
  const term = String(query || "").trim();

  if (term.length < 2 || term.length > 100) {
    throw new Error("Enter a search term of 2-100 characters");
  }

  return cachedCall(`search:${term.toLowerCase()}`, async () => {
    const data = await callTool("search_products", {
      query: term,
      market: "LB",
      limit: 10
    });

    const raw = findArray(data, [
      "products",
      "results",
      "items",
      "matches"
    ]);

    return raw.map(normalizeProduct);
  });
}

// =====================================
// STORE PRICES FOR ONE PRODUCT
// =====================================

async function getProductPrices(product) {
  const reference = String(product || "").trim();

  if (!reference || reference.length > 500) {
    throw new Error("Invalid LebTech product reference");
  }

  return cachedCall(`prices:${reference}`, async () => {
    const data = await callTool("get_product_prices", {
      product: reference,
      market: "LB"
    });

    const raw = findArray(data, [
      "offers",
      "shops",
      "prices",
      "stores",
      "listings"
    ]);

    // When the answer comes from the cache, this is the
    // moment the prices were really fetched.
    const fetchedAt = new Date().toISOString();

    return raw
      .map(normalizeOffer)
      .filter(item => item.price !== null)
      .map(item => ({ ...item, fetchedAt }))
      .sort((a, b) => a.price - b.price);
  });
}

module.exports = {
  searchProducts,
  getProductPrices,
  isRateLimited,
  rateLimitRemaining
};
