"use strict";

const path = require("path");
const express = require("express");
const STORE_CONFIG = require("./data/config");
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

app.disable("x-powered-by");

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Parse JSON request bodies (used by /api/cart/quote) with a safe 16kb size limit
app.use(express.json({ limit: "16kb" }));

app.use(express.static(path.join(__dirname, "public")));

app.use((req, res, next) => {
  res.locals.formatMoney = formatMoney;
  res.locals.storeConfig = STORE_CONFIG;
  res.locals.currentPath = req.path;
  res.locals.searchQuery = typeof req.query.q === "string" ? req.query.q.trim() : "";
  next();
});

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

// Dedicated Cart Page (/cart)
app.get("/cart", (req, res) => {
  const suggestedProducts = getActiveProducts().filter(p => p.featured).slice(0, 4);
  res.render("cart", {
    pageTitle: "Your Shopping Cart — Aye Noor",
    pageDescription: "Review the candles in your Aye Noor shopping cart.",
    suggestedProducts
  });
});

// Server-side cart pricing API: receives [{ sku, qty }] and returns verified prices & totals
app.post("/api/cart/quote", (req, res) => {
  const rawItems = req.body && Array.isArray(req.body.items) ? req.body.items : [];
  const quote = buildCartQuote(rawItems);
  res.json(quote);
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
