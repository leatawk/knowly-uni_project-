
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

// =====================================================
// KNOWLY - Know More. Buy Smarter.
//
// Pages:
//   #/                    Home
//   #/search?c=..&q=..    Search results
//   #/compare             Side-by-side comparison
//   #/login, #/register   Accounts
// =====================================================

const API = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

const CATEGORIES = [
  {
    slug: "electronics",
    short: "Electronics",
    name: "Electronics",
    hint: "Phones, TVs, audio",
    examples: ["iPhone 17", "Samsung TV", "AirPods"],
  },
  {
    slug: "computers-accessories",
    short: "Computers",
    name: "Computers & Accessories",
    hint: "Laptops, monitors, parts",
    examples: ["MacBook Air", "Gaming monitor", "SSD 1TB"],
  },
  {
    slug: "groceries-food",
    short: "Groceries",
    name: "Groceries & Food",
    hint: "Food and drinks",
    examples: ["Nutella", "Olive oil", "Nescafé"],
  },
  {
    slug: "beauty-personal-care",
    short: "Beauty",
    name: "Beauty & Personal Care",
    hint: "Skincare, hair, makeup",
    examples: ["CeraVe", "Nivea", "Shampoo"],
  },
  {
    slug: "automotive",
    short: "Automotive",
    name: "Automotive",
    hint: "Parts and accessories",
    examples: ["Brake pads", "Oil filter", "Spark plug"],
  },
];

const CATEGORY_NAME = Object.fromEntries(
  CATEGORIES.map((category) => [category.slug, category.name])
);

const MAX_COMPARE = 3;
const NO_PRICE = "No verified store price available";

// -----------------------------------------------------
// LOGIN TOKEN
// -----------------------------------------------------

const TOKEN_KEY = "knowly-token";

function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage blocked.
  }
}

function safeNext(value) {
  return /^#\/(?!login|register)/.test(value || "")
    ? value
    : "#/";
}

// -----------------------------------------------------
// API REQUESTS
// -----------------------------------------------------

async function request(path, options = {}) {
  const { auth = false, headers = {}, ...rest } = options;
  const token = auth ? getToken() : "";
  let response;

  try {
    response = await fetch(`${API}${path}`, {
      signal: AbortSignal.timeout(45000),
      ...rest,
      headers: token
        ? { ...headers, Authorization: `Bearer ${token}` }
        : headers,
    });
  } catch (error) {
    throw new Error(
      error.name === "TimeoutError"
        ? "The server took too long to answer. Try again."
        : "Knowly's server is not reachable. Make sure the backend is running on port 4000."
    );
  }

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      `The server sent an unreadable answer (HTTP ${response.status}).`
    );
  }

  if (!response.ok) {
    const error = new Error(
      data.error || `Request failed (HTTP ${response.status}).`
    );

    error.status = response.status;
    error.fields = data.fields || {};
    throw error;
  }

  return data;
}

