'use client';

import { Star } from 'lucide-react';
import type { KpiData, LiveData, MarketingData, StoreData } from '@/lib/dashboards-config';
import {
  BarChart, BarList, Big, C_BLUE, C_GOLD, C_ORANGE, C_RED, DashboardFrame, Delta, Gauge, LineChart,
  ProgressBar, Tile, ValueRows, compactINR, inr,
} from './primitives';

const num = (n: number) => n.toLocaleString('en-IN');
const NOTE = 'Sales = cancelled/failed/refunded ko chhodkar saare orders (COD pending sahit)';

// ── 1. Ecommerce KPI ────────────────────────────────────────────────────────
export function KpiDashboard({ d, time }: { d: KpiData; time: string }) {
  const days = d.salesByDay.map((x) => `${x.day}`);
  return (
    <DashboardFrame title="Ecommerce KPI dashboard" footer={time}>
      <Tile title="Total sales" className="lg:row-span-2">
        <Big value={inr(d.todaySales.value)} sub="Aaj" size="xl" />
        <Delta {...d.todaySales} label="vs same day last week" />
        <p className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wide text-white/70">Sales volume (is mahine)</p>
        <LineChart
          legend
          labels={days}
          format={compactINR}
          series={[
            { name: 'is mahine', color: C_BLUE, values: d.salesByDay.map((x) => x.thisMonth) },
            { name: 'pichhla mahina', color: C_GOLD, values: d.salesByDay.map((x) => x.lastMonth) },
          ]}
        />
      </Tile>

      <Tile title="Orders" className="lg:row-span-2">
        <Big value={num(d.todayOrders.value)} sub="Aaj" size="xl" />
        <Delta {...d.todayOrders} label="vs same day last week" />
        <p className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wide text-white/70">Order volume</p>
        <LineChart
          legend
          labels={days}
          series={[
            { name: 'is mahine', color: C_BLUE, values: d.ordersByDay.map((x) => x.thisMonth) },
            { name: 'pichhla mahina', color: C_GOLD, values: d.ordersByDay.map((x) => x.lastMonth) },
          ]}
        />
        <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-white/70">Orders by payment</p>
        <BarList rows={d.byPayment} />
      </Tile>

      <Tile title="Is mahine ki sales">
        <Big value={compactINR(d.monthSales.value)} sub="Month to date" size="xl" />
        <Delta {...d.monthSales} label="vs pichhla mahina (same din tak)" />
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-wide text-white/70">Avg. order value</p>
          <Big value={inr(d.aov.value)} />
          <Delta {...d.aov} label="vs pichhla mahina" />
        </div>
      </Tile>

      <Tile title="Is mahine ke kharche (orders se)">
        <ValueRows
          format={inr}
          rows={[
            { name: 'Shipping charges collected', value: d.costs.shipping },
            { name: 'Coupon discounts diye', value: d.costs.discounts },
            { name: 'GST', value: d.costs.gst },
          ]}
        />
        <p className="mt-2 text-[10px] text-white/50">Product cost data nahi hai, isliye net profit nahi dikhaya.</p>
      </Tile>

      <Tile title="Sales by state">
        <ValueRows rows={d.byState} format={compactINR} />
      </Tile>
      <Tile title="Sales by source">
        <ValueRows rows={d.bySource} format={compactINR} />
      </Tile>
      <p className="col-span-full px-1 text-[10px] text-white/45">{NOTE}</p>
    </DashboardFrame>
  );
}

