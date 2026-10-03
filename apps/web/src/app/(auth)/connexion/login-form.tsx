"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authClient } from "@/lib/auth-client";

export function LoginForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const { error } = await authClient.signIn.email({ email, password });
    setPending(false);
    if (error) {
      toast.error(t("invalid"));
      return;
    }
    router.replace("/tableau-de-bord");
    router.refresh();
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    await authClient.signIn.magicLink({ email, callbackURL: "/tableau-de-bord" });
    setPending(false);
    setInfo(t("magicSent", { email }));
  }

  async function forgotPassword() {
    if (!email) return;
    setPending(true);
    await authClient.requestPasswordReset({ email, redirectTo: "/mot-de-passe/nouveau" });
    setPending(false);
    setInfo(t("forgotSent", { email }));
  }

  const emailField = (
    <div className="space-y-2">
      <Label htmlFor="email">{t("email")}</Label>
      <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
    </div>
  );

  return (
    <Tabs defaultValue="password">
      <TabsList className="w-full">
        <TabsTrigger value="password">{t("tabPassword")}</TabsTrigger>
        <TabsTrigger value="magic">{t("tabMagic")}</TabsTrigger>
      </TabsList>
      {info && <p className="rounded-md bg-muted p-3 text-sm">{info}</p>}
      <TabsContent value="password">
        <form onSubmit={signInWithPassword} className="space-y-4 pt-2">
          {emailField}
          <div className="space-y-2">
            <Label htmlFor="password">{t("password")}</Label>
            <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {t("signIn")}
          </Button>
          <button type="button" onClick={forgotPassword} className="w-full text-center text-sm text-muted-foreground hover:underline" disabled={pending}>
            {t("forgot")}
          </button>
        </form>
      </TabsContent>
      <TabsContent value="magic">
        <form onSubmit={sendMagicLink} className="space-y-4 pt-2">
          <p className="text-sm text-muted-foreground">{t("magicHelp")}</p>
          {emailField}
          <Button type="submit" className="w-full" disabled={pending}>
            {t("sendMagic")}
          </Button>
        </form>
      </TabsContent>
    </Tabs>
  );
}
