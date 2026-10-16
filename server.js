"use strict";

const path = require("path");
const express = require("express");
const db = require("./db");
const { forceSyncNow } = require("./db/sync-products");
const { enqueueOrderNotifications, processOutboxBatch, startOutboxWorker } = require("./db/outbox");
startOutboxWorker();
const STORE_CONFIG = require("./data/config");
const { FAQS, POLICIES } = require("./data/pages");
const {
  getActiveProducts,
  getProductBySlug,
  getRelatedProducts,
  getActiveCategories,
  buildCartQuote,
  formatMoney
} = require("./data/products");

const helmet = require("helmet");
const app = express();
const PORT = process.env.PORT || 3000;

// In-memory log of contact messages during development (moves to PostgreSQL in Step 8)
const devContactMessages = [];
const MAX_DEV_MESSAGES = 200;      // keep memory bounded while testing
let contactCounter = 1000;
const CONTACT_TOPICS = ["General Inquiry", "Order Question", "Gifting / Bulk Order", "Custom Candle Request"];

// Replace line breaks and other control characters so visitor text can't fake extra lines in logs
const cleanLine = value => value.replace(/[\u0000-\u001F\u007F]+/g, " ").trim();
let checkoutPreviewCounter = 1000;

function parsePakistaniMobile(raw) {
  if (typeof raw !== "string") return { valid: false };
  const compact = raw.replace(/[\s\-().]/g, "");
  const match = compact.match(/^(?:\+92|0092|92)?0?(3\d{2})(\d{7})$/);
  if (!match) return { valid: false };
  return {
    valid: true,
    local: `0${match[1]}-${match[2]}`,
    e164: `+92${match[1]}${match[2]}`,
    waId: `92${match[1]}${match[2]}`
  };
}

app.disable("x-powered-by");

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.static(path.join(__dirname, "public")));

// Template helpers. This must run BEFORE express.json(), so that even the error page
// (shown when a request is rejected early) has everything it needs to render.
app.use((req, res, next) => {
  res.locals.formatMoney = formatMoney;
  res.locals.storeConfig = STORE_CONFIG;
  res.locals.currentPath = req.path;
  res.locals.searchQuery = typeof req.query.q === "string" ? req.query.q.trim() : "";
  next();
});

app.use(express.json({ limit: "16kb" }));

app.get("/", (req, res) => {
  const products = getActiveProducts();
  const categories = getActiveCategories();
  const featuredProducts = products.filter(p => p.featured).slice(0, 4);

  res.render("home", {
    pageTitle: "Aye Noor — Candles for thoughtful moments",
    pageDescription: "Aye Noor candle shop development prototype.",
    categories,
    featuredProducts,
    allProducts: products
  });
});

app.get("/shop", (req, res) => {
  const allProducts = getActiveProducts();
  const categories = getActiveCategories();

  const selectedCategory = typeof req.query.category === "string" ? req.query.category : "all";
  const searchTerm = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const selectedSort = typeof req.query.sort === "string" ? req.query.sort : "featured";

  let filtered = allProducts.filter(p => {
    const matchesCategory = selectedCategory === "all" || p.category === selectedCategory;
    if (!matchesCategory) return false;
    if (!searchTerm) return true;
    const haystack = [p.name, p.category, p.description, p.scent, p.sku].join(" ").toLowerCase();
    return haystack.includes(searchTerm.toLowerCase());
  });

  if (selectedSort === "low-high") {
    filtered.sort((a, b) => a.salePrice - b.salePrice);
  } else if (selectedSort === "high-low") {
    filtered.sort((a, b) => b.salePrice - a.salePrice);
  } else if (selectedSort === "name") {
    filtered.sort((a, b) => a.name.localeCompare(b.name));
  }

  res.render("shop", {
    pageTitle: "Shop Candles — Aye Noor",
    pageDescription: "Browse the Aye Noor sample collection of floral, bear, and scented candles.",
    categories,
    products: filtered,
    selectedCategory,
    selectedSort,
    searchQuery: searchTerm
  });
});

