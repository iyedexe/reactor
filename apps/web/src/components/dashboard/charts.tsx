"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtDate, fmtNumber, fmtRating } from "@/lib/format";

type Vars = Record<string, string>;
const NAMES = ["viz-1", "viz-2", "viz-3", "viz-4", "viz-5", "viz-6", "viz-7", "viz-8", "viz-pos", "viz-neg", "viz-neutral", "viz-grid", "viz-axis", "viz-muted"];

/** Reads the palette tokens from CSS so charts follow light/dark mode. */
function useViz(): Vars | null {
  const [vars, setVars] = useState<Vars | null>(null);
  useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(document.documentElement);
      setVars(Object.fromEntries(NAMES.map((n) => [n, cs.getPropertyValue(`--${n}`).trim()])));
    };
    read();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, []);
  return vars;
}

function useLoc() {
  return useLocale() === "en" ? "en-GB" : "fr-FR";
}

function ChartFrame({ height = 240, children, label }: { height?: number; children: React.ReactNode; label: string }) {
  return (
    <div role="img" aria-label={label} style={{ height }} className="w-full">
      {children}
    </div>
  );
}

const axisProps = (v: Vars) => ({
  stroke: v["viz-axis"],
  tick: { fill: v["viz-muted"], fontSize: 12 },
  tickLine: false,
  axisLine: { stroke: v["viz-axis"] },
});

function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          {r.color && <span className="inline-block size-2 rounded-full" style={{ background: r.color }} />}
          <span className="text-muted-foreground">{r.label}</span>
          <span className="ml-auto font-medium tabular-nums">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export interface SeriesPointProps {
  date: string;
  newReviews: number;
  avgStars: number | null;
  totalReviews: number;
  rating: number | null;
}

function bucketLabel(date: string, granularity: string, loc: string) {
  return granularity === "month" ? fmtDate(date, loc, { month: "short", year: "2-digit" }) : fmtDate(date, loc);
}

