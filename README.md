# Aye Noor website

Plain HTML/CSS/JavaScript storefront served by a Node.js + Express server.
PostgreSQL, the admin panel, orders and WhatsApp notifications come in later steps.

## Run it (Windows PowerShell / VS Code terminal)
1. `npm.cmd install`   (first time only, or after package.json changes)
2. `npm.cmd run dev`   (starts the site and restarts it when you edit server.js)
3. Open http://localhost:3000
4. Stop the server with Ctrl + C

## Folders
- `server.js`  the server
- `public/`    everything visitors can see (index.html, styles.css, script.js, products.js)

Demo data only: no real checkout, payments or WhatsApp messages yet.
