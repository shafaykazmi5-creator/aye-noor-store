"use strict";
const db = require("./index");
const { initWhatsApp, sendWhatsAppText, isWhatsAppReady } = require("./whatsapp");

const WHATSAPP_MODE = (process.env.WHATSAPP_MODE || "mock").toLowerCase();
const SENDER_NUMBER = process.env.WHATSAPP_SENDER_NUMBER || "+923000000000";
const OWNER_NUMBER = process.env.OWNER_WHATSAPP_NUMBER || "+923379201434";
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function ensureOutboxSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS notification_outbox (
      id SERIAL PRIMARY KEY,
      dedup_key VARCHAR(120) UNIQUE NOT NULL,
      order_number VARCHAR(50) NOT NULL REFERENCES orders(order_number) ON DELETE CASCADE,
      notification_type VARCHAR(50) NOT NULL,
      sender_phone VARCHAR(30) NOT NULL,
      recipient_phone VARCHAR(30) NOT NULL,
      payload JSONB NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      next_attempt_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      last_error TEXT,
      sent_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_outbox_poll
      ON notification_outbox (status, next_attempt_at);
  `);
}

function money(val) {
  return `Rs. ${Number(val || 0).toLocaleString("en-PK")}`;
}

async function enqueueOrderNotifications({ orderNumber, customerName, phoneLocal, phoneE164, address, area, city, province, notes, paymentMethod, subtotal, shippingFee, total, items, voucherCode, discountAmount }) {
  const summaryItems = items.map(i => ({
    sku: i.sku,
    name: i.name,
    qty: i.qty,
    lineTotal: i.lineTotal
  }));

  const fullAddress = `${address}${area ? ", " + area : ""}, ${city},${province}`;
  const itemLines = summaryItems.map(i => `• ${i.name} × ${i.qty} —${money(i.lineTotal)}`).join("\n");
  const deliveryText = shippingFee === 0 ? "Free" : money(shippingFee);

  // 1. Owner Alert
  const ownerMessage = [
    `🔔 *New Aye Noor Order (${orderNumber})*`,
    `Status: Awaiting Customer WhatsApp CONFIRM`,
    ``,
    `*Customer:* ${customerName}`,
    `*Phone:* ${phoneLocal} (${phoneE164})`,
    `*Address:* ${fullAddress}`,
    notes ? `*Notes:* ${notes}` : null,
    ``,
    `*Items:*`,
    itemLines,
    ``,
    `Subtotal: ${money(subtotal)}`, discountAmount > 0 ? `Voucher (${voucherCode}): -${money(discountAmount)}` : null,
    discountAmount > 0 ? `Voucher (${voucherCode}): -${money(discountAmount)}` : null, `Delivery: ${deliveryText}`,
    `*Total COD: ${money(total)}*`
  ].filter(Boolean).join("\n");

  const ownerDedup = `order:${orderNumber}:owner_order_alert`;
  await db.query(
    `INSERT INTO notification_outbox (dedup_key, order_number, notification_type, sender_phone, recipient_phone, payload, status)
     VALUES ($1, $2, 'owner_order_alert', $3, $4, $5, 'pending')
     ON CONFLICT (dedup_key) DO NOTHING`,
    [ownerDedup, orderNumber, SENDER_NUMBER, OWNER_NUMBER, JSON.stringify({ messageText: ownerMessage })]
  );

  // 2. Customer Confirmation
  const customerMessage = [
    `✨ *Assalam-o-Alaikum ${customerName}, thank you for ordering from Aye Noor!*`,
    ``,
    `Your Order *#${orderNumber}* has been received and is awaiting your confirmation:`,
    ``,
    `*Items:*`,
    itemLines,
    ``,
    discountAmount > 0 ? `Voucher (${voucherCode}): -${money(discountAmount)}` : null, `Delivery: ${deliveryText}`,
    `*Total Payable (COD): ${money(total)}*`,
    `*Delivery Address:* ${fullAddress}`,
    ``,
    `👉 *Please reply CONFIRM to this message to confirm your order for dispatch.*`
  ].filter(Boolean).join("\n");

  const custDedup = `order:${orderNumber}:customer_order_confirmation`;
  await db.query(
    `INSERT INTO notification_outbox (dedup_key, order_number, notification_type, sender_phone, recipient_phone, payload, status)
     VALUES ($1, $2, 'customer_order_confirmation', $3, $4, $5, 'pending')
     ON CONFLICT (dedup_key) DO NOTHING`,
    [custDedup, orderNumber, SENDER_NUMBER, phoneE164, JSON.stringify({ messageText: customerMessage })]
  );
}

let isProcessing = false;

async function processOutboxBatch() {
  if (isProcessing || WHATSAPP_MODE === "disabled") return;
  isProcessing = true;

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const dueRes = await client.query(`
      SELECT id, order_number, notification_type, recipient_phone, attempts, max_attempts, payload
      FROM notification_outbox
      WHERE status IN ('pending', 'failed')
        AND attempts < max_attempts
        AND next_attempt_at <= CURRENT_TIMESTAMP
      ORDER BY id ASC
      LIMIT 10
      FOR UPDATE SKIP LOCKED
    `);

    for (const job of dueRes.rows) {
      const nextAttemptNum = Number(job.attempts) + 1;
      try {
        if (WHATSAPP_MODE === "mock_fail") {
          throw new Error("Simulated provider timeout (mock_fail mode)");
        }

        const msgText = job.payload && job.payload.messageText
          ? job.payload.messageText
          : `Aye Noor Order #${job.order_number}`;

        if (WHATSAPP_MODE === "baileys") {
          if (!isWhatsAppReady()) {
            // Keep pending until QR is scanned
            continue;
          }
          await sendWhatsAppText(job.recipient_phone, msgText);
          await sleep(3500);
        }

        await client.query(
          `UPDATE notification_outbox
           SET status = 'sent',
               attempts = $1,
               sent_at = CURRENT_TIMESTAMP,
               last_error = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [nextAttemptNum, job.id]
        );
        console.log(`✓ [Outbox Sent] job=${job.id} type=${job.notification_type} order=${job.order_number} to=${job.recipient_phone}`);
      } catch (err) {
        const backoffSeconds = Math.pow(2, nextAttemptNum) * 15;
        await client.query(
          `UPDATE notification_outbox
           SET status = 'failed',
               attempts = $1,
               last_error = $2,
               next_attempt_at = CURRENT_TIMESTAMP + ($3 || ' seconds')::interval,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [nextAttemptNum, err.message, String(backoffSeconds), job.id]
        );
        console.warn(`⚠️ [Outbox Job Failed] job=${job.id} type=${job.notification_type} order=${job.order_number} attempt=${nextAttemptNum}/${job.max_attempts}: ${err.message}`);
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.warn("⚠️ Outbox worker warning:", err.message);
  } finally {
    client.release();
    isProcessing = false;
  }
}

function startOutboxWorker() {
  ensureOutboxSchema()
    .then(() => {
      console.log(`✓ Notification outbox ready (mode=${WHATSAPP_MODE}).`);
      if (WHATSAPP_MODE === "baileys") {
        initWhatsApp(() => processOutboxBatch());
      } else {
        processOutboxBatch();
      }
      setInterval(processOutboxBatch, 10000).unref();
    })
    .catch(err => console.warn("⚠️ Outbox schema init warning:", err.message));
}

module.exports = {
  ensureOutboxSchema,
  enqueueOrderNotifications,
  processOutboxBatch,
  startOutboxWorker
};