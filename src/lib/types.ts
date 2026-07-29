export type Zone = "shelf" | "drawer" | "door";
export type Tracking = "unit" | "container";

export interface Household {
  id: string;
  name: string;
  invite_code: string;
  created_at: string;
}

export interface Member {
  household_id: string;
  user_id: string;
  display_name: string;
  joined_at: string;
}

export interface Category {
  id: string;
  household_id: string;
  name: string;
  emoji: string;
  color: string;
  zone: Zone;
  sort_order: number;
}

export interface Product {
  id: string;
  household_id: string;
  name: string;
  description: string;
  category_id: string | null;
  image_path: string | null;
  tracking: Tracking;
  needs_restock: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FridgeItem {
  id: string;
  household_id: string;
  product_id: string;
  quantity: number;
  fill_percent: number | null;
  expires_on: string | null;
  added_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Recipe {
  id: string;
  household_id: string;
  name: string;
  description: string;
  instructions: string;
  servings: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  product_id: string | null;
  free_text: string | null;
  quantity: number;
  sort_order: number;
}

/** Un produit du catalogue enrichi de sa présence réelle dans le frigo. */
export interface StockedProduct {
  product: Product;
  category: Category | null;
  item: FridgeItem | null;
}
