import { useMemo } from "react";
import { useStore } from "./store";
import type { Category, FridgeItem, Product, Recipe, StockedProduct, Zone } from "../lib/types";

/** Le catalogue complet, chaque produit relié à sa catégorie et à son stock réel. */
export function useCatalog(): StockedProduct[] {
  const { products, categories, items } = useStore();
  return useMemo(() => {
    const byCategory = new Map<string, Category>(categories.map((c) => [c.id, c]));
    const byProduct = new Map<string, FridgeItem>(items.map((i) => [i.product_id, i]));
    return products
      .map((product) => ({
        product,
        category: product.category_id ? byCategory.get(product.category_id) ?? null : null,
        item: byProduct.get(product.id) ?? null,
      }))
      .sort((a, b) => {
        const zoneA = a.category?.sort_order ?? 99;
        const zoneB = b.category?.sort_order ?? 99;
        if (zoneA !== zoneB) return zoneA - zoneB;
        return a.product.name.localeCompare(b.product.name, "fr");
      });
  }, [products, categories, items]);
}

/** Ce qui est réellement dans le frigo en ce moment. */
export function useInFridge(): StockedProduct[] {
  const catalog = useCatalog();
  return useMemo(() => catalog.filter((entry) => entry.item !== null), [catalog]);
}

/** Le catalogue des produits absents du frigo, à racheter ou simplement connus. */
export function useOutOfFridge(): StockedProduct[] {
  const catalog = useCatalog();
  return useMemo(() => catalog.filter((entry) => entry.item === null), [catalog]);
}

export interface IngredientStatus {
  key: string;
  label: string;
  needed: number;
  available: number;
  counts: boolean;
  ok: boolean;
  imagePath: string | null;
  emoji: string;
  color: string;
}

export interface RecipeStatus {
  recipe: Recipe;
  lines: IngredientStatus[];
  have: number;
  total: number;
  ratio: number;
  doable: boolean;
}

/**
 * Faisabilité d'une recette au regard du contenu actuel du frigo.
 * Les ingrédients saisis en texte libre (sel, poivre, huile) sont affichés
 * mais jamais comptés : sinon aucune recette ne serait jamais réalisable.
 */
export function useRecipeStatuses(): RecipeStatus[] {
  const { recipes, ingredients, products, items, categories } = useStore();

  return useMemo(() => {
    const productById = new Map<string, Product>(products.map((p) => [p.id, p]));
    const categoryById = new Map<string, Category>(categories.map((c) => [c.id, c]));
    const stockByProduct = new Map<string, number>(
      items.map((i) => [i.product_id, i.quantity]),
    );

    const statuses = recipes.map<RecipeStatus>((recipe) => {
      const lines = ingredients
        .filter((ingredient) => ingredient.recipe_id === recipe.id)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map<IngredientStatus>((ingredient) => {
          if (!ingredient.product_id) {
            return {
              key: ingredient.id,
              label: ingredient.free_text ?? "",
              needed: ingredient.quantity,
              available: 0,
              counts: false,
              ok: true,
              imagePath: null,
              emoji: "🧂",
              color: "#94a3b8",
            };
          }
          const product = productById.get(ingredient.product_id);
          const category = product?.category_id ? categoryById.get(product.category_id) : null;
          const available = stockByProduct.get(ingredient.product_id) ?? 0;
          return {
            key: ingredient.id,
            label: product?.name ?? "Produit supprimé",
            needed: ingredient.quantity,
            available,
            counts: true,
            ok: available >= ingredient.quantity,
            imagePath: product?.image_path ?? null,
            emoji: category?.emoji ?? "🍽️",
            color: category?.color ?? "#64748b",
          };
        });

      const counted = lines.filter((line) => line.counts);
      const have = counted.filter((line) => line.ok).length;
      const total = counted.length;
      return {
        recipe,
        lines,
        have,
        total,
        ratio: total === 0 ? 1 : have / total,
        doable: have === total,
      };
    });

    return statuses.sort((a, b) => {
      if (a.ratio !== b.ratio) return b.ratio - a.ratio;
      return a.recipe.name.localeCompare(b.recipe.name, "fr");
    });
  }, [recipes, ingredients, products, items, categories]);
}

/** Répartit les produits dans les zones du frigo d'après leur catégorie. */
export function groupByZone(entries: StockedProduct[]): Record<Zone, StockedProduct[]> {
  const zones: Record<Zone, StockedProduct[]> = { shelf: [], drawer: [], door: [] };
  for (const entry of entries) {
    zones[entry.category?.zone ?? "shelf"].push(entry);
  }
  return zones;
}

/** Découpe une liste en n paquets de taille comparable, ordre préservé. */
export function chunkEvenly<T>(list: T[], buckets: number): T[][] {
  const result: T[][] = Array.from({ length: buckets }, () => []);
  if (list.length === 0) return result;
  const perBucket = Math.ceil(list.length / buckets);
  list.forEach((entry, index) => {
    result[Math.min(Math.floor(index / perBucket), buckets - 1)].push(entry);
  });
  return result;
}
