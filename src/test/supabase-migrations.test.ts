import { describe, expect, it } from 'vitest';
import foundation from '../../supabase/migrations/202608240001_foundation.sql?raw';
import onlineIdentity from '../../supabase/migrations/202608260001_online_identity.sql?raw';
import shoppingSync from '../../supabase/migrations/202608260002_shopping_list_sync.sql?raw';

describe('migrations da fundação Supabase', () => {
  it('mantém unicidade de membership e cria convite sem persistir token aberto', () => {
    expect(foundation).toContain('primary key (house_id, user_id)');
    expect(onlineIdentity).toContain('token_hash bytea not null unique');
    expect(onlineIdentity).not.toMatch(/\btoken text not null\b/);
    expect(onlineIdentity).toContain('expires_at timestamptz not null');
    expect(onlineIdentity).toContain('used_at timestamptz');
  });

  it('cria Lista com UUID, tombstone, RLS, Realtime e aplicação idempotente', () => {
    expect(shoppingSync).toContain('create table public.shopping_items');
    expect(shoppingSync).toContain('id uuid primary key');
    expect(shoppingSync).toContain('house_id uuid not null');
    expect(shoppingSync).toContain('deleted_at timestamptz');
    expect(shoppingSync).toContain('alter table public.shopping_items enable row level security');
    expect(shoppingSync).toContain('private.is_house_member(house_id)');
    expect(shoppingSync).toContain('on conflict (id) do update');
    expect(shoppingSync).toContain('excluded.updated_at > public.shopping_items.updated_at');
    expect(shoppingSync).toContain(
      'alter publication supabase_realtime add table public.shopping_items',
    );
  });

  it('ativa RLS e restringe mutações sensíveis a RPCs autenticadas', () => {
    for (const table of ['profiles', 'houses', 'house_members']) {
      expect(foundation).toContain(`alter table public.${table} enable row level security`);
    }
    expect(onlineIdentity).toContain('alter table public.house_invites enable row level security');
    expect(onlineIdentity).toContain('security definer');
    expect(onlineIdentity).toContain("set search_path = ''");
    expect(onlineIdentity).toContain('revoke all on table public.profiles');
    expect(onlineIdentity).toContain(
      'grant execute on function public.accept_house_invite(text) to authenticated',
    );
  });

  it('cria Casa e owner membership na mesma função transacional', () => {
    const createHouseFunction = onlineIdentity.slice(
      onlineIdentity.indexOf('create function public.create_house'),
      onlineIdentity.indexOf('create function public.create_house_invite'),
    );
    expect(createHouseFunction).toContain('insert into public.houses');
    expect(createHouseFunction).toContain('insert into public.house_members');
    expect(createHouseFunction).toContain("'owner', 'active'");
  });
});
