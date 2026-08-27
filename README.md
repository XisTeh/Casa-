# Casaê

Casaê é uma aplicação doméstica para organizar a Lista, compras, Produtos da Casa, Mercados e
Histórico. A fundação online opcional usa Supabase Auth para contas reais e PostgreSQL/RLS para
perfis, Casas, memberships e convites. Lista, catálogo, mercados, compras e orçamento são
offline-first: usam o IndexedDB `casae-local` como fonte imediata, sincronizam com o Supabase pela
mesma outbox e recebem mudanças por Realtime.

## Stack e execução

- React 19, TypeScript strict, Vite 8 e React Router
- PWA com `vite-plugin-pwa` e empacotamento Capacitor já existente
- IndexedDB atrás de contratos de repository
- Supabase Auth/PostgreSQL/Realtime atrás de repositories isolados por domínio
- Vitest, Testing Library, Playwright, ESLint e Prettier

Requer Node.js 24 (ou uma versão suportada pelo Vite 8) e npm 11+.

```bash
npm install
npm run dev
```

A aplicação abre em `http://localhost:5173` no desenvolvimento.

Sem `.env`, inicia no modo local existente. Para ativar conta e Casas online, copie `.env.example`
para `.env`, preencha a URL e a chave pública do projeto e aplique as migrations. O passo a passo
para iniciantes está em [Fundação online](docs/backend-foundation.md).

Para gerar a versão de produção:

```bash
npm run build
```

O resultado fica em `dist`. Na Vercel, use `npm run build` como Build Command e `dist` como Output
Directory. O `vercel.json` preserva arquivos reais da PWA e encaminha somente as demais URLs para
`index.html`, permitindo abrir diretamente rotas do React Router sem erro 404.

## Módulos funcionais

- Dashboard conectado à Lista, às compras concluídas e ao orçamento mensal real
- Lista com CRUD offline, busca, filtros, outbox, Realtime e vínculo local opcional por `productId`
- Comprar usando a Lista e Compra Rápida
- Produtos da Casa com cadastro, edição, favoritos, inativos, último preço e recorrência manual
- Categorias da Casa com criação, edição, ativação e proteção quando estão em uso
- Mercados e Histórico com snapshots imutáveis, visão por compra e comparação de preços
- Gastos com relatório mensal derivado, destaques, comparação e evolução dos últimos seis meses
- Sugestões locais de reposição por frequência manual ou padrão do histórico
- Casas, membros e perfis locais ou online, com troca reativa e isolamento por Casa

## Produtos e categorias

`Product` possui ID estável independente do nome, `houseId`, nome normalizado, marca, `categoryId`,
quantidade/unidade padrão, observações, favorito, recorrência manual, estado ativo e timestamps. `Category` também possui
ID estável, `houseId`, nome normalizado, estado e timestamps. Duplicatas só são reconhecidas por nome
normalizado exatamente igual dentro da mesma Casa; não há fuzzy matching.

A página `/produtos` permite buscar por nome, marca ou categoria, filtrar favoritos/recorrentes/status, adicionar
um produto à Lista e gerenciar categorias. Produtos com histórico são desativados, nunca apagados. Se
um cadastro inativo tiver o mesmo nome de uma nova tentativa, a interface oferece reativação.

Ao adicionar um Produto da Casa à Lista, os padrões são copiados para o item e o mesmo `productId` é
mantido. Um segundo clique não cria duplicata silenciosa. Itens digitados manualmente continuam
permitidos; um cadastro posterior com nome normalizado exatamente igual cria o vínculo seguro.

A Compra Rápida prioriza o catálogo central. A sugestão exibe último preço e mercado apenas como
referência: o campo de preço permanece para confirmação da compra atual. Um nome novo cria
automaticamente um produto básico no catálogo, com a categoria Outros quando não houver outra
categoria conhecida.

## Persistência e migração

O IndexedDB `casae-local` está na versão 8 e contém:

- `shoppingItems`
- `purchaseSessions`
- `purchaseItems`
- `stores`
- `products`
- `categories`
- `houseBudgets`
- `houses`
- `houseMembers`
- `profileAvatars`
- `metadata`
- `syncOutbox`

