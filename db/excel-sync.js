"use strict";
const fs = require("fs");
const path = require("path");
const xlsx = require("xlsx");

const EXCEL_PATH = path.join(process.cwd(), "Aye_Noor_Product_Catalog.xlsx");

async function syncPostgresToExcel(db) {
  const res = await db.query(`
    SELECT sku, slug, name, category, price, sale_price, stock, status, featured,
           scent, color, size, weight, dimensions, description, image_url
    FROM products
    ORDER BY sku ASC
  `);

  const rows = res.rows.map(p => ({
    "SKU": p.sku || "",
    "Product Name": p.name || "",
    "Category": p.category || "",
    "Regular Price (PKR)": Number(p.price || 0),
    "Sale Price (PKR)": Number(p.sale_price || p.price || 0),
    "Stock Qty": Number(p.stock || 0),
    "Status": p.status || "Active",
    "Featured": p.featured ? "Yes" : "No",
    "Scent": p.scent || "",
    "Color": p.color || "",
    "Size": p.size || "",
    "Weight": p.weight || "",
    "Dimensions": p.dimensions || "",
    "Description": p.description || "",
    "Image URL": p.image_url || ""
  }));

  let wb;
  if (fs.existsSync(EXCEL_PATH)) {
    try {
      wb = xlsx.readFile(EXCEL_PATH);
    } catch {
      wb = xlsx.utils.book_new();
    }
  } else {
    wb = xlsx.utils.book_new();
  }

  const ws = xlsx.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 14 }, { wch: 28 }, { wch: 20 }, { wch: 18 }, { wch: 16 },
    { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 18 }, { wch: 16 },
    { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 42 }, { wch: 32 }
  ];

  const sheetName = "Live_DB_Catalog";
  if (wb.SheetNames.includes(sheetName)) {
    wb.Sheets[sheetName] = ws;
  } else {
    xlsx.utils.book_append_sheet(wb, ws, sheetName);
  }

  xlsx.writeFile(wb, EXCEL_PATH);
  return { count: rows.length, filePath: EXCEL_PATH };
}

module.exports = { syncPostgresToExcel, EXCEL_PATH };
