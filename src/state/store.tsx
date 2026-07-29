import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { RealtimePostgresChangesPayload, Session } from "@supabase/supabase-js";
import { supabase, IMAGE_BUCKET } from "../lib/supabase";
import { shrinkImage } from "../lib/image";
import { fold, type ImportAction } from "../lib/importText";
import { fetchProductImage, inBatches } from "../lib/openfoodfacts";
import type {
  Category,
  FridgeItem,
  Household,
  Member,
  Product,
  Recipe,
  RecipeIngredient,
  Tracking,
} from "../lib/types";

/** Applique un événement temps réel à une liste locale. */
function patch<T extends { id: string }>(
  list: T[],
  event: RealtimePostgresChangesPayload<Record<string, unknown>>,
): T[] {
  if (event.eventType === "DELETE") {
    const id = (event.old as { id?: string }).id;
    return id ? list.filter((row) => row.id !== id) : list;
  }
  const row = event.new as unknown as T;
  const index = list.findIndex((existing) => existing.id === row.id);
  if (index === -1) return [...list, row];
  const next = list.slice();
  next[index] = row;
  return next;
}

/** Traduit les erreurs Postgres les plus courantes en langage compréhensible. */
function humanize(error: unknown): string {
  const details = error as { code?: string; message?: string } | null;
  switch (details?.code) {
    case "23505":
      return "Un produit porte déjà ce nom dans ce frigo.";
    case "42P01":
      return "Les tables n'existent pas encore : exécute le script SQL dans Supabase.";
    case "42501":
      return "Accès refusé par la base. Vérifie que le script SQL a été exécuté en entier.";
    default:
      return details?.message ?? String(error);
  }
}

export interface ProductDraft {
  id?: string;
  name: string;
  description: string;
  categoryId: string | null;
  tracking: Tracking;
  quantity: number;
  expiresOn: string | null;
  imageFile: File | null;
  removeImage?: boolean;
}

export interface IngredientDraft {
  productId: string | null;
  freeText: string | null;
  quantity: number;
}

export interface RecipeDraft {
  id?: string;
  name: string;
  description: string;
  instructions: string;
  servings: number;
  ingredients: IngredientDraft[];
}

export interface ImportSummary {
  created: number;
  increased: number;
  images: number;
  failures: string[];
}

