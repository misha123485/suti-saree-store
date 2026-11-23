// Description + colour for the Google product feed (/api/merchant-feed).
//
// Merchant Center flags ~218 sarees with "incomplete description": the free text never mentions the details
// Google already sees in the attributes (Color, Fabric, ...), or it is raw HTML / marketing text.
//
// IRON RULE: nothing is invented. The text is built ONLY from the product record:
//   1. the stored description, stripped of HTML / entities / marketing junk / contact details / duplicates;
//   2. one short structured sentence made of attributes that really exist on the record and are not
//      already mentioned in that text ("Color: Red. Fabric: Pure Silk. Work: Zari. ...").
// Pure (no DB, no Next.js), ES5-safe regexes (no lookbehind, no \p{..}/u) -> unit-tested in
// scripts/test-feed-description.ts.
import { descriptionToBlocks } from './description-text';
import type { ProductHighlights } from './types';

export const FEED_DESCRIPTION_MAX_LENGTH = 5000;
/** Below this many characters the stored text is considered "thin" (used by the audit / tests). */
export const FEED_DESCRIPTION_MIN_GOOD_LENGTH = 150;

/**
 * Sentences matching ANY of these are dropped from the feed description (the on-site text is NOT changed).
 * Add your own legacy boilerplate here. I could not find the exact "BEST OFFERS" / "This product is already ..."
 * strings anywhere in the repo (they live in the database), so these are pattern based.
 */
export const FEED_DESCRIPTION_JUNK_PATTERNS: RegExp[] = [
  /this\s+product\s+is\s+already/i,
  /best\s+offers?/i,
  /\b(?:buy|order|shop|grab|book|purchase)\s+(?:it\s+)?now\b/i,
  /\bhurry\b/i,
  /\blimited\s+(?:stock|time|period|offer)/i,
  /\bfree\s+(?:home\s+)?(?:shipping|delivery)\b/i,
  /\bcash\s+on\s+delivery\b/i,
  /\bcod\b/i,
  /\b\d{1,3}\s*%\s*(?:off|discount)\b/i,
  /\b(?:flat|upto|up\s+to)\s+\d{1,3}\s*%/i,
  /\b(?:on\s+sale|sale\s+price|mega\s+sale|clearance)\b/i,
  /\b(?:whats\s?app|call|contact|dm|inbox)\b[^.!?]*\d{6,}/i,
  /https?:\/\/|\bwww\./i,
  /[A-Z0-9._%+'-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/i,
  /(?:^|[^0-9])(?:\+?91[\s-]?)?[6-9](?:[\s-]?[0-9]){9}(?:[^0-9]|$)/,
];

// Headings that carry no information once the surrounding layout is gone.
const GENERIC_HEADING_RE =
  /^(?:product\s+)?(?:details?|description|specifications?|features?|highlights?|overview|note|notes|disclaimer|care\s+instructions?)\s*:?$/i;
const PLACEHOLDER_VALUE_RE = /^(?:n\/?a|na|none|null|undefined|nil|-+|\.+)$/i;

// decorative symbols / emoji (surrogate pairs are matched as pairs, so no `u` flag is needed)
const SYMBOL_RE = /[←-⇿⌀-⏿①-➿⬀-⯿️‍]|[\uD83C-\uD83E][\uDC00-\uDFFF]/g;
// characters that are illegal in XML 1.0
// eslint-disable-next-line no-control-regex
const XML_ILLEGAL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

function squash(s: string): string {
  return s.replace(XML_ILLEGAL_RE, '').replace(SYMBOL_RE, ' ').replace(/\s+/g, ' ').trim();
}

function isJunk(sentence: string): boolean {
  for (let i = 0; i < FEED_DESCRIPTION_JUNK_PATTERNS.length; i++) {
    if (FEED_DESCRIPTION_JUNK_PATTERNS[i].test(sentence)) return true;
  }
  return false;
}

/** "Nice saree. Wow!!" -> ["Nice saree", "Wow"] (a "." inside a number such as 5.5 is not a sentence end). */
function splitSentences(text: string): string[] {
  return text
    .split(/[.!?]+\s+/)
    .map(function (s) { return s.replace(/[.!?\s]+$/, '').trim(); })
    .filter(function (s) { return s.length > 0; });
}

/** Stored description -> clean plain text (no HTML, no junk sentences, no duplicates). May return "". */
export function cleanFeedDescription(raw: string | null | undefined): string {
  // A hard line break in the middle of a sentence ("...pure\nsilk saree") is not a sentence end: glue a plain
  // text line that starts in lower case onto the previous plain text line when that one has no final punctuation.
  const blocks: Array<{ kind: string; text: string }> = [];
  const parsed = descriptionToBlocks(raw);
  for (let k = 0; k < parsed.length; k++) {
    const cur = parsed[k];
    const prev = blocks[blocks.length - 1];
    if (prev && prev.kind === 'text' && cur.kind === 'text' && !/[.!?:;]\s*$/.test(prev.text) && /^[a-z]/.test(cur.text)) {
      prev.text = prev.text + ' ' + cur.text;
    } else {
      blocks.push({ kind: cur.kind, text: cur.text });
    }
  }
  const out: string[] = [];
  const seen: Record<string, boolean> = {};
  for (let b = 0; b < blocks.length; b++) {
    const block = blocks[b];
    const text = squash(block.text);
    if (!text) continue;
    if (block.kind === 'heading') {
      if (GENERIC_HEADING_RE.test(text)) continue;
      const head = text.replace(/[:.\s]+$/, '');
      if (head && !isJunk(head)) out.push(head + ':');
      continue;
    }
    const sentences = splitSentences(text);
    for (let i = 0; i < sentences.length; i++) {
      const s = sentences[i];
      if (isJunk(s)) continue;
      const key = s.toLowerCase();
      if (seen[key]) continue;
      seen[key] = true;
      out.push(/[:]$/.test(s) ? s : s + '.');
    }
  }
  return out.join(' ').replace(/:\s*\./g, ':').replace(/\s+/g, ' ').trim();
}

export interface FeedDescriptionProduct {
  name: string;
  description?: string | null;
  category?: string | null;
  fabric?: string | null;
  material?: string | null;
  pattern?: string | null;
  origin?: string | null;
  occasion?: string[] | null;
  highlights?: ProductHighlights | null;
}

function val(input: unknown, max = 120): string {
  if (typeof input !== 'string') return '';
  const s = squash(input.replace(/<[^>]*>/g, ' '));
  if (!s || PLACEHOLDER_VALUE_RE.test(s)) return '';
  return s.length > max ? s.slice(0, max).replace(/\s+\S*$/, '').trim() : s;
}

function legacySpec(h: ProductHighlights | null | undefined, labelRe: RegExp): string {
  const rows = (h && h.legacy_specs) || [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row && typeof row.label === 'string' && labelRe.test(row.label.trim())) {
      const v = val(row.value);
      if (v) return v;
    }
  }
  return '';
}

