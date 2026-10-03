import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetForm } from "./reset-form";

export default async function ResetPasswordPage({ searchParams }: PageProps<"/mot-de-passe/nouveau">) {
  const [{ token, error }, t] = await Promise.all([searchParams, getTranslations("auth")]);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("resetTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        {typeof token === "string" && !error ? <ResetForm token={token} /> : <p className="text-sm text-destructive">{t("resetInvalid")}</p>}
      </CardContent>
    </Card>
  );
}
