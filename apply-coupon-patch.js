// Run from project root:  node apply-coupon-patch.js
// Patches app/checkout/page.tsx IN PLACE (all your other local changes stay).
const fs = require('fs');
const path = require('path');
const p = 'app/checkout/page.tsx';
if (!fs.existsSync(p)) { console.error('Run this from the project root.'); process.exit(1); }
const raw = fs.readFileSync(p, 'utf8');
if (raw.includes('CouponTopCard')) { console.log('Already patched.'); process.exit(0); }
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let s = raw.replace(/\r\n/g, '\n');

// 1. import
const imp = "import { toast } from 'sonner';";
if (!s.includes(imp)) { console.error("FAILED: sonner import not found."); process.exit(1); }
s = s.replace(imp, imp + "\nimport { CouponTopCard } from '@/components/checkout/coupon-top-card';");

// 2. remove the "Coupon applied" toast popup
const t0 = s;
s = s.replace(/toast\.success\(`Coupon "\$\{result\.coupon\.code\}" applied`\);/g,
  '/* celebration is shown by <CouponTopCard /> */');
if (t0 === s) console.warn('WARNING: coupon toast line not found (maybe already removed).');

// 3. locate the old top coupon block
const start = s.indexOf('{/* Top coupon banner');
const end = s.indexOf('<PriceDetailsSheet');
if (start < 0 || end < start) {
  console.error('FAILED: old top coupon block not found. Send me your latest app/checkout/page.tsx.');
  process.exit(1);
}
const lineStart = s.lastIndexOf('\n', start) + 1;
const indent = s.slice(lineStart, start);

// Is the maroon "You're saving ₹X on this order" bar rendered somewhere else
// (outside the old block / in other files)? If yes, don't add a second one.
const bannerRe = /You(?:'|&apos;|’)re saving/;
const outside = s.slice(0, start) + s.slice(end);
let bannerElsewhere = bannerRe.test(outside);
if (!bannerElsewhere) {
  for (const f of ['components/header.tsx', 'components/checkout/sticky-order-bar.tsx', 'components/checkout/price-details-sheet.tsx']) {
    if (fs.existsSync(f) && bannerRe.test(fs.readFileSync(f, 'utf8'))) { bannerElsewhere = true; break; }
  }
}
const hasRecovery = /\bconst recoveryDiscount\b/.test(s);
const hasTotalSavings = /\bconst totalSavings\b/.test(s);

const banner = (!bannerElsewhere && hasTotalSavings) ? `
${indent}{totalSavings > 0 && (
${indent}  <div className="mb-4 flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-center text-xs font-semibold text-primary-foreground">
${indent}    <BadgePercent className="h-3.5 w-3.5" />
${indent}    You're saving {formatINR(totalSavings)} on this order
${indent}  </div>
${indent})}
` : '';

const block =
`${indent}{/* Coupon card: code box with Apply inside, "Show on checkout" coupons,
${indent}    "You saved ₹X" + celebration animation, "View all coupons & Offers". */}${banner}
${indent}<CouponTopCard
${indent}  appliedCode={appliedCoupon?.code ?? null}
${indent}  couponSavings={Math.max(0, couponDiscount${hasRecovery ? ' - recoveryDiscount' : ''})}
${indent}  onApply={(code) => applyCoupon(code, subtotal, items.length)}
${indent}  onRemove={handleRemoveCoupon}
${indent}/>

`;
s = s.slice(0, lineStart) + block + indent + s.slice(end);

fs.writeFileSync(p + '.bak', raw);
fs.writeFileSync(p, s.replace(/\n/g, eol));
console.log('Done. Backup: app/checkout/page.tsx.bak (delete before git add)');
console.log(bannerElsewhere ? 'Maroon savings bar found elsewhere -> kept as is.' : 'Maroon savings bar added above the coupon card.');
