// =====================================================
// HEALTH CONTROLLER
//
// Checks the application AND the database, so a hosting
// platform's health probe fails when PostgreSQL is down.
// =====================================================

const db = require("../db");

async function health(req, res) {
  const value = await db.testConnection();

  res.json({
    status: "ok",
    database: "connected",
    time: value.current_time
  });
}

module.exports = { health };
