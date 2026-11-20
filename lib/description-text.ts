/**
 * Product descriptions imported from suppliers / marketplaces often contain
 * raw HTML (<ul><li>, <h4>, <p>, &amp; ...). React prints a string as plain
 * text, so shoppers saw the tags themselves on the product page. These
 * helpers turn such a description into clean readable blocks WITHOUT
 * dangerouslySetInnerHTML (no XSS risk). Plain-text descriptions still work.
 */

export type DescriptionBlock = { kind: 'heading' | 'bullet' | 'text'; text: string };

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  hellip: '…', bull: '•', times: '×', rupee: '₹',
};

function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, ent: string) => {
    if (ent[0] === '#') {
      const code = ent[1].toLowerCase() === 'x' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    const v = NAMED_ENTITIES[ent.toLowerCase()];
    return v === undefined ? m : v;
  });
}

const H = '\u0001H';
const L = '\u0001L';

export function descriptionToBlocks(raw: string | null | undefined): DescriptionBlock[] {
  if (!raw) return [];
  let s = String(raw);
  // Whole description stored entity-encoded (&lt;ul&gt;...) -> decode once first.
  if (!/<[a-z!/]/i.test(s) && /&lt;\/?[a-z]/i.test(s)) s = decodeEntities(s);

  s = s
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<h[1-6][^>]*>/gi, `\n${H}`)
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<li[^>]*>/gi, `\n${L}`)
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/?(p|div|ul|ol|section|table|tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  s = decodeEntities(s);

  const blocks: DescriptionBlock[] = [];
  for (const line of s.split('\n')) {
    let kind: DescriptionBlock['kind'] = 'text';
    let t = line;
    if (t.startsWith(H)) { kind = 'heading'; t = t.slice(H.length); }
    else if (t.startsWith(L)) { kind = 'bullet'; t = t.slice(L.length); }
    t = t.replace(/[\u0001\s]+/g, ' ').trim();
    if (t) blocks.push({ kind, text: t });
  }
  return blocks;
}

/** One-line plain text (meta description / JSON-LD). */
export function descriptionToPlainText(raw: string | null | undefined): string {
  return descriptionToBlocks(raw).map((b) => b.text).join(' ').replace(/\s+/g, ' ').trim();
}
