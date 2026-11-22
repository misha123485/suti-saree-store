// SEO copy for category pages: a search-friendly <title>, a meta description and a
// longer, category-specific text block that is shown at the bottom of the page
// (app/category/[slug]/category-view.tsx).
//
// Keys are category slugs (the last part of /product-category/.../<slug>/).
// Categories that are not listed here fall back to the generic helpers below, so
// every category still gets a keyword title + description. To add or change copy,
// edit this file only.
//
// The copy sticks to what the store already tells shoppers elsewhere: handloom
// pieces sourced directly from weavers across India, free delivery, easy returns.

export interface CategorySeoSection {
  heading: string;
  body: string;
}

export interface CategorySeo {
  /** <title> without the brand: " | Sutisaree" is added by categorySeoTitle(). */
  title: string;
  /** Meta description, aim for <= 155 characters. */
  description: string;
  sections: CategorySeoSection[];
}

export const CATEGORY_SEO: Record<string, CategorySeo> = {
  'cotton-saree': {
    title: 'Cotton Sarees for Women Online – Pure Handloom Cotton',
    description:
      'Shop soft pure cotton sarees for women at Sutisaree. Handloom cotton sarees direct from weavers across India, with free delivery and easy returns.',
    sections: [
      {
        heading: 'Cotton sarees for women, made for every day',
        body:
          'Cotton is the saree fabric Indian women reach for most often, and for good reason: it is breathable, light on the skin and easy to wear from morning to night. Our cotton sarees are sourced directly from weaver families, so you get genuine handloom pieces with a soft hand-feel instead of a stiff factory finish. You will find plain cotton sarees, woven borders, buti work and colour-blocked designs in one place.',
      },
      {
        heading: 'How to choose the right cotton saree',
        body:
          'For daily wear and office days, pick a plain or lightly woven cotton saree in a mid-weight weave. For festivals and pujas, look for a contrast border, zari touches or a richer colour such as maroon, wine, rama green or navy. Check the product page for fabric, length and whether a blouse piece is included, so there are no surprises when it arrives.',
      },
      {
        heading: 'Care tips for pure cotton',
        body:
          'Wash a new cotton saree separately the first time, in cold water with a mild detergent. Dry it in the shade to keep the colour fresh and iron on the cotton setting while it is slightly damp. With this simple care, a handloom cotton saree gets softer with every wash.',
      },
    ],
  },

  sarees: {
    title: 'Buy Sarees Online – Handloom Cotton, Mulmul & Silk',
    description:
      'Browse handloom sarees online at Sutisaree: cotton, mulmul, cotton silk and jamdani sarees from weavers across India. Free delivery and easy returns.',
    sections: [
      {
        heading: 'Handloom sarees from weavers across India',
        body:
          'Sutisaree brings handwoven sarees straight from the weavers who make them. This page lists everything in one place: cotton sarees for daily wear, soft mulmul for warm days, cotton silk sarees for festivals, and traditional weaves such as begampuri, tant and jamdani.',
      },
      {
        heading: 'Find your saree faster',
        body:
          'Use the category bar at the top to jump to a fabric or style, or sort by price to stay within your budget. Every product page shows the fabric, length, colour and care instructions. Because handloom pieces are woven by hand, small variations in colour and weave are natural and part of their charm.',
      },
    ],
  },

  'plain-saree': {
    title: 'Plain Sarees for Women Online – Plain Cotton & Cotton Silk',
    description:
      'Shop plain sarees for women online: single-colour plain cotton and cotton silk sarees in maroon, red, blue, green and more. Direct from weavers.',
    sections: [
      {
        heading: 'Plain sarees that suit every occasion',
        body:
          'A good plain saree is the most useful piece in a wardrobe. Single-colour cotton and cotton silk sarees look elegant on their own, and let you play with blouses, jewellery and dupattas. Our plain sarees come in classic shades such as maroon, wine, red, navy blue, green, mustard and black.',
      },
      {
        heading: 'Styling a plain saree',
        body:
          'Pair a plain saree with a contrast blouse for a festive look, or keep it tone-on-tone for office and daily wear. A simple border adds just enough detail without taking over. Check each product page to see whether a blouse piece is included.',
      },
    ],
  },

  'mulmul-saree': {
    title: 'Mulmul Cotton Sarees Online – Soft & Lightweight',
    description:
      'Buy soft mulmul cotton sarees online. Lightweight, breathable handloom mulmul sarees for summer and daily wear, direct from weavers. Free delivery.',
    sections: [
      {
        heading: 'Why women love mulmul sarees',
        body:
          'Mulmul is a very fine, soft cotton that feels almost weightless. It drapes easily, stays cool in hot and humid weather and is gentle on sensitive skin. That is why mulmul sarees are a favourite for long summer days, pujas and family functions.',
      },
      {
        heading: 'Caring for mulmul',
        body:
          'Mulmul is delicate, so wash it gently by hand or on a soft cycle and dry it in the shade. Iron it on a low to medium setting. Treated well, it keeps its softness for years.',
      },
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

  'silk-sarees': {
    title: 'Silk & Cotton Silk Sarees Online | Handloom Silk Sarees',
    description:
      'Buy silk and cotton silk sarees online at Sutisaree. Handloom pieces for weddings, festivals and gifting, sourced directly from weavers across India.',
    sections: [
      {
        heading: 'Silk and cotton silk sarees for special days',
        body:
          'When the occasion calls for a little more shine, a silk or cotton silk saree is the natural choice. These sarees have a graceful fall, a soft sheen and rich borders, and they photograph beautifully at weddings and festivals.',
      },
      {
        heading: 'Cotton silk for easy wear',
        body:
          'Cotton silk blends give you the look of silk with the comfort of cotton, so they are lighter and easier to wear for long hours. Check the product page for the exact fabric of each saree.',
      },
      {
        heading: 'Taking care of silk',
        body:
          'Dry clean or gently hand wash silk sarees, store them folded in a cotton cloth and keep them away from direct sunlight. Avoid spraying perfume directly on the fabric.',
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

const BRAND = 'Sutisaree';

/** Keyword-rich <title> including the brand. */
export function categorySeoTitle(name: string, slug: string): string {
  const mapped = CATEGORY_SEO[slug];
  if (mapped) return `${mapped.title} | ${BRAND}`;
  const long = `${name} Online – Direct from Weavers | ${BRAND}`;
  return long.length <= 62 ? long : `${name} | ${BRAND}`;
}

/** Meta description (<= ~160 characters). */
export function categorySeoDescription(name: string, slug: string, adminDescription?: string | null): string {
  const mapped = CATEGORY_SEO[slug];
  if (mapped) return mapped.description;
  const admin = (adminDescription || '').trim();
  if (admin) return admin.length <= 160 ? admin : `${admin.slice(0, 157).replace(/\s+\S*$/, '')}...`;
  return `Shop ${name} online at ${BRAND}. Handloom pieces sourced directly from weavers across India, with free delivery and easy returns.`;
}

export function getCategorySeoSections(slug: string): CategorySeoSection[] {
  return CATEGORY_SEO[slug]?.sections ?? [];
}
