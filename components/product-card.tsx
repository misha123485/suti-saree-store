'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, Check, ShoppingBag, Star } from 'lucide-react';
import { Product } from '@/lib/types';
import { formatINR, discountPct } from '@/lib/format';
import { getVariantDisplayName } from '@/lib/variant-display-name';
import { useCart, getVisibleBogoPromotion, formatBogoLabel, usePaymentDiscount } from '@/lib/cart-context';
import { Badge } from '@/components/ui/badge';
import WishlistButton from '@/components/wishlist-button';
import NotifyMeDialog from '@/components/product/notify-me-dialog';
import SizePickerSheet from '@/components/product/size-picker-sheet';
import { cardColorOf, isInBag, toCartProduct } from '@/lib/card-cart-product';
import CatalogCardMedia from '@/components/catalog-card-media';
import { toPublicMediaUrl, toPublicMediaUrls } from '@/lib/media-url';
import { preloadImages, preloadImagesOnHover, cancelHoverPreload } from '@/lib/preload-image';
import { Truck } from 'lucide-react';

export default function ProductCard({
  product,
  priority = false,
  compact = false,
  imageOverride,
  slugOverride,
  disableAutoplayVideo = false,
  blurPreviews,
}: {
  product: Product;
  /** Set true for cards in the first visible row so their image gets
   *  preloaded instead of lazy-loaded — improves LCP on the shop/home grid. */
  priority?: boolean;
  /** Smaller padding/type for horizontal carousels (Similar Products,
   *  Recently Viewed) where cards sit in a narrower, scrollable strip. */
  compact?: boolean;
  /**
   * Used by "search by photo" results: the exact photo (which may be a
   * colour variant's photo, not the product's default image) that actually
   * matched the shopper's uploaded photo. When present it takes priority
   * over the product's own default/first image, so a shopper who searched
   * with a photo of the "blue" variant sees that blue photo on the card
   * instead of whatever colour happens to be the product's default.
   */
  imageOverride?: string;
  /** When a search query matches a specific colour variant, pass that
   *  variant's slug so the card links directly to that colour. */
  slugOverride?: string;
  /**
   * Forces this card to show its still image even when the admin has
   * "Autoplay video in catalog" switched on for the product. Used on the
   * /search results grid so a shopper sees exactly the photo (colour
   * variant match, etc.) that corresponds to their search instead of an
   * autoplaying video -- /shop, category pages and everywhere else keep
   * the autoplay video untouched.
   */
  disableAutoplayVideo?: boolean;
  /** Real per-image blur previews (LQIP), canonical-URL -> data URL, fetched
   *  server-side by the /shop and /category pages (see their page.tsx).
   *  CatalogCardMedia falls back to the generic shimmer for any photo not
   *  present here. */
  blurPreviews?: Record<string, string>;
}) {
  const { addItem, activePromotions, items: cartItems } = useCart();
  const router = useRouter();
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  // The card shows (and links to) the default colour variant, so its stock state is that
  // colour's real stock -- not the base product's flag, which can say "in stock" while this
  // colour is sold out. Exploded per-colour cards already carry their own `inStock`.
  const inStock = product.default_variant_in_stock ?? product.inStock;

  // Part 4b: tag products currently inside an active BOGO promotion's
  // scope, same "is this product in scope" rule the cart itself uses to
  // apply the discount (see getVisibleBogoPromotion in
  // lib/cart-context.tsx) — so the badge and the actual discount never
  // disagree about which products are on offer. Also respects the
  // per-collection "show BOGO badge" toggle (Admin > Collections).
  const bogoPromotion = getVisibleBogoPromotion(product.id, activePromotions);

  const openNotify = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setNotifyOpen(true);
  };

  const quickAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!inStock || product.sizes.length === 0) {
      router.push(`/product/${product.slug}`);
      return;
    }
    // Always ask for the size first (even a single "Onesize"), like the
    // size sheet in the Similar Products popup.
    setSizeOpen(true);
  };

  // The swatch dots sit inside the card's outer <Link> -- stop the click from following the card's own href (which
  // points at the default variant) and send it straight to the colour
  // that was actually clicked.
  const goToVariant = (e: React.MouseEvent, variant: (typeof swatchVariants)[number]) => {
    e.preventDefault();
    e.stopPropagation();
    router.push(`/product/${variant.slug}`);
  };

  const discount = discountPct(product.price, product.mrp);
  // Same "pay online, save X%" banner shown on the product page (see
  // app/product/[slug]/product-detail.tsx) -- short/no-dialog version for
  // the catalog card. No coupon context here, so it's just a flat percent
  // off the card's listed price.
  const { paymentDiscount } = usePaymentDiscount();
  const onlinePaymentSavings =
    paymentDiscount.enabled && paymentDiscount.percent > 0
      ? Math.round((product.price * paymentDiscount.percent) / 100)
      : 0;
  // Every colour this card can switch straight to: the base product's own
  // colour (product_variants rows never include it) plus every real
  // variant. Deduped by colour name so a base colour already re-added as
  // a variant row doesn't show twice. Each entry carries the slug the
  // swatch should link to and the image it should preview on hover.
  const swatchVariants = useMemo(() => {
    type Swatch = { slug: string; color: string; image?: string | null };
    const base: Swatch = {
      slug: product.slug,
      color: product.colors?.[0] ?? '',
      image: product.images?.[0] ?? null,
    };
    const seen = new Set<string>();
    const merged: Swatch[] = [];
    for (const v of [base, ...(product.variant_list ?? [])]) {
      const key = v.color.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(v);
    }
    return merged;
  }, [product]);
  // Set while a shopper is hovering/focusing a swatch dot -- swaps the
  // card's photo to that colour's photo so they can see it before
  // committing to the click, same pattern as the product-detail gallery.
  const [previewVariant, setPreviewVariant] = useState<(typeof swatchVariants)[number] | null>(null);
  // When this product has colour variants, the card should show and link to
  // the default one -- shoppers land straight on that colour, and clicking
  // through from shop/category always opens that exact variant.
  const href = `/product/${slugOverride || product.default_variant_slug || product.slug}`;
  const img = toPublicMediaUrl(
    previewVariant?.image || imageOverride || product.default_variant_image || product.images[0]
  ) || 'https://placehold.co/800x1000?text=No+Image';
  const hoverImg = toPublicMediaUrl(product.images[1]) || undefined;
  // Real per-image blur preview for this exact card's photo(s), if the
  // server-side backfill has generated one yet (see blurPreviews prop doc
  // above). CatalogCardMedia falls back to the generic shimmer when this
  // is undefined -- e.g. previewVariant/imageOverride swaps the photo to
  // one that wasn't in the batch /shop or /category prefetched.
  const blurDataUrl = blurPreviews?.[img];
  const hoverBlurDataUrl = hoverImg ? blurPreviews?.[hoverImg] : undefined;
  // The card's photo (`img` above) can be the default variant's photo,
  // which may be a different colour than the base product's own name/first
  // photo (e.g. base "Maroon Handloom Kurti" with a "Blue" default variant).
  // Swap the base colour for the variant's colour the same way the product
  // detail page does, so the name/alt text shown always matches the photo
  // actually on screen instead of contradicting it.
  const displayName = getVariantDisplayName(product.name, product.colors?.[0], product.default_variant_color);
  const altText = `${displayName} - ${product.fabric} ${product.category} from ${product.origin}`;

  // Exactly what this card adds to the bag: the colour it is showing (default
  // variant, or the exploded colour card's own colour) -- not always the base
  // colour. "Added to Bag" is also per colour, so adding Red no longer marks
  // the Green/Black cards of the same product as added.
  const cardVariant = product.default_variant_color
    ? { slug: product.default_variant_slug, color: product.default_variant_color, image: product.default_variant_image }
    : null;
  const cartProduct = toCartProduct(product, cardVariant);
  const cardColor = cardColorOf(product, cardVariant);
  const inBag = isInBag(cartItems, cartProduct);
  const hasVariation =
    swatchVariants.length > 1 || (product.variant_list?.length ?? 0) > 0 || !!(product as { isVariantCard?: boolean }).isVariantCard;
  const moreColors = Math.max(0, swatchVariants.length - 1);

  // The product-detail page opens straight into these images (its gallery's
  // first slide, or the swapped-in variant photo the card already shows), so
  // preloading them here means the click lands on an image already sitting
  // in the browser's cache -- no spinner/blank flash on the detail page.
  // Only the first 1-2 matter: that's all that's visible before the shopper
  // can even start scrolling the gallery.
  const detailPagePreloadImages = toPublicMediaUrls([
    imageOverride || product.default_variant_image || product.images[0],
    product.images[1],
  ]);

  const startPreload = () => preloadImagesOnHover(detailPagePreloadImages);
  // A touch is already a committed tap toward navigation (unlike a mouse
  // hover, which can just be passing over the grid) -- fire immediately,
  // no debounce, so the fetch has the maximum possible head start before
  // the page transition completes.
  const startPreloadImmediate = () => preloadImages(detailPagePreloadImages);

  const fmtCount = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(n));
  const ratingStar =
    product.rating >= 3.5
      ? 'fill-emerald-600 text-emerald-600'
      : product.rating >= 2.5
      ? 'fill-amber-500 text-amber-500'
      : 'fill-red-500 text-red-500';
  const subtitle = [product.fabric, product.category].filter(Boolean).join(' ');

  return (
    <>
    <Link
      href={href}
      onMouseEnter={startPreload}
      onMouseLeave={cancelHoverPreload}
      onTouchStart={startPreloadImmediate}
      onFocus={startPreload}
      className="group relative flex flex-col product-card-hover"
    >
      <div className="relative overflow-hidden rounded-2xl bg-muted">
        <CatalogCardMedia
          img={img}
          hoverImg={hoverImg}
          altText={altText}
          videoUrl={toPublicMediaUrl(product.video_url) || undefined}
          autoplayVideo={!disableAutoplayVideo && !!product.autoplay_video_in_catalog}
          priority={priority}
          compact={compact}
          blurDataUrl={blurDataUrl}
          hoverBlurDataUrl={hoverBlurDataUrl}
        />
        <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
          {!inStock && (
            <Badge className="gap-1.5 border-white/10 bg-gradient-to-r from-neutral-900 to-neutral-700 px-2 py-0.5 text-[10px] tracking-wide text-white shadow-md hover:from-neutral-900 hover:to-neutral-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />
              Out of Stock
            </Badge>
          )}
          {inStock && product.featured && (
            <Badge className="bg-emerald-600 px-2 py-0.5 text-[10px] text-white shadow-sm hover:bg-emerald-600">
              Bestseller
            </Badge>
          )}
          {bogoPromotion && (
            <Badge className="border-transparent bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground shadow-sm hover:bg-secondary">
              {formatBogoLabel(bogoPromotion)}
            </Badge>
          )}
        </div>
        {!inStock && (
          <div className="pointer-events-none absolute inset-0 bg-background/55" />
        )}
        {!inStock && (
          <button
            type="button"
            onClick={openNotify}
            aria-label={`Notify me when ${displayName} is back in stock`}
            className="absolute inset-x-3 bottom-3 z-10 flex items-center justify-center gap-1.5 rounded-full border border-primary/20 bg-white/90 py-2 text-xs font-semibold text-primary shadow-lg backdrop-blur transition hover:bg-white"
          >
            <Bell className="h-3.5 w-3.5" />
            Notify me
          </button>
        )}
        {product.reviews > 0 && product.rating > 0 && (
          <span
            className={`absolute left-2 z-10 inline-flex items-center gap-1 rounded-md bg-background/95 px-1.5 py-0.5 text-[11px] font-semibold text-foreground shadow-sm ${
              inStock ? 'bottom-2' : 'bottom-14'
            }`}
            aria-label={`Rated ${product.rating.toFixed(1)} out of 5 from ${product.reviews} reviews`}
          >
            {product.rating.toFixed(1)}
            <Star className={`h-3 w-3 ${ratingStar}`} />
            <span className="h-3 w-px bg-border" />
            <span className="font-medium text-muted-foreground">{fmtCount(product.reviews)}</span>
          </span>
        )}
      </div>

      <div className={`flex flex-1 flex-col ${compact ? 'gap-0.5 pt-2' : 'gap-1 pt-2.5'}`}>
        {/* Title + wishlist heart on one row */}
        <div className="flex items-start justify-between gap-2">
          <h3 className={`line-clamp-1 min-w-0 font-serif font-semibold leading-snug text-foreground ${compact ? 'text-[13px]' : 'text-[15px]'}`}>
            {displayName}
          </h3>
          <WishlistButton
            productId={product.id}
            className="-mr-1 -mt-0.5 h-7 w-7 shrink-0 bg-transparent shadow-none hover:bg-muted"
          />
        </div>

        {subtitle && (
          <p className={`line-clamp-1 text-muted-foreground ${compact ? 'text-[11px]' : 'text-xs'}`}>{subtitle}</p>
        )}

        {hasVariation && cardColor && (
          <p className={`line-clamp-1 text-muted-foreground ${compact ? 'text-[10px]' : 'text-xs'}`}>
            Colour: <span className="font-semibold text-foreground/80">{cardColor}</span>
            {moreColors > 0 && <span> · +{moreColors} more</span>}
          </p>
        )}

        {/* Price */}
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
          <span className={`font-bold text-foreground ${compact ? 'text-[15px]' : 'text-lg'}`}>
            {formatINR(product.price)}
          </span>
          {product.mrp && product.mrp > product.price && (
            <>
              <span className="text-xs text-muted-foreground line-through">{formatINR(product.mrp)}</span>
              <span className="text-xs font-bold text-emerald-600">{discount}% OFF</span>
            </>
          )}
        </div>

        {onlinePaymentSavings > 0 && (
          <p className="line-clamp-1 text-[11px] leading-tight">
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
              Best Price {formatINR(Math.max(0, product.price - onlinePaymentSavings))}
            </span>{' '}
            <span className="text-muted-foreground">with online payment</span>
          </p>
        )}

        <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          <Truck className="h-3 w-3 text-emerald-600" />
          Free Delivery
        </span>

        {swatchVariants.length > 1 && (
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {swatchVariants.map((v) => (
              <button
                key={v.slug}
                type="button"
                title={v.color}
                aria-label={`View in ${v.color}`}
                onClick={(e) => goToVariant(e, v)}
                onMouseEnter={() => setPreviewVariant(v)}
                onMouseLeave={() => setPreviewVariant(null)}
                onFocus={() => setPreviewVariant(v)}
                onBlur={() => setPreviewVariant(null)}
                className={`h-3.5 w-3.5 shrink-0 rounded-full border transition-transform hover:scale-125 ${
                  previewVariant?.slug === v.slug
                    ? 'border-primary ring-1 ring-primary ring-offset-1'
                    : 'border-border/70'
                }`}
                style={{ backgroundColor: v.color.toLowerCase().replace(/\s+/g, '') }}
              />
            ))}
          </div>
        )}

        <div className="mt-auto pt-2">
          {inStock ? (
            <button
              type="button"
              onClick={quickAdd}
              className={`flex w-full items-center justify-center gap-1.5 rounded-lg border py-2 text-sm font-semibold transition-colors active:scale-[0.98] ${
                inBag
                  ? 'border-emerald-600/50 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                  : 'border-primary/60 text-primary hover:bg-primary/5'
              }`}
            >
              {inBag ? <Check className="h-4 w-4" /> : <ShoppingBag className="h-4 w-4" />}
              {inBag ? 'Added to Bag' : 'Add to Bag'}
            </button>
          ) : (
            <span className="flex w-full items-center justify-center rounded-lg border border-border py-2 text-sm font-semibold text-muted-foreground">
              Out of Stock
            </span>
          )}
        </div>
      </div>
    </Link>
    {sizeOpen && inStock && (
      <SizePickerSheet
        name={cartProduct.name}
        image={img}
        price={product.price}
        mrp={product.mrp}
        sizes={product.sizes}
        color={hasVariation ? cardColor : null}
        onDone={(size) => addItem(cartProduct, size, 1)}
        onClose={() => setSizeOpen(false)}
      />
    )}
    {notifyOpen && !inStock && (
      <NotifyMeDialog
        open={notifyOpen}
        onOpenChange={setNotifyOpen}
        productId={product.id}
        name={displayName}
        image={img}
        color={product.default_variant_color ?? product.colors?.[0] ?? null}
        slug={product.default_variant_slug || product.slug}
      />
    )}
    </>
  );
}
