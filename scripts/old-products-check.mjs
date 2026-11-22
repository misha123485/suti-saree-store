import fs from 'node:fs';
const [file, variantsFile] = process.argv.slice(2);
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
const re = /INSERT\s+(?:IGNORE\s+)?INTO\s+`(wp_posts)`/g;
let m, rows = [];
while ((m = re.exec(sql))) {
  const v = sql.indexOf('VALUES', re.lastIndex);
  if (v < 0) continue;
  rows = rows.concat(parseValues(sql, v + 6));
}
console.log('wp_posts rows:', rows.length);
const products = rows.filter(r => r[20] === 'product' && r[7] === 'publish' && r[11]);
const slugs = new Set(products.map(r => r[11]));
fs.writeFileSync('old-products.txt', [...slugs].sort().join('\n'));
console.log('Purane published products:', slugs.size, ' -> old-products.txt me save');
if (variantsFile) {
  const vs = fs.readFileSync(variantsFile, 'utf8').split(/\r?\n/).map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean).filter(s => s.toLowerCase() !== 'slug');
  const overlap = vs.filter(s => slugs.has(s));
  console.log('\nNaye variants: ' + vs.length);
  console.log('Inme se jo purane site pe ALAG PRODUCT the: ' + overlap.length);
  for (const s of overlap) console.log('  /product/' + s + '/');
  fs.writeFileSync('old-products-overlap.txt', overlap.join('\n'));
  console.log('\nlist old-products-overlap.txt me save hui.');
}