import fs from 'node:fs';

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error('SQL file ka path do.');
  process.exit(1);
}
const buf = fs.readFileSync(file);
let enc = 'utf8';
let sql;
if (buf[0] === 0xff && buf[1] === 0xfe) { enc = 'utf16le (BOM)'; sql = buf.toString('utf16le').slice(1); }
else if (buf[0] === 0xfe && buf[1] === 0xff) { enc = 'utf16be (BOM)'; sql = Buffer.from(buf).swap16().toString('utf16le').slice(1); }
else if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) { enc = 'utf8 (BOM)'; sql = buf.toString('utf8').slice(1); }
else if (buf.length > 4 && buf[1] === 0 && buf[3] === 0) { enc = 'utf16le (no BOM)'; sql = buf.toString('utf16le'); }
else sql = buf.toString('utf8');
console.log('File encoding: ' + enc + ', size: ' + Math.round(sql.length / 1e6) + ' MB text');

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
      } else if (c === "'") { inStr = true; wasStr = true; cur = ''; }
      else if (c === ',') { row.push(wasStr ? cur : cur.trim()); cur = ''; wasStr = false; }
      else if (c === ')') { row.push(wasStr ? cur : cur.trim()); i++; break; }
      else cur += c;
    }
    rows.push(row);
  }
  return rows;
}
function readTable(suffix) {
  const re = new RegExp('INSERT\\s+(?:IGNORE\\s+)?INTO\\s+`(wp_' + suffix + ')`', 'g');
  let m, all = [], name = null;
  while ((m = re.exec(sql))) {
    const v = sql.indexOf('VALUES', re.lastIndex);
    if (v < 0) continue;
    name = m[1];
    all = all.concat(parseValues(sql, v + 6));
  }
  return { name, rows: all };
}

const lines = [];
const say = (s = '') => { lines.push(s); console.log(s); };

const options = readTable('options');
const opt = new Map(options.rows.map(r => [r[1], r[2]]));
const rmSitemap = opt.get('rank-math-options-sitemap') || '';
const rmTitles = opt.get('rank-math-options-titles') || '';
const rmModules = opt.get('rank_math_modules') || '';

say('=== 1. RANK MATH SITEMAP SETTINGS ===');
say('Rank Math options mile: sitemap=' + (rmSitemap ? 'haan' : 'NAHI') + ', titles=' + (rmTitles ? 'haan' : 'NAHI'));
say('Sitemap module: ' + (/sitemap/.test(rmModules) ? 'ON' : '(pata nahi / off)'));
const scalar = (src, key) => {
  const m = src.match(new RegExp('"' + key + '";(?:s:\\d+:"([^"]*)";|b:([01]);|i:(-?\\d+);)'));
  return m ? (m[1] ?? m[2] ?? m[3]) : null;
};
for (const k of ['items_per_page', 'include_images', 'include_featured_image', 'exclude_posts', 'exclude_terms', 'ping_search_engines']) {
  const v = scalar(rmSitemap, k); if (v !== null) say(`  ${k} = ${v === '' ? '(khali)' : v}`);
}
const sitemapFlags = {};
for (const m of rmSitemap.matchAll(/"((?:pt|tax)_[a-z0-9_]+)_sitemap";(?:s:\d+:"([^"]*)";|b:([01]);)/g)) {
  sitemapFlags[m[1]] = (m[2] ?? (m[3] === '1' ? 'on' : 'off'));
  say(`  ${m[1]}_sitemap = ${sitemapFlags[m[1]]}`);
}
say('  -- titles (global noindex settings) --');
const globalNoindex = {};
for (const m of rmTitles.matchAll(/"((?:pt|tax)_[a-z0-9_]+)_robots";a:\d+:\{([^}]*)\}/g)) {
  globalNoindex[m[1]] = /noindex/.test(m[2]);
  say(`  ${m[1]}_robots = ${globalNoindex[m[1]] ? 'NOINDEX' : '(index)'}`);
}
const enabled = (key) => sitemapFlags[key] !== 'off' && !globalNoindex[key];

const ipp = Number(scalar(rmSitemap, 'items_per_page')) || 200;
say(`  (items per sitemap file: ${ipp}${scalar(rmSitemap, 'items_per_page') ? '' : '  <- default maana, setting nahi mili'})`);

