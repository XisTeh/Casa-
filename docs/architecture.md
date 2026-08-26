# Arquitetura do Casaê

## Camadas e composição

O Casaê é uma aplicação React única para navegador, PWA e o WebView Capacitor existente. A
dependência segue `features/UI -> application -> domain contracts -> infrastructure`:

- `src/domain` contém entidades e interfaces sem IndexedDB ou React;
- `src/application` concentra validações, casos de uso e projeções;
- `src/infrastructure` implementa repositories locais e o banco unificado;
- `src/features` mantém providers e componentes, sem acesso direto à persistência;
- `src/app/app-services.ts` compõe a instância local compartilhada.

Quando o ambiente Supabase está configurado, Auth, perfis globais, Casas, memberships e convites usam
repositories remotos protegidos por RLS. Sem configuração, `HouseProvider` mantém o fluxo local. Os
módulos operacionais ainda usam IndexedDB em ambos os modos e recebem o `houseId` ativo explicitamente.

## Product e Category

`Product` é o cadastro mutável atual. Seu `id` não depende do nome; ele também guarda `houseId`,
`normalizedName`, marca, `categoryId`, padrões de quantidade/unidade, observações, favorito,
`isRecurring`/`recurrenceDays`, ativo e timestamps. Recorrência é uma configuração da Casa; estoque
e alerta automático não são antecipados no schema.

`Category` possui ID independente, Casa, nome normalizado, estado e timestamps. As categorias
iniciais também guardam um `legacyKey` compatível com os agrupamentos anteriores da Lista. Categorias
personalizadas mantêm o seu `categoryId` e nome no item da Lista; o snapshot de compra recebe esse
nome. Renomear uma categoria não altera snapshots já comprados.

`ProductRepository` e `CategoryRepository` são os contratos. `LocalProductRepository` e
`LocalCategoryRepository` usam object stores próprias. `ProductService` aplica normalização,
duplicatas, estados, integração com a Lista e criação durante Compra Rápida. `CategoryService`
protege duplicatas e impede desativar uma categoria que ainda contém produtos ativos.

## Relação Lista -> Produto

`ShoppingListItem.productId` e `categoryId` são opcionais para preservar itens manuais. Ao adicionar
um produto do catálogo, `ProductService` copia nome, marca, quantidade/unidade padrão, observações e
categoria, mantendo o ID do produto. Antes de criar, procura um item da Lista com o mesmo ID e
retorna `already-present` em vez de duplicá-lo.

Quando um produto é cadastrado depois de já ter sido digitado manualmente na Lista, somente itens sem
vínculo e com nome normalizado exatamente igual recebem o novo `productId`. Não existe comparação
aproximada.

## Relação Compra -> Produto e snapshots

`PurchaseItem.productId` referencia o catálogo quando a identidade é conhecida. Os campos
`productNameSnapshot`, `brandSnapshot`, `categorySnapshot`/`categoryNameSnapshot`,
`notesSnapshot`, quantidades, unidade, preços, mercado, comprador e `purchasedAt` continuam sendo a
fonte do Histórico. O detalhe de uma compra continua sem consultar o nome ou marca atuais de
`Product`. Já a projeção analítica de preços usa o `productId` para apresentar o nome atual do
catálogo, sem alterar os snapshots mostrados em cada ponto da linha do tempo.

Na Compra Rápida, as sugestões do catálogo vêm primeiro e reutilizam o ID selecionado. Quantidade e
unidade padrão podem ser preenchidas; preço anterior é exibido somente como referência e nunca
assumido como preço atual. Se o nome não existir, `ProductService.findOrCreateFromPurchase` cria um
cadastro básico antes de persistir o item comprado, mantendo o mesmo ID nos dois registros.

## Projeções de preço

`ProductService.list` carrega produtos e sessões concluídas. Ele ordena `PurchaseItem` por
`purchasedAt` decrescente e mantém o primeiro item de cada `productId`, projetando preço unitário,
mercado e data para os cards do catálogo. Sessões ativas não participam.

`price-history-selectors.ts` é a camada de aplicação compartilhada por `/historico` e `/produtos`.
Ela carrega as sessões concluídas já expostas pelo `PurchaseContext`, achata seus `purchaseItems`,
agrupa por `productId` (ou nome normalizado exato para legado) e depois separa cada grupo por unidade.
Cada grupo de unidade projeta último/anterior, variação percentual segura, mínimo, máximo, média,
mercados e linha do tempo. Não há cache nem object store de preços.

O carregamento em lote é adequado ao volume doméstico atual e evita leituras por produto. Os índices
`purchaseItems.houseId`, `purchaseItems.purchaseSessionId`, `purchaseItems.productId` e
`purchaseSessions.houseId` já existentes permitem evoluir os repositories para consultas mais
restritas se o volume crescer, sem exigir migração nesta etapa.

## IndexedDB v6

`CasaeLocalDatabase` abre `casae-local` na versão 6 com as stores `shoppingItems`,
`purchaseSessions`, `purchaseItems`, `stores`, `products`, `categories`, `houseBudgets`, `houses`,
`houseMembers`, `profileAvatars` e `metadata`.
Todas as stores de domínio têm índice por `houseId`; produtos e categorias também têm índice
composto de Casa/nome normalizado. Orçamentos têm um índice composto e único por Casa/ano/mês.

