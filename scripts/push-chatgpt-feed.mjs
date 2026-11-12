#!/usr/bin/env node
// Push the ChatGPT product feed to OpenAI over SFTP.
//
// OpenAI does NOT pull a feed URL -- the merchant PUSHES a full snapshot over SFTP
// (jsonl.gz is supported). This script: downloads /api/chatgpt-feed, validates it,
// gzips it and uploads it under a STABLE file name (overwritten on every run).
//
// Env vars:
//   FEED_URL              default https://www.sutisaree.com/api/chatgpt-feed
//   OPENAI_SFTP_HOST      host given by OpenAI after approval
//   OPENAI_SFTP_PORT      default 22
//   OPENAI_SFTP_USER      username given by OpenAI
//   OPENAI_SFTP_PASSWORD  (use this OR the private key)
//   OPENAI_SFTP_PRIVATE_KEY  full private key text (use this OR the password)
//   OPENAI_SFTP_REMOTE_DIR   default "/"   (feed goes in the SFTP root)
//   REMOTE_FILE_NAME      default sutisaree-products.jsonl.gz  (keep it the same forever)
//   DRY_RUN=1             download + validate + gzip, but do not upload
//
// Usage:  node scripts/push-chatgpt-feed.mjs

import { gzipSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const FEED_URL = process.env.FEED_URL || 'https://www.sutisaree.com/api/chatgpt-feed';
const REMOTE_DIR = (process.env.OPENAI_SFTP_REMOTE_DIR || '/').replace(/\/?$/, '/');
const REMOTE_FILE = process.env.REMOTE_FILE_NAME || 'sutisaree-products.jsonl.gz';
const DRY = process.env.DRY_RUN === '1';

const REQUIRED = ['item_id', 'title', 'description', 'url', 'brand', 'seller_name', 'image_url', 'availability', 'price'];
const AVAIL = new Set(['in_stock', 'out_of_stock', 'pre_order', 'backorder', 'unknown']);

function fail(msg) {
  console.error('ERROR: ' + msg);
  process.exit(1);
}

console.log(`Downloading ${FEED_URL} ...`);
const res = await fetch(FEED_URL, { headers: { 'user-agent': 'sutisaree-feed-pusher' } });
if (!res.ok) fail(`feed returned HTTP ${res.status}`);
const text = await res.text();
const lines = text.split('\n').filter((l) => l.trim());
if (lines.length === 0) fail('feed is empty (0 rows) -- refusing to upload an empty snapshot');

// Validate every row; refuse to upload if anything required is broken.
const ids = new Set();
let bad = 0;
lines.forEach((line, i) => {
  let row;
  try {
    row = JSON.parse(line);
  } catch {
    console.error(`line ${i + 1}: invalid JSON`);
    bad++;
    return;
  }
  const missing = REQUIRED.filter((k) => row[k] === undefined || row[k] === null || row[k] === '');
  if (missing.length) {
    console.error(`line ${i + 1} (${row.item_id}): missing ${missing.join(', ')}`);
    bad++;
  }
  if (row.availability && !AVAIL.has(row.availability)) {
    console.error(`line ${i + 1} (${row.item_id}): bad availability "${row.availability}"`);
    bad++;
  }
  if (row.price && !/^\d+(\.\d+)? [A-Z]{3}$/.test(row.price)) {
    console.error(`line ${i + 1} (${row.item_id}): bad price "${row.price}"`);
    bad++;
  }
  if (ids.has(row.item_id)) {
    console.error(`line ${i + 1}: duplicate item_id ${row.item_id}`);
    bad++;
  }
  ids.add(row.item_id);
});
if (bad > 0) fail(`${bad} problem(s) found -- not uploading`);
console.log(`OK: ${lines.length} rows validated.`);

const gz = gzipSync(Buffer.from(lines.join('\n') + '\n', 'utf8'));
console.log(`Compressed to ${(gz.length / 1024).toFixed(1)} KB`);

if (DRY) {
  writeFileSync(REMOTE_FILE, gz);
  console.log(`DRY_RUN: wrote ./${REMOTE_FILE}, not uploading.`);
  process.exit(0);
}

const host = process.env.OPENAI_SFTP_HOST;
const username = process.env.OPENAI_SFTP_USER;
if (!host || !username) fail('OPENAI_SFTP_HOST and OPENAI_SFTP_USER are required');
if (!process.env.OPENAI_SFTP_PASSWORD && !process.env.OPENAI_SFTP_PRIVATE_KEY) {
  fail('set OPENAI_SFTP_PASSWORD or OPENAI_SFTP_PRIVATE_KEY');
}

const { default: SftpClient } = await import('ssh2-sftp-client');
const sftp = new SftpClient();
try {
  await sftp.connect({
    host,
    port: Number(process.env.OPENAI_SFTP_PORT || 22),
    username,
    ...(process.env.OPENAI_SFTP_PRIVATE_KEY
      ? { privateKey: process.env.OPENAI_SFTP_PRIVATE_KEY }
      : { password: process.env.OPENAI_SFTP_PASSWORD }),
  });
  // Upload under a temp name, then rename, so OpenAI never sees a half-written file.
  const tmp = `${REMOTE_DIR}.${REMOTE_FILE}.uploading`;
  await sftp.put(gz, tmp);
  try { await sftp.delete(`${REMOTE_DIR}${REMOTE_FILE}`); } catch { /* first upload */ }
  await sftp.rename(tmp, `${REMOTE_DIR}${REMOTE_FILE}`);
  console.log(`Uploaded ${REMOTE_DIR}${REMOTE_FILE} to ${host}`);
} finally {
  await sftp.end().catch(() => {});
}
