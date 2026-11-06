// Run from project root:  node apply-coupon-patch.js
// Patches your OLD app/checkout/page.tsx + components/providers.tsx IN PLACE.
// Everything else on the page (stepper-less layout, Coupons & Offers sheet, ...) stays as it is.
const fs = require('fs');
const P = 'app/checkout/page.tsx';
const PR = 'components/providers.tsx';
if (!fs.existsSync(P)) { console.error('Run this from the project root.'); process.exit(1); }
const raw = fs.readFileSync(P, 'utf8');
if (raw.includes('CouponTopCard')) { console.log('page.tsx already patched.'); }
else {
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  let s = raw.replace(/\r\n/g, '\n');

  const imp = "import { toast } from 'sonner';";
  if (!s.includes(imp)) { console.error('FAILED: sonner import not found'); process.exit(1); }
  s = s.replace(imp, imp + "\nimport { CouponTopCard } from '@/components/checkout/coupon-top-card';");

  const t0 = s;
  s = s.replace(/toast\.success\(`Coupon "\$\{result\.coupon\.code\}" applied`\);/g,
    '/* celebration is shown by <CouponTopCard /> */');
  if (t0 === s) console.warn('WARNING: coupon toast line not found in page.tsx (the global popup filter still hides it).');

  // ---- find the old top coupon expression: {appliedCoupon ? ( ... ) : ( ... )} ----
  let exprStart = -1;
  const mk = s.indexOf('{/* Top coupon banner');
  if (mk >= 0) {
    const cend = s.indexOf('*/}', mk) + 3;
    exprStart = s.indexOf('{', cend);
  } else {
    const m = /\{appliedCoupon \? \(\s*\n\s*<div className="mb-4 overflow-hidden/.exec(s);
    if (m) exprStart = m.index;
  }
  if (exprStart < 0) { console.error('FAILED: old top coupon block not found. Send me your page.tsx.'); process.exit(1); }
  let depth = 0, i = exprStart, exprEnd = -1;
  for (; i < s.length; i++) {
    const c = s[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { exprEnd = i + 1; break; } }
  }
  const old = exprEnd > 0 ? s.slice(exprStart, exprEnd) : '';
  if (!old || old.length > 15000 || old.includes('<PriceDetailsSheet') || !/appliedCoupon/.test(old)) {
    console.error('FAILED: could not safely isolate the old coupon block. Send me your page.tsx.'); process.exit(1);
  }

  // Existing "View all coupons" handler (e.g. opens your Coupons & Offers sheet)
  let viewAll = '';
  const vm = /onClick=\{(\(\)\s*=>[\s\S]*?)\}\s*className=[^\n]*\n\s*>\s*View all coupons/.exec(old);
  if (vm && !/setShowAllCoupons/.test(vm[1])) viewAll = vm[1].trim();

  const lineStart = s.lastIndexOf('\n', exprStart) + 1;
  const indent = s.slice(lineStart, exprStart).match(/^\s*/)[0];
  const hadBanner = /You(?:'|&apos;|’)re saving/.test(old);
  const hasTotal = /\bconst totalSavings\b/.test(s);
  const hasPay = /\bconst potentialOnlinePaymentDiscount\b/.test(s) && /\bpaymentDiscount\b/.test(s);
  const hasRec = /\bconst recoveryDiscount\b/.test(s);

  let banner = '';
  if (hadBanner && hasTotal) {
    const cls = 'flex items-center justify-center gap-1.5 rounded-t-lg bg-primary px-3 py-1.5 text-center text-xs font-semibold text-primary-foreground';
    banner = `
${indent}  topBanner={
${indent}    totalSavings > 0 ? (
${indent}      <div className="${cls}">
${indent}        <BadgePercent className="h-3.5 w-3.5" />
${indent}        You're saving {formatINR(totalSavings)} on this order
${indent}      </div>
${indent}    ) : ${hasPay ? `paymentDiscount.enabled && potentialOnlinePaymentDiscount > 0 ? (
${indent}      <div className="${cls}">
${indent}        <BadgePercent className="h-3.5 w-3.5" />
${indent}        Upto {formatINR(potentialOnlinePaymentDiscount)} off on prepaid orders
${indent}      </div>
${indent}    ) : null` : 'null'}
${indent}  }`;
  }

  const jsx =
`<CouponTopCard
${indent}  appliedCode={appliedCoupon?.code ?? null}
${indent}  couponSavings={Math.max(0, couponDiscount${hasRec ? ' - recoveryDiscount' : ''})}
${indent}  onApply={(code) => applyCoupon(code, subtotal, items.length)}
${indent}  onRemove={handleRemoveCoupon}${viewAll ? `
${indent}  onViewAll={${viewAll}}` : ''}${banner}
${indent}/>`;
  // keep the old block's leading comment, swap only the expression
  s = s.slice(0, exprStart) + jsx + s.slice(exprEnd);

  fs.writeFileSync(P + '.bak', raw);
  fs.writeFileSync(P, s.replace(/\n/g, eol));
  console.log('page.tsx patched. Backup: ' + P + '.bak (delete before git add)');
  console.log(viewAll ? 'View all coupons -> opens your existing sheet (' + viewAll + ')'
                      : 'NOTE: your old "View all coupons" handler not detected -> list opens inside the card.');
  console.log(banner ? 'Maroon "You\'re saving" bar kept on top of the card.' : 'No maroon bar inside old block -> left as is.');
}

// ---- providers.tsx: swap sonner Toaster for the wrapper that hides the coupon popup ----
if (fs.existsSync(PR)) {
  const pr = fs.readFileSync(PR, 'utf8');
  if (pr.includes('coupon-celebration-toaster')) console.log('providers.tsx already patched.');
  else if (pr.includes("import { Toaster } from 'sonner';")) {
    fs.writeFileSync(PR + '.bak', pr);
    fs.writeFileSync(PR, pr.replace("import { Toaster } from 'sonner';", "import { Toaster } from './coupon-celebration-toaster';"));
    console.log('providers.tsx patched. Backup: ' + PR + '.bak');
  } else console.warn("WARNING: providers.tsx sonner import line not found; change it by hand to: import { Toaster } from './coupon-celebration-toaster';");
}
