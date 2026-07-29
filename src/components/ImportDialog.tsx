import { useEffect, useMemo, useState } from "react";
import { useStore, type ImportSummary } from "../state/store";
import { parseImport, resolveImport, type ImportAction } from "../lib/importText";
import { Button, Modal } from "./ui";

const EXAMPLE = `# Une ligne par produit, seul le nom est obligatoire.
# nom | quantité | catégorie | péremption | description | code-barres

[Légumes]
Batavia | 1
Poivrons bicolores bio x2 !2026-08-06

[Boissons]
Tropico Orange Ananas | 2 | Boissons | | Pack de 2 | 5449000335579`;

function Badge({ action }: { action: ImportAction }) {
  if (action.kind === "invalid") {
    return (
      <span className="shrink-0 rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">
        ignorée
      </span>
    );
  }
  if (action.kind === "create") {
    return (
      <span className="shrink-0 rounded-md bg-teal-100 px-2 py-0.5 text-[11px] font-bold text-teal-800">
        nouveau
      </span>
    );
  }
  return (
    <span
      className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold ${
        action.alreadyInFridge ? "bg-sky-100 text-sky-800" : "bg-amber-100 text-amber-800"
      }`}
    >
      {action.alreadyInFridge ? "déjà au frigo" : "retour au frigo"}
    </span>
  );
}

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { products, categories, items, importRows } = useStore();
  const [text, setText] = useState("");
  const [withImages, setWithImages] = useState(true);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  useEffect(() => {
    if (!open) return;
    setText("");
    setSummary(null);
    setBusy(false);
  }, [open]);

  const actions = useMemo(() => {
    if (!text.trim()) return [];
    const stocked = new Set(items.map((item) => item.product_id));
    return resolveImport(parseImport(text), products, categories, stocked);
  }, [text, products, categories, items]);

  const counts = useMemo(
    () => ({
      create: actions.filter((action) => action.kind === "create").length,
      increase: actions.filter((action) => action.kind === "increase").length,
      invalid: actions.filter((action) => action.kind === "invalid").length,
      codes: actions.filter((action) => action.kind === "create" && action.line.code).length,
    }),
    [actions],
  );

  const usable = counts.create + counts.increase;

  const readFile = async (file: File) => {
    try {
      setText(await file.text());
    } catch {
      setText("");
    }
  };

  const apply = async () => {
    setBusy(true);
    try {
      setSummary(await importRows(actions, withImages));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Importer une liste de courses"
      footer={
        summary ? (
          <Button onClick={onClose}>Terminé</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Annuler
            </Button>
            <Button onClick={() => void apply()} disabled={busy || usable === 0}>
              {busy
                ? "Import en cours…"
                : `Importer ${usable} produit${usable > 1 ? "s" : ""}`}
            </Button>
          </>
        )
      }
    >
      {summary ? (
        <div className="space-y-3 py-4 text-center">
          <div className="text-4xl">🧊</div>
          <p className="text-lg font-semibold text-slate-900">Import terminé</p>
          <p className="text-sm text-slate-600">
            {summary.created} produit{summary.created > 1 ? "s" : ""} créé
            {summary.created > 1 ? "s" : ""}, {summary.increased} réapprovisionné
            {summary.increased > 1 ? "s" : ""}
            {summary.images > 0 && `, ${summary.images} photo${summary.images > 1 ? "s" : ""} récupérée${summary.images > 1 ? "s" : ""}`}
            .
          </p>
          {summary.failures.length > 0 && (
            <ul className="mx-auto max-w-md space-y-1 rounded-xl bg-rose-50 p-3 text-left text-xs text-rose-700">
              {summary.failures.map((failure, index) => (
                <li key={index}>{failure}</li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200">
              Choisir un fichier .txt
              <input
                type="file"
                accept=".txt,text/plain"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void readFile(file);
                }}
              />
            </label>
            <span className="text-sm text-slate-500">ou colle le contenu ci-dessous.</span>
          </div>

          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={10}
            spellCheck={false}
            placeholder={EXAMPLE}
            className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10"
          />

          {actions.length > 0 && (
            <>
              <div className="flex flex-wrap gap-3 text-sm text-slate-600">
                <span>
                  <strong className="text-teal-700">{counts.create}</strong> à créer
                </span>
                <span>
                  <strong className="text-sky-700">{counts.increase}</strong> à réapprovisionner
                </span>
                {counts.invalid > 0 && (
                  <span>
                    <strong className="text-rose-600">{counts.invalid}</strong> ignorée
                    {counts.invalid > 1 ? "s" : ""}
                  </span>
                )}
              </div>

              <ul className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2 scrollbar-slim">
                {actions.map((action, index) => (
                  <li
                    key={index}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"
                  >
                    <Badge action={action} />
                    <span className="min-w-0 flex-1 truncate text-slate-800">
                      {action.line.name || action.line.raw}
                    </span>
                    {action.kind === "invalid" ? (
                      <span className="shrink-0 text-xs text-rose-600">{action.line.error}</span>
                    ) : (
                      <span className="shrink-0 text-xs text-slate-500">
                        ×{action.line.quantity}
                        {action.kind === "create" && action.category && ` · ${action.category.name}`}
                        {action.line.expiresOn && ` · ${action.line.expiresOn}`}
                      </span>
                    )}
                  </li>
                ))}
              </ul>

              {counts.codes > 0 && (
                <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-3">
                  <input
                    type="checkbox"
                    checked={withImages}
                    onChange={(event) => setWithImages(event.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-teal-600"
                  />
                  <span className="text-sm text-slate-700">
                    <span className="font-semibold">
                      Chercher les photos par code-barres ({counts.codes} disponible
                      {counts.codes > 1 ? "s" : ""})
                    </span>
                    <span className="block text-xs text-slate-500">
                      Les photos proviennent de la base ouverte Open Food Facts. L'import est un
                      peu plus long, et les produits introuvables gardent simplement l'emoji de
                      leur catégorie.
                    </span>
                  </span>
                </label>
              )}
            </>
          )}

          <details className="rounded-xl bg-slate-50 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">
              Format attendu
            </summary>
            <pre className="mt-2 overflow-x-auto text-xs leading-relaxed text-slate-600">
              {EXAMPLE}
            </pre>
          </details>
        </div>
      )}
    </Modal>
  );
}
