# Instalação e atualização do PWA

## Instalação

O `PwaInstallManager` é inicializado uma vez, antes da renderização do React. Ele captura
`beforeinstallprompt`, acompanha `appinstalled` e detecta `display-mode: standalone` e
`navigator.standalone`.

- Chrome/Android e navegadores desktop compatíveis exibem **Instalar Casaê** em
  **Configurações > Aplicativo** quando o navegador fornece o evento de instalação.
- Safari no iPhone/iPad exibe a instrução **Compartilhar → Adicionar à Tela de Início** e não
  simula um prompt que o navegador não oferece.
- Em modo instalado, o botão é ocultado e a tela informa **Casaê instalado**.

## Atualização após deploy

Existe somente o service worker gerado pelo `vite-plugin-pwa`. O registro usa o modo `prompt`,
mas sem interromper o usuário com um modal:

1. O registro verifica atualizações na abertura e sempre que o documento volta a ficar visível.
2. Quando uma nova versão termina de instalar, a abertura atual continua sem recarga e recebe a
   marca local `casae:pwa-update-ready`.
3. Na próxima abertura, o worker que já está em espera recebe `SKIP_WAITING`.
4. A página recarrega uma vez somente depois que o novo worker assume o controle.

Assim, uma edição ou compra ativa não é interrompida pelo deploy. O fluxo não chama APIs de
IndexedDB, não apaga dados locais e não limpa caches de forma genérica. `cleanupOutdatedCaches`
remove apenas precaches antigos gerenciados pelo próprio Workbox.

## Ícones e splash

Os ícones `v3` restauram a identidade escura usada originalmente no Android, agora em conjunto
com uma tela de abertura própria do Casaê.

- `casae-app-v3-192.png` e `casae-app-v3-512.png`: purpose `any`, marca circular petróleo.
- `casae-maskable-v3-512.png`: purpose `maskable`, fundo petróleo até a borda e marca dentro da
  safe zone.
- `apple-touch-icon-v3.png`: ícone 180 px com a mesma identidade escura.
- `theme_color` e `background_color` usam `#11343d`, evitando o clarão branco entre o splash
  nativo do Android e a aplicação.

Ao abrir em modo instalado, o HTML inicial exibe imediatamente uma composição de carregamento com
marca, nome, mensagem e animação. Ela permanece apenas durante a primeira pintura do React e então
faz uma transição curta para o aplicativo. A abertura não aparece em uma aba comum do navegador;
`?splash-preview=1` existe apenas para revisão visual.

Para conferir especificamente a troca do ícone/splash em um aparelho que já instalou a versão
antiga, pode ser necessário remover a instalação **uma única vez** devido ao cache do launcher do
Android. Depois dessa migração visual, deploys normais são recebidos pelo service worker e não
exigem reinstalação.

Os assets em `android/app/src/main/res` pertencem ao empacotamento Capacitor e não participam do
splash de uma PWA instalada pelo navegador a partir da Vercel.
