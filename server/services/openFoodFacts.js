
const BASE_URL = "https://world.openfoodfacts.org";

// Cache successful searches for 15 minutes
const CACHE_DURATION = 15 * 60 * 1000;

// Avoid retrying repeatedly when service is unavailable
const COOLDOWN_DURATION = 60 * 1000;

// Never wait longer than this for a Retry-After header
const MAX_RETRY_WAIT_MS = 5000;

// Maximum number of products returned to the frontend
const RESULT_LIMIT = 12;

const searchCache = new Map();
const pendingSearches = new Map();

let unavailableUntil = 0;

const HEADERS = {
  "User-Agent": "Knowly/1.0 (academic product research application)",
  "Accept": "application/json"
};

// =====================================
// HELPERS
// =====================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Lowercase, strip accents, collapse punctuation and spaces.
function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, " ")
    .trim();
}

// Split a search term into normalized words.
function tokenize(value) {
  return normalize(value)
    .split(/\s+/)
    .filter(Boolean);
}

// Does a word appear in the text? Partial and
// singular/plural matches count ("biscuits" finds "biscuit").
function wordMatches(text, word) {
  if (text.includes(word)) return true;

  if (word.length > 3 && word.endsWith("s")) {
    return text.includes(word.slice(0, -1));
  }

  return false;
}

// Read Retry-After (seconds) if the provider sent one.
function retryAfterMs(response) {
  const seconds = Number(response.headers.get("retry-after"));

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 1500;
  }

  return Math.min(seconds * 1000, MAX_RETRY_WAIT_MS);
}

function formatProduct(product) {
  return {
    barcode: product.code || null,
    name: product.product_name || "Unknown product",
    brand: product.brands || null,
    quantity: product.quantity || null,
    category: product.categories || null,
    image: product.image_url || null,
    ingredients: product.ingredients_text || null,
    countries: product.countries || null,
    countries_tags: product.countries_tags || [],
    stores: product.stores || null,
    source: "Open Food Facts",
    isLebanese: (product.countries_tags || [])
      .includes("en:lebanon")
  };
}

const FIELDS = [
  "code",
  "product_name",
  "brands",
  "quantity",
  "categories",
  "categories_tags",
  "image_url",
  "ingredients_text",
  "countries",
  "countries_tags",
  "stores"
].join(",");

// =====================================
// FETCH WITH CONTROLLED RETRY
// =====================================

async function fetchJSON(url, isSearch = false) {
  if (isSearch && Date.now() < unavailableUntil) {
    throw new Error(
      "Open Food Facts is temporarily unavailable. Try again later."
    );
  }

  const maxAttempts = isSearch ? 2 : 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let response;

    try {
      response = await fetch(url, {
        headers: HEADERS,
        signal: AbortSignal.timeout(15000)
      });
    } catch (error) {
      if (attempt < maxAttempts - 1) {
        await sleep(1500);
        continue;
      }

      throw new Error(
        "Could not connect to Open Food Facts."
      );
    }

    if (response.ok) {
      try {
        return await response.json();
      } catch (error) {
        throw new Error(
          "Open Food Facts returned an invalid response."
        );
      }
    }

    if (response.status === 429 || response.status === 503) {
      if (attempt < maxAttempts - 1) {
        await sleep(retryAfterMs(response));
        continue;
      }

      if (isSearch) {
        unavailableUntil =
          Date.now() + Math.max(COOLDOWN_DURATION, retryAfterMs(response));
      }

      throw new Error(
        `Open Food Facts HTTP ${response.status}: service temporarily unavailable`
      );
    }

    throw new Error(
      `Open Food Facts HTTP ${response.status}`
    );
  }
}

// =====================================
// GET PRODUCT BY BARCODE
// =====================================

async function getProductByBarcode(barcode) {
  if (!/^[0-9]{8,14}$/.test(String(barcode || ""))) {
    throw new Error("Invalid barcode");
  }

  const url =
    `${BASE_URL}/api/v2/product/${encodeURIComponent(barcode)}.json` +
    `?fields=${encodeURIComponent(FIELDS)}`;

  const data = await fetchJSON(url);

  if (data.status !== 1 || !data.product) {
    return null;
  }

  return formatProduct(data.product);
}

// =====================================
// SEARCH PRODUCTS BY NAME
// =====================================

