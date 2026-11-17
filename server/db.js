// =====================================================
// POSTGRESQL CONNECTION POOL
//
// One shared pool for the whole application. Connection
// details come from config/env.js, so they can change
// between a laptop and a managed cloud database without
// touching any query.
// =====================================================

const { Pool } = require("pg");
const config = require("./config/env");

const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  user: config.database.user,
  password: config.database.password
});

// A connection that dies in the background must not bring
// the whole server down.
pool.on("error", error => {
  console.error(
    "Unexpected PostgreSQL pool error:",
    error.message
  );
});

async function testConnection() {
  const result = await pool.query(
    "SELECT NOW() AS current_time"
  );

  return result.rows[0];
}

module.exports = {
  pool,
  testConnection
};
