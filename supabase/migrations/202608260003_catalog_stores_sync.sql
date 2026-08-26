begin;

create table public.categories (
  id uuid primary key,
  house_id uuid not null references public.houses (id) on delete cascade,
  key text,
  name text not null check (char_length(trim(name)) between 1 and 120),
  normalized_name text not null check (char_length(trim(normalized_name)) between 1 and 120),
  active boolean not null default true,
  created_by uuid not null references public.profiles (id) on delete restrict,
  updated_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  constraint categories_house_id_id_unique unique (house_id, id),
  constraint categories_key_valid check (
    key is null or key in ('mercearia', 'hortifruti', 'laticinios', 'limpeza', 'higiene', 'bebidas', 'padaria', 'acougue', 'congelados', 'pet', 'outros')
  ),
  constraint categories_deleted_after_created check (deleted_at is null or deleted_at >= created_at)
);

create unique index categories_house_key_active_uidx
  on public.categories (house_id, key) where key is not null and deleted_at is null;
create unique index categories_house_name_active_uidx
  on public.categories (house_id, normalized_name) where deleted_at is null;
create index categories_house_updated_idx on public.categories (house_id, updated_at, id);

create table public.products (
  id uuid primary key,
  house_id uuid not null references public.houses (id) on delete cascade,
  category_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 200),
  normalized_name text not null check (char_length(trim(normalized_name)) between 1 and 200),
  brand text not null default '',
  default_quantity numeric(12, 3) check (default_quantity is null or default_quantity > 0),
  default_unit text not null check (default_unit in ('unidade', 'pacote', 'caixa', 'kg', 'g', 'litro', 'ml', 'garrafa', 'lata', 'dúzia')),
  notes text not null default '',
  favorite boolean not null default false,
  is_recurring boolean not null default false,
  recurrence_days integer check (recurrence_days is null or recurrence_days between 1 and 365),
  active boolean not null default true,
  created_by uuid not null references public.profiles (id) on delete restrict,
  updated_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  constraint products_category_same_house_fk
    foreign key (house_id, category_id) references public.categories (house_id, id) on delete restrict,
  constraint products_recurrence_valid check (
    (is_recurring and recurrence_days is not null) or (not is_recurring and recurrence_days is null)
  ),
  constraint products_deleted_after_created check (deleted_at is null or deleted_at >= created_at)
);

create unique index products_house_name_active_uidx
  on public.products (house_id, normalized_name) where deleted_at is null;
create index products_house_updated_idx on public.products (house_id, updated_at, id);
create index products_category_active_idx on public.products (category_id) where deleted_at is null;

