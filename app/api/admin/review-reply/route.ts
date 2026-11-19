import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/email';
import { reviewReplyEmail } from '@/lib/email-templates';

// Admin -> Reviews -> "Reply from store".
//   POST   { reviewId, reply, sendEmail }  save/update the reply (+ optional email)
//   DELETE ?reviewId=<uuid>                remove the reply
//
// Writes use the service role on purpose: the public `review_replies` table
// is read-only for anon/authenticated (see migration 20261119000000), so a
// customer can never forge a "Reply from store".

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.sutisaree.com').replace(/\/$/, '');
const MAX_REPLY = 1000;

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

/** guest_email -> the order's customer_email -> the account's login email. */
async function resolveReviewerEmail(
  admin: ReturnType<typeof getSupabaseAdmin>,
  review: { guest_email?: string | null; order_id?: string | null; user_id?: string | null }
): Promise<string | null> {
  const clean = (v: unknown) => (typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? v.trim() : null);

  const guest = clean(review.guest_email);
  if (guest) return guest;

  if (review.order_id) {
    const { data } = await admin.from('orders').select('customer_email').eq('id', review.order_id).maybeSingle();
    const e = clean((data as any)?.customer_email);
    if (e) return e;
  }

  if (review.user_id) {
    try {
      const { data } = await admin.auth.admin.getUserById(review.user_id);
      const e = clean(data?.user?.email);
      if (e) return e;
    } catch {
      /* fall through */
    }
  }
  return null;
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const reviewId = typeof body?.reviewId === 'string' ? body.reviewId : '';
  const reply = typeof body?.reply === 'string' ? body.reply.trim() : '';
  const wantEmail = body?.sendEmail === true;

  if (!reviewId) return NextResponse.json({ error: 'reviewId is required' }, { status: 400 });
  if (!reply) return NextResponse.json({ error: 'Reply cannot be empty' }, { status: 400 });
  if (reply.length > MAX_REPLY) {
    return NextResponse.json({ error: `Reply is too long (max ${MAX_REPLY} characters)` }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: review, error: rErr } = await admin
    .from('reviews')
    .select('id, product_id, user_id, order_id, guest_email, customer_name, rating, title, comment, products(name, slug)')
    .eq('id', reviewId)
    .maybeSingle();
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
  if (!review) return NextResponse.json({ error: 'Review not found' }, { status: 404 });

  const repliedAt = new Date().toISOString();
  const { error: upErr } = await admin.from('review_replies').upsert(
    { review_id: review.id, product_id: review.product_id, reply, replied_at: repliedAt },
    { onConflict: 'review_id' }
  );
  if (upErr) {
    const hint = /review_replies/i.test(upErr.message)
      ? ' (run supabase/migrations/20261119000000_review_replies.sql first)'
      : '';
    return NextResponse.json({ error: upErr.message + hint }, { status: 500 });
  }

  // ---- optional email ----
  let email: { requested: boolean; sent: boolean; to?: string; note?: string } = { requested: wantEmail, sent: false };
  if (wantEmail) {
    const to = await resolveReviewerEmail(admin, review as any);
    if (!to) {
      email.note = 'No email address on file for this reviewer, so nothing was emailed.';
    } else {
      const product = Array.isArray((review as any).products) ? (review as any).products[0] : (review as any).products;
      const tpl = reviewReplyEmail({
        customer_name: review.customer_name,
        product_name: product?.name ?? 'your product',
        product_url: product?.slug ? `${SITE_URL}/product/${product.slug}` : SITE_URL,
        rating: review.rating,
        review_text: [review.title, review.comment].filter(Boolean).join(' - '),
        reply,
      });
      const result = await sendEmail({ to, subject: tpl.subject, html: tpl.html });
      if (result.success) {
        email = { requested: true, sent: true, to };
        await admin.from('review_replies').update({ email_to: to, email_sent_at: new Date().toISOString() }).eq('review_id', review.id);
      } else {
        email = { requested: true, sent: false, to, note: typeof result.error === 'string' ? result.error : 'Email could not be sent' };
      }
    }
  }

  return NextResponse.json({ success: true, reply: { review_id: review.id, reply, replied_at: repliedAt }, email });
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const reviewId = new URL(req.url).searchParams.get('reviewId');
  if (!reviewId) return NextResponse.json({ error: 'reviewId is required' }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { error } = await admin.from('review_replies').delete().eq('review_id', reviewId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
