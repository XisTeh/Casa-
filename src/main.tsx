import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import { pwaInstallManager } from './pwa/install-manager';
import { finishLaunchScreen } from './pwa/launch-screen';
import { startPwaUpdateController } from './pwa/update-controller';
import './styles/global.css';
import './styles/spending.css';
import './styles/products.css';

if (import.meta.env.DEV) {
  void import('./infrastructure/purchase/purchaseDiagnostics').then(
    ({ installPurchaseDiagnostics }) => installPurchaseDiagnostics(),
  );
  void import('./infrastructure/profile/profileAvatarDiagnostics').then(
    ({ installProfileAvatarDiagnostics }) => installProfileAvatarDiagnostics(),
  );
}

pwaInstallManager.start();
startPwaUpdateController({
  register: registerSW,
  storage: window.localStorage,
  documentRef: document,
  reload: () => window.location.reload(),
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

finishLaunchScreen();