create table public.stores (
  id uuid primary key,
  house_id uuid not null references public.houses (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  normalized_name text not null check (char_length(trim(normalized_name)) between 1 and 160),
  nickname text not null default '',
  address text not null default '',
  notes text not null default '',
  active boolean not null default true,
  created_by uuid not null references public.profiles (id) on delete restrict,
  updated_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  constraint stores_deleted_after_created check (deleted_at is null or deleted_at >= created_at)
);

create unique index stores_house_name_active_uidx
  on public.stores (house_id, normalized_name) where deleted_at is null;
create index stores_house_updated_idx on public.stores (house_id, updated_at, id);

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.stores enable row level security;
alter table public.categories replica identity full;
alter table public.products replica identity full;
alter table public.stores replica identity full;

create policy "categories_select_active_members" on public.categories for select to authenticated
using ((select private.is_house_member(house_id)));
create policy "categories_insert_active_members" on public.categories for insert to authenticated
with check ((select private.is_house_member(house_id)) and created_by = (select auth.uid()) and updated_by = (select auth.uid()));
create policy "categories_update_active_members" on public.categories for update to authenticated
using ((select private.is_house_member(house_id)))
with check ((select private.is_house_member(house_id)) and updated_by = (select auth.uid()));

create policy "products_select_active_members" on public.products for select to authenticated
using ((select private.is_house_member(house_id)));
create policy "products_insert_active_members" on public.products for insert to authenticated
with check ((select private.is_house_member(house_id)) and created_by = (select auth.uid()) and updated_by = (select auth.uid()));
create policy "products_update_active_members" on public.products for update to authenticated
using ((select private.is_house_member(house_id)))
with check ((select private.is_house_member(house_id)) and updated_by = (select auth.uid()));

create policy "stores_select_active_members" on public.stores for select to authenticated
using ((select private.is_house_member(house_id)));
create policy "stores_insert_active_members" on public.stores for insert to authenticated
with check ((select private.is_house_member(house_id)) and created_by = (select auth.uid()) and updated_by = (select auth.uid()));
create policy "stores_update_active_members" on public.stores for update to authenticated
using ((select private.is_house_member(house_id)))
with check ((select private.is_house_member(house_id)) and updated_by = (select auth.uid()));

grant select on public.categories, public.products, public.stores to authenticated;
grant insert, update on public.categories, public.products, public.stores to authenticated;

create function private.ensure_default_categories(target_house_id uuid, actor_id uuid)
returns void language plpgsql set search_path = '' as $$
begin
  with defaults(key, name, normalized_name) as (values
    ('mercearia', 'Mercearia', 'mercearia'),
    ('hortifruti', 'Hortifruti', 'hortifruti'),
    ('laticinios', 'Laticínios', 'laticinios'),
    ('limpeza', 'Limpeza', 'limpeza'),
    ('higiene', 'Higiene', 'higiene'),
    ('bebidas', 'Bebidas', 'bebidas'),
    ('padaria', 'Padaria', 'padaria'),
    ('acougue', 'Açougue', 'acougue'),
    ('congelados', 'Congelados', 'congelados'),
    ('pet', 'Pet', 'pet'),
    ('outros', 'Outros', 'outros')
  )
  update public.categories existing
  set key = defaults.key, updated_by = actor_id, updated_at = greatest(existing.updated_at, now())
  from defaults
  where existing.house_id = target_house_id
    and existing.normalized_name = defaults.normalized_name
    and existing.key is null
    and existing.deleted_at is null
    and not exists (
      select 1 from public.categories keyed
      where keyed.house_id = target_house_id and keyed.key = defaults.key and keyed.deleted_at is null
    );

  insert into public.categories (
    id, house_id, key, name, normalized_name, active, created_by, updated_by, created_at, updated_at
  )
  select extensions.gen_random_uuid(), target_house_id, defaults.key, defaults.name,
    defaults.normalized_name, true, actor_id, actor_id, now(), now()
  from (values
    ('mercearia', 'Mercearia', 'mercearia'),
    ('hortifruti', 'Hortifruti', 'hortifruti'),
    ('laticinios', 'Laticínios', 'laticinios'),
    ('limpeza', 'Limpeza', 'limpeza'),
    ('higiene', 'Higiene', 'higiene'),
    ('bebidas', 'Bebidas', 'bebidas'),
    ('padaria', 'Padaria', 'padaria'),
    ('acougue', 'Açougue', 'acougue'),
    ('congelados', 'Congelados', 'congelados'),
    ('pet', 'Pet', 'pet'),
    ('outros', 'Outros', 'outros')
  ) as defaults(key, name, normalized_name)
  where not exists (
    select 1 from public.categories existing
    where existing.house_id = target_house_id and existing.key = defaults.key and existing.deleted_at is null
  )
  on conflict do nothing;
end;
$$;

revoke all on function private.ensure_default_categories(uuid, uuid) from public, anon, authenticated;

select private.ensure_default_categories(id, created_by) from public.houses;

create or replace function public.create_house(house_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_house_id uuid; clean_name text := trim(house_name);
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if char_length(clean_name) not between 1 and 120 then raise exception 'invalid_house_name'; end if;
  insert into public.houses (name, created_by) values (clean_name, auth.uid()) returning id into new_house_id;
  insert into public.house_members (house_id, user_id, role, status) values (new_house_id, auth.uid(), 'owner', 'active');
  perform private.ensure_default_categories(new_house_id, auth.uid());
  return new_house_id;
end;
$$;

create function public.apply_category(
  item_id uuid, target_house_id uuid, item_key text, item_name text,
  item_normalized_name text, item_active boolean, item_created_at timestamptz,
  item_updated_at timestamptz, item_deleted_at timestamptz
) returns setof public.categories language plpgsql set search_path = '' as $$
declare resolved_id uuid := item_id;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not private.is_house_member(target_house_id) then raise exception 'house_membership_required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('category-name:' || target_house_id::text || ':' || item_normalized_name, 0)
  );
  if nullif(item_key, '') is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('category-key:' || target_house_id::text || ':' || item_key, 0)
    );
  end if;
  select candidate.id into resolved_id
  from public.categories candidate
  where candidate.house_id = target_house_id
    and (
      candidate.id = item_id
      or (candidate.deleted_at is null and candidate.normalized_name = trim(item_normalized_name))
      or (nullif(item_key, '') is not null and candidate.deleted_at is null and candidate.key = nullif(item_key, ''))
    )
  order by (candidate.id = item_id) desc
  limit 1;
  resolved_id := coalesce(resolved_id, item_id);
  return query insert into public.categories
    (id, house_id, key, name, normalized_name, active, created_by, updated_by, created_at, updated_at, deleted_at)
  values (resolved_id, target_house_id, nullif(item_key, ''), trim(item_name), trim(item_normalized_name),
    item_active, auth.uid(), auth.uid(), item_created_at, item_updated_at, item_deleted_at)
  on conflict (id) do update set key=excluded.key, name=excluded.name,
    normalized_name=excluded.normalized_name, active=excluded.active, updated_by=auth.uid(),
    updated_at=excluded.updated_at, deleted_at=excluded.deleted_at
  where public.categories.house_id=excluded.house_id and
    (excluded.updated_at > public.categories.updated_at or
      (excluded.updated_at = public.categories.updated_at and excluded.deleted_at is not null and public.categories.deleted_at is null))
  returning *;
  if not found then return query select * from public.categories where id=resolved_id and house_id=target_house_id; end if;
