import { useState, type FormEvent } from "react";
import { useStore } from "../state/store";
import { Button, Field, inputClass } from "./ui";

export function Auth() {
  const { signIn, signUp } = useStore();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setInfo(null);
    try {
      if (mode === "in") {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password, displayName.trim() || email.split("@")[0]);
        setInfo(
          "Compte créé. Si Supabase demande une confirmation par e-mail, valide le lien reçu avant de te connecter.",
        );
        setMode("in");
      }
    } catch {
      /* le message d'erreur est affiché par le bandeau global */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-full place-items-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-3 text-5xl">🧊</div>
          <h1 className="text-2xl font-bold text-slate-900">Le Frigo</h1>
          <p className="mt-1 text-sm text-slate-500">
            Ce qu'il reste à la maison, à jour pour vous deux.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-3xl bg-white p-6 shadow-xl shadow-slate-200/60">
          {mode === "up" && (
            <Field label="Ton prénom">
              <input
                className={inputClass}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Anthony"
                autoComplete="given-name"
              />
            </Field>
          )}

          <Field label="Adresse e-mail">
            <input
              className={inputClass}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="toi@exemple.fr"
              autoComplete="email"
            />
          </Field>

          <Field label="Mot de passe" hint={mode === "up" ? "8 caractères minimum." : undefined}>
            <input
              className={inputClass}
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "in" ? "current-password" : "new-password"}
            />
          </Field>

          {info && (
            <p className="rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-800">{info}</p>
          )}

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Un instant…" : mode === "in" ? "Se connecter" : "Créer le compte"}
          </Button>

          <button
            type="button"
            onClick={() => setMode(mode === "in" ? "up" : "in")}
            className="w-full text-sm text-slate-500 transition hover:text-teal-700"
          >
            {mode === "in" ? "Pas encore de compte ? En créer un" : "J'ai déjà un compte"}
          </button>
        </form>
      </div>
    </div>
  );
}
