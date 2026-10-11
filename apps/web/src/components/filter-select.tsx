"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** A <select> bound to one URL search param (resets pagination). */
export function FilterSelect({ name, value, options, label }: { name: string; value: string; options: { value: string; label: string }[]; label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <select
      aria-label={label}
      className="h-9 rounded-md border bg-background px-3 text-sm shadow-xs"
      value={value}
      onChange={(e) => {
        const next = new URLSearchParams(params.toString());
        if (e.target.value) next.set(name, e.target.value);
        else next.delete(name);
        next.delete("page");
        router.push(`${pathname}?${next.toString()}`);
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
