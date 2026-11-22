import { Metadata } from 'next';
import { fetchCategoriesServer } from '@/lib/products-api-server';
import { CategoryView, buildCategoryMetadata } from './category-view';

// This page uses generateStaticParams(), so without a `revalidate` value
// Next.js caches it once at build time and NEVER regenerates it. ISR keeps it
// nearly-static (cheap, fast) while making sure it drops deleted/changed
// products within the window instead of only on the next deploy. Admin
// mutations also call revalidatePath() for an instant purge -- see
// app/api/admin/products/[id]/route.ts -- this is just the safety net.
export const revalidate = 86400; // 24h - CPU saver; admin edits still purge via revalidatePath

type Params = { params: { slug: string } };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  return buildCategoryMetadata(params.slug, 1);
}

// Only the first few categories are pre-rendered at build time (each page loads
// the whole catalog from Supabase, so building all of them at once made deploys
// slow and caused connection resets). The rest render on first visit and are
// then cached (ISR). Set PRERENDER_TOP_CATEGORIES in Vercel to change N
// (0 = pre-render none).
const PRERENDER_TOP_CATEGORIES = Number(process.env.PRERENDER_TOP_CATEGORIES ?? 6);

export async function generateStaticParams() {
  if (PRERENDER_TOP_CATEGORIES <= 0) return [] as { slug: string }[];
  const categories = await fetchCategoriesServer();
  return categories.slice(0, PRERENDER_TOP_CATEGORIES).map((c) => ({ slug: c.slug }));
}

export default async function CategoryPage({ params }: Params) {
  return <CategoryView slug={params.slug} page={1} />;
}
