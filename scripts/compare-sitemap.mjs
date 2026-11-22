import fs from 'node:fs';
const [file, siteArg] = process.argv.slice(2);
const SITE = (siteArg || 'https://www.sutisaree.com').replace(/\/$/, '');
if (!file || !fs.existsSync(file)) { console.error('SQL file ka path do.'); process.exit(1); }
const buf = fs.readFileSync(file);
let sql;
if (buf[0] === 0xff && buf[1] === 0xfe) sql = buf.toString('utf16le').slice(1);
else if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) sql = buf.toString('utf8').slice(1);
else if (buf.length > 4 && buf[1] === 0 && buf[3] === 0) sql = buf.toString('utf16le');
else sql = buf.toString('utf8');
function parseValues(text, start) {
  const rows = []; let i = start; const n = text.length;
  while (i < n) {
    while (i < n && /[\s,]/.test(text[i])) i++;
    if (text[i] === ';' || i >= n) break;
    if (text[i] !== '(') { i++; continue; }
    i++;
    const row = []; let cur = '', inStr = false, wasStr = false;
    for (; i < n; i++) {
      const c = text[i];
      if (inStr) {
        if (c === '\\') { cur += text[i + 1]; i++; }
        else if (c === "'") { if (text[i + 1] === "'") { cur += "'"; i++; } else inStr = false; }
        else cur += c;
      } else if (c === "'") { inStr = true; wasStr = true; cur = ''; }
      else if (c === ',') { row.push(wasStr ? cur : cur.trim()); cur = ''; wasStr = false; }
      else if (c === ')') { row.push(wasStr ? cur : cur.trim()); i++; break; }
      else cur += c;
    }
    rows.push(row);
  }
  return rows;
}
function readTable(name) {
  const re = new RegExp('INSERT\\s+(?:IGNORE\\s+)?INTO\\s+`wp_' + name + '`', 'g');
  let m, all = [];
  while ((m = re.exec(sql))) {
    const v = sql.indexOf('VALUES', re.lastIndex);
    if (v < 0) continue;
    all = all.concat(parseValues(sql, v + 6));
  }
  return all;
}
const posts = readTable('posts');
const meta = readTable('postmeta');
const noindexPost = new Set();
for (const r of meta) if (r[2] === 'rank_math_robots' && /noindex/.test(r[3] || '')) noindexPost.add(r[1]);
const byId = new Map(posts.map(r => [r[0], { id: r[0], status: r[7], pw: r[10], name: r[11], parent: r[17], type: r[20] }]));
const pagePath = (p) => {
  const parts = [p.name]; let par = p.parent, g = 0;
  while (par && par !== '0' && byId.has(par) && g++ < 6) { parts.unshift(byId.get(par).name); par = byId.get(par).parent; }
  return parts.join('/');
};
const okPost = (t) => [...byId.values()].filter(p => p.type === t && p.status === 'publish' && p.name && !noindexPost.has(p.id) && !p.pw);
const terms = readTable('terms');
const tax = readTable('term_taxonomy');
const tmeta = readTable('termmeta');
const noindexTerm = new Set();
for (const r of tmeta) if (r[2] === 'rank_math_robots' && /noindex/.test(r[3] || '')) noindexTerm.add(r[1]);
const slugOf = new Map(terms.map(r => [r[0], r[2]]));
const termSlugs = (tx) => tax.filter(r => r[2] === tx && Number(r[5]) > 0 && !noindexTerm.has(r[1])).map(r => slugOf.get(r[1])).filter(Boolean);
const old = {
  product: new Set(okPost('product').map(p => p.name)),
  page: new Set(okPost('page').map(p => pagePath(p))),
  post: new Set(okPost('post').map(p => p.name)),
  product_cat: new Set(termSlugs('product_cat')),
  product_tag: new Set(termSlugs('product_tag')),
};
const locs = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1].replace(/&amp;/g, '&'));
async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'sitemap-compare' } });
  if (!res.ok) throw new Error(url + ' -> HTTP ' + res.status);
  return res.text();
}
const indexUrl = SITE + '/sitemap_index.xml';
console.log('Live index:', indexUrl);
const files = locs(await get(indexUrl));
console.log('Index me files (' + files.length + '):'); files.forEach(f => console.log('  ' + f));
const live = { product: [], page: [], post: [], product_cat: [], product_tag: [], other: [] };
for (const f of files) {
  const kind = (f.match(/\/([a-z_]+)-sitemap\d*\.xml$/) || [])[1];
  const urls = locs(await get(f));
  (live[kind] || live.other).push(...urls);
  console.log('  ' + f.split('/').pop() + ': ' + urls.length + ' URL');
}
const path = (u) => u.replace(SITE, '').replace(/^\/+|\/+$/g, '');
const nw = {
  product: new Set(live.product.map(u => path(u).replace(/^product\//, ''))),
  page: new Set(live.page.map(u => path(u))),
  post: new Set(live.post.map(u => path(u).replace(/^blog\//, ''))),
  product_cat: new Set(live.product_cat.map(u => path(u).split('/').pop())),
  product_tag: new Set(live.product_tag.map(u => path(u).replace(/^product-tag\//, ''))),
};
const out = [];
const say = (s = '') => { out.push(s); console.log(s); };
say('\n=========== PURANA vs NAYA ===========');
for (const k of ['product', 'product_cat', 'product_tag', 'post', 'page']) {
  const o = old[k], n = nw[k];
  const missing = [...o].filter(x => !n.has(x));
  const extra = [...n].filter(x => !o.has(x));
  say('\n[' + k + '] purana=' + o.size + '  naya=' + n.size + '  | naye me NAHI=' + missing.length + '  | naya EXTRA=' + extra.length);
  if (missing.length) { say('  NAYE ME NAHI (pehle 25):'); missing.slice(0, 25).forEach(x => say('    ' + x)); }
  if (extra.length) { say('  NAYA EXTRA (pehle 25):'); extra.slice(0, 25).forEach(x => say('    ' + x)); }
}
fs.writeFileSync('compare-sitemap-report.txt', out.join('\n'));
console.log('\nPoora report compare-sitemap-report.txt me save hua.');