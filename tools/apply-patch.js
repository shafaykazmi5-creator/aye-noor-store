"use strict";
// Aye Noor patch tool: applies a patch file made of NEW / EDIT / APPEND / DELETE blocks.
// Nothing is written unless EVERY block checks out first.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const root = process.cwd();
const patchFile = process.argv[2];
const MARK = "@@@ ";

function fail(message) {
  console.error("\nPATCH NOT APPLIED - no files were changed.\nReason: " + message);
  process.exit(1);
}

if (!patchFile || !fs.existsSync(patchFile)) fail("patch file not found.");
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  if (pkg.name !== "aye-noor") throw new Error("wrong project");
} catch (e) {
  fail("run this from the Aye Noor project folder (the one that contains server.js and package.json).");
}

// ---------- 1. read the patch ----------
const lines = fs.readFileSync(patchFile, "utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").split("\n");
const ops = [];
let op = null, part = null;

function startOp(type, file) {
  op = { type, file, edits: [], text: [] };
  ops.push(op);
  part = null;
}

for (const line of lines) {
  if (line.startsWith(MARK)) {
    const rest = line.slice(MARK.length).trim();
    const space = rest.indexOf(" ");
    const cmd = (space === -1 ? rest : rest.slice(0, space)).toUpperCase();
    const arg = space === -1 ? "" : rest.slice(space + 1).trim();
    if (cmd === "NEW" || cmd === "APPEND" || cmd === "EDIT" || cmd === "DELETE") { startOp(cmd, arg); continue; }
    if (cmd === "FIND") { if (!op || op.type !== "EDIT") fail("FIND used outside an EDIT block."); part = { find: [], replace: [], target: "find" }; op.edits.push(part); continue; }
    if (cmd === "REPLACE") { if (!part) fail("REPLACE without FIND."); part.target = "replace"; continue; }
    if (cmd === "END") { op = null; part = null; continue; }
    fail("unknown marker: " + line);
  }
  if (!op) { if (line.trim() === "") continue; fail("text found outside any block: " + line.slice(0, 60)); }
  if (op.type === "NEW" || op.type === "APPEND") op.text.push(line);
  else if (op.type === "EDIT" && part) part[part.target].push(line);
}

// ---------- 2. safety: only files inside the project ----------
function safePath(file) {
  if (!file) fail("a block has no file path.");
  const full = path.resolve(root, file);
  const rel = path.relative(root, full);
  const segments = rel.split(path.sep);
  if (rel.startsWith("..") || path.isAbsolute(rel)) fail("path is outside the project: " + file);
  if (segments.some(s => s === "node_modules" || s === ".git") || /^\.env/.test(segments[segments.length - 1])) fail("protected path: " + file);
  return full;
}

// ---------- 3. work out the result of every block in memory ----------
const results = new Map();   // full path -> { rel, content, eol, bom, isNew, remove, changes }
const log = [];

function load(file) {
  const full = safePath(file);
  if (results.has(full)) return results.get(full);
  let entry;
  if (fs.existsSync(full)) {
    let raw = fs.readFileSync(full, "utf8");
    const bom = raw.charCodeAt(0) === 0xFEFF;
    if (bom) raw = raw.slice(1);
    const eol = raw.includes("\r\n") ? "\r\n" : "\n";
    entry = { rel: file, content: raw.replace(/\r\n/g, "\n"), eol, bom, isNew: false, remove: false, changes: 0 };
  } else {
    entry = { rel: file, content: null, eol: "\n", bom: false, isNew: true, remove: false, changes: 0 };
  }
  results.set(full, entry);
  return entry;
}

for (const o of ops) {
  const e = load(o.file);
  if (o.type === "NEW") {
    e.content = o.text.join("\n").replace(/\n+$/, "") + "\n";
    e.remove = false; e.changes = 1; log.push((e.isNew ? "create  " : "replace ") + o.file);
  } else if (o.type === "APPEND") {
    if (e.content === null) fail("cannot append, file does not exist: " + o.file);
    e.content = e.content.replace(/\n*$/, "\n") + "\n" + o.text.join("\n").replace(/\n+$/, "") + "\n";
    e.changes += 1; log.push("append  " + o.file);
  } else if (o.type === "DELETE") {
    if (e.content === null) { log.push("skip    " + o.file + " (already gone)"); continue; }
    e.remove = true; log.push("delete  " + o.file);
  } else if (o.type === "EDIT") {
    if (e.content === null) fail("cannot edit, file does not exist: " + o.file);
    o.edits.forEach((ed, i) => {
      const find = ed.find.join("\n"), repl = ed.replace.join("\n");
      if (!find.trim()) fail("empty FIND in " + o.file);
      const count = e.content.split(find).length - 1;
      if (count !== 1) fail("in " + o.file + ", change #" + (i + 1) + " should match exactly once but matched " + count + " times.\nStarts with: " + find.split("\n")[0].trim().slice(0, 80) + "\n(If you already applied this patch once, that is normal - it cannot be applied twice. Otherwise your file differs from what the patch expects: send me that file.)");
      e.content = e.content.split(find).join(repl);
      e.changes += 1;
    });
    log.push("edit    " + o.file + " (" + o.edits.length + " change" + (o.edits.length === 1 ? "" : "s") + ")");
  }
}

// ---------- 4. check the new content is valid before touching anything ----------
let ejs = null;
try { ejs = require(path.join(root, "node_modules", "ejs")); } catch (e) { /* optional */ }
for (const [full, e] of results) {
  if (e.remove || e.content === null) continue;
  if (full.endsWith(".js")) {
    const tmp = path.join(os.tmpdir(), "ayenoor-check-" + process.pid + ".js");
    fs.writeFileSync(tmp, e.content);
    try { execFileSync(process.execPath, ["--check", tmp], { stdio: "pipe" }); }
    catch (err) { fs.unlinkSync(tmp); fail("the new " + e.rel + " would have a JavaScript syntax error:\n" + String(err.stderr || err.message).split("\n").slice(0, 6).join("\n")); }
    fs.unlinkSync(tmp);
  } else if (full.endsWith(".json")) {
    try { JSON.parse(e.content); } catch (err) { fail("the new " + e.rel + " would not be valid JSON."); }
  } else if (full.endsWith(".ejs") && ejs) {
    try { ejs.compile(e.content, { filename: full }); } catch (err) { fail("the new " + e.rel + " has a template error:\n" + String(err.message).split("\n").slice(0, 6).join("\n")); }
  }
}

// ---------- 5. write ----------
for (const [full, e] of results) {
  if (e.remove) { if (fs.existsSync(full)) fs.unlinkSync(full); continue; }
  if (e.content === null) continue;
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const body = e.content.replace(/\n/g, e.eol);
  fs.writeFileSync(full, (e.bom ? "\uFEFF" : "") + body, "utf8");
}
console.log("\nPatch applied:\n  " + log.join("\n  ") + "\n");