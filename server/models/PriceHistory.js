// =====================================================
// PRICE HISTORY MODEL
//
// Owns every query against public.price_history: one row
// per first observation or real price change.
//
// Table: public.price_history
//   id, offer_id, price, currency, recorded_at
//
// services/offerStore.js decides whether a change is worth
// recording; an unchanged price never reaches this file.
// =====================================================

const db = require("../db");

const HISTORY_LIMIT = 100;

async function record(client, offerId, price, currency, recordedAt) {
  await client.query(
    `
    INSERT INTO public.price_history
      (offer_id, price, currency, recorded_at)
    VALUES ($1, $2, $3, COALESCE($4::timestamptz, NOW()))
    `,
    [offerId, price, currency, recordedAt || null]
  );
}

// The recorded prices for one product, newest first.
async function findByProductId(productId, limit = HISTORY_LIMIT) {
  const result = await db.pool.query(
    `
    SELECT
      h.id,
      h.offer_id,
      h.price,
      h.currency,
      h.recorded_at,
      s.name AS store_name,
      o."condition" AS condition,
      v.variant_name AS variant
    FROM public.price_history h
    JOIN public.offers o
      ON o.id = h.offer_id
    LEFT JOIN public.stores s
      ON s.id = o.store_id
    LEFT JOIN public.product_variants v
      ON v.id = o.variant_id
    WHERE o.product_id = $1
    ORDER BY h.recorded_at DESC, h.id DESC
    LIMIT $2
    `,
    [productId, limit]
  );

  return result.rows;
}

module.exports = {
  HISTORY_LIMIT,
  record,
  findByProductId
};
