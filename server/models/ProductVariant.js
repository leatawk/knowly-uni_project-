// =====================================================
// PRODUCT VARIANT MODEL
//
// Owns every query against public.product_variants: the
// colour, storage size, SIM type or part number that makes
// two listings of the "same" product different things.
//
// Table: public.product_variants
//   id, product_id, variant_name, attributes (jsonb), sku
//
// sku holds Knowly's variant key, so one product has one
// row per real configuration.
// =====================================================

async function ensure(client, productId, variant) {
  if (!variant) return null;

  const existing = await client.query(
    `
    SELECT id
    FROM public.product_variants
    WHERE product_id = $1
      AND sku = $2
    ORDER BY id
    LIMIT 1
    `,
    [productId, variant.key]
  );

  if (existing.rows.length) {
    return existing.rows[0].id;
  }

  const inserted = await client.query(
    `
    INSERT INTO public.product_variants
      (product_id, variant_name, attributes, sku)
    VALUES ($1, $2, $3::jsonb, $4)
    RETURNING id
    `,
    [
      productId,
      variant.label,
      JSON.stringify(variant.attributes || {}),
      variant.key
    ]
  );

  return inserted.rows[0].id;
}

module.exports = { ensure };
