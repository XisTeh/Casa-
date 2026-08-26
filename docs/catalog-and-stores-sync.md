# Sincronização de categorias, produtos e mercados

Categorias, produtos e mercados usam o mesmo fluxo offline-first da Lista: a gravação acontece primeiro no IndexedDB, uma entrada é criada na `syncOutbox` compartilhada e a interface é atualizada imediatamente. Reconexão, retorno à aba e Realtime disparam reconciliação com o Supabase. Eventos remotos são gravados diretamente no cache local e nunca criam outra operação de outbox.

## Identidade e legado

Novos registros usam UUID gerado no cliente como `id`. Registros históricos mantêm o `id` local original, pois compras, itens e snapshots podem referenciá-lo. Após a confirmação explícita da importação, eles recebem um `syncId` UUID persistente usado como chave remota. Produtos mantêm o `categoryId` local e o adaptador converte para o `syncId` da categoria ao enviar. Itens da Lista usam o UUID remoto em `productId`/`categoryId` quando disponível e preservam a referência local em `houseProductId`.

A importação é marcada por Casa em metadata, pode ser retomada e não remove a origem. Defaults são reconciliados por `legacyKey`; produtos só são associados automaticamente quando nome normalizado, marca e categoria coincidem de forma inequívoca; mercados exigem igualdade normalizada exata, sem comparação aproximada.

## Conflitos e exclusão

As RPCs `apply_category`, `apply_product` e `apply_store` são idempotentes e aplicam last-write-wins por `updated_at`. Em empate, o tombstone vence. Exclusões usam `deleted_at`, permitindo que uma remoção offline seja propagada sem ressuscitar versões antigas.

## Segurança e defaults

RLS usa `private.is_house_member(house_id)` em todas as tabelas. A função privada `ensure_default_categories` contém exatamente as 11 categorias definidas no domínio. A nova versão de `create_house` chama essa função na mesma transação, e a migration executa backfill idempotente para Casas existentes.
