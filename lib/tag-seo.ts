// SEO copy for tag pages (/product-tag/<slug>/). EDIT THIS FILE to change tag text.
//
// Every tag page gets a visible <h1>, an intro paragraph above the grid, a unique
// <title> and meta description. Tags listed in TAG_SEO use the hand-written copy;
// every other tag gets a generated (but still unique, name-based) version from
// buildTagSeo(), so no tag page is ever thin or duplicated.
import { BRAND_NAME } from '@/lib/seo-site';
import type { CategorySeoLink } from '@/lib/category-seo';

export interface TagSeo {
  /** <title> without the brand (" | Suti Saree" is appended). */
  title: string;
  description: string;
  h1: string;
  /** Paragraph shown above the product grid. */
  intro: string;
  /** Short paragraph shown below the grid. */
  tips: string;
}

export const TAG_SEO: Record<string, Omit<TagSeo, 'tips'> & { tips?: string }> = {
  'saree-under-1000': {
    title: 'Sarees Under 1000 – Cotton & Handloom Sarees Online',
    description:
      'Shop sarees under ₹1000: soft cotton, mulmul and handloom sarees for daily wear and office, direct from weavers. Free delivery and easy returns.',
    h1: 'Sarees Under ₹1000',
    intro:
      'Looking for a good saree on a budget? This collection brings together sarees under ₹1000, including soft cotton, mulmul and handloom pieces that are comfortable enough for daily wear and smart enough for office. Every saree is sourced directly from weavers across India, so you pay for the fabric, not for middlemen.',
    tips:
      'To get the most from a budget, pick plain or small-border cotton sarees for everyday use, since they wash easily and last long. Check each product page for fabric, length and whether a blouse piece is included before you order.',
  },
  'ghicha-work': {
    title: 'Ghicha Work Sarees Online – Textured Handloom Sarees',
    description:
      'Shop ghicha work sarees online: textured handloom sarees with a rich, rustic feel. Sourced directly from weavers across India. Free delivery.',
    h1: 'Ghicha Work Sarees',
    intro:
      'Ghicha work gives a saree a rich, slightly textured surface that looks different from smooth, plain fabric. This collection gathers our ghicha work sarees, sourced directly from weavers, for pujas, festivals and days when you want something with character.',
    tips:
      'Textured fabrics drape best with simple blouses, so let the saree be the focus. Dry clean or hand wash gently in cold water and dry in the shade to protect the texture.',
  },
};

/** Tag-page links shown under every tag (resolved + filtered like category links). */
export const TAG_EXPLORE_LINKS: CategorySeoLink[] = [
  { label: 'Cotton sarees for women', kind: 'category', slug: 'cotton-saree' },
  { label: 'Mulmul sarees', kind: 'category', slug: 'mulmul-saree' },
  { label: 'Handloom sarees', kind: 'category', slug: 'handloom-saree' },
  { label: 'Plain sarees', kind: 'category', slug: 'plain-saree' },
  { label: 'All sarees', kind: 'category', slug: 'sarees' },
];

function titleCase(s: string): string {
  return s.replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

/** Price tags look like "saree-under-500" / "under-1000": returns the number, else null. */
function budgetFromSlug(slug: string): number | null {
  const m = slug.match(/under-?(\d{3,5})/i);
  return m ? Number(m[1]) : null;
}

export function buildTagSeo(name: string, slug: string, productCount: number): TagSeo {
  const hand = TAG_SEO[slug];
  if (hand) return { ...hand, tips: hand.tips ?? '' };

  const budget = budgetFromSlug(slug);
  const display = name.trim() || titleCase(slug.replace(/-/g, ' '));
  const countText =
    productCount > 0 ? `Browse ${productCount} handpicked ${productCount === 1 ? 'piece' : 'pieces'} in this collection.` : '';

  if (budget) {
    return {
      title: `${display} – Budget Cotton & Handloom Sarees`,
      description: `Shop ${display.toLowerCase()} online: budget-friendly cotton and handloom sarees direct from weavers across India. Free delivery and easy returns.`,
      h1: display,
      intro: `Shop ${display.toLowerCase()} without compromising on fabric. ${countText} These budget-friendly cotton and handloom sarees are sourced directly from weavers across India, and are comfortable for daily wear, college and office.`,
      tips: `On a ₹${budget} budget, plain and small-border cotton sarees give the best value for regular use. Check each product page for fabric, length and blouse piece details.`,
    };
  }

  return {
    title: `${display} – Buy Online`,
    description: `Shop ${display.toLowerCase()} online at ${BRAND_NAME}. Handloom sarees sourced directly from weavers across India, with free delivery and easy returns.`,
    h1: display,
    intro: `Explore our ${display.toLowerCase()} collection at ${BRAND_NAME}. ${countText} Every piece is sourced directly from weavers across India and listed with its fabric, length and care details, so you can choose with confidence.`.replace(/\s{2,}/g, ' '),
    tips: `Each product page shows the fabric, colour and care instructions. Because handloom sarees are woven by hand, small variations in weave and shade are natural.`,
  };
}
