# Fundação online: Supabase, Auth e Casas

## Escopo desta etapa

Quando `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` estão configuradas, o Casaê usa Supabase para
conta, perfil global, Casas, memberships e convites. Lista, compras, catálogo, mercados, histórico,
preços, gastos, orçamento, recorrência e relatórios continuam nos repositories IndexedDB atuais.

Sem essas variáveis, a mesma aplicação inicia em modo local. Esse fallback existe para desenvolvimento
e para preservar a base instalada; ele não cria uma segunda implementação dos módulos operacionais.
Nenhum fluxo limpa ou migra automaticamente os dados locais.

## Arquitetura

```text
features/auth + features/house + settings
                 │
                 ▼
AuthService / OnlineHouseService
                 │
                 ▼
AuthRepository / OnlineHouseRepository / ProfileAvatarRepository
          │                         │
          ▼                         ▼
Supabase Auth + PostgreSQL     IndexedDB profileAvatars
```

Os componentes nunca chamam `supabase.from(...)`. `SupabaseAuthRepository` encapsula Auth e
`SupabaseHouseRepository` encapsula tabelas/RPCs. `OnlineHouseProvider` entrega o mesmo contrato
React usado pelo restante do app, de modo que os providers de Lista, Produtos, Compras e Gastos
continuam locais e apenas recebem o UUID da Casa ativa.

## Banco e migrations

As migrations em `supabase/migrations` devem ser aplicadas na ordem do nome:

1. `202608240001_foundation.sql`: `profiles`, `houses`, `house_members`, trigger de perfil e funções
   privadas para RLS;
2. `202608260001_online_identity.sql`: perfil global final, status/ID da membership, convites,
   RPCs transacionais, grants mínimos e policies finais.

### Tabelas

- `profiles`: uma linha por `auth.users.id`, com `display_name` e `avatar_path` futuro;
- `houses`: UUID, nome, criador e timestamps;
- `house_members`: Casa, usuário, papel, estado e entrada; a chave primária composta impede o mesmo
  usuário duas vezes na mesma Casa;
- `house_invites`: guarda somente SHA-256 do token, criador, validade e consumo. O token aberto só é
  devolvido uma vez pela RPC de criação.

`create_house` insere Casa e owner membership na mesma transação PostgreSQL. `create_house_invite`
exige owner e gera 96 bits aleatórios. `accept_house_invite` bloqueia a linha, valida expiração/uso,
cria a membership e consome o convite atomicamente. As RPCs de papel e remoção protegem o último
owner.

## Autenticação

`SupabaseAuthRepository` usa e-mail/senha com sessão persistente, refresh automático e detecção da
sessão em URL. `AuthProvider` registra uma única subscription, restaura a sessão antes de renderizar
a rota e remove o listener no cleanup. Eventos de outra aba atualizam o app.

Rotas:

- `/entrar`: e-mail e senha;
- `/criar-conta`: nome, e-mail, senha e confirmação;
- `/recuperar-senha`: solicita o e-mail de recuperação;
- `/nova-senha`: conclui o evento `PASSWORD_RECOVERY`.

Se a confirmação de e-mail estiver ativa, o cadastro orienta o usuário a confirmar a mensagem antes
de entrar. Erros conhecidos são traduzidos e mensagens técnicas não são exibidas.

## Casa ativa e onboarding

Um usuário autenticado sem membership vê onboarding para criar a primeira Casa ou aceitar um convite.
O UUID da Casa ativa fica em `localStorage` sob `casae.activeHouseId`; é apenas preferência de UI.
Toda autorização permanece no PostgreSQL/RLS. Uma preferência apontando para Casa inacessível é
descartada e substituída pela primeira Casa retornada com segurança.

## RLS e isolamento

RLS está ativo nas quatro tabelas públicas. Usuários autenticados só leem Casas e memberships em que
possuem membership ativa. Perfis só são visíveis ao próprio usuário ou a colegas de Casa. Apenas
owners atualizam Casas e consultam metadados de convites.

Mutações sensíveis de Casa, membership e convite não recebem grants diretos: passam por funções
`security definer`, todas com `search_path = ''`, relações qualificadas e execução concedida somente
a `authenticated`. As funções auxiliares ficam no schema não exposto `private`, evitando recursão
de RLS.

`supabase/tests/rls.test.sql` contém o cenário A/B: cada usuário começa isolado, SELECT/UPDATE/DELETE
cruzados falham, B aceita um convite de A e somente então passa a ler Casa A. Execute com o Supabase
local para validar as policies reais.

## Foto de perfil

`profiles.avatar_path` reserva a referência remota futura, mas Storage ainda não faz parte desta etapa.
Fotos novas do perfil online ficam como Blob na store local `profileAvatars`, chaveada pelo UUID global
do usuário. Fotos antigas dentro de membros locais permanecem intocadas e não são associadas a uma
conta por aproximação.

## Configuração do zero

1. Crie um projeto em <https://supabase.com/dashboard>.
2. No projeto, abra **Project Settings → API** e copie a Project URL e a chave pública
   `anon`/`publishable`. Nunca copie `service_role` ou uma secret key para o frontend.
3. Copie `.env.example` para `.env` e substitua os dois valores.
4. Instale o Supabase CLI conforme a documentação oficial e, na raiz do Casaê, execute:

   ```bash
   supabase login
   supabase link --project-ref SEU_PROJECT_REF
   supabase db push
   ```

5. Em **Authentication → URL Configuration**, defina `http://localhost:5173` como Site URL durante
   desenvolvimento e adicione `http://localhost:5173/**` às Redirect URLs. Acrescente depois a URL
   real de produção.
6. Em **Authentication → Providers → Email**, mantenha Email habilitado. Decida se o ambiente exige
   confirmação de e-mail; ambos os comportamentos são suportados.
7. Reinicie `npm run dev` após criar o `.env`.

Para desenvolvimento totalmente local, rode `supabase init`, `supabase start`, copie a URL/chave
mostradas pelo CLI e aplique `supabase db reset`. HTTP é aceito somente em localhost/127.0.0.1.

## Testes

```bash
npm run test:run
npm run test:e2e
supabase test db
```

O terceiro comando exige Docker e Supabase CLI. Sem eles, os testes TypeScript continuam validando
services, contextos, onboarding, persistência local, contratos e conteúdo estrutural das migrations,
mas não substituem a execução real das policies pelo PostgreSQL.

Referências oficiais: [Auth por e-mail](https://supabase.com/docs/reference/javascript/auth-signup),
[dados de usuário](https://supabase.com/docs/guides/auth/managing-user-data),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) e
[redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
