"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function ImpersonationBanner({ name }: { name: string }) {
  const t = useTranslations("impersonation");
  const router = useRouter();
  return (
    <div className="flex items-center justify-center gap-3 bg-warning px-4 py-2 text-sm font-medium text-black">
      {t("banner", { name })}
      <Button
        size="sm"
        variant="outline"
        className="h-7 bg-white/80"
        onClick={async () => {
          await authClient.admin.stopImpersonating();
          router.replace("/admin");
          router.refresh();
        }}
      >
        {t("stop")}
      </Button>
    </div>
  );
}
