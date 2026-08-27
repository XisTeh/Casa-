# Gastos e orçamento mensal

## Fonte de verdade

Gastos não possuem tabela própria. A página `/gastos` considera somente `PurchaseSession` com status
`completed` no mês selecionado. O total mensal vem de `totalPriceCents` das sessões; categorias e
demais recortes usam os `PurchaseItem` históricos dessas mesmas sessões. Sessões ativas ou canceladas
não entram em nenhuma projeção.

Todos os valores monetários são inteiros em centavos. Itens no mesmo dia são somados antes da curva
acumulada. A comparação usa o mês civil anterior, inclusive na passagem dezembro/janeiro. Quando o
mês anterior não tem gasto, a interface informa que não há comparação em vez de dividir por zero.

## Orçamento

`HouseBudget` é persistido primeiro na store `houseBudgets` com chave estável e índice único por
`houseId`, ano e mês. No modo online, a mesma `syncOutbox` envia o registro para `house_budgets`, cuja
constraint `UNIQUE(house_id, year, month)` impede duplicatas. Realtime atualiza os demais membros e
salvar novamente preserva a identidade remota e a data de criação. Não há orçamento implícito nem
valor demonstrativo: sem cadastro, a interface mostra claramente “Sem orçamento”.

O progresso usa os seguintes estados:

- abaixo de 70%: normal;
- de 70% até menos de 85%: atenção moderada;
- de 85% até menos de 100%: alerta;
- 100% ou mais: orçamento esgotado/excedido.

O disponível nunca é apresentado como moeda negativa. Se houve excesso, o valor excedente aparece
separadamente. Para o mês atual, a estimativa diária divide o saldo positivo pelos dias restantes e
arredonda para baixo em centavos. Meses passados ou futuros não recebem uma falsa recomendação diária.

## Categorias, mercados e compras

O ranking de categorias usa `categoryNameSnapshot`, com compatibilidade para o campo legado
`categorySnapshot` e fallback “Outros”. Assim, renomear uma categoria hoje não reescreve o passado.
Mercados são agrupados por `storeId`; registros legados sem ID usam apenas o nome histórico
normalizado. O ranking também informa quantas compras compõem o total.

“Maiores compras” ordena as sessões concluídas pelo total e abre o mesmo detalhe de compra usado no
Histórico. A curva SVG é acumulada, não uma previsão: posiciona cada ponto pelo dia civil, compara o
mês anterior com uma linha secundária e mostra o orçamento como limite horizontal quando ele existe.
Os pontos respondem a mouse, toque e teclado, com valor acumulado textual; cartões e rankings mantêm
a mesma informação fora do gráfico. Meses vazios preservam eixos e composição, mas não inventam uma
curva de dados.

## Reatividade e navegação

Finalizar ou receber uma compra por Realtime atualiza o IndexedDB e o `PurchaseContext`; Dashboard,
Histórico, Gastos e relatório recalculam as projeções sem reload. Salvar ou receber um orçamento
atualiza `BudgetContext` da mesma forma. O mês selecionado fica no parâmetro `mes=AAAA-MM`.

## Sincronização e autorização

`OfflineFirstBudgetRepository` usa IndexedDB, outbox, retry e Realtime por Casa.
`SupabaseBudgetRepository` acessa apenas a RPC idempotente e a leitura protegida por RLS. Somente
membros ativos leem ou alteram o orçamento. Os seletores financeiros permanecem puros; não existe
um segundo livro de despesas que concorra com compras concluídas como fonte de verdade.
