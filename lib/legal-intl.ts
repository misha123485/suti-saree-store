// Phase 7: international legal text.
//
// Design (non-destructive):
//  - The existing India templates in lib/marketing-api.ts are NOT touched.
//  - Each policy gets an "International Orders (outside India)" section, wrapped in
//    [[INTL_START]] ... [[INTL_END]] markers.
//  - On display, if international selling is ON the block is shown (markers stripped, tokens resolved);
//    if it is OFF the block is removed completely, so an India-only store never mentions international.
//  - If the admin never added the block, it is appended at display time (nothing saved to the DB, so
//    existing edits are never overwritten). Admin > Marketing > Legal Pages can also append it into the
//    editable text with one click.
//
// Pure functions only (no next/headers, no supabase) so it is safe to import from client components.

import {
  formatMinor,
  previewInrToMinor,
  type InternationalSettings,
  type IntlCountry,
  type ShippingZone,
} from './intl-api';

export const INTL_START = '[[INTL_START]]';
export const INTL_END = '[[INTL_END]]';

export type IntlLegalSlug = 'privacy-policy' | 'terms-conditions' | 'shipping-policy' | 'refund-policy';

export interface IntlLegalContext {
  /** international_enabled AND at least one enabled country with an active zone. */
  enabled: boolean;
  settings: InternationalSettings | null;
  countries: IntlCountry[];
  zones: ShippingZone[];
  store: { name: string; address: string; support_email: string; support_phone: string };
}

export const DISABLED_INTL_LEGAL_CONTEXT: IntlLegalContext = {
  enabled: false,
  settings: null,
  countries: [],
  zones: [],
  store: { name: 'Sutisaree', address: '', support_email: '', support_phone: '' },
};

// ---------------------------------------------------------------------
// Section templates
// ---------------------------------------------------------------------

export const SHIPPING_INTL_SECTION = `${INTL_START}International Orders (outside India)
We ship to the following countries: {{intl_countries}}. Choose your country at checkout; your price in local currency, the shipping charge and the delivery estimate are shown before you pay.

Prepaid Orders Only
International orders are prepaid by credit or debit card, processed securely by Stripe. Cash on Delivery and Partial Pay are not available for international orders. Please use a card issued outside India.

Dispatch and Couriers
International orders are packed and dispatched from our facility in Naihati, West Bengal, India within {{dispatch_days}} business days of payment confirmation, excluding Sundays and public holidays. We ship with international courier partners such as DHL, FedEx, Aramex or other reputed carriers. Once your parcel is dispatched we email you the courier name, tracking number and a tracking link.

Estimated Delivery Time
{{intl_delivery_list}}
Delivery time is counted from the dispatch date. These are estimates, not guarantees, and may be extended by customs clearance, courier delays, weather, public holidays or other events outside our control.

Shipping Charges
{{intl_shipping_list}}
The exact shipping charge for your order depends on your country and the weight of your parcel, and is shown at checkout before you pay.

Import Duties, Taxes and Customs Fees
[[DAP]]International orders are shipped on a Delivered at Place (DAP) basis. The price you pay at checkout does NOT include import duties, VAT/GST, customs clearance or handling fees charged by your country. These charges are set by your country's customs authority and/or the courier, are payable by you as the importer of record (usually before or at delivery), and vary by country and order value. We do not control, calculate or refund them. Please check with your local customs office or the courier before ordering. You are asked to confirm that you understand this at checkout.[[/DAP]][[DDP]]International orders are shipped on a Delivered Duty Paid (DDP) basis. Import duties and taxes of the destination country are included in what you pay at checkout, so you should not be asked to pay anything further on delivery. If a courier or customs office still asks you for a payment, please contact us before paying.[[/DDP]]

Customs Delays, Refused Parcels and Incorrect Addresses
Customs clearance is handled by the authorities of your country and may cause delays that we cannot control. Please give a complete and accurate delivery address, a working phone number and a working email address. If a parcel is returned or abandoned because the address is incorrect or incomplete, nobody is available to receive it, it is not collected, or the duties and taxes due are not paid, we may deduct the outbound and return shipping costs, and any charges we incur, from any refund.

Delivery Address
We deliver to street addresses only. We cannot deliver to P.O. boxes. International checkout cannot be used for delivery addresses in India.

Damaged or Incorrect Items
If your parcel arrives damaged, or you receive a wrong or defective item, contact us within 48 hours of delivery with clear photos or a video of the product and the packaging, and we will resolve it as described in our Refund & Cancellation Policy.${INTL_END}`;

