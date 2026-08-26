# Histórico e comparação de preços

## Fonte de verdade

O módulo não mantém uma tabela, cache ou estado persistido de preços. Todo valor é derivado de
`PurchaseItem` pertencente a uma `PurchaseSession` concluída. Assim, o histórico por compra, o último
preço do catálogo e a análise de preços permanecem coerentes e sobrevivem ao reload pelo IndexedDB
`casae-local` v4.

Os seletores em `src/application/price-history-selectors.ts` formam a camada de projeção. Eles
produzem, sem escrever no banco:

- último e penúltimo preço unitário;
- diferença absoluta e percentual, com estados de alta, queda, estável ou sem comparação;
- menor, maior e média histórica;
- último, menor, maior, média e quantidade de registros por mercado;
- linha do tempo cronológica e registros em ordem decrescente.

Uma primeira compra informa “Sem comparação”. Se o preço anterior é zero, a direção e a diferença
absoluta continuam disponíveis, mas nenhum percentual infinito ou `NaN` é exibido.

## Identidade, snapshots e legado

Itens com `productId` são agrupados por esse ID estável. Renomear ou desativar um produto não apaga
nem fragmenta seu histórico: o card analítico usa o nome atual e cada registro mantém o
`productNameSnapshot`, marca, categoria, mercado, unidade, quantidade, preço e data originais. O
detalhe de uma compra continua mostrando exclusivamente seus snapshots.

Itens antigos sem `productId` são preservados e agrupados somente por nome normalizado exatamente
igual. Eles recebem o rótulo “Registro legado”; não há fuzzy matching nem tentativa arriscada de
fundir produtos semelhantes.

## Unidades e interpretação

Comparações só acontecem dentro da mesma unidade textual. Compras em `pacote` e `kg`, por exemplo,
geram séries separadas e podem ser alternadas no detalhe. O módulo não conhece peso de embalagem,
volume convertido ou equivalência comercial, portanto não calcula preço por kg/litro quando essa
informação não existe.

“Melhor histórico” significa o menor preço efetivamente registrado naquela unidade e naquele
histórico local. Não afirma que seja o preço atual do mercado. De modo semelhante, filtros por
mercado localizam produtos que já tiveram registro no estabelecimento; os cards continuam mostrando
a unidade da compra mais recente do produto.

## Interfaces

- `/historico?visao=precos`: busca por produto/marca/categoria, filtros de categoria e mercado,
  ordenação por recência, alta, queda, menor preço ou nome e cards resumidos;
- detalhe do preço: seletor de unidade, métricas, gráfico SVG leve, comparação histórica entre
  mercados e linha do tempo;
- `/produtos`: o bloco “Último preço” abre o mesmo detalhe, inclusive para produtos inativos quando
  eles são exibidos pelo filtro de status.

Filtros e detalhes da página de Histórico usam parâmetros de URL. Alta, queda e estabilidade têm
ícone e texto além da cor. O gráfico possui nome acessível e o estado com apenas um registro não
inventa uma tendência.

## Compatibilidade e evolução

A entrega mantém o IndexedDB na versão 4. Os índices necessários para identidade e consultas futuras
já existem; a projeção atual faz uma leitura em lote das sessões concluídas, apropriada ao volume de
uma casa e sem padrão N+1. Se o volume passar a exigir paginação ou agregação incremental, a camada de
aplicação pode conservar o mesmo contrato enquanto repositories locais ou remotos otimizam a busca.
