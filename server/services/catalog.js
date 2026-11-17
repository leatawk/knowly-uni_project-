
// =====================================================
// KNOWLY CATALOG
//
// One place that the API routes call for:
//   search()            every category, one product format
//   resolve()           save a product + load its store prices
//   compare()           side-by-side data with verified prices
//   addVerifiedOffer()  manually verified retailer listing
//
// The provider files (lebtech, openFoodFacts,
// openBeautyFacts, automotive) are used as they are.
// =====================================================

const db = require("../db");
const Product = require("../models/Product");
const food = require("./openFoodFacts");
const beauty = require("./openBeautyFacts");
const electronics = require("./lebtech");
const automotive = require("./automotive");
const repository = require("./productRepository");
const tracker = require("./priceTracker");
const openPrices = require("./openPrices");
const store = require("./offerStore");
const N = require("./normalize");

const PROVIDER_TIMEOUT_MS = 20000;

// -------------------------------------
// Errors with a message the user can read
// -------------------------------------

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  error.expose = true;
  return error;
}

function friendly(error, subject) {
  if (electronics.isRateLimited(error)) {
    const seconds =
      error.retryAfter || electronics.rateLimitRemaining() || 60;

    return `Live ${subject} are paused for about ${seconds} seconds because too many requests were sent. Saved results are shown where available.`;
  }

  if (
    error?.name === "TimeoutError" ||
    /timed? ?out/i.test(error?.message || "")
  ) {
    return `Live ${subject} took too long to answer. Try again in a moment.`;
  }

  return `Live ${subject} are temporarily unavailable. Try again in a moment.`;
}

function withTimeout(promise, ms) {
  let timer;

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error("Provider timed out");
      error.name = "TimeoutError";
      reject(error);
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() =>
    clearTimeout(timer)
  );
}

// -------------------------------------
// Products seen in recent searches.
// resolve() reuses them, so opening a product does not
// trigger a second request to the provider.
// -------------------------------------

const recent = new Map();
const RECENT_MS = 30 * 60 * 1000;
const RECENT_MAX = 600;

function remember(key, raw) {
  if (!key) return;

  if (recent.size >= RECENT_MAX) {
    recent.delete(recent.keys().next().value);
  }

  recent.set(key, {
    raw,
    expiresAt: Date.now() + RECENT_MS
  });
}

function recall(key) {
  const entry = recent.get(key);

  return entry && Date.now() < entry.expiresAt
    ? entry.raw
    : null;
}

// -------------------------------------
// Saved products (PostgreSQL)
// -------------------------------------

async function hydrate(rows) {
  const offers = await store.readOffersForProducts(
    rows.map(row => row.id)
  );

  return rows.map(row => {
    const list = offers.get(String(row.id)) || [];
    const summary = store.summarize(list);

    return {
      product: N.fromSaved(row, summary),
      offers: list,
      summary
    };
  });
}

async function loadSaved(productId) {
  const rows = await Product.findSavedById(productId);

  if (!rows.length) return null;

  return (await hydrate(rows))[0];
}

async function listSaved(category, term, limit = 24) {
  const rows = await Product.findSavedList({
    term,
    category,
    limit
  });

  return (await hydrate(rows))
    .map(entry => entry.product)
    .filter(product => product.category);
}

// Saved products by id, with their lowest verified price
// (used by the Saved page).
async function productsByIds(ids) {
  const clean = [...new Set(ids.map(String))].filter(id =>
    /^[1-9][0-9]{0,18}$/.test(id)
  );

  if (!clean.length) return [];

  const rows = await Product.findSavedByIds(clean);

  return (await hydrate(rows))
    .map(entry => entry.product);
}

