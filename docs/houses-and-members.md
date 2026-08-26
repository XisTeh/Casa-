# Casas, membros e identidade local

## Modelos

`House` representa o espaço compartilhado que possui Lista, produtos, categorias, mercados, compras,
histórico, gastos e orçamentos. `HouseMember` representa uma participação local nessa Casa e guarda
nome de exibição, seed de avatar, foto opcional em `avatarBlob`, função `owner`/`member`, estado e
timestamps. Casa e membro não são contas autenticadas.

Um membro local pertence a uma Casa. Ao criar outra Casa, o perfil atual origina uma nova participação
owner com ID próprio. Isso mantém a implementação simples sem impedir o modelo remoto futuro
`User ↔ HouseMembership ↔ House`.

## Casa e membro ativos

`activeHouseId` e `activeMemberId` são persistidos na store `metadata`. `HouseProvider` resolve os
registros correspondentes e expõe operações de criação, edição e troca. A interface nunca consulta
essas chaves diretamente.

Trocar de Casa remonta os providers de Lista, catálogo, mercados, compras e orçamento. Cada chamada
de service recebe o `houseId` ativo, e os repositories filtram leituras por índices da Casa. Mutações
de Lista e Mercado também validam que o registro pertence à Casa solicitante.

## Autoria e snapshots

Itens novos da Lista registram `addedByMemberId` e `addedByNameSnapshot`, mantendo `addedBy` para
compatibilidade. Sessões e itens de compra registram `purchasedById` e o nome histórico. Renomear um
membro altera a identidade atual, mas não reescreve compras concluídas.

## Foto de perfil local

`ProfileAvatar` é a representação única da identidade visual. O componente cria uma URL temporária
para o `Blob` do membro e a revoga ao trocar ou desmontar; sem foto, deriva até duas iniciais do nome.
Sidebar, lista de membros, cartão do perfil e Home recebem o mesmo `HouseMember` do `HouseProvider`.

Antes de salvar, o navegador valida JPEG, PNG ou WebP, recorta o centro em um quadrado, limita a
512 × 512 px e comprime em WebP com qualidade 0,82, usando JPEG como fallback. O `Blob` resultante é
gravado no registro existente da store `houseMembers` no modo local. No modo online, a store v6
`profileAvatars` mantém o Blob por UUID global até a futura etapa de Storage. Cada participação possui
ID e `houseId` próprios; criar outra Casa não copia a foto local de forma implícita.

## Migração v4

A atualização cria somente `houses` e `houseMembers`, além das chaves ativas. A Casa inicial reutiliza
o `houseId` legado, portanto os registros existentes continuam associados corretamente sem cópia ou
reseed. O membro mínimo recebe o nome demonstrativo anterior e pode ser renomeado depois. Um teste
abre um IndexedDB v3 populado com todos os domínios, atualiza para v4 e confirma que nenhum registro
foi perdido.

## Regras locais

- somente owner altera a Casa ou administra outros membros;
- uma Casa não pode ficar sem membros;
- o último owner não pode ser removido ou rebaixado antes de transferir a função;
- não há exclusão definitiva de Casa nesta etapa;
- novas Casas recebem apenas categorias padrão e começam sem dados funcionais copiados.

## Futuro backend

Hoje, trocar `activeMember` simula qual pessoa está usando o dispositivo. No futuro, a autenticação
real fornecerá `auth.user.id`; memberships remotas determinarão Casas acessíveis e permissões. Uma
implementação remota poderá substituir `LocalHouseRepository` pelos mesmos contratos, acrescentando
autorização, sincronização e resolução de conflitos sem reescrever a interface.
