// Shared helpers for the owner-run audit scripts (audit-product-schema.ts, check-image-sizes.ts).
// Reads the same Supabase env vars as the site (NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY)
// from the shell or from .env.local / .env in the project root. READ-ONLY: nothing is ever written to the DB.
import fs from 'node:fs';
import path from 'node:path';
import { getServerSupabase } from '../lib/supabase-server';
import { fetchProductsServer } from '../lib/products-api-server';
import type { Product } from '../lib/types';

export function loadEnvFiles(): void {
  for (const name of ['.env.local', '.env']) {
    const file = path.join(process.cwd(), name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (!m || line.trim().charAt(0) === '#') continue;
      let v = m[2];
      if ((v.charAt(0) === '"' && v.slice(-1) === '"') || (v.charAt(0) === "'" && v.slice(-1) === "'")) v = v.slice(1, -1);
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not found. Put them in .env.local (project root) or set them in the shell, then run again.');
    process.exit(2);
  }
}

export interface CatalogSize {
  id: string;
  size: string;
  stock_quantity: number;
  price_override: number | null;
  sku: string | null;
}
export interface CatalogVariant {
  id: string;
  product_id: string;
  color: string;
  slug: string;
  images: string[] | null;
  price_override: number | null;
  sku: string | null;
  product_variant_sizes: CatalogSize[] | null;
}

/** Every live product (same function the feed / sitemap use) + all of its colour variants with their size rows. */
export async function loadCatalog(): Promise<{ products: Product[]; variantsByProduct: Map<string, CatalogVariant[]> }> {
  const products = await fetchProductsServer();
  const supabase = getServerSupabase();
  const variantsByProduct = new Map<string, CatalogVariant[]>();
  const CHUNK = 40;
  for (let i = 0; i < products.length; i += CHUNK) {
    const ids = products.slice(i, i + CHUNK).map((p) => p.id);
    const { data, error } = await supabase
      .from('product_variants')
      .select('id, product_id, color, slug, images, price_override, sku, product_variant_sizes(id, size, stock_quantity, price_override, sku)')
      .in('product_id', ids);
    if (error) throw error;
    for (const v of (data ?? []) as unknown as CatalogVariant[]) {
      const list = variantsByProduct.get(v.product_id) ?? [];
      list.push(v);
      variantsByProduct.set(v.product_id, list);
    }
  }
  return { products, variantsByProduct };
}

/** product_id -> number of REAL approved reviews with rating 1-5 (straight from the reviews table). */
export async function loadRealReviewCounts(): Promise<Map<string, number>> {
  const supabase = getServerSupabase();
  const counts = new Map<string, number>();
  const PAGE = 1000;
  for (let from = 0; from < 200000; from += PAGE) {
    const { data, error } = await supabase
      .from('reviews')
      .select('product_id, rating')
      .eq('is_approved', true)
      .gte('rating', 1)
      .lte('rating', 5)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const r of (data ?? []) as { product_id: string }[]) counts.set(r.product_id, (counts.get(r.product_id) ?? 0) + 1);
    if (!data || data.length < PAGE) break;
  }
  return counts;
}

export function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return '"' + s.replace(/"/g, '""') + '"';
}

export function writeCsv(file: string, header: string[], rows: unknown[][]): void {
  const lines = [header.map(csvCell).join(',')].concat(rows.map((r) => r.map(csvCell).join(',')));
  // BOM so Excel opens UTF-8 correctly; CRLF for Windows
  fs.writeFileSync(file, '﻿' + lines.join('\r\n') + '\r\n', 'utf8');
}
