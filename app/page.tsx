import { getServerSupabase } from '@/lib/supabase-server';
import { getBrandSettings } from '@/lib/brand-server';
import { safeJsonLd } from '@/lib/json-ld';
import { fetchHomeData } from '@/lib/home-data-server';
import HomeClient from './home-client';
import type { Metadata } from 'next';
import { toPublicMediaUrl } from '@/lib/media-url';
import {
  BRAND_NAME,
  HOME_DESCRIPTION,
  HOME_TITLE,
  SITE_URL as SEO_SITE_URL,
  SOCIAL_FALLBACK,
} from '@/lib/seo-site';
import { buildOrganizationJsonLd, buildWebSiteJsonLd, cleanSameAs } from '@/lib/seo-jsonld';

const SITE_URL = SEO_SITE_URL;

// Homepage now fetches products/categories/collections server-side (see
// fetchHomeData below) instead of the client re-fetching them fresh on
// every visit. Without a revalidate value this page would render once at
// build time and could go stale indefinitely as products/collections
// change in admin — 60s keeps it fresh, same safety net used on the
// product and category pages.
// CPU-saving change: 60s -> 1800s (30 min). Admin edits already purge this
// page instantly via revalidatePath('/'), so the longer window is only the
// safety net for changes that don't go through admin (e.g. vendor edits).
export const revalidate = 86400; // 24h - CPU saver (was 6h); admin edits still purge via revalidatePath

// The home <title> is fixed in code (lib/seo-site.ts) so it always STARTS with the
// brand "Suti Saree" -- the admin SEO title (Admin > Marketing > SEO) is still used
// as the default for pages that do not set their own.
export const metadata: Metadata = {
  title: { absolute: HOME_TITLE },
  description: HOME_DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    url: SITE_URL,
    siteName: BRAND_NAME,
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: HOME_TITLE, description: HOME_DESCRIPTION },
};

interface HomeSeoData {
  name: string;
  description: string;
  email: string;
  phone: string;
  social: { instagram: string; pinterest: string; facebook: string; youtube: string; twitter: string; linkedin: string };
}

// Pulls the store name/description (Admin > Marketing > SEO) and contact
// details (Admin > Settings > Store Info) so the homepage's structured data
// stays in sync with whatever the admin has configured — no code change
// needed if the shop rebrands.
async function getHomeSeoData(): Promise<HomeSeoData> {
  const fallback: HomeSeoData = {
    name: BRAND_NAME,
    description:
      'Handpicked sarees and ethnic wear from master weavers across India.',
    email: '',
    phone: '',
    social: { instagram: '', pinterest: '', facebook: '', youtube: '', twitter: '', linkedin: '' },
  };
  try {
    const supabase = getServerSupabase();
    const [seoRes, storeRes, socialRes] = await Promise.all([
      supabase.from('settings').select('value').eq('key', 'seo_settings').maybeSingle(),
      supabase.from('settings').select('value').eq('key', 'store_info').maybeSingle(),
      supabase.from('settings').select('value').eq('key', 'social_links').maybeSingle(),
    ]);
    const social = (socialRes.data?.value as Partial<HomeSeoData['social']>) || {};
    const seo = (seoRes.data?.value as { site_title?: string; meta_description?: string }) || {};
    const store = (storeRes.data?.value as { name?: string; support_email?: string; support_phone?: string }) || {};
    return {
      // Brand name in schema is always "Suti Saree", regardless of the admin store name.
      name: BRAND_NAME,
      description: seo.meta_description || fallback.description,
      email: store.support_email || '',
      phone: store.support_phone || '',
      social: { ...fallback.social, ...social },
    };
  } catch {
    return fallback;
  }
}

export default async function Home() {
  const [data, homeData, brand] = await Promise.all([getHomeSeoData(), fetchHomeData(), getBrandSettings()]);

  const logoUrl = toPublicMediaUrl(brand.logo_url) || `${SITE_URL}/icon`;
  const sameAs = cleanSameAs([
    data.social.instagram || SOCIAL_FALLBACK.instagram,
    data.social.pinterest || SOCIAL_FALLBACK.pinterest,
    data.social.facebook || SOCIAL_FALLBACK.facebook,
    data.social.youtube || SOCIAL_FALLBACK.youtube,
    data.social.twitter,
    data.social.linkedin,
  ]);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      buildOrganizationJsonLd({ logoUrl, sameAs, email: data.email, phone: data.phone }),
      buildWebSiteJsonLd(data.description),
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <HomeClient
        products={homeData.products}
        categories={homeData.categories}
        banner={homeData.banner}
        heroBanners={homeData.heroBanners}
        freeShippingThreshold={homeData.freeShippingThreshold}
        collections={homeData.collections}
        tiles={homeData.tiles}
        collectionSlugById={homeData.collectionSlugById}
        promotionCollectionSlugById={homeData.promotionCollectionSlugById}
        discoverSettings={homeData.discoverSettings}
        discoverInitialProducts={homeData.discoverInitialProducts}
        discoverInitialHasMore={homeData.discoverInitialHasMore}
        discoverCategoryCounts={homeData.discoverCategoryCounts}
        appLayout={homeData.appLayout}
      />
    </>
  );
}