export const REFUND_INTL_SECTION = `${INTL_START}International Orders (outside India)
This section applies to orders delivered outside India. Where it differs from the India-specific terms above, this section applies to international orders.

Cancellation
You may cancel an international order before it is dispatched by contacting us with your order number; we will refund the full amount to your original card. Once an order has been dispatched it can no longer be cancelled, but you may return it as described below.

Returns
We accept returns of international orders within {{return_days_intl}} days of delivery, provided the item is unused, unwashed, in its original packaging and with all tags intact. Contact us at {{support_email}} with your order number, the reason for the return and clear photos before sending anything back. Returns sent without our approval cannot be accepted. Stitched, altered or custom-made items are not eligible for return.

Return Shipping
You pay the cost of shipping the item back to us (including any export or import charges on the return), unless we sent a wrong, damaged or defective item. If so, please contact us within 48 hours of delivery with clear photos or a video of the item and the packaging, and we will cover the return shipping or arrange a replacement or refund.

What Is Not Refundable
Import duties, taxes and customs fees you paid in your country, the original shipping fee and payment processing fees are non-refundable. The exception is when we shipped a wrong or defective item: we then refund the item price and the shipping fee, and, on proof of payment, the duties and taxes you paid on that item.

How and When You Are Refunded
Refunds are made only to the original card, through Stripe, in the same currency you were charged. We process the refund within 5 to 10 business days after we receive and inspect the returned item; your bank may need additional time to show it on your statement. Currency conversion differences and fees applied by your own bank or card issuer are not our responsibility.

Parcels Refused, Unclaimed or Held at Customs
If a parcel is refused, left unclaimed or is abandoned at customs, we will refund the item price minus the outbound and return shipping costs and any duties or charges we have to pay.

Colour and Texture
Our sarees are handwoven or handcrafted and can look slightly different on your screen than in person. Natural variations in colour, weave and texture are not a defect and are not a reason for return, unless the product is materially different from its listing.${INTL_END}`;

export const PRIVACY_INTL_SECTION = `${INTL_START}International Customers
This section applies to customers outside India and supplements the rest of this Privacy Policy.

Where Your Data Is Processed
{{company_name}} is based in India, so the personal data you give us when you order is processed in India. We transfer only what is needed to take and deliver your order and to run our shop. Transfers needed to carry out your order are made on the basis of your contract with us; other transfers rely on your consent or our legitimate interests, as applicable.

Who We Share Data With
Payments: card payments are processed by Stripe, Inc. and its affiliates. We never see or store your full card number.
Delivery: our courier partners receive your name, delivery address, phone number and email address to deliver your parcel and to complete customs clearance.
Analytics and advertising: we use Google Analytics, Google Ads, Google Merchant Center and Google Customer Reviews. Google receives information such as your browsing activity, your order details and, if you agree to a Google Customer Reviews survey, your order number, email address and delivery country.
We do not sell your personal data.

Cookies and Consent
For visitors in the UK and Europe we ask for your consent before analytics and advertising cookies are used. You can accept or decline in the cookie banner, and change your mind at any time by clearing the cookies for this site. Cookies needed to run the cart and checkout do not require consent.

How Long We Keep Data
We keep order and invoice records for as long as Indian tax and accounting laws require. Account and marketing data is kept until you ask us to delete it or unsubscribe. Analytics data is kept according to the retention periods set in our Google settings.

Your Rights (UK GDPR / EU GDPR)
Depending on where you live, you may have the right to access your personal data, have it corrected or erased, restrict or object to its use, receive a copy in a portable format, withdraw consent at any time, and complain to your local data protection authority (for example the Information Commissioner's Office in the UK). To use these rights, email {{support_email}}. We may need to verify your identity first, and we may keep data we are legally required to keep.

Your Rights (California residents, CCPA/CPRA)
California residents may ask us to tell them what personal information we have collected, delete it, correct it, and not discriminate against them for using these rights. We do not sell personal information. We use Google advertising and analytics services; to the extent this counts as "sharing" for cross-context behavioural advertising under California law, you can opt out by emailing {{support_email}} or by declining advertising cookies where you are given that choice.

Contact
{{company_name}}
{{company_address}}
Email: {{support_email}}
Phone: {{support_phone}}${INTL_END}`;

