import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { mergeReviewDisplaySettings } from '@/lib/review-display-settings';
import { rateLimit, clientIp } from '@/lib/simple-rate-limit';

// ---------------------------------------------------------------------
// POST /api/reviews/guest -- rating / review WITHOUT logging in.
//
// Public on purpose, so it is defended in layers: the admin switch
// (Admin > Reviews > display settings > "Allow reviews without login"),
// a hidden honeypot field, a per-IP limit, strict length/format checks,
// a duplicate guard, and -- unless the admin turned on auto-publish --
// the review waits in the moderation queue (is_approved = false).
// Guest reviews are never marked "Verified Purchase".
// ---------------------------------------------------------------------

const clean = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    // Honeypot: real people never fill this hidden field. Pretend success.
    if (typeof body?.website === 'string' && body.website.trim() !== '') {
      return NextResponse.json({ ok: true, published: false });
    }

    if (!rateLimit(`guest-review:${clientIp(req)}`, 6, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Too many reviews from this device. Please try again later.' }, { status: 429 });
    }

    const supabase = getSupabaseAdmin();

    const { data: settingsRow } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'review_display_settings')
      .maybeSingle();
    const settings = mergeReviewDisplaySettings((settingsRow?.value as any) ?? null);
    if (!settings.allowGuestReviews) {
      return NextResponse.json({ error: 'Please log in to write a review.' }, { status: 403 });
    }

    const productId = typeof body?.productId === 'string' ? body.productId : '';
    const rating = Number(body?.rating);
    const name = clean(body?.name, 40);
    const email = clean(body?.email, 120).toLowerCase();
    const title = clean(body?.title, 100);
    const comment = clean(body?.comment, 1000);
    const color = clean(body?.color, 60);
    const variantSlug = clean(body?.variantSlug, 160);
    const photos: string[] = Array.isArray(body?.photos)
      ? body.photos
          .filter((p: unknown): p is string => typeof p === 'string' && p.length < 600 && /^https?:\/\//.test(p) && p.includes('/media/'))
          .slice(0, 4)
      : [];

    if (!productId) return NextResponse.json({ error: 'A product is required.' }, { status: 400 });
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Please select a 1-5 star rating.' }, { status: 400 });
    }
    if (name.length < 2) return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email or leave it empty.' }, { status: 400 });
    }
    // Links in a review are almost always spam.
    if (/(https?:\/\/|www\.)/i.test(`${title} ${comment}`)) {
      return NextResponse.json({ error: 'Please remove links from your review.' }, { status: 400 });
    }

    const { data: product } = await supabase.from('products').select('id').eq('id', productId).maybeSingle();
    if (!product) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });

    // One guest review per name per product per day.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: dup } = await supabase
      .from('reviews')
      .select('id')
      .eq('product_id', productId)
      .is('user_id', null)
      .ilike('customer_name', name)
      .gte('created_at', since)
      .limit(1);
    if (dup && dup.length > 0) {
      return NextResponse.json({ error: 'You have already reviewed this product. Thank you!' }, { status: 409 });
    }

    const publish = settings.autoPublishGuestReviews;
    const { data, error } = await supabase
      .from('reviews')
      .insert({
        product_id: productId,
        user_id: null,
        customer_name: name,
        guest_email: email || null,
        rating,
        title: title || null,
        comment: comment || null,
        photos,
        variant_color: color || null,
        variant_slug: variantSlug || null,
        is_approved: publish,
        verified_purchase: false,
      })
      .select('id')
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, id: data.id, published: publish });
  } catch (err) {
    console.error('[reviews/guest POST] error:', err);
    return NextResponse.json({ error: 'Could not submit your review right now.' }, { status: 500 });
  }
}
