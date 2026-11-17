// =====================================================
// OFFER MODEL
//
// Owns every query against public.offers: one retailer's
// price for one product variant.
//
// Table: public.offers
//   id, product_id, variant_id, store_id, data_source_id,
//   price, currency, condition, availability,
//   product_url, last_checked_at, created_at
//
// The business rules that decide WHEN to insert, update or
// record history live in services/offerStore.js. This file
// only runs the SQL.
// =====================================================

const db = require("../db");

// Shared column list, so a single offer and a batch of
// offers are always read in the same shape.
const SELECT = `
  SELECT
    o.id,
    o.product_id,
    o.price,
    o.currency,
    o."condition" AS condition,
    o.availability,
    o.product_url,
    o.last_checked_at,
    s.name AS store_name,
    s.website_url AS store_website,
    s.country AS store_country,
    v.variant_name,
    v.attributes AS variant_attributes,
    d.name AS source_name
  FROM public.offers o
  LEFT JOIN public.stores s
    ON s.id = o.store_id
  LEFT JOIN public.product_variants v
    ON v.id = o.variant_id
  LEFT JOIN public.data_sources d
    ON d.id = o.data_source_id
`;

async function findByProductId(productId) {
  const result = await db.pool.query(
    `${SELECT}
     WHERE o.product_id = $1
       AND o.price IS NOT NULL`,
    [productId]
  );

  return result.rows;
}

async function findByProductIds(productIds) {
  const result = await db.pool.query(
    `${SELECT}
     WHERE o.product_id = ANY($1::bigint[])
       AND o.price IS NOT NULL`,
    [productIds]
  );

  return result.rows;
}

// Updates an existing listing in place, inside the caller's
// transaction. product_url is only overwritten when a new
// one is supplied.
async function update(client, id, offer, price) {
  await client.query(
    `
    UPDATE public.offers
    SET
      price = $2,
      currency = $3,
      "condition" = $4,
      availability = $5,
      product_url = COALESCE($6, product_url),
      last_checked_at = $7,
      data_source_id = $8,
      variant_id = $9
    WHERE id = $1
    `,
    [
      id,
      price,
      offer.currency,
      offer.condition,
      offer.availability,
      offer.url,
      offer.checkedAt,
      offer.sourceId,
      offer.variantId || null
    ]
  );
}

async function insert(client, offer, price) {
  const result = await client.query(
    `
    INSERT INTO public.offers
      (
        product_id, variant_id, store_id, data_source_id,
        price, currency, "condition", availability,
        product_url, last_checked_at
      )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id
    `,
    [
      offer.productId,
      offer.variantId || null,
      offer.storeId,
      offer.sourceId,
      price,
      offer.currency,
      offer.condition,
      offer.availability,
      offer.url,
      offer.checkedAt
    ]
  );

  return result.rows[0].id;
}

module.exports = {
  SELECT,
  findByProductId,
  findByProductIds,
  update,
  insert
};
