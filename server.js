"use strict";

const path = require("path");
const express = require("express");
const {
  getActiveProducts,
  getActiveCategories,
  formatMoney
} = require("./data/products");

const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));

app.use((req, res, next) => {
  const products = getActiveProducts();
  res.locals.formatMoney = formatMoney;
  res.locals.currentPath = req.path;
  res.locals.searchQuery = typeof req.query.q === "string" ? req.query.q.trim() : "";
  res.locals.cartCatalog = products.map(p => ({
    sku: p.sku,
    slug: p.slug,
    name: p.name,
    category: p.category,
    salePrice: p.salePrice,
    stock: p.stock,
    visual: p.visual
  }));
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
