// ---------------------------------------------------------------------
// Tiny in-memory sliding-window rate limiter for public endpoints.
// Per serverless instance (not shared across instances), so it is a
// speed-bump against casual spam, not a hard guarantee -- the review
// moderation queue is the real safety net.
// ---------------------------------------------------------------------
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  // Keep the map from growing forever on a long-lived instance.
  if (buckets.size > 5000) {
    buckets.forEach((v, k) => {
      if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
    });
  }
  return true;
}

export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}
