import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import { pwaInstallManager } from './pwa/install-manager';
import { startPwaUpdateController } from './pwa/update-controller';
import './styles/global.css';
import './styles/spending.css';
import './styles/products.css';

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
