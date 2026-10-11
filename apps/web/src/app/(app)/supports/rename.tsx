"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { renameStandAction } from "@/server/actions/stands";

export function RenameStand({ id, label }: { id: string; label: string }) {
  const t = useTranslations("stands");
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(label);
  const [pending, start] = useTransition();
  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1">
        {label}
        <Button size="icon" variant="ghost" className="size-7" aria-label={t("rename")} onClick={() => setEditing(true)}>
          <Pencil className="size-3.5" />
        </Button>
      </span>
    );
  }
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          await renameStandAction(id, value);
          setEditing(false);
        });
      }}
    >
      <Input className="h-8 w-44" value={value} maxLength={60} onChange={(e) => setValue(e.target.value)} autoFocus />
      <Button size="sm" type="submit" disabled={pending}>
        {t("save")}
      </Button>
    </form>
  );
}