// Links live search results to rows already saved in
// PostgreSQL, so known verified prices appear on the cards.
async function attachSaved(products) {
  const barcodes = products
    .filter(p => p.barcode && !p.id)
    .map(p => p.barcode);

  const externalIds = products
    .filter(p => p.externalId && !p.barcode && !p.id)
    .map(p => p.externalId);

  if (!barcodes.length && !externalIds.length) {
    return products;
  }

  const result = await db.pool.query(
    `
    SELECT id, barcode, external_id, source_name
    FROM public.products
    WHERE barcode = ANY($1::text[])
       OR (
         external_id = ANY($2::text[])
         AND source_name IN ('LebTech', 'Speero')
       )
    ORDER BY id
    `,
    [barcodes, externalIds]
  );

  if (!result.rows.length) return products;

  const byBarcode = new Map();
  const byExternal = new Map();

  for (const row of result.rows) {
    if (row.barcode && !byBarcode.has(row.barcode)) {
      byBarcode.set(row.barcode, row.id);
    }

    if (row.external_id && row.source_name !== null) {
      const key = `${row.source_name}:${row.external_id}`;

      if (!byExternal.has(key)) {
        byExternal.set(key, row.id);
      }
    }
  }

  const offers = await store.readOffersForProducts(
    result.rows.map(row => row.id)
  );

  for (const product of products) {
    if (product.id) continue;

    const id = product.barcode
      ? byBarcode.get(product.barcode)
      : byExternal.get(
          `${product.origin === "automotive" ? "Speero" : "LebTech"}:${product.externalId}`
        );

    if (!id) continue;

    product.id = String(id);

    // Live results keep their live price; products without
    // one show the lowest saved verified offer.
    if (product.price === null) {
      N.applySummary(
        product,
        store.summarize(offers.get(String(id)) || [])
      );
    }
  }

  return products;
}

// -------------------------------------
// SEARCH
// -------------------------------------

const SEARCHERS = {
  electronics: {
    subject: "electronics prices",
    categories: ["electronics", "computers-accessories"],

    run: async (term, category) =>
      (await electronics.searchProducts(term)).map(raw => {
        const product = N.fromElectronics(raw, category);

        remember(product.key, raw);

        return product;
      })
  },

  groceries: {
    subject: "grocery results",
    categories: ["groceries-food"],

    run: async term =>
      (await food.searchProducts(term)).map(raw => {
        const product = N.fromFacts(raw, "groceries");

        remember(product.key, raw);

        return product;
      })
  },

  beauty: {
    subject: "beauty results",
    categories: ["beauty-personal-care"],

    run: async term =>
      (await beauty.searchProducts(term)).map(raw => {
        // The beauty service can answer with saved rows.
        if (raw.id && !raw.source) {
          return N.fromSaved({
            ...raw,
            category_slug: "beauty-personal-care"
          });
        }

        const product = N.fromFacts(raw, "beauty");

        remember(product.key, raw);

        return product;
      })
  },

  automotive: {
    subject: "automotive listings",
    categories: ["automotive"],

    run: async term =>
      (await automotive.searchProducts(term)).map(raw => {
        const product = N.fromAutomotive(raw);

        remember(product.key, raw);

        return product;
      })
  }
};

async function search(query, categorySlug) {
  const term = N.text(query, 100);

  const category = N.CATEGORIES[categorySlug]
    ? categorySlug
    : "";

  // No search term: show what Knowly already tracks.
  if (!term) {
    return {
      query: "",
      category,
      products: await listSaved(category, "", 24),
      notices: []
    };
  }

  if (term.length < 2) {
    throw fail(
      400,
      "Enter at least 2 characters to search."
    );
  }

  const origins = category
    ? [N.ORIGIN_BY_CATEGORY[category]]
    : Object.keys(SEARCHERS);

  const settled = await Promise.allSettled(
    origins.map(origin =>
      withTimeout(
        SEARCHERS[origin].run(term, category),
        PROVIDER_TIMEOUT_MS
      )
    )
  );

  let products = [];
  const notices = [];

  for (const [index, outcome] of settled.entries()) {
    const searcher = SEARCHERS[origins[index]];

    if (outcome.status === "fulfilled") {
      products.push(...outcome.value);
      continue;
    }

    console.warn(
      `Knowly search (${origins[index]}) failed:`,
      outcome.reason?.message
    );

    notices.push(
      friendly(outcome.reason, searcher.subject)
    );

    // Fall back to matching products saved earlier.
    for (
      const slug of category
        ? [category]
        : searcher.categories
    ) {
      try {
        products.push(
          ...await listSaved(slug, term, 12)
        );
      } catch (error) {
        console.warn(
          "Saved-product fallback failed:",
          error.message
        );
      }
    }
  }

  // One entry per product.
  const seen = new Set();

  products = products.filter(product => {
    if (seen.has(product.key)) return false;

    seen.add(product.key);

    return true;
  });

  try {
    await attachSaved(products);
  } catch (error) {
    console.warn(
      "Could not attach saved offers:",
      error.message
    );
  }

  // Keep provider relevance, grouped in category order.
  products.sort((a, b) =>
    N.CATEGORY_ORDER.indexOf(a.category) -
    N.CATEGORY_ORDER.indexOf(b.category)
  );

  return {
    query: term,
    category,
    products,
    notices
  };
}

