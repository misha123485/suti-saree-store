import { MetadataRoute } from 'next';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.sutisaree.com').replace(/\/$/, '');

// Private / non-content paths (never needed by Google for product checks).
const PRIVATE_PATHS = ['/admin', '/checkout', '/cart', '/api/', '/track/', '/order-confirmation/'];

export default function robots(): MetadataRoute.Robots {
  // Indexing is ALLOWED by default (live site after migration).
  // Only set BLOCK_INDEXING=true on a staging/test deployment to block crawlers.
  if (process.env.BLOCK_INDEXING === 'true') {
    return {
      rules: { userAgent: '*', disallow: '/' },
    };
  }

  const AI_BOTS = ['GPTBot', 'ChatGPT-User', 'CCBot', 'Bytespider', 'ClaudeBot', 'anthropic-ai', 'PerplexityBot', 'Amazonbot', 'Applebot-Extended', 'meta-externalagent', 'AhrefsBot', 'SemrushBot', 'MJ12bot', 'DotBot'];

  return {
    rules: [
      // Heavy scrapers / AI crawlers: they burn serverless CPU for no sales.
      { userAgent: AI_BOTS, disallow: '/' },
      // Merchant Center needs Googlebot (landing pages) AND Googlebot-Image (images).
      // AdsBot-Google ignores the '*' group, so it is listed explicitly too.
      { userAgent: 'Googlebot', allow: '/', disallow: PRIVATE_PATHS },
      { userAgent: 'Googlebot-Image', allow: '/' },
      { userAgent: 'AdsBot-Google', allow: '/', disallow: PRIVATE_PATHS },
      { userAgent: '*', allow: '/', disallow: PRIVATE_PATHS },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
