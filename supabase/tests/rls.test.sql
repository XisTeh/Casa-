begin;

create extension if not exists pgtap with schema extensions;
select plan(39);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('10000000-0000-0000-0000-000000000001', 'a@casae.test', '{"display_name":"Usuário A"}'),
  ('20000000-0000-0000-0000-000000000002', 'b@casae.test', '{"display_name":"Usuário B"}'),
  ('30000000-0000-0000-0000-000000000003', 'c@casae.test', '{"display_name":"Usuário C"}');

insert into public.houses (id, name, created_by)
values
  ('a0000000-0000-0000-0000-000000000001', 'Casa A', '10000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000002', 'Casa B', '20000000-0000-0000-0000-000000000002');

insert into public.house_members (house_id, user_id, role)
values
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('a0000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'member'),
  ('b0000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'owner');

create temporary table invite_result (token text, expires_at timestamptz);
grant select, insert on table pg_temp.invite_result to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

select ok(private.is_house_member('a0000000-0000-0000-0000-000000000001'), 'helper reconhece owner ativo como membro');
select is((select count(*) from public.houses), 1::bigint, 'A enxerga somente Casa A');
select is((select count(*) from public.houses where id = 'b0000000-0000-0000-0000-000000000002'), 0::bigint, 'A não faz SELECT na Casa B');
select is((with changed as (update public.houses set name = 'Invadida' where id = 'b0000000-0000-0000-0000-000000000002' returning 1) select count(*) from changed), 0::bigint, 'A não faz UPDATE na Casa B');
select throws_ok($$delete from public.houses where id = 'b0000000-0000-0000-0000-000000000002'$$, '42501', null, 'A não possui grant de DELETE');
select is((select count(*) from public.house_members where house_id = 'b0000000-0000-0000-0000-000000000002'), 0::bigint, 'A não lê membership da Casa B');
select lives_ok($$insert into pg_temp.invite_result select * from public.create_house_invite('a0000000-0000-0000-0000-000000000001')$$, 'Owner A cria convite');
select lives_ok($$insert into public.shopping_items (id, house_id, name, normalized_name, quantity, unit, category_key, added_by_name, created_by, updated_by, created_at, updated_at) values ('aa000000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Arroz', 'arroz', 1, 'pacote', 'mercearia', 'Usuário A', auth.uid(), auth.uid(), now(), now())$$, 'A insere item na Casa A');
select throws_ok($$insert into public.shopping_items (id, house_id, name, normalized_name, quantity, unit, category_key, added_by_name, created_by, updated_by, created_at, updated_at) values ('bb000000-0000-4000-8000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'Café', 'cafe', 1, 'pacote', 'mercearia', 'Usuário A', auth.uid(), auth.uid(), now(), now())$$, '42501', null, 'A não insere item na Casa B');
select lives_ok($$insert into public.house_budgets (id, house_id, year, month, amount_cents, created_by, updated_by, created_at, updated_at) values ('aa000000-0000-4000-8000-000000000010', 'a0000000-0000-0000-0000-000000000001', 2026, 8, 150000, auth.uid(), auth.uid(), now(), now())$$, 'A define orçamento da Casa A');
select throws_ok($$insert into public.house_budgets (id, house_id, year, month, amount_cents, created_by, updated_by, created_at, updated_at) values ('bb000000-0000-4000-8000-000000000010', 'b0000000-0000-0000-0000-000000000002', 2026, 8, 150000, auth.uid(), auth.uid(), now(), now())$$, '42501', null, 'A não define orçamento da Casa B');

insert into public.categories (id, house_id, name, normalized_name, created_by, updated_by, created_at, updated_at)
values ('aa100000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Categoria A', 'categoria a', auth.uid(), auth.uid(), now(), now());
insert into public.products (id, house_id, category_id, name, normalized_name, default_unit, created_by, updated_by, created_at, updated_at)
values ('aa200000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'aa100000-0000-4000-8000-000000000001', 'Produto A', 'produto a', 'unidade', auth.uid(), auth.uid(), now(), now());
insert into public.stores (id, house_id, name, normalized_name, created_by, updated_by, created_at, updated_at)
values ('aa300000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Mercado A', 'mercado a', auth.uid(), auth.uid(), now(), now());
insert into public.purchase_sessions (id, house_id, started_by, started_by_name, store_name_snapshot, entry_mode, status, started_at, created_at, updated_at)
values ('aa400000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000001', auth.uid(), 'Usuário A', 'Mercado A', 'quick', 'active', now(), now(), now());
insert into public.purchase_items (id, purchase_session_id, house_id, origin, product_name_snapshot, category_key_snapshot, priority_snapshot, planned_quantity, purchased_quantity, unit_snapshot, unit_price_cents, total_price_cents, store_name_snapshot, created_by, created_by_name_snapshot, purchased_at, created_at, updated_at)
values ('aa500000-0000-4000-8000-000000000001', 'aa400000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'manual', 'Produto A', 'outros', 'normal', 1, 1, 'unidade', 1000, 1000, 'Mercado A', auth.uid(), 'Usuário A', now(), now(), now());
update public.purchase_sessions set status = 'completed', completed_at = now(), updated_at = now() where id = 'aa400000-0000-4000-8000-000000000001';

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select is((select count(*) from public.houses where id = 'a0000000-0000-0000-0000-000000000001'), 0::bigint, 'B não faz SELECT na Casa A antes do convite');
select is((with changed as (update public.houses set name = 'Invadida' where id = 'a0000000-0000-0000-0000-000000000001' returning 1) select count(*) from changed), 0::bigint, 'B não faz UPDATE na Casa A');
select lives_ok($$insert into public.shopping_items (id, house_id, name, normalized_name, quantity, unit, category_key, added_by_name, created_by, updated_by, created_at, updated_at) values ('bb000000-0000-4000-8000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'Café', 'cafe', 1, 'pacote', 'mercearia', 'Usuário B', auth.uid(), auth.uid(), now(), now())$$, 'B insere item na Casa B');
select is((select count(*) from public.shopping_items where house_id = 'a0000000-0000-0000-0000-000000000001'), 0::bigint, 'B não lê itens da Casa A');
select is((select count(*) from public.house_budgets where house_id = 'a0000000-0000-0000-0000-000000000001'), 0::bigint, 'B não lê orçamento da Casa A antes do convite');
select is((select count(*) from public.purchase_sessions where house_id = 'a0000000-0000-0000-0000-000000000001'), 0::bigint, 'B não lê compra do owner antes da membership');
select is((select count(*) from public.purchase_items where house_id = 'a0000000-0000-0000-0000-000000000001'), 0::bigint, 'B não lê itens da compra do owner antes da membership');
select is((with changed as (update public.shopping_items set quantity = 9 where house_id = 'a0000000-0000-0000-0000-000000000001' returning 1) select count(*) from changed), 0::bigint, 'B não atualiza itens da Casa A');

insert into public.categories (id, house_id, name, normalized_name, created_by, updated_by, created_at, updated_at)
values ('bb100000-0000-4000-8000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'Categoria B externa', 'categoria b externa', auth.uid(), auth.uid(), now(), now());
insert into public.products (id, house_id, category_id, name, normalized_name, default_unit, created_by, updated_by, created_at, updated_at)
values ('bb200000-0000-4000-8000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'bb100000-0000-4000-8000-000000000001', 'Produto B externo', 'produto b externo', 'unidade', auth.uid(), auth.uid(), now(), now());
insert into public.stores (id, house_id, name, normalized_name, created_by, updated_by, created_at, updated_at)
values ('bb300000-0000-4000-8000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'Mercado B externo', 'mercado b externo', auth.uid(), auth.uid(), now(), now());
insert into public.house_budgets (id, house_id, year, month, amount_cents, created_by, updated_by, created_at, updated_at)
values ('bb600000-0000-4000-8000-000000000001', 'b0000000-0000-0000-0000-000000000002', 2026, 8, 90000, auth.uid(), auth.uid(), now(), now());
insert into public.purchase_sessions (id, house_id, started_by, started_by_name, store_name_snapshot, entry_mode, status, started_at, created_at, updated_at)
values ('bb400000-0000-4000-8000-000000000001', 'b0000000-0000-0000-0000-000000000002', auth.uid(), 'Usuário B', 'Mercado B externo', 'quick', 'active', now(), now(), now());
insert into public.purchase_items (id, purchase_session_id, house_id, origin, product_name_snapshot, category_key_snapshot, priority_snapshot, planned_quantity, purchased_quantity, unit_snapshot, unit_price_cents, total_price_cents, store_name_snapshot, created_by, created_by_name_snapshot, purchased_at, created_at, updated_at)
values ('bb500000-0000-4000-8000-000000000001', 'bb400000-0000-4000-8000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'manual', 'Produto B externo', 'outros', 'normal', 1, 1, 'unidade', 900, 900, 'Mercado B externo', auth.uid(), 'Usuário B', now(), now(), now());
update public.purchase_sessions set status = 'completed', completed_at = now(), updated_at = now() where id = 'bb400000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select is((select count(*) from public.shopping_items where house_id = 'b0000000-0000-0000-0000-000000000002'), 0::bigint, 'A não lê itens da Casa B');
select is((with removed as (delete from public.shopping_items where house_id = 'b0000000-0000-0000-0000-000000000002' returning 1) select count(*) from removed), 0::bigint, 'A não exclui itens da Casa B');
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select lives_ok($$select public.accept_house_invite((select token from pg_temp.invite_result limit 1))$$, 'B aceita convite válido');
select is((select count(*) from public.houses where id = 'a0000000-0000-0000-0000-000000000001'), 1::bigint, 'B passa a acessar Casa A após membership');
select is((select count(*) from public.shopping_items where house_id = 'a0000000-0000-0000-0000-000000000001'), 1::bigint, 'B passa a ler a Lista da Casa A após membership');
select is((select count(*) from public.house_budgets where house_id = 'a0000000-0000-0000-0000-000000000001'), 1::bigint, 'B passa a ler orçamento da Casa A após membership');
select lives_ok($$update public.house_budgets set amount_cents = 170000, updated_by = auth.uid(), updated_at = now() where house_id = 'a0000000-0000-0000-0000-000000000001' and year = 2026 and month = 8$$, 'B atualiza orçamento da Casa A como membro ativo');
select ok(private.is_house_member('a0000000-0000-0000-0000-000000000001'), 'helper reconhece member B ativo');
select is((select count(*) from public.purchase_sessions where id = 'aa400000-0000-4000-8000-000000000001'), 1::bigint, 'member B lê compra concluída pelo owner A');
select is((select count(*) from public.purchase_items where purchase_session_id = 'aa400000-0000-4000-8000-000000000001'), 1::bigint, 'member B lê itens da compra do owner A');
select throws_ok($$select public.accept_house_invite((select token from pg_temp.invite_result limit 1))$$, 'P0001', 'invite_invalid_or_expired', 'Convite não pode ser usado duas vezes');
select throws_ok($$select public.accept_house_invite('CODIGO-INVALIDO')$$, 'P0001', 'invite_invalid_or_expired', 'Convite inválido é rejeitado');

insert into public.shopping_items (id, house_id, name, normalized_name, quantity, unit, category_key, added_by_name, created_by, updated_by, created_at, updated_at)
values ('ab000000-0000-4000-8000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Item B', 'item b', 1, 'unidade', 'outros', 'Usuário B', auth.uid(), auth.uid(), now(), now());
insert into public.categories (id, house_id, name, normalized_name, created_by, updated_by, created_at, updated_at)
values ('ab100000-0000-4000-8000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Categoria B', 'categoria b', auth.uid(), auth.uid(), now(), now());
insert into public.products (id, house_id, category_id, name, normalized_name, default_unit, created_by, updated_by, created_at, updated_at)
values ('ab200000-0000-4000-8000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'ab100000-0000-4000-8000-000000000002', 'Produto B', 'produto b', 'unidade', auth.uid(), auth.uid(), now(), now());
insert into public.stores (id, house_id, name, normalized_name, created_by, updated_by, created_at, updated_at)
values ('ab300000-0000-4000-8000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Mercado B', 'mercado b', auth.uid(), auth.uid(), now(), now());
insert into public.house_budgets (id, house_id, year, month, amount_cents, created_by, updated_by, created_at, updated_at)
values ('ab600000-0000-4000-8000-000000000002', 'a0000000-0000-0000-0000-000000000001', 2026, 9, 180000, auth.uid(), auth.uid(), now(), now());
insert into public.purchase_sessions (id, house_id, started_by, started_by_name, store_name_snapshot, entry_mode, status, started_at, created_at, updated_at)
values ('ab400000-0000-4000-8000-000000000002', 'a0000000-0000-0000-0000-000000000001', auth.uid(), 'Usuário B', 'Mercado B', 'quick', 'active', now(), now(), now());
insert into public.purchase_items (id, purchase_session_id, house_id, origin, product_name_snapshot, category_key_snapshot, priority_snapshot, planned_quantity, purchased_quantity, unit_snapshot, unit_price_cents, total_price_cents, store_name_snapshot, created_by, created_by_name_snapshot, purchased_at, created_at, updated_at)
values ('ab500000-0000-4000-8000-000000000002', 'ab400000-0000-4000-8000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'manual', 'Produto B', 'outros', 'normal', 1, 1, 'unidade', 2000, 2000, 'Mercado B', auth.uid(), 'Usuário B', now(), now(), now());
update public.purchase_sessions set status = 'completed', completed_at = now(), updated_at = now() where id = 'ab400000-0000-4000-8000-000000000002';

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000003', true);
select ok(private.is_house_member('a0000000-0000-0000-0000-000000000001'), 'helper reconhece member C ativo');
select ok(not private.is_house_member('b0000000-0000-0000-0000-000000000002'), 'helper rejeita usuário sem membership na Casa B');
insert into public.shopping_items (id, house_id, name, normalized_name, quantity, unit, category_key, added_by_name, created_by, updated_by, created_at, updated_at)
values ('ac000000-0000-4000-8000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Item C', 'item c', 1, 'unidade', 'outros', 'Usuário C', auth.uid(), auth.uid(), now(), now());
insert into public.categories (id, house_id, name, normalized_name, created_by, updated_by, created_at, updated_at)
values ('ac100000-0000-4000-8000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Categoria C', 'categoria c', auth.uid(), auth.uid(), now(), now());
insert into public.products (id, house_id, category_id, name, normalized_name, default_unit, created_by, updated_by, created_at, updated_at)
values ('ac200000-0000-4000-8000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'ac100000-0000-4000-8000-000000000003', 'Produto C', 'produto c', 'unidade', auth.uid(), auth.uid(), now(), now());
insert into public.stores (id, house_id, name, normalized_name, created_by, updated_by, created_at, updated_at)
values ('ac300000-0000-4000-8000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Mercado C', 'mercado c', auth.uid(), auth.uid(), now(), now());
insert into public.house_budgets (id, house_id, year, month, amount_cents, created_by, updated_by, created_at, updated_at)
values ('ac600000-0000-4000-8000-000000000003', 'a0000000-0000-0000-0000-000000000001', 2026, 10, 190000, auth.uid(), auth.uid(), now(), now());
insert into public.purchase_sessions (id, house_id, started_by, started_by_name, store_name_snapshot, entry_mode, status, started_at, created_at, updated_at)
values ('ac400000-0000-4000-8000-000000000003', 'a0000000-0000-0000-0000-000000000001', auth.uid(), 'Usuário C', 'Mercado C', 'quick', 'active', now(), now(), now());
insert into public.purchase_items (id, purchase_session_id, house_id, origin, product_name_snapshot, category_key_snapshot, priority_snapshot, planned_quantity, purchased_quantity, unit_snapshot, unit_price_cents, total_price_cents, store_name_snapshot, created_by, created_by_name_snapshot, purchased_at, created_at, updated_at)
values ('ac500000-0000-4000-8000-000000000003', 'ac400000-0000-4000-8000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'manual', 'Produto C', 'outros', 'normal', 1, 1, 'unidade', 3000, 3000, 'Mercado C', auth.uid(), 'Usuário C', now(), now(), now());
update public.purchase_sessions set status = 'completed', completed_at = now(), updated_at = now() where id = 'ac400000-0000-4000-8000-000000000003';

select is(
  jsonb_build_object(
    'shopping_items', (select count(*) from public.shopping_items where house_id = 'b0000000-0000-0000-0000-000000000002'),
    'categories', (select count(*) from public.categories where house_id = 'b0000000-0000-0000-0000-000000000002'),
    'products', (select count(*) from public.products where house_id = 'b0000000-0000-0000-0000-000000000002'),
    'stores', (select count(*) from public.stores where house_id = 'b0000000-0000-0000-0000-000000000002'),
    'purchase_sessions', (select count(*) from public.purchase_sessions where house_id = 'b0000000-0000-0000-0000-000000000002'),
    'purchase_items', (select count(*) from public.purchase_items where house_id = 'b0000000-0000-0000-0000-000000000002'),
    'house_budgets', (select count(*) from public.house_budgets where house_id = 'b0000000-0000-0000-0000-000000000002')
  ),
  '{"shopping_items":0,"categories":0,"products":0,"stores":0,"purchase_sessions":0,"purchase_items":0,"house_budgets":0}'::jsonb,
  'member C não acessa nenhuma entidade compartilhada da Casa B'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select is(
  jsonb_build_object(
    'shopping_items', (select count(*) from public.shopping_items where house_id = 'a0000000-0000-0000-0000-000000000001'),
    'categories', (select count(*) from public.categories where house_id = 'a0000000-0000-0000-0000-000000000001'),
    'products', (select count(*) from public.products where house_id = 'a0000000-0000-0000-0000-000000000001'),
    'stores', (select count(*) from public.stores where house_id = 'a0000000-0000-0000-0000-000000000001'),
    'purchase_sessions', (select count(*) from public.purchase_sessions where house_id = 'a0000000-0000-0000-0000-000000000001'),
    'purchase_items', (select count(*) from public.purchase_items where house_id = 'a0000000-0000-0000-0000-000000000001'),
    'house_budgets', (select count(*) from public.house_budgets where house_id = 'a0000000-0000-0000-0000-000000000001')
  ),
  '{"shopping_items":3,"categories":3,"products":3,"stores":3,"purchase_sessions":3,"purchase_items":3,"house_budgets":3}'::jsonb,
  'owner A lê criações de A, B e C'
);
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select is(
  jsonb_build_object(
    'shopping_items', (select count(*) from public.shopping_items where house_id = 'a0000000-0000-0000-0000-000000000001'),
    'categories', (select count(*) from public.categories where house_id = 'a0000000-0000-0000-0000-000000000001'),
    'products', (select count(*) from public.products where house_id = 'a0000000-0000-0000-0000-000000000001'),
    'stores', (select count(*) from public.stores where house_id = 'a0000000-0000-0000-0000-000000000001'),
    'purchase_sessions', (select count(*) from public.purchase_sessions where house_id = 'a0000000-0000-0000-0000-000000000001'),
    'purchase_items', (select count(*) from public.purchase_items where house_id = 'a0000000-0000-0000-0000-000000000001'),
    'house_budgets', (select count(*) from public.house_budgets where house_id = 'a0000000-0000-0000-0000-000000000001')
  ),
  '{"shopping_items":3,"categories":3,"products":3,"stores":3,"purchase_sessions":3,"purchase_items":3,"house_budgets":3}'::jsonb,
  'member B lê criações do owner e dos dois members'
);
select is((with changed as (update public.purchase_sessions set store_name_snapshot = 'Bloqueado' where id = 'aa400000-0000-4000-8000-000000000001' returning 1) select count(*) from changed), 0::bigint, 'member B não altera sessão pertencente ao owner A');
select is((with changed as (update public.purchase_items set product_name_snapshot = 'Bloqueado' where id = 'aa500000-0000-4000-8000-000000000001' returning 1) select count(*) from changed), 0::bigint, 'member B não altera item pertencente ao owner A');
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000003', true);
select is(
  jsonb_build_object(
    'shopping_items', (select count(*) from public.shopping_items where house_id = 'a0000000-0000-0000-0000-000000000001'),
    'categories', (select count(*) from public.categories where house_id = 'a0000000-0000-0000-0000-000000000001'),
    'products', (select count(*) from public.products where house_id = 'a0000000-0000-0000-0000-000000000001'),
    'stores', (select count(*) from public.stores where house_id = 'a0000000-0000-0000-0000-000000000001'),
    'purchase_sessions', (select count(*) from public.purchase_sessions where house_id = 'a0000000-0000-0000-0000-000000000001'),
    'purchase_items', (select count(*) from public.purchase_items where house_id = 'a0000000-0000-0000-0000-000000000001'),
    'house_budgets', (select count(*) from public.house_budgets where house_id = 'a0000000-0000-0000-0000-000000000001')
  ),
  '{"shopping_items":3,"categories":3,"products":3,"stores":3,"purchase_sessions":3,"purchase_items":3,"house_budgets":3}'::jsonb,
  'member C lê criações do owner e do outro member'
);

select * from finish();
rollback;