interface StoreValue {
  session: Session | null;
  household: Household | null;
  members: Member[];
  categories: Category[];
  products: Product[];
  items: FridgeItem[];
  recipes: Recipe[];
  ingredients: RecipeIngredient[];
  ready: boolean;
  notice: string | null;
  dismissNotice: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  createHousehold: (name: string) => Promise<void>;
  joinHousehold: (code: string) => Promise<void>;
  bumpQuantity: (productId: string, delta: number) => Promise<void>;
  bumpFill: (productId: string, delta: number) => Promise<void>;
  saveProduct: (draft: ProductDraft) => Promise<void>;
  deleteProduct: (productId: string) => Promise<void>;
  setExpiry: (productId: string, date: string | null) => Promise<void>;
  setRestock: (productId: string, needed: boolean) => Promise<void>;
  saveRecipe: (draft: RecipeDraft) => Promise<void>;
  deleteRecipe: (recipeId: string) => Promise<void>;
  importRows: (actions: ImportAction[], withImages: boolean) => Promise<ImportSummary>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useStore doit être utilisé dans <StoreProvider>");
  return value;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<FridgeItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [dataReady, setDataReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const householdRef = useRef<string | null>(null);
  householdRef.current = household?.id ?? null;

  const fail = useCallback((error: unknown) => {
    const message = humanize(error);
    setNotice(message);
    throw error instanceof Error ? error : new Error(message);
  }, []);

  // --- session -------------------------------------------------------

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // --- chargement du foyer et de son contenu -------------------------

  const loadEverything = useCallback(async () => {
    if (!session) {
      setHousehold(null);
      setDataReady(true);
      return;
    }

    const membership = await supabase
      .from("household_members")
      .select("household_id")
      .eq("user_id", session.user.id)
      .limit(1)
      .maybeSingle();

    if (membership.error) {
      setNotice(humanize(membership.error));
      setDataReady(true);
      return;
    }
    if (!membership.data) {
      setHousehold(null);
      setDataReady(true);
      return;
    }

    const id = membership.data.household_id as string;
    const [house, mem, cat, prod, itm, rec, ing] = await Promise.all([
      supabase.from("households").select("*").eq("id", id).single(),
      supabase.from("household_members").select("*").eq("household_id", id),
      supabase.from("categories").select("*").eq("household_id", id).order("sort_order"),
      supabase.from("products").select("*").eq("household_id", id).order("name"),
      supabase.from("fridge_items").select("*").eq("household_id", id),
      supabase.from("recipes").select("*").eq("household_id", id).order("name"),
      supabase.from("recipe_ingredients").select("*").order("sort_order"),
    ]);

    const firstError = [house, mem, cat, prod, itm, rec, ing].find((r) => r.error)?.error;
    if (firstError) setNotice(humanize(firstError));

    setHousehold((house.data as Household) ?? null);
    setMembers((mem.data as Member[]) ?? []);
    setCategories((cat.data as Category[]) ?? []);
    setProducts((prod.data as Product[]) ?? []);
    setItems((itm.data as FridgeItem[]) ?? []);
    setRecipes((rec.data as Recipe[]) ?? []);
    setIngredients((ing.data as RecipeIngredient[]) ?? []);
    setDataReady(true);
  }, [session]);

  useEffect(() => {
    setDataReady(false);
    void loadEverything();
  }, [loadEverything]);

  // --- synchronisation temps réel ------------------------------------

  useEffect(() => {
    const id = household?.id;
    if (!id) return;

    const filter = `household_id=eq.${id}`;
    const channel = supabase
      .channel(`frigo:${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "categories", filter },
        (e) => setCategories((list) => patch<Category>(list, e)))
      .on("postgres_changes", { event: "*", schema: "public", table: "products", filter },
        (e) => setProducts((list) => patch<Product>(list, e)))
      .on("postgres_changes", { event: "*", schema: "public", table: "fridge_items", filter },
        (e) => setItems((list) => patch<FridgeItem>(list, e)))
      .on("postgres_changes", { event: "*", schema: "public", table: "recipes", filter },
        (e) => setRecipes((list) => patch<Recipe>(list, e)))
      // recipe_ingredients n'a pas de household_id : la sécurité côté base
      // limite déjà les lignes reçues à celles de nos propres recettes.
      .on("postgres_changes", { event: "*", schema: "public", table: "recipe_ingredients" },
        (e) => setIngredients((list) => patch<RecipeIngredient>(list, e)))
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [household?.id]);

  // --- authentification ----------------------------------------------

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) fail(error);
  }, [fail]);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    if (error) fail(error);
  }, [fail]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setHousehold(null);
    setProducts([]);
    setItems([]);
    setRecipes([]);
    setIngredients([]);
    setCategories([]);
  }, []);

  const createHousehold = useCallback(async (name: string) => {
    const { error } = await supabase.rpc("create_household", { p_name: name });
    if (error) fail(error);
    await loadEverything();
  }, [fail, loadEverything]);

  const joinHousehold = useCallback(async (code: string) => {
    const { error } = await supabase.rpc("join_household", { p_code: code });
    if (error) fail(error);
    await loadEverything();
  }, [fail, loadEverything]);

  // --- quantités (mise à jour optimiste puis confirmation serveur) ----

  const bumpQuantity = useCallback(async (productId: string, delta: number) => {
    setItems((list) => {
      const current = list.find((i) => i.product_id === productId);
      if (!current) return list;
      const next = current.quantity + delta;
      if (next <= 0) return list.filter((i) => i.product_id !== productId);
      return list.map((i) => (i.product_id === productId ? { ...i, quantity: next } : i));
    });
    const { error } = await supabase.rpc("adjust_item", { p_product: productId, p_delta: delta });
    if (error) {
      setNotice(humanize(error));
      await loadEverything();
    }
  }, [loadEverything]);

  const bumpFill = useCallback(async (productId: string, delta: number) => {
    setItems((list) =>
      list.map((i) => {
        if (i.product_id !== productId) return i;
        const fill = Math.min((i.fill_percent ?? 100) + delta, 100);
        return { ...i, fill_percent: Math.max(fill, 0) };
      }),
    );
    const { error } = await supabase.rpc("adjust_fill", { p_product: productId, p_delta: delta });
    if (error) {
      setNotice(humanize(error));
      await loadEverything();
    }
  }, [loadEverything]);

  // --- produits --------------------------------------------------------

  const uploadImage = useCallback(async (houseId: string, productId: string, file: Blob) => {
    const blob = await shrinkImage(file);
    const path = `${houseId}/${productId}-${Date.now()}.webp`;
    const { error } = await supabase.storage
      .from(IMAGE_BUCKET)
      .upload(path, blob, { contentType: "image/webp", upsert: true });
    if (error) fail(error);
    return path;
  }, [fail]);

  const saveProduct = useCallback(async (draft: ProductDraft) => {
    const houseId = householdRef.current;
    if (!houseId) return;

    const base = {
      household_id: houseId,
      name: draft.name.trim(),
      description: draft.description.trim(),
      category_id: draft.categoryId,
      tracking: draft.tracking,
    };

    if (draft.id) {
      const patchBody: Record<string, unknown> = { ...base };
      if (draft.imageFile) {
        patchBody.image_path = await uploadImage(houseId, draft.id, draft.imageFile);
      } else if (draft.removeImage) {
        patchBody.image_path = null;
      }
      const { error } = await supabase.from("products").update(patchBody).eq("id", draft.id);
      if (error) fail(error);

      const existing = items.find((i) => i.product_id === draft.id);

      if (draft.quantity <= 0) {
        // Passer la quantité à zéro depuis le formulaire équivaut à vider le
        // produit : il quitte le frigo et rejoint la liste de courses.
        if (existing) {
          const { error: removeError } = await supabase
            .from("fridge_items")
            .delete()
            .eq("product_id", draft.id);
          if (removeError) fail(removeError);
          const { error: flagError } = await supabase
            .from("products")
            .update({ needs_restock: true })
            .eq("id", draft.id);
          if (flagError) fail(flagError);
        }
      } else if (existing) {
        const { error: itemError } = await supabase
          .from("fridge_items")
          .update({
            quantity: draft.quantity,
            expires_on: draft.expiresOn,
            updated_by: session?.user.id ?? null,
          })
          .eq("product_id", draft.id);
        if (itemError) fail(itemError);
      } else {
        const { error: itemError } = await supabase.from("fridge_items").insert({
          household_id: houseId,
          product_id: draft.id,
          quantity: draft.quantity,
          fill_percent: draft.tracking === "container" ? 100 : null,
          expires_on: draft.expiresOn,
          added_by: session?.user.id ?? null,
          updated_by: session?.user.id ?? null,
        });
        if (itemError) fail(itemError);
        const { error: flagError } = await supabase
          .from("products")
          .update({ needs_restock: false })
          .eq("id", draft.id);
        if (flagError) fail(flagError);
      }
      return;
    }

    const inserted = await supabase.from("products").insert(base).select().single();
    if (inserted.error) fail(inserted.error);
    const product = inserted.data as Product;

    if (draft.imageFile) {
      const path = await uploadImage(houseId, product.id, draft.imageFile);
      const { error } = await supabase.from("products").update({ image_path: path }).eq("id", product.id);
      if (error) fail(error);
    }

    if (draft.quantity > 0) {
      const { error } = await supabase.from("fridge_items").insert({
        household_id: houseId,
        product_id: product.id,
        quantity: draft.quantity,
        fill_percent: draft.tracking === "container" ? 100 : null,
        expires_on: draft.expiresOn,
        added_by: session?.user.id ?? null,
        updated_by: session?.user.id ?? null,
      });
      if (error) fail(error);
    }
  }, [fail, items, session, uploadImage]);

  const deleteProduct = useCallback(async (productId: string) => {
    const { error } = await supabase.from("products").delete().eq("id", productId);
    if (error) fail(error);
  }, [fail]);

  const setExpiry = useCallback(async (productId: string, date: string | null) => {
    setItems((list) =>
      list.map((i) => (i.product_id === productId ? { ...i, expires_on: date } : i)));
    const { error } = await supabase
      .from("fridge_items")
      .update({ expires_on: date })
      .eq("product_id", productId);
    if (error) {
      setNotice(humanize(error));
      await loadEverything();
    }
  }, [loadEverything]);

  const setRestock = useCallback(async (productId: string, needed: boolean) => {
    setProducts((list) =>
      list.map((p) => (p.id === productId ? { ...p, needs_restock: needed } : p)));
    const { error } = await supabase
      .from("products")
      .update({ needs_restock: needed })
      .eq("id", productId);
    if (error) setNotice(error.message);
  }, []);

  // --- recettes --------------------------------------------------------

  const saveRecipe = useCallback(async (draft: RecipeDraft) => {
    const houseId = householdRef.current;
    if (!houseId) return;

    const body = {
      household_id: houseId,
      name: draft.name.trim(),
      description: draft.description.trim(),
      instructions: draft.instructions.trim(),
      servings: draft.servings,
    };

    let recipeId = draft.id;
    if (recipeId) {
      const { error } = await supabase.from("recipes").update(body).eq("id", recipeId);
      if (error) fail(error);
      const { error: clearError } = await supabase
        .from("recipe_ingredients")
        .delete()
        .eq("recipe_id", recipeId);
      if (clearError) fail(clearError);
    } else {
      const created = await supabase.from("recipes").insert(body).select().single();
      if (created.error) fail(created.error);
      recipeId = (created.data as Recipe).id;
    }

    const rows = draft.ingredients
      .filter((i) => i.productId || (i.freeText && i.freeText.trim()))
      .map((i, index) => ({
        recipe_id: recipeId,
        product_id: i.productId,
        free_text: i.productId ? null : i.freeText?.trim() || null,
        quantity: Math.max(1, i.quantity),
        sort_order: index,
      }));

    if (rows.length > 0) {
      const { error } = await supabase.from("recipe_ingredients").insert(rows);
      if (error) fail(error);
    }
    await loadEverything();
  }, [fail, loadEverything]);

  const deleteRecipe = useCallback(async (recipeId: string) => {
    const { error } = await supabase.from("recipes").delete().eq("id", recipeId);
    if (error) fail(error);
  }, [fail]);

  // --- import depuis un fichier texte ----------------------------------

  const importRows = useCallback(
    async (actions: ImportAction[], withImages: boolean): Promise<ImportSummary> => {
      const houseId = householdRef.current;
      const summary: ImportSummary = { created: 0, increased: 0, images: 0, failures: [] };
      if (!houseId) {
        summary.failures.push("Aucun foyer actif.");
        return summary;
      }

      const creates = actions.filter(
        (action): action is Extract<ImportAction, { kind: "create" }> => action.kind === "create",
      );
      const increases = actions.filter(
        (action): action is Extract<ImportAction, { kind: "increase" }> => action.kind === "increase",
      );

      // 1. Les produits inconnus, créés en une seule requête.
      let inserted: Product[] = [];
      if (creates.length > 0) {
        const response = await supabase
          .from("products")
          .insert(
            creates.map((action) => ({
              household_id: houseId,
              name: action.line.name,
              description: action.line.description,
              category_id: action.category?.id ?? null,
              tracking:
                action.category && /boisson|sauce/i.test(action.category.name)
                  ? "container"
                  : "unit",
              created_by: session?.user.id ?? null,
            })),
          )
          .select();
        if (response.error) summary.failures.push(humanize(response.error));
        else inserted = (response.data as Product[]) ?? [];
        summary.created = inserted.length;
      }

      // 2. Leur mise au frigo.
      const insertedByName = new Map(inserted.map((product) => [fold(product.name), product]));
      const itemRows = creates.flatMap((action) => {
        const product = insertedByName.get(fold(action.line.name));
        if (!product) return [];
        return [
          {
            household_id: houseId,
            product_id: product.id,
            quantity: action.line.quantity,
            fill_percent: product.tracking === "container" ? 100 : null,
            expires_on: action.line.expiresOn,
            added_by: session?.user.id ?? null,
            updated_by: session?.user.id ?? null,
          },
        ];
      });
      if (itemRows.length > 0) {
        const { error } = await supabase.from("fridge_items").insert(itemRows);
        if (error) summary.failures.push(humanize(error));
      }

      // 3. Les produits déjà connus : un écart atomique, comme les boutons + et −.
      for (const action of increases) {
        const { error } = await supabase.rpc("adjust_item", {
          p_product: action.product.id,
          p_delta: action.line.quantity,
        });
        if (error) {
          summary.failures.push(`${action.line.name} : ${humanize(error)}`);
          continue;
        }
        summary.increased += 1;
        if (action.line.expiresOn) {
          await supabase
            .from("fridge_items")
            .update({ expires_on: action.line.expiresOn })
            .eq("product_id", action.product.id);
        }
      }

      // 4. Les photos, cherchées par code-barres. Entièrement optionnel :
      //    un échec laisse simplement le produit avec son emoji de catégorie.
      if (withImages) {
        const withCode = creates.flatMap((action) => {
          const product = insertedByName.get(fold(action.line.name));
          return product && action.line.code ? [{ product, code: action.line.code }] : [];
        });
        const results = await inBatches(withCode, 4, async ({ product, code }) => {
          const blob = await fetchProductImage(code);
          if (!blob) return false;
          try {
            const path = await uploadImage(houseId, product.id, blob);
            const { error } = await supabase
              .from("products")
              .update({ image_path: path })
              .eq("id", product.id);
            return !error;
          } catch {
            return false;
          }
        });
        summary.images = results.filter(Boolean).length;
      }

      await loadEverything();
      return summary;
    },
    [session, uploadImage, loadEverything],
  );

  const value = useMemo<StoreValue>(() => ({
    session,
    household,
    members,
    categories,
    products,
    items,
    recipes,
    ingredients,
    ready: authReady && dataReady,
    notice,
    dismissNotice: () => setNotice(null),
    signIn,
    signUp,
    signOut,
    createHousehold,
    joinHousehold,
    bumpQuantity,
    bumpFill,
    saveProduct,
    deleteProduct,
    setExpiry,
    setRestock,
    saveRecipe,
    deleteRecipe,
    importRows,
  }), [
    session, household, members, categories, products, items, recipes, ingredients,
    authReady, dataReady, notice, signIn, signUp, signOut, createHousehold, joinHousehold,
    bumpQuantity, bumpFill, saveProduct, deleteProduct, setExpiry, setRestock,
    saveRecipe, deleteRecipe, importRows,
  ]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
