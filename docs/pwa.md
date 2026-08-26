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

Os ícones `v2` foram derivados programaticamente dos paths da marca já existente em
`public/icons/casae-mark.svg`.

- `casae-app-v2-192.png` e `casae-app-v2-512.png`: purpose `any`, fundo transparente.
- `casae-maskable-v2-192.png` e `casae-maskable-v2-512.png`: purpose `maskable`, marca dentro da
  safe zone e fundo `#f7f6f2`, igual ao `background_color`.
- `apple-touch-icon-v2.png`: ícone 180 px com o mesmo fundo limpo.

O antigo `casae-maskable-512.png` era totalmente opaco e levava `#11343d` até os quatro cantos,
produzindo a placa verde no splash. Os novos nomes invalidam a referência anterior do manifest.

Para conferir especificamente a troca do ícone/splash em um aparelho que já instalou a versão
antiga, pode ser necessário remover a instalação **uma única vez** devido ao cache do launcher do
Android. Depois dessa migração visual, deploys normais são recebidos pelo service worker e não
exigem reinstalação.

Os assets em `android/app/src/main/res` pertencem ao empacotamento Capacitor e não participam do
splash de uma PWA instalada pelo navegador a partir da Vercel.
