import { useMemo, useState } from "react";
import { useInFridge } from "../state/derived";
import { useStore } from "../state/store";
import { expiryLabel } from "../lib/dates";
import { ExpiryDot, FillGauge, ProductThumb, QtyStepper } from "./ProductTile";
import type { StockedProduct } from "../lib/types";

function Row({ entry, onEdit }: { entry: StockedProduct; onEdit: (e: StockedProduct) => void }) {
  const expiry = expiryLabel(entry.item?.expires_on ?? null);
  const isContainer = entry.product.tracking === "container";

  return (
    <li className="rounded-xl px-2 py-2 transition hover:bg-slate-50">
      <div className="flex items-center gap-3">
        <button
          onClick={() => onEdit(entry)}
          className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-slate-100 text-[0.65rem]"
          aria-label={`Modifier ${entry.product.name}`}
        >
          <ProductThumb entry={entry} />
        </button>

        <button onClick={() => onEdit(entry)} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-slate-800">
              {entry.product.name}
            </span>
            <ExpiryDot date={entry.item?.expires_on ?? null} />
          </div>
          <div className="truncate text-xs text-slate-500">
            {entry.category?.name ?? "Sans catégorie"}
            {expiry && <span className="text-slate-400"> · {expiry}</span>}
          </div>
        </button>

        <QtyStepper entry={entry} size="sm" />
      </div>

      {isContainer && (
        <div className="mt-1.5 pl-14 pr-1">
          <FillGauge entry={entry} />
        </div>
      )}
    </li>
  );
}

export function ProductList({ onEdit }: { onEdit: (entry: StockedProduct) => void }) {
  const entries = useInFridge();
  const { categories } = useStore();
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (categoryId && entry.product.category_id !== categoryId) return false;
      if (!needle) return true;
      return (
        entry.product.name.toLowerCase().includes(needle) ||
        entry.product.description.toLowerCase().includes(needle)
      );
    });
  }, [entries, query, categoryId]);

  const used = useMemo(() => {
    const ids = new Set(entries.map((e) => e.product.category_id));
    return categories.filter((c) => ids.has(c.id));
  }, [categories, entries]);

  const totalUnits = entries.reduce((sum, entry) => sum + (entry.item?.quantity ?? 0), 0);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-100 px-4 pt-4 pb-3">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-bold tracking-wide text-slate-900 uppercase">Dans le frigo</h2>
          <span className="text-xs text-slate-500">
            {entries.length} produit{entries.length > 1 ? "s" : ""} · {totalUnits} unité
            {totalUnits > 1 ? "s" : ""}
          </span>
        </div>

        <div className="relative">
          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher un produit"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pr-3 pl-9 text-sm outline-none transition focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10"
          />
        </div>

        {used.length > 1 && (
          <div className="scrollbar-slim mt-2.5 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            <button
              onClick={() => setCategoryId(null)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition ${
                categoryId === null ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              Tout
            </button>
            {used.map((category) => (
              <button
                key={category.id}
                onClick={() => setCategoryId(categoryId === category.id ? null : category.id)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition ${
                  categoryId === category.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {category.emoji} {category.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="scrollbar-slim flex-1 overflow-y-auto px-2 py-2">
        {visible.length === 0 ? (
          <p className="px-2 py-10 text-center text-sm text-slate-400">
            {entries.length === 0
              ? "Rien dans le frigo pour l'instant."
              : "Aucun produit ne correspond."}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {visible.map((entry) => (
              <Row key={entry.product.id} entry={entry} onEdit={onEdit} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
