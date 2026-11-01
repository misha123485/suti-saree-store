'use client';

import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';

// Dark "TV dashboard" look (inspired by Geckoboard), built with plain SVG/CSS
// so it adds zero extra JS libraries to the bundle.

export const NAVY = '#1e2347';
export const NAVY_DARK = '#161a38';
export const C_BLUE = '#22c1f1';
export const C_GOLD = '#f0b84b';
export const C_GREEN = '#22d583';
export const C_RED = '#ff6b7a';
export const C_ORANGE = '#ff9d7a';

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
export function compactINR(n: number) {
  const a = Math.abs(n);
  if (a >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)}Cr`;
  if (a >= 100_000) return `₹${(n / 100_000).toFixed(2)}L`;
  if (a >= 10_000) return `₹${(n / 1000).toFixed(1)}K`;
  return inr(n);
}

export function DashboardFrame({ title, children, footer }: { title: string; children: ReactNode; footer?: string }) {
  return (
    <section className="overflow-hidden rounded-2xl p-2.5 text-white shadow-lg sm:p-3" style={{ background: NAVY_DARK }}>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">{children}</div>
      <div className="mt-2.5 flex items-center justify-between px-1 text-[11px] text-white/60">
        <span className="font-medium text-white/80">{title}</span>
        {footer && <span>{footer}</span>}
      </div>
    </section>
  );
}

export function Tile({
  title,
  children,
  className = '',
  alert,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-3 ${className}`}
      style={{ background: NAVY, outline: alert ? `1.5px solid ${C_RED}` : undefined }}
    >
      {title && <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/70">{title}</p>}
      {children}
    </div>
  );
}

export function Big({ value, sub, size = 'lg' }: { value: string; sub?: string; size?: 'lg' | 'xl' }) {
  return (
    <div>
      <p className={`font-semibold leading-none tracking-tight ${size === 'xl' ? 'text-4xl' : 'text-3xl'}`}>{value}</p>
      {sub && <p className="mt-1 text-[11px] text-white/60">{sub}</p>}
    </div>
  );
}

export function Delta({ value, prev, label, invert }: { value: number; prev: number; label: string; invert?: boolean }) {
  if (!prev) return <p className="mt-1 text-[11px] text-white/50">{label}: no data</p>;
  const pct = ((value - prev) / prev) * 100;
  const up = pct >= 0;
  const good = invert ? !up : up;
  const color = pct === 0 ? '#9aa0c0' : good ? C_GREEN : C_RED;
  return (
    <p className="mt-1 flex items-center gap-1 text-[11px]" style={{ color }}>
      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(pct).toFixed(1)}% <span className="text-white/60">{label}</span>
    </p>
  );
}

export function BarList({
  rows,
  format = (n) => n.toLocaleString('en-IN'),
  color = C_BLUE,
  empty = 'Abhi koi data nahi',
}: {
  rows: { name: string; value: number }[];
  format?: (n: number) => string;
  color?: string;
  empty?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0 || rows.every((r) => r.value === 0)) return <p className="py-2 text-xs text-white/50">{empty}</p>;
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.name} className="text-xs">
          <div className="mb-0.5 flex justify-between gap-2">
            <span className="truncate text-white/85">{r.name}</span>
            <span className="shrink-0 font-medium">{format(r.value)}</span>
          </div>
          <div className="h-1 rounded-full bg-white/10">
            <div className="h-1 rounded-full" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ValueRows({ rows, format }: { rows: { name: string; value: number }[]; format?: (n: number) => string }) {
  if (rows.length === 0) return <p className="py-2 text-xs text-white/50">Abhi koi data nahi</p>;
  return (
    <ul className="divide-y divide-white/10 text-xs">
      {rows.map((r) => (
        <li key={r.name} className="flex justify-between gap-2 py-1.5">
          <span className="truncate text-white/85">{r.name}</span>
          <span className="shrink-0 font-medium">{format ? format(r.value) : r.value.toLocaleString('en-IN')}</span>
        </li>
      ))}
    </ul>
  );
}

type Series = { name: string; color: string; values: (number | null)[] };

