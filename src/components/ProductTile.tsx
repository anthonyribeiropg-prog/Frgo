import { imageUrl } from "../lib/supabase";
import { EXPIRY_STYLES, expiryLabel, expiryLevel } from "../lib/dates";
import { useStore } from "../state/store";
import type { StockedProduct } from "../lib/types";

export function ProductThumb({ entry, className = "" }: { entry: StockedProduct; className?: string }) {
  const url = imageUrl(entry.product.image_path);
  const emoji = entry.category?.emoji ?? "🍽️";
  const color = entry.category?.color ?? "#64748b";

  if (url) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        className={`h-full w-full object-cover ${className}`}
      />
    );
  }
  return (
    <div
      className={`grid h-full w-full place-items-center ${className}`}
      style={{ background: `color-mix(in srgb, ${color} 14%, white)` }}
    >
      <span className="text-[1.6em] leading-none">{emoji}</span>
    </div>
  );
}

/** Vignette compacte utilisable hors du frigo (listes d'ingrédients, chips). */
export function MiniThumb({
  imagePath,
  emoji,
  color,
  className = "",
}: {
  imagePath: string | null;
  emoji: string;
  color: string;
  className?: string;
}) {
  const url = imageUrl(imagePath);
  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-md ${className}`}
      style={url ? undefined : { background: `color-mix(in srgb, ${color} 16%, white)` }}
    >
      {url ? (
        <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span className="text-[0.75em] leading-none">{emoji}</span>
      )}
    </span>
  );
}

/** Pastille de fraîcheur : verte, orange puis rouge à mesure que la date approche. */
export function ExpiryDot({ date, className = "" }: { date: string | null; className?: string }) {
  const level = expiryLevel(date);
  if (level === "none") return null;
  return (
    <span
      title={expiryLabel(date) ?? undefined}
      className={`inline-block h-2.5 w-2.5 rounded-full ring-2 ring-white ${EXPIRY_STYLES[level]} ${className}`}
    />
  );
}

export function QtyStepper({
  entry,
  size = "md",
}: {
  entry: StockedProduct;
  size?: "sm" | "md";
}) {
  const { bumpQuantity } = useStore();
  const quantity = entry.item?.quantity ?? 0;
  const last = quantity <= 1;
  const box = size === "sm" ? "h-7 w-7 text-base" : "h-8 w-8 text-lg";

  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5">
      <button
        onClick={() => void bumpQuantity(entry.product.id, -1)}
        title={last ? "Retirer du frigo" : "Retirer une unité"}
        aria-label={last ? `Retirer ${entry.product.name} du frigo` : `Retirer une unité de ${entry.product.name}`}
        className={`grid ${box} place-items-center rounded-md font-bold transition active:scale-90 ${
          last
            ? "text-rose-600 hover:bg-rose-100"
            : "text-slate-600 hover:bg-white hover:text-slate-900"
        }`}
      >
        {last ? "🗑" : "−"}
      </button>
      <span className="min-w-[1.6rem] text-center text-sm font-bold tabular-nums text-slate-900">
        {quantity}
      </span>
      <button
        onClick={() => void bumpQuantity(entry.product.id, 1)}
        aria-label={`Ajouter une unité de ${entry.product.name}`}
        className={`grid ${box} place-items-center rounded-md font-bold text-slate-600 transition hover:bg-white hover:text-teal-700 active:scale-90`}
      >
        +
      </button>
    </div>
  );
}

/** Remplissage du contenant entamé, pour les bouteilles et les bocaux. */
export function FillGauge({ entry }: { entry: StockedProduct }) {
  const { bumpFill } = useStore();
  const fill = entry.item?.fill_percent ?? 100;

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => void bumpFill(entry.product.id, -25)}
        aria-label={`Diminuer le niveau de ${entry.product.name}`}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-slate-100 text-sm font-bold text-slate-600 transition hover:bg-slate-200 active:scale-90"
      >
        −
      </button>
      <div
        className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-200"
        title={`Contenant entamé rempli à ${fill} %`}
      >
        <div
          className="h-full rounded-full bg-sky-500 transition-all"
          style={{ width: `${fill}%` }}
        />
      </div>
      <span className="w-8 shrink-0 text-right text-[10px] font-semibold tabular-nums text-slate-500">
        {fill}%
      </span>
      <button
        onClick={() => void bumpFill(entry.product.id, 25)}
        aria-label={`Augmenter le niveau de ${entry.product.name}`}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-slate-100 text-sm font-bold text-slate-600 transition hover:bg-slate-200 active:scale-90"
      >
        +
      </button>
    </div>
  );
}

/** La vignette telle qu'elle apparaît posée sur une étagère du frigo. */
export function FridgeTile({
  entry,
  onEdit,
}: {
  entry: StockedProduct;
  onEdit: (entry: StockedProduct) => void;
}) {
  const isContainer = entry.product.tracking === "container";

  return (
    <div className="w-[108px] rounded-xl border border-slate-200/80 bg-white p-1.5 shadow-sm transition hover:shadow-md">
      <button
        onClick={() => onEdit(entry)}
        className="block w-full text-left"
        title={entry.product.description || entry.product.name}
      >
        <div className="relative aspect-square overflow-hidden rounded-lg bg-slate-50">
          <ProductThumb entry={entry} />
          <ExpiryDot date={entry.item?.expires_on ?? null} className="absolute top-1 right-1" />
        </div>
        <div className="mt-1 truncate text-[11px] leading-tight font-semibold text-slate-800">
          {entry.product.name}
        </div>
      </button>

      <div className="mt-1.5">
        <QtyStepper entry={entry} size="sm" />
      </div>
      {isContainer && (
        <div className="mt-1.5">
          <FillGauge entry={entry} />
        </div>
      )}
    </div>
  );
}
