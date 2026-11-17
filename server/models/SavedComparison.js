// =====================================================
// SAVED COMPARISON MODEL
//
// Owns every query against public.saved_comparisons.
//
// Several of these accept a `client`, so services/saved.js
// can run them inside one transaction while the SQL itself
// stays here.
//
// Table: public.saved_comparisons
//   id, user_id, name, product_ids (bigint[]), created_at
// =====================================================

const db = require("../db");

async function findForUser(userId) {
  const result = await db.pool.query(
    `
    SELECT id, name, product_ids, created_at
    FROM public.saved_comparisons
    WHERE user_id = $1
    ORDER BY created_at DESC, id DESC
    `,
    [userId]
  );

  return result.rows;
}

// Stops two browser tabs saving the same comparison twice.
async function lockForUser(client, userId) {
  await client.query(
    `
    SELECT pg_advisory_xact_lock(
      hashtext('knowly-saved-comparisons'),
      hashtext($1)
    )
    `,
    [String(userId)]
  );
}

// Finds a comparison holding exactly this set of products,
// whatever order they were chosen in.
async function findBySortedProductIds(client, userId, sortedIds) {
  const result = await client.query(
    `
    SELECT id
    FROM public.saved_comparisons
    WHERE user_id = $1
      AND (
            SELECT array_agg(x ORDER BY x)
            FROM unnest(product_ids) AS x
          ) = $2::bigint[]
    LIMIT 1
    `,
    [userId, sortedIds]
  );

  return result.rows[0] || null;
}

async function countForUser(client, userId) {
  const result = await client.query(
    `
    SELECT COUNT(*)::int AS total
    FROM public.saved_comparisons
    WHERE user_id = $1
    `,
    [userId]
  );

  return result.rows[0].total;
}

async function insert(client, userId, name, productIds) {
  await client.query(
    `
    INSERT INTO public.saved_comparisons (user_id, name, product_ids)
    VALUES ($1, $2, $3::bigint[])
    `,
    [userId, name, productIds]
  );
}

async function remove(userId, comparisonId) {
  await db.pool.query(
    `
    DELETE FROM public.saved_comparisons
    WHERE id = $1
      AND user_id = $2
    `,
    [comparisonId, userId]
  );
}

module.exports = {
  findForUser,
  lockForUser,
  findBySortedProductIds,
  countForUser,
  insert,
  remove
};
