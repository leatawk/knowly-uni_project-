// =====================================================
// CATEGORY MODEL
//
// Owns every query against public.categories.
//
// Knowly uses the PostgreSQL driver directly rather than an
// ORM, so a "model" here is the module that owns one
// table's shape and its queries. Nothing outside this file
// writes SQL for categories.
//
// Table: public.categories
//   id, name, slug, description, parent_id
// A row with parent_id = NULL is one of the five main
// categories; its children are the subcategories.
// =====================================================

const db = require("../db");

// The five official Knowly categories.
const MAIN_SLUGS = [
  "electronics",
  "computers-accessories",
  "groceries-food",
  "beauty-personal-care",
  "automotive"
];

// The five main categories together with their
// subcategories, main categories first.
async function findMainWithChildren() {
  const result = await db.pool.query(
    `
    SELECT id, name, slug, description, parent_id
    FROM public.categories
    WHERE slug = ANY($1)
       OR parent_id IN (
            SELECT id
            FROM public.categories
            WHERE slug = ANY($1)
          )
    ORDER BY parent_id NULLS FIRST, name ASC
    `,
    [MAIN_SLUGS]
  );

  return result.rows;
}

async function findIdBySlug(slug) {
  const result = await db.pool.query(
    `
    SELECT id
    FROM public.categories
    WHERE slug = $1
    LIMIT 1
    `,
    [slug]
  );

  return result.rows[0]?.id || null;
}

module.exports = {
  MAIN_SLUGS,
  findMainWithChildren,
  findIdBySlug
};
