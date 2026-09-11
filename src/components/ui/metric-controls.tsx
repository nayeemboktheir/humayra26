import { BarChart3, ChartNoAxesCombined } from "lucide-react";
import type { ChartView } from "./metric-chart";

export type PeriodOption = { label: string; points?: number };

export function PeriodSelect({ value, options, onChange, accentText }: { value: string; options: PeriodOption[]; onChange: (option: PeriodOption) => void; accentText?: string }) {
  return (
    <div className="pointer-events-auto inline-flex rounded-lg border border-border/70 bg-background/90 p-1 shadow-sm" aria-label="Chart period">
      {options.map((option) => {
        const selected = option.label === value;
        return (
          <button
            key={option.label}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option)}
            className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${selected ? "bg-muted text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            style={selected ? { color: accentText } : undefined}
          >
            {option.label.replace("Past ", "")}
          </button>
        );
      })}
    </div>
  );
}

export function ViewToggle({ value, onChange }: { value: ChartView; onChange: (view: ChartView) => void }) {
  return (
    <div className="pointer-events-auto inline-flex rounded-lg border border-border/70 bg-background/90 p-1 shadow-sm" aria-label="Chart style">
      <button type="button" aria-label="Line chart" aria-pressed={value === "curve"} onClick={() => onChange("curve")} className={`grid h-6 w-6 place-items-center rounded-md transition-colors ${value === "curve" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><ChartNoAxesCombined className="h-3.5 w-3.5" /></button>
      <button type="button" aria-label="Bar chart" aria-pressed={value === "bars"} onClick={() => onChange("bars")} className={`grid h-6 w-6 place-items-center rounded-md transition-colors ${value === "bars" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><BarChart3 className="h-3.5 w-3.5" /></button>
    </div>
  );
}
