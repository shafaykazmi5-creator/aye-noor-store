"use strict";
const db = require("./index");
let boundArray = null;

async function pullLatest() {
  if (!Array.isArray(boundArray)) return;
  try {
    const res = await db.query("SELECT * FROM products ORDER BY sku ASC");
    if (res.rows && res.rows.length > 0) {
      const dbItems = res.rows.map(row => ({
        sku: row.sku, slug: row.slug, name: row.name, category: row.category,
        price: Number(row.price), salePrice: Number(row.sale_price), stock: Number(row.stock),
        status: row.status, featured: Boolean(row.featured), scent: row.scent || "",
        color: row.color || "", size: row.size || "", weight: row.weight || "",
        dimensions: row.dimensions || "", description: row.description || "", imageUrl: row.image_url || ""
      }));
      boundArray.splice(0, boundArray.length, ...dbItems);
    }
  } catch (err) {
    console.warn("⚠️ PostgreSQL product sync warning:", err.message);
  }
}

async function syncProductsFromDB(productsArray) {
  boundArray = productsArray;
  await pullLatest();
  console.log(`✓ Synced ${boundArray.length} live products from PostgreSQL.`);
  setInterval(pullLatest, 15000).unref();
}

module.exports = { syncProductsFromDB, forceSyncNow: pullLatest };