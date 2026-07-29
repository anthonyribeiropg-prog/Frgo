import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined;

if (!url || !key) {
  throw new Error(
    "VITE_SUPABASE_URL et VITE_SUPABASE_KEY doivent être définies dans .env.local",
  );
}

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  realtime: { params: { eventsPerSecond: 20 } },
});

export const IMAGE_BUCKET = "product-images";

export function imageUrl(path: string | null): string | null {
  if (!path) return null;
  return supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}
