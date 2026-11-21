import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { mergeReviewDisplaySettings } from '@/lib/review-display-settings';
import { rateLimit, clientIp } from '@/lib/simple-rate-limit';

// POST /api/store-reviews -- "Write a store review" (no login needed).
// Layers: admin switch, honeypot, per-IP limit, length/format checks,
// duplicate guard, and moderation unless the admin enabled auto-publish.
// "Verified buyer" is set only when the email matches a real order.

const clean = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body?.website === 'string' && body.website.trim() !== '') {
      return NextResponse.json({ ok: true, published: false });
    }
    if (!rateLimit(`store-review:${clientIp(req)}`, 4, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Too many reviews from this device. Please try again later.' }, { status: 429 });
    }

    const supabase = getSupabaseAdmin();
    const { data: row } = await supabase.from('settings').select('value').eq('key', 'review_display_settings').maybeSingle();
    const settings = mergeReviewDisplaySettings((row?.value as any) ?? null);
    if (!settings.allowStoreReviews) {
      return NextResponse.json({ error: 'Store reviews are not open right now.' }, { status: 403 });
    }

    const rating = Number(body?.rating);
    const name = clean(body?.name, 40);
    const email = clean(body?.email, 120).toLowerCase();
    const title = clean(body?.title, 100);
    const comment = clean(body?.comment, 1000);

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Please select a 1-5 star rating.' }, { status: 400 });
    }
    if (name.length < 2) return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email or leave it empty.' }, { status: 400 });
    }
    if (comment.length < 5) return NextResponse.json({ error: 'Please write a few words about your experience.' }, { status: 400 });
    if (/(https?:\/\/|www\.)/i.test(`${title} ${comment}`)) {
      return NextResponse.json({ error: 'Please remove links from your review.' }, { status: 400 });
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: dup } = await supabase
      .from('store_reviews')
      .select('id')
      .ilike('customer_name', name)
      .gte('created_at', since)
      .limit(1);
    if (dup && dup.length > 0) {
      return NextResponse.json({ error: 'You have already reviewed our store. Thank you!' }, { status: 409 });
    }

    let verified = false;
    if (email) {
      const { data: orders } = await supabase.from('orders').select('id').ilike('customer_email', email).limit(1);
      verified = !!(orders && orders.length > 0);
    }

    const publish = settings.autoPublishStoreReviews;
    const { error } = await supabase.from('store_reviews').insert({
      customer_name: name,
      customer_email: email || null,
      rating,
      title: title || null,
      comment,
      is_approved: publish,
      verified_purchase: verified,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true, published: publish });
  } catch (err) {
    console.error('[store-reviews POST] error:', err);
    return NextResponse.json({ error: 'Could not submit your review right now.' }, { status: 500 });
  }
}