/** New reviews per bucket, with a marker on the day the client joined. */
export function ReviewsChart({ data, granularity, joinedAt }: { data: SeriesPointProps[]; granularity: string; joinedAt: string }) {
  const v = useViz();
  const t = useTranslations("dashboard.charts");
  const loc = useLoc();
  const joinedKey = joinedAt.slice(0, 10);
  const joinedBucket = [...data].reverse().find((p) => p.date <= joinedKey)?.date;
  if (!v) return <ChartFrame label={t("reviewsTitle")}>{null}</ChartFrame>;
  return (
    <ChartFrame label={t("reviewsTitle")}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 16, right: 8, left: -16, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke={v["viz-grid"]} />
          <XAxis dataKey="date" {...axisProps(v)} tickFormatter={(d) => bucketLabel(d, granularity, loc)} minTickGap={24} />
          <YAxis {...axisProps(v)} allowDecimals={false} axisLine={false} />
          <Tooltip
            cursor={{ fill: v["viz-grid"], opacity: 0.5 }}
            content={({ active, payload }) =>
              active && payload?.[0] ? (
                <TooltipBox
                  title={bucketLabel(String(payload[0].payload.date), granularity, loc)}
                  rows={[
                    { label: t("newReviews"), value: fmtNumber(payload[0].payload.newReviews, loc), color: v["viz-1"] },
                    { label: t("avgStars"), value: fmtRating(payload[0].payload.avgStars, loc) },
                  ]}
                />
              ) : null
            }
          />
          {joinedBucket && (
            <ReferenceLine x={joinedBucket} stroke={v["viz-muted"]} strokeDasharray="4 4" label={{ value: t("joined"), position: "top", fill: v["viz-muted"], fontSize: 11 }} />
          )}
          <Bar dataKey="newReviews" fill={v["viz-1"]} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** Overall rating over time (line; y-axis zoomed to the data, never outside 1–5). */
export function RatingChart({ data, granularity }: { data: SeriesPointProps[]; granularity: string }) {
  const v = useViz();
  const t = useTranslations("dashboard.charts");
  const loc = useLoc();
  const vals = data.map((p) => p.rating).filter((x): x is number => x != null);
  const min = vals.length ? Math.max(1, Math.floor((Math.min(...vals) - 0.15) * 10) / 10) : 1;
  const max = vals.length ? Math.min(5, Math.ceil((Math.max(...vals) + 0.15) * 10) / 10) : 5;
  if (!v) return <ChartFrame label={t("ratingTitle")}>{null}</ChartFrame>;
  return (
    <ChartFrame label={t("ratingTitle")}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 16, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={v["viz-grid"]} />
          <XAxis dataKey="date" {...axisProps(v)} tickFormatter={(d) => bucketLabel(d, granularity, loc)} minTickGap={24} />
          <YAxis {...axisProps(v)} domain={[min, max]} tickFormatter={(x) => fmtRating(x, loc)} axisLine={false} />
          <Tooltip
            cursor={{ stroke: v["viz-axis"] }}
            content={({ active, payload }) =>
              active && payload?.[0] ? (
                <TooltipBox
                  title={bucketLabel(String(payload[0].payload.date), granularity, loc)}
                  rows={[
                    { label: t("rating"), value: fmtRating(payload[0].payload.rating, loc), color: v["viz-1"] },
                    { label: t("totalReviews"), value: fmtNumber(payload[0].payload.totalReviews, loc) },
                  ]}
                />
              ) : null
            }
          />
          <Line type="monotone" dataKey="rating" stroke={v["viz-1"]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** Star distribution (5★ → 1★), one hue, counts labelled at the bar ends. */
export function DistributionChart({ data }: { data: { stars: number; count: number }[] }) {
  const v = useViz();
  const t = useTranslations("dashboard.charts");
  const loc = useLoc();
  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  return (
    <div role="img" aria-label={t("distributionTitle")} className="space-y-2">
      {data.map((d) => (
        <div key={d.stars} className="flex items-center gap-3 text-sm">
          <span className="w-8 shrink-0 tabular-nums text-muted-foreground">{d.stars} ★</span>
          <div className="h-3 flex-1 rounded-full bg-muted">
            <div className="h-3 rounded-full" style={{ width: `${(d.count / total) * 100}%`, background: v?.["viz-1"] ?? "transparent", minWidth: d.count ? 4 : 0 }} />
          </div>
          <span className="w-10 shrink-0 text-right tabular-nums">{fmtNumber(d.count, loc)}</span>
        </div>
      ))}
    </div>
  );
}

/** Topics: positive mentions to the right (blue), negative to the left (red); neutral in the tooltip. */
export function TopicsChart({ data }: { data: { topic: string; positive: number; neutral: number; negative: number }[] }) {
  const v = useViz();
  const t = useTranslations("dashboard.charts");
  const tt = useTranslations("topics");
  const loc = useLoc();
  const rows = data.slice(0, 8).map((d) => ({ ...d, label: tt(d.topic), neg: -d.negative }));
  if (!v) return <ChartFrame label={t("topicsTitle")}>{null}</ChartFrame>;
  return (
    <ChartFrame label={t("topicsTitle")} height={Math.max(160, rows.length * 34 + 48)}>
      <ResponsiveContainer>
        <BarChart data={rows} layout="vertical" stackOffset="sign" margin={{ top: 0, right: 16, left: 8, bottom: 0 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke={v["viz-grid"]} />
          <XAxis type="number" {...axisProps(v)} tickFormatter={(x) => fmtNumber(Math.abs(x), loc)} allowDecimals={false} />
          <YAxis type="category" dataKey="label" {...axisProps(v)} width={110} axisLine={false} />
          <ReferenceLine x={0} stroke={v["viz-axis"]} />
          <Tooltip
            cursor={{ fill: v["viz-grid"], opacity: 0.5 }}
            content={({ active, payload }) =>
              active && payload?.[0] ? (
                <TooltipBox
                  title={String(payload[0].payload.label)}
                  rows={[
                    { label: t("positive"), value: fmtNumber(payload[0].payload.positive, loc), color: v["viz-pos"] },
                    { label: t("neutral"), value: fmtNumber(payload[0].payload.neutral, loc), color: v["viz-neutral"] },
                    { label: t("negative"), value: fmtNumber(payload[0].payload.negative, loc), color: v["viz-neg"] },
                  ]}
                />
              ) : null
            }
          />
          <Legend verticalAlign="top" height={28} iconType="circle" formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>} />
          <Bar dataKey="neg" name={t("negative")} stackId="s" fill={v["viz-neg"]} radius={[4, 0, 0, 4]} maxBarSize={18} />
          <Bar dataKey="positive" name={t("positive")} stackId="s" fill={v["viz-pos"]} radius={[0, 4, 4, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** Rating over time: the business vs its tracked competitors (one location). */
export function CompetitorChart({ own, competitors }: {
  own: { name: string; series: { date: string; rating: number | null }[] };
  competitors: { id: string; name: string; series: { date: string; rating: number }[] }[];
}) {
  const v = useViz();
  const t = useTranslations("dashboard.charts");
  const loc = useLoc();
  const dates = [...new Set(competitors.flatMap((c) => c.series.map((s) => s.date)))].sort();
  const ownByDate = new Map(own.series.map((s) => [s.date, s.rating]));
  const lastOwn = (d: string) => {
    let val: number | null = null;
    for (const s of own.series) if (s.date <= d && s.rating != null) val = s.rating;
    return ownByDate.get(d) ?? val;
  };
  const data = dates.map((d) => ({
    date: d,
    own: lastOwn(d),
    ...Object.fromEntries(competitors.map((c) => [c.id, c.series.find((s) => s.date === d)?.rating ?? null])),
  }));
  if (!v || data.length < 2) return null;
  const colors = ["viz-2", "viz-3", "viz-4", "viz-5", "viz-7"];
  return (
    <ChartFrame label={t("competitorsTitle")} height={260}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={v["viz-grid"]} />
          <XAxis dataKey="date" {...axisProps(v)} tickFormatter={(d) => fmtDate(d, loc, { day: "numeric", month: "short" })} minTickGap={48} />
          <YAxis {...axisProps(v)} domain={["dataMin - 0.1", "dataMax + 0.1"]} tickFormatter={(x) => fmtRating(x, loc)} axisLine={false} />
          <Tooltip
            cursor={{ stroke: v["viz-axis"] }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipBox
                  title={fmtDate(String(label), loc, { day: "numeric", month: "short", year: "numeric" })}
                  rows={payload.map((p) => ({ label: String(p.name), value: fmtRating(p.value as number, loc), color: String(p.color) }))}
                />
              ) : null
            }
          />
          <Legend verticalAlign="top" height={32} iconType="plainline" formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>} />
          <Line dataKey="own" name={own.name} stroke={v["viz-1"]} strokeWidth={3} dot={false} connectNulls />
          {competitors.map((c, i) => (
            <Line key={c.id} dataKey={c.id} name={c.name} stroke={v[colors[i % colors.length]!]} strokeWidth={2} dot={false} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
