'use client';

import { Check, Info, Lock, Tag, Truck, Zap, BadgeCheck } from 'lucide-react';
import { formatINR } from '@/lib/format';

/**
 * Premium payment-method picker for checkout.
 *
 * Design / compliance notes (please keep when editing):
 *  - Both options are always visible, equally selectable, and each one shows
 *    the EXACT amount the customer will pay. Nothing is hidden or disabled
 *    to push people toward prepaid.
 *  - The prepaid saving is a plain, disclosed discount (also shown as a line
 *    item in the Order Summary). Merchant Center feed / structured data
 *    should keep the normal selling price.
 *  - The benefit copy below (priority dispatch / faster delivery) must stay
 *    TRUE in your day-to-day operations and match your Shipping Policy page.
 *    If you ever stop prioritising prepaid orders, edit PAYMENT_COPY here.
 *    No fixed delivery-day numbers are promised on purpose.
 */
export const PAYMENT_COPY = {
  onlineTitle: 'Pay Online',
  onlineSub: 'UPI · Cards · Netbanking',
  recommended: 'Recommended',
  payWith: 'Pay with',
  payWithChips: ['GPay', 'PhonePe', 'Paytm', 'any UPI'],
  secureNote: 'A secure payment window opens on the next step',
  saveStripPrefix: 'You save',
  saveStripSuffix: 'by paying online',
  switchToOnline: 'Switch to online payment & save',
  payNow: 'Pay now',
  nothingDue: 'Nothing due on delivery',
  onlineNote: 'Prepaid orders are confirmed instantly and packed ahead of COD orders.',
  benefits: [
    { icon: 'zap', title: 'Dispatched first', sub: 'Priority packing' },
    { icon: 'check', title: 'Instant confirmation', sub: 'No verification wait' },
  ],
  codTitle: 'Cash on Delivery',
  codSub: 'Pay in cash when your order arrives',
  partialBenefits: [
    { icon: 'check', title: 'Confirmed instantly', sub: 'On advance payment' },
    { icon: 'zap', title: 'Dispatched first', sub: 'Ships before COD' },
  ],
  codQueueNote: 'Dispatched after Online & Partial Pay orders',
  partialNote:
    'Confirmed as soon as the advance is paid and dispatched along with prepaid orders, ahead of COD. Pay the balance to the delivery partner in cash or UPI. The online-payment discount applies only to full online payment.',
  codNote:
    'We will send a one-tap confirmation link by email/WhatsApp. COD orders are dispatched after Online and Partial Pay orders, so delivery can take a little longer.',
} as const;

const BENEFIT_ICONS = {
  zap: Zap,
  truck: Truck,
  check: BadgeCheck,
} as const;

export type CheckoutPaymentMethod = 'online' | 'cod' | 'partial';

/** Shown only when Partial Pay is enabled (Admin > Settings) and this order is eligible. */
export interface PartialPayOption {
  title: string;
  percent: number;
  /** Paid online now. */
  advance: number;
  /** Paid to the courier on delivery. */
  balance: number;
}

interface PaymentMethodSelectorProps {
  value: CheckoutPaymentMethod;
  onChange: (method: CheckoutPaymentMethod) => void;
  partial?: PartialPayOption | null;
  /** false when the admin switched ALL online payment gateways off (Admin > Settings > Payment Gateways): only COD is shown. */
  onlineAvailable?: boolean;
  /** Rupees saved by paying online (0 / undefined hides all saving UI). */
  savings: number;
  /** Final amount if the customer pays online. */
  onlineTotal: number;
  /** Final amount if the customer chooses COD. */
  codTotal: number;
  /** Pay button (Admin > Settings > Checkout Pay Buttons). Rendered INSIDE
   *  the card of whichever method is currently selected, so the customer
   *  sees at a glance whether it is the online or the COD button. */
  action?: React.ReactNode;
  /** Active online gateway id; 'cashfree' shows the "Secured by cashfree" badge under the Pay Online button. */
  gateway?: string | null;
}

