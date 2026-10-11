import type { Metadata } from "next";
import { lookupUnsubscribe, optOutByToken } from "@avis/services";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Désinscription", robots: { index: false } };

/** Public opt-out page linked from every review request (e-mail footer, SMS "STOP" line). */
export default async function UnsubscribePage({ params, searchParams }: PageProps<"/u/[token]">) {
  const { token } = await params;
  const { ok } = await searchParams;
  const info = await lookupUnsubscribe(token);

  async function confirm() {
    "use server";
    await optOutByToken(token);
    const { redirect } = await import("next/navigation");
    redirect(`/u/${token}?ok=1`);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{ok ? "C'est noté" : "Ne plus recevoir de messages"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {!info ? (
            <p>Ce lien n'est pas valide.</p>
          ) : ok ? (
            <p>
              Vous ne recevrez plus de {info.channel === "SMS" ? "SMS" : "messages"} de la part de <strong>{info.businessName}</strong>.
            </p>
          ) : (
            <>
              <p>
                Vous ne recevrez plus de demandes d'avis par {info.channel === "SMS" ? "SMS" : "e-mail"} de la part de <strong>{info.businessName}</strong>.
              </p>
              <form action={confirm}>
                <Button type="submit" className="w-full">
                  Me désinscrire
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
