import { useRecipeStatuses } from "../state/derived";
import { MiniThumb } from "./ProductTile";
import { Button } from "./ui";
import type { RecipeStatus } from "../state/derived";
import type { Recipe } from "../lib/types";

function Badge({ status }: { status: RecipeStatus }) {
  if (status.total === 0) {
    return (
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">
        Aucun ingrédient suivi
      </span>
    );
  }
  if (status.doable) {
    return (
      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
        Réalisable maintenant
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
      {status.have}/{status.total} ingrédients
    </span>
  );
}

function Card({ status, onEdit }: { status: RecipeStatus; onEdit: (recipe: Recipe) => void }) {
  const missing = status.lines.filter((line) => line.counts && !line.ok);

  return (
    <article
      className={`rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md ${
        status.doable && status.total > 0 ? "border-emerald-300" : "border-slate-200"
      }`}
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <button onClick={() => onEdit(status.recipe)} className="min-w-0 flex-1 text-left">
          <h3 className="truncate text-base font-bold text-slate-900">{status.recipe.name}</h3>
          <p className="text-xs text-slate-500">
            {status.recipe.servings} part{status.recipe.servings > 1 ? "s" : ""}
            {status.recipe.description && ` · ${status.recipe.description}`}
          </p>
        </button>
        <Badge status={status} />
      </header>

      {status.total > 0 && (
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all ${
              status.doable ? "bg-emerald-500" : "bg-amber-500"
            }`}
            style={{ width: `${Math.round(status.ratio * 100)}%` }}
          />
        </div>
      )}

      <ul className="flex flex-wrap gap-1.5">
        {status.lines.map((line) => (
          <li
            key={line.key}
            className={`flex items-center gap-1.5 rounded-lg py-1 pr-2 pl-1 text-xs ${
              !line.counts
                ? "bg-slate-50 text-slate-500 italic"
                : line.ok
                  ? "bg-emerald-50 text-emerald-800"
                  : "bg-rose-50 text-rose-700"
            }`}
          >
            <MiniThumb
              imagePath={line.imagePath}
              emoji={line.emoji}
              color={line.color}
              className="h-5 w-5 text-sm"
            />
            <span>
              {line.counts && (line.ok ? "✓ " : "✗ ")}
              {line.label}
              {line.counts && (
                <span className="opacity-70">
                  {" "}
                  {line.available}/{line.needed}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {missing.length > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          Il manque {missing.map((line) => line.label.toLowerCase()).join(", ")}.
        </p>
      )}

      {status.recipe.instructions && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold text-teal-700">
            Voir la préparation
          </summary>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
            {status.recipe.instructions}
          </p>
        </details>
      )}
    </article>
  );
}

export function RecipesScreen({
  onEdit,
  onAdd,
}: {
  onEdit: (recipe: Recipe) => void;
  onAdd: () => void;
}) {
  const statuses = useRecipeStatuses();
  const doable = statuses.filter((status) => status.doable && status.total > 0);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Recettes</h1>
          <p className="mt-1 text-sm text-slate-500">
            {doable.length > 0
              ? `${doable.length} recette${doable.length > 1 ? "s" : ""} réalisable${
                  doable.length > 1 ? "s" : ""
                } avec ce qu'il y a dans le frigo.`
              : "La liste se réordonne toute seule selon le contenu du frigo."}
          </p>
        </div>
        <Button onClick={onAdd}>Nouvelle recette</Button>
      </header>

      {statuses.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-12 text-center text-sm text-slate-400">
          Aucune recette pour l'instant. Crée la première et elle se comparera automatiquement au
          contenu du frigo.
        </p>
      ) : (
        <div className="space-y-3">
          {statuses.map((status) => (
            <Card key={status.recipe.id} status={status} onEdit={onEdit} />
          ))}
        </div>
      )}
    </div>
  );
}
