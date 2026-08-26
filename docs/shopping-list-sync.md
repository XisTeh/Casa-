# Sincronização offline-first da Lista

A interface nunca grava diretamente no Supabase. O fluxo é:

```text
React -> ShoppingListService -> OfflineFirstShoppingRepository
                                      |-> IndexedDB (shoppingItems + syncOutbox)
                                      |-> Supabase (shopping_items + Realtime)
```

## Escrita e outbox

Create, update e delete aparecem imediatamente no IndexedDB. No modo online, a mesma transação
grava uma entrada de outbox com Casa, entidade, operação, snapshot completo, versão, tentativas e
erro temporário. Uma nova alteração do mesmo item substitui a anterior; isso compacta create +
updates + delete em uma única operação idempotente. Delete é um tombstone (`deletedAt`), oculto da
UI, e não uma remoção local definitiva.

A fila é filtrada por `houseId` e pelo UUID da conta que fez a alteração. Uma sessão diferente no
mesmo dispositivo não envia operações antigas como se fossem suas.

## Reconciliação e conflitos

O worker roda na abertura, no evento `online`, ao voltar para uma aba visível e em retries com
backoff exponencial limitado a 60 segundos. Cada ciclo puxa o estado remoto, envia a fila elegível e
puxa novamente. A RPC `apply_shopping_item` faz upsert pelo UUID estável e devolve o registro que
venceu, portanto repetir uma requisição após timeout não duplica itens.

A primeira versão usa last-write-wins por `updated_at`. Edições locais usam um relógio lógico
monotônico em relação à versão conhecida. Em empate, delete vence update. Uma edição estritamente
mais nova pode restaurar um tombstone. Inclusões independentes possuem UUIDs diferentes e coexistem.
Relógios muito divergentes entre dispositivos continuam sendo uma limitação conhecida dessa
estratégia simples.

## Realtime e troca de Casa

Existe uma subscription filtrada por `house_id` para a Casa ativa. Eventos são reconciliados no
IndexedDB antes de atualizar a UI. A troca de Casa desmonta o provider anterior, remove a
subscription e cria outra para a nova Casa. A outbox sempre é consultada pela Casa solicitada.
Realtime é apenas um acelerador: se cair, a Lista local continua funcionando e o próximo ciclo faz
reconciliação completa.

## Dados anteriores

Itens associados à Casa local legada não são enviados automaticamente. Ao entrar em uma Casa
online, o app apresenta uma decisão explícita. Confirmar cria cópias com UUIDs novos na Casa escolhida
e preserva os originais. "Agora não" não grava, apaga nem envia nada.

Produtos e Categorias continuam locais. IDs locais que não são UUID não são enviados para as
colunas UUID remotas; o snapshot de nome, categoria, marca, quantidade, unidade e observações
mantém a Lista compartilhável sem migrar esses módulos antes da hora.
