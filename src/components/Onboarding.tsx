import { useState, type FormEvent } from "react";
import { useStore } from "../state/store";
import { Button, Field, inputClass } from "./ui";

export function Onboarding() {
  const { createHousehold, joinHousehold, signOut, session } = useStore();
  const [tab, setTab] = useState<"create" | "join">("create");
  const [name, setName] = useState("Notre frigo");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (tab === "create") await createHousehold(name);
      else await joinHousehold(code);
    } catch {
      /* message affiché par le bandeau global */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-full place-items-center p-6">
      <div className="w-full max-w-md">
        <h1 className="mb-2 text-center text-2xl font-bold text-slate-900">Un dernier réglage</h1>
        <p className="mb-6 text-center text-sm text-slate-500">
          Le premier de vous deux crée le frigo, l'autre le rejoint avec le code.
        </p>

        <div className="mb-4 grid grid-cols-2 gap-1 rounded-2xl bg-slate-200/70 p-1">
          {(
            [
              ["create", "Créer le frigo"],
              ["join", "Rejoindre"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                tab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-3xl bg-white p-6 shadow-xl shadow-slate-200/60">
          {tab === "create" ? (
            <Field label="Nom du frigo" hint="Tu pourras inviter ta copine juste après.">
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
          ) : (
            <Field label="Code d'invitation" hint="Six caractères, transmis par la personne qui a créé le frigo.">
              <input
                className={`${inputClass} text-center text-2xl font-bold tracking-[0.4em] uppercase`}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={6}
                required
              />
            </Field>
          )}

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Un instant…" : tab === "create" ? "Créer le frigo" : "Rejoindre le frigo"}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          Connecté en tant que {session?.user.email}.{" "}
          <button onClick={() => void signOut()} className="font-semibold text-slate-700 underline">
            Se déconnecter
          </button>
        </p>
      </div>
    </div>
  );
}
