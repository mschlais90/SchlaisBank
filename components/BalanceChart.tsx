"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatDate, formatMoney } from "@/lib/money";

export type BalancePoint = { date: string; balance: number };

const RANGES = [
  { key: "3m", label: "3 months", months: 3 },
  { key: "1y", label: "1 year", months: 12 },
  { key: "all", label: "All time", months: null as number | null },
];

const PAD = { top: 14, right: 16, bottom: 26, left: 52 };
const HEIGHT = 230;

const dayNumber = (iso: string) => Date.parse(iso + "T00:00:00Z") / 86_400_000;

/** Clean axis ticks (0 / 50 / 100 …) covering [0, max]. */
function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? magnitude * 10;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

export default function BalanceChart({ points, name }: { points: BalancePoint[]; name: string }) {
  const [rangeKey, setRangeKey] = useState("all");
  const [width, setWidth] = useState(640);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Render at real pixel width so strokes and text never get scaled/distorted.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const series = useMemo(() => {
    // One point per day (the balance the day ended at) keeps the step line clean.
    const byDate = new Map<string, number>();
    for (const p of points) byDate.set(p.date, p.balance);
    const all = [...byDate.entries()]
      .map(([date, balance]) => ({ date, balance }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    const months = RANGES.find((r) => r.key === rangeKey)?.months ?? null;
    if (!months || all.length === 0) return all;

    const last = new Date(all[all.length - 1].date + "T00:00:00Z");
    const cutoff = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() - months, last.getUTCDate()))
      .toISOString()
      .slice(0, 10);

    const inRange = all.filter((p) => p.date >= cutoff);
    // Carry the balance entering the window so the line starts at the right height.
    const before = all.filter((p) => p.date < cutoff).pop();
    return before ? [{ date: cutoff, balance: before.balance }, ...inRange] : inRange;
  }, [points, rangeKey]);

  const plotWidth = Math.max(width - PAD.left - PAD.right, 10);
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;

  const geometry = useMemo(() => {
    if (series.length === 0) return null;

    const xs = series.map((p) => dayNumber(p.date));
    const xMin = xs[0];
    const xMax = xs[xs.length - 1];
    const span = Math.max(xMax - xMin, 1);

    const maxBalance = Math.max(...series.map((p) => p.balance), 0);
    const ticks = niceTicks(maxBalance);
    const yMax = Math.max(ticks[ticks.length - 1], 1);

    const x = (iso: string) => PAD.left + ((dayNumber(iso) - xMin) / span) * plotWidth;
    const y = (value: number) => PAD.top + plotHeight - (Math.max(value, 0) / yMax) * plotHeight;

    const coords = series.map((p) => ({ ...p, cx: x(p.date), cy: y(p.balance) }));

    // Step line: a balance holds flat until the next transaction changes it.
    let line = `M ${coords[0].cx} ${coords[0].cy}`;
    for (let i = 1; i < coords.length; i++) {
      line += ` L ${coords[i].cx} ${coords[i - 1].cy} L ${coords[i].cx} ${coords[i].cy}`;
    }
    const baseline = PAD.top + plotHeight;
    const area = `${line} L ${coords[coords.length - 1].cx} ${baseline} L ${coords[0].cx} ${baseline} Z`;

    // Four evenly spaced date labels across the range.
    const tickCount = plotWidth < 380 ? 3 : 4;
    const xTicks = Array.from({ length: tickCount }, (_, i) => {
      const iso = new Date((xMin + (span * i) / (tickCount - 1)) * 86_400_000).toISOString().slice(0, 10);
      return { iso, cx: x(iso) };
    });

    return { coords, line, area, ticks, y, baseline, xTicks };
  }, [series, plotWidth, plotHeight]);

  if (!geometry || series.length < 2) {
    return <div className="card empty">Not enough history yet to chart.</div>;
  }

  const { coords, line, area, ticks, y, xTicks } = geometry;
  const last = coords[coords.length - 1];
  const active = activeIndex === null ? null : coords[activeIndex];

  /** Snap to the nearest point's x — readers aim at a date, not at a 2px line. */
  function handlePointer(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    let nearest = 0;
    for (let i = 1; i < coords.length; i++) {
      if (Math.abs(coords[i].cx - px) < Math.abs(coords[nearest].cx - px)) nearest = i;
    }
    setActiveIndex(nearest);
  }

  function handleKey(event: React.KeyboardEvent<SVGSVGElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.key === "ArrowLeft" ? -1 : 1;
    const current = activeIndex ?? coords.length - 1;
    setActiveIndex(Math.min(coords.length - 1, Math.max(0, current + step)));
  }

  const tooltipLeft = active ? Math.min(Math.max(active.cx, 70), Math.max(width - 70, 70)) : 0;

  return (
    <div>
      <div className="chart-controls">
        {RANGES.map((range) => (
          <button
            key={range.key}
            type="button"
            className="chip"
            aria-pressed={rangeKey === range.key}
            onClick={() => {
              setRangeKey(range.key);
              setActiveIndex(null);
            }}
          >
            {range.label}
          </button>
        ))}
      </div>

      <div className="card chart-card">
        <div className="chart-wrap" ref={wrapRef}>
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            tabIndex={0}
            aria-label={`${name}'s balance over time, ending at ${formatMoney(last.balance)}. Full history is in the transaction list below.`}
            onPointerMove={handlePointer}
            onPointerLeave={() => setActiveIndex(null)}
            onKeyDown={handleKey}
            onBlur={() => setActiveIndex(null)}
          >
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke="var(--chart-grid)"
                  strokeWidth={1}
                />
                <text x={PAD.left - 8} y={y(tick) + 4} textAnchor="end" className="axis-text">
                  ${tick >= 1000 ? tick.toLocaleString("en-US") : tick}
                </text>
              </g>
            ))}

            {xTicks.map((tick) => (
              <text key={tick.iso} x={tick.cx} y={HEIGHT - 8} textAnchor="middle" className="axis-text">
                {new Date(tick.iso + "T00:00:00Z").toLocaleDateString("en-US", {
                  month: "short",
                  year: "2-digit",
                  timeZone: "UTC",
                })}
              </text>
            ))}

            <path d={area} fill="var(--chart-line)" fillOpacity={0.1} />
            <path
              d={line}
              fill="none"
              stroke="var(--chart-line)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* End marker: 2px surface ring so it stays legible over the line. */}
            <circle cx={last.cx} cy={last.cy} r={4.5} fill="var(--chart-line)" stroke="var(--surface)" strokeWidth={2} />

            {active ? (
              <g>
                <line
                  x1={active.cx}
                  x2={active.cx}
                  y1={PAD.top}
                  y2={PAD.top + plotHeight}
                  stroke="var(--chart-line)"
                  strokeWidth={1}
                  strokeOpacity={0.45}
                />
                <circle
                  cx={active.cx}
                  cy={active.cy}
                  r={4.5}
                  fill="var(--chart-line)"
                  stroke="var(--surface)"
                  strokeWidth={2}
                />
              </g>
            ) : null}
          </svg>

          {active ? (
            <div className="chart-tooltip" style={{ left: tooltipLeft }}>
              <span className="value">{formatMoney(active.balance)}</span>
              <span className="when">{formatDate(active.date)}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
