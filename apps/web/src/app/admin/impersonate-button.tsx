"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function ImpersonateButton({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      title={`Se connecter en tant que ${name}`}
      onClick={async () => {
        setPending(true);
        const { error } = await authClient.admin.impersonateUser({ userId });
        setPending(false);
        if (error) {
          toast.error(error.message ?? "Impossible d'ouvrir la session");
          return;
        }
        router.replace("/tableau-de-bord");
        router.refresh();
      }}
    >
      <LogIn />
      Accéder au compte
    </Button>
  );
}
