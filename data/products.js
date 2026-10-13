"use strict";

const CATEGORY_VISUALS = {
  "Flower Candles": { bg: "#e8c9c0", glyph: "#b77970", mark: "✿" },
  "Bear Candles": { bg: "#dfc8b1", glyph: "#a47c5e", mark: "♡" },
  "Scented Candles": { bg: "#d7d8c7", glyph: "#79806a", mark: "◉" },
  "Gift Sets": { bg: "#e5c6ba", glyph: "#b67e72", mark: "✧" },
  "Custom Candles": { bg: "#ddd0bd", glyph: "#9c8366", mark: "A" }
};

const DEFAULT_VISUAL = { bg: "#e8d9ca", glyph: "#a98d73", mark: "✳" };

const PRODUCTS = [
  {
    sku: "AN-FLW-001",
    slug: "blossom-peony-candle",
    name: "Blossom Peony Candle",
    category: "Flower Candles",
    price: 1200,
    salePrice: 999,
    stock: 25,
    status: "Active",
    featured: true,
    scent: "Wild Peony & Rose",
    color: "Blush Pink",
    size: "Medium",
    weight: "180 g",
    dimensions: "8.5 × 8.5 × 4.5 cm",
    description: "A sculptural floral candle with a soft, romantic look. Designed as an everyday centrepiece or a thoughtful gift."
  },
  {
    sku: "AN-FLW-002",
    slug: "daisy-garden-candle",
    name: "Daisy Garden Candle",
    category: "Flower Candles",
    price: 1500,
    salePrice: 1350,
    stock: 18,
    status: "Active",
    featured: false,
    scent: "Chamomile & Honey",
    color: "Ivory / Yellow",
    size: "Large",
    weight: "240 g",
    dimensions: "10 × 10 × 5 cm",
    description: "A cheerful floral centrepiece inspired by a sunlit garden."
  },
  {
    sku: "AN-BEA-001",
    slug: "mini-teddy-candle",
    name: "Mini Teddy Candle",
    category: "Bear Candles",
    price: 850,
    salePrice: 750,
    stock: 40,
    status: "Active",
    featured: true,
    scent: "Vanilla Bean",
    color: "Cream White",
    size: "Small",
    weight: "95 g",
    dimensions: "6 × 5.5 × 7.5 cm",
    description: "A charming teddy-bear candle made for little gifting moments and bedside shelves."
  },
  {
    sku: "AN-BEA-002",
    slug: "giant-cuddle-bear",
    name: "Giant Cuddle Bear",
    category: "Bear Candles",
    price: 2200,
    salePrice: 1950,
    stock: 10,
    status: "Active",
    featured: true,
    scent: "Warm Caramel",
    color: "Mocha Brown",
    size: "Large",
    weight: "320 g",
    dimensions: "",
    description: "A statement bear candle with a cosy, playful presence."
  },
  {
    sku: "AN-SCN-001",
    slug: "amber-and-oud-jar",
    name: "Amber & Oud Jar",
    category: "Scented Candles",
    price: 1650,
    salePrice: 1450,
    stock: 30,
    status: "Active",
    featured: true,
    scent: "Rich Amber & Velvet Oud",
    color: "Amber / Natural",
    size: "Standard 200g",
    weight: "200 g",
    dimensions: "7.5 × 7.5 × 9 cm",
    description: "A warm, woodsy fragrance in a simple jar-inspired style."
  },
  {
    sku: "AN-SCN-002",
    slug: "lavender-mist-tin",
    name: "Lavender Mist Tin",
    category: "Scented Candles",
    price: 950,
    salePrice: 850,
    stock: 50,
    status: "Active",
    featured: false,
    scent: "French Lavender & Sage",
    color: "Soft Purple",
    size: "Travel Tin",
    weight: "",
    dimensions: "",
    description: "A calming lavender-inspired candle for quiet evenings."
  },
  {
    sku: "AN-GFT-001",
    slug: "celebration-duo-gift-set",
    name: "Celebration Duo Gift Set",
    category: "Gift Sets",
    price: 2400,
    salePrice: 2150,
    stock: 15,
    status: "Active",
    featured: false,
    scent: "Vanilla & Rose",
    color: "Pastel Assorted",
    size: "Gift Box",
    weight: "380 g",
    dimensions: "18 × 12 × 8 cm",
    description: "A thoughtful candle duo prepared for gifting."
  },
  {
    sku: "AN-CST-001",
    slug: "monogram-initial-candle",
    name: "Monogram Initial Candle",
    category: "Custom Candles",
    price: 1400,
    salePrice: 1400,
    stock: 0,
    status: "Draft",
    featured: false,
    scent: "Custom Choice",
    color: "Custom",
    size: "Custom",
    weight: "",
    dimensions: "",
    description: "A sample custom candle listing; hidden while marked Draft."
  }
];

function getVisual(category) {
  return CATEGORY_VISUALS[category] || DEFAULT_VISUAL;
}

function formatMoney(value) {
  return `Rs. ${Number(value).toLocaleString("en-PK")}`;
}

function enrichProduct(p) {
  const v = getVisual(p.category);
  return {
    ...p,
    visual: v,
    onSale: p.salePrice < p.price,
    gallery: [
      { label: "Front view", mark: v.mark, bg: v.bg, glyph: v.glyph },
      { label: "Detail & texture", mark: `${v.mark} ✳`, bg: v.bg, glyph: v.glyph },
      { label: "Scale & styling", mark: "✳", bg: v.bg, glyph: v.glyph }
    ]
  };
}

function getActiveProducts() {
  return PRODUCTS.filter(p => p.status === "Active").map(enrichProduct);
}

function getProductBySlug(slug) {
  if (typeof slug !== "string" || !slug.trim()) return null;
  const normalized = slug.trim().toLowerCase();
  return getActiveProducts().find(p => p.slug === normalized) || null;
}

function getRelatedProducts(product, limit = 4) {
  if (!product) return [];
  const others = getActiveProducts().filter(p => p.sku !== product.sku);
  const sameCategory = others.filter(p => p.category === product.category);
  const differentCategory = others.filter(p => p.category !== product.category);
  return [...sameCategory, ...differentCategory].slice(0, limit);
}

function getActiveCategories() {
  const active = getActiveProducts();
  const names = [...new Set(active.map(p => p.category))];
  return names.map(name => ({
    name,
    visual: getVisual(name),
    count: active.filter(p => p.category === name).length
  }));
}

module.exports = {
  getActiveProducts,
  getProductBySlug,
  getRelatedProducts,
  getActiveCategories,
  formatMoney
};
