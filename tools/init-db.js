"use strict";
require("dotenv").config();
const db = require("../db");
const { PRODUCTS } = require("../data/products-seed"); // We'll store seed data cleanly

async function initializeDatabase() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ Error: DATABASE_URL is missing in .env. Cannot initialize database.");
    process.exit(1);
  }

  console.log("Connecting to PostgreSQL database...");

  try {
    // 1. Create tables
    await db.query(`
      CREATE TABLE IF NOT EXISTS products (
        sku VARCHAR(50) PRIMARY KEY,
        slug VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(150) NOT NULL,
        category VARCHAR(100) NOT NULL,
        price NUMERIC(10, 2) NOT NULL,
        sale_price NUMERIC(10, 2) NOT NULL,
        stock INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'Active',
        featured BOOLEAN NOT NULL DEFAULT FALSE,
        scent VARCHAR(150),
        color VARCHAR(100),
        size VARCHAR(100),
        weight VARCHAR(50),
        dimensions VARCHAR(100),
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS contact_messages (
        id SERIAL PRIMARY KEY,
        reference_id VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        contact VARCHAR(150) NOT NULL,
        topic VARCHAR(100) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        order_number VARCHAR(50) UNIQUE NOT NULL,
        customer_name VARCHAR(100) NOT NULL,
        phone_e164 VARCHAR(30) NOT NULL,
        email VARCHAR(150),
        address TEXT NOT NULL,
        area VARCHAR(100),
        city VARCHAR(100) NOT NULL,
        province VARCHAR(100) NOT NULL,
        notes TEXT,
        payment_method VARCHAR(100) NOT NULL,
        subtotal NUMERIC(10, 2) NOT NULL,
        shipping_fee NUMERIC(10, 2) NOT NULL,
        total NUMERIC(10, 2) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'Pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_number VARCHAR(50) REFERENCES orders(order_number) ON DELETE CASCADE,
        sku VARCHAR(50) REFERENCES products(sku),
        product_name VARCHAR(150) NOT NULL,
        unit_price NUMERIC(10, 2) NOT NULL,
        quantity INTEGER NOT NULL,
        line_total NUMERIC(10, 2) NOT NULL
      );
    `);
    console.log("✓ Database tables created successfully.");

    // 2. Seed dummy products
    for (const p of PRODUCTS) {
      await db.query(`
        INSERT INTO products (sku, slug, name, category, price, sale_price, stock, status, featured, scent, color, size, weight, dimensions, description)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (sku) DO UPDATE SET
          name = EXCLUDED.name,
          price = EXCLUDED.price,
          sale_price = EXCLUDED.sale_price,
          stock = EXCLUDED.stock,
          status = EXCLUDED.status,
          description = EXCLUDED.description;
      `, [p.sku, p.slug, p.name, p.category, p.price, p.salePrice, p.stock, p.status, p.featured, p.scent, p.color, p.size, p.weight, p.dimensions, p.description]);
    }
    console.log(`✓ Seeded ${PRODUCTS.length} sample dummy products into PostgreSQL.`);

    process.exit(0);
  } catch (err) {
    console.error("❌ Database initialization failed:", err);
    process.exit(1);
  }
}

initializeDatabase();
