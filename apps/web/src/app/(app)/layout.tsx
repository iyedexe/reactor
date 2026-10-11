import { getTranslations } from "next-intl/server";
import { Inbox, LayoutDashboard, MessageSquareText } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { NavLink } from "@/components/shell/nav-link";
import { getSession, isPlatformAdmin, requireTenant } from "@/server/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [t, session] = await Promise.all([requireTenant(), getSession()]);
  const [tn, unread] = await Promise.all([getTranslations("nav"), t.db.privateFeedback.count({ where: { status: "NEW" } })]);
  return (
    <AppShell
      user={t.user}
      organization={t.organization}
      memberships={t.memberships}
      impersonating={!!t.impersonatorId}
      isAdmin={!!session && isPlatformAdmin(session.user)}
      nav={
        <>
          <NavLink href="/tableau-de-bord">
            <LayoutDashboard />
            {tn("dashboard")}
          </NavLink>
          <NavLink href="/avis">
            <MessageSquareText />
            {tn("reviews")}
          </NavLink>
          <NavLink href="/messages-prives">
            <Inbox />
            <span className="flex-1">{tn("feedback")}</span>
            {unread > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{unread}</span>}
          </NavLink>
        </>
      }
    >
      {children}
    </AppShell>
  );
}
