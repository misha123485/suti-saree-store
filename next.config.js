/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  // Replaces the server-side `searchParams` check that used to live in
  // app/product/[slug]/page.tsx. Reading searchParams makes a page dynamic
  // (one Vercel function invocation per visit); handling it here at the
  // routing layer lets the product page be cached.
  // Old WordPress/WooCommerce/Rank Math URLs -> new equivalents (301).
  // Redirects run before rewrites below.
  async redirects() {
    return [
      // Google Shopping "Checkout" button (Merchant Center -> Checkout settings):
      //   /checkout/?add-to-cart={id}&quantity=1  ->  /checkout-link/{id}/  (adds that exact item, then opens checkout)
      // `quantity` rides along automatically (redirects keep the query string).
      {
        source: '/checkout',
        has: [{ type: 'query', key: 'add-to-cart', value: '(?<id>[^/&?#]+)' }],
        destination: '/checkout-link/:id/',
        permanent: false,
      },
      { source: '/my-account/orders', destination: '/account/orders/', permanent: true },
      { source: '/my-account/view-order/:id', destination: '/account/orders/', permanent: true },
      { source: '/my-account/edit-account', destination: '/account/profile/', permanent: true },
      { source: '/my-account/edit-address', destination: '/account/addresses/', permanent: true },
      { source: '/my-account/edit-address/:type', destination: '/account/addresses/', permanent: true },
      { source: '/my-account/lost-password', destination: '/forgot-password/', permanent: true },
      { source: '/lost-password', destination: '/forgot-password/', permanent: true },
      // WP core sitemap and the old blog-category sitemap -> Rank Math style index.
      // (post/page/product/product_cat/product_tag-sitemap*.xml are served for real, see rewrites.)
      { source: '/wp-sitemap.xml', destination: '/sitemap_index.xml', permanent: true },
      { source: '/category-sitemap.xml', destination: '/sitemap_index.xml', permanent: true },
      // WP RSS feed
      { source: '/feed', destination: '/rss.xml', permanent: true },
      // WooCommerce sent /shop/page/1/ to /shop/ -- keep doing that so page 1 has one URL only.
      { source: '/shop/page/1', destination: '/shop/', permanent: true },
      // Old Woo tag pagination: tag pages show every product on one page, so /page/N -> tag URL.
      { source: '/product-tag/:slug/page/:n(\\d+)', destination: '/product-tag/:slug/', permanent: true },
      // Old Woo tags that no longer exist -> closest live page (301).
      { source: '/product-tag/saree-under-500', destination: '/product-category/clothing/women-clothing/saree/under-499-saree/', permanent: true },
      { source: '/product-tag/saree-under-1500', destination: '/product-tag/saree-under-1000/', permanent: true },
      { source: '/product-tag/under-1500', destination: '/product-tag/saree-under-1000/', permanent: true },
      { source: '/product-tag/summer', destination: '/product-category/clothing/women-clothing/saree/summer-sarees/', permanent: true },
      { source: '/product-tag/printed', destination: '/product-category/clothing/women-clothing/saree/printed-saree/', permanent: true },
      { source: '/product-tag/printed-saree', destination: '/product-category/clothing/women-clothing/saree/printed-saree/', permanent: true },
      { source: '/product-tag/silk-saree', destination: '/product-category/clothing/women-clothing/saree/silk-sarees-saree/', permanent: true },
      { source: '/product-tag/lichi-silk-saree', destination: '/product-category/clothing/women-clothing/saree/silk-sarees-saree/', permanent: true },
      { source: '/product-tag/ghicha-saree', destination: '/product-tag/ghicha-work/', permanent: true },
      // Old WP pages -> closest live page (301). Spam posts/categories stay 404 on purpose.
      { source: '/home', destination: '/', permanent: true },
      { source: '/women-sale', destination: '/shop/', permanent: true },
      { source: '/wholesale-indian-saree', destination: '/shop/', permanent: true },
      { source: '/faqs', destination: '/contact-us/', permanent: true },
      { source: '/customer-help', destination: '/contact-us/', permanent: true },
      { source: '/sutisaree-help-center-24x7-customer-care-support', destination: '/contact-us/', permanent: true },
      { source: '/return-exchange-submit-successful', destination: '/returns-exchange/', permanent: true },
      // ---- Old WordPress/WooCommerce leftovers that Search Console reports as 404 ----
      // Old WP comment pagination on product pages: /product/x/comment-page-1/ -> product page.
      { source: '/product/:slug/comment-page-:n(\\d+)', destination: '/product/:slug/', permanent: true },
      // Old WP per-page / per-category RSS feeds: /anything/feed/ -> the page itself.
      { source: '/product/:slug/feed', destination: '/product/:slug/', permanent: true },
      { source: '/product-category/:path*/feed', destination: '/product-category/:path*/', permanent: true },
      { source: '/blog/:slug/feed', destination: '/blog/:slug/', permanent: true },
      // Old plugin pages (shipment tracking / Parcel Panel) -> our tracking page.
      { source: '/ts-shipment-tracking', destination: '/track/', permanent: true },
      { source: '/parcel-panel', destination: '/track/', permanent: true },
      // Old pages that no longer exist as separate pages.
      { source: '/reviews', destination: '/', permanent: true },
      { source: '/feedback', destination: '/contact-us/', permanent: true },
      // Old Woo "location" archive (/location/india/?filter_color=...) -> shop.
      { source: '/location/india', destination: '/shop/', permanent: true },
      { source: '/location/india/:path*', destination: '/shop/', permanent: true },
    ];
  },
  async rewrites() {
    return [
      // Rank Math split sitemaps (same file names as the old site, 200 URLs per file).
      { source: '/:kind(post|page|product|product_cat|product_tag)-sitemap.xml', destination: '/sitemaps/:kind/1' },
      { source: '/:kind(post|page|product|product_cat|product_tag)-sitemap:n(\\d+).xml', destination: '/sitemaps/:kind/:n' },
      // Old WooCommerce feed URL (Merchant Center ke saved File URL ke liye) -> naya feed
      { source: '/wp-content/uploads/woo-feed/google/xml/saree.xml', destination: '/feeds/google-saree.xml' },
      // Old WordPress media at its original URL -> read from Cloudflare R2 (app/api/wp-uploads).
      { source: '/wp-content/uploads/:path*', destination: '/api/wp-uploads/:path*' },
      // Pinterest per-category / per-tag feeds on the OLD Woo URLs. Must come BEFORE the
      // generic rewrites below (otherwise "rss.xml" would be treated as the category slug).
      { source: '/product-category/:parent*/:slug/rss.xml', destination: '/category/:slug/rss.xml' },
      { source: '/product-tag/:slug/rss.xml', destination: '/tag/:slug/rss.xml' },
      // Old WooCommerce pagination URLs (permalinks were /%postname%/ so pages were /page/N/).
      // MUST come before the generic category rule below, otherwise ":parent*" would swallow
      // "sarees/page" and treat "2" as the category slug.
      { source: '/shop/page/:n(\\d+)', destination: '/shop?page=:n' },
      { source: '/product-category/:parent*/:slug/page/:n(\\d+)', destination: '/category/:slug/page/:n' },
      { source: '/product-category/:parent*/:slug', destination: '/category/:slug' },
      { source: '/product-tag/:slug', destination: '/tag/:slug' },
      { source: '/privacy-policy', destination: '/legal/privacy-policy' },
      { source: '/terms-and-conditions', destination: '/legal/terms-conditions' },
      { source: '/shipping-delivery-information', destination: '/legal/shipping-policy' },
      { source: '/returns-exchange', destination: '/legal/refund-policy' },
      { source: '/about-us', destination: '/about' },
      { source: '/contact-us', destination: '/contact' },
      { source: '/my-account', destination: '/account' },
      {
        // Merchant-feed links (/product/x?size=XL) need server-rendered
        // JSON-LD with that size's price; serve them from a dynamic twin
        // route. Normal product views (no ?size=) stay on the cached page.
        source: '/product/:slug',
        has: [{ type: 'query', key: 'size', value: '.+' }],
        destination: '/product-size/:slug',
      },
    ];
  },
  // Phase 10 (SEO): Google Shopping links carry ?cc=XX so the landing page shows the same currency.
  // Those URLs must never compete with the clean URL in search, so every response to a ?cc= request
  // also names the clean URL (same path, no query) as canonical via an HTTP Link header.
  async headers() {
    const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.sutisaree.com').replace(/\/$/, '');
    return [
      {
        source: '/:path*',
        has: [{ type: 'query', key: 'cc' }],
        headers: [{ key: 'Link', value: `<${site}/:path*>; rel="canonical"` }],
      },
    ];
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverComponentsExternalPackages: ['sharp'],
  },
  images: {
    // Custom responsive loader:
    // - New images: serves -sm (480px) / -md (900px) / original (1600px)
    //   based on requested width — right size per device, no Vercel quota
    // - Old images (no suffix variants): falls back to original URL safely
    loader: 'custom',
    loaderFile: './lib/cloudflare-image-loader.js',
    remotePatterns: [
      { protocol: 'https', hostname: 'images.pexels.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: 'placehold.co' },
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' },
      { protocol: 'https', hostname: 'cdn.aruhihandlooms.com' },
      { protocol: 'https', hostname: 'aruhihandlooms.com' },
      { protocol: 'https', hostname: 'www.aruhihandlooms.com' },
    ],
  },
};

module.exports = nextConfig;