export const TERMS_INTL_SECTION = `${INTL_START}International Orders (outside India)
These terms apply to orders delivered outside India, in addition to the terms above.

Currency and Pricing
Prices are shown in your local currency, converted from our Indian Rupee prices using an exchange rate and rounding that we set and may change at any time. You are charged, and refunded, in the currency shown at checkout. Your bank or card issuer may add its own currency conversion or foreign transaction fees, which we do not control.

Price and Listing Errors
If a product is listed at a clearly wrong price or with wrong details because of a technical or typing error, we may cancel the order and refund you in full.

Duties, Taxes and Importer of Record
Unless your order states that duties are included (Delivered Duty Paid), international orders are shipped on a Delivered at Place (DAP) basis. You are the importer of record, you are responsible for all import duties, VAT/GST, customs fees and any import permits required in your country, and you confirm that the goods may lawfully be imported there. Details are in our Shipping Policy.

Export Controls and Sanctions
We do not ship to destinations or customers that Indian law or applicable international sanctions prohibit us from supplying. We may cancel and refund any order that we reasonably believe breaches these rules.

Payments, Disputes and Chargebacks
International orders are prepaid by card through Stripe. If you have a problem with an order, please contact us at {{support_email}} first so we can fix it quickly. We may share order, delivery and communication records with our payment processor and your card issuer to respond to a payment dispute.

Governing Law
These terms and international orders are governed by the laws of India, and the courts at North 24 Parganas, West Bengal, India have jurisdiction, without limiting any mandatory consumer rights you have under the laws of your country.

Intellectual Property
All content on this website, including product photographs, designs, logos and text, belongs to {{company_name}} and may not be copied or used without our written permission.${INTL_END}`;

export const INTL_SECTIONS: Record<IntlLegalSlug, string> = {
  'privacy-policy': PRIVACY_INTL_SECTION,
  'terms-conditions': TERMS_INTL_SECTION,
  'shipping-policy': SHIPPING_INTL_SECTION,
  'refund-policy': REFUND_INTL_SECTION,
};

/** Tokens the international sections use (shown as help text in the admin panel). */
export const INTL_TOKEN_NAMES = [
  'intl_countries',
  'intl_delivery_list',
  'intl_shipping_list',
  'return_days_intl',
  'company_name',
  'company_address',
  'support_email',
  'support_phone',
] as const;

// ---------------------------------------------------------------------
// Editor helpers (admin panel)
// ---------------------------------------------------------------------

const BLOCK_RE = /\[\[INTL_START\]\][\s\S]*?\[\[INTL_END\]\]/g;
const HAS_OWN_INTL_HEADING_RE = /International Orders \(outside India\)/i;

export function hasIntlSection(text: string): boolean {
  return text.includes(INTL_START) || HAS_OWN_INTL_HEADING_RE.test(text);
}

/** Appends the international section below the existing text. Never touches what is already there. */
export function appendIntlSection(slug: IntlLegalSlug, text: string): string {
  if (hasIntlSection(text)) return text;
  return `${text.trimEnd()}\n\n${INTL_SECTIONS[slug]}`;
}

/** Removes only the marker-wrapped international block. */
export function removeIntlSection(text: string): string {
  return text.replace(BLOCK_RE, '').replace(/\n{3,}/g, '\n\n').trimEnd();
}

// ---------------------------------------------------------------------
// Display helpers (public pages, chat widgets)
// ---------------------------------------------------------------------

// The old India-only template ends with this paragraph; it must go once international is on.
const INDIA_ONLY_PARAGRAPH_RE = /International Shipping\s*\n\s*We currently ship only within India[^\n]*/i;