const posts = readTable('posts');
if (!posts.rows.length) { say('\nWordPress posts table nahi mila. INSERT INTO count = ' + (sql.match(/INSERT\s+INTO/g) || []).length); say('File ki shuruaat: ' + JSON.stringify(sql.slice(0, 300))); fs.writeFileSync('old-sitemap-report.txt', lines.join('\n')); process.exit(2); }
const meta = readTable('postmeta');
const noindexPost = new Set();
for (const r of meta.rows) if (r[2] === 'rank_math_robots' && /noindex/.test(r[3] || '')) noindexPost.add(r[1]);
const byId = new Map(posts.rows.map(r => [r[0], { id: r[0], title: r[5], status: r[7], pw: r[10], name: r[11], parent: r[17], type: r[20] }]));
function pagePath(p) {
  const parts = [p.name]; let par = p.parent, g = 0;
  while (par && par !== '0' && byId.has(par) && g++ < 6) { parts.unshift(byId.get(par).name); par = byId.get(par).parent; }
  return parts.join('/');
}
const types = ['post', 'page', 'product'];
say('\n=== 2. POSTS / PAGES / PRODUCTS (published) ===');
const inSitemap = {};
for (const t of types) {
  const pub = [...byId.values()].filter(p => p.type === t && p.status === 'publish' && p.name);
  const noidx = pub.filter(p => noindexPost.has(p.id) || p.pw);
  const ok = pub.filter(p => !(noindexPost.has(p.id) || p.pw));
  inSitemap[t] = ok;
  say(`${t}: published=${pub.length}, noindex/password=${noidx.length}, sitemap me hone chahiye=${ok.length}  -> ${Math.max(1, Math.ceil(ok.length / ipp))} file(s)`);
}
say('\nPAGES jo sitemap me the (page-sitemap.xml):');
for (const p of inSitemap.page) say('  /' + pagePath(p) + '/');
say('\nPAGES jo noindex the (sitemap me NAHI the):');
for (const p of [...byId.values()].filter(p => p.type === 'page' && p.status === 'publish' && (noindexPost.has(p.id) || p.pw))) say('  /' + pagePath(p) + '/');
say('\nBLOG POSTS (pehle 10) - purana URL /slug/ tha, sample:');
for (const p of inSitemap.post.slice(0, 10)) say('  /' + p.name + '/');

const terms = readTable('terms');
const tax = readTable('term_taxonomy');
const tmeta = readTable('termmeta');
const noindexTerm = new Set();
for (const r of tmeta.rows) if (r[2] === 'rank_math_robots' && /noindex/.test(r[3] || '')) noindexTerm.add(r[1]);
const termById = new Map(terms.rows.map(r => [r[0], { name: r[1], slug: r[2] }]));
say('\n=== 3. CATEGORIES / TAGS ===');
for (const tx of ['product_cat', 'product_tag', 'category']) {
  const all = tax.rows.filter(r => r[2] === tx);
  const withItems = all.filter(r => Number(r[5]) > 0);
  const ok = withItems.filter(r => !noindexTerm.has(r[1]));
  say(`${tx}: total=${all.length}, products/posts wale=${withItems.length}, noindex=${withItems.length - ok.length}, sitemap me hone chahiye=${ok.length}`);
  const sample = ok.slice(0, 12).map(r => termById.get(r[1])?.slug).filter(Boolean);
  if (sample.length) say('   sample: ' + sample.join(', '));
}

say('\n=== 4. PURANA sitemap_index.xml AISA BANTA THA (andaaza) ===');
const files = [];
const add = (base, n) => { const k = Math.max(1, Math.ceil(n / ipp)); for (let i = 1; i <= k; i++) files.push(`${base}-sitemap${i > 1 ? i : ''}.xml`); };
const cnt = (tx) => tax.rows.filter(r => r[2] === tx && Number(r[5]) > 0 && !noindexTerm.has(r[1])).length;
if (inSitemap.post.length && enabled('pt_post')) add('post', inSitemap.post.length);
if (inSitemap.page.length && enabled('pt_page')) add('page', inSitemap.page.length);
if (inSitemap.product.length && enabled('pt_product')) add('product', inSitemap.product.length);
if (cnt('category') && enabled('tax_category')) add('category', cnt('category'));
if (cnt('product_cat') && enabled('tax_product_cat')) add('product_cat', cnt('product_cat'));
if (cnt('product_tag') && enabled('tax_product_tag')) add('product_tag', cnt('product_tag'));
for (const f of files) say('  /' + f);
say('\n(Ye andaaza hai. Rank Math settings me jo type OFF ya NOINDEX tha wo list me nahi aata.)');

fs.writeFileSync('old-sitemap-report.txt', lines.join('\n'));
console.log('\nPoora output old-sitemap-report.txt me bhi save hua.');