/**
 * Redirect audit for next.config.js (read-only).
 *
 *   npx tsx scripts/audit-redirects.ts                      # static checks + table
 *   npx tsx scripts/audit-redirects.ts --live https://www.sutisaree.com
 *                                                            # also hits the live site
 *
 * Static checks: redirect chains (a destination that is itself a redirect source),
 * loops, non-permanent redirects, and that every /product-tag/ redirect is listed in
 * lib/seo-redirects.ts (so the sitemap never lists it).
 * Live check (--live): follows each redirect by hand and reports the first hop status,
 * the destination, the destination's own status (must be 200) and any extra hop.
 * Exit code 1 if anything is wrong.
 */
import { REDIRECTED_TAG_SLUGS } from '../lib/seo-redirects';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nextConfig = require('../next.config.js');

interface Rule {
  source: string;
  destination: string;
  permanent: boolean;
  has?: unknown[];
}

/** Very small path-to-regexp subset: :name, :name*, :name(regex). Enough for this repo. */
function toRegExp(source: string): RegExp {
  let re = '';
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === ':') {
      const m = source.slice(i).match(/^:([A-Za-z_]\w*)(\([^)]*\)|\*|\+)?/);
      if (m) {
        const mod = m[2];
        if (mod === '*') re += '(?:.*)';
        else if (mod === '+') re += '(?:.+)';
        else if (mod && mod.startsWith('(')) re += mod;
        else re += '[^/]+';
        i += m[0].length;
        continue;
      }
    }
    re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    i++;
  }
  return new RegExp(`^${re}/?$`);
}

function sampleFor(source: string): string {
  return source.replace(/:[A-Za-z_]\w*(\([^)]*\)|\*|\+)?/g, 'x').replace(/x\(\\\\d\+\)/, '1');
}

async function main() {
  const liveIdx = process.argv.indexOf('--live');
  const live = liveIdx > -1 ? process.argv[liveIdx + 1].replace(/\/$/, '') : '';
  const rules: Rule[] = (await nextConfig.redirects()).filter((r: Rule) => !r.has);
  const problems: string[] = [];

  const compiled = rules.map((r) => ({ r, re: toRegExp(r.source) }));
  const rows: string[][] = [];

  for (const { r } of compiled) {
    const destPath = r.destination.replace(/:[A-Za-z_]\w*\*?/g, 'x');
    const next = compiled.find((c) => c.r !== r && c.re.test(destPath.replace(/\/$/, '')));
    const note: string[] = [];
    if (next) {
      note.push(`CHAIN -> ${next.r.destination}`);
      problems.push(`chain: ${r.source} -> ${r.destination} -> ${next.r.destination}`);
    }
    if (r.destination.replace(/\/$/, '') === r.source.replace(/\/$/, '')) {
      note.push('LOOP');
      problems.push(`loop: ${r.source}`);
    }
    if (!r.permanent) note.push('temporary (302/307)');
    rows.push([r.source, r.permanent ? '301/308' : '307', r.destination, note.join('; ') || 'ok (static)']);
  }

  // Every tag redirect must be excluded from the sitemap.
  for (const r of rules) {
    const m = r.source.match(/^\/product-tag\/([a-z0-9-]+)$/i);
    if (m && !REDIRECTED_TAG_SLUGS.has(m[1])) {
      problems.push(`tag redirect "${m[1]}" is missing from lib/seo-redirects.ts (sitemap could list it)`);
    }
  }
  for (const slug of Array.from(REDIRECTED_TAG_SLUGS)) {
    if (!rules.some((r) => r.source === `/product-tag/${slug}`)) {
      problems.push(`lib/seo-redirects.ts lists "${slug}" but next.config.js has no redirect for it`);
    }
  }

  if (live) {
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i];
      const url = live + sampleFor(r.source) + '/';
      try {
        const first = await fetch(url, { redirect: 'manual' });
        const loc = first.headers.get('location') || '';
        let destStatus = '-';
        if (loc) {
          const dest = loc.startsWith('http') ? loc : live + loc;
          const second = await fetch(dest, { redirect: 'manual' });
          destStatus = String(second.status);
          if (second.status >= 300 && second.status < 400) {
            problems.push(`live chain: ${r.source} -> ${loc} -> ${second.headers.get('location')}`);
          } else if (second.status !== 200) {
            problems.push(`live: destination of ${r.source} returns ${second.status} (${loc})`);
          }
        } else {
          problems.push(`live: ${r.source} did not redirect (status ${first.status})`);
        }
        rows[i][3] += ` | live: ${first.status} -> ${loc || '(none)'} -> ${destStatus}`;
      } catch (e) {
        problems.push(`live: ${r.source} failed (${(e as Error).message})`);
      }
    }
  }

  console.log('| Source | Status | Destination | Check |');
  console.log('|---|---|---|---|');
  for (const row of rows) console.log(`| \`${row[0]}\` | ${row[1]} | \`${row[2]}\` | ${row[3]} |`);
  console.log(`\n${rules.length} redirects checked.`);
  if (problems.length) {
    console.log(`\nPROBLEMS (${problems.length}):`);
    for (const p of problems) console.log(' - ' + p);
    process.exit(1);
  }
  console.log('No chains, loops or sitemap mismatches found.');
}

main();
