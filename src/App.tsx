import { useState } from "react";
import { useStore } from "./state/store";
import { useOutOfFridge } from "./state/derived";
import { Auth } from "./components/Auth";
import { Onboarding } from "./components/Onboarding";
import { Fridge } from "./components/Fridge";
import { ProductList } from "./components/ProductList";
import { ProductDialog } from "./components/ProductDialog";
import { ProductsScreen } from "./components/ProductsScreen";
import { RecipesScreen } from "./components/RecipesScreen";
import { RecipeDialog } from "./components/RecipeDialog";
import { ImportDialog } from "./components/ImportDialog";
import { Spinner, Toast } from "./components/ui";
import type { Recipe, StockedProduct } from "./lib/types";

type Tab = "fridge" | "products" | "recipes";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "fridge", label: "Frigo", icon: "🧊" },
  { key: "products", label: "Produits", icon: "🛒" },
  { key: "recipes", label: "Recettes", icon: "🍳" },
];

function InviteCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      onClick={() => void copy()}
      title="Copier le code à transmettre pour rejoindre ce frigo"
      className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
    >
      {copied ? "Code copié" : `Code ${code}`}
    </button>
  );
}

function Shell() {
  const { household, signOut, session } = useStore();
  const outOfFridge = useOutOfFridge();
  const shoppingCount = outOfFridge.filter((entry) => entry.product.needs_restock).length;

  const [tab, setTab] = useState<Tab>("fridge");
  const [productOpen, setProductOpen] = useState(false);
  const [editedProduct, setEditedProduct] = useState<StockedProduct | null>(null);
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [editedRecipe, setEditedRecipe] = useState<Recipe | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const openProduct = (entry: StockedProduct | null) => {
    setEditedProduct(entry);
    setProductOpen(true);
  };
  const openRecipe = (recipe: Recipe | null) => {
    setEditedRecipe(recipe);
    setRecipeOpen(true);
  };

  const addFromCurrentTab = () => (tab === "recipes" ? openRecipe(null) : openProduct(null));

  return (
    <div className="flex h-full flex-col">
      <header className="z-20 flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
        <span className="text-xl">🧊</span>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-bold text-slate-900">
            {household?.name ?? "Le Frigo"}
          </h1>
          <p className="truncate text-xs text-slate-500">{session?.user.email}</p>
        </div>

        <nav className="mx-auto hidden gap-1 rounded-xl bg-slate-100 p-1 lg:flex">
          {TABS.map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`relative rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                tab === item.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
              }`}
            >
              {item.label}
              {item.key === "products" && shoppingCount > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-[10px] text-white">
                  {shoppingCount}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {household && <InviteCode code={household.invite_code} />}
          <button
            onClick={() => void signOut()}
            className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
          >
            Quitter
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto lg:overflow-hidden">
        {tab === "fridge" && (
          <div className="lg:flex lg:h-full">
            <div className="p-4 lg:flex-1 lg:overflow-y-auto lg:p-6">
              <Fridge onEdit={openProduct} />
            </div>
            <aside className="border-t border-slate-200 bg-white lg:h-full lg:w-[380px] lg:shrink-0 lg:border-t-0 lg:border-l">
              <ProductList onEdit={openProduct} />
            </aside>
          </div>
        )}

        {tab === "products" && (
          <div className="lg:h-full lg:overflow-y-auto">
            <ProductsScreen
              onEdit={openProduct}
              onAdd={() => openProduct(null)}
              onImport={() => setImportOpen(true)}
            />
          </div>
        )}

        {tab === "recipes" && (
          <div className="lg:h-full lg:overflow-y-auto">
            <RecipesScreen onEdit={openRecipe} onAdd={() => openRecipe(null)} />
          </div>
        )}
      </main>

      {/* barre d'onglets au pouce, sur mobile uniquement */}
      <nav className="z-20 flex shrink-0 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        {TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold transition ${
              tab === item.key ? "text-teal-700" : "text-slate-400"
            }`}
          >
            <span className="text-lg leading-none">{item.icon}</span>
            {item.label}
            {item.key === "products" && shoppingCount > 0 && (
              <span className="absolute top-1.5 right-[28%] rounded-full bg-amber-500 px-1.5 text-[10px] text-white">
                {shoppingCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      <button
        onClick={addFromCurrentTab}
        aria-label={tab === "recipes" ? "Nouvelle recette" : "Ajouter un produit"}
        className="fixed right-5 bottom-20 z-30 grid h-14 w-14 place-items-center rounded-full bg-teal-600 text-3xl text-white shadow-lg shadow-teal-600/30 transition hover:bg-teal-700 active:scale-95 lg:bottom-6"
      >
        +
      </button>

      <ProductDialog
        open={productOpen}
        entry={editedProduct}
        onClose={() => setProductOpen(false)}
      />
      <RecipeDialog open={recipeOpen} recipe={editedRecipe} onClose={() => setRecipeOpen(false)} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}

export default function App() {
  const { ready, session, household, notice, dismissNotice } = useStore();

  const toast = notice ? <Toast message={notice} onDismiss={dismissNotice} /> : null;

  if (!ready) return <Spinner label="Ouverture du frigo…" />;

  return (
    <>
      {!session ? <Auth /> : !household ? <Onboarding /> : <Shell />}
      {toast}
    </>
  );
}
