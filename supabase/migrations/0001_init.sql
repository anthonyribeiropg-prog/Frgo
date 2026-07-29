-- =====================================================================
--  LE FRIGO — schéma initial
--  À coller tel quel dans Supabase → SQL Editor → New query → Run.
--  Le script est ré-exécutable sans dommage (idempotent).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------

create table if not exists public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Notre frigo',
  invite_code text not null unique default upper(substr(md5(random()::text), 1, 6)),
  created_at  timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text not null default '',
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists public.categories (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null,
  emoji        text not null default '🍽️',
  color        text not null default '#94a3b8',
  -- zone de rangement automatique dans le visuel du frigo
  zone         text not null default 'shelf' check (zone in ('shelf', 'drawer', 'door')),
  sort_order   int  not null default 0
);

create table if not exists public.products (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  name          text not null,
  description   text not null default '',
  category_id   uuid references public.categories(id) on delete set null,
  image_path    text,
  -- 'unit'      : on compte des pièces (3 yaourts)
  -- 'container' : on compte des contenants + le remplissage de celui qui est entamé
  tracking      text not null default 'unit' check (tracking in ('unit', 'container')),
  needs_restock boolean not null default false,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists products_household_name_idx
  on public.products (household_id, lower(name));

create table if not exists public.fridge_items (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  product_id   uuid not null unique references public.products(id) on delete cascade,
  quantity     int  not null default 1 check (quantity >= 0),
  fill_percent int  check (fill_percent between 0 and 100),
  expires_on   date,
  added_by     uuid references auth.users(id) on delete set null,
  updated_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.recipes (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null,
  description  text not null default '',
  instructions text not null default '',
  servings     int  not null default 2,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.recipe_ingredients (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references public.recipes(id) on delete cascade,
  -- soit un produit du catalogue (compte dans la faisabilité)…
  product_id uuid references public.products(id) on delete cascade,
  -- …soit du texte libre type « sel, poivre » (jamais compté)
  free_text  text,
  quantity   int  not null default 1 check (quantity > 0),
  sort_order int  not null default 0,
  constraint recipe_ingredient_target check (product_id is not null or free_text is not null)
);

create index if not exists recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id);

-- ---------------------------------------------------------------------
-- 2. HORODATAGE AUTOMATIQUE
-- ---------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['products', 'fridge_items', 'recipes'] loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s', t);
    execute format(
      'create trigger touch_%1$s before update on public.%1$s
       for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. SÉCURITÉ — qui a le droit de voir quoi
--    is_member() est en SECURITY DEFINER pour éviter une récursion
--    infinie quand la policy de household_members l'appelle.
-- ---------------------------------------------------------------------

create or replace function public.is_member(h uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = h and m.user_id = auth.uid()
  );
$$;

alter table public.households         enable row level security;
alter table public.household_members  enable row level security;
alter table public.categories         enable row level security;
alter table public.products           enable row level security;
alter table public.fridge_items       enable row level security;
alter table public.recipes            enable row level security;
alter table public.recipe_ingredients enable row level security;

-- Foyer : lecture et renommage réservés aux membres. La création passe
-- exclusivement par create_household(), il n'y a donc pas de policy INSERT.
drop policy if exists households_read on public.households;
create policy households_read on public.households
  for select to authenticated using (public.is_member(id));

drop policy if exists households_update on public.households;
create policy households_update on public.households
  for update to authenticated using (public.is_member(id)) with check (public.is_member(id));

-- Membres : on voit ses colocataires, on peut partir de soi-même.
drop policy if exists members_read on public.household_members;
create policy members_read on public.household_members
  for select to authenticated using (public.is_member(household_id));

drop policy if exists members_leave on public.household_members;
create policy members_leave on public.household_members
  for delete to authenticated using (user_id = auth.uid());

-- Tables métier : accès complet aux membres du foyer, rien pour les autres.
do $$
declare t text;
begin
  foreach t in array array['categories', 'products', 'fridge_items', 'recipes'] loop
    execute format('drop policy if exists %1$s_all on public.%1$s', t);
    execute format(
      'create policy %1$s_all on public.%1$s for all to authenticated
       using (public.is_member(household_id)) with check (public.is_member(household_id))', t);
  end loop;
end $$;

-- Les ingrédients héritent des droits de leur recette.
drop policy if exists recipe_ingredients_all on public.recipe_ingredients;
create policy recipe_ingredients_all on public.recipe_ingredients
  for all to authenticated
  using (exists (
    select 1 from public.recipes r
    where r.id = recipe_id and public.is_member(r.household_id)))
  with check (exists (
    select 1 from public.recipes r
    where r.id = recipe_id and public.is_member(r.household_id)));

-- ---------------------------------------------------------------------
-- 4. FONCTIONS MÉTIER
-- ---------------------------------------------------------------------

-- Crée le foyer, y inscrit l'appelant et installe les catégories par défaut.
create or replace function public.create_household(p_name text default 'Notre frigo')
returns public.households
language plpgsql
security definer
set search_path = public
as $$
declare
  v_house public.households;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;

  insert into public.households (name) values (coalesce(nullif(trim(p_name), ''), 'Notre frigo'))
  returning * into v_house;

  insert into public.household_members (household_id, user_id, display_name)
  values (v_house.id, auth.uid(),
          coalesce(nullif(trim((auth.jwt() -> 'user_metadata' ->> 'display_name')), ''),
                   split_part(coalesce(auth.jwt() ->> 'email', 'moi'), '@', 1)));

  insert into public.categories (household_id, name, emoji, color, zone, sort_order) values
    (v_house.id, 'Légumes',          '🥕', '#65a30d', 'drawer', 1),
    (v_house.id, 'Fruits',           '🍎', '#e11d48', 'drawer', 2),
    (v_house.id, 'Laitages',         '🧀', '#f59e0b', 'shelf',  3),
    (v_house.id, 'Viandes-Poissons', '🥩', '#be123c', 'shelf',  4),
    (v_house.id, 'Œufs',             '🥚', '#eab308', 'door',   5),
    (v_house.id, 'Boissons',         '🥤', '#0ea5e9', 'door',   6),
    (v_house.id, 'Sauces',           '🫙', '#7c3aed', 'door',   7),
    (v_house.id, 'Restes',           '🍲', '#0d9488', 'shelf',  8),
    (v_house.id, 'Autre',            '🍽️', '#64748b', 'shelf',  9);

  return v_house;
end;
$$;

-- Rejoint un foyer existant à partir de son code d'invitation.
create or replace function public.join_household(p_code text)
returns public.households
language plpgsql
security definer
set search_path = public
as $$
declare
  v_house public.households;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;

  select * into v_house from public.households
  where invite_code = upper(trim(p_code));

  if v_house.id is null then
    raise exception 'Code d''invitation inconnu';
  end if;

  insert into public.household_members (household_id, user_id, display_name)
  values (v_house.id, auth.uid(),
          coalesce(nullif(trim((auth.jwt() -> 'user_metadata' ->> 'display_name')), ''),
                   split_part(coalesce(auth.jwt() ->> 'email', 'moi'), '@', 1)))
  on conflict do nothing;

  return v_house;
end;
$$;

-- Incrémente ou décrémente la quantité d'un produit.
-- On transmet un DELTA et non une valeur absolue : si vous cliquez tous
-- les deux sur « − » en même temps, les deux clics sont pris en compte.
-- Quantité tombée à zéro => le produit sort du frigo et passe « à racheter ».
create or replace function public.adjust_item(p_product uuid, p_delta int)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_house uuid;
  v_qty   int;
begin
  select household_id into v_house from public.products where id = p_product;
  if v_house is null then
    raise exception 'Produit introuvable';
  end if;

  insert into public.fridge_items as fi
         (household_id, product_id, quantity, fill_percent, added_by, updated_by)
  values (v_house, p_product, greatest(p_delta, 0),
          case when (select tracking from public.products where id = p_product) = 'container'
               then 100 end,
          auth.uid(), auth.uid())
  on conflict (product_id) do update
    set quantity   = greatest(fi.quantity + p_delta, 0),
        updated_by = auth.uid()
  returning fi.quantity into v_qty;

  if v_qty <= 0 then
    delete from public.fridge_items where product_id = p_product;
    update public.products set needs_restock = true where id = p_product;
  else
    update public.products set needs_restock = false
    where id = p_product and needs_restock;
  end if;
end;
$$;

-- Ajuste le remplissage du contenant entamé (bouteille à moitié vide…).
-- Arrivé à 0 %, le contenant est décompté et le suivant repart à 100 %.
create or replace function public.adjust_fill(p_product uuid, p_delta int)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_qty  int;
  v_fill int;
begin
  select quantity, coalesce(fill_percent, 100) into v_qty, v_fill
  from public.fridge_items where product_id = p_product for update;

  if not found then
    return;
  end if;

  v_fill := least(v_fill + p_delta, 100);

  if v_fill <= 0 then
    v_qty := v_qty - 1;
    if v_qty <= 0 then
      delete from public.fridge_items where product_id = p_product;
      update public.products set needs_restock = true where id = p_product;
      return;
    end if;
    v_fill := 100;
  end if;

  update public.fridge_items
     set quantity = v_qty, fill_percent = v_fill, updated_by = auth.uid()
   where product_id = p_product;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. SYNCHRONISATION TEMPS RÉEL
--    REPLICA IDENTITY FULL est indispensable : sans elle, un DELETE
--    n'expose que la clé primaire, la sécurité ne peut pas être évaluée
--    et l'événement n'arrive jamais sur l'autre écran.
-- ---------------------------------------------------------------------

do $$
declare
  t text;
  has_publication boolean;
begin
  select exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    into has_publication;

  foreach t in array array['categories', 'products', 'fridge_items', 'recipes', 'recipe_ingredients'] loop
    execute format('alter table public.%I replica identity full', t);

    if has_publication and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;

  if not has_publication then
    raise notice 'Publication supabase_realtime absente : activez Realtime sur les tables depuis le tableau de bord.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 6. IMAGES DES PRODUITS
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

drop policy if exists frigo_images_read on storage.objects;
create policy frigo_images_read on storage.objects
  for select using (bucket_id = 'product-images');

drop policy if exists frigo_images_write on storage.objects;
create policy frigo_images_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images'
              and public.is_member(((storage.foldername(name))[1])::uuid));

drop policy if exists frigo_images_delete on storage.objects;
create policy frigo_images_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images'
         and public.is_member(((storage.foldername(name))[1])::uuid));

-- ---------------------------------------------------------------------
-- 7. EXPOSITION À L'API
--    « Automatically expose new tables » est désactivé sur ce projet :
--    chaque table doit donc être ouverte explicitement ici.
-- ---------------------------------------------------------------------

grant usage on schema public to authenticated;

grant select, insert, update, delete on
  public.households, public.household_members, public.categories,
  public.products, public.fridge_items, public.recipes, public.recipe_ingredients
  to authenticated;

grant execute on function public.is_member(uuid)            to authenticated;
grant execute on function public.create_household(text)     to authenticated;
grant execute on function public.join_household(text)       to authenticated;
grant execute on function public.adjust_item(uuid, int)     to authenticated;
grant execute on function public.adjust_fill(uuid, int)     to authenticated;

-- Force la relecture immédiate du schéma par l'API : sans ça, les premières
-- requêtes peuvent répondre « table introuvable » pendant une poignée de secondes.
notify pgrst, 'reload schema';
