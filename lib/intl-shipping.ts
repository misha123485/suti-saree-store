// Shared (client + server safe) helpers for international couriers.
export const INTL_COURIERS = ['DHL', 'FedEx', 'Aramex', 'Shiprocket', 'Other'] as const;
export type IntlCourier = (typeof INTL_COURIERS)[number];

const TEMPLATES: Record<string, string> = {
  DHL: 'https://www.dhl.com/in-en/home/tracking/tracking-express.html?submit=1&tracking-id={awb}',
  FedEx: 'https://www.fedex.com/fedextrack/?trknbr={awb}',
  Aramex: 'https://www.aramex.com/in/en/track/track-results-new?ShipmentNumber={awb}',
  Shiprocket: 'https://shiprocket.co/tracking/{awb}',
};

/** Auto tracking link for the known couriers; '' for 'Other' (admin pastes the link). */
export function intlTrackingUrl(courier: string, awb: string): string {
  const t = TEMPLATES[courier];
  return t && awb ? t.replace('{awb}', encodeURIComponent(awb.trim())) : '';
}

/** Only http(s) links are ever stored/rendered (the value ends up in an <a href> and an email). */
export function safeHttpUrl(u: unknown): string {
  const s = String(u ?? '').trim();
  return /^https?:\/\/[^\s<>"']+$/i.test(s) ? s : '';
}

/** Minor-unit exponent (3 for OMR/BHD/KWD, else 2). */
export function currencyDigits(currency: string): number {
  return ['OMR', 'BHD', 'KWD'].includes(String(currency).toUpperCase()) ? 3 : 2;
}
