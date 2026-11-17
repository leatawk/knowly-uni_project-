// =====================================================
// DATA SOURCE MODEL
//
// Owns every query against public.data_sources: the record
// of where a price came from (LebTech, Open Prices, a
// manual verified entry).
//
// Table: public.data_sources
//   id, name, source_type, description, base_url, is_active
//   UNIQUE (name)
// =====================================================

// Inserts the source, or reactivates it if it already
// exists, and returns its id. Safe to call on every sync.
async function ensure(client, name, type, description, baseUrl) {
  const result = await client.query(
    `
    INSERT INTO public.data_sources
      (name, source_type, description, base_url)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (name)
    DO UPDATE SET is_active = TRUE
    RETURNING id
    `,
    [name, type, description, baseUrl]
  );

  return result.rows[0].id;
}

module.exports = { ensure };
