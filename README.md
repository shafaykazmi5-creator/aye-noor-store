# Aye Noor - Handcrafted Candles Storefront

100% Made-to-Order e-commerce storefront built with Node.js, Express, EJS, PostgreSQL, two-way Excel catalog sync, and automated WhatsApp order notifications.

## Required Environment Variables (.env)
- PORT=3000
- DATABASE_URL=postgresql://...
- ADMIN_SECRET_PATH=/an-panel-7x9k
- ADMIN_PASSWORD=<strong-password-min-8-chars>
- OWNER_WHATSAPP_NUMBER=923325007200
- SITE_URL=http://localhost:3000 (Set to your live https:// domain in production)

## Commands
- npm run dev - Start storefront, outbox worker, and two-way Excel sync
- node db/sync-products.js - Manually sync Aye_Noor_Product_Catalog.xlsx with PostgreSQL
