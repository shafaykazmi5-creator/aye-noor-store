"use strict";

const path = require("path");
const express = require("express");
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

// Server-validated Checkout Preview API (Step 7)
app.post("/api/checkout/preview", (req, res) => {
  const body = req.body || {};
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const quote = buildCartQuote(rawItems);

  if (quote.itemCount === 0) {
    return res.status(400).json({
      error: "Your cart is empty or the selected items are no longer available.",
      field: "cart"
    });
  }

  const fullName = typeof body.fullName === "string" ? cleanLine(body.fullName) : "";
  const rawPhone = typeof body.phone === "string" ? cleanLine(body.phone) : "";
  const email = typeof body.email === "string" ? cleanLine(body.email) : "";
  const address = typeof body.address === "string" ? cleanLine(body.address) : "";
  const area = typeof body.area === "string" ? cleanLine(body.area) : "";
  const city = typeof body.city === "string" ? cleanLine(body.city) : "";
  const province = typeof body.province === "string" ? cleanLine(body.province) : "";
  const notes = typeof body.notes === "string" ? cleanLine(body.notes) : "";
  const paymentMethod = typeof body.paymentMethod === "string" ? cleanLine(body.paymentMethod) : "cod";
  const whatsappOptIn = Boolean(body.whatsappOptIn);

  if (fullName.length < 2 || fullName.length > 80) {
    return res.status(400).json({ error: "Please enter the recipient's full name (2–80 characters).", field: "fullName" });
  }

  const parsedPhone = parsePakistaniMobile(rawPhone);
  if (!parsedPhone.valid) {
    return res.status(400).json({
      error: "Please enter a valid Pakistani mobile number (e.g. 0300-1234567 or +92 300 1234567).",
      field: "phone"
    });
  }

  if (email && (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return res.status(400).json({ error: "Please enter a valid email address or leave it blank.", field: "email" });
  }

  if (address.length < 6 || address.length > 220) {
    return res.status(400).json({ error: "Please enter a complete house/street delivery address (at least 6 characters).", field: "address" });
  }

  if (area.length > 100) {
    return res.status(400).json({ error: "Area / sector / landmark must be under 100 characters.", field: "area" });
  }

  if (city.length < 2 || city.length > 60) {
    return res.status(400).json({ error: "Please enter your delivery city.", field: "city" });
  }

  if (!STORE_CONFIG.provinces.includes(province)) {
    return res.status(400).json({ error: "Please select a valid province or territory.", field: "province" });
  }

  if (notes.length > 500) {
    return res.status(400).json({ error: "Order / gift notes must be under 500 characters.", field: "notes" });
  }

  const allowedPayment = STORE_CONFIG.paymentMethods.find(m => m.id === paymentMethod && m.enabled);
  if (!allowedPayment) {
    return res.status(400).json({ error: "Please select an available payment method (Cash on Delivery).", field: "paymentMethod" });
  }

  checkoutPreviewCounter += 1;
  const previewNumber = `PREVIEW-${checkoutPreviewCounter}`;

  console.log(
    `[Checkout Validated ${previewNumber}] Customer: ${JSON.stringify(fullName)} | Phone: ${parsedPhone.e164} | City: ${JSON.stringify(city)}, ${province} | Items: ${quote.itemCount} | Total: ${formatMoney(quote.total)}`
  );

  res.json({
    ok: true,
    previewNumber,
    customer: {
      fullName,
      phoneLocal: parsedPhone.local,
      phoneE164: parsedPhone.e164,
      email: email || null,
      address,
      area: area || null,
      city,
      province,
      notes: notes || null,
      paymentMethod: allowedPayment.label,
      whatsappOptIn
    },
    quote
  });
});

// Server-validated Contact Inquiry API (development mode)
app.post("/api/contact", (req, res) => {
  const body = req.body || {};
  const name = typeof body.name === "string" ? cleanLine(body.name) : "";
  const phoneOrEmail = typeof body.contact === "string" ? cleanLine(body.contact) : "";
  const topic = CONTACT_TOPICS.includes(body.topic) ? body.topic : "General Inquiry";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (name.length < 2 || name.length > 80) {
    return res.status(400).json({ error: "Please enter your name (2–80 characters)." });
  }
  if (phoneOrEmail.length < 5 || phoneOrEmail.length > 100) {
    return res.status(400).json({ error: "Please provide a valid phone number or email address." });
  }
  if (message.length < 10 || message.length > 1500) {
    return res.status(400).json({ error: "Please enter a message between 10 and 1,500 characters." });
  }

  contactCounter += 1;
  const record = {
    id: `MSG-${contactCounter}`,
    name,
    contact: phoneOrEmail,
    topic,
    message,
    createdAt: new Date().toISOString()
  };
  devContactMessages.push(record);
  if (devContactMessages.length > MAX_DEV_MESSAGES) devContactMessages.shift();
  console.log(`[Contact Inquiry ${record.id}] From: ${JSON.stringify(record.name)} (${JSON.stringify(record.contact)}) | Topic: ${record.topic}`);

  res.json({
    ok: true,
    reference: record.id,
    message: `Thank you, ${name}. Your inquiry (${record.id}) has been recorded in development mode.`
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

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
