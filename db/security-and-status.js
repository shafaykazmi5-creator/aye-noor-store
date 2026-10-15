"use strict";
const express = require("express");

function createRateLimiter({ windowMs, max, message }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits.entries()) {
      if (now > v.resetAt) hits.delete(k);
    }
  }, 60000).unref();

  return (req, res, next) => {
    const key = (req.ip || "local") + ":" + req.baseUrl + req.path;
    const now = Date.now();
    const record = hits.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > record.resetAt) {
      record.count = 0;
      record.resetAt = now + windowMs;
    }
    record.count += 1;
    hits.set(key, record);

    if (record.count > max) {
      return res.status(429).json({ ok: false, message });
    }
    next();
  };
}

function registerStep14Routes(app, { db }) {
  const checkoutLimiter = createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 12,
    message: "Too many checkout requests from this IP. Please wait a few minutes."
  });
  const voucherLimiter = createRateLimiter({
    windowMs: 5 * 60 * 1000,
    max: 20,
    message: "Too many voucher attempts. Please wait 5 minutes."
  });
  const statusLimiter = createRateLimiter({
    windowMs: 5 * 60 * 1000,
    max: 25,
    message: "Too many order lookup requests. Please wait a moment."
  });

  app.use("/api/checkout", checkoutLimiter);
  app.use("/api/voucher/verify", voucherLimiter);

  // Live Order Tracking API (Requires Order Number + Phone Last 4 Digits)
  app.post("/api/order-status", statusLimiter, express.json(), async (req, res) => {
    try {
      const orderNumber = String((req.body && req.body.orderNumber) || "").trim().toUpperCase();
      const phoneInput = String((req.body && req.body.phone) || "").replace(/\D/g, "");

      if (!orderNumber || phoneInput.length < 4) {
        return res.status(400).json({
          ok: false,
          message: "Please enter your Order Number (e.g. AN-...) and at least the last 4 digits of your phone number."
        });
      }

      const ordRes = await db.query(
        `SELECT order_number, customer_name, phone_e164, city, province,
                subtotal, shipping_fee, voucher_code, discount_amount, total, status, created_at
         FROM orders
         WHERE UPPER(order_number) = $1`,
        [orderNumber]
      );

      if (ordRes.rows.length === 0) {
        return res.status(404).json({
          ok: false,
          message: "No order found matching that Order Number and Phone Number."
        });
      }

      const ord = ordRes.rows[0];
      const dbDigits = String(ord.phone_e164 || "").replace(/\D/g, "");
      const last4Input = phoneInput.slice(-4);
      const last4Db = dbDigits.slice(-4);

      if (!last4Input || last4Input !== last4Db) {
        return res.status(404).json({
          ok: false,
          message: "No order found matching that Order Number and Phone Number."
        });
      }

      const itemsRes = await db.query(
        `SELECT product_name, quantity, line_total
         FROM order_items
         WHERE order_number = $1
         ORDER BY id ASC`,
        [ord.order_number]
      );

      return res.json({
        ok: true,
        order: {
          orderNumber: ord.order_number,
          customerName: ord.customer_name,
          city: ord.city,
          province: ord.province,
          status: ord.status,
          subtotal: Number(ord.subtotal),
          shippingFee: Number(ord.shipping_fee),
          voucherCode: ord.voucher_code || null,
          discountAmount: Number(ord.discount_amount || 0),
          total: Number(ord.total),
          createdAt: ord.created_at,
          items: itemsRes.rows.map(i => ({
            name: i.product_name,
            qty: Number(i.quantity),
            lineTotal: Number(i.line_total)
          }))
        }
      });
    } catch (err) {
      return res.status(500).json({ ok: false, message: "Unable to check order status right now." });
    }
  });

  // Production Health Check Endpoint
  app.get("/api/health", async (_req, res) => {
    try {
      await db.query("SELECT 1");
      res.json({ ok: true, db: "connected", timestamp: new Date().toISOString() });
    } catch (err) {
      res.status(503).json({ ok: false, db: "disconnected" });
    }
  });
}

module.exports = { registerStep14Routes };
