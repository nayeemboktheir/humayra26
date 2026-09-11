import { useId } from "react";

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

const WIDTH = 600;
const HEIGHT = 210;
const LEFT = 18;
const RIGHT = 582;
const TOP = 18;
const BOTTOM = 170;

export function MetricChart({ series, view, defaultIndex, valueFormatter, dateFormatter }: { series: ChartSeries[]; view: ChartView; defaultIndex: number; valueFormatter: (value: number) => string; dateFormatter: (date: string) => string }) {
  const gradientId = `metric-area-${useId().replace(/:/g, "")}`;
  const values = series.flatMap((item) => item.data.map((point) => point.value));
  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values, 0);
  const range = Math.max(maxValue - minValue, 1);
  const primary = series[0];
  const selected = primary?.data[defaultIndex];
  const labels = primary?.data || [];

  const xPosition = (index: number, count: number) => count <= 1 ? (LEFT + RIGHT) / 2 : LEFT + (index / (count - 1)) * (RIGHT - LEFT);
  const yPosition = (value: number) => BOTTOM - ((value - minValue) / range) * (BOTTOM - TOP);
  const linePoints = (data: SeriesPoint[]) => data.map((point, index) => `${xPosition(index, data.length)},${yPosition(point.value)}`).join(" ");
  const areaPoints = primary?.data.length ? `${LEFT},${BOTTOM} ${linePoints(primary.data)} ${RIGHT},${BOTTOM}` : "";
  const middleIndex = Math.floor((labels.length - 1) / 2);
  const barStep = labels.length ? (RIGHT - LEFT) / labels.length : 0;
  const barWidth = Math.max(Math.min(barStep * 0.62, 18), 3);

  return (
    <div className="relative h-full min-h-[220px] w-full overflow-hidden px-4 pb-9 pt-4 sm:px-6">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className="h-full w-full overflow-visible" role="img" aria-label={selected ? `${valueFormatter(selected.value)} on ${dateFormatter(selected.date)}` : "Metric chart"}>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={primary?.color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={primary?.color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 1, 2, 3].map((line) => {
          const y = TOP + (line / 3) * (BOTTOM - TOP);
          return <line key={line} x1={LEFT} x2={RIGHT} y1={y} y2={y} stroke="currentColor" strokeOpacity="0.09" strokeDasharray="4 7" vectorEffect="non-scaling-stroke" />;
        })}

        {view === "bars" ? (
          primary?.data.map((point, index) => {
            const x = xPosition(index, primary.data.length) - barWidth / 2;
            const y = yPosition(point.value);
            return <rect key={`${point.date}-${index}`} x={x} y={y} width={barWidth} height={Math.max(BOTTOM - y, 2)} rx="3" fill={primary.color} fillOpacity={index === defaultIndex ? 0.9 : 0.42} />;
          })
        ) : (
          <>
            <polygon points={areaPoints} fill={`url(#${gradientId})`} />
            {series.map((item) => <polyline key={item.name} points={linePoints(item.data)} fill="none" stroke={item.color} strokeWidth="2.25" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />)}
            {selected && (
              <>
                <circle cx={xPosition(defaultIndex, primary.data.length)} cy={yPosition(selected.value)} r="7" fill={primary.color} fillOpacity="0.13" />
                <circle cx={xPosition(defaultIndex, primary.data.length)} cy={yPosition(selected.value)} r="3.2" fill={primary.color} stroke="white" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              </>
            )}
          </>
        )}
      </svg>

      {labels.length > 0 && (
        <div className="pointer-events-none absolute inset-x-5 bottom-3 flex justify-between text-[10px] font-medium text-muted-foreground sm:inset-x-7">
          <span>{dateFormatter(labels[0].date)}</span>
          <span>{dateFormatter(labels[middleIndex].date)}</span>
          <span>{dateFormatter(labels.at(-1)!.date)}</span>
        </div>
      )}
    </div>
  );
}
