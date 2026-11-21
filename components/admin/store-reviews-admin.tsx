'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, EyeOff, Trash2, Star, BadgeCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface Row {
  id: string;
  customer_name: string;
  customer_email: string | null;
  rating: number;
  title: string | null;
  comment: string | null;
  is_approved: boolean;
  verified_purchase: boolean;
  created_at: string;
}

/** Admin > Reviews > "Store reviews": approve, hide or delete reviews that
 *  shoppers wrote about the whole store (popup > Store reviews tab). Switches
 *  for "allow" and "auto-publish" are in Display settings above. */
export default function StoreReviewsAdmin() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/store-reviews');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setRows(json.reviews ?? []);
    } catch (e: any) {
      toast.error(e.message || 'Could not load store reviews');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setApproved = async (r: Row, approved: boolean) => {
    setBusy(r.id);
    try {
      const res = await fetch('/api/admin/store-reviews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id, is_approved: approved }),
      });
      if (!res.ok) throw new Error('Failed to update');
      setRows((list) => list.map((x) => (x.id === r.id ? { ...x, is_approved: approved } : x)));
      toast.success(approved ? 'Store review published' : 'Store review hidden');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (r: Row) => {
    if (!window.confirm(`Delete the store review from ${r.customer_name}?`)) return;
    setBusy(r.id);
    try {
      const res = await fetch(`/api/admin/store-reviews?id=${encodeURIComponent(r.id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      setRows((list) => list.filter((x) => x.id !== r.id));
      toast.success('Store review deleted');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };

  const pending = rows.filter((r) => !r.is_approved).length;

  return (
    <section className="mt-8 rounded-xl border border-border/60 bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-serif text-lg font-semibold">Store reviews</h3>
        <p className="text-xs text-muted-foreground">
          {rows.length} total · {pending} waiting for approval
        </p>
      </div>
      {loading ? (
        <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : rows.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">No store reviews yet.</p>
      ) : (
        <ul className="grid gap-3">
          {rows.map((r) => (
            <li key={r.id} className="grid gap-1.5 rounded-lg border border-border/60 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{r.customer_name}</span>
                {r.verified_purchase && (
                  <Badge variant="secondary" className="gap-1">
                    <BadgeCheck className="h-3 w-3" /> Verified buyer
                  </Badge>
                )}
                <Badge variant={r.is_approved ? 'default' : 'outline'}>{r.is_approved ? 'Published' : 'Pending'}</Badge>
                <span className="ml-auto flex items-center gap-0.5 text-sm">
                  {r.rating} <Star className="h-3.5 w-3.5 fill-secondary text-secondary" />
                </span>
              </div>
              {r.title && <p className="text-sm font-medium">{r.title}</p>}
              {r.comment && <p className="whitespace-pre-line text-sm text-foreground/85">{r.comment}</p>}
              <p className="text-xs text-muted-foreground">
                {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                {r.customer_email ? ` · ${r.customer_email}` : ''}
              </p>
              <div className="mt-1 flex gap-2">
                {r.is_approved ? (
                  <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => setApproved(r, false)}>
                    <EyeOff className="mr-1.5 h-3.5 w-3.5" /> Hide
                  </Button>
                ) : (
                  <Button size="sm" disabled={busy === r.id} onClick={() => setApproved(r, true)}>
                    <Check className="mr-1.5 h-3.5 w-3.5" /> Publish
                  </Button>
                )}
                <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => remove(r)}>
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