No modo online, as alterações offline-first são gravadas primeiro nas stores locais e compactadas
na `syncOutbox` compartilhada. A fila é separada por Casa e pela conta que originou a alteração.
Abertura do app, evento `online`, retorno à aba e retry com backoff retomam o envio. Realtime reduz a
latência entre membros, enquanto o IndexedDB continua sendo a fonte imediata da interface. Veja
[Sincronização da Lista](docs/shopping-list-sync.md).

A migração `catalog-products-categories-v2` é transacional e idempotente. Ela preserva os registros
anteriores, cria as categorias iniciais uma única vez e reconcilia Lista/Histórico usando primeiro um
`productId` existente e, na ausência dele, somente nome normalizado exatamente igual. Os registros
atualizados são gravados com `put` e a marca de conclusão entra na mesma transação, de modo que uma
interrupção pode ser repetida sem duplicar ou perder dados. Categorias não são resemeadas depois que a
migração foi concluída.

A migração idempotente `product-recurrence-v5` acrescenta valores padrão conservadores aos produtos
anteriores dentro da store já existente. Não há store de relatórios ou sugestões: somente
`isRecurring` e `recurrenceDays` são persistidos no produto da Casa.

Compras continuam renderizando `productNameSnapshot`, `brandSnapshot`, categoria, unidade, preço,
mercado, comprador e data salvos no momento da compra. Editar o catálogo nunca reescreve esses
snapshots. O último preço/mercado/data de um produto é derivado dos `purchaseItems` de sessões
concluídas, ordenados por `purchasedAt`; não existe uma tabela redundante de preços.

Em `/historico`, a aba **Preços** agrupa registros pelo `productId` estável e mantém registros legados
sem ID por nome normalizado exato. As métricas de último/anterior, variação, mínimo, máximo e média,
o gráfico, os mercados e a linha do tempo são projeções dos mesmos itens comprados. Cada unidade é
analisada isoladamente: o aplicativo não compara nem converte `kg`, `pacote`, `unidade` ou outras
unidades incompatíveis. A página `/produtos` abre o mesmo detalhe pelo bloco de último preço.

Veja [Histórico e comparação de preços](docs/price-history.md) para regras, limitações e cenários de
compatibilidade.

Em `/gastos`, todos os valores gastos são projeções das mesmas sessões e itens concluídos usados no
Histórico; não existe livro-caixa duplicado. Apenas o orçamento planejado é persistido, uma vez por
Casa, ano e mês. Veja [Gastos e orçamento mensal](docs/spending-and-budget.md) para os cálculos,
limites visuais, reatividade e evolução futura.

O relatório completo e as sugestões de reposição são documentados em
[Relatório mensal e reposição](docs/monthly-reports-and-replenishment.md), incluindo fórmulas,
critérios mínimos, isolamento por Casa e comportamento offline.

Em `/configuracoes`, a Casa pode ser renomeada, membros locais podem ser administrados e novas Casas
podem ser criadas e alternadas. `activeHouseId` e `activeMemberId` ficam em `metadata`. Todos os
módulos carregam novamente seus dados pelo `houseId` ativo sem recarregar a página. Veja
[Casas, membros e identidade local](docs/houses-and-members.md).

## Scripts de qualidade

| Script              | Uso                            |
| ------------------- | ------------------------------ |
| `npm run format`    | formata o projeto              |
| `npm run lint`      | análise estática               |
| `npm run typecheck` | TypeScript strict              |
| `npm run test:run`  | testes unitários e integrados  |
| `npm run test:e2e`  | Playwright desktop e mobile    |
| `npm run build`     | typecheck e bundle de produção |
| `npm audit`         | auditoria das dependências     |

## Estrutura

```text
src/
  app/             composição, rotas e serviços padrão
  domain/          entidades e contratos de repository
  application/     serviços e seletores
  infrastructure/  IndexedDB e repositories locais
  features/        UI e providers por módulo
  styles/          identidade visual e responsividade
  test/            testes unitários e integrados
e2e/               fluxos ponta a ponta e breakpoints
docs/               decisões de arquitetura
```

A identidade multiusuário, Casas, Lista, Produtos, Categorias, Mercados, compras e orçamento possuem
implementações Supabase. Histórico, Gastos, preços e relatórios continuam projeções locais das
compras concluídas sincronizadas; fotos de perfil permanecem locais.
