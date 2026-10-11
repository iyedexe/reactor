"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { assignStandAction, createStandsAction, setStandActiveAction, unassignStandAction } from "@/server/actions/stands";

type Loc = { id: string; name: string; organization: string };

export function StandRowActions({ stand, locations }: { stand: { id: string; status: string; locationId: string | null; label: string | null }; locations: Loc[] }) {
  const [pending, start] = useTransition();
  const [assigning, setAssigning] = useState(false);
  const [locationId, setLocationId] = useState(stand.locationId ?? "");
  const [label, setLabel] = useState(stand.label ?? "");
  const act = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error);
      else {
        if (r.message) toast.success(r.message);
        setAssigning(false);
      }
    });

  if (assigning) {
    return (
      <form
        className="flex flex-wrap items-center justify-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          act(() => assignStandAction({ standId: stand.id, locationId, label }));
        }}
      >
        <select required aria-label="Établissement" className="h-8 max-w-56 rounded-md border bg-background px-2 text-sm" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          <option value="">Établissement…</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.organization} – {l.name}
            </option>
          ))}
        </select>
        <Input aria-label="Libellé" placeholder="Libellé (ex. Comptoir)" className="h-8 w-40" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Button size="sm" type="submit" disabled={pending}>
          Valider
        </Button>
        <Button size="sm" type="button" variant="ghost" onClick={() => setAssigning(false)}>
          Annuler
        </Button>
      </form>
    );
  }
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => setAssigning(true)}>
        {stand.locationId ? "Réassigner" : "Assigner"}
      </Button>
      {stand.status === "ACTIVE" && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => setStandActiveAction(stand.id, false))}>
          Désactiver
        </Button>
      )}
      {stand.status === "INACTIVE" && stand.locationId && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => setStandActiveAction(stand.id, true))}>
          Réactiver
        </Button>
      )}
      {stand.locationId && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => unassignStandAction(stand.id))}>
          Remettre en stock
        </Button>
      )}
    </div>
  );
}

export function CreateStandsForm() {
  const [count, setCount] = useState(10);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createStandsAction(count);
          if (r.ok) toast.success(r.message);
          else toast.error(r.error);
        });
      }}
    >
      <Input type="number" min={1} max={500} value={count} onChange={(e) => setCount(Number(e.target.value))} className="h-9 w-24" aria-label="Nombre de supports" />
      <Button type="submit" disabled={pending}>
        Créer des supports
      </Button>
    </form>
  );
}
