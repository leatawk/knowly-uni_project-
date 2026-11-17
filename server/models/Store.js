// =====================================================
// STORE MODEL
//
// Owns every query against public.stores: the retailers a
// price can come from.
//
// Table: public.stores
//   id, name, website_url, country
//   UNIQUE (name, country)
//
// The same shop name in two countries is two stores, which
// is what keeps a Lebanese price separate from a Saudi one.
// =====================================================

async function ensure(client, name, websiteUrl, country) {
  const result = await client.query(
    `
    INSERT INTO public.stores (name, website_url, country)
    VALUES ($1, $2, $3)
    ON CONFLICT (name, country)
    DO UPDATE SET
      website_url = COALESCE(
        stores.website_url,
        EXCLUDED.website_url
      )
    RETURNING id
    `,
    [name, websiteUrl || null, country]
  );

  return result.rows[0].id;
}

module.exports = { ensure };
