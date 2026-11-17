// =====================================================
// KNOWLY - DATABASE SETUP (one click, safe to repeat)
//
// Run from the knowly folder:   npm run db:setup
// (or from the server folder:   npm run db:setup)
//
// 1. Adds an AUTH_SECRET line to server/.env if there is none.
// 2. Creates the database named in DB_NAME if it does not exist.
// 3. Runs database/schema.sql (only CREATE ... IF NOT EXISTS and
//    INSERT ... ON CONFLICT DO NOTHING).
// 4. Runs the safe additions in database/migrations.js.
//
// It never drops, deletes or changes existing tables or data,
// so it is safe on a database that already has products.
// =====================================================

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const ENV_FILE = path.join(__dirname, "..", ".env");
const SCHEMA_FILE = path.join(__dirname, "..", "database", "schema.sql");

require("dotenv").config({ path: ENV_FILE });

const { Client } = require("pg");

function line(mark, text) {
  console.log(`  [${mark}] ${text}`);
}

function stop(text, fix) {
  line("FAIL", text);
  if (fix) console.log(`         Fix: ${fix}`);
  console.log("\nSetup stopped. Fix the line above, then run it again.\n");
  process.exitCode = 1;
}

function settings(database) {
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database,
    connectionTimeoutMillis: 8000
  };
}

// ---------- 1. Login secret ----------
function ensureSecret() {
  const text = fs.readFileSync(ENV_FILE, "utf8");
  const match = text.match(/^\s*AUTH_SECRET\s*=\s*(.*)$/m);

  if (match && match[1].trim().length >= 32) {
    line("OK  ", "AUTH_SECRET is already set");
    return;
  }

  if (match) {
    line("NOTE", "AUTH_SECRET is shorter than 32 characters; left unchanged. Replace it with a longer one.");
    return;
  }

  const secret = crypto.randomBytes(48).toString("hex");
  const separator = text.length && !text.endsWith("\n") ? "\n" : "";
  fs.appendFileSync(ENV_FILE, `${separator}AUTH_SECRET=${secret}\n`);
  process.env.AUTH_SECRET = secret;
  line("OK  ", "AUTH_SECRET added to server/.env (logins now survive restarts)");
}

// ---------- 2. Database ----------
async function databaseExists(name) {
  const direct = new Client(settings(name));
  try {
    await direct.connect();
    return true;
  } catch (error) {
    // 3D000 = database does not exist
    if (error.code === "3D000") return false;
    throw error;
  } finally {
    await direct.end().catch(() => {});
  }
}

async function createDatabase(name) {
  const admin = new Client(settings("postgres"));
  await admin.connect();
  try {
    const found = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (found.rowCount === 0) {
      // A database name cannot be a query parameter, so it is quoted safely instead.
      await admin.query(`CREATE DATABASE ${admin.escapeIdentifier(name)}`);
    }
  } finally {
    await admin.end().catch(() => {});
  }
}

async function main() {
  console.log("\nKnowly database setup\n");

  if (!fs.existsSync(ENV_FILE)) {
    return stop(
      "server/.env not found",
      "copy server/.env.example to server/.env and fill in your PostgreSQL password"
    );
  }

  const missing = ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD"].filter(
    name => !process.env[name]
  );
  if (missing.length) {
    return stop(`missing in server/.env: ${missing.join(", ")}`, "see server/.env.example");
  }

  ensureSecret();

  const name = process.env.DB_NAME;

  let exists;
  try {
    exists = await databaseExists(name);
  } catch (error) {
    return stop(
      `cannot connect to PostgreSQL: ${error.message}`,
      "start PostgreSQL (Windows: Services > postgresql-x64-18) and check DB_PASSWORD in server/.env"
    );
  }

  if (exists) {
    line("OK  ", `database ${name} already exists (kept as it is)`);
  } else {
    try {
      await createDatabase(name);
      line("OK  ", `database ${name} created`);
    } catch (error) {
      return stop(
        `could not create database ${name}: ${error.message}`,
        `create it in pgAdmin (right-click Databases > Create > Database, name: ${name})`
      );
    }
  }

  const client = new Client(settings(name));
  await client.connect();
  try {
    const encoding = await client.query("SHOW server_encoding");
    const value = encoding.rows[0].server_encoding;
    if (value === "UTF8") {
      line("OK  ", "text encoding is UTF8");
    } else {
      line("NOTE", `text encoding is ${value}; Arabic product names need UTF8`);
    }

    await client.query(fs.readFileSync(SCHEMA_FILE, "utf8"));
    line("OK  ", "tables, categories and data sources are in place (schema.sql)");
  } catch (error) {
    return stop(`schema.sql failed: ${error.message}`, "send this message to your developer");
  } finally {
    await client.end().catch(() => {});
  }

  const db = require("../db");
  try {
    await require("../database/migrations").ensureTables();
    line("OK  ", "saved comparisons table is in place");
  } catch (error) {
    return stop(`extra tables failed: ${error.message}`);
  } finally {
    await db.pool.end().catch(() => {});
  }

  console.log("\nDone. Next: npm run check, then npm start\n");
}

main().catch(error => {
  stop(error.message);
});