export function LineChart({
  series,
  labels,
  height = 110,
  area,
  format = (n) => String(Math.round(n)),
  legend,
}: {
  series: Series[];
  labels?: string[];
  height?: number;
  area?: boolean;
  format?: (n: number) => string;
  legend?: boolean;
}) {
  const W = 300;
  const H = height;
  const padL = 30;
  const padB = 14;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  const max = Math.max(1, ...all);
  const n = Math.max(...series.map((s) => s.values.length), 2);
  const x = (i: number) => padL + (i / (n - 1)) * (W - padL - 4);
  const y = (v: number) => H - padB - (v / max) * (H - padB - 6);
  const path = (vals: (number | null)[]) => {
    let d = '';
    let pen = false;
    vals.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      pen = true;
    });
    return d.trim();
  };
  const ticks = [0, max / 2, max];
  return (
    <div>
      {legend && (
        <div className="mb-1 flex gap-3 text-[10px] text-white/60">
          {series.map((s) => (
            <span key={s.name} className="flex items-center gap-1">
              <i className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={W - 4} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.08)" />
            <text x={padL - 4} y={y(t) + 3} textAnchor="end" fontSize="8" fill="rgba(255,255,255,0.5)">
              {format(t)}
            </text>
          </g>
        ))}
        {series.map((s) => (
          <g key={s.name}>
            {area && (
              <path d={`${path(s.values)} L${x(s.values.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={s.color} opacity="0.12" />
            )}
            <path d={path(s.values)} fill="none" stroke={s.color} strokeWidth="1.8" strokeLinejoin="round" />
          </g>
        ))}
        {labels && (
          <>
            <text x={padL} y={H - 2} fontSize="8" fill="rgba(255,255,255,0.5)">{labels[0]}</text>
            <text x={W - 4} y={H - 2} fontSize="8" textAnchor="end" fill="rgba(255,255,255,0.5)">{labels[labels.length - 1]}</text>
          </>
        )}
      </svg>
    </div>
  );
}

export function BarChart({ values, labels, color = C_BLUE, height = 100 }: { values: number[]; labels?: string[]; color?: string; height?: number }) {
  const W = 300;
  const H = height;
  const max = Math.max(1, ...values);
  const bw = (W - 8) / Math.max(values.length, 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
      {values.map((v, i) => {
        const h = (v / max) * (H - 16);
        return <rect key={i} x={4 + i * bw + 1} y={H - 12 - h} width={Math.max(2, bw - 2)} height={Math.max(h, v > 0 ? 1.5 : 0)} rx="1.5" fill={color} />;
      })}
      {labels && (
        <>
          <text x="4" y={H - 1} fontSize="8" fill="rgba(255,255,255,0.5)">{labels[0]}</text>
          <text x={W - 4} y={H - 1} fontSize="8" textAnchor="end" fill="rgba(255,255,255,0.5)">{labels[labels.length - 1]}</text>
        </>
      )}
    </svg>
  );
}

export function Gauge({ value, max, label }: { value: number; max: number; label: string }) {
  const frac = Math.max(0, Math.min(1, value / Math.max(max, 1)));
  const r = 50;
  const cx = 60;
  const cy = 58;
  const pt = (f: number) => [cx + r * Math.cos(Math.PI * (1 - f)), cy - r * Math.sin(Math.PI * (1 - f))];
  const [x0, y0] = pt(0);
  const [x1, y1] = pt(1);
  const [xv, yv] = pt(frac);
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 120 68" className="w-full max-w-[200px]">
        <path d={`M${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1}`} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="9" strokeLinecap="round" />
        <path d={`M${x0},${y0} A${r},${r} 0 0 1 ${xv},${yv}`} fill="none" stroke={C_GREEN} strokeWidth="9" strokeLinecap="round" />
        <line x1={cx} y1={cy} x2={xv} y2={yv} stroke="#fff" strokeWidth="2" />
        <circle cx={cx} cy={cy} r="3.5" fill="#fff" />
      </svg>
      <p className="-mt-1 text-xl font-semibold">{label}</p>
    </div>
  );
}

export function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, Math.round((value / Math.max(max, 1)) * 100));
  return (
    <div>
      <div className="h-2 rounded-full bg-white/10">
        <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: pct >= 100 ? C_GREEN : C_BLUE }} />
      </div>
      <p className="mt-1 text-[10px] text-white/60">{pct}% of target</p>
    </div>
  );
}

export { inr };
