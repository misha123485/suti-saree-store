// SEO copy for category pages. EDIT THIS FILE to change any category text -- no
// component needs to be touched.
//
// Keys are category slugs (the last part of /product-category/.../<slug>/).
// Categories that are not listed here still get a keyword title + description
// from the generic helpers at the bottom, plus the admin "description" field.
//
// For each category you can set:
//   title        <title> without the brand (" | Suti Saree" is added automatically)
//   description  meta description, aim for <= 155 characters
//   h1           the visible page heading (defaults to the category name)
//   intro        2-3 line paragraph shown ABOVE the product grid (page 1 only)
//   sections     buying-guide blocks shown BELOW the grid (page 1 only)
//   faqs         visible FAQ + FAQPage JSON-LD (page 1 only). Keep answers in
//                plain text: what you write here is exactly what Google reads.
//   links        "Explore more" links below the FAQ. kind "category" = a category
//                slug, kind "tag" = a /product-tag/ slug. A link whose slug does
//                not exist in the store is skipped automatically (never a 404 link).
//
// The copy sticks to what the store already tells shoppers elsewhere: handloom
// pieces sourced directly from weavers across India, free delivery, easy returns.

import { BRAND_NAME } from '@/lib/seo-site';

export interface CategorySeoSection {
  heading: string;
  body: string;
}

export interface CategorySeoFaq {
  question: string;
  answer: string;
}

export interface CategorySeoLink {
  label: string;
  kind: 'category' | 'tag';
  slug: string;
}

export interface CategorySeo {
  /** <title> without the brand: " | Suti Saree" is added by categorySeoTitle(). */
  title: string;
  /** Meta description, aim for <= 155 characters. */
  description: string;
  /** Visible <h1>. Falls back to the category name. */
  h1?: string;
  /** Short intro shown above the product grid on page 1. */
  intro?: string;
  /** Buying-guide blocks shown below the grid on page 1. */
  sections: CategorySeoSection[];
  /** FAQ shown below the guide (and emitted as FAQPage JSON-LD). */
  faqs?: CategorySeoFaq[];
  /** Internal links shown at the bottom ("Explore more"). */
  links?: CategorySeoLink[];
}

/**
 * Some categories were imported from WooCommerce with a longer slug. Both slugs
 * read the same copy. (Redirects in next.config.js point at ...silk-sarees-saree/.)
 */
export const CATEGORY_SLUG_ALIASES: Record<string, string> = {
  'silk-sarees-saree': 'silk-sarees',
};

