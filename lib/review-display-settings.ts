// ---------------------------------------------------------------------
// Storefront "Reviews" section display settings, managed from
// Admin -> Reviews -> Display settings. Stored in the `settings` table
// under key 'review_display_settings'. The storefront reads it with the
// public anon key (the key is public on purpose -- it only holds display
// preferences). Writes go ONLY through app/api/admin/review-display-settings
// (admin-token gated, service role). See migration
// 20261029010000_review_display_settings_lock.sql which also blocks anon
// writes to this one key.
//
// This file is pure (no browser/Supabase imports) so both the admin API
// route and client components can import it.
// ---------------------------------------------------------------------

export type ReviewSort = 'newest' | 'highest' | 'lowest' | 'photos';
/** 'stars' = star row + bold title + avatar line (default).
 *  'chip'  = green "5 ★" chip + date, compact. */
export type ReviewCardStyle = 'stars' | 'chip';

export interface ReviewDisplaySettings {
  /** Reviews shown before the shopper taps "Load more". */
  initialCount: number;
  /** Reviews added on every "Load more" tap. */
  loadMoreCount: number;
  /** Show the "Photos from customers" strip at the top. */
  showPhotoGallery: boolean;
  /** Max thumbnails in that strip (the rest sit behind a "+N" tile). */
  photoGalleryMax: number;
  /** Show the rating / photo filter chips and the sort menu. */
  showFilters: boolean;
  /** Show the "Variation (colour)" chips when reviews carry a colour. */
  showColorFilter: boolean;
  /** Sort order a shopper sees first. Pinned reviews always come first. */
  defaultSort: ReviewSort;
  /** Review ids pinned to the top (and first in the photo strip). */
  featuredReviewIds: string[];
  /** Let shoppers who are not logged in rate / review a product. */
  allowGuestReviews: boolean;
  /** Publish guest reviews right away. Off = they wait for admin approval. */
  autoPublishGuestReviews: boolean;

  /** Card look on the product page and in the popup. */
  cardStyle: ReviewCardStyle;
  /** Show the review date on every review. */
  showDate: boolean;
  /** Show the bold review title (when the customer wrote one). */
  showTitle: boolean;
  /** Show the round initial avatar next to the reviewer name. */
  showAvatar: boolean;
  /** Show the "Verified Purchase" tick / badge. */
  showVerifiedBadge: boolean;
  /** Show the colour/variation chip on a review. */
  showVariantChip: boolean;
  /** Show customer photos inside the review cards. */
  showCardPhotos: boolean;
  /** Show the "Helpful" button in the popup. */
  showHelpful: boolean;
  /** Show the star-breakdown bars (5★ 4★ ...) next to the average. */
  showRatingBreakdown: boolean;
  /** Show the black "Rate this product" button. */
  showRateButton: boolean;
  /** Show "Reply from store" under a review that has a reply. */
  showStoreReply: boolean;
  /** Admin default: tick "Email this reply to the customer" when replying. */
  emailReplyByDefault: boolean;
}

export const DEFAULT_REVIEW_DISPLAY_SETTINGS: ReviewDisplaySettings = {
  initialCount: 5,
  loadMoreCount: 5,
  showPhotoGallery: true,
  photoGalleryMax: 12,
  showFilters: true,
  showColorFilter: true,
  defaultSort: 'newest',
  featuredReviewIds: [],
  allowGuestReviews: true,
  autoPublishGuestReviews: false,
  cardStyle: 'stars',
  showDate: true,
  showTitle: true,
  showAvatar: true,
  showVerifiedBadge: true,
  showVariantChip: true,
  showCardPhotos: true,
  showHelpful: true,
  showRatingBreakdown: true,
  showRateButton: true,
  showStoreReply: true,
  emailReplyByDefault: true,
};

const SORTS: ReviewSort[] = ['newest', 'highest', 'lowest', 'photos'];
const CARD_STYLES: ReviewCardStyle[] = ['stars', 'chip'];

const BOOL_KEYS = [
  'showDate',
  'showTitle',
  'showAvatar',
  'showVerifiedBadge',
  'showVariantChip',
  'showCardPhotos',
  'showHelpful',
  'showRatingBreakdown',
  'showRateButton',
  'showStoreReply',
  'emailReplyByDefault',
] as const;

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

export function mergeReviewDisplaySettings(
  value: Partial<ReviewDisplaySettings> | null | undefined
): ReviewDisplaySettings {
  const d = DEFAULT_REVIEW_DISPLAY_SETTINGS;
  const v = value || {};
  const ids = Array.isArray(v.featuredReviewIds)
    ? Array.from(new Set(v.featuredReviewIds.filter((x): x is string => typeof x === 'string' && x.length > 0)))
    : d.featuredReviewIds;
  const flags = {} as Pick<ReviewDisplaySettings, (typeof BOOL_KEYS)[number]>;
  for (const k of BOOL_KEYS) flags[k] = typeof v[k] === 'boolean' ? (v[k] as boolean) : d[k];
  return {
    ...flags,
    cardStyle: CARD_STYLES.includes(v.cardStyle as ReviewCardStyle) ? (v.cardStyle as ReviewCardStyle) : d.cardStyle,
    initialCount: clampInt(v.initialCount, 1, 50, d.initialCount),
    loadMoreCount: clampInt(v.loadMoreCount, 1, 50, d.loadMoreCount),
    showPhotoGallery: typeof v.showPhotoGallery === 'boolean' ? v.showPhotoGallery : d.showPhotoGallery,
    photoGalleryMax: clampInt(v.photoGalleryMax, 4, 60, d.photoGalleryMax),
    showFilters: typeof v.showFilters === 'boolean' ? v.showFilters : d.showFilters,
    showColorFilter: typeof v.showColorFilter === 'boolean' ? v.showColorFilter : d.showColorFilter,
    defaultSort: SORTS.includes(v.defaultSort as ReviewSort) ? (v.defaultSort as ReviewSort) : d.defaultSort,
    featuredReviewIds: ids.slice(0, 100),
    allowGuestReviews: typeof v.allowGuestReviews === 'boolean' ? v.allowGuestReviews : d.allowGuestReviews,
    autoPublishGuestReviews:
      typeof v.autoPublishGuestReviews === 'boolean' ? v.autoPublishGuestReviews : d.autoPublishGuestReviews,
  };
}
