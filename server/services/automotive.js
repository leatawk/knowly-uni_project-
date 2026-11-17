
const BASE_URL = "https://speero.net/api/v1";

const CACHE_MS = 5 * 60 * 1000;
const cache = new Map();
const pending = new Map();

const HEADERS = {
  "User-Agent": "Knowly/1.0 (academic product comparison project)",
  "Accept": "application/json"
};

// =====================================
// HELPERS
// =====================================

function text(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function money(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "object") {
    return money(value.amount ?? value.value ?? null);
  }

  const cleaned =
    typeof value === "string"
      ? value.replace(/[,\s]/g, "")
      : value;

  const number = Number(cleaned);
  return Number.isFinite(number) && number >= 0
    ? number
    : null;
}

function findProducts(payload) {
  if (Array.isArray(payload)) return payload;

  const queue = [payload];
  const visited = new Set();

  while (queue.length) {
    const current = queue.shift();

    if (!current || typeof current !== "object") continue;
    if (visited.has(current)) continue;

    visited.add(current);

    for (const key of [
      "products",
      "parts",
      "results",
      "items",
      "hits"
    ]) {
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

function formatPart(item) {
  const p = item.part || item;

  const oem = text(
    p.oem ??
    p.oem_number ??
    p.part_number ??
    p.partNumber ??
    p.sku ??
    ""
  );

  const bestOffer =
    p.best_offer ||
    p.bestOffer ||
    p.offer ||
    {};

  const price = money(
    p.price ??
    bestOffer.price ??
    null
  );

  const brand =
    typeof p.brand === "string"
      ? p.brand
      : text(p.brand?.name || p.manufacturer);

  const grade = text(
    p.grade ||
    p.quality_grade ||
    p.part_grade
  );

  const category =
    typeof p.category === "string"
      ? p.category
      : text(p.category?.name);

  const image =
    p.image_url ||
    p.image ||
    p.thumbnail ||
    p.images?.[0]?.url ||
    (typeof p.images?.[0] === "string"
      ? p.images[0]
      : null);

  const productUrl =
    p.url ||
    p.product_url ||
    p.productUrl ||
    p.canonical_url ||
    null;

  return {
    externalId: oem || null,
    oem: oem || null,
    name: text(
      p.name ||
      p.title ||
      p.product_name ||
      p.part_name
    ) || "Unnamed automotive part",
    brand: brand || null,
    category: category || null,
    grade: grade || null,
    side: text(p.side || p.position) || null,
    image: image || null,
    price,
    currency: "SAR",
    market: "Saudi Arabia",
    productUrl,
    specifications:
      p.specifications ||
      p.attributes ||
      {},
    source: "Automotive"
  };
}

// =====================================
// FETCH DATA
// =====================================

async function fetchJSON(url) {
  let response;

  try {
    response = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(15000)
    });
  } catch {
    throw new Error(
      "Automotive catalogue is temporarily unavailable"
    );
  }

  if (response.status === 404) return null;

  if (!response.ok) {
    throw new Error(
      `Automotive catalogue returned HTTP ${response.status}`
    );
  }

  return response.json();
}

// =====================================
// CACHE REQUESTS
// =====================================

async function cachedRequest(key, request) {
  const existing = cache.get(key);

  if (existing && Date.now() < existing.expiresAt) {
    return existing.value;
  }

  if (pending.has(key)) {
    return pending.get(key);
  }

  const task = request()
    .then(value => {
      cache.set(key, {
        value,
        expiresAt: Date.now() + CACHE_MS
      });

      return value;
    })
    .finally(() => {
      pending.delete(key);
    });

  pending.set(key, task);

  return task;
}

// =====================================
// SEARCH PARTS BY NAME OR OEM
// =====================================

async function searchProducts(query) {
  const term = text(query);

  if (term.length < 2 || term.length > 100) {
    throw new Error(
      "Search must contain between 2 and 100 characters"
    );
  }

  return cachedRequest(
    `search:${term.toLowerCase()}`,
    async () => {
      const params = new URLSearchParams({
        q: term,
        locale: "en",
        page: "1",
        perPage: "20"
      });

      const data = await fetchJSON(
        `${BASE_URL}/search?${params.toString()}`
      );

      const products = findProducts(data)
        .filter(item => item && typeof item === "object")
        .map(formatPart);

      return products;
    }
  );
}

// =====================================
// GET FULL PART DETAILS
// =====================================

async function getPartByOEM(oem) {
  const reference = text(oem);

  if (
    reference.length < 2 ||
    reference.length > 100 ||
    !/^[a-zA-Z0-9._/-]+$/.test(reference)
  ) {
    throw new Error("Invalid OEM number");
  }

  return cachedRequest(
    `part:${reference.toLowerCase()}`,
    async () => {
      const url =
        `${BASE_URL}/parts/${encodeURIComponent(reference)}` +
        "?locale=en";

      const data = await fetchJSON(url);

      if (!data) return null;

      const part =
        data.part ||
        data.product ||
        data.data?.part ||
        data.data?.product ||
        data.data ||
        data;

      return formatPart(part);
    }
  );
}

module.exports = {
  searchProducts,
  getPartByOEM
};
