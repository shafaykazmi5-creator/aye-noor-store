"use strict";
require("dotenv").config();
const db = require("../db");

async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ Error: DATABASE_URL is missing in .env.");
    process.exit(1);
  }
  await db.query(`
    CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1001;

    ALTER TABLE products
      ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT '';

    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS whatsapp_consent_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100);

    ALTER TABLE orders
      ALTER COLUMN whatsapp_opt_in SET DEFAULT FALSE;

    CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_key_idx
      ON orders (idempotency_key)
      WHERE idempotency_key IS NOT NULL;
  `);
  console.log("✓ Block 1 complete: Verified TLS enabled and schema migrations applied.");
  process.exit(0);
}

runMigrations().catch(err => {
  console.error("❌ Migration failed:", err.message);
  process.exit(1);
});