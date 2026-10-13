"use strict";

const path = require("path");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

// Don't tell the world which software runs the server
app.disable("x-powered-by");

// Serve the storefront files (HTML, CSS, JS, images) from the "public" folder.
// Anything in "public" is visible to every visitor, so never put secrets there.
app.use(express.static(path.join(__dirname, "public")));

// A simple "is the server alive?" check. Open http://localhost:3000/health
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Any address that doesn't exist
app.use((req, res) => {
  res.status(404).send("Page not found");
});

// Any unexpected error: log the details privately, show visitors a safe message
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send("Something went wrong. Please try again.");
});

app.listen(PORT, () => {
  console.log(`Aye Noor is running at http://localhost:${PORT}`);
});
