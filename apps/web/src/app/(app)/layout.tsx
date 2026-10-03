import { AppShell } from "@/components/shell/app-shell";
import { getSession, isPlatformAdmin, requireTenant } from "@/server/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [t, session] = await Promise.all([requireTenant(), getSession()]);
  return (
    <AppShell
      user={t.user}
      organization={t.organization}
      memberships={t.memberships}
      impersonating={!!t.impersonatorId}
      isAdmin={!!session && isPlatformAdmin(session.user)}
    >
      {children}
    </AppShell>
  );
}
