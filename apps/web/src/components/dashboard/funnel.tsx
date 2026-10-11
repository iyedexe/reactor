import { fmtNumber, fmtPct } from "@/lib/format";

/** Ordinal funnel: stage bars on a single-hue ramp (darker = further down the funnel), with step conversion. */
export function Funnel({ steps, locale }: { steps: { label: string; value: number; note?: string }[]; locale: string }) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  const ramp = ["var(--viz-seq-250)", "var(--viz-seq-350)", "var(--viz-seq-450)", "var(--viz-seq-550)"];
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1]!.value : null;
        return (
          <li key={s.label} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span>{s.label}</span>
              <span className="tabular-nums">
                <span className="font-semibold">{fmtNumber(s.value, locale)}</span>
                {prev ? <span className="ml-2 text-xs text-muted-foreground">{fmtPct(prev ? s.value / prev : null, locale)}</span> : null}
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-muted">
              <div className="h-2.5 rounded-full" style={{ width: `${(s.value / max) * 100}%`, background: ramp[Math.min(i, ramp.length - 1)], minWidth: s.value ? 4 : 0 }} />
            </div>
            {s.note && <div className="text-xs text-muted-foreground">{s.note}</div>}
          </li>
        );
      })}
    </ol>
  );
}