export const CATEGORY_SEO: Record<string, CategorySeo> = {
  'cotton-saree': {
    title: 'Cotton Sarees for Women – Pure Handloom Cotton',
    description:
      'Shop pure cotton sarees for women: soft handloom and mulmul cotton for office, daily wear and pujas. Direct from weavers. Free delivery, easy returns.',
    h1: 'Cotton Sarees for Women',
    intro:
      'Shop pure cotton sarees for women, from crisp handloom cotton to soft mulmul, in plain, bordered and printed styles. They are light, breathable and easy to drape, which makes them a natural pick for office wear, college and long summer days. Every saree is sourced directly from weaver families across India.',
    sections: [
      {
        heading: 'How to choose a cotton saree',
        body:
          'Start with the occasion. For office and daily wear, a plain or lightly woven cotton saree in a mid-weight weave drapes neatly and stays comfortable through a long day. For pujas and family functions, look for a contrast border, woven buti or a richer shade such as maroon, wine, rama green or navy. Then check the product page for fabric, length and whether a blouse piece is included, so there are no surprises when the saree arrives.',
      },
      {
        heading: 'Handloom cotton, mulmul and other cotton weaves',
        body:
          'Handloom cotton is woven by hand, so it has a slightly textured, natural feel and small variations that machine-made fabric does not. Mulmul (also written malmal) is a very fine, airy cotton that suits hot weather. Tant and begampuri are traditional Bengal cottons with a crisp, comfortable fall. Cotton silk blends add a soft sheen for festive days while staying lighter than pure silk.',
      },
      {
        heading: 'Caring for your cotton saree',
        body:
          'Wash a new cotton saree separately the first time, in cold water with a mild detergent, and dry it in the shade so the colour stays fresh. Iron it on the cotton setting while it is slightly damp. With this simple routine a handloom cotton saree gets softer with every wash.',
      },
    ],
    faqs: [
      {
        question: 'Which cotton saree is best for office wear?',
        answer:
          'A plain or small-border cotton saree in a mid-weight weave works best for office. It drapes neatly, does not cling and stays comfortable for long hours. Solid colours such as navy, grey, maroon and bottle green are easy to pair with a simple blouse.',
      },
      {
        question: 'How can I tell if a cotton saree is pure handloom cotton?',
        answer:
          'Handloom cotton feels soft and slightly textured, and you may notice tiny natural variations in the weave. The reliable way is to buy from a seller that names the fabric clearly. Each saree on our site lists its fabric on the product page, and our sarees come directly from weavers.',
      },
      {
        question: 'How do I wash a cotton saree for the first time?',
        answer:
          'Wash it separately in cold water with a mild detergent, do not soak it for long, and dry it in the shade. This helps the colour settle and avoids it running onto other clothes.',
      },
      {
        question: 'Do cotton sarees shrink or fade?',
        answer:
          'Good cotton can shrink slightly in the first wash, which is why we suggest cold water and shade drying. Deep shades may release a little colour in the first wash, so wash them alone. After that the saree usually stays stable and gets softer.',
      },
      {
        question: 'Does a cotton saree come with a blouse piece?',
        answer:
          'It depends on the saree. The product page tells you whether a blouse piece is included, along with the length and fabric, so please check it before you order.',
      },
      {
        question: 'Do you offer free delivery and returns on cotton sarees?',
        answer:
          'Yes, we offer free delivery across India and easy returns. The full terms are listed on our Returns & Exchange page.',
      },
    ],
    links: [
      { label: 'Mulmul sarees', kind: 'category', slug: 'mulmul-saree' },
      { label: 'Cotton sarees under 500', kind: 'category', slug: 'under-499-saree' },
      { label: 'Handloom sarees', kind: 'category', slug: 'handloom-saree' },
      { label: 'Tant sarees', kind: 'category', slug: 'tant-saree' },
      { label: 'Begampuri sarees', kind: 'category', slug: 'begampuri-saree' },
      { label: 'Plain sarees', kind: 'category', slug: 'plain-saree' },
      { label: 'Summer sarees', kind: 'category', slug: 'summer-sarees' },
      { label: 'Sarees under 1000', kind: 'tag', slug: 'saree-under-1000' },
    ],
  },

  sarees: {
    title: 'Buy Sarees Online – Cotton, Mulmul & Silk',
    description:
      'Buy sarees online: handloom cotton, mulmul, cotton silk and jamdani sarees from weavers across India. Free delivery and easy returns.',
    h1: 'Sarees Online',
    intro:
      'Browse our full range of handloom sarees: cotton for every day, soft mulmul for warm weather, cotton silk for festivals and traditional weaves such as tant, begampuri and jamdani. Each piece comes straight from the weavers who make it, so you can shop by fabric, colour or budget in one place.',
    sections: [
      {
        heading: 'How to find the right saree',
        body:
          'Use the category bar at the top of the page to jump to a fabric or style, or sort by price to stay within your budget. If you are buying for daily wear or work, choose cotton or mulmul. For weddings, festivals and gifting, cotton silk and silk sarees with richer borders are the usual choice.',
      },
      {
        heading: 'What to check before you order',
        body:
          'Every product page shows the fabric, length, colour and care instructions, and tells you whether a blouse piece is included. Because handloom sarees are woven by hand, small differences in weave and shade are natural and part of their charm. Colours can also look slightly different on different phone screens.',
      },
    ],
    faqs: [
      {
        question: 'Which saree fabric is best for everyday wear?',
        answer:
          'Cotton and mulmul are the most comfortable for daily wear. They are light, breathable and easy to wash and iron at home.',
      },
      {
        question: 'What is the difference between cotton and cotton silk sarees?',
        answer:
          'Cotton silk blends cotton with silk threads. It has a soft sheen like silk but is lighter and easier to wear for long hours, which is why it is popular for festivals and functions.',
      },
      {
        question: 'Are handloom sarees different from machine-made sarees?',
        answer:
          'A handloom saree is woven by hand on a loom, so the weave has a natural texture and tiny variations. Machine-made sarees look more uniform. Buying handloom also supports weaver families directly.',
      },
      {
        question: 'Will the saree look exactly like the photo?',
        answer:
          'We show each saree as accurately as we can, but screen settings and lighting can change how a colour looks. Small variations in weave are normal in handloom pieces.',
      },
      {
        question: 'Is delivery free and can I return a saree?',
        answer:
          'Yes, we offer free delivery across India and easy returns. Please read the Returns & Exchange page for the full terms.',
      },
    ],
    links: [
      { label: 'Cotton sarees for women', kind: 'category', slug: 'cotton-saree' },
      { label: 'Mulmul sarees', kind: 'category', slug: 'mulmul-saree' },
      { label: 'Handloom sarees', kind: 'category', slug: 'handloom-saree' },
      { label: 'Silk sarees', kind: 'category', slug: 'silk-sarees-saree' },
      { label: 'Plain sarees', kind: 'category', slug: 'plain-saree' },
      { label: 'Sarees under 500', kind: 'category', slug: 'under-499-saree' },
      { label: 'Sarees under 1000', kind: 'tag', slug: 'saree-under-1000' },
      { label: 'Wedding sarees', kind: 'category', slug: 'wedding-sarees' },
    ],
  },

  'plain-saree': {
    title: 'Plain Sarees for Women – Cotton & Cotton Silk',
    description:
      'Shop plain sarees for women: single-colour cotton and cotton silk sarees in maroon, navy, green and more. Direct from weavers. Free delivery.',
    h1: 'Plain Sarees for Women',
    intro:
      'A good plain saree is the most useful piece in a wardrobe. These single-colour cotton and cotton silk sarees look elegant on their own and let you play with blouses, jewellery and dupattas. Pick a classic shade for office, or a bold one with a contrast blouse for a festive look.',
    sections: [
      {
        heading: 'How to style a plain saree',
        body:
          'For a festive look, pair a plain saree with a contrast blouse, for example a maroon saree with a gold or mustard blouse. For office and daily wear, a tone-on-tone blouse keeps things simple and neat. A plain saree also works well with statement jewellery, since the fabric does not compete with it.',
      },
      {
        heading: 'Choosing the colour and fabric',
        body:
          'Dark shades such as navy, wine, bottle green and black are easy to wear again and again. Lighter shades suit summer days. Plain cotton is best for daily use, while plain cotton silk gives a richer fall for functions. A simple woven border adds just enough detail without taking over.',
      },
      {
        heading: 'Care for plain sarees',
        body:
          'Wash solid colours separately the first time, in cold water with a mild detergent, and dry them in the shade. Plain sarees show crease lines clearly, so iron them while slightly damp for a clean finish.',
      },
    ],
    faqs: [
      {
        question: 'Which colour plain saree is best for office?',
        answer:
          'Navy, grey, maroon, bottle green and black are safe, polished choices for office. They are easy to repeat with different blouses.',
      },
      {
        question: 'Can I wear a plain saree to a festival or puja?',
        answer:
          'Yes. Choose a rich colour such as red, maroon, yellow or green and pair it with a contrast or embroidered blouse. A plain cotton silk saree looks especially good for festive days.',
      },
      {
        question: 'Does a plain saree come with a blouse piece?',
        answer:
          'It depends on the saree. The product page tells you if a blouse piece is included, so please check it before ordering.',
      },
      {
        question: 'Are plain sarees only in cotton?',
        answer:
          'No. This collection has plain cotton and plain cotton silk sarees. The fabric is mentioned on every product page.',
      },
      {
        question: 'How do I stop a plain saree from looking flat?',
        answer:
          'Use a contrast blouse, add a border or dupatta, or style it with jewellery. Pleating neatly and using a light starch on cotton also gives a crisp, polished drape.',
      },
    ],
    links: [
      { label: 'Cotton sarees for women', kind: 'category', slug: 'cotton-saree' },
      { label: 'Silk sarees', kind: 'category', slug: 'silk-sarees-saree' },
      { label: 'Mulmul sarees', kind: 'category', slug: 'mulmul-saree' },
      { label: 'Printed sarees', kind: 'category', slug: 'printed-saree' },
      { label: 'Sarees under 500', kind: 'category', slug: 'under-499-saree' },
      { label: 'All sarees', kind: 'category', slug: 'sarees' },
    ],
  },

  'mulmul-saree': {
    title: 'Mulmul Cotton Sarees Online – Soft & Light',
    description:
      'Buy soft mulmul cotton sarees online. Lightweight, breathable handloom mulmul for summer, office and daily wear, direct from weavers. Free delivery.',
    h1: 'Mulmul Cotton Sarees',
    intro:
      'Mulmul is a very fine, soft cotton that feels almost weightless on the skin. These handloom mulmul sarees drape easily, stay cool in hot and humid weather and are gentle for all-day wear, whether you are heading to office, a puja or a family function.',
    sections: [
      {
        heading: 'Why women love mulmul sarees',
        body:
          'Mulmul (also spelled malmal) is woven from fine cotton yarn, so it is airy and soft with a gentle, almost silky hand-feel. It absorbs sweat, lets air through and does not irritate sensitive skin. That is why it is a favourite for long summer days and for anyone who finds heavier cotton warm.',
      },
      {
        heading: 'How to choose and wear mulmul',
        body:
          'Pick a solid or lightly printed mulmul for daily wear and office, and one with a woven or printed border for occasions. Because the fabric is fine, wear a petticoat close to the saree colour and pleat it neatly. A little starch makes the drape crisper if you prefer that look.',
      },
      {
        heading: 'Caring for mulmul',
        body:
          'Mulmul is delicate, so wash it gently by hand or on a soft cycle in cold water with a mild detergent. Dry it in the shade and iron on a low to medium setting. Treated well, it keeps its softness for years.',
      },
    ],
    faqs: [
      {
        question: 'What is a mulmul saree?',
        answer:
          'A mulmul saree is made from very fine, soft cotton. It is light, breathable and comfortable in warm weather. You will also see the same fabric spelled malmal.',
      },
      {
        question: 'Is mulmul see-through?',
        answer:
          'Mulmul is a fine, light fabric, so lighter colours can be slightly sheer. Wearing a petticoat that matches the saree colour solves this. Darker and printed mulmul sarees look more opaque.',
      },
      {
        question: 'Is mulmul good for summer and office wear?',
        answer:
          'Yes. It stays cool and does not feel heavy, so it works well for hot days and long office hours.',
      },
      {
        question: 'How do I wash and iron a mulmul saree?',
        answer:
          'Wash gently by hand or on a soft cycle in cold water, dry in the shade, and iron on a low to medium setting while slightly damp.',
      },
      {
        question: 'What is the difference between mulmul and regular cotton sarees?',
        answer:
          'Mulmul uses finer yarn, so it is lighter, softer and more fluid. Regular handloom cotton is slightly thicker and crisper, and holds pleats more firmly.',
      },
    ],
    links: [
      { label: 'Cotton sarees for women', kind: 'category', slug: 'cotton-saree' },
      { label: 'Malmal cotton sarees', kind: 'category', slug: 'malmal-cotton' },
      { label: 'Summer sarees', kind: 'category', slug: 'summer-sarees' },
      { label: 'Plain sarees', kind: 'category', slug: 'plain-saree' },
      { label: 'Handloom sarees', kind: 'category', slug: 'handloom-saree' },
      { label: 'Sarees under 500', kind: 'category', slug: 'under-499-saree' },
    ],
  },

  'silk-sarees': {
    title: 'Silk Sarees Online – Handloom Silk & Cotton Silk',
    description:
      'Buy silk and cotton silk sarees online. Handloom pieces for weddings, festivals and gifting, sourced directly from weavers across India. Free delivery.',
    h1: 'Silk & Cotton Silk Sarees',
    intro:
      'When the occasion calls for a little more shine, a silk or cotton silk saree is the natural choice. These handloom sarees have a graceful fall, a soft sheen and rich borders for weddings, festivals and gifting, and come directly from weavers across India.',
    sections: [
      {
        heading: 'Silk or cotton silk: which one to pick',
        body:
          'Pure silk has the richest sheen and fall, and is the traditional choice for weddings. Cotton silk blends give you the look of silk with the comfort of cotton, so they are lighter, easier to wear for long hours and a good fit for festivals and family functions. The product page names the exact fabric of each saree.',
      },
      {
        heading: 'Choosing colour and border',
        body:
          'Deep shades such as maroon, wine, rama green, royal blue and mustard suit festive and wedding occasions. A broad woven or zari-style border makes the saree look special even with a simple blouse. For gifting, a soft neutral with a contrast border is a safe pick.',
      },
      {
        heading: 'Taking care of silk',
        body:
          'Dry clean or gently hand wash silk sarees, store them folded in a soft cotton cloth and keep them away from direct sunlight. Change the folds every few months so creases do not set. Avoid spraying perfume directly on the fabric.',
      },
    ],
    faqs: [
      {
        question: 'What is the difference between silk and cotton silk sarees?',
        answer:
          'Cotton silk is a blend of cotton and silk threads. It looks rich like silk but is lighter, more breathable and usually easier to maintain.',
      },
      {
        question: 'Which silk saree is good for a wedding?',
        answer:
          'Choose a deep, rich colour with a woven border. Silk and heavier cotton silk sarees photograph well and have a graceful fall for long ceremonies.',
      },
      {
        question: 'How should I store a silk saree?',
        answer:
          'Fold it in a soft cotton or muslin cloth, keep it in a cool, dry place away from sunlight, and refold it every few months to avoid permanent creases.',
      },
      {
        question: 'Can I wash a silk saree at home?',
        answer:
          'Gentle hand washing in cold water with a mild detergent works for many silk and cotton silk sarees, but dry cleaning is the safest choice for heavily woven or dark-coloured pieces. Never wring or twist the fabric.',
      },
      {
        question: 'Is a blouse piece included with silk sarees?',
        answer:
          'It depends on the saree. The product page tells you whether a blouse piece is included, along with the length and fabric.',
      },
    ],
    links: [
      { label: 'Wedding sarees', kind: 'category', slug: 'wedding-sarees' },
      { label: 'Pooja sarees', kind: 'category', slug: 'pooja-sarees' },
      { label: 'Jamdani sarees', kind: 'category', slug: 'jamdani-saree' },
      { label: 'Plain sarees', kind: 'category', slug: 'plain-saree' },
      { label: 'Cotton sarees for women', kind: 'category', slug: 'cotton-saree' },
      { label: 'All sarees', kind: 'category', slug: 'sarees' },
    ],
  },

  'malmal-cotton': {
    title: 'Malmal Cotton Sarees Online – Soft Handloom Malmal',
    description:
      'Shop malmal cotton sarees online: soft, light and breathable handloom sarees from weavers across India. Free delivery and easy returns.',
    sections: [
      {
        heading: 'Malmal cotton sarees',
        body:
          'Malmal, also spelled mulmul, is a fine, airy cotton with a gentle, silky feel. These sarees are light to carry and comfortable in warm weather, which makes them ideal for daily wear as well as festive days.',
      },
      {
        heading: 'Choosing and caring for malmal',
        body:
          'Pick a plain malmal saree for everyday use or one with a woven border for occasions. Wash it separately in cold water with a mild detergent and dry it in the shade to keep the colours bright.',
      },
    ],
  },

  'handloom-saree': {
    title: 'Handloom Sarees for Women Online – Direct from Weavers',
    description:
      'Shop authentic handloom sarees for women: handwoven cotton, begampuri, jamdani and tant sarees from weavers across India. Free delivery.',
    sections: [
      {
        heading: 'What makes a saree handloom',
        body:
          'A handloom saree is woven by hand on a loom, not produced on a power machine. Each piece takes time and skill, and small variations in the weave or colour are a sign of that handwork. Buying handloom also supports weaver families directly.',
      },
      {
        heading: 'Our handloom collection',
        body:
          'This collection brings together handwoven cotton sarees, begampuri, tant, jamdani and cotton silk sarees. Every product page lists the fabric, length and care so you can choose with confidence.',
      },
    ],
  },

  'begampuri-saree': {
    title: 'Begampuri Sarees Online – Handloom Begumpuri Cotton Sarees',
    description:
      'Shop handloom begampuri (begumpuri) sarees online. Soft Bengal cotton sarees with woven designs, direct from weavers. Free delivery and easy returns.',
    sections: [
      {
        heading: 'About begampuri sarees',
        body:
          'Begampuri, also written begumpuri, is a traditional Bengal handloom cotton saree. It is known for its soft feel, comfortable weight and woven designs, which makes it a good choice for daily wear and small gatherings.',
      },
      {
        heading: 'Wearing and caring for begampuri',
        body:
          'These sarees are easy to drape and stay comfortable through the day. Wash in cold water with a mild detergent, dry in the shade and iron on the cotton setting.',
      },
    ],
  },

  'jamdani-saree': {
    title: 'Jamdani Sarees Online – Handloom Dhakai Jamdani',
    description:
      'Shop handloom jamdani sarees online: fine woven motifs and light, graceful drape. Direct from weavers across India. Free delivery and easy returns.',
    sections: [
      {
        heading: 'The art of the jamdani saree',
        body:
          'Jamdani is one of the most admired handloom weaves. The motifs are woven into the fabric itself, which gives the saree a fine, textured look and a light, graceful fall. It suits weddings, pujas and festive evenings.',
      },
      {
        heading: 'Care for jamdani',
        body:
          'Handle jamdani gently. Hand wash in cold water or dry clean, dry in the shade and store folded in a soft cotton cloth.',
      },
    ],
  },

  'tant-saree': {
    title: 'Tant Sarees Online – Bengal Handloom Cotton Tant',
    description:
      'Buy tant sarees online: crisp, light Bengal handloom cotton sarees with woven borders. Direct from weavers across India. Free delivery.',
    sections: [
      {
        heading: 'Tant, the saree of Bengal',
        body:
          'Tant is a classic Bengal cotton saree, light and crisp with a clean woven border. It is made for humid weather and long days, and it has been a staple in Bengali homes for generations.',
      },
      {
        heading: 'Care for tant',
        body:
          'Wash in cold water with mild detergent and dry in the shade. A light starch before ironing keeps the traditional crisp finish.',
      },
    ],
  },

  'pooja-sarees': {
    title: 'Pooja Sarees Online – Sarees for Puja & Festivals',
    description:
      'Shop pooja sarees online: soft cotton and cotton silk sarees in auspicious colours for puja, festivals and family functions. Free delivery.',
    sections: [
      {
        heading: 'Sarees for puja and festivals',
        body:
          'For puja, you want a saree that feels comfortable through long rituals and still looks graceful. This collection has soft cotton and cotton silk sarees in colours often chosen for festivals, such as red, maroon, yellow, green and wine.',
      },
      {
        heading: 'Choosing a puja saree',
        body:
          'A saree with a visible border or woven design feels festive without being heavy. Check the product page for fabric and whether a blouse piece is included.',
      },
    ],
  },

  'wedding-sarees': {
    title: 'Wedding Sarees Online – Handloom Silk & Cotton Silk',
    description:
      'Shop wedding sarees online: handloom cotton silk and silk sarees for brides, guests and family functions. Direct from weavers. Free delivery.',
    sections: [
      {
        heading: 'Sarees for weddings and receptions',
        body:
          'Weddings call for sarees with richness and grace. Our wedding collection brings handloom silk and cotton silk sarees with woven borders and festive colours, for the bride, the family and guests alike.',
      },
      {
        heading: 'Planning ahead',
        body:
          'Order well before the event so you have time to match a blouse and fall. Each product page lists the fabric, length and whether a blouse piece is included.',
      },
    ],
  },

  'summer-sarees': {
    title: 'Summer Sarees Online – Light Cotton & Mulmul Sarees',
    description:
      'Shop summer sarees online: light, breathable cotton and mulmul sarees that stay cool in hot weather. Direct from weavers. Free delivery.',
    sections: [
      {
        heading: 'Sarees that stay cool',
        body:
          'In hot, humid weather the right fabric matters. Light cotton and mulmul sarees let air through, absorb sweat and feel soft against the skin, so you can stay comfortable from morning to evening.',
      },
      {
        heading: 'Colours for summer',
        body:
          'Pastels, whites and soft prints reflect heat and look fresh. For a bolder look, pick a rich solid colour with a light border.',
      },
    ],
  },
};

