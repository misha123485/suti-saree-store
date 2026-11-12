#!/usr/bin/env node
// Check a ChatGPT feed (JSONL) against OpenAI's required fields. Read-only.
//
// Run it FROM the repo folder (C:\Users\bapan\suti-saree-store):
//   node scripts/check-chatgpt-feed.mjs https://www.sutisaree.com/api/chatgpt-feed
//   node scripts/check-chatgpt-feed.mjs "C:\Users\bapan\Downloads\download (2)"
import { readFileSync } from 'node:fs';

const src = process.argv[2];
if (!src) {
  console.error('Usage: node scripts/check-chatgpt-feed.mjs <feed URL or file path>');
  process.exit(1);
}
const text = /^https?:\/\//i.test(src) ? await (await fetch(src)).text() : readFileSync(src, 'utf8');
const lines = text.split(/\r?\n/).filter((l) => l.trim());

const REQUIRED = ['item_id', 'title', 'description', 'url', 'brand', 'seller_name', 'image_url', 'availability', 'price'];
const AVAIL = new Set(['in_stock', 'out_of_stock', 'pre_order', 'backorder', 'unknown']);
const issues = [];
const ids = new Set();
const groups = new Map();
let avifMain = 0, relUrl = 0, inStock = 0, withReviews = 0, withReturns = 0;

lines.forEach((line, i) => {
  const n = i + 1;
  let r;
  try { r = JSON.parse(line); } catch { issues.push(`line ${n}: invalid JSON`); return; }
  for (const k of REQUIRED) if (r[k] === undefined || r[k] === null || r[k] === '') issues.push(`line ${n} (${r.item_id}): missing ${k}`);
  if (r.availability && !AVAIL.has(r.availability)) issues.push(`line ${n}: bad availability ${r.availability}`);
  if (r.price && !/^\d+(\.\d+)? [A-Z]{3}$/.test(r.price)) issues.push(`line ${n}: bad price "${r.price}"`);
  if (r.sale_price && parseFloat(r.sale_price) >= parseFloat(r.price)) issues.push(`line ${n}: sale_price must be lower than price`);
  if (ids.has(r.item_id)) issues.push(`line ${n}: duplicate item_id ${r.item_id}`);
  ids.add(r.item_id);
  if (r.group_id && r.group_id === r.item_id) issues.push(`line ${n}: group_id equals item_id`);
  if (r.group_id) {
    const key = `${r.group_id}|${JSON.stringify(r.variant_dict)}`;
    if (groups.has(key)) issues.push(`line ${n}: duplicate variant option combo in group ${r.group_id}`);
    groups.set(key, 1);
  }
  if (r.image_url && !/^https?:\/\//i.test(r.image_url)) { relUrl++; issues.push(`line ${n}: image_url not absolute`); }
  if (r.url && !/^https?:\/\//i.test(r.url)) issues.push(`line ${n}: url not absolute`);
  if (/\.avif(\?|$)/i.test(r.image_url || '')) avifMain++;
  if (r.availability === 'in_stock') inStock++;
  if (r.review_count > 0) withReviews++;
  if (r.accepts_returns === true) withReturns++;
});

console.log(`Rows: ${lines.length}   Unique item_ids: ${ids.size}   In stock: ${inStock}`);
console.log(`With reviews: ${withReviews}   With returns info: ${withReturns}`);
console.log(`Main image is AVIF (OpenAI prefers JPEG/PNG): ${avifMain}`);
if (issues.length) {
  console.log(`\n${issues.length} ISSUE(S):`);
  issues.slice(0, 50).forEach((x) => console.log(' - ' + x));
  if (issues.length > 50) console.log(` ... and ${issues.length - 50} more`);
  process.exit(2);
}
console.log('\nNo blocking problems found.');
