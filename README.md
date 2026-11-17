# Knowly

**Know More. Buy Smarter.**

A full-stack product discovery and price comparison platform for
Lebanon. Knowly lets you search products across five categories,
see real retailer prices, compare products side by side and track
how prices change.

Knowly always separates **product information** (what a product
is) from **retailer price information** (what a shop actually
charges). Finding a product in an international database does not
prove a Lebanese shop sells it.

---

## 1. Requirements

| Software | Version |
|---|---|
| Node.js | 18 or newer (22 recommended) |
| PostgreSQL | 14 or newer |
| npm | comes with Node.js |

---

## 2. Setup

### Step 1 - Create the database

In pgAdmin or `psql`, create a database called `knowly_dev`, then
load the schema:

```
psql -U postgres -d knowly_dev -f server/database/schema.sql
```

This creates the ten tables and seeds the five categories with
their fifteen subcategories. The `saved_comparisons` table is
added automatically the first time the server starts.

### Step 2 - Configure the backend

```
cd server
copy .env.example .env      REM Windows
cp .env.example .env        # macOS / Linux
```

Open `server/.env` and set `DB_PASSWORD`, then replace
`ADMIN_KEY` and `AUTH_SECRET` with your own long random strings.

### Step 3 - Install and run

Two terminals:

```
cd server
npm install
npm start           # http://localhost:4000
```

```
cd client
npm install
npm run dev         # http://localhost:5173
```

Open http://localhost:5173.

### Optional - one port only

```
cd client
npm run build
```

Then set `SERVE_CLIENT=true` in `server/.env` and run
`npm start`. The whole site is served from
http://localhost:4000.

---

## 3. Testing

```
cd server
npm test            # unit + API tests
npm run test:unit   # unit tests only, no database needed
npm run test:api    # API tests only
```

The API tests are **skipped automatically** when PostgreSQL is
not reachable, so `npm test` never fails just because the
database is off.

---

## 4. Project structure

```
knowly/
├── client/                     React + Vite frontend
│   └── src/
│       ├── App.jsx             the website
│       ├── App.css
│       └── index.css
│
└── server/                     Node.js + Express backend
    ├── index.js                starts the server
    ├── app.js                  builds the Express app
    ├── db.js                   PostgreSQL connection pool
    │
    ├── config/                 configuration in one place
    │   └── env.js              every environment variable, read once
    │
    ├── routes/                 URLs and HTTP methods only
    │   ├── index.js            mounts everything under /api
    │   ├── health.routes.js
    │   ├── categories.routes.js
    │   ├── products.routes.js
    │   ├── search.routes.js
    │   ├── compare.routes.js
    │   ├── auth.routes.js
    │   ├── saved.routes.js
    │   ├── retailers.routes.js
    │   ├── external.routes.js
    │   └── tracking.routes.js
    │
    ├── controllers/            translate HTTP requests and responses
    │   ├── health.controller.js
    │   ├── categories.controller.js
    │   ├── products.controller.js
    │   ├── search.controller.js
    │   ├── compare.controller.js
    │   ├── auth.controller.js
    │   ├── saved.controller.js
    │   ├── retailers.controller.js
    │   ├── external.controller.js
    │   └── tracking.controller.js
    │
    ├── models/                 one module per database table
    │   ├── Product.js          public.products
    │   ├── Category.js         public.categories
    │   ├── Brand.js            public.brands
    │   ├── Store.js            public.stores
    │   ├── Offer.js            public.offers
    │   ├── PriceHistory.js     public.price_history
    │   ├── ProductVariant.js   public.product_variants
    │   ├── DataSource.js       public.data_sources
    │   ├── User.js             public.app_users
    │   ├── Wishlist.js         public.wishlists
    │   └── SavedComparison.js  public.saved_comparisons
    │
    ├── services/               business logic and integrations
    │   ├── catalog.js          one search across all five categories
    │   ├── normalize.js        one product shape for every provider
    │   ├── offerStore.js       offers and lowest-price summaries
    │   ├── priceTracker.js     price history
    │   ├── productRepository.js
    │   ├── lebtech.js          electronics (Lebanon)
    │   ├── openFoodFacts.js    groceries
    │   ├── openBeautyFacts.js  beauty
    │   ├── openPrices.js       shopper-reported prices
    │   ├── automotive.js       car parts (Saudi Arabia)
    │   ├── auth.js             registration, login, tokens
    │   └── saved.js            wishlist and saved comparisons
    │
    ├── middleware/             runs before and after controllers
    │   ├── asyncHandler.js     sends rejected promises to the error handler
    │   ├── securityHeaders.js
    │   ├── requestId.js        X-Request-Id + one log line per request
    │   ├── requireAdminKey.js  protects manual price submission
    │   ├── notFound.js         404
    │   └── errorHandler.js     one place for every error response
    │
    ├── validators/             checks data before it is used
    │   ├── index.js
    │   ├── common.validator.js   shared helpers
    │   ├── product.validator.js  ids, pagination, comparison ids
    │   ├── search.validator.js   search term length
    │   ├── offer.validator.js    store, price, currency, link, date
    │   └── auth.validator.js     name, email, password
    │
    ├── utils/                  reusable helpers
    │   ├── sanitize.js         text, numbers, safe links
    │   ├── dates.js            ISO 8601 UTC timestamps
    │   └── token.js            signing and reading login tokens
    │
    ├── database/
    │   ├── schema.sql
    │   └── migrations.js       only adds what is missing
    │
    └── tests/
        ├── normalizetest.js
        ├── offerstest.js
        ├── authtest.js
        ├── comparetest.js      lowest-price rules
        ├── brandtest.js        brand recovery
        └── apitest.js          the API over HTTP
```

