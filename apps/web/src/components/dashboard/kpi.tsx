import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Stat tile: label, hero value, and the change vs the previous period. The delta carries an arrow icon and
 * text (never color alone); color says whether the change is good for the business.
 */
export function KpiTile({ label, value, delta, deltaLabel, goodWhen = "up", hint }: {
  label: string;
  value: string;
  delta?: number | null;
  deltaLabel?: string;
  goodWhen?: "up" | "down";
  hint?: string;
}) {
  const dir = delta == null || Math.abs(delta) < 1e-9 ? 0 : delta > 0 ? 1 : -1;
  const good = dir !== 0 && (goodWhen === "up" ? dir > 0 : dir < 0);
  const Icon = dir > 0 ? ArrowUpRight : dir < 0 ? ArrowDownRight : Minus;
  return (
    <Card className="gap-1 px-5 py-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-3xl font-semibold tracking-tight">{value}</div>
      {deltaLabel && (
        <div
          className={cn(
            "flex items-center gap-1 text-xs font-medium",
            dir === 0 ? "text-muted-foreground" : good ? "text-[var(--viz-good-text)]" : "text-[var(--viz-bad-text)]",
          )}
        >
          <Icon className="size-3.5" aria-hidden />
          {deltaLabel}
        </div>
      )}
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}
