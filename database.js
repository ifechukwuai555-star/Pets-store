import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn(
    "DATABASE_URL is not set. The server will not be able to connect to PostgreSQL."
  );
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,

  max: 10,

  idleTimeoutMillis: 30_000,

  connectionTimeoutMillis: 10_000
});

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function initializeDatabase() {
  // Required for gen_random_uuid()
  await query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
  `);

  // Owner account
  await query(`
    CREATE TABLE IF NOT EXISTS owners (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Pets
  await query(`
    CREATE TABLE IF NOT EXISTS pets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      category VARCHAR(50) NOT NULL,
      description TEXT NOT NULL,
      price NUMERIC(12, 2) NOT NULL DEFAULT 0,
      image_url TEXT,
      likes INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Customer inquiries
  await query(`
    CREATE TABLE IF NOT EXISTS inquiries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      phone VARCHAR(40) NOT NULL,
      email VARCHAR(150),
      pet VARCHAR(150) NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Customer orders
  await query(`
    CREATE TABLE IF NOT EXISTS orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      phone VARCHAR(40) NOT NULL,
      email VARCHAR(150),
      items TEXT NOT NULL,
      address TEXT NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  console.log("Pet Store database initialized successfully.");
}

export async function closeDatabase() {
  await pool.end();
}

export default pool;
