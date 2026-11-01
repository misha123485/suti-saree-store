'use client';

import { useEffect, useState } from 'react';
import { Globe2 } from 'lucide-react';

interface Summary { enabled: boolean; orders: number; revenue: number; profit: number; margin_percent: number }
const inr = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

/** "International this month" card. Renders nothing while International Selling is OFF or if the call fails. */
export default function IntlMonthCard() {
  const [s, setS] = useState<Summary | null>(null);
  useEffect(() => {
    fetch('/api/admin/international/pnl?summary=month', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => setS(b))
      .catch(() => setS(null));
  }, []);
  if (!s || !s.enabled) return null;
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2"><Globe2 className="h-4 w-4 text-primary" /><h3 className="font-serif text-lg font-semibold text-primary">International · this month</h3></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div><p className="text-xs text-muted-foreground">Orders</p><p className="text-xl font-semibold tabular-nums">{s.orders}</p></div>
        <div><p className="text-xs text-muted-foreground">Revenue</p><p className="text-xl font-semibold tabular-nums">{inr(s.revenue)}</p></div>
        <div><p className="text-xs text-muted-foreground">Profit</p><p className={`text-xl font-semibold tabular-nums ${s.profit < 0 ? 'text-red-600' : ''}`}>{inr(s.profit)}</p></div>
        <div><p className="text-xs text-muted-foreground">Margin</p><p className="text-xl font-semibold tabular-nums">{s.margin_percent}%</p></div>
      </div>
    </div>
  );
}
