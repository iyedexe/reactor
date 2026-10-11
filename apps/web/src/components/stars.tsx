import { Star } from "lucide-react";

export function Stars({ value, label }: { value: number; label?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={label ?? `${value}/5`} role="img">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={i <= value ? "size-3.5 fill-star text-star" : "size-3.5 text-muted-foreground/30"} aria-hidden />
      ))}
    </span>
  );
}
