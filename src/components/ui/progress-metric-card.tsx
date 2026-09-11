import { useId, useMemo, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import { ACCENTS, formatCompact, MetricChart, SERIES_COLORS, type ChartSeries, type ChartView, type MetricAccent, type MetricSeries, type SeriesPoint } from "./metric-chart";
import { PeriodSelect, ViewToggle, type PeriodOption } from "./metric-controls";

export type { SeriesPoint, MetricSeries, MetricAccent, ChartView, PeriodOption };
type CardSize = "sm" | "md" | "lg";
export interface ProgressMetricCardProps {
  title: string; total?: string | number; delta?: string; deltaLabel?: string; percent?: string; trend?: "up" | "down"; unit?: string;
  period?: string; periodOptions?: PeriodOption[]; onPeriodChange?: (option: PeriodOption) => void; defaultView?: ChartView; accent?: MetricAccent;
  data?: SeriesPoint[]; series?: MetricSeries[]; defaultIndex?: number; size?: CardSize; showStats?: boolean;
  valueFormatter?: (value: number) => string; dateFormatter?: (date: string) => string; loading?: boolean; className?: string;
}
const DEFAULT_PERIODS: PeriodOption[] = [{ label: "Past 7 days", points: 7 }, { label: "Past 14 days", points: 14 }, { label: "Past 30 days", points: 30 }];
const SIZES: Record<CardSize, { minH: string; pad: string; footer: string; title: string; headline: string }> = {
  sm: { minH: "min-h-[260px]", pad: "px-6 pt-5", footer: "px-6 py-3", title: "text-[15px]", headline: "text-[46px]" },
  md: { minH: "min-h-[380px]", pad: "px-7 pt-6", footer: "px-7 py-4", title: "text-[17px]", headline: "text-[56px]" },
  lg: { minH: "min-h-[460px]", pad: "px-10 pt-9", footer: "px-10 py-5", title: "text-[19px]", headline: "text-[76px]" },
};

export default function ProgressMetricCard({ title, total, delta, deltaLabel = "today", percent, trend, unit, period = "Past 30 days", periodOptions, onPeriodChange, defaultView = "curve", accent, data, series, defaultIndex, size = "md", showStats = true, valueFormatter, dateFormatter, loading = false, className = "" }: ProgressMetricCardProps) {
  const gridId = `metric-grid-${useId().replace(/:/g, "")}`;
  const sz = SIZES[size];
  const periods = periodOptions ?? DEFAULT_PERIODS;
  const [selectedLabel, setSelectedLabel] = useState(period);
  const [view, setView] = useState<ChartView>(defaultView);
  const baseSeries = useMemo<MetricSeries[]>(() => series?.length ? series : [{ name: title, data: data ?? [], accent }], [series, data, title, accent]);
  const option = periods.find((item) => item.label === selectedLabel) ?? periods[periods.length - 1];
  const visibleSeries = useMemo(() => baseSeries.map((item) => ({ ...item, data: option?.points && option.points < item.data.length ? item.data.slice(-option.points) : item.data })), [baseSeries, option]);
  const primary = visibleSeries[0];
  const values = primary?.data.map((item) => item.value) ?? [];
  const sum = values.reduce((a, b) => a + b, 0);
  const first = values[0] ?? 0; const last = values.at(-1) ?? 0; const previous = values.at(-2) ?? first;
  const pct = first ? ((last - first) / first) * 100 : 0;
  const resolvedTrend = trend ?? (last >= first ? "up" : "down");
  const resolvedAccent = accent ?? (resolvedTrend === "up" ? "emerald" : "rose");
  const color = ACCENTS[resolvedAccent];
  const TrendIcon = resolvedTrend === "up" ? ArrowUp : resolvedTrend === "down" ? ArrowDown : ArrowRight;
  const compact = valueFormatter ?? formatCompact;
  const full = valueFormatter ?? ((value: number) => `${value.toLocaleString()}${unit ? ` ${unit}` : ""}`);
  const chartSeries: ChartSeries[] = visibleSeries.map((item, index) => ({ name: item.name, data: item.data, color: item.accent ? ACCENTS[item.accent].stroke : visibleSeries.length > 1 ? SERIES_COLORS[index % SERIES_COLORS.length] : color.stroke }));
  const index = Math.min(defaultIndex ?? Math.max(primary?.data.length - 1, 0), Math.max(primary?.data.length - 1, 0));
  const hasData = values.length >= 2;
  const shell = `relative flex ${sz.minH} w-full flex-col overflow-hidden rounded-[24px] border border-border bg-card shadow-sm ${className}`;

  if (loading) return <div className={shell} aria-busy="true"><div className={`flex flex-1 flex-col ${sz.pad}`}><div className="h-5 w-32 animate-pulse rounded bg-muted" /><div className="mt-6 h-14 w-48 animate-pulse rounded-lg bg-muted" /><div className="mt-auto h-24 w-full animate-pulse rounded-lg bg-muted/50" /></div></div>;
  if (!hasData) return <div className={shell}><div className={`flex flex-1 flex-col ${sz.pad}`}><h3 className={`${sz.title} font-semibold tracking-tight`}>{title}</h3><div className="flex flex-1 flex-col items-center justify-center gap-1 py-10 text-center"><p className="text-sm font-medium">No data yet</p><p className="text-xs text-muted-foreground">Metrics will appear once data is available.</p></div></div></div>;

  return <div className={shell}>
    <div className="absolute inset-y-0 right-0 z-0 w-[65%] bg-gradient-to-l from-primary/10 to-transparent" />
    <div className="absolute inset-y-0 right-0 z-0 w-[65%] text-foreground/[0.12] [mask-image:linear-gradient(to_right,transparent,black_55%)]"><svg className="h-full w-full" aria-hidden><defs><pattern id={gridId} width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="currentColor" /></pattern></defs><rect width="100%" height="100%" fill={`url(#${gridId})`} /></svg></div>
    <div className="absolute inset-y-0 right-0 z-0 w-[65%]"><MetricChart series={chartSeries} view={view} defaultIndex={index} valueFormatter={full} dateFormatter={dateFormatter ?? ((date) => date)} /></div>
    <div className={`pointer-events-none relative z-10 flex flex-1 flex-col ${sz.pad}`}><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><h3 className={`${sz.title} font-semibold tracking-tight`}>{title}</h3><ViewToggle value={view} onChange={setView} /></div><div className="flex items-center gap-2"><span className="flex items-center gap-1 text-xs font-semibold" style={{ color: color.text }}><TrendIcon size={14} />{percent ?? `${Math.abs(pct).toFixed(1)}%`}</span><PeriodSelect value={selectedLabel} options={periods} onChange={(item) => { setSelectedLabel(item.label); onPeriodChange?.(item); }} accentText={color.text} /></div></div><div className={`mt-6 ${sz.headline} font-medium leading-none tracking-tight`}>{total ?? compact(sum)}</div></div>
    <div className={`relative z-10 flex items-center justify-between gap-4 border-t border-border/70 bg-card ${sz.footer} text-sm`}><div><span className="font-medium" style={{ color: color.text }}>{delta ?? `${previous <= last ? "+" : "−"}${compact(Math.abs(last - previous))}`}</span> <span className="text-muted-foreground">{deltaLabel}</span></div>{showStats && <div className="hidden items-center gap-2.5 text-xs text-muted-foreground sm:flex"><span><b className="text-foreground/80">{compact(Math.max(...values))}</b> peak</span><span>·</span><span><b className="text-foreground/80">{compact(Math.min(...values))}</b> low</span><span>·</span><span><b className="text-foreground/80">{compact(Math.round(sum / values.length))}</b> avg</span></div>}</div>
  </div>;
}
