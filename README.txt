AYE NOOR — FLOATING WHATSAPP BUTTON PATCH

Files included:
- views/partials/footer.ejs
- public/styles.css

Apply:
1. Stop the development server (Ctrl+C in the VS Code terminal).
2. Back up your existing views/partials/footer.ejs and public/styles.css.
3. Extract this patch directly into the root of your existing AyeNoor_Website_Starter folder and allow these two files to be replaced.
4. Run npm.cmd run dev.
5. Visit the home page, shop, product page, contact page and checkout page. The green WhatsApp us button should appear at the lower-right of customer-facing pages.

Button target:
+92 337 9201434 (wa.me format: 923379201434)
Prefilled message: “Assalam-o-Alaikum Aye Noor! I have a question about your candles. Please assist me.”

Important behavior:
WhatsApp click-to-chat opens the conversation and fills the message draft. It cannot silently send a message from the visitor's WhatsApp account; the visitor must press Send in WhatsApp. This behavior is described by the official WhatsApp Help Center: https://faq.whatsapp.com/5913398998672934

This patch does not include package files, .env, .git, node_modules, .whatsapp_auth, database credentials, or WhatsApp session files. It does not change your existing order-notification/WhatsApp backend implementation.