// ── 2. Store overview ───────────────────────────────────────────────────────
export function StoreDashboard({ d, time }: { d: StoreData; time: string }) {
  return (
    <DashboardFrame title="Store overview" footer={time}>
      <Tile title="Sales" className="lg:row-span-2">
        <Big value={compactINR(d.salesToday.value)} sub="Aaj" size="xl" />
        <Delta {...d.salesToday} label="vs kal" />
        <p className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wide text-white/70">Is hafte</p>
        <LineChart area labels={d.weekTrend.map((x) => x.label)} format={compactINR} series={[{ name: 'Sales', color: C_BLUE, values: d.weekTrend.map((x) => x.value) }]} />
      </Tile>

      <Tile title="AOV - is hafte">
        <Gauge value={d.aovWeek} max={Math.max(d.aovWeek, d.aovPrevWeek, 1) * 1.5} label={inr(d.aovWeek)} />
        <Delta value={d.aovWeek} prev={d.aovPrevWeek} label="vs pichhla hafta" />
      </Tile>

      <Tile title="Pending / unfulfilled orders" className="lg:col-span-2">
        {d.unfulfilled.length === 0 ? (
          <p className="py-3 text-xs text-white/60">Koi pending order nahi 🎉</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-white/50">
                <tr><th className="pb-1 font-normal">Order</th><th className="pb-1 font-normal">Status</th><th className="pb-1 font-normal">Pay</th><th className="pb-1 text-right font-normal">Amount</th><th className="pb-1 pl-2 font-normal">Tag</th></tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {d.unfulfilled.map((o) => (
                  <tr key={o.id}>
                    <td className="py-1.5 font-mono">{o.short}</td>
                    <td className="capitalize">{o.status}</td>
                    <td>{o.payment}</td>
                    <td className="text-right">{inr(o.amount)}</td>
                    <td className="pl-2 text-white/70">{o.coupon ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {d.unfulfilledTotal > d.unfulfilled.length && (
              <p className="mt-1 text-[10px] text-white/50">+{d.unfulfilledTotal - d.unfulfilled.length} aur pending</p>
            )}
          </div>
        )}
      </Tile>

      <Tile title="Cancellations">
        <Big value={num(d.cancellations.value)} sub="Is mahine (cancelled + failed)" />
        <Delta {...d.cancellations} label="vs pichhla mahina" invert />
        <p className="mb-1.5 mt-3 text-[11px] uppercase tracking-wide text-white/70">Reason</p>
        <BarList rows={d.cancelReasons} color={C_RED} empty="Koi cancellation nahi" />
      </Tile>

      <Tile title="Best sellers - is hafte" className="lg:col-span-2">
        <ValueRows rows={d.bestSellers} />
      </Tile>

      <Tile title={d.topCoupon ? `Top coupon: ${d.topCoupon.code}` : 'Top coupon'} className="lg:col-span-1">
        {d.topCoupon ? (
          <>
            <Big value={compactINR(d.topCoupon.total)} sub="Is hafte is coupon se sales" />
            <LineChart height={80} format={compactINR} series={[{ name: 'coupon', color: C_ORANGE, values: d.topCoupon.trend.map((x) => x.value) }]} />
          </>
        ) : (
          <p className="py-3 text-xs text-white/60">Is hafte koi coupon use nahi hua</p>
        )}
      </Tile>
    </DashboardFrame>
  );
}

// ── 3. Marketing ────────────────────────────────────────────────────────────
export function MarketingDashboard({ d, time }: { d: MarketingData; time: string }) {
  const maxFunnel = Math.max(1, d.funnel[0]?.value ?? 1);
  return (
    <DashboardFrame title="Marketing dashboard" footer={time}>
      <Tile title="Conversion funnel - is hafte" className="lg:row-span-2">
        <ul className="space-y-2.5">
          {d.funnel.map((f, i) => (
            <li key={f.name} className="text-xs">
              <div className="mb-0.5 flex justify-between"><span className="text-white/85">{f.name}</span><span className="font-medium">{num(f.value)}</span></div>
              <div className="h-2 rounded bg-white/10"><div className="h-2 rounded" style={{ width: `${Math.max(2, (f.value / maxFunnel) * 100)}%`, background: [C_BLUE, '#4aa8f0', '#7a8df0', C_GOLD, '#22d583'][i] }} /></div>
            </li>
          ))}
        </ul>
        <div className="mt-4"><p className="text-[11px] uppercase tracking-wide text-white/70">AOV is hafte</p><Big value={inr(d.aovWeek)} /></div>
      </Tile>

      <Tile title="Website visits - is hafte" className="lg:col-span-2">
        <LineChart area labels={d.visitsTrend.map((x) => x.label)} series={[{ name: 'Page views', color: C_BLUE, values: d.visitsTrend.map((x) => x.value) }]} />
      </Tile>

      <div className="grid gap-2.5">
        <Tile alert={d.cartAbandonment >= 70}>
          <Big value={`${d.cartAbandonment}%`} sub="Cart abandonment rate (is hafte)" />
        </Tile>
        <Tile>
          <Big value={compactINR(d.abandonedValue)} sub={`${d.abandonedCount} abandoned carts (recover nahi hue)`} />
        </Tile>
      </div>

      <Tile title="Orders by medium - is hafte">
        <BarList rows={d.byMedium} empty="Attribution data nahi mila" />
      </Tile>

      <Tile title="Newsletter subscribers">
        <Big value={num(d.subscribers.total)} sub={`+${num(d.subscribers.thisWeek)} is hafte`} size="xl" />
      </Tile>

      <Tile title="Customer feedback">
        {d.reviews.length === 0 ? (
          <p className="py-2 text-xs text-white/60">Abhi koi approved review nahi</p>
        ) : (
          <ul className="space-y-2.5">
            {d.reviews.map((r, i) => (
              <li key={i} className="text-xs">
                <div className="flex items-center gap-1 text-white/90">
                  <span className="truncate font-medium">{r.name}</span>
                  <span className="ml-auto flex shrink-0">{Array.from({ length: r.rating }).map((_, k) => <Star key={k} className="h-3 w-3 fill-current" style={{ color: C_GOLD }} />)}</span>
                </div>
                {r.text && <p className="mt-0.5 line-clamp-2 text-white/65">{r.text}</p>}
              </li>
            ))}
          </ul>
        )}
      </Tile>
    </DashboardFrame>
  );
}

// ── 4. Live sale monitor ────────────────────────────────────────────────────
export function LiveDashboard({ d, time }: { d: LiveData; time: string }) {
  const hourLabels = d.hourly.map((h) => `${h.hour}:00`);
  return (
    <DashboardFrame title="Live sale monitor" footer={time}>
      <Tile className="lg:row-span-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">Aaj ki total sales</p>
        <div className="mt-2"><Big value={compactINR(d.salesToday)} sub={`Target ${compactINR(d.target)}`} size="xl" /></div>
        <div className="mt-3"><ProgressBar value={d.salesToday} max={d.target} /></div>
        <p className="mb-1 mt-5 text-[11px] font-semibold uppercase tracking-wide text-white/70">Orders aaj</p>
        <Big value={num(d.ordersToday)} />
      </Tile>

      <Tile title="Order volume (ghante ke hisaab se, aaj)" className="lg:col-span-2">
        <BarChart values={d.hourly.map((h) => h.value)} labels={hourLabels} height={110} />
      </Tile>

      <Tile title="Visitors abhi (last 5 min)">
        <Big value={num(d.visitorsNow)} sub="Active sessions" size="xl" />
      </Tile>

      <div className="grid gap-2.5 sm:grid-cols-2 lg:col-span-2">
        <Tile alert={d.pendingOrders > 10}>
          <Big value={num(d.pendingOrders)} sub="Pending / unfulfilled orders" />
        </Tile>
        <Tile alert={d.openTickets + d.newMessages > 0}>
          <Big value={num(d.openTickets + d.newMessages)} sub={`Support queue (${d.openTickets} tickets, ${d.newMessages} naye messages)`} />
        </Tile>
      </div>

      <Tile title="Sales by coupon (aaj)">
        <ValueRows rows={d.byCoupon} format={compactINR} />
      </Tile>

      <Tile title="Top pages (aaj)">
        <ValueRows rows={d.topPages} />
      </Tile>
    </DashboardFrame>
  );
}
