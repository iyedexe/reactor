"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Archive, Check, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setFeedbackStatusAction } from "@/server/actions/feedback";

export function FeedbackActions({ id, status }: { id: string; status: "NEW" | "READ" | "ARCHIVED" }) {
  const t = useTranslations("feedback");
  const [pending, start] = useTransition();
  const set = (s: "NEW" | "READ" | "ARCHIVED") => start(() => setFeedbackStatusAction({ id, status: s }));
  return (
    <div className="flex gap-1">
      {status === "NEW" && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => set("READ")}>
          <Check />
          {t("markRead")}
        </Button>
      )}
      {status !== "ARCHIVED" ? (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => set("ARCHIVED")}>
          <Archive />
          {t("archive")}
        </Button>
      ) : (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => set("READ")}>
          <Undo2 />
          {t("restore")}
        </Button>
      )}
    </div>
  );
}
