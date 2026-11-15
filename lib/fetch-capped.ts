// Supabase/PostgREST ek request me max 1000 rows deta hai. Ye helper pages me padhta hai,
// lekin free-tier (egress) bachane ke liye maxRows par ruk jaata hai.
// IMPORTANT: query me .order(...) zaroor lagao, warna pages ke beech rows idhar-udhar ho sakti hain.
export async function fetchCapped<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  maxRows = 15000,
  pageSize = 1000
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return out;
}
