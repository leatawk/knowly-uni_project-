// =====================================================
// USER MODEL
//
// Owns every query against public.app_users.
//
// The password hash is selected only by findByEmail, which
// the login check needs. Everything shown to the browser
// goes through publicFields, so a hash can never be
// returned by accident.
//
// Table: public.app_users
//   id, name, email, password_hash, created_at
// =====================================================

const db = require("../db");

// The only user fields the website is allowed to see.
function publicFields(row) {
  if (!row) return null;

  return {
    id: String(row.id),
    name: row.name,
    email: row.email,
    memberSince: row.created_at
  };
}

// Throws a PostgreSQL 23505 unique-violation when the email
// is already registered; services/auth.js turns that into a
// 409 the browser can display.
async function create({ name, email, passwordHash }) {
  const result = await db.pool.query(
    `
    INSERT INTO public.app_users (name, email, password_hash)
    VALUES ($1, $2, $3)
    RETURNING id, name, email, created_at
    `,
    [name, email, passwordHash]
  );

  return result.rows[0];
}

// Includes password_hash: used by the login check only.
async function findByEmail(email) {
  const result = await db.pool.query(
    `
    SELECT id, name, email, password_hash, created_at
    FROM public.app_users
    WHERE LOWER(email) = $1
    ORDER BY id
    LIMIT 1
    `,
    [email]
  );

  return result.rows[0] || null;
}

async function findById(id) {
  const result = await db.pool.query(
    `
    SELECT id, name, email, created_at
    FROM public.app_users
    WHERE id = $1
    `,
    [id]
  );

  return result.rows[0] || null;
}

module.exports = {
  publicFields,
  create,
  findByEmail,
  findById
};