app.get("/product/:slug", (req, res) => {
  const product = getProductBySlug(req.params.slug);
  if (!product) {
    return res.status(404).render("status", {
      pageTitle: "Product Not Found — Aye Noor",
      pageDescription: "This candle could not be found.",
      eyebrow: "404 · PRODUCT NOT FOUND",
      heading: "We couldn't find that candle.",
      message: "It may be unavailable, renamed, or still in draft. Explore our active candle collection below."
    });
  }

  const specs = [
    { label: "Scent", value: product.scent },
    { label: "Color", value: product.color },
    { label: "Size", value: product.size },
    { label: "Weight", value: product.weight },
    { label: "Dimensions", value: product.dimensions },
    { label: "SKU", value: product.sku }
  ].filter(item => typeof item.value === "string" && item.value.trim().length > 0);

  const relatedProducts = getRelatedProducts(product, 4);

  res.render("product", {
    pageTitle: `${product.name} — Aye Noor`,
    pageDescription: product.description,
    product,
    specs,
    relatedProducts
  });
});

app.get("/cart", (req, res) => {
  const suggestedProducts = getActiveProducts().filter(p => p.featured).slice(0, 4);
  res.render("cart", {
    pageTitle: "Your Shopping Cart — Aye Noor",
    pageDescription: "Review the candles in your Aye Noor shopping cart.",
    suggestedProducts
  });
});

app.get("/checkout", (req, res) => {
  res.render("checkout", {
    pageTitle: "Checkout — Aye Noor",
    pageDescription: "Enter your delivery details and review your Aye Noor candle order."
  });
});

// Static Brand & Help Pages (Step 6)
app.get("/about", (req, res) => {
  const categories = getActiveCategories();
  res.render("about", {
    pageTitle: "Our Story — Aye Noor",
    pageDescription: "Learn about Aye Noor — handcrafted floral, bear, and scented candles designed for thoughtful gifting.",
    categories
  });
});

app.get("/contact", (req, res) => {
  res.render("contact", {
    pageTitle: "Contact Us — Aye Noor",
    pageDescription: "Get in touch with Aye Noor regarding orders, gifting, or general inquiries."
  });
});

app.get("/faq", (req, res) => {
  res.render("faq", {
    pageTitle: "Frequently Asked Questions — Aye Noor",
    pageDescription: "Answers to common questions about ordering, delivery, and candle care at Aye Noor.",
    faqs: FAQS
  });
});

// Policy Pages (/shipping, /returns, /privacy, /terms)
["shipping", "returns", "privacy", "terms"].forEach(key => {
  app.get(`/${key}`, (req, res) => {
    const policy = POLICIES[key];
    res.render("policy", {
      pageTitle: `${policy.title} — Aye Noor`,
      pageDescription: policy.intro,
      policy,
      allPolicies: Object.values(POLICIES)
    });
  });
});

// Server-side cart pricing API
app.post("/api/cart/quote", (req, res) => {
  const rawItems = req.body && Array.isArray(req.body.items) ? req.body.items : [];
  const quote = buildCartQuote(rawItems);
  res.json(quote);
});

// Step 10 (Hardened): Authoritative PostgreSQL Order Creation, Idempotency & Stock Deduction
const { registerStep14Routes } = require("./db/security-and-status");
registerStep14Routes(app, { db });

