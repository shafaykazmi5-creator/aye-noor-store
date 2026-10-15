"use strict";
require("dotenv").config();
const db = require("../db");

async function inspectOutbox() {
  const res = await db.query(`
    SELECT id, order_number, notification_type, sender_phone, recipient_phone, status, attempts, payload->>'messageText' AS message_preview
    FROM notification_outbox
    ORDER BY id DESC
    LIMIT 6
  `);
  for (const row of res.rows) {
    console.log("------------------------------------------------------------");
    console.log(`Job #${row.id} | Order: ${row.order_number} | Type: ${row.notification_type} | Status: ${row.status}`);
    console.log(`From: ${row.sender_phone} -> To: ${row.recipient_phone}`);
    console.log("Message Text:\n" + row.message_preview);
  }
  process.exit(0);
}
inspectOutbox().catch(err => { console.error(err.message); process.exit(1); });