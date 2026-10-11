"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const PERIODS = ["30j", "90j", "12m", "tout"] as const;

/** One row of filters above the charts: location (when several) and period. State lives in the URL. */
export function DashboardFilters({ locations, locationId, period, showPeriod = true }: {
  locations: { id: string; name: string }[];
  locationId: string | null;
  period?: string;
  showPeriod?: boolean;
}) {
  const t = useTranslations("filters");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  function set(name: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(name, value);
    else next.delete(name);
    next.delete("page");
    start(() => router.push(`${pathname}?${next.toString()}`));
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", pending && "opacity-60")}>
      {locations.length > 1 && (
        <select
          aria-label={t("location")}
          className="h-9 rounded-md border bg-background px-3 text-sm shadow-xs"
          value={locationId ?? ""}
          onChange={(e) => set("lieu", e.target.value || null)}
        >
          <option value="">{t("allLocations")}</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      )}
      {showPeriod && (
        <div role="radiogroup" aria-label={t("period")} className="inline-flex h-9 items-center rounded-lg bg-muted p-[3px]">
          {PERIODS.map((p) => (
            <button
              key={p}
              role="radio"
              aria-checked={period === p}
              onClick={() => set("periode", p)}
              className={cn(
                "h-full rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors cursor-pointer",
                period === p && "bg-background text-foreground shadow-sm",
              )}
            >
              {t(`periods.${p}`)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
