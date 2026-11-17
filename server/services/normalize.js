// =====================================================
// KNOWLY - ONE PRODUCT FORMAT FOR EVERY DATA SOURCE
//
// Every provider (electronics, groceries, beauty,
// automotive, saved PostgreSQL rows) is converted here
// into the same shape, so the frontend never has to know
// where a product came from.
//
//   id, key, origin, name, brand, image, category,
//   categoryName, price, currency, market, store,
//   storeCount, productUrl, availability, specifications,
//   barcode, externalId, quantity, lastChecked, priceSource
// =====================================================

const CATEGORIES = {
  "electronics": "Electronics",
  "computers-accessories": "Computers & Accessories",
  "groceries-food": "Groceries & Food",
  "beauty-personal-care": "Beauty & Personal Care",
  "automotive": "Automotive"
};

const CATEGORY_ORDER = Object.keys(CATEGORIES);

const ORIGIN_BY_CATEGORY = {
  "electronics": "electronics",
  "computers-accessories": "electronics",
  "groceries-food": "groceries",
  "beauty-personal-care": "beauty",
  "automotive": "automotive"
};

const MARKET_BY_ORIGIN = {
  electronics: "Lebanon",
  groceries: "Lebanon",
  beauty: "Lebanon",
  automotive: "Saudi Arabia"
};

// -------------------------------------
// Small helpers
//
// The pure ones live in utils/sanitize.js and are
// re-exported below, so every existing import of
// normalize.text, normalize.safeURL and so on keeps working.
// -------------------------------------

const {
  text,
  toNumber,
  safeURL,
  canonicalURL
} = require("../utils/sanitize");

function firstBrand(value) {
  return text(String(value || "").split(",")[0], 255) || null;
}

// -------------------------------------
// Brand recovery
//
// Some providers (LebTech) send no brand field, but the product
// name begins with it: "Apple iPhone 17 Pro Max". Only a name
// STARTING with a known brand is matched, and only for
// electronics, so a grocery item called "Apple Juice" never
// gains the brand "Apple". Nothing is guessed beyond this list.
// -------------------------------------

const KNOWN_BRANDS = [
  "Acer", "Amazfit", "Anker", "Apple", "Asus", "Baseus",
  "Beats", "Belkin", "Bose", "Canon", "Corsair", "Dell",
  "Fitbit", "Garmin", "Google", "Hisense", "Honor", "HP",
  "Huawei", "Infinix", "JBL", "Kingston", "Lenovo", "LG",
  "Logitech", "Microsoft", "MSI", "Nikon", "Nintendo",
  "Nokia", "Nothing", "OnePlus", "Oppo", "Panasonic",
  "Philips", "PlayStation", "Razer", "Realme", "Redmi",
  "Samsung", "SanDisk", "Seagate", "Sony", "TCL", "Tecno",
  "Toshiba", "Ugreen", "Vivo", "Western Digital", "Xbox",
  "Xiaomi"
];

