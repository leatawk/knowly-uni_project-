// =====================================================
// PRODUCT MODEL
//
// Owns the list and detail queries against
// public.products. Every query is parameterised, which is
// what keeps Knowly safe from SQL injection.
//
// Table: public.products
//   id, name, description, brand_id, category_id,
//   image_url, barcode, specifications (jsonb),
//   source_type, source_name, external_id, product_url,
//   country_of_origin, created_at, updated_at
// =====================================================

const db = require("../db");

// Builds the WHERE clause shared by the count and the page,
// so both always filter in exactly the same way.
function buildFilter({ search, category }) {
  const values = [];
  const conditions = [];

  if (search) {
    values.push(`%${search}%`);

    conditions.push(`
      (
        p.name ILIKE $${values.length}
        OR p.description ILIKE $${values.length}
      )
    `);
  }

  if (category) {
    values.push(category);

    // The category itself, or any of its subcategories.
    conditions.push(`
      p.category_id IN (
        SELECT id
        FROM public.categories
        WHERE slug = $${values.length}

        UNION

        SELECT id
        FROM public.categories
        WHERE parent_id IN (
          SELECT id
          FROM public.categories
          WHERE slug = $${values.length}
        )
      )
    `);
  }

  return {
    values,
    where: conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : ""
  };
}

async function count(filter) {
  const { values, where } = buildFilter(filter);

  const result = await db.pool.query(
    `
    SELECT COUNT(*)::int AS total
    FROM public.products p
    ${where}
    `,
    values
  );

  return result.rows[0].total;
}

async function findPage(filter, { limit, offset }) {
  const { values, where } = buildFilter(filter);

  const result = await db.pool.query(
    `
    SELECT
      p.*,
      b.name AS brand_name,
      c.name AS category_name,
      c.slug AS category_slug
    FROM public.products p
    LEFT JOIN public.brands b
      ON b.id = p.brand_id
    LEFT JOIN public.categories c
      ON c.id = p.category_id
    ${where}
    ORDER BY p.created_at DESC
    LIMIT $${values.length + 1}
    OFFSET $${values.length + 2}
    `,
    [...values, limit, offset]
  );

  return result.rows;
}

async function findById(id) {
  const result = await db.pool.query(
    `
    SELECT
      p.*,
      b.name AS brand_name,
      c.name AS category_name
    FROM public.products p
    LEFT JOIN public.brands b
      ON b.id = p.brand_id
    LEFT JOIN public.categories c
      ON c.id = p.category_id
    WHERE p.id = $1
    `,
    [id]
  );

  return result.rows[0] || null;
}

// True when a product id exists. Used before saving a
// product reference to a wishlist or a comparison.
async function exists(id) {
  const result = await db.pool.query(
    `
    SELECT id
    FROM public.products
    WHERE id = $1
    `,
    [id]
  );

  return result.rows.length > 0;
}

// Names for several ids at once, so building a comparison
// title needs one query instead of one per product.
async function findNamesByIds(ids) {
  const result = await db.pool.query(
    `
    SELECT id, name
    FROM public.products
    WHERE id = ANY($1::bigint[])
    `,
    [ids]
  );

  return result.rows;
}

// The column list the website uses for a saved product,
// with its brand, category and parent category.
const SAVED_SELECT = `
  SELECT
    p.id,
    p.name,
    p.description,
    p.image_url,
    p.barcode,
    p.specifications,
    p.source_name,
    p.external_id,
    p.product_url,
    b.name AS brand_name,
    c.slug AS category_slug,
    pc.slug AS parent_slug
  FROM public.products p
  LEFT JOIN public.brands b
    ON b.id = p.brand_id
  LEFT JOIN public.categories c
    ON c.id = p.category_id
  LEFT JOIN public.categories pc
    ON pc.id = c.parent_id
`;

async function findSavedById(productId) {
  const result = await db.pool.query(
    `${SAVED_SELECT} WHERE p.id = $1`,
    [productId]
  );

  return result.rows;
}

async function findSavedByIds(ids) {
  const result = await db.pool.query(
    `${SAVED_SELECT} WHERE p.id = ANY($1::bigint[])`,
    [ids]
  );

  return result.rows;
}

// Saved products filtered by search term and category,
// most recently updated first.
async function findSavedList({ term, category, limit }) {
  const values = [];
  const where = [];

  if (term) {
    values.push(`%${term}%`);

    where.push(
      `(p.name ILIKE $${values.length} OR b.name ILIKE $${values.length})`
    );
  }

  if (category) {
    values.push(category);

    where.push(
      `(c.slug = $${values.length} OR pc.slug = $${values.length})`
    );
  }

  values.push(limit);

  const result = await db.pool.query(
    `${SAVED_SELECT}
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY p.updated_at DESC NULLS LAST, p.id DESC
     LIMIT $${values.length}`,
    values
  );

  return result.rows;
}

// Saved products inside one main category (or any of its
// subcategories) whose name or brand matches a term. Used
// as a fallback when an external provider is unavailable.
async function searchInCategory(categorySlug, term, limit = 12) {
  const result = await db.pool.query(
    `
    SELECT
      p.id,
      p.name,
      p.barcode,
      p.image_url,
      p.description,
      p.specifications,
      b.name AS brand_name,
      c.name AS category_name,
      p.source_name
    FROM public.products p
    LEFT JOIN public.brands b
      ON b.id = p.brand_id
    JOIN public.categories c
      ON c.id = p.category_id
    WHERE (
            c.slug = $1
            OR c.parent_id = (
                 SELECT id
                 FROM public.categories
                 WHERE slug = $1
                 LIMIT 1
               )
          )
      AND (
            p.name ILIKE $2
            OR b.name ILIKE $2
          )
    ORDER BY p.name
    LIMIT $3
    `,
    [categorySlug, `%${term}%`, limit]
  );

  return result.rows;
}

module.exports = {
  SAVED_SELECT,
  searchInCategory,
  count,
  findPage,
  findById,
  exists,
  findNamesByIds,
  findSavedById,
  findSavedByIds,
  findSavedList
};