function etaText(z: ShippingZone): string {
  if (z.eta_min_days && z.eta_max_days) {
    const days =
      z.eta_min_days === z.eta_max_days ? `${z.eta_min_days}` : `${z.eta_min_days}-${z.eta_max_days}`;
    return `${days} business days after dispatch`;
  }
  return 'delivery estimate shown at checkout';
}

function zoneFor(ctx: IntlLegalContext, code: string): ShippingZone | undefined {
  return ctx.zones.find((z) => z.countries.includes(code));
}

export function buildDeliveryList(ctx: IntlLegalContext): string {
  return ctx.countries
    .map((c) => {
      const z = zoneFor(ctx, c.code);
      if (!z) return null;
      return `${c.name}: ${etaText(z)}${z.courier ? ` (${z.courier})` : ''}`;
    })
    .filter((l): l is string => !!l)
    .join('\n');
}

export function buildShippingList(ctx: IntlLegalContext): string {
  const s = ctx.settings;
  if (!s) return '';
  return ctx.countries
    .map((c) => {
      const z = zoneFor(ctx, c.code);
      if (!z) return null;
      const money = (inr: number) => formatMinor(previewInrToMinor(inr, c.currency, s), c.currency);
      let line = `${c.name}: shipping from ${money(z.base_rate_inr)}`;
      if (z.per_extra_500g_inr > 0) line += ` for parcels up to 500 g, plus ${money(z.per_extra_500g_inr)} for each additional 500 g`;
      if (z.free_shipping_threshold_inr > 0) line += `; free shipping on orders above ${money(z.free_shipping_threshold_inr)}`;
      if (z.min_order_inr > 0) line += `; minimum order ${money(z.min_order_inr)}`;
      return line;
    })
    .filter((l): l is string => !!l)
    .join('\n');
}

function applyIntlTokens(text: string, ctx: IntlLegalContext): string {
  const s = ctx.settings;
  const dap = (s?.default_duty_mode ?? 'DAP') !== 'DDP';
  const dutyRe = dap ? /\[\[DDP\]\][\s\S]*?\[\[\/DDP\]\]/g : /\[\[DAP\]\][\s\S]*?\[\[\/DAP\]\]/g;
  const keepRe = dap ? /\[\[\/?DAP\]\]/g : /\[\[\/?DDP\]\]/g;
  const email = ctx.store.support_email || 'our support email shown on the Contact page';
  return text
    .replace(dutyRe, '')
    .replace(keepRe, '')
    .replace(/\{\{\s*intl_countries\s*\}\}/g, ctx.countries.map((c) => c.name).join(', '))
    .replace(/\{\{\s*intl_delivery_list\s*\}\}/g, buildDeliveryList(ctx))
    .replace(/\{\{\s*intl_shipping_list\s*\}\}/g, buildShippingList(ctx))
    .replace(/\{\{\s*return_days_intl\s*\}\}/g, String(s?.return_window_days_intl ?? 7))
    .replace(/\{\{\s*company_name\s*\}\}/g, ctx.store.name || 'Sutisaree')
    .replace(/\{\{\s*company_address\s*\}\}/g, ctx.store.address || '')
    .replace(/\{\{\s*support_email\s*\}\}/g, email)
    .replace(/\{\{\s*support_phone\s*\}\}/g, ctx.store.support_phone || '');
}

/**
 * Final text for display. Run applyFulfillmentTokens() on the result afterwards (the international
 * sections use {{dispatch_days}}).
 */
export function composeLegalText(slug: IntlLegalSlug, raw: string, ctx: IntlLegalContext): string {
  let text = raw || '';
  if (!ctx.enabled) {
    // International selling is off: behave exactly as before and hide any international block.
    return text.includes(INTL_START) ? text.replace(BLOCK_RE, '').replace(/\n{3,}/g, '\n\n').trimEnd() : text;
  }
  if (!hasIntlSection(text)) text = `${text.trimEnd()}\n\n${INTL_SECTIONS[slug]}`;
  if (slug === 'shipping-policy') text = text.replace(INDIA_ONLY_PARAGRAPH_RE, '').replace(/\n{3,}/g, '\n\n');
  text = text.replace(/\[\[INTL_START\]\]/g, '').replace(/\[\[INTL_END\]\]/g, '');
  return applyIntlTokens(text, ctx).trim();
}
