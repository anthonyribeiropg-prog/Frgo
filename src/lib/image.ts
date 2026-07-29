/**
 * Réduit et convertit une photo en WebP avant l'envoi.
 * Une photo de téléphone fait 4 à 8 Mo ; on la ramène à ~40 Ko, ce qui rend
 * l'ajout instantané même en 4G et garde le stockage Supabase au minimum.
 */
export async function shrinkImage(file: Blob, maxSide = 720): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Impossible de préparer l'image");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.82),
  );
  if (!blob) throw new Error("Impossible de convertir l'image");
  return blob;
}

export const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp";
