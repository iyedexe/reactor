import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LayoutDashboard, Shield, Star } from "lucide-react";
import { ImpersonationBanner } from "./impersonation-banner";
import { NavLink } from "./nav-link";
import { UserMenu } from "./user-menu";

export interface ShellProps {
  children: React.ReactNode;
  user: { name: string; email: string };
  organization?: { id: string; name: string };
  memberships?: { organizationId: string; name: string }[];
  impersonating?: boolean;
  isAdmin?: boolean;
  nav?: React.ReactNode;
}

export async function AppShell(props: ShellProps) {
  const t = await getTranslations("nav");
  return (
    <div className="flex min-h-screen flex-col">
      {props.impersonating && <ImpersonationBanner name={props.user.name} />}
      <div className="flex flex-1">
        <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
          <Link href="/" className="flex h-14 items-center gap-2 border-b px-5 font-semibold">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Star className="size-4 fill-current" />
            </span>
            AvisBoost
          </Link>
          <nav className="flex flex-1 flex-col gap-1 p-3">
            {props.nav ?? (
              <NavLink href="/tableau-de-bord">
                <LayoutDashboard />
                {t("dashboard")}
              </NavLink>
            )}
            {props.isAdmin && !props.impersonating && (
              <NavLink href="/admin">
                <Shield />
                {t("admin")}
              </NavLink>
            )}
          </nav>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center justify-between border-b bg-background px-4 md:px-6">
            <div className="truncate text-sm font-medium text-muted-foreground">{props.organization?.name}</div>
            <UserMenu {...props.user} organizationId={props.organization?.id} memberships={props.memberships} />
          </header>
          <main className="flex-1 p-4 md:p-6">{props.children}</main>
        </div>
      </div>
    </div>
  );
}
