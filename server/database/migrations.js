// =====================================================
// KNOWLY - SAFE DATABASE ADDITIONS
//
// Runs when the server starts. It only ADDS what is
// missing (CREATE ... IF NOT EXISTS). It never drops,
// deletes or changes existing tables or data, so it is
// safe to run any number of times.
//
// The same SQL is in database/002_saved_comparisons.sql
// if you prefer to run it yourself in pgAdmin.
// =====================================================

const db = require("../db");

const STEPS = [
  `
  CREATE TABLE IF NOT EXISTS public.saved_comparisons (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL
      REFERENCES public.app_users(id)
      ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    product_ids BIGINT[] NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
  `,
  `
  CREATE INDEX IF NOT EXISTS saved_comparisons_user_idx
    ON public.saved_comparisons (user_id)
  `,
  `
  CREATE INDEX IF NOT EXISTS wishlists_user_idx
    ON public.wishlists (user_id)
  `
];

async function ensureTables() {
  for (const sql of STEPS) {
    await db.pool.query(sql);
  }
}

module.exports = {
  ensureTables
};