end; $$;

create function public.apply_product(
  item_id uuid, target_house_id uuid, target_category_id uuid, item_name text,
  item_normalized_name text, item_brand text, item_default_quantity numeric,
  item_default_unit text, item_notes text, item_favorite boolean, item_is_recurring boolean,
  item_recurrence_days integer, item_active boolean, item_created_at timestamptz,
  item_updated_at timestamptz, item_deleted_at timestamptz
) returns setof public.products language plpgsql set search_path = '' as $$
declare resolved_id uuid := item_id;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not private.is_house_member(target_house_id) then raise exception 'house_membership_required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('product:' || target_house_id::text || ':' || item_normalized_name, 0)
  );
  select candidate.id into resolved_id
  from public.products candidate
  where candidate.house_id = target_house_id
    and (
      candidate.id = item_id
      or (candidate.deleted_at is null and candidate.normalized_name = trim(item_normalized_name))
    )
  order by (candidate.id = item_id) desc
  limit 1;
  resolved_id := coalesce(resolved_id, item_id);
  return query insert into public.products
    (id, house_id, category_id, name, normalized_name, brand, default_quantity, default_unit,
     notes, favorite, is_recurring, recurrence_days, active, created_by, updated_by, created_at, updated_at, deleted_at)
  values (resolved_id, target_house_id, target_category_id, trim(item_name), trim(item_normalized_name),
    coalesce(trim(item_brand),''), item_default_quantity, item_default_unit, coalesce(trim(item_notes),''),
    item_favorite, item_is_recurring, item_recurrence_days, item_active, auth.uid(), auth.uid(),
    item_created_at, item_updated_at, item_deleted_at)
  on conflict (id) do update set category_id=excluded.category_id, name=excluded.name,
    normalized_name=excluded.normalized_name, brand=excluded.brand, default_quantity=excluded.default_quantity,
    default_unit=excluded.default_unit, notes=excluded.notes, favorite=excluded.favorite,
    is_recurring=excluded.is_recurring, recurrence_days=excluded.recurrence_days, active=excluded.active,
    updated_by=auth.uid(), updated_at=excluded.updated_at, deleted_at=excluded.deleted_at
  where public.products.house_id=excluded.house_id and
    (excluded.updated_at > public.products.updated_at or
      (excluded.updated_at = public.products.updated_at and excluded.deleted_at is not null and public.products.deleted_at is null))
  returning *;
  if not found then return query select * from public.products where id=resolved_id and house_id=target_house_id; end if;