const BRAND = BRAND_NAME;

/** Keyword-rich <title> including the brand. */
export function categorySeoTitle(name: string, slug: string): string {
  const mapped = getCategorySeo(slug);
  if (mapped) return `${mapped.title} | ${BRAND}`;
  const long = `${name} Online – Direct from Weavers | ${BRAND}`;
  return long.length <= 62 ? long : `${name} | ${BRAND}`;
}

/** Meta description (<= ~160 characters). */
export function categorySeoDescription(name: string, slug: string, adminDescription?: string | null): string {
  const mapped = getCategorySeo(slug);
  if (mapped) return mapped.description;
  const admin = (adminDescription || '').trim();
  if (admin) return admin.length <= 160 ? admin : `${admin.slice(0, 157).replace(/\s+\S*$/, '')}...`;
  return `Shop ${name} online at ${BRAND}. Handloom pieces sourced directly from weavers across India, with free delivery and easy returns.`;
}

export function getCategorySeoSections(slug: string): CategorySeoSection[] {
  return getCategorySeo(slug)?.sections ?? [];
}

/** Maps an aliased slug (e.g. silk-sarees-saree) to the key used in CATEGORY_SEO. */
export function resolveCategorySeoKey(slug: string): string {
  return CATEGORY_SLUG_ALIASES[slug] ?? slug;
}

export function getCategorySeo(slug: string): CategorySeo | undefined {
  return CATEGORY_SEO[resolveCategorySeoKey(slug)];
}

/** True when this category has the full new layout (visible intro, FAQ, links). */
export function hasRichCategoryContent(slug: string): boolean {
  const c = getCategorySeo(slug);
  return !!(c && c.intro && c.faqs && c.faqs.length > 0);
}
