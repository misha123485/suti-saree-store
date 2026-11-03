// Purane WordPress/WooCommerce backup (.sql) se saare published URLs nikalta hai
// aur check karta hai ki naye site par har URL chal raha hai ya 404 de raha hai.
//
// Chalane ka tareeka (PowerShell, repo folder ke andar):
//   node scripts/check-old-urls.mjs "C:\backup\suti backup\manual backup\oct\3\parm9eAk4Fc4tv.sql"
// Optional 2nd argument = site (default https://sutisaree.com)
//
// Ye script sirf PADHTA hai. Na database badalta hai, na site. Output: old-urls-report.csv
import fs from 'node:fs';

const file = process.argv[2];
const SITE = (process.argv[3] || 'https://sutisaree.com').replace(/\/$/, '');
if (!file || !fs.existsSync(file)) {
  console.error('SQL file ka path do. Example:\n  node scripts/check-old-urls.mjs "C:\\backup\\...\\file.sql"');
  process.exit(1);
}

const sql = fs.readFileSync(file, 'utf8');

// ---- SQL "INSERT INTO `table` VALUES (...),(...);" parser (quotes/escapes handle karta hai)
function parseValues(text, start) {
  const rows = [];
  let i = start;
  const n = text.length;
  while (i < n) {
    while (i < n && /[\s,]/.test(text[i])) i++;
    if (text[i] === ';' || i >= n) break;
    if (text[i] !== '(') { i++; continue; }
    i++;
    const row = [];
    let cur = '';
    let inStr = false;
    let wasStr = false;
    for (; i < n; i++) {
      const c = text[i];
      if (inStr) {
        if (c === '\\') { cur += text[i + 1]; i++; }
        else if (c === "'") {
          if (text[i + 1] === "'") { cur += "'"; i++; } else inStr = false;
        } else cur += c;
      } else if (c === "'") { inStr = true; wasStr = true; }
      else if (c === ',') { row.push(wasStr ? cur : cur.trim()); cur = ''; wasStr = false; }
      else if (c === ')') { row.push(wasStr ? cur : cur.trim()); i++; break; }
      else cur += c;
    }
    rows.push(row);
  }
  return rows;
}

function readTable(suffix) {
  const re = new RegExp('INSERT INTO `([A-Za-z0-9_]*' + suffix + ')`[^V]*VALUES', 'g');
  let m, all = [], name = null;
  while ((m = re.exec(sql))) {
    name = m[1];
    all = all.concat(parseValues(sql, re.lastIndex));
  }
  return { name, rows: all };
}

const posts = readTable('posts');
if (!posts.rows.length) {
  console.error('Is file mein WordPress ka "posts" table nahi mila. Shayad ye Supabase ka backup hai, WordPress ka nahi.');
  process.exit(2);
}
// wp_posts columns: 0 ID,5 post_title,7 post_status,11 post_name,17 post_parent,20 post_type
const byId = new Map();
for (const r of posts.rows) byId.set(r[0], { name: r[11], parent: r[17], status: r[7], type: r[20], title: r[5] });
function pagePath(p) {
  const parts = [p.name];
  let guard = 0, par = p.parent;
  while (par && par !== '0' && byId.has(par) && guard++ < 6) { parts.unshift(byId.get(par).name); par = byId.get(par).parent; }
  return parts.join('/');
}

const urls = new Map(); // path -> label
for (const p of byId.values()) {
  if (p.status !== 'publish' || !p.name) continue;
  if (p.type === 'page') urls.set('/' + pagePath(p) + '/', 'page: ' + p.title);
  else if (p.type === 'post') { urls.set('/' + p.name + '/', 'post: ' + p.title); urls.set('/blog/' + p.name + '/', 'post(/blog): ' + p.title); }
  else if (p.type === 'product') urls.set('/product/' + p.name + '/', 'product: ' + p.title);
}

// product categories / tags
const terms = readTable('terms');
const tax = readTable('term_taxonomy');
const slugById = new Map(terms.rows.map(r => [r[0], r[2]]));
for (const r of tax.rows) {
  const slug = slugById.get(r[1]);
  if (!slug) continue;
  if (r[2] === 'product_cat') urls.set('/product-category/' + slug + '/', 'category');
  if (r[2] === 'product_tag') urls.set('/product-tag/' + slug + '/', 'tag');
  if (r[2] === 'category') urls.set('/category/' + slug + '/', 'blog category');
}

console.log(`WordPress tables mile (${posts.name}). ${urls.size} purane URLs check karne hain: ${SITE}`);

const list = [...urls.entries()];
const out = [];
let done = 0;
async function check([path, label]) {
  let status = 'ERR', finalUrl = '';
  try {
    const res = await fetch(SITE + path, { redirect: 'follow', headers: { 'user-agent': 'url-checker' } });
    status = res.status; finalUrl = res.url.replace(SITE, '');
  } catch (e) { status = 'ERR ' + (e.cause?.code || e.message); }
  out.push({ path, label, status, finalUrl });
  if (++done % 100 === 0) console.log(done + '/' + list.length);
}
const queue = list.slice();
await Promise.all(Array.from({ length: 6 }, async () => { while (queue.length) await check(queue.shift()); }));

const bad = out.filter(o => o.status !== 200).sort((a, b) => a.path.localeCompare(b.path));
const q = s => '"' + String(s).replace(/"/g, '""') + '"';
fs.writeFileSync('old-urls-report.csv', 'status,old_url,type,landed_on\n' +
  out.sort((a, b) => String(a.status).localeCompare(String(b.status))).map(o => [o.status, o.path, q(o.label), o.finalUrl].join(',')).join('\n'));

console.log(`\nTotal: ${out.length} | OK (200): ${out.length - bad.length} | Problem: ${bad.length}`);
for (const b of bad.slice(0, 60)) console.log(b.status, b.path, '|', b.label);
if (bad.length > 60) console.log('... baaki old-urls-report.csv mein');
console.log('\nPoori report: old-urls-report.csv (repo folder mein). Ye file mujhe bhej do.');