end; $$;

create function public.apply_store(
  item_id uuid, target_house_id uuid, item_name text, item_normalized_name text,
  item_nickname text, item_address text, item_notes text, item_active boolean,
  item_created_at timestamptz, item_updated_at timestamptz, item_deleted_at timestamptz
) returns setof public.stores language plpgsql set search_path = '' as $$
declare resolved_id uuid := item_id;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not private.is_house_member(target_house_id) then raise exception 'house_membership_required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('store:' || target_house_id::text || ':' || item_normalized_name, 0)
  );
  select candidate.id into resolved_id
  from public.stores candidate
  where candidate.house_id = target_house_id
    and (
      candidate.id = item_id
      or (candidate.deleted_at is null and candidate.normalized_name = trim(item_normalized_name))
    )
  order by (candidate.id = item_id) desc
  limit 1;
  resolved_id := coalesce(resolved_id, item_id);
  return query insert into public.stores
    (id, house_id, name, normalized_name, nickname, address, notes, active,
     created_by, updated_by, created_at, updated_at, deleted_at)
  values (resolved_id, target_house_id, trim(item_name), trim(item_normalized_name),
    coalesce(trim(item_nickname),''), coalesce(trim(item_address),''), coalesce(trim(item_notes),''),
    item_active, auth.uid(), auth.uid(), item_created_at, item_updated_at, item_deleted_at)
  on conflict (id) do update set name=excluded.name, normalized_name=excluded.normalized_name,
    nickname=excluded.nickname, address=excluded.address, notes=excluded.notes, active=excluded.active,
    updated_by=auth.uid(), updated_at=excluded.updated_at, deleted_at=excluded.deleted_at
  where public.stores.house_id=excluded.house_id and
    (excluded.updated_at > public.stores.updated_at or
      (excluded.updated_at = public.stores.updated_at and excluded.deleted_at is not null and public.stores.deleted_at is null))
  returning *;
  if not found then return query select * from public.stores where id=resolved_id and house_id=target_house_id; end if;
end; $$;

revoke execute on function public.apply_category(uuid,uuid,text,text,text,boolean,timestamptz,timestamptz,timestamptz) from public, anon;
revoke execute on function public.apply_product(uuid,uuid,uuid,text,text,text,numeric,text,text,boolean,boolean,integer,boolean,timestamptz,timestamptz,timestamptz) from public, anon;
revoke execute on function public.apply_store(uuid,uuid,text,text,text,text,text,boolean,timestamptz,timestamptz,timestamptz) from public, anon;
grant execute on function public.apply_category(uuid,uuid,text,text,text,boolean,timestamptz,timestamptz,timestamptz) to authenticated;
grant execute on function public.apply_product(uuid,uuid,uuid,text,text,text,numeric,text,text,boolean,boolean,integer,boolean,timestamptz,timestamptz,timestamptz) to authenticated;
grant execute on function public.apply_store(uuid,uuid,text,text,text,text,text,boolean,timestamptz,timestamptz,timestamptz) to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='categories') then alter publication supabase_realtime add table public.categories; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='products') then alter publication supabase_realtime add table public.products; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='stores') then alter publication supabase_realtime add table public.stores; end if;
end $$;

commit;