app.post("/api/checkout", async (req, res) => {
  const body = req.body || {};
  const rawItems = Array.isArray(body.items) ? body.items : [];

  const fullName = typeof body.fullName === "string" ? cleanLine(body.fullName) : "";
  const rawPhone = typeof body.phone === "string" ? cleanLine(body.phone) : "";
  const email = typeof body.email === "string" ? cleanLine(body.email) : "";
  const address = typeof body.address === "string" ? cleanLine(body.address) : "";
  const area = typeof body.area === "string" ? cleanLine(body.area) : "";
  const city = typeof body.city === "string" ? cleanLine(body.city) : "";
  const province = typeof body.province === "string" ? cleanLine(body.province) : "";
  const notes = typeof body.notes === "string" ? cleanLine(body.notes) : "";
  const paymentMethod = typeof body.paymentMethod === "string" ? cleanLine(body.paymentMethod) : "cod";
  const idempotencyKey = typeof body.idempotencyKey === "string" ? cleanLine(body.idempotencyKey).slice(0, 95) : "";

  const whatsappOptIn = true;

  if (fullName.length < 2 || fullName.length > 80) return res.status(400).json({ error: "Please enter the recipient's full name (2–80 characters).", field: "fullName" });
  const parsedPhone = parsePakistaniMobile(rawPhone);
  if (!parsedPhone.valid) return res.status(400).json({ error: "Please enter a valid Pakistani mobile number (e.g. 0300-1234567).", field: "phone" });
  if (email && (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return res.status(400).json({ error: "Please enter a valid email address or leave it blank.", field: "email" });
  if (address.length < 6 || address.length > 220) return res.status(400).json({ error: "Please enter a complete delivery address (at least 6 characters).", field: "address" });
  if (area.length > 100) return res.status(400).json({ error: "Area / landmark must be under 100 characters.", field: "area" });
  if (city.length < 2 || city.length > 60) return res.status(400).json({ error: "Please enter your delivery city.", field: "city" });
  if (!STORE_CONFIG.provinces.includes(province)) return res.status(400).json({ error: "Please select a valid province.", field: "province" });
  if (notes.length > 500) return res.status(400).json({ error: "Order notes must be under 500 characters.", field: "notes" });

  const allowedPayment = STORE_CONFIG.paymentMethods.find(m => m.id === paymentMethod && m.enabled);
  if (!allowedPayment) return res.status(400).json({ error: "Please select an available payment method.", field: "paymentMethod" });

  const requestedMap = new Map();
  for (const entry of rawItems.slice(0, 50)) {
    if (!entry || typeof entry.sku !== "string") continue;
    const sku = entry.sku.trim();
    const qty = Math.floor(Number(entry.qty));
    if (sku && Number.isInteger(qty) && qty > 0) {
      requestedMap.set(sku, (requestedMap.get(sku) || 0) + qty);
    }
  }

  if (requestedMap.size === 0) {
    return res.status(400).json({ error: "Your cart is empty.", field: "cart" });
  }

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Check idempotency key to prevent duplicate orders on retry
    if (idempotencyKey) {
      const existingOrder = await client.query(
        "SELECT order_number, subtotal, shipping_fee, total FROM orders WHERE idempotency_key = $1",
        [idempotencyKey]
      );
      if (existingOrder.rows.length > 0) {
        await client.query("ROLLBACK");
        const ord = existingOrder.rows[0];
        const existingItems = await db.query(
          "SELECT sku, product_name AS name, unit_price AS \"salePrice\", quantity AS qty, line_total AS \"lineTotal\" FROM order_items WHERE order_number = $1",
          [ord.order_number]
        );
        return res.json({
          ok: true,
          duplicate: true,
          orderNumber: ord.order_number,
          customer: {
            fullName, phoneLocal: parsedPhone.local, phoneE164: parsedPhone.e164,
            email: email || null, address, area: area || null, city, province,
            notes: notes || null, paymentMethod: allowedPayment.label, whatsappOptIn
          },
          quote: {
            items: existingItems.rows.map(r => ({
              sku: r.sku, name: r.name, salePrice: Number(r.salePrice),
              qty: Number(r.qty), lineTotal: Number(r.lineTotal)
            })),
            itemCount: existingItems.rows.reduce((sum, r) => sum + Number(r.qty), 0),
            subtotal: Number(ord.subtotal),
            shippingFee: Number(ord.shipping_fee),
            total: Number(ord.total)
          }
        });
      }
    }

    // 2. Lock product rows & calculate authoritative prices directly from PostgreSQL
    const skus = [...requestedMap.keys()];
    const lockRes = await client.query(
      "SELECT sku, slug, name, category, price, sale_price, stock, status, image_url FROM products WHERE sku = ANY($1) FOR UPDATE",
      [skus]
    );
    const dbProducts = new Map(lockRes.rows.map(r => [r.sku, r]));

    const verifiedItems = [];
    let itemCount = 0;
    let subtotal = 0;
    let regularSubtotal = 0;

    for (const [sku, reqQty] of requestedMap.entries()) {
      const p = dbProducts.get(sku);
      if (!p || p.status !== "Active") {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: `Item "${sku}" is no longer available.`, field: "cart" });
      }
      const price = Number(p.price);
      const salePrice = Number(p.sale_price);
      const stock = Number(p.stock);

      if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(salePrice) || salePrice <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: `Item "${p.name}" has an invalid price configuration.`, field: "cart" });
      }
      if (stock < reqQty) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: stock < 1
            ? `Sorry, "${p.name}" is out of stock.`
            : `Only ${stock} unit(s) of "${p.name}" remain in stock.`,
          field: "cart"
        });
      }

      const lineTotal = salePrice * reqQty;
      const regularLineTotal = price * reqQty;
      itemCount += reqQty;
      subtotal += lineTotal;
      regularSubtotal += regularLineTotal;

      verifiedItems.push({
        sku: p.sku, slug: p.slug, name: p.name, category: p.category,
        price, salePrice, qty: reqQty, lineTotal, regularLineTotal
      });
    }

    const threshold = STORE_CONFIG.freeShippingThreshold;
    const shippingFee = subtotal >= threshold ? 0 : STORE_CONFIG.shippingFee;
    const savings = Math.max(0, regularSubtotal - subtotal);
    let total = subtotal + shippingFee;

    // 3. Generate collision-free order number via PostgreSQL sequence
    const seqRes = await client.query("SELECT nextval('order_number_seq') AS seq");
    const seqNum = String(seqRes.rows[0].seq).padStart(4, "0");
    const now = new Date();
    const datePart = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const orderNumber = `AN-${datePart}-${seqNum}`;

    // 4. Insert order & items and deduct stock atomically
    await client.query(
      `INSERT INTO orders (
        order_number, customer_name, phone_e164, email, address, area, city, province,
        notes, payment_method, subtotal, shipping_fee, total, status,
        whatsapp_opt_in, whatsapp_consent_at, idempotency_key
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'Pending',$14, CASE WHEN $14 THEN CURRENT_TIMESTAMP ELSE NULL END, $15)`,
      [
        orderNumber, fullName, parsedPhone.e164, email || null,
        address, area || null, city, province, notes || null,
        allowedPayment.label, subtotal, shippingFee, total,
        whatsappOptIn, idempotencyKey || null
      ]
    );

    for (const item of verifiedItems) {
      await client.query(
        "INSERT INTO order_items (order_number, sku, product_name, unit_price, quantity, line_total) VALUES ($1,$2,$3,$4,$5,$6)",
        [orderNumber, item.sku, item.name, item.salePrice, item.qty, item.lineTotal]
      );
      await client.query("UPDATE products SET stock = stock - $1 WHERE sku = $2", [item.qty, item.sku]);
    }

    let voucherCode = null;
    let discountAmount = 0;
    if (body && body.voucherCode) {
      const vApplied = await applyVoucherInTransaction(client, body.voucherCode, subtotal);
      if (vApplied) {
        voucherCode = vApplied.code;
        discountAmount = vApplied.discountAmount;
        total = Math.max(0, subtotal - discountAmount + shippingFee);
        await client.query(
          "UPDATE orders SET voucher_code = $1, discount_amount = $2, total = $3 WHERE order_number = $4",
          [voucherCode, discountAmount, total, orderNumber]
        );
      }
    }
    await enqueueOrderNotifications({
      client,
      orderNumber, customerName: fullName, phoneLocal: parsedPhone.local, phoneE164: parsedPhone.e164, address, area: area || null, city, province, notes: notes || null, paymentMethod: allowedPayment.label, subtotal, shippingFee, total, items: verifiedItems, voucherCode, discountAmount
    });
    await client.query("COMMIT");
    await forceSyncNow(); // Outbox enqueued atomically inside transaction before COMMIT setImmediate(() => processOutboxBatch()); } catch (e) { console.warn("Outbox err:", e.message); }

    // Minimal operational log without customer PII
    console.log(`✓ [Order Created] order=${orderNumber} items=${itemCount} total=${formatMoney(total)} waOptIn=${whatsappOptIn}`);

    res.json({
      ok: true,
      orderNumber,
      customer: {
        fullName, phoneLocal: parsedPhone.local, phoneE164: parsedPhone.e164,
        email: email || null, address, area: area || null, city, province,
        notes: notes || null, paymentMethod: allowedPayment.label, whatsappOptIn
      },
      quote: {
        items: verifiedItems, voucherCode, discountAmount,
        itemCount,
        subtotal,
        regularSubtotal,
        savings,
        shippingFee,
        freeShippingThreshold: threshold,
        total
      }
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("❌ Order transaction error:", err.message);
    res.status(500).json({ error: "Could not place your order right now. Please try again." });
  } finally {
    client.release();
  }
});

