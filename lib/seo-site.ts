// Single source of truth for brand + site constants used in SEO output
// (titles, og:site_name, JSON-LD, footer). Change the brand spelling HERE only.

export const BRAND_NAME = 'Suti Saree';

/** Other spellings people use; emitted as Organization/WebSite alternateName. */
export const BRAND_ALTERNATE_NAMES = ['Sutisaree', 'sutisaree.com'];

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.sutisaree.com').replace(/\/$/, '');

/** Home page <title> must START with the brand ("suti saree" brand query). */
export const HOME_TITLE = `${BRAND_NAME} | Pure Cotton, Mulmul & Handloom Sarees Online`;

export const HOME_DESCRIPTION =
  'Buy pure cotton, mulmul and handloom sarees online from Suti Saree. Soft, breathable sarees direct from weavers across India. Free delivery and easy returns.';

/**
 * Social profiles for Organization.sameAs. The live values come from
 * Admin > Settings > Social Media Links (settings key "social_links").
 * Anything left blank there is fallen back to the values below; blank = omitted
 * from the schema. TODO(owner): paste the real profile URLs here ONLY if you do
 * not want to use the admin settings. No URL was invented.
 */
export const SOCIAL_FALLBACK: Record<'instagram' | 'pinterest' | 'facebook' | 'youtube', string> = {
  instagram: '', // TODO: e.g. https://www.instagram.com/<your-handle>/
  pinterest: '', // TODO: e.g. https://www.pinterest.com/<your-handle>/
  facebook: '', // TODO: e.g. https://www.facebook.com/<your-page>/
  youtube: '', // TODO: e.g. https://www.youtube.com/@<your-channel>
};
