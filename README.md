# Le Frigo

Application web partagée à deux : ce qu'il reste dans le frigo, la liste de courses qui se
remplit toute seule, et les recettes réalisables avec ce qu'on a.

Front React + Vite + Tailwind, base et synchronisation temps réel sur Supabase.

## Mise en route

### 1. Créer le schéma

Ouvre **Supabase → SQL Editor → New query**, colle l'intégralité de
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) et lance **Run**.

Le script crée les tables, les règles d'accès, les fonctions de comptage, le bucket d'images
et active la synchronisation temps réel. Il est ré-exécutable sans dommage.

### 2. Désactiver la confirmation par e-mail

**Authentication → Sign In / Providers → Email → Confirm email : off.**

Sans ça, chaque création de compte attend un e-mail de validation. Le service d'envoi intégré
à Supabase est limité à quelques messages par heure et ne sert que les adresses de l'équipe du
projet : le compte de la seconde personne resterait bloqué.

### 3. Lancer l'application

```bash
npm run dev
```

Le premier de vous deux crée son compte puis le frigo, et récupère le **code d'invitation**
affiché en haut à droite. La seconde personne crée son compte, choisit « Rejoindre » et saisit
ce code.

## Comment ça marche

**Deux listes, pas une.** `products` est le catalogue permanent — nom, photo, description,
catégorie. `fridge_items` ne contient que ce qui est réellement dans le frigo. Quand la
quantité tombe à zéro, la ligne `fridge_items` disparaît mais la fiche produit reste : elle
bascule dans l'onglet Produits marquée « à racheter », et un clic sur « Au frigo » la remet en
rayon sans rien ressaisir.

**Les boutons + et − envoient un écart, pas une valeur.** La fonction `adjust_item(produit,
delta)` calcule la nouvelle quantité côté base. Si vous cliquez tous les deux sur « − » au même
instant, les deux clics comptent — alors qu'un « mets la quantité à 3 » envoyé deux fois en
perdrait un. L'écran se met à jour immédiatement sans attendre la réponse, puis la base
confirme.

**Le rangement est automatique.** Chaque catégorie porte une zone (`shelf`, `drawer`, `door`) :
les boissons et les sauces vont dans la porte, les légumes et les fruits dans les bacs, le
reste sur les étagères. Rien à glisser-déposer.

**Les boissons se comptent en contenants.** Un produit marqué « se compte en contenants » a un
nombre de bouteilles *et* un niveau de remplissage pour celle qui est entamée. À 0 %, la
bouteille est décomptée et la suivante repart à 100 %.

**Les recettes ne touchent jamais au stock.** Chaque recette affiche son taux de faisabilité et
ce qui manque ; les recettes réalisables remontent en tête. Les ingrédients saisis en texte
libre (sel, huile, poivre) sont affichés mais exclus du calcul.

**Les photos sont réduites dans le navigateur** avant l'envoi : une photo de téléphone de 6 Mo
part en WebP d'environ 40 Ko.

## Importer une liste de courses

Onglet **Produits → Importer une liste**. On dépose un `.txt` ou on colle son
contenu ; un aperçu montre ligne par ligne ce qui va être créé, réapprovisionné
ou ignoré, et rien n'est écrit en base avant validation.

```
# nom | quantité | catégorie | péremption | description | code-barres
[Boissons]
Tropico Orange Ananas | 2 | Boissons | | Boisson aux fruits | 5449000335579
```

Seul le nom est obligatoire. Pour une liste écrite à la main, les raccourcis
`Tomates x3`, `2x Oignons` et `Yaourt !2026-08-04` évitent les barres, et un
en-tête `[Légumes]` s'applique aux lignes suivantes.

Un produit déjà connu n'est pas dupliqué : sa quantité augmente via la même
fonction atomique que les boutons + et −. Un produit cité deux fois dans le
fichier voit ses quantités additionnées.

Quand la ligne porte un code-barres, l'application propose de récupérer la
photo sur **Open Food Facts**. Sur un échantillon de dix articles d'une facture
Carrefour, huit ont été trouvés ; les autres gardent l'emoji de leur catégorie.

### L'agent de conversion

`~/.claude/agents/facture-vers-frigo.md` convertit une facture PDF, une photo
de ticket ou une liste en vrac vers ce format. Il connaît deux pièges de ce
type de document : la quantité **livrée** diffère de la quantité commandée
(sur la facture d'exemple, 8 articles sur 33 n'ont pas été livrés), et les
libellés d'enseigne sont trop longs pour une vignette. Les résultats vont dans
`imports/`.

## Déploiement

Cloudflare Pages ou Vercel, avec `npm run build` et le dossier `dist`. Les deux variables
`VITE_SUPABASE_URL` et `VITE_SUPABASE_KEY` sont à recopier dans les variables d'environnement
de l'hébergeur.

## Notes de sécurité

La clé présente dans `.env.local` est la clé **publiable** : elle est faite pour vivre dans le
code du navigateur, et ce sont les règles d'accès en base qui protègent les données. Une clé
**secrète** ne doit jamais être placée dans ce projet — elle contourne toutes ces règles.

Le code d'invitation fait six caractères. C'est suffisant entre vous deux, mais si le frigo
devait un jour contenir des informations sensibles, il faudrait le rallonger et limiter le
nombre de tentatives sur `join_household`.
