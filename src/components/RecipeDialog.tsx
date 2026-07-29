import { useEffect, useState } from "react";
import { useStore, type IngredientDraft } from "../state/store";
import { Button, Field, Modal, inputClass } from "./ui";
import { MiniThumb } from "./ProductTile";
import type { Recipe } from "../lib/types";

const FREE_TEXT = "__libre";

export function RecipeDialog({
  open,
  recipe,
  onClose,
}: {
  open: boolean;
  recipe: Recipe | null;
  onClose: () => void;
}) {
  const { products, categories, ingredients, saveRecipe, deleteRecipe } = useStore();
  const editing = recipe !== null;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [servings, setServings] = useState(2);
  const [rows, setRows] = useState<IngredientDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(recipe?.name ?? "");
    setDescription(recipe?.description ?? "");
    setInstructions(recipe?.instructions ?? "");
    setServings(recipe?.servings ?? 2);
    setConfirmDelete(false);
    setRows(
      recipe
        ? ingredients
            .filter((ingredient) => ingredient.recipe_id === recipe.id)
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((ingredient) => ({
              productId: ingredient.product_id,
              freeText: ingredient.free_text,
              quantity: ingredient.quantity,
            }))
        : [{ productId: null, freeText: "", quantity: 1 }],
    );
  }, [open, recipe, ingredients]);

  const update = (index: number, changes: Partial<IngredientDraft>) => {
    setRows((current) =>
      current.map((row, position) => (position === index ? { ...row, ...changes } : row)),
    );
  };

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await saveRecipe({
        id: recipe?.id,
        name,
        description,
        instructions,
        servings,
        ingredients: rows,
      });
      onClose();
    } catch {
      /* message affiché par le bandeau global */
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!recipe) return;
    setBusy(true);
    try {
      await deleteRecipe(recipe.id);
      onClose();
    } catch {
      /* message affiché par le bandeau global */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={editing ? "Modifier la recette" : "Nouvelle recette"}
      footer={
        <>
          {editing &&
            (confirmDelete ? (
              <Button variant="danger" onClick={() => void remove()} disabled={busy} className="mr-auto">
                Confirmer la suppression
              </Button>
            ) : (
              <Button variant="danger" onClick={() => setConfirmDelete(true)} className="mr-auto">
                Supprimer
              </Button>
            ))}
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={() => void submit()} disabled={busy || !name.trim()}>
            {busy ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Field label="Nom de la recette">
            <input
              className={inputClass}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Gratin de courgettes"
              autoFocus
            />
          </Field>
          <Field label="Parts">
            <input
              type="number"
              min={1}
              className={`${inputClass} sm:w-24`}
              value={servings}
              onChange={(event) => setServings(Math.max(1, Number(event.target.value)))}
            />
          </Field>
        </div>

        <Field label="Description" hint="Facultatif.">
          <input
            className={inputClass}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Le plat du dimanche soir"
          />
        </Field>

        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm font-medium text-slate-700">Ingrédients</span>
            <span className="text-xs text-slate-500">
              Les ingrédients en texte libre ne comptent pas dans la faisabilité.
            </span>
          </div>

          <div className="space-y-2">
            {rows.map((row, index) => {
              const chosen = row.productId
                ? products.find((product) => product.id === row.productId)
                : undefined;
              const category = chosen?.category_id
                ? categories.find((entry) => entry.id === chosen.category_id)
                : undefined;

              return (
                <div key={index} className="flex flex-wrap items-center gap-2">
                  <MiniThumb
                    imagePath={chosen?.image_path ?? null}
                    emoji={chosen ? category?.emoji ?? "🍽️" : "🧂"}
                    color={category?.color ?? "#94a3b8"}
                    className="h-10 w-10 text-xl"
                  />

                  {/* Chaque champ est dimensionné par son conteneur : le style
                      de base porte déjà w-full, une largeur posée directement
                      sur l'input entrerait en conflit avec lui. */}
                  <div className="min-w-[9rem] flex-1">
                    <select
                      className={inputClass}
                      value={row.productId ?? FREE_TEXT}
                      onChange={(event) => {
                        const value = event.target.value;
                        update(index, {
                          productId: value === FREE_TEXT ? null : value,
                          freeText: value === FREE_TEXT ? row.freeText ?? "" : null,
                        });
                      }}
                    >
                      <option value={FREE_TEXT}>— Texte libre (sel, huile…) —</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {row.productId === null && (
                    <div className="min-w-[9rem] flex-1">
                      <input
                        className={inputClass}
                        value={row.freeText ?? ""}
                        onChange={(event) => update(index, { freeText: event.target.value })}
                        placeholder="Sel, poivre"
                      />
                    </div>
                  )}

                  <div className="w-20 shrink-0">
                    <input
                      type="number"
                      min={1}
                      className={`${inputClass} px-2 text-center`}
                      value={row.quantity}
                      onChange={(event) =>
                        update(index, { quantity: Math.max(1, Number(event.target.value)) })
                      }
                      aria-label="Quantité nécessaire"
                    />
                  </div>

                  <button
                    onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                    aria-label="Retirer cet ingrédient"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>

          <button
            onClick={() =>
              setRows((current) => [...current, { productId: null, freeText: "", quantity: 1 }])
            }
            className="mt-2 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-teal-400 hover:text-teal-700"
          >
            + Ajouter un ingrédient
          </button>
        </div>

        <Field label="Préparation" hint="Facultatif.">
          <textarea
            className={`${inputClass} resize-y`}
            rows={4}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            placeholder="Émincer les courgettes, faire revenir…"
          />
        </Field>
      </div>
    </Modal>
  );
}