function postJSON(path, body, headers = {}, auth = false) {
  return request(path, {
    method: "POST",
    auth,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

// -----------------------------------------------------
// GENERAL HELPERS
// -----------------------------------------------------

function money(value, currency) {
  const number = Number(value);

  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(number)
  ) {
    return "";
  }

  const whole = currency === "LBP" || Number.isInteger(number);

  return `${currency || ""} ${number.toLocaleString("en-US", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })}`.trim();
}

function when(value) {
  if (!value) return "Not recorded";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not recorded";
  }

  const minutes = Math.round(
    (Date.now() - date.getTime()) / 60000
  );

  if (minutes < 2) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`;

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function checked(value) {
  const text = when(value);

  if (text === "Not recorded") {
    return "check date not recorded";
  }

  return /ago$|now$/i.test(text)
    ? `checked ${text.toLowerCase()}`
    : `checked on ${text}`;
}

function safeLink(value) {
  try {
    const url = new URL(value);

    return url.protocol === "https:" ||
      url.protocol === "http:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function reference(product) {
  return {
    key: product.key,
    id: product.id,
    origin: product.origin,
    externalId: product.externalId,
    barcode: product.barcode,
    category: product.category,
    name: product.name,
    brand: product.brand,
    image: product.image,
    productUrl: product.productUrl,
    quantity: product.quantity,
    price: product.price,
    storeCount: product.storeCount,
  };
}

function parseRoute() {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const [path, queryString = ""] = hash.split("?");
  const params = new URLSearchParams(queryString);
  const category = params.get("c") || "";

  if (path === "compare") {
    return { page: "compare", q: "", c: "" };
  }

  if (path === "login" || path === "register") {
    return {
      page: "auth",
      mode: path,
      next: safeNext(params.get("next")),
      q: "",
      c: "",
    };
  }

  if (path === "search") {
    return {
      page: "search",
      q: (params.get("q") || "").trim(),
      c: CATEGORY_NAME[category] ? category : "",
    };
  }

  return { page: "home", q: "", c: "" };
}

function searchHash(q, c) {
  const params = new URLSearchParams();

  if (c) params.set("c", c);
  if (q) params.set("q", q);

  return `#/search?${params.toString()}`;
}

function readStoredCompare() {
  try {
    const saved = JSON.parse(
      sessionStorage.getItem("knowly-compare") || "[]"
    );

    return Array.isArray(saved)
      ? saved.slice(0, MAX_COMPARE)
      : [];
  } catch {
    return [];
  }
}

// -----------------------------------------------------
// ICONS
// -----------------------------------------------------

function Icon({ name, size = 18 }) {
  const paths = {
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    close: <path d="M6 6l12 12M18 6 6 18" />,
    plus: <path d="M12 5v14M5 12h14" />,
    check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
    external: <><path d="M14 5h5v5" /><path d="M19 5 10 14" /><path d="M19 14v5H5V5h5" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></>,
    filter: <path d="M4 6h16M7 12h10M10 18h4" />,
    chevron: <path d="m6 9 6 6 6-6" />,
    compare: <><rect x="3.5" y="5" width="7" height="14" rx="1.5" /><rect x="13.5" y="5" width="7" height="14" rx="1.5" /></>,
    user: <><circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20c1.3-3.6 4.1-5.4 7.5-5.4s6.2 1.8 7.5 5.4" /></>,
    electronics: <><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" /></>,
    "computers-accessories": <><rect x="3.5" y="5" width="17" height="11" rx="1.5" /><path d="M2 19.5h20" /></>,
    "groceries-food": <><path d="M4 5h2l2.2 10h9.6L20 8H7" /><circle cx="9.5" cy="19" r="1.3" /><circle cx="17" cy="19" r="1.3" /></>,
    "beauty-personal-care": <><path d="M9 9h6l1 12H8L9 9Z" /><path d="M10.5 9V5.5h3V9M10.5 3h3" /></>,
    automotive: <><path d="M4 16v-3.5l2-5.5h12l2 5.5V16" /><path d="M3 16h18v3H3z" /><circle cx="7.5" cy="14" r=".8" /><circle cx="16.5" cy="14" r=".8" /></>,
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

// -----------------------------------------------------
// PRODUCT IMAGE
// -----------------------------------------------------

function ProductImage({ product }) {
  const [failed, setFailed] = useState(false);
  const src = safeLink(product.image);

  if (!src || failed) {
    return (
      <span className="photo photo-empty">
        <Icon name={product.category || "search"} size={28} />
      </span>
    );
  }

  return (
    <span className="photo">
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

function PriceTag({ price, currency, size = "md" }) {
  return (
    <span className={`tag tag-${size}`}>
      <span className="tag-currency">{currency}</span>
      {money(price, "")}
    </span>
  );
}

function Notice({ tone = "info", children }) {
  return (
    <div
      className={`notice notice-${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <Icon name="info" />
      <div>{children}</div>
    </div>
  );
}

function useDismiss(open, setOpen, ref) {
  useEffect(() => {
    if (!open) return undefined;

    const onDown = (event) => {
      if (!ref.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen, ref]);
}

// -----------------------------------------------------
// PRODUCT CARD PRICE
// -----------------------------------------------------

function CardPrice({ product }) {
  if (
    product.price !== null &&
    product.price !== undefined
  ) {
    let line = "";

    if (
      product.priceSource === "live" &&
      product.origin === "electronics"
    ) {
      line = product.storeCount
        ? `Lowest of ${product.storeCount} ${
            product.storeCount === 1 ? "store" : "stores"
          }`
        : "Lowest listed price";
    } else if (product.store) {
      line = `at ${product.store}`;
    }

    // Always show the market when supplied by the backend.
    if (product.market) {
      line += line
        ? ` · ${product.market}`
        : product.market;
    }

    return (
      <span className="card-price">
        <PriceTag
          price={product.price}
          currency={product.currency}
        />

        {line && (
          <span className="card-price-line">
            {line}
          </span>
        )}
      </span>
    );
  }

  if (product.prices && product.prices.length) {
    return (
      <span className="card-price">
        {product.prices.map((item, index) => (
          <span
            className="card-price-row"
            key={`${item.currency}-${item.store}-${index}`}
          >
            <PriceTag
              price={item.price}
              currency={item.currency}
              size="sm"
            />

            <span className="card-price-line">
              {item.store}
              {item.market ? ` · ${item.market}` : ""}
            </span>
          </span>
        ))}
      </span>
    );
  }

  return (
    <span className="no-price">
      {NO_PRICE}
    </span>
  );
}

// -----------------------------------------------------
// PRODUCT CARD
// -----------------------------------------------------

function ProductCard({
  product,
  selected,
  onOpen,
  onToggleCompare,
}) {
  const meta =
    product.origin === "automotive" && product.externalId
      ? `Part no. ${product.externalId}`
      : product.quantity;

  return (
    <article className={`card ${selected ? "is-selected" : ""}`}>
      <button
        type="button"
        className="card-main"
        onClick={() => onOpen(product)}
      >
        <ProductImage product={product} />

        <span className="card-brand">
          {product.brand || "Brand not listed"}
        </span>

        <span className="card-name">
          {product.name}
        </span>

        {meta && (
          <span className="card-meta">
            {meta}
          </span>
        )}

        <CardPrice product={product} />
      </button>

      <div className="card-foot">
        <label className="check check-sm">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleCompare(product)}
          />
          <span>Compare</span>
        </label>

        <button
          type="button"
          className="link card-view"
          onClick={() => onOpen(product)}
        >
          View prices
        </button>
      </div>
    </article>
  );
}

function ProductGrid({
  products,
  compareKeys,
  onOpen,
  onToggleCompare,
}) {
  return (
    <div className="grid">
      {products.map((product) => (
        <ProductCard
          key={product.key}
          product={product}
          selected={compareKeys.has(product.key)}
          onOpen={onOpen}
          onToggleCompare={onToggleCompare}
        />
      ))}
    </div>
  );
}

// -----------------------------------------------------
// SEARCH BAR
// -----------------------------------------------------

function SearchBar({
  initialQuery,
  initialCategory,
  onSearch,
  large = false,
}) {
  const [q, setQ] = useState(initialQuery);
  const [c, setC] = useState(initialCategory);
  const id = large ? "home" : "top";

  const category = CATEGORIES.find(
    (item) => item.slug === c
  );

  return (
    <form
      className={`searchbar ${large ? "searchbar-large" : ""}`}
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch(q.trim(), c);
      }}
    >
      <label
        className="sr-only"
        htmlFor={`search-category-${id}`}
      >
        Category
      </label>

      <select
        id={`search-category-${id}`}
        value={c}
        onChange={(event) => setC(event.target.value)}
      >
        <option value="">All categories</option>

        {CATEGORIES.map((item) => (
          <option key={item.slug} value={item.slug}>
            {item.name}
          </option>
        ))}
      </select>

      <label
        className="sr-only"
        htmlFor={`search-input-${id}`}
      >
        Search products
      </label>

      <input
        id={`search-input-${id}`}
        type="search"
        value={q}
        maxLength={100}
        onChange={(event) => setQ(event.target.value)}
        placeholder={
          category
            ? `Search ${category.short.toLowerCase()}`
            : "Search a product"
        }
      />

      <button
        type="submit"
        className="button button-primary"
        aria-label="Search"
      >
        <Icon name="search" />
        {large && <span>Search</span>}
      </button>
    </form>
  );
}

// -----------------------------------------------------
// HOME
// -----------------------------------------------------

function Home({
  onSearch,
  onOpen,
  compareKeys,
  onToggleCompare,
}) {
  const [tracked, setTracked] = useState([]);

  useEffect(() => {
    let active = true;

    request("/search")
      .then((data) => {
        if (active) {
          setTracked(
            (data.products || [])
              .filter((p) => p.price !== null)
              .slice(0, 4)
          );
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <section className="hero">
        <div className="shell hero-inner">
          <h1>Know more. Buy smarter.</h1>

          <p className="hero-lead">
            Compare product prices across stores in Lebanon before you buy.
          </p>

          <SearchBar
            initialQuery=""
            initialCategory=""
            onSearch={onSearch}
            large
          />

          <div className="hero-try">
            <span>Try</span>

            {[
              ["iPhone 17", "electronics"],
              ["Nutella", "groceries-food"],
              ["CeraVe", "beauty-personal-care"],
              ["Brake pads", "automotive"],
            ].map(([term, slug]) => (
              <button
                key={term}
                type="button"
                onClick={() => onSearch(term, slug)}
              >
                {term}
              </button>
            ))}
          </div>

          <ol className="hero-steps">
            <li>Search a product</li>
            <li>Open it to see every store's price</li>
            <li>Compare up to 3 side by side</li>
          </ol>
        </div>
      </section>

      <section className="shell section" id="categories">
        <h2>Shop by category</h2>

        <ul className="category-row">
          {CATEGORIES.map((category) => (
            <li key={category.slug}>
              <a
                className="category"
                href={searchHash("", category.slug)}
              >
                <span className="category-icon">
                  <Icon name={category.slug} size={24} />
                </span>

                {category.name}
              </a>
            </li>
          ))}
        </ul>
      </section>

      {tracked.length > 0 && (
        <section className="shell section">
          <h2>Recently checked prices</h2>

          <ProductGrid
            products={tracked}
            compareKeys={compareKeys}
            onOpen={onOpen}
            onToggleCompare={onToggleCompare}
          />
        </section>
      )}
    </>
  );
}

// -----------------------------------------------------
// SEARCH RESULTS
// -----------------------------------------------------

const EMPTY_FILTERS = {
  brand: "",
  min: "",
  max: "",
  currency: "",
  pricedOnly: false,
  sort: "relevance",
};

function Results({
  route,
  onSearch,
  onOpen,
  compareKeys,
  onToggleCompare,
}) {
  const [state, setState] = useState({
    status: "loading",
    products: [],
    notices: [],
    error: "",
  });

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    setState({
      status: "loading",
      products: [],
      notices: [],
      error: "",
    });

    setFilters(EMPTY_FILTERS);

    const params = new URLSearchParams();

    if (route.q) params.set("q", route.q);
    if (route.c) params.set("category", route.c);

    request(`/search?${params.toString()}`)
      .then((data) => {
        if (active) {
          setState({
            status: "ready",
            products: data.products || [],
            notices: data.notices || [],
            error: "",
          });
        }
      })
      .catch((error) => {
        if (active) {
          setState({
            status: "error",
            products: [],
            notices: [],
            error: error.message,
          });
        }
      });

    return () => {
      active = false;
    };
  }, [route.q, route.c, attempt]);

  const { products } = state;

  const set = (patch) =>
    setFilters((current) => ({
      ...current,
      ...patch,
    }));

  const brands = useMemo(
    () =>
      [
        ...new Set(
          products.map((p) => p.brand).filter(Boolean)
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [products]
  );

  const currencies = useMemo(
    () => [
      ...new Set(
        products
          .filter((p) => p.price !== null)
          .map((p) => p.currency)
      ),
    ],
    [products]
  );

  const priceCurrency =
    filters.currency || currencies[0] || "";

  const hasPrices = currencies.length > 0;

  const visible = useMemo(() => {
    const min =
      filters.min === "" ? null : Number(filters.min);

    const max =
      filters.max === "" ? null : Number(filters.max);

    const ranged =
      (min !== null && Number.isFinite(min)) ||
      (max !== null && Number.isFinite(max));

    const list = products.filter((p) => {
      if (filters.brand && p.brand !== filters.brand) {
        return false;
      }

      if (
        filters.pricedOnly &&
        p.price === null &&
        !(p.prices && p.prices.length)
      ) {
        return false;
      }

      if (ranged) {
        if (p.price === null || p.currency !== priceCurrency) {
          return false;
        }

        if (
          min !== null &&
          Number.isFinite(min) &&
          p.price < min
        ) {
          return false;
        }

        if (
          max !== null &&
          Number.isFinite(max) &&
          p.price > max
        ) {
          return false;
        }
      }

      return true;
    });

    const byPrice = (direction) => (a, b) => {
      const pa =
        a.price !== null && a.currency === priceCurrency
          ? a.price
          : null;

      const pb =
        b.price !== null && b.currency === priceCurrency
          ? b.price
          : null;

      if (pa === null && pb === null) return 0;
      if (pa === null) return 1;
      if (pb === null) return -1;

      return direction * (pa - pb);
    };

    if (filters.sort === "price-asc") {
      list.sort(byPrice(1));
    }

    if (filters.sort === "price-desc") {
      list.sort(byPrice(-1));
    }

    if (filters.sort === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }

    return list;
  }, [products, filters, priceCurrency]);

  const activeFilters =
    (filters.brand ? 1 : 0) +
    (filters.min || filters.max ? 1 : 0) +
    (filters.pricedOnly ? 1 : 0);

  const clearFilters = () =>
    setFilters({
      ...EMPTY_FILTERS,
      sort: filters.sort,
    });

  const grouped =
    !route.c && filters.sort === "relevance";

  const groups = grouped
    ? CATEGORIES.map((category) => ({
        category,
        items: visible.filter(
          (p) => p.category === category.slug
        ),
      })).filter((group) => group.items.length)
    : [{ category: null, items: visible }];

  const category = CATEGORIES.find(
    (item) => item.slug === route.c
  );

  const title = route.q
    ? `Results for “${route.q}”`
    : category
      ? category.name
      : "Products Knowly is tracking";

  return (
    <div className="shell page">
      <header className="page-head">
        <h1>{title}</h1>

        <p className="muted" aria-live="polite">
          {state.status === "loading"
            ? "Searching…"
            : state.status === "error"
              ? "The search did not go through"
              : `${visible.length} ${
                  visible.length === 1
                    ? "product"
                    : "products"
                }`}
        </p>
      </header>

      <nav className="chips" aria-label="Category">
        <a
          href={searchHash(route.q, "")}
          aria-current={!route.c ? "page" : undefined}
        >
          All
        </a>

        {CATEGORIES.map((item) => (
          <a
            key={item.slug}
            href={searchHash(route.q, item.slug)}
            aria-current={
              route.c === item.slug ? "page" : undefined
            }
          >
            {item.short}
          </a>
        ))}
      </nav>

      {state.status === "ready" && products.length > 0 && (
        <div className="toolbar">
          <button
            type="button"
            className="button button-quiet filters-toggle"
            aria-expanded={showFilters}
            aria-controls="filters"
            onClick={() => setShowFilters((open) => !open)}
          >
            <Icon name="filter" size={16} />
            Filters{activeFilters ? ` (${activeFilters})` : ""}
          </button>

          <div
            id="filters"
            className={`toolbar-filters ${
              showFilters ? "is-open" : ""
            }`}
          >
            {brands.length > 1 && (
              <label className="inline-field">
                <span>Brand</span>

                <select
                  value={filters.brand}
                  onChange={(event) =>
                    set({ brand: event.target.value })
                  }
                >
                  <option value="">All brands</option>

                  {brands.map((brand) => (
                    <option key={brand} value={brand}>
                      {brand}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {hasPrices && (
              <div
                className="inline-field"
                role="group"
                aria-label="Price range"
              >
                <span>Price</span>

                {currencies.length > 1 ? (
                  <select
                    aria-label="Currency"
                    value={priceCurrency}
                    onChange={(event) =>
                      set({ currency: event.target.value })
                    }
                  >
                    {currencies.map((currency) => (
                      <option key={currency}>
                        {currency}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="muted">
                    {priceCurrency}
                  </span>
                )}

                <input
                  type="number"
                  min="0"
                  inputMode="decimal"
                  placeholder="Min"
                  aria-label="Minimum price"
                  value={filters.min}
                  onChange={(event) =>
                    set({ min: event.target.value })
                  }
                />

                <span className="muted">to</span>

                <input
                  type="number"
                  min="0"
                  inputMode="decimal"
                  placeholder="Max"
                  aria-label="Maximum price"
                  value={filters.max}
                  onChange={(event) =>
                    set({ max: event.target.value })
                  }
                />
              </div>
            )}

            <label className="check">
              <input
                type="checkbox"
                checked={filters.pricedOnly}
                onChange={(event) =>
                  set({ pricedOnly: event.target.checked })
                }
              />

              <span>With a price only</span>
            </label>

            {activeFilters > 0 && (
              <button
                type="button"
                className="link"
                onClick={clearFilters}
              >
                Clear filters
              </button>
            )}
          </div>

          <label className="inline-field sort">
            <span>Sort</span>

            <select
              value={filters.sort}
              onChange={(event) =>
                set({ sort: event.target.value })
              }
            >
              <option value="relevance">Best match</option>

              {hasPrices && (
                <option value="price-asc">
                  Lowest price
                </option>
              )}

              {hasPrices && (
                <option value="price-desc">
                  Highest price
                </option>
              )}

              <option value="name">Name A–Z</option>
            </select>
          </label>
        </div>
      )}

      {state.notices.map((message) => (
        <Notice key={message} tone="warn">
          {message}
        </Notice>
      ))}

      {route.c === "automotive" &&
        state.status === "ready" &&
        products.length > 0 && (
          <Notice>
            These parts are sold in Saudi Arabia and priced
            in SAR, not in Lebanon. Check that a part fits
            your vehicle before buying.
          </Notice>
        )}

      {state.status === "loading" && (
        <div className="grid" aria-hidden="true">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((item) => (
            <div className="card card-loading" key={item} />
          ))}
        </div>
      )}

      {state.status === "error" && (
        <div className="empty">
          <h2>The search did not go through</h2>
          <p>{state.error}</p>

          <button
            type="button"
            className="button button-primary"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Try again
          </button>
        </div>
      )}

      {state.status === "ready" && products.length === 0 && (
        <div className="empty">
          {route.q ? (
            <>
              <h2>
                No products found for “{route.q}”
              </h2>

              <p>
                Check the spelling, try a shorter name,
                or search all categories.
              </p>

              {route.c && (
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => onSearch(route.q, "")}
                >
                  Search all categories
                </button>
              )}
            </>
          ) : (
            <>
              <h2>
                {category
                  ? `Search ${category.name}`
                  : "Search for a product"}
              </h2>

              <p>
                Type a product name in the search bar,
                or try one of these.
              </p>

              <div className="try-row">
                {(category
                  ? category.examples
                  : ["iPhone 17", "Nutella", "CeraVe"]
                ).map((term) => (
                  <button
                    key={term}
                    type="button"
                    className="button button-quiet"
                    onClick={() => onSearch(term, route.c)}
                  >
                    {term}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {state.status === "ready" &&
        products.length > 0 &&
        visible.length === 0 && (
          <div className="empty">
            <h2>No products match these filters</h2>

            <button
              type="button"
              className="button button-primary"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          </div>
        )}

      {state.status === "ready" &&
        visible.length > 0 &&
        groups.map((group) => (
          <section
            key={
              group.category
                ? group.category.slug
                : "all"
            }
            className="group"
          >
            {group.category && (
              <h2 className="group-title">
                {group.category.name}

                {group.category.slug === "automotive" && (
                  <span className="chip">
                    Saudi Arabia, SAR
                  </span>
                )}
              </h2>
            )}

            <ProductGrid
              products={group.items}
              compareKeys={compareKeys}
              onOpen={onOpen}
              onToggleCompare={onToggleCompare}
            />
          </section>
        ))}
    </div>
  );
}

// -----------------------------------------------------
// PRODUCT PANEL: STORE PRICES, HISTORY, DETAILS
// -----------------------------------------------------

function OffersList({ offers }) {
  const lowestIds = new Set();
  const seen = new Set();

  for (const offer of offers) {
    if (
      offer.active &&
      offer.availability !== "Out of stock" &&
      !seen.has(offer.currency)
    ) {
      seen.add(offer.currency);
      lowestIds.add(offer.id);
    }
  }

  return (
    <ul className="offers">
      {offers.map((offer) => {
        const link =
          safeLink(offer.url) ||
          safeLink(offer.storeUrl);

        const details = [
          offer.variant,
          offer.condition && offer.condition !== "New"
            ? offer.condition
            : "",
          offer.sourceLabel &&
          offer.sourceLabel !== "Store listing"
            ? offer.sourceLabel
            : "",
          offer.market || "",
        ].filter(Boolean);

        const stock = !offer.active
          ? "No longer listed"
          : offer.availability === "Unknown"
            ? "Stock not stated"
            : offer.availability;

        return (
          <li
            key={offer.id}
            className={`offer ${
              offer.active ? "" : "is-inactive"
            }`}
          >
            <div className="offer-store">
              <strong>
                {offer.store}

                {lowestIds.has(offer.id) && (
                  <span className="chip chip-strong">
                    Lowest
                  </span>
                )}
              </strong>

              {details.length > 0 && (
                <span>{details.join(", ")}</span>
              )}

              <span className="offer-meta">
                <span
                  className={`status status-${String(
                    offer.availability || "Unknown"
                  ).toLowerCase().replace(/\s+/g, "-")}`}
                >
                  {stock}
                </span>
                , {checked(offer.checkedAt)}
              </span>
            </div>

            <span className="offer-price">
              {money(offer.price, offer.currency)}
            </span>

            {link ? (
              <a
                className="button button-quiet offer-visit"
                href={link}
                target="_blank"
                rel="noopener noreferrer"
              >
                Visit store
                <Icon name="external" size={14} />
              </a>
            ) : (
              <span />
            )}
          </li>
        );
      })}
    </ul>
  );
}

// -----------------------------------------------------
// ADD MANUAL STORE PRICE
// -----------------------------------------------------

function AddPriceForm({ productId, meta, onSaved }) {
  const blank = {
    storeName: "",
    price: "",
    currency: "LBP",
    url: "",
    availability: "In stock",
    key: "",
  };

  const [form, setForm] = useState(blank);

  const [state, setState] = useState({
    busy: false,
    error: "",
    done: "",
  });

  const set = (patch) =>
    setForm((current) => ({
      ...current,
      ...patch,
    }));

  async function submit(event) {
    event.preventDefault();

    setState({
      busy: true,
      error: "",
      done: "",
    });

    try {
      const detail = await postJSON(
        `/products/${productId}/offers`,
        {
          storeName: form.storeName,
          price: form.price,
          currency: form.currency,
          url: form.url,
          availability: form.availability,
        },
        form.key
          ? { "x-knowly-key": form.key }
          : {}
      );

      setForm({
        ...blank,
        key: form.key,
        currency: form.currency,
      });

      setState({
        busy: false,
        error: "",
        done:
          detail.saved === "unchanged"
            ? "Price confirmed. Nothing changed."
            : "Store price saved.",
      });

      onSaved(detail);
    } catch (error) {
      setState({
        busy: false,
        error: error.message,
        done: "",
      });
    }
  }

  return (
    <form className="add-price" onSubmit={submit}>
      <p className="muted">
        Enter the price exactly as the store publishes it,
        with the link to its product page so anyone can check it.
      </p>

      <div className="form-grid">
        <label className="field">
          <span>Store</span>

          <input
            list="knowly-stores"
            required
            maxLength={120}
            value={form.storeName}
            onChange={(event) =>
              set({ storeName: event.target.value })
            }
            placeholder="Carrefour Lebanon"
          />

          <datalist id="knowly-stores">
            {(meta.retailers || []).map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>

        <label className="field">
          <span>Price</span>

          <input
            type="number"
            required
            min="0"
            step="any"
            inputMode="decimal"
            value={form.price}
            onChange={(event) =>
              set({ price: event.target.value })
            }
          />
        </label>

        <label className="field">
          <span>Currency</span>

          <select
            value={form.currency}
            onChange={(event) =>
              set({ currency: event.target.value })
            }
          >
            {(meta.currencies || ["LBP", "USD"]).map(
              (currency) => (
                <option key={currency}>
                  {currency}
                </option>
              )
            )}
          </select>
        </label>

        <label className="field">
          <span>Availability</span>

          <select
            value={form.availability}
            onChange={(event) =>
              set({ availability: event.target.value })
            }
          >
            <option>In stock</option>
            <option>Out of stock</option>
            <option>Unknown</option>
          </select>
        </label>

        <label className="field field-wide">
          <span>Link to the store's product page</span>

          <input
            type="url"
            required
            value={form.url}
            onChange={(event) =>
              set({ url: event.target.value })
            }
            placeholder="https://"
          />
        </label>

        {meta.keyRequired && (
          <label className="field field-wide">
            <span>Access key</span>

            <input
              type="password"
              required
              value={form.key}
              onChange={(event) =>
                set({ key: event.target.value })
              }
            />
          </label>
        )}
      </div>

      {state.error && (
        <Notice tone="error">
          {state.error}
        </Notice>
      )}

      {state.done && (
        <Notice tone="success">
          {state.done}
        </Notice>
      )}

      <button
        type="submit"
        className="button button-primary"
        disabled={state.busy}
      >
        {state.busy ? "Saving…" : "Save store price"}
      </button>
    </form>
  );
}

// -----------------------------------------------------
// PRODUCT DETAILS PANEL
// -----------------------------------------------------

function ProductPanel({
  product,
  meta,
  selected,
  onToggleCompare,
  onClose,
}) {
  const [state, setState] = useState({
    status: "loading",
    detail: null,
    error: "",
  });

  const [attempt, setAttempt] = useState(0);
  const panel = useRef(null);

  useEffect(() => {
    let active = true;

    setState({
      status: "loading",
      detail: null,
      error: "",
    });

    postJSON(
      "/products/resolve",
      { product: reference(product) }
    )
      .then((detail) => {
        if (active) {
          setState({
            status: "ready",
            detail,
            error: "",
          });
        }
      })
      .catch((error) => {
        if (active) {
          setState({
            status: "error",
            detail: null,
            error: error.message,
          });
        }
      });

    return () => {
      active = false;
    };
  }, [product, attempt]);

  useEffect(() => {
    const onKey = (event) =>
      event.key === "Escape" && onClose();

    const previous = document.activeElement;

    window.addEventListener("keydown", onKey);
    document.body.classList.add("no-scroll");

    panel.current?.focus();

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("no-scroll");
      previous?.focus?.();
    };
  }, [onClose]);

  const detail = state.detail;
  const shown = detail ? detail.product : product;
  const summary = detail?.summary;
  const specs = Object.entries(shown.specifications || {});

  const canAddPrice =
    detail &&
    shown.id &&
    ["groceries", "beauty"].includes(shown.origin);

  const sourcePage =
    shown.origin === "electronics"
      ? safeLink(shown.productUrl)
      : null;

  const lowest = summary
    ? summary.lowestByCurrency
    : [];

  let listNote = "";

  if (detail && detail.offers.length) {
    const stores = summary.storeCount;

    listNote = detail.live
      ? `Live prices from ${stores} ${
          stores === 1 ? "store" : "stores"
        }, cheapest first.`
      : "Saved prices, cheapest first.";

    if (lowest.length > 1) {
      listNote +=
        " Prices are in different currencies and are not converted.";
    }
  }

  return (
    <div
      className="overlay"
      onMouseDown={(event) =>
        event.target === event.currentTarget && onClose()
      }
    >
      <section
        className="panel"
        role="dialog"
        aria-modal="true"
        aria-label={shown.name}
        tabIndex={-1}
        ref={panel}
      >
        <header className="panel-head">
          <span className="muted">
            {shown.categoryName || "Product"}
          </span>

          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>

        <div className="panel-body">
          <div className="panel-product">
            <ProductImage product={shown} />

            <div className="panel-summary">
              <p className="card-brand">
                {shown.brand || "Brand not listed"}
              </p>

              <h2>{shown.name}</h2>

              {shown.quantity && (
                <p className="muted">
                  {shown.quantity}
                </p>
              )}

              {lowest.length === 1 && (
                <p className="panel-best">
                  <PriceTag
                    price={lowest[0].price}
                    currency={lowest[0].currency}
                    size="lg"
                  />

                  <span>
                    Lowest price, at{" "}
                    <strong>{lowest[0].store}</strong>

                    {lowest[0].market
                      ? ` · ${lowest[0].market}`
                      : ""}
                  </span>
                </p>
              )}

              <button
                type="button"
                className={`button button-compare ${
                  selected ? "is-on" : ""
                }`}
                aria-pressed={selected}
                onClick={() => onToggleCompare(shown)}
              >
                <Icon
                  name={selected ? "check" : "plus"}
                  size={15}
                />

                {selected
                  ? "Added to comparison"
                  : "Add to comparison"}
              </button>
            </div>
          </div>

          {state.status === "loading" && (
            <p className="loading-line">
              Checking store prices…
            </p>
          )}

          {state.status === "error" && (
            <>
              <Notice tone="error">
                {state.error}
              </Notice>

              <button
                type="button"
                className="button button-quiet"
                onClick={() => setAttempt((n) => n + 1)}
              >
                Try again
              </button>
            </>
          )}

          {detail && (
            <>
              {detail.notice && (
                <Notice tone="warn">
                  {detail.notice}
                </Notice>
              )}

              <section className="panel-section">
                <h3>Store prices</h3>

                {detail.offers.length > 0 ? (
                  <>
                    <p className="muted">
                      {listNote}
                    </p>

                    <OffersList offers={detail.offers} />

                    <p className="fine">
                      Prices are shown as each store lists them
                      and may exclude VAT. Confirm the price and
                      stock with the store before paying.

                      {sourcePage && (
                        <>
                          {" "}
                          <a
                            href={sourcePage}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Source listing
                          </a>
                        </>
                      )}
                    </p>
                  </>
                ) : (
                  <p className="no-price no-price-box">
                    {NO_PRICE}
                  </p>
                )}
              </section>

              {detail.storeLinks.length > 0 && (
                <section className="panel-section">
                  <h3>
                    Look it up at a Lebanese store
                  </h3>

                  <div className="try-row">
                    {detail.storeLinks.map((link) => (
                      <a
                        key={link.name}
                        className="button button-quiet"
                        href={link.findUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {link.name}
                        <Icon name="external" size={14} />
                      </a>
                    ))}
                  </div>
                </section>
              )}

              {canAddPrice && (
                <details className="disclosure">
                  <summary>
                    Add a store price you checked
                  </summary>

                  <AddPriceForm
                    productId={shown.id}
                    meta={meta}
                    onSaved={(next) =>
                      setState({
                        status: "ready",
                        detail: next,
                        error: "",
                      })
                    }
                  />
                </details>
              )}

              {detail.history.length > 0 && (
                <details className="disclosure">
                  <summary>
                    Price history ({detail.history.length})
                  </summary>

                  <p className="muted">
                    A record is added the first time a price is
                    seen and each time it changes.
                  </p>

                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Store</th>
                          <th>Price</th>
                        </tr>
                      </thead>

                      <tbody>
                        {detail.history.slice(0, 40).map((row) => (
                          <tr key={row.id}>
                            <td>
                              {new Date(
                                row.recorded_at
                              ).toLocaleDateString("en-GB", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                            </td>

                            <td>
                              {row.store_name || "Store"}

                              {row.variant && (
                                <span className="sub">
                                  {row.variant}
                                </span>
                              )}
                            </td>

                            <td className="price-cell">
                              {money(row.price, row.currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </>
          )}

          {specs.length > 0 && (
            <details
              className="disclosure"
              open={Boolean(
                detail && detail.offers.length === 0
              )}
            >
              <summary>Product details</summary>

              <dl className="specs">
                {shown.barcode && (
                  <div>
                    <dt>Barcode</dt>
                    <dd>{shown.barcode}</dd>
                  </div>
                )}

                {specs.map(([name, value]) => (
                  <div key={name}>
                    <dt>{name}</dt>
                    <dd>{String(value)}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
        </div>
      </section>
    </div>
  );
}

// -----------------------------------------------------
// COMPARISON PRICE CELL
// -----------------------------------------------------

function BestPriceCell({ product, isLowest }) {
  const lowest = product.lowestByCurrency || [];

  if (!lowest.length) {
    return (
      <>
        <p className="no-price">
          {NO_PRICE}
        </p>

        {product.notice && (
          <p className="sub">
            {product.notice}
          </p>
        )}
      </>
    );
  }

  return (
    <>
      {lowest.map((offer) => {
        const link =
          safeLink(offer.url) ||
          safeLink(offer.storeUrl);

        return (
          <div
            className="best"
            key={offer.currency}
          >
            <PriceTag
              price={offer.price}
              currency={offer.currency}
              size="lg"
            />

            {isLowest && (
              <span className="chip chip-strong">
                Lowest of these
              </span>
            )}

            <p className="best-store">
              {offer.store}
            </p>

            <p className="sub">
              {offer.availability === "Unknown"
                ? "Stock not stated"
                : offer.availability}

              {offer.market
                ? ` · ${offer.market}`
                : ""}
            </p>

            <p className="sub">
              {checked(offer.checkedAt)}
            </p>

            {link && (
              <a
                className="visit"
                href={link}
                target="_blank"
                rel="noopener noreferrer"
              >
                Visit store
                <Icon name="external" size={14} />
              </a>
            )}
          </div>
        );
      })}

      {product.notice && (
        <p className="sub">
          {product.notice}
        </p>
      )}
    </>
  );
}

// -----------------------------------------------------
// COMPARE PRODUCTS
// -----------------------------------------------------

function Compare({
  items,
  onRemove,
  onClear,
  onOpen,
  onBrowse,
}) {
  const [state, setState] = useState({
    status: "idle",
    data: null,
    error: "",
  });

  const [differencesOnly, setDifferencesOnly] =
    useState(false);

  const [attempt, setAttempt] = useState(0);

  const signature = items
    .map((item) => item.key)
    .join("|");

  useEffect(() => {
    if (items.length < 2) {
      setState({
        status: "idle",
        data: null,
        error: "",
      });

      return undefined;
    }

    let active = true;

    setState((current) => ({
      status: "loading",
      data: current.data,
      error: "",
    }));

    postJSON(
      "/compare",
      { items: items.map(reference) }
    )
      .then((data) => {
        if (active) {
          setState({
            status: "ready",
            data,
            error: "",
          });
        }
      })
      .catch((error) => {
        if (active) {
          setState({
            status: "error",
            data: null,
            error: error.message,
          });
        }
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, attempt]);

  if (items.length < 2) {
    return (
      <div className="shell page">
        <h1>Compare products</h1>

        <div className="empty">
          <h2>
            {items.length === 0
              ? "Nothing to compare yet"
              : "Add one more product"}
          </h2>

          <p>
            Press Compare on up to three products in the
            search results. They will appear here side by
            side with their lowest verified prices.
          </p>

          <button
            type="button"
            className="button button-primary"
            onClick={onBrowse}
          >
            Find products
          </button>
        </div>
      </div>
    );
  }

  const data = state.data;

  const products =
    data &&
    data.products.map((p) => p.key).join("|") === signature
      ? data.products
      : items.map((item) => ({
          ...item,
          lowestByCurrency: null,
        }));

  const loaded = products.every(
    (p) => p.lowestByCurrency !== null
  );

  const rows = [
    {
      name: "Brand",
      values: products.map((p) => p.brand || ""),
    },
    {
      name: "Category",
      values: products.map((p) => p.categoryName || ""),
    },
    {
      name: "Market",
      values: products.map((p) => p.market || ""),
    },
    {
      name: "Size",
      values: products.map((p) => p.quantity || ""),
    },
    ...[
      ...new Set(
        products.flatMap((p) =>
          Object.keys(p.specifications || {})
        )
      ),
    ]
      .filter((key) => key !== "Quantity")
      .map((key) => ({
        name: key,
        values: products.map((p) =>
          String(
            (p.specifications || {})[key] ?? ""
          )
        ),
      })),
  ]
    .filter((row) => row.values.some(Boolean))
    .map((row) => ({
      ...row,
      differs: new Set(row.values).size > 1,
    }));

  const visibleRows = differencesOnly
    ? rows.filter((row) => row.differs)
    : rows;

  return (
    <div className="shell page">
      <div className="page-head page-head-row">
        <div>
          <h1>Compare products</h1>

          <p className="muted">
            {products.length} products side by side
          </p>
        </div>

        <div className="page-actions">
          <label className="check">
            <input
              type="checkbox"
              checked={differencesOnly}
              onChange={(event) =>
                setDifferencesOnly(event.target.checked)
              }
            />

            <span>Show differences only</span>
          </label>

          <button
            type="button"
            className="button button-quiet"
            onClick={onClear}
          >
            Clear comparison
          </button>
        </div>
      </div>

      {state.status === "error" && (
        <Notice tone="error">
          {state.error}{" "}

          <button
            type="button"
            className="link"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Try again
          </button>
        </Notice>
      )}

      {loaded &&
        data &&
        !data.rankable &&
        products.some(
          (p) => p.lowestByCurrency.length
        ) && (
          <Notice>
            {products.some(
              (p) => !p.lowestByCurrency.length
            )
              ? "Not every product has a verified store price, so Knowly does not name a cheapest product."
              : !data.rankCurrency
                ? "These products have no verified price in a shared currency, so Knowly does not name a cheapest product. No conversion is applied."
                : "These prices come from different markets, so Knowly does not name a cheapest product. No conversion is applied."}
          </Notice>
        )}

      {loaded && data && data.sizeMismatch && (
        <Notice>
          These products come in different sizes, so their
          prices are not directly comparable.
        </Notice>
      )}

      <div className="table-wrap compare-wrap">
        <table
          className="compare"
          style={{ "--columns": products.length }}
        >
          <thead>
            <tr>
              <td />

              {products.map((product) => (
                <th key={product.key} scope="col">
                  <button
                    type="button"
                    className="icon-button compare-remove"
                    aria-label={`Remove ${product.name}`}
                    onClick={() => onRemove(product.key)}
                  >
                    <Icon name="close" size={15} />
                  </button>

                  <button
                    type="button"
                    className="compare-product"
                    onClick={() => onOpen(product)}
                  >
                    <ProductImage product={product} />

                    <span className="card-brand">
                      {product.brand || "Brand not listed"}
                    </span>

                    <span className="card-name">
                      {product.name}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            <tr className="compare-price">
              <th scope="row">Lowest price</th>

              {products.map((product) => (
                <td key={product.key}>
                  {product.lowestByCurrency === null ? (
                    <p className="loading-line">
                      {state.status === "error"
                        ? "Price lookup failed"
                        : "Checking store prices…"}
                    </p>
                  ) : (
                    <BestPriceCell
                      product={product}
                      isLowest={Boolean(
                        data &&
                        data.lowestKey === product.key
                      )}
                    />
                  )}
                </td>
              ))}
            </tr>

            {visibleRows.map((row) => (
              <tr
                key={row.name}
                className={row.differs ? "differs" : ""}
              >
                <th scope="row">
                  {row.name}
                </th>

                {row.values.map((value, index) => (
                  <td key={products[index].key}>
                    {value || (
                      <span className="muted">
                        Not listed
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}

            {visibleRows.length === 0 && (
              <tr>
                <th scope="row">Details</th>

                <td
                  colSpan={products.length}
                  className="muted"
                >
                  These products list the same details.
                </td>
              </tr>
            )}

            <tr>
              <th scope="row">All prices</th>

              {products.map((product) => (
                <td key={product.key}>
                  <button
                    type="button"
                    className="link"
                    onClick={() => onOpen(product)}
                  >
                    {loaded && product.offerCount
                      ? `See all ${product.offerCount} store prices`
                      : "Open product"}
                  </button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="fine">
        A yellow marker shows where the products differ.
      </p>
    </div>
  );
}

// -----------------------------------------------------
// AUTHENTICATION
// -----------------------------------------------------

function firstName(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)[0] || "there";
}

function checkForm(register, form) {
  const fields = {};

  if (register && form.name.trim().length < 2) {
    fields.name = "Enter your name.";
  }

  if (!form.email.trim()) {
    fields.email = "Enter your email address.";
  } else if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(
      form.email.trim()
    )
  ) {
    fields.email =
      "Enter a valid email address, like name@example.com.";
  }

  if (!form.password) {
    fields.password = "Enter your password.";
  } else if (
    register &&
    form.password.length < 8
  ) {
    fields.password = "Use at least 8 characters.";
  } else if (
    register &&
    (!/[A-Za-z]/.test(form.password) ||
      !/[0-9]/.test(form.password))
  ) {
    fields.password =
      "Use at least one letter and one number.";
  }

  return fields;
}

function AuthPage({
  mode,
  next,
  user,
  onSignedIn,
  onLogout,
}) {
  const register = mode === "register";

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [showPassword, setShowPassword] =
    useState(false);

  const [state, setState] = useState({
    busy: false,
    error: "",
    fields: {},
  });

  const formRef = useRef(null);

  const set = (name) => (event) => {
    const value = event.target.value;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));

    if (state.fields[name]) {
      setState((current) => ({
        ...current,
        fields: {
          ...current.fields,
          [name]: "",
        },
      }));
    }
  };

  function focusFirstError(fields) {
    const first = [
      "name",
      "email",
      "password",
    ].find((name) => fields[name]);

    if (first) {
      formRef.current
        ?.querySelector(`[name="${first}"]`)
        ?.focus();
    }
  }

  async function submit(event) {
    event.preventDefault();

    const fields = checkForm(register, form);

    if (Object.keys(fields).length) {
      setState({
        busy: false,
        error: "",
        fields,
      });

      focusFirstError(fields);
      return;
    }

    setState({
      busy: true,
      error: "",
      fields: {},
    });

    try {
      const data = await postJSON(
        register ? "/auth/register" : "/auth/login",
        {
          name: register
            ? form.name.trim()
            : undefined,
          email: form.email.trim(),
          password: form.password,
        }
      );

      onSignedIn(
        data.user,
        data.token,
        register
          ? `Account created. Welcome, ${firstName(data.user.name)}.`
          : `Welcome back, ${firstName(data.user.name)}.`,
        next
      );
    } catch (error) {
      const serverFields = error.fields || {};

      setState({
        busy: false,
        error: error.message,
        fields: serverFields,
      });

      focusFirstError(serverFields);
    }
  }

  const switchHref =
    `#/${register ? "login" : "register"}?next=` +
    encodeURIComponent(next);

  if (user) {
    return (
      <div className="shell auth">
        <section className="auth-card">
          <span className="avatar avatar-lg" aria-hidden="true">
            {firstName(user.name).charAt(0).toUpperCase()}
          </span>

          <h1>You are logged in</h1>

          <p className="muted">
            Logged in as <strong>{user.name}</strong> ({user.email}).
          </p>

          <div className="auth-actions">
            <a
              className="button button-primary"
              href={next}
            >
              Continue to Knowly
            </a>

            <button
              type="button"
              className="button button-quiet"
              onClick={onLogout}
            >
              Log out
            </button>
          </div>
        </section>
      </div>
    );
  }

  const errorId = (name) =>
    state.fields[name] ? `${name}-error` : undefined;

  return (
    <div className="shell auth">
      <section
        className="auth-card"
        aria-labelledby="auth-title"
      >
        <div
          className="auth-switch"
          role="group"
          aria-label="Choose an option"
        >
          <a
            href={`#/login?next=${encodeURIComponent(next)}`}
            aria-current={!register ? "page" : undefined}
          >
            Log in
          </a>

          <a
            href={`#/register?next=${encodeURIComponent(next)}`}
            aria-current={register ? "page" : undefined}
          >
            Create account
          </a>
        </div>

        <h1 id="auth-title">
          {register
            ? "Create your Knowly account"
            : "Log in to Knowly"}
        </h1>

        <p className="muted">
          {register
            ? "You only need a name, an email and a password. Browsing and comparing prices stay free without an account."
            : "Use the email and password you registered with."}
        </p>

        {state.error && (
          <Notice tone="error">
            {state.error}
          </Notice>
        )}

        <form
          ref={formRef}
          className="auth-form"
          onSubmit={submit}
          noValidate
        >
          {register && (
            <label className="field">
              <span>Full name</span>

              <input
                name="name"
                autoComplete="name"
                maxLength={150}
                value={form.name}
                onChange={set("name")}
                aria-invalid={Boolean(state.fields.name)}
                aria-describedby={errorId("name")}
              />

              {state.fields.name && (
                <small
                  className="field-error"
                  id="name-error"
                >
                  {state.fields.name}
                </small>
              )}
            </label>
          )}

          <label className="field">
            <span>Email</span>

            <input
              name="email"
              type="email"
              inputMode="email"
              autoComplete={
                register ? "email" : "username"
              }
              maxLength={255}
              value={form.email}
              onChange={set("email")}
              aria-invalid={Boolean(state.fields.email)}
              aria-describedby={errorId("email")}
            />

            {state.fields.email && (
              <small
                className="field-error"
                id="email-error"
              >
                {state.fields.email}
              </small>
            )}
          </label>

          <div className="field">
            <label htmlFor="auth-password">
              Password
            </label>

            <div className="password">
              <input
                id="auth-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={
                  register
                    ? "new-password"
                    : "current-password"
                }
                maxLength={200}
                value={form.password}
                onChange={set("password")}
                aria-invalid={Boolean(state.fields.password)}
                aria-describedby={
                  [
                    errorId("password"),
                    register ? "password-hint" : null,
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined
                }
              />

              <button
                type="button"
                className="password-toggle"
                aria-controls="auth-password"
                aria-pressed={showPassword}
                onClick={() =>
                  setShowPassword((shown) => !shown)
                }
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>

            {state.fields.password && (
              <small
                className="field-error"
                id="password-error"
              >
                {state.fields.password}
              </small>
            )}

            {register && (
              <small
                className="field-hint"
                id="password-hint"
              >
                At least 8 characters, with a letter and a number.
              </small>
            )}
          </div>

          <button
            type="submit"
            className="button button-primary auth-submit"
            disabled={state.busy}
          >
            {state.busy
              ? register
                ? "Creating account…"
                : "Logging in…"
              : register
                ? "Create account"
                : "Log in"}
          </button>
        </form>

        <p className="auth-alt">
          {register
            ? "Already have an account?"
            : "New to Knowly?"}{" "}
          <a href={switchHref}>
            {register
              ? "Log in"
              : "Create an account"}
          </a>
        </p>
      </section>
    </div>
  );
}

// -----------------------------------------------------
// ACCOUNT MENU
// -----------------------------------------------------

function AccountMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useDismiss(open, setOpen, box);

  const first = firstName(user.name);

  return (
    <div className="menu-wrap" ref={box}>
      <button
        type="button"
        className="account-button"
        aria-expanded={open}
        aria-controls="account-menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="avatar" aria-hidden="true">
          {first.charAt(0).toUpperCase()}
        </span>

        <span className="nav-label">
          {first}
        </span>
      </button>

      {open && (
        <div className="menu menu-account" id="account-menu">
          <p>
            <strong>{user.name}</strong>
            <span className="sub">{user.email}</span>
          </p>

          <button
            type="button"
            className="button button-quiet"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------
// CATEGORY MENU
// -----------------------------------------------------

function CategoryMenu({ current }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useDismiss(open, setOpen, box);

  return (
    <div className="menu-wrap" ref={box}>
      <button
        type="button"
        className="nav-link"
        aria-expanded={open}
        aria-controls="category-menu"
        onClick={() => setOpen((value) => !value)}
      >
        Categories
        <Icon name="chevron" size={15} />
      </button>

      {open && (
        <ul className="menu" id="category-menu">
          {CATEGORIES.map((category) => (
            <li key={category.slug}>
              <a
                href={searchHash("", category.slug)}
                aria-current={
                  current === category.slug
                    ? "page"
                    : undefined
                }
                onClick={() => setOpen(false)}
              >
                <Icon name={category.slug} size={18} />
                {category.name}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// -----------------------------------------------------
// MAIN APP
// -----------------------------------------------------

export default function App() {
  const [route, setRoute] = useState(parseRoute);
  const [compare, setCompare] = useState(readStoredCompare);
  const [opened, setOpened] = useState(null);
  const [toast, setToast] = useState("");

  const [meta, setMeta] = useState({
    retailers: [],
    currencies: [],
    keyRequired: false,
  });

  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(
    () => !getToken()
  );

  // RESTORE LOGIN

  useEffect(() => {
    if (!getToken()) return;

    request("/auth/me", { auth: true })
      .then((data) => setUser(data.user))
      .catch((error) => {
        if (error.status === 401) {
          setToken("");
        }
      })
      .finally(() => setAuthReady(true));
  }, []);

  // ROUTING

  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute());
      setOpened(null);
      window.scrollTo(0, 0);
    };

    window.addEventListener("hashchange", onChange);

    return () =>
      window.removeEventListener("hashchange", onChange);
  }, []);

  // RETAILER CONFIGURATION

  useEffect(() => {
    request("/retailers")
      .then(setMeta)
      .catch(() => {});
  }, []);

  // SAVE COMPARISON SELECTION

  useEffect(() => {
    try {
      sessionStorage.setItem(
        "knowly-compare",
        JSON.stringify(compare)
      );
    } catch {
      // Private browsing.
    }
  }, [compare]);

  // TOAST

  useEffect(() => {
    if (!toast) return undefined;

    const timer = setTimeout(
      () => setToast(""),
      4000
    );

    return () => clearTimeout(timer);
  }, [toast]);

  const compareKeys = useMemo(
    () => new Set(compare.map((item) => item.key)),
    [compare]
  );

  const go = useCallback((hash) => {
    if (window.location.hash === hash) {
      setRoute(parseRoute());
      setOpened(null);
    } else {
      window.location.hash = hash;
    }
  }, []);

  const search = useCallback(
    (q, c) => go(searchHash(q, c)),
    [go]
  );

  const toggleCompare = useCallback(
    (product) => {
      if (
        compare.some((item) => item.key === product.key)
      ) {
        setCompare(
          compare.filter(
            (item) => item.key !== product.key
          )
        );
      } else if (compare.length >= MAX_COMPARE) {
        setToast(
          `You can compare up to ${MAX_COMPARE} products. Remove one first.`
        );
      } else {
        setCompare([...compare, product]);
      }
    },
    [compare]
  );

  const closePanel = useCallback(
    () => setOpened(null),
    []
  );

  const signedIn = useCallback(
    (account, token, message, next) => {
      setToken(token);
      setUser(account);
      setAuthReady(true);
      setToast(message);
      go(safeNext(next));
    },
    [go]
  );

  const logout = useCallback(() => {
    setToken("");
    setUser(null);
    setToast("You are logged out.");

    request("/auth/logout", {
      method: "POST",
    }).catch(() => {});
  }, []);

  const loginHref =
    `#/login?next=${encodeURIComponent(
      route.page === "auth"
        ? route.next
        : window.location.hash || "#/"
    )}`;

  const showHeaderSearch = route.page !== "home";

  return (
    <div className="app">
      <a className="skip" href="#main">
        Skip to content
      </a>

      {/* HEADER */}

      <header
        className={`topbar ${
          showHeaderSearch ? "has-search" : ""
        }`}
      >
        <div className="shell topbar-inner">
          <a
            className="logo"
            href="#/"
            aria-label="Knowly home"
          >
            knowly
          </a>

          {showHeaderSearch && (
            <div className="topbar-search">
              <SearchBar
                key={`${route.page}|${route.c}|${route.q}`}
                initialQuery={route.q}
                initialCategory={route.c}
                onSearch={search}
              />
            </div>
          )}

          <nav className="topbar-nav" aria-label="Main">
            <CategoryMenu current={route.c} />

            <a
              className="nav-link"
              href="#/compare"
              aria-current={
                route.page === "compare"
                  ? "page"
                  : undefined
              }
              aria-label={`Compare${
                compare.length
                  ? `, ${compare.length} selected`
                  : ""
              }`}
            >
              <Icon name="compare" size={17} />

              <span className="nav-label">
                Compare
              </span>

              {compare.length > 0 && (
                <span className="count">
                  {compare.length}
                </span>
              )}
            </a>

            {authReady &&
              (user ? (
                <AccountMenu
                  user={user}
                  onLogout={logout}
                />
              ) : (
                route.page !== "auth" && (
                  <a
                    className="nav-link nav-login"
                    href={loginHref}
                    aria-label="Log in"
                  >
                    <Icon name="user" size={17} />
                    <span className="nav-label">
                      Log in
                    </span>
                  </a>
                )
              ))}
          </nav>
        </div>
      </header>

      {/* MAIN CONTENT */}

      <main id="main">
        {route.page === "home" && (
          <Home
            onSearch={search}
            onOpen={setOpened}
            compareKeys={compareKeys}
            onToggleCompare={toggleCompare}
          />
        )}

        {route.page === "search" && (
          <Results
            route={route}
            onSearch={search}
            onOpen={setOpened}
            compareKeys={compareKeys}
            onToggleCompare={toggleCompare}
          />
        )}

        {route.page === "auth" && (
          <AuthPage
            key={route.mode}
            mode={route.mode}
            next={route.next}
            user={authReady ? user : null}
            onSignedIn={signedIn}
            onLogout={logout}
          />
        )}

        {route.page === "compare" && (
          <Compare
            items={compare}
            onRemove={(key) =>
              setCompare((current) =>
                current.filter(
                  (item) => item.key !== key
                )
              )
            }
            onClear={() => setCompare([])}
            onOpen={setOpened}
            onBrowse={() => go("#/")}
          />
        )}
      </main>

      {/* FOOTER */}

      <footer className="footer">
        <div className="shell footer-inner">
          <span className="logo">
            knowly
          </span>

          <div>
            <p className="fine">
              Prices are for reference and can change.
              Confirm with the store before you buy.
              Knowly is not affiliated with the stores
              or brands shown.
            </p>

            <p className="fine">
              Sources:{" "}
              <a
                href="https://lebtechlb.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                LebTech
              </a>{" "}
              (Lebanese electronics listings),{" "}
              <a
                href="https://world.openfoodfacts.org"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Food Facts
              </a>{" "}
              and{" "}
              <a
                href="https://world.openbeautyfacts.org"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Beauty Facts
              </a>{" "}
              (product details),{" "}
              <a
                href="https://prices.openfoodfacts.org"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Prices
              </a>{" "}
              (shopper-reported prices, Open Database License),{" "}
              <a
                href="https://speero.net"
                target="_blank"
                rel="noopener noreferrer"
              >
                Speero
              </a>{" "}
              (automotive).
            </p>
          </div>
        </div>
      </footer>

      {/* COMPARISON TRAY */}

      {compare.length > 0 &&
        route.page !== "compare" &&
        route.page !== "auth" &&
        !opened && (
          <div
            className="tray"
            role="region"
            aria-label="Comparison"
          >
            <span className="tray-count">
              {compare.length} of {MAX_COMPARE} selected
            </span>

            <ul>
              {compare.map((item) => (
                <li key={item.key}>
                  <ProductImage product={item} />

                  <span className="tray-name">
                    {item.name}
                  </span>

                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remove ${item.name}`}
                    onClick={() => toggleCompare(item)}
                  >
                    <Icon name="close" size={14} />
                  </button>
                </li>
              ))}
            </ul>

            <a
              className={`button button-primary ${
                compare.length < 2 ? "is-disabled" : ""
              }`}
              href="#/compare"
              aria-disabled={compare.length < 2}
              onClick={(event) =>
                compare.length < 2 &&
                event.preventDefault()
              }
            >
              {compare.length < 2
                ? "Pick one more"
                : "Compare now"}
            </a>
          </div>
        )}

      {/* PRODUCT PANEL */}

      {opened && (
        <ProductPanel
          product={opened}
          meta={meta}
          selected={compareKeys.has(opened.key)}
          onToggleCompare={toggleCompare}
          onClose={closePanel}
        />
      )}

      {/* TOAST */}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
