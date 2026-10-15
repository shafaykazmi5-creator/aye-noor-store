"use strict";
require("dotenv").config();
const { Pool } = require("pg");

let connectionString = process.env.DATABASE_URL || "";

if (!connectionString) {
  console.warn("⚠️ Warning: DATABASE_URL is not set in .env. Database features will be inactive.");
} else if (connectionString.includes("sslmode=require") && !connectionString.includes("uselibpqcompat")) {
  connectionString = connectionString.replace("sslmode=require", "sslmode=verify-full");
}

const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");

const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: true }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};