import { getServerSupabase } from './supabase-server';
import { BlogPostRow } from './types';
import { isSpamSlug } from './spam-410';

export async function fetchPublishedBlogPostsServer(): Promise<BlogPostRow[]> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('published', true)
    .order('published_at', { ascending: false });
  if (error) {
    console.error('fetchPublishedBlogPostsServer failed', error);
    return [];
  }
  // Defense in depth: a spam slug must never reach the index, sitemap or a link, even if re-inserted.
  return ((data ?? []) as BlogPostRow[]).filter((p) => !isSpamSlug(p.slug));
}

export async function fetchPublishedBlogPostBySlugServer(
  slug: string
): Promise<BlogPostRow | null> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('slug', slug)
    .eq('published', true)
    .maybeSingle();
  if (error) {
    console.error('fetchPublishedBlogPostBySlugServer failed', error);
    return null;
  }
  if (!data || isSpamSlug((data as BlogPostRow).slug)) return null;
  return data as BlogPostRow;
}
