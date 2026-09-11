import { useMemo, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import {
  ACCENTS,
  formatCompact,
  MetricChart,
  SERIES_COLORS,
  type ChartSeries,
  type ChartView,
  type MetricAccent,
  type MetricSeries,
  type SeriesPoint,
} from "./metric-chart";
import { PeriodSelect, ViewToggle, type PeriodOption } from "./metric-controls";

export type { SeriesPoint, MetricSeries, MetricAccent, ChartView, PeriodOption };

type CardSize = "sm" | "md" | "lg";

export interface ProgressMetricCardProps {
  title: string;
  total?: string | number;
  delta?: string;
  deltaLabel?: string;
  percent?: string;
  trend?: "up" | "down";
  unit?: string;
  period?: string;
  periodOptions?: PeriodOption[];
  onPeriodChange?: (option: PeriodOption) => void;
  defaultView?: ChartView;
  accent?: MetricAccent;
  data?: SeriesPoint[];
  series?: MetricSeries[];
  defaultIndex?: number;
  size?: CardSize;
  showStats?: boolean;
  valueFormatter?: (value: number) => string;
  dateFormatter?: (date: string) => string;
  loading?: boolean;
  className?: string;
}

const DEFAULT_PERIODS: PeriodOption[] = [
  { label: "Past 7 days", points: 7 },
  { label: "Past 14 days", points: 14 },
  { label: "Past 30 days", points: 30 },
];

const SIZES: Record<CardSize, { minH: string; padding: string; title: string; headline: string }> = {
  sm: { minH: "min-h-[470px] lg:min-h-[290px]", padding: "p-5", title: "text-sm", headline: "text-4xl" },
  md: { minH: "min-h-[500px] lg:min-h-[360px]", padding: "p-6", title: "text-base", headline: "text-5xl" },
  lg: { minH: "min-h-[560px] lg:min-h-[430px]", padding: "p-8", title: "text-lg", headline: "text-6xl" },
};

const sliceWindow = (points: SeriesPoint[], count?: number) => count && count < points.length ? points.slice(-count) : points;

export default function ProgressMetricCard({
  title,
  total,
  delta,
  deltaLabel = "today",
  percent,
  trend,
  unit,
  period = "Past 30 days",
  periodOptions,
  onPeriodChange,
  defaultView = "curve",
  accent,
  data,
  series,
  defaultIndex,
  size = "md",
  showStats = true,
  valueFormatter,
  dateFormatter,
  loading = false,
  className = "",
}: ProgressMetricCardProps) {
  const sz = SIZES[size];
  const periods = periodOptions ?? DEFAULT_PERIODS;
  const [selectedLabel, setSelectedLabel] = useState(period);
  const [view, setView] = useState<ChartView>(defaultView);
  const baseSeries = useMemo<MetricSeries[]>(() => series?.length ? series : [{ name: title, data: data ?? [], accent }], [series, data, title, accent]);
  const selectedPeriod = periods.find((item) => item.label === selectedLabel) ?? periods[periods.length - 1];
  const visibleSeries = useMemo(() => baseSeries.map((item) => ({ ...item, data: sliceWindow(item.data, selectedPeriod?.points) })), [baseSeries, selectedPeriod]);
  const primary = visibleSeries[0];
  const values = primary?.data.map((item) => item.value) ?? [];
  const hasData = values.length >= 2;
  const sum = values.reduce((totalValue, value) => totalValue + value, 0);
  const first = values[0] ?? 0;
  const last = values.at(-1) ?? 0;
  const previous = values.at(-2) ?? first;
  const peak = values.length ? Math.max(...values) : 0;
  const average = values.length ? Math.round(sum / values.length) : 0;
  const change = last - previous;
  const percentage = first ? ((last - first) / first) * 100 : 0;
  const resolvedTrend = trend ?? (percentage === 0 ? "up" : percentage > 0 ? "up" : "down");
  const resolvedAccent = accent ?? (resolvedTrend === "up" ? "emerald" : "rose");
  const color = ACCENTS[resolvedAccent];
  const TrendIcon = percentage === 0 ? ArrowRight : resolvedTrend === "up" ? ArrowUp : ArrowDown;
  const compact = valueFormatter ?? formatCompact;
  const full = valueFormatter ?? ((value: number) => `${value.toLocaleString()}${unit ? ` ${unit}` : ""}`);
  const chartSeries: ChartSeries[] = visibleSeries.map((item, index) => ({
    name: item.name,
    data: item.data,
    color: item.accent ? ACCENTS[item.accent].stroke : visibleSeries.length > 1 ? SERIES_COLORS[index % SERIES_COLORS.length] : color.stroke,
  }));
  const index = Math.min(defaultIndex ?? Math.max(primary?.data.length - 1, 0), Math.max(primary?.data.length - 1, 0));
  const shell = `relative flex ${sz.minH} w-full overflow-hidden rounded-2xl border border-border bg-card shadow-sm ${className}`;

  const changeLabel = delta ?? `${change >= 0 ? "+" : "−"}${compact(Math.abs(change))}`;
  const trendLabel = percent ?? `${Math.abs(percentage).toFixed(1)}%`;

  if (loading) {
    return <div className={shell} aria-busy="true"><div className={`${sz.padding} w-full`}><div className="h-5 w-32 animate-pulse rounded bg-muted" /><div className="mt-7 h-12 w-36 animate-pulse rounded bg-muted" /><div className="mt-8 h-20 animate-pulse rounded-xl bg-muted/60" /></div></div>;
  }

  if (!hasData) {
    return <div className={shell}><div className={`${sz.padding} flex w-full flex-col`}><h3 className={`${sz.title} font-semibold`}>{title}</h3><div className="flex flex-1 flex-col items-center justify-center text-center"><p className="text-sm font-medium">No data yet</p><p className="mt-1 text-xs text-muted-foreground">Metrics will appear once data is available.</p></div></div></div>;
  }

  return (
    <div className={shell}>
      <div className="absolute inset-x-0 bottom-0 h-[44%] border-t border-border/50 bg-gradient-to-b from-muted/35 to-primary/[0.035] lg:inset-y-[72px] lg:left-auto lg:h-auto lg:w-[62%] lg:border-l lg:border-t-0" />
      <div className="absolute inset-x-0 bottom-0 z-0 h-[44%] lg:inset-y-[72px] lg:left-auto lg:h-auto lg:w-[62%]"><MetricChart series={chartSeries} view={view} defaultIndex={index} valueFormatter={full} dateFormatter={dateFormatter ?? ((date) => date)} /></div>

      <div className={`relative z-10 flex w-full flex-col ${sz.padding}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Overview</p>
            <h3 className={`mt-1 ${sz.title} font-semibold tracking-tight text-foreground`}>{title}</h3>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ViewToggle value={view} onChange={setView} />
            <PeriodSelect value={selectedLabel} options={periods} onChange={(item) => { setSelectedLabel(item.label); onPeriodChange?.(item); }} accentText={color.text} />
          </div>
        </div>

        <div className="mt-5 flex items-end justify-between gap-4 lg:w-[34%] lg:flex-col lg:items-start">
          <div>
            <p className="text-xs font-medium text-muted-foreground">All-time total</p>
            <p className={`mt-1 ${sz.headline} font-semibold leading-none tracking-tight text-foreground`}>{total ?? compact(sum)}</p>
          </div>
          <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-current/15 bg-background/80 px-2.5 py-1 text-xs font-semibold" style={{ color: color.text }}>
            <TrendIcon className="h-3.5 w-3.5" /> {trendLabel}
          </div>
        </div>

        {showStats && (
          <div className="mt-5 grid max-w-[320px] grid-cols-3 divide-x divide-border rounded-xl border border-border/80 bg-background/90 shadow-sm backdrop-blur-sm">
            <div className="px-3 py-2.5"><p className="text-[11px] text-muted-foreground">Today</p><p className="mt-0.5 text-sm font-semibold" style={{ color: color.text }}>{changeLabel}</p></div>
            <div className="px-3 py-2.5"><p className="text-[11px] text-muted-foreground">Peak day</p><p className="mt-0.5 text-sm font-semibold">{compact(peak)}</p></div>
            <div className="px-3 py-2.5"><p className="text-[11px] text-muted-foreground">Daily avg</p><p className="mt-0.5 text-sm font-semibold">{compact(average)}</p></div>
          </div>
        )}

        <p className="mt-auto pt-3 text-xs text-muted-foreground"><span className="font-medium" style={{ color: color.text }}>{changeLabel}</span> {deltaLabel}</p>
      </div>
    </div>
  );
}