// Ask Open Food Facts for one page of results.
async function requestSearchPage(queryText) {
  const params = new URLSearchParams({
    search_terms: queryText,
    search_simple: "1",
    action: "process",
    json: "1",
    fields: FIELDS,
    page: "1",
    page_size: "50"
  });

  const url =
    `${BASE_URL}/cgi/search.pl?${params.toString()}`;

  const data = await fetchJSON(url, true);

  return Array.isArray(data.products) ? data.products : [];
}

// Score one provider product against the search words.
// Searches name, brand and categories, so "coffee" finds
// "Nescafe" through its category even if the name lacks it.
function scoreProduct(product, words, normalizedTerm) {
  const name = normalize(product.product_name);
  const brand = normalize(product.brands);
  const categories = normalize(
    `${product.categories || ""} ${(product.categories_tags || []).join(" ")}`
  );

  const haystack = `${name} ${brand} ${categories}`;

  const matched = words.filter(word =>
    wordMatches(haystack, word)
  ).length;

  const exactName = name === normalizedTerm;
  const brandMatch = words.some(word => wordMatches(brand, word));

  return {
    matched,
    exactName,
    brandMatch
  };
}

// Turn raw provider products into ranked, unique results.
function rankResults(rawProducts, words, normalizedTerm) {
  const seen = new Set();

  return rawProducts
    .filter(product =>
      product.code &&
      (product.product_name || product.generic_name)
    )
    .map(product => {
      const named = {
        ...product,
        product_name:
          product.product_name || product.generic_name
      };

      const formatted = formatProduct(named);
      const score = scoreProduct(named, words, normalizedTerm);

      return {
        ...formatted,
        relevance: score.matched,
        allWords: score.matched === words.length,
        exactName: score.exactName,
        brandMatch: score.brandMatch
      };
    })
    // Keep anything matching at least one word; the provider
    // already searched for the term, so zero-match rows are noise.
    .filter(product => product.relevance > 0)
    .sort((a, b) => {
      if (a.allWords !== b.allWords) {
        return Number(b.allWords) - Number(a.allWords);
      }

      if (a.relevance !== b.relevance) {
        return b.relevance - a.relevance;
      }

      if (a.isLebanese !== b.isLebanese) {
        return Number(b.isLebanese) - Number(a.isLebanese);
      }

      if (a.exactName !== b.exactName) {
        return Number(b.exactName) - Number(a.exactName);
      }

      return a.name.localeCompare(b.name);
    })
    .filter(product => {
      // One entry per barcode.
      if (seen.has(product.barcode)) return false;

      seen.add(product.barcode);
      return true;
    })
    .slice(0, RESULT_LIMIT)
    .map(({ allWords, brandMatch, ...product }) => product);
}

async function performSearch(searchTerm) {
  const words = tokenize(searchTerm);
  const normalizedTerm = normalize(searchTerm);

  if (words.length === 0) {
    return [];
  }

  // Primary query: the full term.
  const primary = await requestSearchPage(searchTerm);
  let results = rankResults(primary, words, normalizedTerm);

  // Fallback: when the full term gives nothing useful, search
  // with the most specific single word instead.
  if (results.length === 0) {
    const fallbackWord = [...words].sort(
      (a, b) => b.length - a.length
    )[0];

    if (fallbackWord && fallbackWord !== normalizedTerm) {
      const fallback = await requestSearchPage(fallbackWord);
      results = rankResults(fallback, words, normalizedTerm);
    }
  }

  return results;
}

// =====================================
// CACHED SEARCH
// =====================================

async function searchProducts(searchTerm) {
  const term = String(searchTerm || "").trim();

  if (!term) {
    return [];
  }

  if (term.length > 100) {
    throw new Error("Search term is too long");
  }

  const key = normalize(term);
  const cached = searchCache.get(key);

  if (cached && Date.now() < cached.expiresAt) {
    console.log("Food cache hit:", term);
    return cached.products;
  }

  if (pendingSearches.has(key)) {
    return pendingSearches.get(key);
  }

  const promise = performSearch(term)
    .then(products => {
      searchCache.set(key, {
        products,
        expiresAt: Date.now() + CACHE_DURATION
      });

      console.log(
        `Food search completed: ${term} (${products.length} results)`
      );

      return products;
    })
    .finally(() => {
      pendingSearches.delete(key);
    });

  pendingSearches.set(key, promise);

  return promise;
}

module.exports = {
  getProductByBarcode,
  searchProducts
};
