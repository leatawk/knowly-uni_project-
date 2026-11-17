// =====================================================
// BRAND MODEL
//
// Owns every query against public.brands.
//
// Table: public.brands
//   id, name
//   UNIQUE (name)
// =====================================================

async function ensure(client, name) {
  if (!name) return null;

  const result = await client.query(
    `
    INSERT INTO public.brands (name)
    VALUES ($1)
    ON CONFLICT (name)
    DO UPDATE SET name = EXCLUDED.name
    RETURNING id
    `,
    [name]
  );

  return result.rows[0].id;
}

module.exports = { ensure };