function RadioDot({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-all duration-200 ${
        selected
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-muted-foreground/40 bg-background'
      }`}
    >
      <Check
        className={`h-3 w-3 transition-opacity duration-200 ${selected ? 'opacity-100' : 'opacity-0'}`}
        strokeWidth={3.5}
      />
    </span>
  );
}

/** Smooth open/close (grid-rows 0fr -> 1fr + opacity). Closed content is `invisible`, so it can't be tabbed to. */
function Expand({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div
      aria-hidden={!open}
      className={`grid transition-[grid-template-rows,opacity,visibility] duration-300 ease-out motion-reduce:transition-none ${
        open ? 'visible grid-rows-[1fr] opacity-100' : 'invisible grid-rows-[0fr] opacity-0'
      }`}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

/** "Secured by cashfree" trust badge shown under the Pay Online button. */
function SecuredByCashfree() {
  return (
    <div className="mt-2.5 flex justify-center">
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-white px-2 py-1 text-[9px] text-muted-foreground">
        <Lock className="h-2.5 w-2.5" />
        Secured by
        <span className="inline-flex items-center gap-1 text-[12px] font-bold text-[#1d1740]">
          <span className="flex h-4 w-4 items-center justify-center rounded bg-[#5a3df0] text-[11px] leading-none text-white">c</span>
          cashfree
        </span>
      </span>
    </div>
  );
}

function Benefits({ items }: { items: ReadonlyArray<{ icon: keyof typeof BENEFIT_ICONS; title: string }> }) {
  return (
    <div className="flex flex-wrap gap-x-3.5 gap-y-1">
      {items.map((b) => {
        const Icon = BENEFIT_ICONS[b.icon];
        return (
          <span key={b.title} className="inline-flex items-center gap-1 text-[11px] font-medium leading-4 text-foreground">
            <Icon className="h-3.5 w-3.5 text-secondary" />
            {b.title}
          </span>
        );
      })}
    </div>
  );
}

const cardBase = 'rounded-xl border transition-all duration-200';
const cardOn =
  'border-[1.5px] border-primary bg-gradient-to-b from-white to-primary/5 dark:from-card dark:to-primary/5 shadow-[0_8px_24px_-14px_hsl(var(--primary)/0.55)]';
const cardOff = 'border-border/70 bg-card hover:border-primary/40';
const rowBtn =
  'flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40';

export default function PaymentMethodSelector({
  value,
  onChange,
  partial,
  onlineAvailable = true,
  savings,
  onlineTotal,
  codTotal,
  action,
  gateway,
}: PaymentMethodSelectorProps) {
  const online = value === 'online';
  const cod = value === 'cod';
  const part = value === 'partial';
  const hasSavings = savings > 0;
  const showSavings = hasSavings && onlineAvailable;

  return (
    <div className="flex flex-col gap-2.5">
      {/* Green saving strip: only on Partial / COD (Online already shows the discount). */}
      {showSavings && (part || cod) && (
        <div className="flex items-center gap-2 rounded-lg bg-green-100 px-3 py-2 text-[13px] font-bold text-green-900 dark:bg-green-950/60 dark:text-green-300">
          <Tag className="h-4 w-4 shrink-0" />
          {PAYMENT_COPY.saveStripPrefix} {formatINR(savings)} {PAYMENT_COPY.saveStripSuffix}
        </div>
      )}

      <div role="radiogroup" aria-label="Payment method" className="flex flex-col gap-2.5">
        {/* ───────── Pay Online (recommended) ───────── */}
        {onlineAvailable && (
          <div className={`${cardBase} ${online ? cardOn : cardOff}`}>
            <button type="button" role="radio" aria-checked={online} onClick={() => onChange('online')} className={rowBtn}>
              <RadioDot selected={online} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="font-serif text-base font-bold leading-tight text-primary">{PAYMENT_COPY.onlineTitle}</span>
                  <span className="rounded-full bg-[#f1e2b0] px-1.5 py-px text-[9px] font-semibold leading-4 text-[#4a3a10]">
                    {PAYMENT_COPY.recommended}
                  </span>
                </span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">{PAYMENT_COPY.onlineSub}</span>
              </span>
              <span className="shrink-0 text-right">
                {hasSavings && (
                  <span className="block text-[10px] leading-none text-muted-foreground line-through">{formatINR(codTotal)}</span>
                )}
                <span className="block font-serif text-lg font-bold leading-tight text-primary">{formatINR(onlineTotal)}</span>
              </span>
            </button>
            <Expand open={online}>
              <div className="px-3.5 pb-3.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground">{PAYMENT_COPY.payWith}</span>
                  {PAYMENT_COPY.payWithChips.map((c) => (
                    <span
                      key={c}
                      className="rounded-lg border border-border/70 bg-white px-2 py-0.5 text-[11px] font-medium text-[#1d1740]"
                    >
                      {c}
                    </span>
                  ))}
                </div>
                <div className="mt-2.5">
                  <Benefits items={PAYMENT_COPY.benefits} />
                </div>
                {action && <div className="mt-3 [&_button]:rounded-xl [&_button]:shadow-[0_8px_20px_-8px_hsl(var(--primary)/0.6)]">{action}</div>}
                {action && gateway === 'cashfree' && <SecuredByCashfree />}
                <p className="mt-2 text-center text-[10px] text-muted-foreground">{PAYMENT_COPY.secureNote}</p>
              </div>
            </Expand>
          </div>
        )}

        {/* ───────── Partial Pay (advance online, rest on delivery) ───────── */}
        {onlineAvailable && partial && (
          <div className={`${cardBase} ${part ? cardOn : cardOff}`}>
            <button type="button" role="radio" aria-checked={part} onClick={() => onChange('partial')} className={rowBtn}>
              <RadioDot selected={part} />
              <span className="min-w-0 flex-1">
                <span className="block font-serif text-base font-bold leading-tight text-foreground">{partial.title}</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  Pay {partial.percent}% now, rest on delivery
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className={`block font-serif text-lg font-bold leading-tight ${part ? 'text-primary' : 'text-foreground/80'}`}>
                  {formatINR(partial.advance)}
                </span>
                <span className="block text-[9px] leading-none text-secondary">now</span>
              </span>
            </button>
            <Expand open={part}>
              <div className="px-3.5 pb-3.5">
                <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block bg-primary transition-all duration-300"
                    style={{ width: `${Math.min(Math.max(partial.percent, 5), 95)}%` }}
                  />
                  <span className="block flex-1 bg-secondary/70" />
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                  <span>
                    Online now <b className="font-semibold text-foreground">{formatINR(partial.advance)}</b>
                  </span>
                  <span>
                    On delivery <b className="font-semibold text-foreground">{formatINR(partial.balance)}</b>
                  </span>
                </div>
                <div className="mt-2.5">
                  <Benefits items={PAYMENT_COPY.partialBenefits} />
                </div>
                {action && <div className="mt-3 [&_button]:rounded-xl [&_button]:shadow-[0_8px_20px_-8px_hsl(var(--primary)/0.6)]">{action}</div>}
                <span className="mt-2.5 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-snug text-amber-900">
                  <Info className="mt-px h-3.5 w-3.5 shrink-0" />
                  {PAYMENT_COPY.partialNote}
                </span>
              </div>
            </Expand>
          </div>
        )}

        {/* ───────── Cash on Delivery ───────── */}
        <div className={`${cardBase} ${cod ? cardOn : cardOff}`}>
          <button type="button" role="radio" aria-checked={cod} onClick={() => onChange('cod')} className={rowBtn}>
            <RadioDot selected={cod} />
            <span className="min-w-0 flex-1">
              <span className="block font-serif text-base font-bold leading-tight text-foreground">{PAYMENT_COPY.codTitle}</span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">{PAYMENT_COPY.codSub}</span>
            </span>
            <span className={`shrink-0 font-serif text-lg font-bold leading-tight ${cod ? 'text-foreground' : 'text-foreground/70'}`}>
              {formatINR(codTotal)}
            </span>
          </button>
          <Expand open={cod}>
            <div className="px-3.5 pb-3.5">
              <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <Truck className="h-3.5 w-3.5 shrink-0" />
                {PAYMENT_COPY.codQueueNote}
              </p>
              {action && <div className="mt-3 [&_button]:rounded-xl [&_button]:shadow-[0_8px_20px_-8px_hsl(var(--primary)/0.6)]">{action}</div>}
              {showSavings && (
                <button
                  type="button"
                  onClick={() => onChange('online')}
                  className="mt-2.5 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-green-600 bg-green-50 px-3 py-2 text-[13px] font-semibold text-green-900 transition-colors hover:bg-green-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600/40 dark:border-green-500 dark:bg-green-950/50 dark:text-green-300 dark:hover:bg-green-950/80"
                >
                  <Zap className="h-3.5 w-3.5 text-green-700 dark:text-green-400" />
                  {PAYMENT_COPY.switchToOnline} {formatINR(savings)}
                </button>
              )}
            </div>
          </Expand>
        </div>
      </div>

      {/* ───────── Pay now summary ───────── */}
      {(() => {
        const due = cod ? codTotal : part && partial ? partial.balance : 0;
        const payNow = cod ? 0 : part && partial ? partial.advance : onlineTotal;
        const sub = cod || (part && partial) ? `${formatINR(due)} due on delivery` : PAYMENT_COPY.nothingDue;
        return (
          <div className="mt-0.5 flex items-center justify-between gap-3 border-t border-dashed border-border px-1 pt-3" aria-live="polite">
            <div>
              <p className="text-sm font-semibold text-foreground">{PAYMENT_COPY.payNow}</p>
              <p className="text-[11px] text-muted-foreground">{sub}</p>
            </div>
            <p className={`font-serif text-xl font-bold ${cod ? 'text-muted-foreground' : 'text-primary'}`}>{formatINR(payNow)}</p>
          </div>
        );
      })()}

      <p className="text-center text-[10px] leading-snug text-muted-foreground">
        {!onlineAvailable ? (
          'Online payment is temporarily unavailable — please choose Cash on Delivery.'
        ) : partial ? (
          <>
            Same product price on every option — the{' '}
            <span className="text-primary">online-payment discount applies to full online payment only.</span>
          </>
        ) : (
          'Same price either way — the only difference is the online-payment discount shown above.'
        )}
      </p>
    </div>
  );
}
