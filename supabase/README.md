# Supabase

As migrations em `migrations/` criam o núcleo multi-Casa e devem ser aplicadas em ordem. A segunda
migration acrescenta convites de uso único, onboarding transacional, status de membership e as
policies/grants finais. A terceira cria `shopping_items`, tombstones, aplicação idempotente,
policies por membership ativa e Realtime.

Execute-a em um projeto Supabase novo pelo CLI (`supabase db push`) ou pelo SQL Editor. Ela cria
`profiles`, `houses`, `house_members`, `house_invites` e `shopping_items`, ativa RLS e inclui as
tabelas compartilhadas na publicação Realtime. As funções no schema `private` evitam recursão nas
políticas.

Com Supabase CLI e Docker disponíveis, `supabase test db` executa `tests/rls.test.sql`, incluindo o
isolamento entre Usuário A/Casa A e Usuário B/Casa B antes e depois de um convite.

O frontend utiliza somente `VITE_SUPABASE_URL` e a chave pública anon/publishable. Nunca exponha a
chave `service_role` em variáveis `VITE_*`.
