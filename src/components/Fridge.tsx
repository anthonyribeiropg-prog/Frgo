import { chunkEvenly, groupByZone, useInFridge } from "../state/derived";
import { FridgeTile } from "./ProductTile";
import type { StockedProduct } from "../lib/types";

interface ShelfProps {
  entries: StockedProduct[];
  onEdit: (entry: StockedProduct) => void;
  placeholder?: string;
}

function Shelf({ entries, onEdit, placeholder }: ShelfProps) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex min-h-[88px] flex-wrap items-end gap-2 px-1 pb-2">
        {entries.length === 0
          ? placeholder && (
              <p className="w-full py-6 text-center text-sm text-slate-400">{placeholder}</p>
            )
          : entries.map((entry) => (
              <FridgeTile key={entry.product.id} entry={entry} onEdit={onEdit} />
            ))}
      </div>
      {/* la tablette en verre */}
      <div className="h-[7px] rounded-full bg-gradient-to-b from-white via-slate-200 to-slate-400/80 shadow-sm" />
    </div>
  );
}

function Drawer({ label, entries, onEdit }: ShelfProps & { label: string }) {
  return (
    <div className="rounded-2xl border border-sky-200/60 bg-sky-50/70 p-2.5">
      <div className="mb-2 flex items-center gap-2">
        <div className="h-1 w-9 rounded-full bg-sky-300/80" />
        <span className="text-[10px] font-semibold tracking-wider text-sky-800/60 uppercase">
          {label}
        </span>
      </div>
      <div className="flex min-h-[72px] flex-wrap gap-2">
        {entries.map((entry) => (
          <FridgeTile key={entry.product.id} entry={entry} onEdit={onEdit} />
        ))}
      </div>
    </div>
  );
}

export function Fridge({ onEdit }: { onEdit: (entry: StockedProduct) => void }) {
  const entries = useInFridge();
  const zones = groupByZone(entries);
  const shelves = chunkEvenly(zones.shelf, 3);
  const drawers = chunkEvenly(zones.drawer, 2);
  const racks = chunkEvenly(zones.door, 4);
  const empty = entries.length === 0;

  return (
    <div className="rounded-[30px] bg-gradient-to-b from-zinc-100 via-zinc-200 to-zinc-300 p-3 shadow-[0_30px_70px_-25px_rgba(15,23,42,0.5)] ring-1 ring-zinc-400/40">
      {/* bandeau supérieur, comme sur l'illustration d'origine */}
      <div className="mx-1 mb-3 h-3 rounded-full bg-gradient-to-b from-slate-600 to-slate-900" />

      <div className="flex flex-col gap-3 lg:flex-row">
        {/* le caisson : trois étagères puis deux bacs */}
        <div className="flex-1 rounded-[22px] bg-gradient-to-b from-white to-slate-100 p-3 shadow-inner ring-1 ring-slate-300/50">
          {shelves.map((shelfEntries, index) => (
            <Shelf
              key={index}
              entries={shelfEntries}
              onEdit={onEdit}
              placeholder={
                empty && index === 1
                  ? "Le frigo est vide. Ajoute un premier produit pour le remplir."
                  : undefined
              }
            />
          ))}

          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            <Drawer label="Bac à légumes" entries={drawers[0]} onEdit={onEdit} />
            <Drawer label="Bac à fruits" entries={drawers[1]} onEdit={onEdit} />
          </div>
        </div>

        {/* la porte et ses balconnets */}
        <div className="w-full shrink-0 rounded-[22px] bg-gradient-to-b from-white to-slate-50 p-3 ring-1 ring-slate-300/50 lg:w-[272px]">
          <div className="mb-2 flex items-center gap-2">
            <div className="h-1 w-9 rounded-full bg-slate-300" />
            <span className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
              Porte
            </span>
          </div>
          {racks.map((rackEntries, index) => (
            <Shelf key={index} entries={rackEntries} onEdit={onEdit} />
          ))}
        </div>
      </div>
    </div>
  );
}
