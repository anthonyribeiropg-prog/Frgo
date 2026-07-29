import type { Category, Product } from "./types";

/**
 * Format d'import du Frigo.
 *
 * L'écriture normale tient en un nom et une quantité, dans l'ordre qu'on veut :
 *
 *   3 Tomates
 *   Tomates 3
 *   Tomates x3
 *   Tomates            -> quantité 1
 *
 * La catégorie est devinée d'après le nom, donc le frigo se range tout seul.
 *
 * Le reste est facultatif et sert surtout aux fichiers produits par un agent :
 *
 *   # commentaire
 *   [Catégorie]                     -> s'applique aux lignes suivantes
 *   nom | quantité | catégorie | péremption | description | code-barres
 *   Yaourt !2026-08-04              -> date de péremption
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

// Nombre nu, sans le « x ». Limité à deux chiffres et suivi d'une lettre, pour
// ne pas confisquer le « 500 » de « 500 g de farine » ni le « 15 » de « 15% ».
const BARE_PREFIX = /^(\d{1,2})\s+(?=\D)/;
const BARE_SUFFIX = /\s+(\d{1,2})\s*$/;

// Un code-barres est reconnaissable sans marqueur : huit chiffres ou plus en
// fin de ligne ne peuvent pas être une quantité. Il sert à retrouver la photo.
const BARCODE_TOKEN = /\s+(\d{8,14})\s*$/;

/** Sans accents ni casse, pour comparer « Légumes » et « legumes ». */
export function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
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

      const barcode = BARCODE_TOKEN.exec(rest);
      if (barcode) {
        entry.code = barcode[1];
        rest = rest.replace(BARCODE_TOKEN, "").trim();
      }

      const forms: [RegExp, RegExpExecArray | null][] = [
        [QTY_SUFFIX, QTY_SUFFIX.exec(rest)],
        [QTY_PREFIX, QTY_PREFIX.exec(rest)],
        [BARE_PREFIX, BARE_PREFIX.exec(rest)],
        [BARE_SUFFIX, BARE_SUFFIX.exec(rest)],
      ];
      const found = forms.find(([, match]) => match !== null);
      if (found) {
        const [pattern, match] = found;
        entry.quantity = Number.parseInt(match![1], 10);
        rest = rest.replace(pattern, " ").trim();
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

/**
 * Mots-clés servant à deviner la catégorie d'un produit d'après son nom, pour
 * que le frigo se range seul sans qu'on ait à saisir quoi que ce soit.
 *
 * L'ordre compte : « pomme de terre » doit être reconnu comme un légume avant
 * que « pomme » ne l'envoie chez les fruits.
 */
const CATEGORY_HINTS: [string, string[]][] = [
  ["Légumes", [
    "pomme de terre", "patate", "tomate", "salade", "laitue", "batavia", "mache",
    "roquette", "carotte", "courgette", "aubergine", "poivron", "oignon", "ail",
    "echalote", "poireau", "brocoli", "chou", "choux", "haricot", "petit pois",
    "epinard", "concombre", "radis", "navet", "betterave", "celeri", "champignon",
    "courge", "potiron", "endive", "fenouil", "artichaut", "asperge", "persil",
    "ciboulette", "basilic", "coriandre", "avocat", "legume", "crudite",
  ]],
  ["Fruits", [
    "pomme", "poire", "banane", "orange", "clementine", "mandarine", "citron",
    "fraise", "framboise", "myrtille", "cassis", "cerise", "peche", "abricot",
    "prune", "raisin", "melon", "pasteque", "kiwi", "ananas", "mangue", "figue",
    "grenade", "compote", "nectarine", "fruit",
  ]],
  ["Œufs", ["oeuf"]],
  ["Laitages", [
    "lait", "yaourt", "yahourt", "fromage", "beurre", "creme", "emmental",
    "comte", "mozzarella", "camembert", "chevre", "cheddar", "gruyere", "ricotta",
    "feta", "skyr", "mascarpone", "parmesan", "raclette", "brie", "roquefort",
    "flan", "petit suisse", "faisselle", "danette",
  ]],
  ["Viandes-Poissons", [
    "poulet", "boeuf", "porc", "agneau", "veau", "dinde", "jambon", "lardon",
    "bacon", "saucisse", "saucisson", "steak", "escalope", "merguez", "chorizo",
    "saumon", "thon", "cabillaud", "colin", "crevette", "poisson", "viande",
    "roti", "magret", "terrine", "rillette", "andouille", "boudin", "nugget",
    "cordon bleu", "surimi", "moule", "crabe", "sardine", "maquereau", "truite",
    "charcuterie", "farce",
  ]],
  ["Boissons", [
    "eau", "jus", "soda", "coca", "limonade", "biere", "vin", "cidre", "sirop",
    "ice tea", "the glace", "monster", "red bull", "redbull", "tropico",
    "orangina", "perrier", "evian", "cristaline", "schweppes", "smoothie",
    "boisson", "champagne", "whisky", "vodka", "rhum", "pastis",
  ]],
  ["Sauces", [
    "sauce", "ketchup", "mayonnaise", "moutarde", "vinaigrette", "pesto",
    "harissa", "vinaigre", "tapenade", "houmous", "guacamole", "huile",
    "condiment",
  ]],
  ["Restes", [
    "reste", "gratin", "lasagne", "quiche", "pizza", "soupe", "potage",
    "ratatouille", "hachis", "couscous", "paella", "tajine",
  ]],
];

/**
 * Motifs compilés une fois. Le pluriel est toléré sur chaque mot et non
 * seulement à la fin, sans quoi « pommes de terre » ne reconnaîtrait pas
 * « pomme de terre » et finirait chez les fruits.
 */
const CATEGORY_PATTERNS: [string, RegExp[]][] = CATEGORY_HINTS.map(
  ([category, keywords]) => [
    category,
    keywords.map(
      (keyword) =>
        new RegExp(`\\b${keyword.split(" ").map((word) => `${word}s?`).join("\\s+")}\\b`),
    ),
  ],
);

/**
 * Devine la catégorie d'un produit, ou null si aucun mot-clé ne ressort.
 *
 * On retient le mot-clé qui apparaît le plus tôt dans le nom, et le plus long
 * en cas d'égalité. C'est ce qui distingue « sauce tomate » d'une tomate et
 * « jus d'orange » d'une orange : en français le nom principal vient en tête,
 * et « pommes de terre » l'emporte sur « pommes » parce qu'il est plus long.
 */
export function guessCategory(name: string): string | null {
  const folded = fold(name);
  let best: { category: string; index: number; length: number } | null = null;

  for (const [category, patterns] of CATEGORY_PATTERNS) {
    for (const pattern of patterns) {
      const match = pattern.exec(folded);
      if (!match) continue;
      if (
        !best ||
        match.index < best.index ||
        (match.index === best.index && match[0].length > best.length)
      ) {
        best = { category, index: match.index, length: match[0].length };
      }
    }
  }

  return best?.category ?? null;
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
        // À défaut de catégorie explicite, on la déduit du nom du produit.
        category: findCategory(line.categoryName ?? guessCategory(line.name), categories),
      });
    }
  }

  return actions;
}