/** The real attributes of the item as ordered [label, value] pairs. Only attributes that exist are returned. */
export function collectFeedAttributes(product: FeedDescriptionProduct, color: string): Array<[string, string]> {
  const h = product.highlights || null;
  const pairs: Array<[string, string]> = [];
  const add = (label: string, value: string) => { if (value) pairs.push([label, value]); };

  add('Color', val(color, 100));

  const fabric = val(h && h.saree_fabric) || val(product.fabric) || val(product.material);
  add('Fabric', fabric);
  const material = val(product.material);
  if (material && fabric.toLowerCase().indexOf(material.toLowerCase()) === -1) add('Material', material);

  add('Pattern', val(h && h.saree_pattern) || val(product.pattern) || val(h && h.print_or_pattern_type));
  add('Work', val(h && h.ornamentation));

  const border = val(h && h.border);
  const borderWidth = val(h && h.border_width, 40);
  if (border) add('Border', borderWidth ? border + ' (' + borderWidth + ')' : border);

  add('Blouse', val(h && h.blouse) || legacySpec(h, /^blouse(?:\s*piece)?$/i));
  add('Length', val(h && h.length) || legacySpec(h, /^length$/i));
  add('Weave', val(h && h.loom_type));

  const occ = (product.occasion || []).map(function (o) { return val(o, 40); }).filter(Boolean);
  add('Occasion', occ.slice(0, 5).join(', '));

  add('Origin', val(h && h.country_of_origin) || val(product.origin));
  add('Care', legacySpec(h, /^(?:care(?:\s*instructions?)?|wash\s*care|washing\s*instructions?)$/i));
  return pairs;
}

/** Keeps the old behaviour: Google checks that the free text mentions the item's colour. */
export function ensureColorMentioned(description: string, color: string): string {
  if (!color) return description;
  const trimmed = description.trim();
  if (!trimmed) return 'Available in ' + color + '.';
  if (trimmed.toLowerCase().indexOf(color.toLowerCase()) !== -1) return trimmed;
  return trimmed + ' Available in ' + color + '.';
}

/**
 * Final <description> for one feed item (one colour [+ size]).
 *   cleaned stored text (or the product name when nothing usable is stored)
 *   + "Color: X. Fabric: Y. ..." for every real attribute not already mentioned in that text.
 * Always <= 5000 chars, never contains HTML, never contains an attribute the product does not have.
 */
export function buildFeedDescription(product: FeedDescriptionProduct, color: string): string {
  const cleanColor = val(color, 100);
  let base = cleanFeedDescription(product.description);
  if (!base) {
    const n = squash(String(product.name || '')).replace(/[.\s]+$/, '');
    base = n ? n + '.' : '';
  }

  const lowerBase = base.toLowerCase();
  const attrs = collectFeedAttributes(product, cleanColor).filter(function (p) {
    return lowerBase.indexOf(p[1].toLowerCase()) === -1;
  });
  const attrText = attrs
    .map(function (p) { return p[0] + ': ' + p[1].replace(/[.\s]+$/, '') + '.'; })
    .join(' ');

  const room = FEED_DESCRIPTION_MAX_LENGTH - (attrText ? attrText.length + 1 : 0);
  if (base.length > room) base = base.slice(0, Math.max(room, 0)).replace(/\s+\S*$/, '').trim();

  let out = (base + (attrText ? ' ' + attrText : '')).trim();
  out = ensureColorMentioned(out, cleanColor);
  return out.slice(0, FEED_DESCRIPTION_MAX_LENGTH);
}

/**
 * <g:color>: the variant's own colour; else the product's colours (max 3, joined with "/", as Google expects);
 * the fallback is used only when the record has no colour at all.
 */
export function resolveFeedColor(
  variantColor: string | null | undefined,
  product: { colors?: string[] | null; all_colors?: string[] | null },
  fallback = 'Multicolor'
): string {
  const own = val(variantColor, 100);
  if (own) return own;
  const pick = function (list: string[] | null | undefined): string {
    return (list || []).map(function (c) { return val(c, 40); }).filter(Boolean).slice(0, 3).join('/');
  };
  return (pick(product.colors) || pick(product.all_colors) || fallback).slice(0, 100);
}
