import type { ChartView } from "./metric-chart";

export type PeriodOption = { label: string; points?: number };

export function PeriodSelect({ value, options, onChange, accentText }: { value: string; options: PeriodOption[]; onChange: (option: PeriodOption) => void; accentText?: string }) {
  return (
    <select
      aria-label="Chart period"
      value={value}
      onChange={(event) => {
        const option = options.find((item) => item.label === event.target.value);
        if (option) onChange(option);
      }}
      className="pointer-events-auto cursor-pointer appearance-none border-0 bg-transparent py-1 pl-1 pr-4 text-xs font-medium outline-none"
      style={{ color: accentText }}
    >
      {options.map((option) => <option key={option.label} value={option.label}>{option.label}</option>)}
    </select>
  );
}

export function ViewToggle({ value, onChange }: { value: ChartView; onChange: (view: ChartView) => void }) {
  return (
    <div className="pointer-events-auto inline-flex rounded-md border border-border/70 bg-background/70 p-0.5" aria-label="Chart style">
      {(["curve", "bars"] as ChartView[]).map((view) => (
        <button
          key={view}
          type="button"
          aria-label={`${view === "curve" ? "Line" : "Bar"} chart`}
          aria-pressed={value === view}
          onClick={() => onChange(view)}
          className={`h-5 w-5 rounded text-[10px] font-bold transition-colors ${value === view ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          {view === "curve" ? "∿" : "▥"}
        </button>
      ))}
    </div>
  );
}
