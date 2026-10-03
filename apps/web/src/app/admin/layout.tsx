import { getTranslations } from "next-intl/server";
import { Users } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { NavLink } from "@/components/shell/nav-link";
import { requirePlatformAdmin } from "@/server/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePlatformAdmin();
  const t = await getTranslations("nav");
  return (
    <AppShell
      user={{ name: session.user.name, email: session.user.email }}
      organization={{ id: "", name: t("admin") }}
      isAdmin={false}
      nav={
        <NavLink href="/admin">
          <Users />
          {t("clients")}
        </NavLink>
      }
    >
      {children}
    </AppShell>
  );
}
