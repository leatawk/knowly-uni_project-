
// =====================================================
// KNOWLY - OPEN PRICES
// Lebanese shopper-reported grocery prices
// =====================================================

const config = require("../config/env");

const BASE_URL = config.providers.openPricesUrl;

const CACHE_MS = 30 * 60 * 1000;
const EMPTY_CACHE_MS = 5 * 60 * 1000;
const COOLDOWN_MS = 5 * 60 * 1000;

const MAX_PRICE_PAGES = 5;
const MAX_LOCATION_PAGES = 10;
const PAGE_SIZE = 100;
const CHUNK_SIZE = 40;

const LEBANON = {
  lat: "33.87",
  lon: "35.86",
  radius_km: "140"
};

const HEADERS = {
  "User-Agent": "Knowly/1.0 (academic price comparison project)",
  Accept: "application/json"
};

const cache = new Map();
const pending = new Map();

let unavailableUntil = 0;

// =====================================
// HTTP REQUEST
// =====================================

async function fetchJSON(path, params = {}) {
  const url = new URL(`${BASE_URL}${path}`);

  for (const [key, value] of Object.entries(params)) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(12000)
  });

  if (!response.ok) {
    const error = new Error(
      `Open Prices HTTP ${response.status}`
    );

    error.status = response.status;
    throw error;
  }

  return response.json();
}

// =====================================
// PAGINATION
// =====================================

async function fetchPages(
  path,
  params,
  maximumPages = MAX_PRICE_PAGES
) {
  const results = [];

  for (let page = 1; page <= maximumPages; page++) {
    const data = await fetchJSON(path, {
      ...params,
      page,
      size: PAGE_SIZE
    });

    const items = Array.isArray(data.items)
      ? data.items
      : [];

    results.push(...items);

    const totalPages = Number(data.pages);

    if (
      items.length === 0 ||
      (
        Number.isFinite(totalPages) &&
        page >= totalPages
      ) ||
      (
        !Number.isFinite(totalPages) &&
        items.length < PAGE_SIZE
      )
    ) {
      break;
    }
  }

  return results;
}

// =====================================
// CHECK STORE COUNTRY
// =====================================

function isLebanese(location) {
  return (
    String(
      location?.osm_address_country_code || ""
    ).toUpperCase() === "LB"
  );
}

// =====================================
// SEARCH PRICES AROUND LEBANON
// =====================================

async function pricesByArea(barcode) {
  return fetchPages(
    "/api/v1/prices",
    {
      product_code: barcode,
      type: "PRODUCT",
      ...LEBANON,
      order_by: "-date"
    }
  );
}

// =====================================
// FIND LEBANESE STORE LOCATIONS
// =====================================

async function locationsByCountry(country) {
  return fetchPages(
    "/api/v1/locations",
    {
      osm_address_country__like: country,
      type: "OSM",
      order_by: "-price_count"
    },
    MAX_LOCATION_PAGES
  );
}

// =====================================
// SEARCH BY LEBANESE STORE IDS
// =====================================

async function pricesByShops(barcode) {
  const locations = new Map();

  for (const country of ["Lebanon", "لبنان"]) {
    const results = await locationsByCountry(country);

    for (const location of results) {
      if (isLebanese(location)) {
        locations.set(location.id, location);
      }
    }
  }

  const ids = [...locations.keys()];

  if (!ids.length) return [];

  const results = [];

  for (
    let i = 0;
    i < ids.length;
    i += CHUNK_SIZE
  ) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);

    const prices = await fetchPages(
      "/api/v1/prices",
      {
        product_code: barcode,
        type: "PRODUCT",
        location_id__in: chunk.join(","),
        order_by: "-date"
      }
    );

    for (const item of prices) {
      results.push({
        ...item,
        location:
          item.location ||
          locations.get(item.location_id)
      });
    }
  }

  return results;
}

// =====================================
// FORMAT A PRICE RECORD
// =====================================

function toObservation(item, barcode) {
  const location = item.location || {};

  const productCode = String(
    item.product_code ||
    item.product?.code ||
    ""
  );

  const price = Number(item.price);
  const date = Date.parse(item.date || "");

  if (
    !isLebanese(location) ||
    productCode !== barcode ||
    (
      item.type &&
      item.type !== "PRODUCT"
    ) ||
    !Number.isFinite(price) ||
    price <= 0 ||
    !Number.isFinite(date) ||
    !item.currency
  ) {
    return null;
  }

  const store = String(
    location.osm_name ||
    location.osm_brand ||
    location.osm_display_name?.split(",")[0] ||
    ""
  ).trim();

  if (!store) return null;

  const city = String(
    location.osm_address_city || ""
  ).trim();

  let website = null;

  try {
    const url = new URL(location.website_url);

    if (
      url.protocol === "https:" ||
      url.protocol === "http:"
    ) {
      website = url.href;
    }
  } catch {
    website = null;
  }

  return {
    locationId: location.id || item.location_id,

    storeName: (
      city ? `${store} (${city})` : store
    ).slice(0, 255),

    website,

    market: "Lebanon",

    price,

    currency: String(
      item.currency
    ).toUpperCase(),

    date: new Date(date).toISOString(),

    sourceLabel: "Reported by shoppers",

    recordUrl:
      `${BASE_URL}/products/${barcode}`
  };
}

// =====================================
// REMOVE DUPLICATES
// =====================================

function uniqueLatest(items, barcode) {
  const latest = new Map();

  for (const item of items) {
    const observation = toObservation(
      item,
      barcode
    );

    if (!observation) continue;

    const key = observation.locationId;

    const previous = latest.get(key);

    if (
      !previous ||
      new Date(observation.date) >
        new Date(previous.date)
    ) {
      latest.set(key, observation);
    }
  }

  return [...latest.values()].sort(
    (a, b) =>
      Number(a.price) - Number(b.price)
  );
}

// =====================================
// LOAD PRODUCT PRICES
// =====================================

async function load(barcode) {
  let observations = [];

  try {
    const results = await pricesByArea(barcode);

    observations = uniqueLatest(
      results,
      barcode
    );

  } catch (error) {
    // Use the location-based fallback only when
    // the geographic query is rejected.

    if (![400, 404, 422].includes(error.status)) {
      throw error;
    }
  }

  // Search registered Lebanese locations if
  // the geographic search did not find a match.

  if (!observations.length) {
    const results = await pricesByShops(barcode);

    observations = uniqueLatest(
      results,
      barcode
    );
  }

  return observations;
}

// =====================================
// PUBLIC FUNCTION
// =====================================

async function getLebanesePrices(code) {
  const barcode = String(code || "").trim();

  if (!/^[0-9]{8,14}$/.test(barcode)) {
    return [];
  }

  const cached = cache.get(barcode);

  if (
    cached &&
    Date.now() < cached.expiresAt
  ) {
    return cached.prices;
  }

  if (Date.now() < unavailableUntil) {
    throw new Error(
      "Lebanese price data is temporarily unavailable. Please try again later."
    );
  }

  if (pending.has(barcode)) {
    return pending.get(barcode);
  }

  const task = load(barcode)
    .then(prices => {
      cache.set(barcode, {
        prices,
        expiresAt:
          Date.now() +
          (
            prices.length
              ? CACHE_MS
              : EMPTY_CACHE_MS
          )
      });

      return prices;
    })
    .catch(error => {
      unavailableUntil =
        Date.now() + COOLDOWN_MS;

      throw error;
    })
    .finally(() => {
      pending.delete(barcode);
    });

  pending.set(barcode, task);

  return task;
}

module.exports = {
  getLebanesePrices
};
