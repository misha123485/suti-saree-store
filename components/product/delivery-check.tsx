'use client';

import { useCountry } from '@/components/country-provider';
import DeliveryBar from '@/components/delivery/delivery-bar';
import IntlShipsTo from './intl-ships-to';

// Product-page delivery row. Same bar as the shopping bag (DeliveryBar), so
// both look identical and share the saved pincode. Outside India the
// "ships to" card is shown instead, like the rest of the product page.
export default function DeliveryCheck() {
  const { countryCode } = useCountry();
  if (countryCode !== 'IN') return <IntlShipsTo />;
  return <DeliveryBar className="overflow-hidden rounded-lg border border-primary/10 bg-primary/5" />;
}
