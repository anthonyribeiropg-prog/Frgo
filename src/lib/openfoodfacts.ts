/**
 * Récupère la photo d'un produit à partir de son code-barres, via la base
 * ouverte Open Food Facts. Les factures Carrefour portent l'EAN13 de chaque
 * article : autant s'en servir plutôt que de photographier 33 produits.
 *
 * Tout échec est silencieux — le produit est simplement créé sans photo.
 */
export async function fetchProductImage(code: string): Promise<Blob | null> {
  if (!/^\d{8,14}$/.test(code)) return null;

  try {
    const lookup = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=image_front_url,image_url`,
      { headers: { Accept: "application/json" } },
    );
    if (!lookup.ok) return null;

    const payload = (await lookup.json()) as {
      product?: { image_front_url?: string; image_url?: string };
    };
    const url = payload.product?.image_front_url ?? payload.product?.image_url;
    if (!url) return null;

    const image = await fetch(url);
    if (!image.ok) return null;

    const blob = await image.blob();
    return blob.size > 0 && blob.type.startsWith("image/") ? blob : null;
  } catch {
    return null;
  }
}

/** Exécute des tâches par petits paquets pour ne pas saturer le réseau. */
export async function inBatches<T, R>(
  items: T[],
  size: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += size) {
    const slice = items.slice(index, index + size);
    results.push(...(await Promise.all(slice.map(task))));
  }
  return results;
}