A inicialização mantém três migrações independentes:

1. `legacy-databases-to-casae-local-v1` preserva a cópia já existente dos antigos bancos da Lista e
   das compras;
2. `catalog-products-categories-v2` cria categorias e reconcilia o catálogo;
3. `product-recurrence-v5` normaliza a configuração manual dos produtos existentes.

A atualização v6 apenas cria `profileAvatars`, sem regravar stores anteriores. A store mantém o Blob
local do perfil online por UUID enquanto o upload para Supabase Storage ainda não existe.

Na migração da v2, categorias iniciais são criadas para cada Casa encontrada. Produtos são identificados primeiro
por `productId`/`houseProductId`; sem ID, somente um nome normalizado exatamente igual na mesma Casa
pode ser reutilizado. Conflitos explícitos permanecem separados. A migração acrescenta referências
à Lista e a itens históricos, mas não recalcula totais nem substitui nenhum campo snapshot.

Leituras, reconciliação, `put` dos registros e marca em `metadata` pertencem à mesma transação
`readwrite`. Se a página interromper antes do commit, nada é parcialmente confirmado; a próxima
abertura repete a operação. Depois do commit, o marcador impede novo seed/reprocessamento.

## Conclusão atômica e futuro backend

Finalizar uma compra continua sendo uma única transação sobre sessão, itens e Lista: a sessão muda
para `completed` e apenas itens comprados originados na Lista são removidos. Produtos, categorias e
snapshots não são apagados.

Um backend futuro deverá fornecer implementações alternativas de `ProductRepository`,
`CategoryRepository`, `ShoppingListRepository`, `PurchaseRepository` e `StoreRepository`. A unidade
transacional, autorização, conflitos e sincronização deverão migrar para esse backend sem transformar
React Context em fonte de dados e sem abandonar IDs, `houseId` ou snapshots.

## Gastos e orçamento

`spending-selectors.ts` projeta totais, comparações, categorias, mercados, maiores compras e curva
acumulada somente a partir de `PurchaseSession` concluídas e seus `PurchaseItem`. Nenhuma despesa é
gravada separadamente. `HouseBudget` é a única entidade nova: guarda o valor em centavos para uma
Casa, ano e mês e é acessada por `BudgetRepository`/`BudgetService`.

A atualização v2→v3 apenas cria `houseBudgets`; as stores e os registros anteriores não são
recriados. A migração é coberta por teste abrindo um IndexedDB v2, preservando um item existente e
gravando o primeiro orçamento após a atualização. `PurchaseContext` e `BudgetContext` mantêm
Dashboard e `/gastos` reativos depois de finalizar uma compra ou salvar um orçamento.

`monthly-report-selectors.ts` estende essa projeção com ticket médio, extremos, rankings, produtos,
comparação, variações de preço compatíveis e série de seis meses. O relatório é recalculado em
memória; não existem `monthlyReports`, totais mensais ou caches financeiros no banco.

## Recorrência e reposição

`replenishment-selectors.ts` agrupa ocorrências por Casa, `productId` e unidade padrão. Compras do
mesmo produto no mesmo dia contam uma vez. Com pelo menos três dias de compra, a mediana dos
intervalos positivos define o intervalo típico; unidades incompatíveis nunca são combinadas. Para
legado sem ID, só é aceito nome normalizado exato quando ele identifica um único produto da Casa.

Uma configuração manual usa `isRecurring` e `recurrenceDays` no próprio `Product`. As sugestões são
calculadas no cliente, excluem produtos inativos, de outra Casa ou já presentes na Lista e nunca
adicionam itens sem clique. `ProductService.addToShoppingList` continua sendo a barreira final contra
duplicação e copia padrões preservando o mesmo `productId`.

## Casa e identidade local

`HouseProvider` carrega `activeHouse` e `activeMember` pelo `HouseService`. Os providers funcionais
são remontados quando o ID da Casa muda, e cada service recebe explicitamente o `houseId` ativo. Isso
evita que estado da Casa anterior permaneça visível durante a troca. O membro ativo é enviado às
operações de Lista e Compra; IDs relacionais são mantidos junto de snapshots de nome.

A migração v3→v4 cria `houses` e `houseMembers` dentro da transação de atualização, registra a Casa e
o membro legados mínimos e persiste `activeHouseId`/`activeMemberId` em `metadata`. Como a Casa
inicial usa o `houseId` que os registros existentes já possuem, Lista, catálogo, compras, mercados e
orçamentos não precisam ser copiados nem regravados.

## Identidade e Casa online

`AuthProvider` compõe `AuthService` e `SupabaseAuthRepository`; `OnlineHouseProvider` compõe
`OnlineHouseService`, `SupabaseHouseRepository` e `LocalProfileAvatarRepository`. O provider remoto
expõe o mesmo `HouseContext`, mas o membro ativo é sempre o usuário autenticado — não existe troca de
identidade dentro de uma conta. A preferência `casae.activeHouseId` não participa da autorização.

PostgreSQL cria a primeira Casa/owner e aceita convites por RPCs atômicas. As quatro tabelas públicas
têm RLS e grants mínimos; helpers `security definer` no schema `private` evitam recursão. Consulte
[Fundação online](backend-foundation.md) para schema, policies, setup e fronteira local/remota.