// -------------------------------------
// Where a grocery or beauty price can be checked
// (verified Lebanese retailers that publish prices online)
// -------------------------------------

const RETAILERS = [
  {
    name: "Carrefour Lebanon",
    website: "https://www.carrefourlebanon.com/maflbn/en/",
    domain: "carrefourlebanon.com"
  },
  {
    name: "Spinneys Lebanon",
    website: "https://www.spinneyslebanon.com/",
    domain: "spinneyslebanon.com"
  }
];

function storeLinks(product) {
  if (
    !["groceries", "beauty"].includes(product.origin)
  ) {
    return [];
  }

  const words = [
    product.brand,
    product.name,
    product.quantity
  ]
    .filter(Boolean)
    .join(" ");

  return RETAILERS.map(retailer => ({
    name: retailer.name,
    website: retailer.website,

    // Opens a web search limited to the retailer's own site.
    findUrl:
      "https://www.google.com/search?q=" +
      encodeURIComponent(
        `site:${retailer.domain} ${words}`
      )
  }));
}

async function retailers() {
  const result = await db.pool.query(
    `
    SELECT name
    FROM public.stores
    WHERE country = 'Lebanon'
    ORDER BY name
    LIMIT 300
    `
  );

  return [
    ...new Set([
      ...RETAILERS.map(retailer => retailer.name),
      ...result.rows.map(row => row.name)
    ])
  ];
}

// -------------------------------------
// Save shopper-reported Lebanese prices of a barcode
// -------------------------------------

