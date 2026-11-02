// EXPORT INVOICE (Phase 6) -- used instead of the domestic GST invoice for international orders.
// Zero-rated supply under LUT: no GST is charged. Values are shown in the currency the customer paid
// in (what customs asks for) and in INR (what the CA / GST return needs).
import { PDFDocument, StandardFonts, rgb, PDFFont } from 'pdf-lib';
import { getBrandSettings } from './brand-server';
import { currencyDigits } from './intl-shipping';
import {
  PRIMARY, SECONDARY, MUTED, BLACK, CREAM, LINE, WHITE,
  wrapText, tryEmbedRemoteImage, drawImageBox,
} from './invoice-pdf';

export const EXPORT_LUT_LINE = 'SUPPLY MEANT FOR EXPORT UNDER LUT WITHOUT PAYMENT OF IGST';

export interface ExportInvoiceOrder {
  id: string;
  created_at: string;
  status?: string | null;
  items: Array<{ product_name?: string; size?: string | null; color?: string | null; image_url?: string | null; quantity?: number; price?: number; hsn_code?: string | null }>;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  shipping_address: { address?: string; address2?: string; city?: string; state?: string; pincode?: string; country?: string; country_code?: string } | null;
  total_amount: number; // INR, whole rupees, shipping included, no GST
  intl_shipping_inr?: number | null;
  coupon_discount?: number | null;
  country_code?: string | null;
  charge_currency: string;
  charge_amount_minor: number;
  fx_rate_used?: number | null;
  duty_mode?: string | null;
  export_hs_code?: string | null;
  intl_courier?: string | null;
  intl_awb?: string | null;
  stripe_payment_intent_id?: string | null;
}

export interface ExportSeller {
  name?: string;
  address?: string;
  gstin?: string;
  support_email?: string;
  support_phone?: string;
  iec?: string;
  lut_number?: string;
  lut_date?: string;
  ad_code?: string;
  default_hs_code?: string;
}

/** Letters that do not decompose with NFD but have an obvious plain-Latin form. */
const EXTRA_LATIN: Record<string, string> = {
  '\u0142': 'l', '\u0141': 'L', '\u0131': 'i', '\u0130': 'I', '\u0111': 'd', '\u0110': 'D',
  '\u2018': "'", '\u2019': "'", '\u201C': '"', '\u201D': '"', '\u2013': '-', '\u2014': '-', '\u00A0': ' ',
};

/**
 * Helvetica (WinAnsi) throws on characters it cannot encode -> never pass raw text to drawText.
 * Order: keep the character if the font has it; else try a plain-Latin form (accents removed, e.g. a-macron -> a,
 * s-cedilla -> s); else '?'. Arabic / Chinese etc. still become '?' (needs an embedded Unicode font + text shaping).
 */
export function makeSafeText(has: (cp: number) => boolean) {
  return (t: string) =>
    Array.from(String(t ?? ''))
      .map((ch) => {
        if (ch === '\n' || ch === '\r' || ch === '\t') return ' ';
        if (has(ch.codePointAt(0) as number)) return ch;
        const plain = EXTRA_LATIN[ch] ?? ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (plain && plain !== ch && Array.from(plain).every((c) => has(c.codePointAt(0) as number))) return plain;
        return '?';
      })
      .join('');
}

function makeSafe(font: PDFFont) {
  const set = new Set(font.getCharacterSet());
  return makeSafeText((cp) => set.has(cp));
}

