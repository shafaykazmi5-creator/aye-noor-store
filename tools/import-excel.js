"use strict";
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const db = require("../db");

const args = process.argv.slice(2);
const replaceAll = args.includes("--replace");
const fileArg = args.find(a => !a.startsWith("--"));
const targetFile = fileArg
  ? path.resolve(fileArg)
  : path.join(process.cwd(), "Aye_Noor_Product_Catalog.xlsx");

const ALLOWED_STATUSES = new Set(["Active", "Draft", "Out of Stock", "Discontinued"]);

function slugify(text, fallbackSku) {
  const base = String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || String(fallbackSku).toLowerCase();
}

function parsePositivePrice(val) {
  if (val === undefined || val === null || String(val).trim() === "") return NaN;
  const num = Number(String(val).replace(/,/g, "").trim());
  return Number.isFinite(num) && num > 0 ? num : NaN;
}

function resolveLocalImage(rawPath, sku) {
  const cleaned = String(rawPath || "").trim().replace(/^file:\/\/\//i, "").replace(/\//g, "\\");
  if (!cleaned) return "";
  try {
    if (fs.existsSync(cleaned)) {
      const uploadDir = path.join(process.cwd(), "public", "uploads", "products");
      fs.mkdirSync(uploadDir, { recursive: true });
      const ext = path.extname(cleaned) || ".jpg";
      const fileName = `${sku.toLowerCase()}${ext}`;
      fs.copyFileSync(cleaned, path.join(uploadDir, fileName));
      return `/uploads/products/${fileName}`;
    }
  } catch (err) {
    console.warn(`⚠️ Could not copy local image for ${sku}:${err.message}`);
  }
  return "";
}

async function runExcelImport() {
  if (!fs.existsSync(targetFile)) {
    console.error(`❌ Error: Catalog file not found at ${targetFile}`);
    process.exit(1);
  }

  console.log(`Reading master catalog: ${path.basename(targetFile)}...`);
  const wb = XLSX.readFile(targetFile);
  const sheetName = wb.SheetNames.includes("Product Catalog") ? "Product Catalog" : wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];

  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(matrix.length, 10); i++) {
    if (matrix[i].some(cell => String(cell).trim().toUpperCase() === "SKU")) {
      headerRowIndex = i;
      break;
    }
  }

  const rawRows = XLSX.utils.sheet_to_json(sheet, { range: headerRowIndex, defval: "" });

  // Clean up any previously imported Rs. 0 incomplete rows not tied to orders
  await db.query(
    "DELETE FROM products WHERE (price <= 0 OR sale_price <= 0) AND sku NOT IN (SELECT DISTINCT sku FROM order_items WHERE sku IS NOT NULL)"
  );

  if (replaceAll) {
    await db.query("DELETE FROM products WHERE sku NOT IN (SELECT DISTINCT sku FROM order_items WHERE sku IS NOT NULL)");
    console.log("✓ Cleared unreferenced catalogue items (--replace mode).");
  }

  const seenSlugs = new Set();
  const skippedReport = [];
  let importedCount = 0;
  let activeCount = 0;
  let draftCount = 0;

  for (let idx = 0; idx < rawRows.length; idx++) {
    const r = rawRows[idx];
    const excelRowNum = headerRowIndex + idx + 2;
    const sku = String(r["SKU"] || "").trim();
    const name = String(r["Product Name"] || r["Name"] || "").trim();
    if (!sku && !name) continue;

    if (!sku || !name) {
      skippedReport.push(`Row ${excelRowNum}: Missing SKU or Product Name.`);
      continue;
    }

    const rawStatus = String(r["Status"] || "").trim();
    const status = ALLOWED_STATUSES.has(rawStatus) ? rawStatus : "Draft";

    const rawPrice = r["Regular Price"] !== undefined && r["Regular Price"] !== "" ? r["Regular Price"] : r["Price"];
    const rawSale = r["Sale Price"] !== undefined && r["Sale Price"] !== "" ? r["Sale Price"] : r["SalePrice"];

    const price = parsePositivePrice(rawPrice);
    const salePrice = rawSale !== undefined && String(rawSale).trim() !== "" ? parsePositivePrice(rawSale) : price;

    if (isNaN(price) || isNaN(salePrice)) {
      skippedReport.push(`Row ${excelRowNum} (${sku} -${name}): Skipped — missing or invalid Regular/Sale Price.`);
      continue;
    }

    if (salePrice > price) {
      skippedReport.push(`Row ${excelRowNum} (${sku} -${name}): Skipped — Sale Price (${salePrice}) exceeds Regular Price (${price}).`);
      continue;
    }

    const category = String(r["Category"] || "Candles").trim();
    const description = String(r["Description"] || "").trim();
    const stock = Math.max(0, parseInt(r["Stock"], 10) || 0);

    const rawWeight = String(r["Weight (g)"] !== undefined ? r["Weight (g)"] : (r["Weight"] || "")).trim();
    const weight = rawWeight && !/[a-zA-Z]/.test(rawWeight) ? `${rawWeight} g` : rawWeight;

    const rawDim = String(r["Dimensions (cm)"] !== undefined ? r["Dimensions (cm)"] : (r["Dimensions"] || "")).trim();
    const dimensions = rawDim && !/cm/i.test(rawDim) ? `${rawDim} cm` : rawDim;

    const scent = String(r["Scent"] || "").trim();
    const color = String(r["Color"] || "").trim();
    const size = String(r["Size"] || "").trim();

    const hasFeaturedCol = r["Featured"] !== undefined && String(r["Featured"]).trim() !== "";
    const featured = hasFeaturedCol
      ? (String(r["Featured"]).trim().toUpperCase() === "YES" || r["Featured"] === true)
      : (status === "Active" && stock > 0 && activeCount < 4);

    const imageUrl = resolveLocalImage(r["Local Image File Path (PC)"], sku);
    let slug = slugify(name, sku);
    if (seenSlugs.has(slug)) slug = `${slug}-${sku.toLowerCase()}`;
    seenSlugs.add(slug);

    await db.query(`
      INSERT INTO products (sku, slug, name, category, price, sale_price, stock, status, featured, scent, color, size, weight, dimensions, description, image_url)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      ON CONFLICT (sku) DO UPDATE SET
        slug=EXCLUDED.slug, name=EXCLUDED.name, category=EXCLUDED.category,
        price=EXCLUDED.price, sale_price=EXCLUDED.sale_price, stock=EXCLUDED.stock,
        status=EXCLUDED.status, featured=EXCLUDED.featured, scent=EXCLUDED.scent,
        color=EXCLUDED.color, size=EXCLUDED.size, weight=EXCLUDED.weight,
        dimensions=EXCLUDED.dimensions, description=EXCLUDED.description,
        image_url=CASE WHEN EXCLUDED.image_url <> '' THEN EXCLUDED.image_url ELSE products.image_url END;
    `, [sku, slug, name, category, price, salePrice, stock, status, featured, scent, color, size, weight, dimensions, description, imageUrl]);

    importedCount++;
    if (status === "Active") activeCount++;
    else draftCount++;
  }

  console.log(`\n=== Excel Catalog Import Report ===`);
  console.log(`✓ Imported: ${importedCount} valid products (${activeCount} Active,${draftCount} Draft/Other)`);
  if (skippedReport.length > 0) {
    console.log(`⚠️ Skipped ${skippedReport.length} incomplete row(s) needing attention:`);
    skippedReport.forEach(msg => console.log(`   - ${msg}`));
  }
  process.exit(0);
}

runExcelImport().catch(err => {
  console.error("❌ Excel import error:", err.message);
  process.exit(1);
});