async function syncShopperPrices(productId, barcode) {
  const observations =
    await openPrices.getLebanesePrices(barcode);

  if (!observations.length) return 0;

  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
      SELECT pg_advisory_xact_lock(
        hashtext('knowly-offers'),
        hashtext($1)
      )
      `,
      [String(productId)]
    );

    const sourceId = await store.ensureSource(
      client,
      "Open Prices",
      "REST API",
      "Shopper-reported shelf prices (Open Food Facts, ODbL)",
      "https://prices.openfoodfacts.org/api/v1"
    );

    for (const item of observations) {
      const storeId = await store.ensureStore(
        client,
        item.storeName,
        item.website,
        "Lebanon"
      );

      const existing = await client.query(
        `
        SELECT
          id,
          price,
          currency,
          last_checked_at
        FROM public.offers
        WHERE product_id = $1
          AND store_id = $2
          AND data_source_id = $3
        ORDER BY id
        LIMIT 1
        FOR UPDATE
        `,
        [productId, storeId, sourceId]
      );

      const row = existing.rows[0] || null;

      // Never replace a newer observation with an older one.
      if (
        row?.last_checked_at &&
        new Date(row.last_checked_at) >=
          new Date(item.date)
      ) {
        continue;
      }

      await store.saveOffer(client, row, {
        productId,
        storeId,
        sourceId,
        price: item.price,
        currency: item.currency,
        condition: "New",
        availability: "Unknown",
        url: item.recordUrl,
        checkedAt: item.date,
        recordedAt: item.date
      });
    }

    await client.query("COMMIT");

  } catch (error) {
    await client.query("ROLLBACK");
    throw error;

  } finally {
    client.release();
  }

  return observations.length;
}

// -------------------------------------
// Save an automotive part and its listed price
// -------------------------------------

async function saveAutomotive(raw) {
  const product = N.fromAutomotive(raw);

  if (!product.externalId) {
    throw fail(
      400,
      "This part has no part number and cannot be saved."
    );
  }

  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
      SELECT pg_advisory_xact_lock(
        hashtext('knowly-auto'),
        hashtext($1)
      )
      `,
      [product.externalId]
    );

    const category = await client.query(
      `
      SELECT id
      FROM public.categories
      WHERE slug = 'automotive'
      LIMIT 1
      `
    );

    if (!category.rows.length) {
      throw new Error(
        "Automotive category is missing from PostgreSQL"
      );
    }

    const sourceId = await store.ensureSource(
      client,
      "Speero",
      "REST API",
      "Automotive parts and Saudi Arabian product data",
      "https://speero.net"
    );

    const brandId = await store.ensureBrand(
      client,
      product.brand
    );

    const specifications = JSON.stringify({
      ...product.specifications,
      market: "Saudi Arabia"
    });

    const existing = await client.query(
      `
      SELECT id
      FROM public.products
      WHERE source_name = 'Speero'
        AND external_id = $1
      ORDER BY id
      LIMIT 1
      FOR UPDATE
      `,
      [product.externalId]
    );

    let productId;

    if (existing.rows.length) {
      productId = existing.rows[0].id;

      await client.query(
        `
        UPDATE public.products
        SET
          name = $2,
          brand_id = COALESCE($3, brand_id),
          image_url = COALESCE($4, image_url),
          product_url = COALESCE($5, product_url),
          specifications = $6::jsonb,
          updated_at = NOW()
        WHERE id = $1
        `,
        [
          productId,
          product.name,
          brandId,
          product.image,
          product.productUrl,
          specifications
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
          'external', 'Speero', $6, $7
        )
        RETURNING id
        `,
        [
          product.name,
          brandId,
          category.rows[0].id,
          product.image,
          specifications,
          product.externalId,
          product.productUrl
        ]
      );

      productId = inserted.rows[0].id;
    }

    if (product.price !== null) {
      const storeId = await store.ensureStore(
        client,
        "Speero",
        "https://speero.net",
        "Saudi Arabia"
      );

      const offer = await client.query(
        `
        SELECT id, price, currency
        FROM public.offers
        WHERE product_id = $1
          AND store_id = $2
          AND data_source_id = $3
        ORDER BY id
        LIMIT 1
        FOR UPDATE
        `,
        [productId, storeId, sourceId]
      );

      await store.saveOffer(
        client,
        offer.rows[0] || null,
        {
          productId,
          storeId,
          sourceId,
          price: product.price,
          currency: "SAR",
          condition: "New",
          availability: "Unknown",
          url: product.productUrl,
          checkedAt: new Date().toISOString()
        }
      );
    }

    await client.query("COMMIT");

    return productId;

  } catch (error) {
    await client.query("ROLLBACK");
    throw error;

  } finally {
    client.release();
  }
}

// -------------------------------------
// RESOLVE: save the product, return it with store prices
// -------------------------------------

function fromReference(ref) {
  const raw = {
    externalId: ref.externalId,
    oem: ref.externalId,
    barcode: ref.barcode,
    name: ref.name,
    brand: ref.brand,
    image: ref.image,
    productUrl: ref.productUrl,
    quantity: ref.quantity,
    minPrice: ref.price,
    price: ref.price,
    shopCount: ref.storeCount
  };

  if (ref.origin === "electronics") {
    return N.fromElectronics(raw, ref.category);
  }

  if (ref.origin === "automotive") {
    return N.fromAutomotive(raw);
  }

  return N.fromFacts(
    raw,
    ref.origin === "beauty" ? "beauty" : "groceries"
  );
}

async function findSavedId(column, value, sourceName) {
  const result = await db.pool.query(
    `
    SELECT id
    FROM public.products
    WHERE ${
      column === "barcode"
        ? "barcode"
        : "external_id"
    } = $1
      AND ($2::text IS NULL OR source_name = $2)
    ORDER BY id
    LIMIT 1
    `,
    [value, sourceName || null]
  );

  return result.rows[0]?.id || null;
}

async function resolveElectronics(ref, out) {
  const raw = recall(ref.key) || {
    externalId: ref.externalId,
    name: ref.name,
    brand: ref.brand,
    image: ref.image,
    productUrl: ref.productUrl
  };

  const category =
    ref.category === "computers-accessories"
      ? "computers-accessories"
      : "electronics";

  const tracked = await tracker.trackProduct(
    {
      externalId: N.text(raw.externalId, 100),
      name: N.text(raw.name, 500),
      brand: N.text(raw.brand, 255),
      category: N.text(raw.category, 100),
      image: raw.image,
      productUrl: raw.productUrl
    },
    category
  );

  out.stats = tracked.stats;
  out.notice = tracked.warning || "";
  out.live = !tracked.fromSavedData;

  out.liveIds = new Set(
    tracked.offers
      .filter(offer => offer.live)
      .map(offer => offer.id)
  );

  return tracked.productId;
}

// =====================================
// UPDATED GROCERY AND BEAUTY RESOLUTION
// =====================================

async function resolveFacts(ref, out) {
  const origin =
    ref.origin === "beauty"
      ? "beauty"
      : "groceries";

  const service =
    origin === "beauty"
      ? beauty
      : food;

  const slug =
    origin === "beauty"
      ? "beauty-personal-care"
      : "groceries-food";

  const barcode = N.text(ref.barcode, 20);

  if (!/^[0-9]{8,14}$/.test(barcode)) {
    throw fail(
      400,
      "This product has no valid barcode, so store prices cannot be matched to it."
    );
  }

  let raw = recall(ref.key);

  // A saved database row is not an external product response.
  if (raw && raw.id && !raw.source) {
    raw = null;
  }

  let productId = null;

  try {
    if (!raw) {
      raw = await service.getProductByBarcode(barcode);
    }

    if (raw) {
      productId = (
        await repository.saveExternalProduct(raw, slug)
      ).id;
    }

  } catch (error) {
    console.warn(
      "Could not refresh product details:",
      error.message
    );
  }

  // If the external product service is unavailable,
  // use a product that Knowly saved previously.
  if (!productId) {
    productId = await findSavedId(
      "barcode",
      barcode
    );
  }

  if (!productId) {
    throw fail(
      503,
      "Product details are temporarily unavailable. Try again in a moment."
    );
  }

  // Check for exact-barcode shopper-reported prices in Lebanon.
  // A zero result is different from a provider failure.
  try {
    const count = await syncShopperPrices(
      productId,
      barcode
    );

    if (count === 0) {
      out.notice =
        `No shopper-reported Lebanese prices were found for this exact product barcode (${barcode}).`;
    } else {
      out.notice =
        `${count} Lebanese shopper-reported price records were checked for this product.`;
    }

  } catch (error) {
    console.warn(
      "Shopper-reported prices unavailable:",
      error.message
    );

    out.notice =
      "Product information loaded, but Lebanese shopper-reported prices could not be checked right now. Previously saved offers, if any, are still available.";
  }

  return productId;
}

// -------------------------------------
// AUTOMOTIVE RESOLUTION
// -------------------------------------

async function resolveAutomotive(ref, out) {
  const reference = N.text(ref.externalId, 100);

  let raw = recall(ref.key);

  if (!raw && reference) {
    try {
      raw = await automotive.getPartByOEM(reference);

    } catch (error) {
      console.warn(
        "Automotive details unavailable:",
        error.message
      );
    }
  }

  if (raw) {
    out.live = true;
    return saveAutomotive(raw);
  }

  const savedId = reference
    ? await findSavedId(
        "external_id",
        reference,
        "Speero"
      )
    : null;

  if (!savedId) {
    throw fail(
      503,
      "This part's details are temporarily unavailable. Try again in a moment."
    );
  }

  out.notice =
    "The live listing is unavailable. Showing the price saved earlier, which may be outdated.";

  return savedId;
}

// -------------------------------------
// RESOLVE PRODUCT
// -------------------------------------

async function resolve(input) {
  const ref =
    input && typeof input === "object"
      ? input
      : {};

  const out = {
    stats: null,
    notice: "",
    live: false,
    liveIds: null
  };

  let productId = null;

  if (
    ref.origin === "electronics" &&
    ref.externalId
  ) {
    productId = await resolveElectronics(ref, out);

  } else if (
    (
      ref.origin === "groceries" ||
      ref.origin === "beauty"
    ) &&
    ref.barcode
  ) {
    productId = await resolveFacts(ref, out);

  } else if (
    ref.origin === "automotive" &&
    ref.externalId
  ) {
    productId = await resolveAutomotive(ref, out);

  } else if (
    /^[1-9][0-9]*$/.test(String(ref.id || ""))
  ) {
    productId = ref.id;

  } else {
    throw fail(400, "Unknown product reference.");
  }

  // Nothing saved yet (for example: first view of a
  // product while live prices are rate limited).
  if (!productId) {
    const product = fromReference(ref);

    return {
      product,
      offers: [],
      summary: store.summarize([]),
      history: [],
      stats: null,
      notice: out.notice,
      live: false,
      storeLinks: storeLinks(product)
    };
  }

  const saved = await loadSaved(productId);

  if (!saved) {
    throw fail(404, "Product not found.");
  }

  const offers = out.liveIds
    ? await store.readOffers(productId, out.liveIds)
    : saved.offers.map(offer => ({
        ...offer,
        live: out.live
      }));

  return {
    product: saved.product,
    offers,
    summary: store.summarize(offers),
    history: await tracker.getProductHistory(productId),
    stats: out.stats,
    notice: out.notice,
    live: out.live,
    storeLinks: storeLinks(saved.product)
  };
}

// -------------------------------------
// COMPARE 2-5 PRODUCTS
// -------------------------------------

// -------------------------------------
// COMPARISON RANKING
//
// A "lowest price" is named only when every product has a
// verified price in the SAME currency and the SAME market.
//
// summarize() reports best = null when a product has prices in
// more than one currency, so best cannot be used to decide
// whether a product is priced at all. Rank on the currency that
// every product shares instead.
// -------------------------------------

// Preferred order when products share more than one currency.
const CURRENCY_RANK = ["USD", "LBP", "EUR", "SAR", "AED"];

function rankComparison(results) {
  const priceMaps = results.map(product =>
    new Map(
      (product.lowestByCurrency || []).map(
        offer => [offer.currency, offer]
      )
    )
  );

  const currencies = new Set(
    priceMaps.flatMap(map => [...map.keys()])
  );

  const markets = new Set(
    results.flatMap(product => [
      ...(product.lowestByCurrency || []).map(
        offer => offer.market
      ),
      product.market
    ])
  );

  // Currencies in which every product has a verified price.
  const shared = priceMaps.length
    ? [...priceMaps[0].keys()].filter(currency =>
        priceMaps.every(map => map.has(currency))
      )
    : [];

  // Deterministic choice when several currencies are shared.
  shared.sort((a, b) => {
    const rank = code => {
      const index = CURRENCY_RANK.indexOf(code);
      return index === -1 ? CURRENCY_RANK.length : index;
    };

    return rank(a) - rank(b) || a.localeCompare(b);
  });

  const rankCurrency = shared[0] || null;

  const rankOffers = rankCurrency
    ? results.map((product, index) => {
        const offer = priceMaps[index].get(rankCurrency);

        return {
          key: product.key,
          price: offer.price,
          market: offer.market || product.market || ""
        };
      })
    : [];

  // Lebanese and Saudi prices are not comparable.
  const rankMarkets = new Set(
    rankOffers.map(entry => entry.market).filter(Boolean)
  );

  const rankable =
    rankOffers.length > 0 &&
    rankOffers.length === results.length &&
    rankMarkets.size <= 1;

  let lowestKey = null;

  if (rankable) {
    const lowestPrice = Math.min(
      ...rankOffers.map(entry => entry.price)
    );

    const winners = rankOffers.filter(
      entry => entry.price === lowestPrice
    );

    // A tie names no winner.
    if (winners.length === 1) {
      lowestKey = winners[0].key;
    }
  }

  // Different package sizes are not equivalent products, even
  // when both prices are in the same currency.
  const sizes = new Set(
    results.map(product =>
      String(product.quantity || "")
        .toLowerCase()
        .replace(/\s+/g, "")
    )
  );

  return {
    rankable,
    lowestKey,
    rankCurrency,
    sizeMismatch: sizes.size > 1,
    currencies: [...currencies].filter(Boolean),
    markets: [...markets].filter(Boolean)
  };
}

async function compare(items) {
  if (
    !Array.isArray(items) ||
    items.length < 2 ||
    items.length > 5
  ) {
    throw fail(
      400,
      "Select 2-5 different, valid products"
    );
  }

  const results = [];

  // One after another: keeps live price requests gentle.
  for (const item of items) {
    try {
      const detail = await resolve(item);

      results.push({
        ...detail.product,
        offers: detail.offers,
        best: detail.summary.best,
        lowestByCurrency: detail.summary.lowestByCurrency,
        offerCount: detail.summary.offerCount,
        storeCount: detail.summary.storeCount,
        notice: detail.notice
      });

    } catch (error) {
      if (error.status === 404) {
        throw fail(
          404,
          "One or more selected products are missing"
        );
      }

      console.warn(
        "Compare: product unavailable:",
        error.message
      );

      const product = fromReference(item || {});

      results.push({
        ...product,
        price: null,
        currency: null,
        store: null,
        offers: [],
        best: null,
        lowestByCurrency: [],
        offerCount: 0,
        storeCount: 0,
        notice: error.expose
          ? error.message
          : "Store prices for this product are temporarily unavailable."
      });
    }
  }

  const ranking = rankComparison(results);

  return {
    products: results,
    ...ranking
  };
}

// -------------------------------------
// MANUALLY VERIFIED RETAILER OFFER
//
// For retailers with no data feed. The listing URL is
// required, so anyone can check where the price came from.
// -------------------------------------

const {
  CURRENCIES,
  AVAILABILITY,
  CONDITIONS,
  validateOffer
} = require("../validators");

async function addVerifiedOffer(productId, body) {
  if (!/^[1-9][0-9]*$/.test(String(productId))) {
    throw fail(400, "Invalid product ID");
  }

  // Every field rule lives in validators/offer.validator.js.
  const {
    storeName,
    price,
    currency,
    url,
    availability,
    condition,
    checked
  } = validateOffer(body);

  const client = await db.pool.connect();

  let status;

  try {
    await client.query("BEGIN");

    await client.query(
      `
      SELECT pg_advisory_xact_lock(
        hashtext('knowly-offers'),
        hashtext($1)
      )
      `,
      [String(productId)]
    );

    const product = await client.query(
      `
      SELECT id
      FROM public.products
      WHERE id = $1
      `,
      [productId]
    );

    if (!product.rows.length) {
      throw fail(404, "Product not found.");
    }

    const sourceId = await store.ensureSource(
      client,
      "Knowly verified listing",
      "Manual",
      "Retailer listings checked by the Knowly team, with a link to the listing",
      null
    );

    const storeId = await store.ensureStore(
      client,
      storeName,
      new URL(url).origin,
      "Lebanon"
    );

    const existing = await client.query(
      `
      SELECT id, price, currency
      FROM public.offers
      WHERE product_id = $1
        AND store_id = $2
        AND data_source_id = $3
        AND COALESCE("condition", 'New') = $4
      ORDER BY id
      LIMIT 1
      FOR UPDATE
      `,
      [
        productId,
        storeId,
        sourceId,
        condition
      ]
    );

    const saved = await store.saveOffer(
      client,
      existing.rows[0] || null,
      {
        productId,
        storeId,
        sourceId,
        price,
        currency,
        condition,
        availability,
        url,
        checkedAt: new Date(checked).toISOString()
      }
    );

    status = saved.status;

    await client.query("COMMIT");

  } catch (error) {
    await client.query("ROLLBACK");
    throw error;

  } finally {
    client.release();
  }

  const detail = await resolve({
    id: String(productId)
  });

  return {
    ...detail,
    saved: status
  };
}

// -------------------------------------
// EXPORTS
// -------------------------------------

module.exports = {
  search,
  resolve,
  compare,
  rankComparison,
  addVerifiedOffer,
  retailers,
  productsByIds,
  CURRENCIES
};
