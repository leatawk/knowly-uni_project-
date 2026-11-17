// =====================================================
// KNOWLY - BACKEND CHECK
//
// Run from the knowly folder:   npm run check
// (or from the server folder:   npm run check)
//
// Checks, in order: settings in server/.env, the PostgreSQL
// connection, the tables, the categories, and each external
// data source (one small request each). Nothing is changed
// except adding the saved_comparisons table if it is missing.
// =====================================================

const path = require("path");
const fs = require("fs");

const ENV_FILE = path.join(__dirname, "..", ".env");
require("dotenv").config({ path: ENV_FILE });

const results = [];

function report(ok, title, detail = "", fix = "") {
  results.push({ ok, title });
  const mark = ok === true ? "OK  " : ok === "warn" ? "NOTE" : "FAIL";
  console.log(`  [${mark}] ${title}${detail ? ` - ${detail}` : ""}`);
  if (fix && ok !== true) console.log(`         Fix: ${fix}`);
}

async function step(title, action, fix) {
  try {
    const detail = await action();
    report(true, title, detail || "");
    return true;
  } catch (error) {
    report(false, title, error.message, fix);
    return false;
  }
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`no answer within ${ms / 1000} seconds`)), ms);
    })
  ]).finally(() => clearTimeout(timer));
}

async function main() {
  console.log("\nKnowly backend check\n");

  // ---------- 1. Settings ----------
  console.log("Settings (server/.env)");

  if (!fs.existsSync(ENV_FILE)) {
    report(false, "server/.env exists", "", "copy server/.env.example to server/.env and fill it in");
  } else {
    report(true, "server/.env exists");
  }

  const missing = ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD"].filter(
    name => !process.env[name]
  );

  report(
    missing.length === 0,
    "Database settings",
    missing.length ? `missing: ${missing.join(", ")}` : `${process.env.DB_NAME} on ${process.env.DB_HOST}:${process.env.DB_PORT}`,
    "add the missing lines to server/.env (see server/.env.example)"
  );

  const secret = String(process.env.AUTH_SECRET || "");
  report(
    secret.length >= 32 ? true : "warn",
    "Login secret (AUTH_SECRET)",
    secret.length >= 32 ? "set" : "not set: logins end whenever the server restarts",
    `add AUTH_SECRET to server/.env. Create one with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
  );

  if (missing.length) return finish();

  // ---------- 2. Database ----------
  console.log("\nDatabase");

  const db = require("../db");

  const connected = await step(
    "Connect to PostgreSQL",
    async () => {
      const result = await withTimeout(db.pool.query("SELECT version() AS v"), 8000);
      return result.rows[0].v.split(",")[0];
    },
    "start PostgreSQL (Windows: Services > postgresql) and check DB_PASSWORD in server/.env"
  );

  if (connected) {
    const migrations = require("../database/migrations");
    await migrations.ensureTables().catch(() => {});

    const expected = [
      "brands", "categories", "products", "product_variants", "stores",
      "data_sources", "offers", "price_history", "app_users", "wishlists",
      "saved_comparisons"
    ];

    const found = await db.pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    );
    const names = new Set(found.rows.map(row => row.table_name));
    const absent = expected.filter(name => !names.has(name));

    report(
      absent.length === 0,
      `Tables (${expected.length})`,
      absent.length ? `missing: ${absent.join(", ")}` : "all present",
      "run server/database/schema.sql in pgAdmin (Query Tool) on the knowly_dev database"
    );

    if (!absent.length) {
      const categories = await db.pool.query(
        "SELECT COUNT(*) FILTER (WHERE parent_id IS NULL)::int AS main, COUNT(*)::int AS total FROM public.categories"
      );
      const { main, total } = categories.rows[0];
      report(
        main >= 5 ? true : false,
        "Categories",
        `${main} main, ${total - main} subcategories`,
        "run the categories part of server/database/schema.sql"
      );

      const counts = await db.pool.query(`
        SELECT
          (SELECT COUNT(*)::int FROM public.products) AS products,
          (SELECT COUNT(*)::int FROM public.offers) AS offers,
          (SELECT COUNT(*)::int FROM public.price_history) AS history,
          (SELECT COUNT(*)::int FROM public.app_users) AS users
      `);
      const c = counts.rows[0];
      report(true, "Saved data", `${c.products} products, ${c.offers} store offers, ${c.history} price records, ${c.users} accounts`);
    }
  }

  // ---------- 3. Data sources ----------
  console.log("\nData sources (one small request each)");

  const sources = [
    ["Lebanese electronics prices (LebTech)", async () => {
      const list = await require("../services/lebtech").searchProducts("iphone");
      return `${list.length} products found for "iphone"`;
    }],
    ["Grocery product details (Open Food Facts)", async () => {
      const product = await require("../services/openFoodFacts").getProductByBarcode("3017620422003");
      if (!product) throw new Error("test product not found");
      return `found "${product.name}"`;
    }],
    ["Beauty product details (Open Beauty Facts)", async () => {
      const list = await require("../services/openBeautyFacts").searchProducts("cerave");
      return `${list.length} products found for "cerave"`;
    }],
    ["Shopper-reported prices (Open Prices)", async () => {
      const prices = await require("../services/openPrices").getLebanesePrices("3017620422003");
      return prices.length
        ? `${prices.length} Lebanese shop price(s) for Nutella 400 g`
        : "reachable (no Lebanese price for the test product yet, which is normal)";
    }],
    ["Automotive parts (Speero)", async () => {
      const list = await require("../services/automotive").searchProducts("brake pads");
      return `${list.length} parts found for "brake pads"`;
    }]
  ];

  for (const [title, action] of sources) {
    await step(
      title,
      () => withTimeout(action(), 25000),
      "check your internet connection; if only this source fails, it may be busy or rate limited (wait a minute and run the check again). The rest of Knowly still works."
    );
  }

  return finish();
}

function finish() {
  const failed = results.filter(r => r.ok === false).length;
  const notes = results.filter(r => r.ok === "warn").length;

  console.log(
    failed
      ? `\n${failed} problem(s) found. Fix the lines marked FAIL, then run the check again.\n`
      : `\nAll checks passed${notes ? ` (${notes} note)` : ""}. Start Knowly with: npm start\n`
  );

  // Close connections so the command ends by itself.
  setTimeout(() => process.exit(failed ? 1 : 0), 100);
}

main().catch(error => {
  console.error("\nThe check stopped unexpectedly:", error.message);
  process.exit(1);
});
