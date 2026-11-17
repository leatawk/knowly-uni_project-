// =====================================================
// WISHLIST MODEL
//
// Owns every query against public.wishlists.
//
// Table: public.wishlists
//   id, user_id, product_id, created_at
//   UNIQUE (user_id, product_id)
// =====================================================

const db = require("../db");

async function findProductIds(userId) {
  const result = await db.pool.query(
    `
    SELECT product_id
    FROM public.wishlists
    WHERE user_id = $1
    ORDER BY created_at DESC, id DESC
    `,
    [userId]
  );

  return result.rows.map(row => String(row.product_id));
}

async function countForUser(userId) {
  const result = await db.pool.query(
    `
    SELECT COUNT(*)::int AS total
    FROM public.wishlists
    WHERE user_id = $1
    `,
    [userId]
  );

  return result.rows[0].total;
}

// UNIQUE (user_id, product_id) means saving the same product
// twice changes nothing, so this is safe to retry.
async function add(userId, productId) {
  await db.pool.query(
    `
    INSERT INTO public.wishlists (user_id, product_id)
    VALUES ($1, $2)
    ON CONFLICT (user_id, product_id) DO NOTHING
    `,
    [userId, productId]
  );
}

async function remove(userId, productId) {
  await db.pool.query(
    `
    DELETE FROM public.wishlists
    WHERE user_id = $1
      AND product_id = $2
    `,
    [userId, productId]
  );
}

module.exports = {
  findProductIds,
  countForUser,
  add,
  remove
};
