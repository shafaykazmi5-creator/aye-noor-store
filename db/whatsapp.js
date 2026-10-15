"use strict";
const path = require("path");
const pino = require("pino");
const qrcode = require("qrcode-terminal");
const db = require("./index");

const AUTH_DIR = path.join(process.cwd(), ".whatsapp_auth");
const OWNER_NUMBER = process.env.OWNER_WHATSAPP_NUMBER || "+923379201434";

let sock = null;
let isConnected = false;
let isInitializing = false;
let onConnectedCallback = null;

function toJid(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  const normalized = digits.startsWith("03") ? "92" + digits.slice(1) : digits;
  return normalized + "@s.whatsapp.net";
}

function extractPhoneDigits(jid) {
  return String(jid || "").split("@")[0].split(":")[0].replace(/\D/g, "");
}

async function handleIncomingMessages(Upsert) {
  if (!Upsert || Upsert.type !== "notify" || !Array.isArray(Upsert.messages)) return;

  for (const msg of Upsert.messages) {
    try {
      if (!msg.message || msg.key.fromMe) continue;
      const remoteJid = msg.key.remoteJid || "";
      if (!remoteJid.endsWith("@s.whatsapp.net")) continue;

      const text = (
        msg.message.conversation ||
        (msg.message.extendedTextMessage && msg.message.extendedTextMessage.text) ||
        ""
      ).trim();

      if (!/^confirm\b/i.test(text)) continue;

      const senderDigits = extractPhoneDigits(remoteJid);
      if (!senderDigits) continue;
      const phoneE164 = "+" + senderDigits;

      const res = await db.query(
        `SELECT order_number, customer_name, total
         FROM orders
         WHERE phone_e164 = $1 AND status = 'Pending'
         ORDER BY created_at DESC
         LIMIT 1`,
        [phoneE164]
      );

      if (res.rows.length === 0) continue;
      const ord = res.rows[0];

      await db.query(
        "UPDATE orders SET status = 'Confirmed' WHERE order_number = $1",
        [ord.order_number]
      );

      console.log(`✓ [Order Auto-Confirmed via WhatsApp] order=${ord.order_number}`);

      await sendWhatsAppText(
        phoneE164,
        `✅ *JazakAllah ${ord.customer_name}!* Your Aye Noor order *#${ord.order_number}* (Rs. ${Number(ord.total).toLocaleString("en-PK")}) is now *CONFIRMED* and queued for dispatch.`
      );

      await sendWhatsAppText(
        OWNER_NUMBER,
        `✅ *Order Confirmed by Customer*\nOrder: *#${ord.order_number}*\nCustomer: ${ord.customer_name} (${phoneE164})\nStatus updated to: *Confirmed*`
      );
    } catch (err) {
      console.warn("⚠️ Incoming WhatsApp reply handler warning:", err.message);
    }
  }
}

async function initWhatsApp(onReady) {
  if (onReady) onConnectedCallback = onReady;
  if (isInitializing || isConnected) return;
  isInitializing = true;

  try {
    const baileys = await import("@whiskeysockets/baileys");
    const makeWASocket = baileys.default?.default || baileys.default || baileys.makeWASocket;
    const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys;

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    let version = [2, 3000, 1015901307];
    try {
      const latest = await fetchLatestBaileysVersion();
      if (latest && latest.version) version = latest.version;
    } catch {}

    sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      browser: ["Aye Noor Store", "Chrome", "1.0.0"],
      syncFullHistory: false
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", update => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log("\n========================================================");
        console.log("📱 SCAN THIS QR CODE ONCE WITH YOUR SPARE SENDER WHATSAPP");
        console.log("   (WhatsApp -> Linked Devices -> Link a Device)");
        console.log("========================================================\n");
        qrcode.generate(qr, { small: true });
      }

      if (connection === "open") {
        isConnected = true;
        isInitializing = false;
        const me = sock.user ? sock.user.id.split(":")[0] : "linked-device";
        console.log(`✓ [WhatsApp Live Connected] Sender session active (+${me})`);
        if (typeof onConnectedCallback === "function") onConnectedCallback();
      }

      if (connection === "close") {
        isConnected = false;
        isInitializing = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        if (loggedOut) {
          console.error("⚠️ WhatsApp sender device was logged out from phone. Delete .whatsapp_auth folder and restart to scan again.");
        } else {
          console.log("↻ WhatsApp connection reset — reconnecting automatically in 4s...");
          setTimeout(() => initWhatsApp(), 4000);
        }
      }
    });

    sock.ev.on("messages.upsert", handleIncomingMessages);
  } catch (err) {
    isInitializing = false;
    console.error("❌ Failed to initialize WhatsApp client:", err.message);
  }
}

async function sendWhatsAppText(recipientPhone, text) {
  if (!sock || !isConnected) {
    throw new Error("WhatsApp sender is not connected yet (waiting for QR scan or reconnect)");
  }
  const jid = toJid(recipientPhone);

  // Verify number is registered on WhatsApp before sending
  const [result] = await sock.onWhatsApp(jid);
  if (!result || !result.exists) {
    throw new Error(`Recipient number ${recipientPhone} is not registered on WhatsApp`);
  }

  await sock.sendMessage(result.jid || jid, { text });
}

function isWhatsAppReady() {
  return isConnected;
}

module.exports = {
  initWhatsApp,
  sendWhatsAppText,
  isWhatsAppReady
};
