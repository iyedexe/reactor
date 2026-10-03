"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { systemDb } from "@avis/db/system";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { ORG_COOKIE, requireUser } from "../session";

const YEAR = 60 * 60 * 24 * 365;

export async function setLocaleAction(locale: string) {
  if (!isLocale(locale)) return;
  const session = await requireUser();
  (await cookies()).set(LOCALE_COOKIE, locale, { maxAge: YEAR, sameSite: "lax", path: "/" });
  await systemDb().user.update({ where: { id: session.user.id }, data: { locale } });
  revalidatePath("/", "layout");
}

/** Switches the active organization; only organizations the user is a member of are accepted. */
export async function setOrganizationAction(organizationId: string) {
  const session = await requireUser();
  const member = await systemDb().member.findUnique({
    where: { organizationId_userId: { organizationId, userId: session.user.id } },
  });
  if (!member) return;
  (await cookies()).set(ORG_COOKIE, organizationId, { maxAge: YEAR, sameSite: "lax", path: "/", httpOnly: true });
  revalidatePath("/", "layout");
}
