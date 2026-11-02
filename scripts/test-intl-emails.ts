// Phase 13 checks: customer emails show the charged currency for international orders, India emails stay INR.
// Run: npx tsx scripts/test-intl-emails.ts
import {
  orderCancelledByCustomerEmail,
  orderStatusUpdateEmail,
  returnStatusEmail,
  returnRefundProcessedEmail,
} from '../lib/email-templates';

let failed = 0;
function check(name: string, ok: boolean) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
}

const intl = { is_international: true, charge_currency: 'USD', charge_amount_minor: 5499, total_amount: 4950 };
const items = [{ product_name: 'Silk Saree', size: 'Free', quantity: 1, price: 4950 }];
const id = '12345678-aaaa-bbbb-cccc-1234567890ab';

// cancel (customer)
const c1 = orderCancelledByCustomerEmail({ id, items, total_amount: 4950, money: intl, refund: { status: 'refunded', amount: 4950 } }).html;
check('cancel email intl: shows $54.99', c1.includes('$54.99'));
check('cancel email intl: no rupee sign', !c1.includes('₹'));
check('cancel email intl: card wording', c1.includes('original card'));
const c2 = orderCancelledByCustomerEmail({ id, items, total_amount: 4950, refund: { status: 'refunded', amount: 4950 } }).html;
check('cancel email India: still INR', c2.includes('₹4,950') && !c2.includes('$'));

// status update
const s1 = orderStatusUpdateEmail({ id, status: 'paid', items, total_amount: 4950, money: intl } as any).html;
check('paid email intl: $54.99, no rupee', s1.includes('$54.99') && !s1.includes('₹'));
check('paid email intl: duty notice', s1.includes('Duties &amp; taxes'));
const s2 = orderStatusUpdateEmail({ id, status: 'paid', items, total_amount: 4950 } as any).html;
check('paid email India: INR, no duty notice', s2.includes('₹4,950') && !s2.includes('Duties &amp; taxes'));
const s3 = orderStatusUpdateEmail({ id, status: 'cancelled', items, total_amount: 4950, money: intl, refund: { status: 'refunded', amount: 4950 } } as any).html;
check('cancelled status email intl: refund in USD', s3.includes('Refund of $54.99'));

// returns
const r1 = returnStatusEmail({ id, order_id: id, type: 'return', status: 'approved', refund_amount: null, money: intl, intlReturnDays: 7 }).html;
check('return approved intl: return instructions + days', r1.includes('How to send it back') && r1.includes('within 7 days'));
const r2 = returnStatusEmail({ id, order_id: id, type: 'return', status: 'approved' }).html;
check('return approved India: no intl instructions', !r2.includes('How to send it back'));
const r3 = returnStatusEmail({ id, order_id: id, type: 'return', status: 'refunded', refund_amount: 2475, money: intl }).html;
check('return refunded intl: half of order = $27.50 (pro-rata)', r3.includes('$27.5'));
const f1 = returnRefundProcessedEmail({ order_id: id, refund_amount: 4950, money: intl }).html;
check('refund processed intl: $54.99 via Stripe', f1.includes('$54.99') && f1.includes('via Stripe') && !f1.includes('Razorpay'));
const f2 = returnRefundProcessedEmail({ order_id: id, refund_amount: 4950 }).html;
check('refund processed India: INR via Razorpay', f2.includes('₹4,950') && f2.includes('Razorpay'));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