const fmtMinor = (minor: number, currency: string) => {
  const d = currencyDigits(currency);
  const v = minor / Math.pow(10, d);
  return `${currency} ${v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
};
const inr = (n: number) => `INR ${Math.round(n).toLocaleString('en-IN')}`;

/** Splits `total` across weights, remainder to the last line, so the lines always add up exactly. */
export function allocateMinor(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  if (sum <= 0) return weights.map((_, i) => (i === weights.length - 1 ? total : 0));
  const out = weights.map((w) => Math.floor((total * w) / sum));
  out[out.length - 1] += total - out.reduce((a, b) => a + b, 0);
  return out;
}

export async function generateExportInvoicePdf(order: ExportInvoiceOrder, seller: ExportSeller): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const safe = makeSafe(font);
  // wrapText measures glyph widths, which throws on characters Helvetica cannot encode -> sanitise first.
  const wrap = (t: string, f: PDFFont, size: number, w: number, n: number) => wrapText(safe(t), f, size, w, n);

  const margin = 40;
  const W = page.getWidth();
  const H = page.getHeight();
  const contentWidth = W - margin * 2;
  let y = H - margin;

  const draw = (text: string, x: number, yy: number, o: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb> } = {}) =>
    page.drawText(safe(text), { x, y: yy, size: o.size ?? 9, font: o.f ?? font, color: o.color ?? BLACK });
  const right = (text: string, xRight: number, yy: number, o: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb> } = {}) =>
    draw(text, xRight - (o.f ?? font).widthOfTextAtSize(safe(text), o.size ?? 9), yy, o);
  const hLine = (yy: number, color = LINE, t = 0.75) =>
    page.drawLine({ start: { x: margin, y: yy }, end: { x: W - margin, y: yy }, thickness: t, color });

  const cur = String(order.charge_currency || 'USD').toUpperCase();
  const shortId = order.id.slice(0, 8).toUpperCase();

  // ---- top strip + header ----
  page.drawRectangle({ x: 0, y: H - 6, width: W * 0.62, height: 6, color: PRIMARY });
  page.drawRectangle({ x: W * 0.62, y: H - 6, width: W * 0.38, height: 6, color: SECONDARY });
  y -= 14;

  const brandName = seller.name || 'Sutisaree';
  const logo = await tryEmbedRemoteImage(doc, (await getBrandSettings()).logo_url);
  if (logo) {
    const sc = Math.min(34 / logo.height, 170 / logo.width);
    page.drawImage(logo, { x: margin, y: y - 8, width: logo.width * sc, height: logo.height * sc });
    y -= 22;
  } else {
    draw(brandName, margin, y, { size: 20, f: serifBold, color: PRIMARY });
    y -= 18;
  }
  const sellerLines = [
    seller.address,
    [seller.gstin && `GSTIN: ${seller.gstin}`, seller.iec && `IEC: ${seller.iec}`].filter(Boolean).join('   |   '),
    seller.ad_code ? `AD Code: ${seller.ad_code}` : '',
    [seller.support_email, seller.support_phone].filter(Boolean).join('  ·  '),
  ].filter(Boolean) as string[];
  for (const l of sellerLines) {
    for (const part of wrap(l, font, 8.5, contentWidth * 0.6, 2)) {
      draw(part, margin, y, { size: 8.5, color: MUTED });
      y -= 11;
    }
  }

  const badgeW = 150;
  const badgeX = W - margin - badgeW;
  const badgeY = H - margin - 30;
  page.drawRectangle({ x: badgeX, y: badgeY, width: badgeW, height: 24, color: PRIMARY });
  draw('EXPORT INVOICE', badgeX + 22, badgeY + 8, { size: 10.5, f: bold, color: WHITE });
  right(`Invoice #: EXP-${shortId}`, W - margin, badgeY - 16, { size: 8.5, color: MUTED });
  right(
    `Date: ${new Date(order.created_at).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })}`,
    W - margin,
    badgeY - 28,
    { size: 8.5, color: MUTED }
  );
  const paid = ['paid', 'shipped', 'delivered', 'completed'].includes(String(order.status || '').toLowerCase());
  const payLabel = paid ? 'PREPAID (CARD) · PAID' : 'PAYMENT PENDING';
  const pw = bold.widthOfTextAtSize(payLabel, 8) + 16;
  const payY = badgeY - 50;
  page.drawRectangle({ x: W - margin - pw, y: payY, width: pw, height: 15, color: paid ? rgb(0.14, 0.5, 0.28) : rgb(0.6, 0.15, 0.15) });
  draw(payLabel, W - margin - pw + 8, payY + 4.5, { size: 8, f: bold, color: WHITE });

  y = Math.min(y, payY) - 10;
  hLine(y, PRIMARY, 1.25);
  y -= 16;

  // ---- LUT banner ----
  page.drawRectangle({ x: margin, y: y - 22, width: contentWidth, height: 22, color: rgb(0.99, 0.95, 0.85), borderColor: SECONDARY, borderWidth: 1 });
  draw(EXPORT_LUT_LINE, margin + 10, y - 14, { size: 9, f: bold, color: PRIMARY });
  y -= 30;
  const lutBits = [seller.lut_number && `LUT ARN/No: ${seller.lut_number}`, seller.lut_date && `LUT date: ${seller.lut_date}`].filter(Boolean).join('    ');
  if (lutBits) {
    draw(lutBits, margin, y, { size: 8.5, color: MUTED });
    y -= 14;
  } else y -= 4;

  // ---- consignee + shipment info (two cards) ----
  const addr = order.shipping_address;
  const cc = String(order.country_code || addr?.country_code || '').toUpperCase();
  const buyer: string[] = [];
  if (addr) {
    const l1 = [addr.address, addr.address2].filter(Boolean).join(', ');
    if (l1) buyer.push(l1);
    const l2 = [addr.city, addr.state, addr.pincode].filter(Boolean).join(', ');
    if (l2) buyer.push(l2);
    buyer.push(`Country: ${addr.country || cc}${cc ? ` (${cc})` : ''}`);
  }
  if (order.customer_phone) buyer.push(`Phone: ${order.customer_phone}`);
  if (order.customer_email) buyer.push(`Email: ${order.customer_email}`);
  const buyerWrapped = buyer.flatMap((l) => wrap(l, font, 8.5, contentWidth * 0.55 - 26, 3));

  const hs = order.export_hs_code || seller.default_hs_code || '';
  const info: Array<[string, string]> = [
    ['Country of origin', 'India'],
    ['Destination', addr?.country || cc || '-'],
    ['Incoterm', order.duty_mode === 'DDP' ? 'DDP (duties paid by seller)' : 'DAP (duties paid by buyer)'],
    ['Currency', cur],
    ['Courier / AWB', order.intl_awb ? `${order.intl_courier || ''} ${order.intl_awb}`.trim() : 'To be dispatched'],
    ['Payment', 'Card via Stripe'],
  ];

  const leftW = contentWidth * 0.55;
  const cardH = Math.max(14 + 13 + buyerWrapped.length * 11 + 10, 14 + info.length * 12 + 10);
  page.drawRectangle({ x: margin, y: y - cardH, width: leftW, height: cardH, color: CREAM });
  page.drawRectangle({ x: margin, y: y - cardH, width: 3, height: cardH, color: SECONDARY });
  let by = y - 14;
  draw('CONSIGNEE (BUYER / IMPORTER)', margin + 12, by, { size: 8, f: bold, color: PRIMARY });
  by -= 13;
  draw(order.customer_name || '-', margin + 12, by, { size: 9.5, f: bold });
  by -= 12;
  for (const l of buyerWrapped) {
    draw(l, margin + 12, by, { size: 8.5, color: MUTED });
    by -= 11;
  }
  const infoX = margin + leftW + 12;
  page.drawRectangle({ x: infoX, y: y - cardH, width: contentWidth - leftW - 12, height: cardH, color: CREAM });
  let iy = y - 14;
  for (const [k, v] of info) {
    draw(`${k}:`, infoX + 10, iy, { size: 8, color: MUTED });
    draw(wrap(v, font, 8.5, contentWidth - leftW - 12 - 20 - 78, 1)[0], infoX + 88, iy, { size: 8.5, f: bold });
    iy -= 12;
  }
  y -= cardH + 18;

  // ---- items ----
  const lines = (order.items || []).map((it) => ({
    name: (it.product_name && String(it.product_name).trim()) || 'Item',
    variant: [it.color ? `Color: ${it.color}` : null, it.size ? `Size: ${it.size}` : null].filter(Boolean).join('  ·  '),
    qty: Number.isFinite(Number(it.quantity)) && Number(it.quantity) > 0 ? Number(it.quantity) : 1,
    inrValue: (Number.isFinite(Number(it.price)) ? Number(it.price) : 0) * (Number.isFinite(Number(it.quantity)) ? Number(it.quantity) : 1),
    hs: it.hsn_code || hs,
    image: it.image_url,
  }));

  // Charge-currency split: shipping first (pro-rata of the INR total), goods get the rest, so
  // goods + shipping == exactly what Stripe charged.
  const totalMinor = Math.max(0, Math.round(order.charge_amount_minor || 0));
  const totalInr = Math.max(1, Number(order.total_amount) || 1);
  const shipInr = Math.max(0, Number(order.intl_shipping_inr) || 0);
  const shipMinor = Math.min(totalMinor, Math.round((totalMinor * shipInr) / totalInr));
  const goodsMinor = totalMinor - shipMinor;
  const lineMinor = allocateMinor(goodsMinor, lines.map((l) => l.inrValue));

  const imgSize = 30;
  const colName = margin + imgSize + 10;
  // Right edges of the numeric columns (right-aligned), HS code is left-aligned.
  const amtR = W - margin - 8;
  const unitR = amtR - 105;
  const qtyR = unitR - 92;
  const colHs = qtyR - 90;
  const nameW = colHs - colName - 10;

  page.drawRectangle({ x: margin, y: y - 6, width: contentWidth, height: 20, color: PRIMARY });
  draw('Description of goods', colName, y, { size: 8.5, f: bold, color: WHITE });
  draw('HS code', colHs, y, { size: 8.5, f: bold, color: WHITE });
  right('Qty', qtyR, y, { size: 8.5, f: bold, color: WHITE });
  right(`Unit (${cur})`, unitR, y, { size: 8.5, f: bold, color: WHITE });
  right(`Amount (${cur})`, amtR, y, { size: 8.5, f: bold, color: WHITE });
  y -= 20;

  let idx = 0;
  for (const l of lines) {
    if (y < 250) break;
    const nameLines = wrap(l.name, bold, 9, nameW, 2);
    const rowH = Math.max(imgSize + 8, nameLines.length * 11 + (l.variant ? 11 : 0) + 12);
    if (idx % 2 === 1) page.drawRectangle({ x: margin, y: y - rowH, width: contentWidth, height: rowH, color: CREAM });
    // eslint-disable-next-line no-await-in-loop -- a handful of items
    const img = await tryEmbedRemoteImage(doc, l.image);
    drawImageBox(page, img, safe(l.name).charAt(0).toUpperCase() || '?', margin, y - imgSize - 3, imgSize);
    let ny = y - 11;
    for (const n of nameLines) {
      draw(n, colName, ny, { size: 9, f: bold });
      ny -= 11;
    }
    if (l.variant) draw(l.variant, colName, ny, { size: 7.5, color: MUTED });
    const ty = y - 11;
    draw(l.hs || '-', colHs, ty, { size: 8.5 });
    right(String(l.qty), qtyR, ty, { size: 8.5 });
    const amountMinor = lineMinor[idx] ?? 0;
    right(fmtMinor(Math.round(amountMinor / l.qty), cur), unitR, ty, { size: 8.5 });
    right(fmtMinor(amountMinor, cur), amtR, ty, { size: 8.5, f: bold });
    y -= rowH;
    hLine(y, LINE, 0.5);
    y -= 10;
    idx++;
  }
  y -= 4;
  draw('Line values are shown net of any discount; no GST / IGST is charged on this export supply.', margin, y, { size: 7.5, color: MUTED });
  y -= 16;

  // ---- totals ----
  const tw = 250;
  const tx = W - margin - tw;
  const rows: Array<[string, string]> = [
    ['Goods value', fmtMinor(goodsMinor, cur)],
    ['International shipping', shipMinor > 0 ? fmtMinor(shipMinor, cur) : 'FREE'],
    ['IGST / GST (LUT export)', `${cur} 0.00`],
  ];
  const boxH = rows.length * 15 + 62;
  page.drawRectangle({ x: tx, y: y - boxH, width: tw, height: boxH, color: CREAM, borderColor: LINE, borderWidth: 0.75 });
  let ty = y - 14;
  for (const [k, v] of rows) {
    draw(k, tx + 10, ty, { size: 8.5, color: MUTED });
    right(v, tx + tw - 10, ty, { size: 8.5 });
    ty -= 15;
  }
  page.drawRectangle({ x: tx, y: ty - 8, width: tw, height: 22, color: PRIMARY });
  draw('TOTAL CHARGED', tx + 10, ty - 1, { size: 9.5, f: bold, color: WHITE });
  right(fmtMinor(totalMinor, cur), tx + tw - 10, ty - 1, { size: 9.5, f: bold, color: WHITE });
  ty -= 24;
  draw('INR equivalent', tx + 10, ty, { size: 8.5, color: MUTED });
  right(inr(order.total_amount), tx + tw - 10, ty, { size: 8.5, f: bold });
  ty -= 11;
  if (order.fx_rate_used) {
    draw(`Rate applied: 1 ${cur} = INR ${Number(order.fx_rate_used).toFixed(2)}`, tx + 10, ty, { size: 7.5, color: MUTED });
  }

  // left of totals: notes
  const notes = [
    `Terms of delivery: ${order.duty_mode === 'DDP' ? 'DDP - import duties and taxes are included.' : 'DAP - import duties, VAT/GST and customs fees at destination are payable by the buyer.'}`,
    'Goods: handloom / handwoven sarees and textiles. Country of origin: India.',
    'Declaration: we declare that this invoice shows the actual price of the goods described.',
  ];
  let ny2 = y - 14;
  for (const n of notes) {
    for (const part of wrap(n, font, 8, tx - margin - 14, 3)) {
      draw(part, margin, ny2, { size: 8, color: MUTED });
      ny2 -= 10;
    }
    ny2 -= 3;
  }

  // ---- footer ----
  const fy = 56;
  hLine(fy + 22);
  draw('Thank you for shopping with us!', margin, fy + 6, { size: 9, f: bold, color: PRIMARY });
  draw('This is a computer-generated export invoice and does not require a signature.', margin, fy - 6, { size: 8, color: MUTED });
  draw(`Order ref: ${order.id}`, margin, fy - 18, { size: 7.5, color: MUTED });

  return doc.save();
}
