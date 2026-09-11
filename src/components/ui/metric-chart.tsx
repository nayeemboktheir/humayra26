export type SeriesPoint = { value: number; date: string };
export type MetricAccent = "emerald" | "rose" | "neutral" | "blue" | "amber";
export type ChartView = "curve" | "bars";
export type MetricSeries = { name: string; data: SeriesPoint[]; accent?: MetricAccent };
export type ChartSeries = { name: string; data: SeriesPoint[]; color: string };

export const ACCENTS: Record<MetricAccent, { stroke: string; text: string }> = {
  emerald: { stroke: "#10b981", text: "#059669" },
  rose: { stroke: "#f43f5e", text: "#e11d48" },
  neutral: { stroke: "#64748b", text: "#475569" },
  blue: { stroke: "#2563eb", text: "#1d4ed8" },
  amber: { stroke: "#f59e0b", text: "#d97706" },
};
export const SERIES_COLORS = ["#2563eb", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];
export const formatCompact = (value: number) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);

export function MetricChart({ series, view, defaultIndex, valueFormatter, dateFormatter }: { series: ChartSeries[]; view: ChartView; defaultIndex: number; valueFormatter: (value: number) => string; dateFormatter: (date: string) => string }) {
  const values = series.flatMap((item) => item.data.map((point) => point.value));
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const primary = series[0];
  const selected = primary?.data[defaultIndex];

  const points = (data: SeriesPoint[]) => data.map((point, index) => {
    const x = data.length === 1 ? 50 : (index / (data.length - 1)) * 100;
    const y = 90 - ((point.value - min) / range) * 70;
    return `${x},${y}`;
  }).join(" ");

  return (
    <div className="absolute inset-0 flex items-end px-5 pb-11 pt-20">
      {view === "bars" ? (
        <div className="flex h-full w-full items-end gap-1.5">
          {(primary?.data || []).map((point, index) => <div key={`${point.date}-${index}`} className="flex-1 rounded-t-sm bg-current/20" style={{ height: `${Math.max(((point.value - min) / range) * 76, 4)}%`, color: primary?.color }} />)}
        </div>
      ) : (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible" aria-label={selected ? `${valueFormatter(selected.value)} on ${dateFormatter(selected.date)}` : undefined}>
          {series.map((item) => <polyline key={item.name} points={points(item.data)} fill="none" stroke={item.color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />)}
          {selected && <circle cx={primary.data.length === 1 ? 50 : (defaultIndex / (primary.data.length - 1)) * 100} cy={90 - ((selected.value - min) / range) * 70} r="2.3" fill={primary.color} vectorEffect="non-scaling-stroke" />}
        </svg>
      )}
    </div>
  );
}
