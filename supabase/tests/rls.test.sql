begin;

create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('10000000-0000-0000-0000-000000000001', 'a@casae.test', '{"display_name":"Usuário A"}'),
  ('20000000-0000-0000-0000-000000000002', 'b@casae.test', '{"display_name":"Usuário B"}');

insert into public.houses (id, name, created_by)
values
  ('a0000000-0000-0000-0000-000000000001', 'Casa A', '10000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000002', 'Casa B', '20000000-0000-0000-0000-000000000002');

insert into public.house_members (house_id, user_id, role)
values
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('b0000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'owner');

create temporary table invite_result (token text, expires_at timestamptz);
grant select, insert on table pg_temp.invite_result to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

select is((select count(*) from public.houses), 1::bigint, 'A enxerga somente Casa A');
select is((select count(*) from public.houses where id = 'b0000000-0000-0000-0000-000000000002'), 0::bigint, 'A não faz SELECT na Casa B');
select is((with changed as (update public.houses set name = 'Invadida' where id = 'b0000000-0000-0000-0000-000000000002' returning 1) select count(*) from changed), 0::bigint, 'A não faz UPDATE na Casa B');
select throws_ok($$delete from public.houses where id = 'b0000000-0000-0000-0000-000000000002'$$, '42501', null, 'A não possui grant de DELETE');
select is((select count(*) from public.house_members where house_id = 'b0000000-0000-0000-0000-000000000002'), 0::bigint, 'A não lê membership da Casa B');
select lives_ok($$insert into pg_temp.invite_result select * from public.create_house_invite('a0000000-0000-0000-0000-000000000001')$$, 'Owner A cria convite');

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select is((select count(*) from public.houses where id = 'a0000000-0000-0000-0000-000000000001'), 0::bigint, 'B não faz SELECT na Casa A antes do convite');
select is((with changed as (update public.houses set name = 'Invadida' where id = 'a0000000-0000-0000-0000-000000000001' returning 1) select count(*) from changed), 0::bigint, 'B não faz UPDATE na Casa A');
select lives_ok($$select public.accept_house_invite((select token from pg_temp.invite_result limit 1))$$, 'B aceita convite válido');
select is((select count(*) from public.houses where id = 'a0000000-0000-0000-0000-000000000001'), 1::bigint, 'B passa a acessar Casa A após membership');
select throws_ok($$select public.accept_house_invite((select token from pg_temp.invite_result limit 1))$$, 'P0001', 'invite_invalid_or_expired', 'Convite não pode ser usado duas vezes');
select throws_ok($$select public.accept_house_invite('CODIGO-INVALIDO')$$, 'P0001', 'invite_invalid_or_expired', 'Convite inválido é rejeitado');

select * from finish();
rollback;