// Longest first, so "Western Digital" wins over a shorter match.
const BRAND_MATCHERS = [...KNOWN_BRANDS]
  .sort((a, b) => b.length - a.length)
  .map(brand => ({
    brand,
    pattern: new RegExp(
      `^${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "i"
    )
  }));

function brandFromName(name) {
  const value = text(name, 255);

  if (!value) return null;

  const hit = BRAND_MATCHERS.find(
    entry => entry.pattern.test(value)
  );

  return hit ? hit.brand : null;
}

function mainCategory(slug, parentSlug) {
  if (CATEGORIES[parentSlug]) return parentSlug;
  if (CATEGORIES[slug]) return slug;
  return null;
}

function parseSpecs(value) {
  if (!value) return {};

  if (typeof value === "string") {
    try {
      return parseSpecs(JSON.parse(value));
    } catch {
      return {};
    }
  }

  return typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function label(key) {
  const words = String(key)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();

  return words.charAt(0).toUpperCase() + words.slice(1);
}

// Keeps only short, readable values (no nested objects).
function cleanSpecs(source, rename = {}) {
  const result = {};

  for (const [key, raw] of Object.entries(parseSpecs(source))) {
    let value = raw;

    if (Array.isArray(value)) {
      value = value
        .filter(item => ["string", "number"].includes(typeof item))
        .join(", ");
    }

    if (typeof value === "boolean") value = value ? "Yes" : "No";
    if (typeof value === "object") continue;

    value = text(value, 300);
    if (!value) continue;

    const name = rename[key] === undefined ? label(key) : rename[key];
    if (!name) continue;

    result[name] = value;
  }

  return result;
}

// "en:spreads, en:hazelnut-spreads" -> "Hazelnut spreads"
function lastCategory(value) {
  const parts = String(value || "")
    .split(",")
    .map(part => part.replace(/^[a-z]{2}:/i, "").replace(/-/g, " ").trim())
    .filter(Boolean);

  const last = parts[parts.length - 1] || "";
  return last ? last.charAt(0).toUpperCase() + last.slice(1) : "";
}

// Electronics results cover two Knowly categories.
function electronicsCategory(raw, preferred) {
  if (
    preferred === "electronics" ||
    preferred === "computers-accessories"
  ) {
    return preferred;
  }

  const haystack =
    `${raw.category || ""} ${raw.name || ""}`.toLowerCase();

  return /(laptop|notebook|macbook|monitor|desktop|\bpc\b|keyboard|mouse|printer|router|network|\bssd\b|\bhdd\b|storage|motherboard|processor|\bcpu\b|\bgpu\b|graphics card|\bram\b|webcam|computer)/
    .test(haystack)
    ? "computers-accessories"
    : "electronics";
}

function base(origin, category) {
  return {
    id: null,
    key: null,
    origin,
    name: "Unnamed product",
    brand: null,
    image: null,
    category,
    categoryName: CATEGORIES[category] || null,
    price: null,
    currency: null,
    // Set only when a product has verified prices in more
    // than one currency (they are never ranked together).
    prices: [],
    market: MARKET_BY_ORIGIN[origin] || null,
    store: null,
    storeCount: null,
    productUrl: null,
    availability: null,
    specifications: {},
    barcode: null,
    externalId: null,
    quantity: null,
    lastChecked: null,
    priceSource: null
  };
}

// -------------------------------------
// Provider -> Knowly product
// -------------------------------------

function fromElectronics(raw, preferredCategory) {
  const category = electronicsCategory(raw, preferredCategory);
  const product = base("electronics", category);
  const price = toNumber(raw.minPrice);

  product.externalId = text(raw.externalId, 255) || null;
  product.key = `el:${product.externalId || text(raw.name, 80)}`;
  product.name = text(raw.name) || product.name;
  product.brand =
    firstBrand(raw.brand) || brandFromName(product.name);
  product.image = safeURL(raw.image);
  product.productUrl = safeURL(raw.productUrl);
  product.price = price;
  product.currency = price === null ? null : "USD";
  product.storeCount = toNumber(raw.shopCount);
  product.priceSource = price === null ? null : "live";
  product.specifications = cleanSpecs({
    ...parseSpecs(raw.specifications),
    type: raw.category
  });

  return product;
}

function fromFacts(raw, origin) {
  const category = origin === "beauty"
    ? "beauty-personal-care"
    : "groceries-food";

  const product = base(origin, category);

  product.barcode = text(raw.barcode, 100) || null;
  product.externalId = product.barcode;
  product.key =
    `${origin === "beauty" ? "be" : "gr"}:${product.barcode || text(raw.name, 80)}`;
  product.name = text(raw.name) || product.name;
  product.brand = firstBrand(raw.brand);
  product.image = safeURL(raw.image);
  product.quantity = text(raw.quantity, 100) || null;
  product.specifications = cleanSpecs({
    quantity: raw.quantity,
    type: lastCategory(raw.category),
    "Sold in": raw.countries,
    ingredients: text(raw.ingredients, 280)
  });

  return product;
}

function fromAutomotive(raw) {
  const product = base("automotive", "automotive");
  const price = toNumber(raw.price);

  product.externalId = text(raw.oem || raw.externalId, 255) || null;
  product.key = `au:${product.externalId || text(raw.name, 80)}`;
  product.name = text(raw.name) || product.name;
  product.brand = firstBrand(raw.brand);
  product.image = safeURL(raw.image);
  product.productUrl = safeURL(raw.productUrl);
  product.price = price;
  product.currency = price === null ? null : "SAR";
  product.store = price === null ? null : "Speero";
  product.storeCount = price === null ? null : 1;
  product.priceSource = price === null ? null : "live";
  product.specifications = {
    ...cleanSpecs({
      "Part number": raw.oem,
      grade: raw.grade,
      position: raw.side,
      type: raw.category
    }),
    ...cleanSpecs(raw.specifications)
  };

  return product;
}

// A row of public.products joined with brand + category.
function fromSaved(row, summary) {
  const category =
    mainCategory(row.category_slug, row.parent_slug);

  const origin = ORIGIN_BY_CATEGORY[category] || "saved";
  const product = base(origin, category);
  const specs = parseSpecs(row.specifications);

  product.id = String(row.id);
  product.name = text(row.name) || product.name;
  product.brand =
    firstBrand(row.brand_name) ||
    (origin === "electronics"
      ? brandFromName(product.name)
      : null);
  product.image = safeURL(row.image_url);
  product.barcode = text(row.barcode, 100) || null;
  product.externalId = text(row.external_id, 255) || null;
  product.productUrl = safeURL(row.product_url);
  product.quantity = text(specs.quantity, 100) || null;
  product.market = text(specs.market, 100) || product.market;

  product.specifications = cleanSpecs(
    {
      ...specs,
      ingredients: origin === "groceries" || origin === "beauty"
        ? text(row.description, 280)
        : ""
    },
    {
      externalCategory: "Type",
      catalogCategory: "Type",
      countries: "Sold in",
      oem: "Part number",
      side: "Position",
      market: null
    }
  );

  if (product.specifications.Type) {
    product.specifications.Type =
      lastCategory(product.specifications.Type) ||
      product.specifications.Type;
  }

  if (origin === "electronics" && product.externalId) {
    product.key = `el:${product.externalId}`;
  } else if (origin === "groceries" && product.barcode) {
    product.key = `gr:${product.barcode}`;
  } else if (origin === "beauty" && product.barcode) {
    product.key = `be:${product.barcode}`;
  } else if (origin === "automotive" && product.externalId) {
    product.key = `au:${product.externalId}`;
  } else {
    product.key = `db:${product.id}`;
  }

  return applySummary(product, summary);
}

// Adds the lowest saved offer to a product.
function applySummary(product, summary) {
  if (!summary) return product;

  if (!summary.best) {
    if (summary.lowestByCurrency && summary.lowestByCurrency.length > 1) {
      product.prices = summary.lowestByCurrency.map(offer => ({
        price: offer.price,
        currency: offer.currency,
        store: offer.store
      }));
      product.storeCount = summary.storeCount;
      product.priceSource = "saved";
    }

    return product;
  }

  const best = summary.best;

  product.price = best.price;
  product.currency = best.currency;
  product.store = best.store;
  product.storeCount = summary.storeCount;
  product.availability = best.availability;
  product.lastChecked = best.checkedAt;
  product.market = best.market || product.market;
  product.priceSource = "saved";

  return product;
}

// -------------------------------------
// Variants (colour, storage, SIM ...)
// -------------------------------------

const COLORS = [
  "cosmic orange", "deep blue", "natural titanium", "desert titanium",
  "black titanium", "white titanium", "blue titanium", "space black",
  "space gray", "space grey", "jet black", "phantom black", "rose gold",
  "sky blue", "mist blue", "icy blue", "light blue", "dark blue",
  "navy blue", "midnight", "starlight", "ultramarine", "graphite",
  "lavender", "titanium", "silver", "black", "white", "blue", "gold",
  "pink", "green", "purple", "violet", "red", "yellow", "orange", "teal",
  "sage", "mint", "cream", "beige", "bronze", "coral", "gray", "grey",
  "navy"
];

function has(haystack, needle) {
  return new RegExp(
    `(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`
  ).test(haystack);
}

function capitalize(value) {
  return value.replace(/\b[a-z]/g, letter => letter.toUpperCase());
}

// Works out what makes one store listing different from
// another listing of the same product. Returns null when
// the listing gives no usable detail.
function describeVariant(offer, productName) {
  const name = String(productName || "").toLowerCase();
  const hints = parseSpecs(offer.attributes);

  let slug = "";
  try {
    slug = decodeURIComponent(new URL(offer.url).pathname)
      .replace(/[-_/+.]+/g, " ");
  } catch {
    slug = "";
  }

  const haystack =
    `${offer.title || ""} ${offer.variant || ""} ${slug}`.toLowerCase();

  const attributes = {};

  // Storage and memory
  const sizes = [];
  const pattern = /(\d+(?:\.\d+)?)\s?(tb|gb)(\s?ram)?(?![a-z])/g;
  let match;

  while ((match = pattern.exec(haystack))) {
    const gigabytes =
      Number(match[1]) * (match[2] === "tb" ? 1024 : 1);

    sizes.push({
      label: `${match[1]}${match[2].toUpperCase()}`,
      gigabytes,
      ram: Boolean(match[3])
    });
  }

  const unique = sizes.filter((size, index) =>
    sizes.findIndex(other => other.label === size.label) === index
  );

  const ram =
    unique.find(size => size.ram) ||
    (unique.length > 1
      ? unique.filter(size => size.gigabytes <= 24)
        .sort((a, b) => a.gigabytes - b.gigabytes)[0]
      : null);

  const storage = unique
    .filter(size => size !== ram && !size.ram)
    .sort((a, b) => b.gigabytes - a.gigabytes)[0];

  const explicitStorage = text(hints.storage || hints.capacity, 40);
  const explicitRam = text(hints.ram || hints.memory, 40);

  if (explicitStorage) attributes.storage = explicitStorage;
  else if (storage && storage.gigabytes >= 32) {
    attributes.storage = storage.label;
  }

  if (explicitRam) attributes.ram = explicitRam;
  else if (ram) attributes.ram = ram.label;

  // Colour
  const explicitColor = text(hints.color || hints.colour, 40);

  if (explicitColor) {
    attributes.color = capitalize(explicitColor.toLowerCase());
  } else {
    const color = COLORS.find(item =>
      has(haystack, item) && !has(name, item)
    );

    if (color) attributes.color = capitalize(color);
  }

  // SIM
  const explicitSim = text(hints.sim, 40);

  if (explicitSim) attributes.sim = explicitSim;
  else if (/dual[\s-]?sim/.test(haystack)) attributes.sim = "Dual SIM";
  else if (/(physical|nano)[\s-]?sim/.test(haystack)) {
    attributes.sim = "Physical SIM";
  } else if (has(haystack, "esim") || has(haystack, "e sim")) {
    attributes.sim = "eSIM";
  }

  // Details already in the product name are not a variant.
  for (const [key, value] of Object.entries(attributes)) {
    if (has(name, String(value).toLowerCase())) {
      delete attributes[key];
    }
  }

  const order = ["storage", "ram", "color", "sim"];
  const parts = order
    .filter(key => attributes[key])
    .map(key => key === "ram" ? `${attributes[key]} RAM` : attributes[key]);

  if (!parts.length) {
    const explicit = text(offer.variant, 120);

    if (!explicit) return null;

    return {
      key: explicit.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 150),
      label: explicit,
      attributes: { option: explicit }
    };
  }

  return {
    key: order
      .filter(key => attributes[key])
      .map(key =>
        `${key}=${String(attributes[key]).toLowerCase().replace(/[^a-z0-9.]+/g, "-")}`
      )
      .join("|")
      .slice(0, 150),
    label: parts.join(", "),
    attributes
  };
}

module.exports = {
  CATEGORIES,
  CATEGORY_ORDER,
  ORIGIN_BY_CATEGORY,
  text,
  toNumber,
  safeURL,
  canonicalURL,
  firstBrand,
  mainCategory,
  parseSpecs,
  fromElectronics,
  fromFacts,
  fromAutomotive,
  fromSaved,
  applySummary,
  describeVariant
};