app.post("/api/contact", async (req, res) => {
  const body = req.body || {};
  const name = typeof body.name === "string" ? cleanLine(body.name) : "";
  const phoneOrEmail = typeof body.contact === "string" ? cleanLine(body.contact) : "";
  const topic = CONTACT_TOPICS.includes(body.topic) ? body.topic : "General Inquiry";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (name.length < 2 || name.length > 80) return res.status(400).json({ error: "Please enter your name (2–80 characters)." });
  if (phoneOrEmail.length < 5 || phoneOrEmail.length > 100) return res.status(400).json({ error: "Please provide a valid phone number or email address." });
  if (message.length < 10 || message.length > 1500) return res.status(400).json({ error: "Please enter a message between 10 and 1,500 characters." });

  const refId = `MSG-${Date.now().toString(36).toUpperCase().slice(-5)}-${Math.floor(100 + Math.random() * 900)}`;
  try {
    await db.query(
      "INSERT INTO contact_messages (reference_id, name, contact, topic, message) VALUES ($1,$2,$3,$4,$5)",
      [refId, name, phoneOrEmail, topic, message]
    );
    console.log(`✓ [Contact Saved] ref=${refId} topic=${JSON.stringify(topic)}`);
    res.json({ ok: true, reference: refId, message: `Thank you, ${name}. Your inquiry (${refId}) has been received.` });
  } catch (err) {
    console.error("❌ Contact DB error:", err.message);
    res.status(500).json({ error: "Could not save your message right now." });
  }
});

