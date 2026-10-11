"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { syncNowAction } from "@/server/actions/sync";

export function SyncButton({ lastSync }: { lastSync: string | null }) {
  const t = useTranslations("dashboard");
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      title={lastSync ?? undefined}
      onClick={() =>
        start(async () => {
          try {
            await syncNowAction();
            toast.success(t("syncQueued"));
          } catch {
            toast.error(t("syncFailed"));
          }
        })
      }
    >
      <RefreshCw className={pending ? "animate-spin" : ""} />
      {t("syncNow")}
    </Button>
  );
}
