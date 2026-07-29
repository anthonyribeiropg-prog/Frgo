import { useMemo, useState } from "react";
import { useOutOfFridge } from "../state/derived";
import { useStore } from "../state/store";
import { ProductThumb } from "./ProductTile";
import { Button } from "./ui";
import type { StockedProduct } from "../lib/types";

function Card({
  entry,
  onEdit,
}: {
  entry: StockedProduct;
  onEdit: (entry: StockedProduct) => void;
}) {
  const { bumpQuantity, setRestock } = useStore();
  const wanted = entry.product.needs_restock;

  return (
    <li className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow-md">
      <button
        onClick={() => onEdit(entry)}
        className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-100"
        aria-label={`Modifier ${entry.product.name}`}
      >
        <ProductThumb entry={entry} />
      </button>

      <button onClick={() => onEdit(entry)} className="min-w-0 flex-1 text-left">
        <div className="truncate text-sm font-semibold text-slate-800">{entry.product.name}</div>
        <div className="truncate text-xs text-slate-500">
          {entry.category?.name ?? "Sans catégorie"}
          {entry.product.description && (
            <span className="text-slate-400"> · {entry.product.description}</span>
          )}
        </div>
      </button>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          onClick={() => void setRestock(entry.product.id, !wanted)}
          title={wanted ? "Retirer de la liste de courses" : "Ajouter à la liste de courses"}
          className={`grid h-9 w-9 place-items-center rounded-xl text-sm transition ${
            wanted
              ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
              : "bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
          }`}
        >
          🛒
        </button>
        <button
          onClick={() => void bumpQuantity(entry.product.id, 1)}
          className="rounded-xl bg-teal-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-teal-700 active:scale-95"
        >
          Au frigo
        </button>
      </div>
    </li>
  );
}

export function ProductsScreen({
  onEdit,
  onAdd,
  onImport,
}: {
  onEdit: (entry: StockedProduct) => void;
  onAdd: () => void;
  onImport: () => void;
}) {
  const entries = useOutOfFridge();
  const [query, setQuery] = useState("");

  const { wanted, known } = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? entries.filter((entry) => entry.product.name.toLowerCase().includes(needle))
      : entries;
    return {
      wanted: filtered.filter((entry) => entry.product.needs_restock),
      known: filtered.filter((entry) => !entry.product.needs_restock),
    };
  }, [entries, query]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">Produits</h1>
        <p className="mt-1 text-sm text-slate-500">
          Tout ce que vous avez déjà eu dans le frigo. Les fiches sont conservées : un clic sur
          « Au frigo » les remet en rayon sans rien ressaisir.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher"
          className="min-w-[10rem] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
        />
        <Button variant="ghost" onClick={onImport}>
          Importer une liste
        </Button>
        <Button onClick={onAdd}>Nouveau produit</Button>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold tracking-wide text-slate-900 uppercase">
          🛒 Liste de courses
          {wanted.length > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
              {wanted.length}
            </span>
          )}
        </h2>
        {wanted.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-400">
            Rien à racheter. Les produits épuisés atterrissent ici automatiquement.
          </p>
        ) : (
          <ul className="space-y-2">
            {wanted.map((entry) => (
              <Card key={entry.product.id} entry={entry} onEdit={onEdit} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-bold tracking-wide text-slate-900 uppercase">
          Catalogue
        </h2>
        {known.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-400">
            Aucun autre produit connu pour l'instant.
          </p>
        ) : (
          <ul className="space-y-2">
            {known.map((entry) => (
              <Card key={entry.product.id} entry={entry} onEdit={onEdit} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
