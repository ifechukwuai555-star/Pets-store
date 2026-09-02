import pg from "pg";

const { Pool } = pg;


/* =========================================================
   DATABASE CONNECTION
   ========================================================= */

if (!process.env.DATABASE_URL) {
  console.warn(
    "WARNING: DATABASE_URL has not been configured yet."
  );
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  ssl:
    process.env.NODE_ENV === "production"
      ? {
          rejectUnauthorized: false
        }
      : false
});


/* =========================================================
   DATABASE QUERY HELPER
   ========================================================= */

export async function query(
  text,
  params = []
) {
  const client = await pool.connect();

  try {
    return await client.query(
      text,
      params
    );
  } finally {
    client.release();
  }
}


/* =========================================================
   CREATE DATABASE TABLES
   ========================================================= */

export async function initializeDatabase() {

  await query(`
    CREATE TABLE IF NOT EXISTS owners (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);


  await query(`
    CREATE TABLE IF NOT EXISTS pets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      price NUMERIC(12, 2) NOT NULL DEFAULT 0,
      image_url TEXT,
      likes INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);


  await query(`
    CREATE TABLE IF NOT EXISTS inquiries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      pet TEXT,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);


  await query(`
    CREATE TABLE IF NOT EXISTS orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      items TEXT NOT NULL,
      address TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);


  console.log(
    "Pet Store database tables are ready."
  );
}


/* =========================================================
   CLOSE DATABASE
   ========================================================= */

export async function closeDatabase() {
  await pool.end();
}


/* =========================================================
   DEFAULT EXPORT
   ========================================================= */

export default pool;