Each layer has one job:

| Layer | Responsibility |
|---|---|
| Frontend | shows data, handles user interaction |
| Routes | connect URLs and HTTP methods to handlers |
| Controllers | translate HTTP requests and responses |
| Validators | check incoming data before it is used |
| Services | business logic and external integrations |
| Models | read and write one database table each |
| Middleware | authentication, logging, errors |
| Config | configuration and environment variables |
| Utils | small reusable helpers |

### A note on the models layer

Knowly talks to PostgreSQL through the `pg` driver with
hand-written SQL rather than an ORM such as Sequelize or
Prisma. A model here is therefore the module that owns one
table's shape and its queries, not a class with field
definitions. The table layout itself is in
`database/schema.sql`.

Two files still hold SQL of their own:
`services/catalog.js` and `services/priceTracker.js`. Both
are the write paths that save products and prices fetched
from the external providers, where the SQL sits inside a
database transaction together with the business rules. They
were left in place deliberately, because those paths can
only be tested with the live providers reachable.

## 5. API

All endpoints are under `/api`. Every response is JSON and
carries an `X-Request-Id` header.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | application and database health |
| GET | `/api/categories` | five categories and subcategories |
| GET | `/api/search?q=&category=` | one search for all categories |
| GET | `/api/products?search=&category=&page=&limit=` | saved products |
| GET | `/api/products/:id` | one saved product |
| GET | `/api/products/:id/offers` | store prices |
| GET | `/api/products/:id/price-history` | recorded price changes |
| POST | `/api/products/:id/offers` | add a verified price (needs `ADMIN_KEY`) |
| POST | `/api/products/resolve` | save a product and load its prices |
| POST | `/api/compare` | compare 2 to 5 products |
| POST | `/api/auth/register` | create an account |
| POST | `/api/auth/login` | log in |
| GET | `/api/auth/me` | current user (needs token) |
| POST | `/api/auth/logout` | log out |
| GET | `/api/saved` | wishlist and saved comparisons (needs token) |
| POST | `/api/saved/products` | add to wishlist (needs token) |
| DELETE | `/api/saved/products/:productId` | remove from wishlist (needs token) |
| POST | `/api/saved/comparisons` | save a comparison (needs token) |
| DELETE | `/api/saved/comparisons/:comparisonId` | delete a comparison (needs token) |
| GET | `/api/retailers` | retailer and currency lists |
| GET | `/api/external/...` | one provider at a time, for testing |
| POST | `/api/track/lebtech` | record new or changed prices |

Protected routes expect `Authorization: Bearer <token>`.
Manual price submission expects `x-knowly-key: <ADMIN_KEY>`.

### Status codes

| Status | Meaning in Knowly |
|---|---|
| 200 | success |
| 201 | account, offer or comparison created |
| 400 | malformed request or invalid value |
| 401 | login required, or wrong credentials or key |
| 404 | product or route not found |
| 409 | email already registered, or duplicate offer |
| 429 | too many requests |
| 500 | unexpected internal error |
| 502 | an external product data service is unavailable |

A failed operation never returns 200. The frontend checks
`response.ok`, because `fetch()` does not reject on 404 or 500.

---

## 6. Categories and data sources

| Category | Source | Market |
|---|---|---|
| Electronics | LebTech | Lebanon |
| Computers & Accessories | LebTech | Lebanon |
| Groceries & Food | Open Food Facts + Open Prices | international product data; Lebanese shopper-reported prices where available |
| Beauty & Personal Care | Open Beauty Facts | international product data |
| Automotive | Speero | Saudi Arabia |

Knowly never invents a price. When no verified offer exists it
says **"No verified store price available"**.

It also never ranks across currencies or markets. A cheapest
product is named only when **every** compared product has a
verified price in the **same currency** and the **same market**,
and no conversion is applied. Different package sizes are
flagged as not directly comparable.

Shopper-reported prices (Open Prices) are labelled as such and
are never presented as official retailer prices.

---

## 7. Security

- Secrets live in `server/.env`, which is never committed.
- Passwords are hashed; they are never stored in plain text.
- Every SQL query is parameterised.
- Manual price submission requires `ADMIN_KEY`.
- Unexpected errors are logged on the server and answered with a
  generic message, so stack traces never reach the browser.
- In production, PostgreSQL should not be reachable from the
  public internet.

---

## 8. Troubleshooting

| Problem | Fix |
|---|---|
| "The database is not reachable" | Start PostgreSQL and check `DB_*` in `server/.env` |
| Login stops working after a restart | `AUTH_SECRET` changed; log in again |
| "A valid access key is required" | Send `x-knowly-key` matching `ADMIN_KEY` |
| 502 on a search | The external provider is down or rate limiting; try again shortly |
| Frontend cannot reach the API | Check `CLIENT_ORIGIN` matches the Vite address |
| `npm test` skips 17 tests | PostgreSQL is not running; that is expected |
