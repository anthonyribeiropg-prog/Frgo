import { useEffect, useMemo, useState } from "react";
import { useStore } from "../state/store";
import { imageUrl } from "../lib/supabase";
import { ACCEPTED_IMAGE_TYPES } from "../lib/image";
import { Button, Field, Modal, inputClass } from "./ui";
import type { StockedProduct, Tracking } from "../lib/types";

/** Les catégories rangées dans la porte se comptent souvent en contenants. */
function guessTracking(categoryName: string | undefined): Tracking {
  if (!categoryName) return "unit";
  return /boisson|sauce/i.test(categoryName) ? "container" : "unit";
}

export function ProductDialog({
  open,
  entry,
  onClose,
}: {
  open: boolean;
  entry: StockedProduct | null;
  onClose: () => void;
}) {
  const { categories, saveProduct, deleteProduct } = useStore();
  const editing = entry !== null;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [tracking, setTracking] = useState<Tracking>("unit");
  const [quantity, setQuantity] = useState(1);
  const [expiresOn, setExpiresOn] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(entry?.product.name ?? "");
    setDescription(entry?.product.description ?? "");
    setCategoryId(entry?.product.category_id ?? categories[0]?.id ?? null);
    setTracking(entry?.product.tracking ?? "unit");
    setQuantity(entry?.item?.quantity ?? 1);
    setExpiresOn(entry?.item?.expires_on ?? "");
    setImageFile(null);
    setRemoveImage(false);
    setConfirmDelete(false);
  }, [open, entry, categories]);

  const preview = useMemo(() => {
    if (imageFile) return URL.createObjectURL(imageFile);
    if (removeImage) return null;
    return imageUrl(entry?.product.image_path ?? null);
  }, [imageFile, removeImage, entry]);

  useEffect(() => {
    return () => {
      if (imageFile && preview) URL.revokeObjectURL(preview);
    };
  }, [imageFile, preview]);

  const chosenCategory = categories.find((category) => category.id === categoryId);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await saveProduct({
        id: entry?.product.id,
        name,
        description,
        categoryId,
        tracking,
        quantity,
        expiresOn: expiresOn || null,
        imageFile,
        removeImage,
      });
      onClose();
    } catch {
      /* message affiché par le bandeau global */
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!entry) return;
    setBusy(true);
    try {
      await deleteProduct(entry.product.id);
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
      title={editing ? "Modifier le produit" : "Ajouter un produit"}
      footer={
        <>
          {editing &&
            (confirmDelete ? (
              <Button variant="danger" onClick={() => void remove()} disabled={busy} className="mr-auto">
                Confirmer la suppression définitive
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
        <div className="flex gap-4">
          <div className="shrink-0">
            <label className="group relative block h-24 w-24 cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 transition hover:border-teal-400">
              {preview ? (
                <img src={preview} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="grid h-full w-full place-items-center text-center text-xs leading-tight text-slate-400">
                  Ajouter
                  <br />
                  une photo
                </span>
              )}
              <input
                type="file"
                accept={ACCEPTED_IMAGE_TYPES}
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setImageFile(file);
                  if (file) setRemoveImage(false);
                }}
              />
            </label>
            {preview && (
              <button
                onClick={() => {
                  setImageFile(null);
                  setRemoveImage(true);
                }}
                className="mt-1.5 w-24 text-center text-xs text-slate-500 hover:text-rose-600"
              >
                Retirer la photo
              </button>
            )}
          </div>

          <div className="flex-1 space-y-3">
            <Field label="Nom">
              <input
                className={inputClass}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Yaourt nature"
                autoFocus
              />
            </Field>

            <Field label="Catégorie">
              <select
                className={inputClass}
                value={categoryId ?? ""}
                onChange={(event) => {
                  const id = event.target.value || null;
                  setCategoryId(id);
                  if (!editing) {
                    const next = categories.find((category) => category.id === id);
                    setTracking(guessTracking(next?.name));
                  }
                }}
              >
                <option value="">Sans catégorie</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.emoji} {category.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        <Field label="Description" hint="Facultatif : marque, provenance, ce qu'on en fait…">
          <textarea
            className={`${inputClass} resize-none`}
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Bio, acheté au marché"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Quantité" hint={editing ? "Réglage direct ; au quotidien, utilise + et −." : undefined}>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setQuantity((value) => Math.max(0, value - 1))}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-xl font-bold text-slate-600 transition hover:bg-slate-200 active:scale-90"
                aria-label="Diminuer"
              >
                −
              </button>
              <input
                type="number"
                min={0}
                value={quantity}
                onChange={(event) => setQuantity(Math.max(0, Number(event.target.value)))}
                className={`${inputClass} text-center text-lg font-bold`}
              />
              <button
                onClick={() => setQuantity((value) => value + 1)}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-xl font-bold text-slate-600 transition hover:bg-slate-200 active:scale-90"
                aria-label="Augmenter"
              >
                +
              </button>
            </div>
          </Field>

          <Field label="À consommer avant" hint="Facultatif. Affiche une pastille de couleur.">
            <input
              type="date"
              className={inputClass}
              value={expiresOn}
              onChange={(event) => setExpiresOn(event.target.value)}
            />
          </Field>
        </div>

        <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-3">
          <input
            type="checkbox"
            checked={tracking === "container"}
            onChange={(event) => setTracking(event.target.checked ? "container" : "unit")}
            className="mt-0.5 h-4 w-4 accent-teal-600"
          />
          <span className="text-sm text-slate-700">
            <span className="font-semibold">Se compte en contenants</span>
            <span className="block text-xs text-slate-500">
              Pour les bouteilles et les bocaux : en plus du nombre, tu pourras indiquer le niveau
              de celui qui est entamé (une bouteille à moitié vide = 50 %).
              {chosenCategory && guessTracking(chosenCategory.name) === "container" && (
                <span className="text-teal-700"> Recommandé pour « {chosenCategory.name} ».</span>
              )}
            </span>
          </span>
        </label>
      </div>
    </Modal>
  );
}
