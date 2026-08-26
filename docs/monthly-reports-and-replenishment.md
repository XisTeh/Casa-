# Relatório mensal e reposição

## Origem e isolamento dos dados

O relatório mensal, os destaques, a evolução e as sugestões são projeções locais. A fonte financeira
continua sendo exclusivamente `PurchaseSession` com status `completed` e seus `PurchaseItem`. Cada
provider carrega apenas o `houseId` ativo e os seletores voltam a filtrar a Casa ao calcular
recorrência. Não existem tabelas de relatórios, totais ou preços derivados.

Tudo funciona offline no IndexedDB `casae-local`. Somente a preferência manual de recorrência é
persistida, no próprio `Product`, pelos campos `isRecurring` e `recurrenceDays`.

## Métricas do relatório

- **Total gasto:** soma de `PurchaseSession.totalPriceCents` no mês selecionado.
- **Orçamento, saldo e percentual:** orçamento da Casa/ano/mês menos o total; percentual é
  `total / orçamento × 100`.
- **Compras e ticket médio:** quantidade de sessões concluídas e total dividido pela quantidade.
- **Maior e menor compra:** extremos de `totalPriceCents` das sessões do mês.
- **Mercados:** agregação por `storeId`; legado usa apenas snapshot normalizado exato. Há rankings
  independentes por valor e quantidade de sessões.
- **Categorias:** soma dos itens pelo snapshot de categoria da compra.
- **Produtos:** agregação prioritária por `productId`; legado sem ID usa nome e marca normalizados
  exatamente. Maior gasto soma `totalPriceCents`; mais comprado conta sessões distintas.
- **Produtos diferentes:** quantidade de identidades de produto distintas no mês.
- **Comparação:** diferença absoluta e percentual contra o mês imediatamente anterior. Quando o
  mês anterior é zero, não é exibido percentual infinito ou enganoso.
- **Variação de preço:** compara as duas observações em dias distintos mais recentes até o mês,
  sempre para o mesmo produto e a mesma unidade. Unidades não são convertidas nem misturadas.
- **Evolução:** soma mensal dos seis períodos terminando no mês selecionado.

Meses sem sessões mostram estados vazios e valores indisponíveis, sem dados demonstrativos.

## Recorrência manual

Na edição do produto é possível marcar **Recorrente** e definir de 1 a 365 dias. A migração
`product-recurrence-v5` é incremental e idempotente: produtos antigos recebem `isRecurring: false`,
sem recriar a store, apagar registros ou modificar snapshots. Desmarcar a opção remove o intervalo
manual.

O prazo é contado desde a última compra compatível com a unidade padrão. Atingir o prazo produz uma
sugestão; nunca inclui automaticamente o produto na Lista.

## Recorrência inferida

A inferência exige pelo menos três compras concluídas do mesmo `productId`, mesma Casa e mesma
unidade padrão, em dias distintos. Os intervalos positivos entre dias consecutivos são calculados e
o intervalo típico é a **mediana**, arredondada para dias inteiros. A mediana foi escolhida porque
uma compra excepcionalmente adiantada ou atrasada distorce menos o resultado que a média simples.

Compras repetidas no mesmo dia contam uma vez. Histórico curto, datas inválidas e unidades
incompatíveis não produzem sugestão. Para itens legados sem `productId`, o fallback só ocorre quando
o nome normalizado exato corresponde a um único produto da Casa; não há matching aproximado.

## Critérios de sugestão e ação

Um produto só aparece em **Hora de repor?** quando está ativo, pertence à Casa atual, possui última
compra compatível, atingiu o intervalo manual ou inferido e ainda não está na Lista. A Home mostra no
máximo três prioridades; Produtos mostra a visão completa.

Ao clicar em **Adicionar à lista**, `ProductService.addToShoppingList` consulta novamente a Lista,
impede duplicação por `productId`/`houseProductId` e copia quantidade, unidade, categoria, marca e
observações padrão mantendo o ID existente. A decisão é sempre do usuário.

## Evolução futura para backend

Um backend futuro deve armazenar produtos e configurações manuais, além das compras originais. Os
relatórios e sugestões devem continuar derivados, com consultas autorizadas por `houseId`. Regras de
sincronização, conflitos e automação opcional serão decisões separadas; esta etapa não inclui API,
login, Supabase nem sincronização entre dispositivos.
