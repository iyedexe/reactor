import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Pagination({ page, pages, href, labels }: { page: number; pages: number; href: (p: number) => string; labels: { prev: string; next: string; of: string } }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <Button asChild variant="outline" size="sm" className={page <= 1 ? "pointer-events-none opacity-50" : ""}>
        <Link href={href(page - 1)} aria-disabled={page <= 1}>{labels.prev}</Link>
      </Button>
      <span className="text-muted-foreground">{labels.of}</span>
      <Button asChild variant="outline" size="sm" className={page >= pages ? "pointer-events-none opacity-50" : ""}>
        <Link href={href(page + 1)} aria-disabled={page >= pages}>{labels.next}</Link>
      </Button>
    </div>
  );
}
