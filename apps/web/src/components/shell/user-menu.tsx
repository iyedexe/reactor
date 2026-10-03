"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Building2, Check, Languages, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { setLocaleAction, setOrganizationAction } from "@/server/actions/preferences";

export function UserMenu(props: {
  name: string;
  email: string;
  organizationId?: string;
  memberships?: { organizationId: string; name: string }[];
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const initials = props.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 px-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials}</span>
          <span className="hidden text-sm sm:inline">{props.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <div className="font-medium">{props.name}</div>
          <div className="text-xs font-normal text-muted-foreground">{props.email}</div>
        </DropdownMenuLabel>
        {props.memberships && props.memberships.length > 1 && (
          <>
            <DropdownMenuSeparator />
            {props.memberships.map((m) => (
              <DropdownMenuItem key={m.organizationId} onSelect={() => startTransition(() => setOrganizationAction(m.organizationId))}>
                <Building2 />
                <span className="flex-1">{m.name}</span>
                {m.organizationId === props.organizationId && <Check />}
              </DropdownMenuItem>
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        {(["fr", "en"] as const).map((l) => (
          <DropdownMenuItem key={l} onSelect={() => startTransition(() => setLocaleAction(l))}>
            <Languages />
            <span className="flex-1">{t(`common.languages.${l}`)}</span>
            {l === locale && <Check />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await authClient.signOut();
            router.replace("/connexion");
            router.refresh();
          }}
        >
          <LogOut />
          {t("auth.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
