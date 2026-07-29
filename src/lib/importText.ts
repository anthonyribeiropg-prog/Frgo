import type { Category, Product } from "./types";

/**
 * Format d'import du Frigo.
 *
 *   # commentaire
 *   [Catégorie]                     -> s'applique aux lignes suivantes
 *   nom | quantité | catégorie | péremption | description | code-barres
 *
 * Seul le nom est obligatoire. Pour une liste écrite à la main, les
 * raccourcis « Tomates x3 » et « Yaourt !2026-08-04 » évitent les barres.
 */

export interface ParsedLine {
  lineNumber: number;
  raw: string;
  name: string;
  quantity: number;
  categoryName: string | null;
  expiresOn: string | null;
  description: string;
  code: string | null;
  error: string | null;
}

const SECTION = /^\[(.+)\]$/;
const QTY_SUFFIX = /\s*[x×*]\s*(\d{1,3})\s*$/i;
const QTY_PREFIX = /^\s*(\d{1,3})\s*[x×*]\s+/i;
const DATE_TOKEN = /\s*!\s*(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})\s*/;

/** Sans accents ni casse, pour comparer « Légumes » et « legumes ». */
export function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function normalizeDate(value: string): string | null {
  const slashed = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  const iso = slashed
    ? `${slashed[3]}-${slashed[2].padStart(2, "0")}-${slashed[1].padStart(2, "0")}`
    : value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : iso;
}

export function parseImport(text: string): ParsedLine[] {
  const lines: ParsedLine[] = [];
  let section: string | null = null;

  text.split(/\r?\n/).forEach((raw, index) => {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const heading = SECTION.exec(trimmed);
    if (heading) {
      section = heading[1].trim();
      return;
    }

    const entry: ParsedLine = {
      lineNumber: index + 1,
      raw: trimmed,
      name: "",
      quantity: 1,
      categoryName: section,
      expiresOn: null,
      description: "",
      code: null,
      error: null,
    };

    if (trimmed.includes("|")) {
      const parts = trimmed.split("|").map((part) => part.trim());
      entry.name = parts[0] ?? "";
      if (parts[1]) {
        const quantity = Number.parseInt(parts[1], 10);
        if (Number.isNaN(quantity)) entry.error = `Quantité illisible : « ${parts[1]} »`;
        else entry.quantity = quantity;
      }
      if (parts[2]) entry.categoryName = parts[2];
      if (parts[3]) {
        const date = normalizeDate(parts[3]);
        if (!date) entry.error = `Date illisible : « ${parts[3]} »`;
        else entry.expiresOn = date;
      }
      if (parts[4]) entry.description = parts[4];
      if (parts[5]) entry.code = parts[5].replace(/\D/g, "") || null;
    } else {
      // Écriture libre : on retire d'abord la date, puis la quantité.
      let rest = trimmed;
      const dateMatch = DATE_TOKEN.exec(rest);
      if (dateMatch) {
        const date = normalizeDate(dateMatch[1]);
        if (!date) entry.error = `Date illisible : « ${dateMatch[1]} »`;
        else entry.expiresOn = date;
        rest = rest.replace(DATE_TOKEN, " ").trim();
      }

      const suffix = QTY_SUFFIX.exec(rest);
      const prefix = QTY_PREFIX.exec(rest);
      if (suffix) {
        entry.quantity = Number.parseInt(suffix[1], 10);
        rest = rest.replace(QTY_SUFFIX, "").trim();
      } else if (prefix) {
        entry.quantity = Number.parseInt(prefix[1], 10);
        rest = rest.replace(QTY_PREFIX, "").trim();
      }
      entry.name = rest;
    }

    entry.name = entry.name.trim();
    if (!entry.name) entry.error = "Nom de produit manquant";
    else if (entry.name.length > 120) entry.error = "Nom trop long (120 caractères maximum)";
    if (entry.quantity < 1 || entry.quantity > 999) {
      entry.error = entry.error ?? `Quantité hors limites : ${entry.quantity}`;
    }

    lines.push(entry);
  });

  return lines;
}

export function findCategory(name: string | null, categories: Category[]): Category | null {
  if (!name) return null;
  const needle = fold(name);
  return (
    categories.find((category) => fold(category.name) === needle) ??
    categories.find((category) => fold(category.name).startsWith(needle)) ??
    categories.find((category) => needle.startsWith(fold(category.name))) ??
    null
  );
}

export type ImportAction =
  | { kind: "create"; line: ParsedLine; category: Category | null }
  | { kind: "increase"; line: ParsedLine; product: Product; alreadyInFridge: boolean }
  | { kind: "invalid"; line: ParsedLine };

/**
 * Associe chaque ligne à ce qui va réellement se passer en base. Un même
 * produit cité deux fois dans le fichier — courant sur une facture — est
 * fusionné en une seule entrée dont les quantités s'additionnent.
 */
export function resolveImport(
  lines: ParsedLine[],
  products: Product[],
  categories: Category[],
  stockedProductIds: Set<string>,
): ImportAction[] {
  const byName = new Map<string, Product>(products.map((product) => [fold(product.name), product]));
  const actions: ImportAction[] = [];
  const seen = new Map<string, number>();

  for (const line of lines) {
    if (line.error) {
      actions.push({ kind: "invalid", line });
      continue;
    }

    const key = fold(line.name);
    const alreadyAt = seen.get(key);
    if (alreadyAt !== undefined) {
      const previous = actions[alreadyAt];
      if (previous.kind !== "invalid") {
        previous.line.quantity += line.quantity;
        previous.line.expiresOn = previous.line.expiresOn ?? line.expiresOn;
        previous.line.code = previous.line.code ?? line.code;
      }
      continue;
    }

    seen.set(key, actions.length);
    const existing = byName.get(key);
    if (existing) {
      actions.push({
        kind: "increase",
        line: { ...line },
        product: existing,
        alreadyInFridge: stockedProductIds.has(existing.id),
      });
    } else {
      actions.push({
        kind: "create",
        line: { ...line },
        category: findCategory(line.categoryName, categories),
      });
    }
  }

  return actions;
}