function getSitemapSiteUrl() {
  const configured = String(process.env.SITE_URL || "").trim();
  const candidate = configured || (process.env.NODE_ENV !== "production" ? `http://localhost:${PORT}` : "");
  if (!candidate) return "";
  try {
    const parsed = new URL(candidate);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.pathname !== "/" || parsed.search || parsed.hash) return "";
    return parsed.origin;
  } catch {
    return "";
  }
}

app.get("/robots.txt", (req, res) => {
  const siteUrl = getSitemapSiteUrl();
  const lines = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "Disallow: /health"
  ];
  if (siteUrl) lines.push(`Sitemap: ${siteUrl}/sitemap.xml`);
  res.type("text/plain").send(lines.join("\n") + "\n");
});

app.get("/sitemap.xml", (req, res) => {
  const siteUrl = getSitemapSiteUrl();
  if (!siteUrl) {
    return res.status(503).type("text/plain").send("Configure SITE_URL with your public website origin to enable the sitemap.");
  }

  const paths = [
    "/", "/shop", "/about", "/contact", "/faq", "/status",
    ...Object.keys(POLICIES).map(key => `/${key}`),
    ...getActiveProducts()
      .filter(product => product && product.slug)
      .map(product => `/product/${encodeURIComponent(product.slug)}`)
  ];
  const uniquePaths = [...new Set(paths)];
  const escapeXml = value => String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

  const entries = uniquePaths.map(route => {
    const loc = new URL(route, `${siteUrl}/`).toString();
    return `  <url>\n    <loc>${escapeXml(loc)}</loc>\n  </url>`;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>`;
  res.set("Cache-Control", "public, max-age=3600");
  res.type("application/xml").send(xml);
});

app.get("/health", async (req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({ status: "ok", db: "connected" });
  } catch {
    res.status(503).json({ status: "error", db: "disconnected" });
  }
});

const { registerAdminRoutes, applyVoucherInTransaction } = require("./db/admin");
registerAdminRoutes(app, { db, forceSyncNow, processOutboxBatch });

app.get("/status", (req, res) => res.render("track-order", { pageTitle: "Track Your Order ? Aye Noor", pageDescription: "Check the status of your Aye Noor order." }));

app.use((req, res) => {
  res.status(404).render("status", {
    pageTitle: "Page Not Found — Aye Noor",
    pageDescription: "The page you are looking for could not be found.",
    eyebrow: "404 · PAGE NOT FOUND",
    heading: "This little light isn't here.",
    message: "The page you requested doesn't exist or may have moved. Try exploring our candle collection instead."
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);

  // Broken or oversized data sent to an API address: answer with a short JSON message, not a web page
  if (req.path.startsWith("/api/")) {
    const status = err.status >= 400 && err.status < 500 ? err.status : 500;
    return res.status(status).json({ error: status === 500 ? "Something went wrong." : "The request could not be read." });
  }

  res.status(500).render("status", {
    pageTitle: "Something Went Wrong — Aye Noor",
    pageDescription: "An unexpected error occurred.",
    eyebrow: "500 · TEMPORARY HICCUP",
    heading: "Something went wrong.",
    message: "We ran into an unexpected problem loading this page. Please refresh or return to the home page."
  });
});

app.listen(PORT, () => {
  console.log(`Aye Noor is running at http://localhost:${PORT}`);
});
