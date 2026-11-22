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
  const re = new RegExp('INSERT\\s+(?:IGNORE\\s+)?INTO\\s+`([A-Za-z0-9_]*' + suffix + ')`', 'g');
  let m, all = [], name = null;
  while ((m = re.exec(sql))) {
    const v = sql.indexOf('VALUES', re.lastIndex);
    if (v < 0) continue;
    name = m[1];
    all = all.concat(parseValues(sql, v + 6));
  }
  return { name, rows: all };
}

const out = [];
const P = (x = '') => { out.push(x); console.log(x); };
const cut = (v, n = 60) => String(v ?? '').replace(/\s+/g, ' ').slice(0, n);
for (const t of ['posts', 'options', 'terms', 'term_taxonomy']) {
  const i = sql.search(new RegExp('INSERT\\s+(?:IGNORE\\s+)?INTO\\s+`[A-Za-z0-9_]*' + t + '`'));
  P('\n##### ' + t + ' - INSERT ki shuruaat (raw):');
  P(i < 0 ? '(INSERT mila hi nahi)' : JSON.stringify(sql.slice(i, i + 450)));
  const r = readTable(t);
  P('table=' + r.name + ' rows=' + r.rows.length + ' columns(pehli row)=' + (r.rows[0] ? r.rows[0].length : '-'));
  for (const row of r.rows.slice(0, 2)) P('  row: ' + row.slice(0, 24).map((v, k) => k + '=' + cut(v, 28)).join(' | '));
  if (t === 'posts') {
    const cnt = {};
    for (const row of r.rows) { const k = 'col20=' + cut(row[20], 20) + ' col7=' + cut(row[7], 12); cnt[k] = (cnt[k] || 0) + 1; }
    P('  type/status ginti (top 8):');
    Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([k, v]) => P('   ' + v + '  ' + k));
  }
  if (t === 'options') {
    P('  option names jisme "rank" ya "permalink" hai:');
    r.rows.filter(row => /rank|permalink/i.test(row[1] || '')).slice(0, 12).forEach(row => P('   ' + cut(row[1], 60)));
  }
}
fs.writeFileSync('old-sitemap-debug.txt', out.join('\n'));
console.log('\nSaved: old-sitemap-debug.txt');