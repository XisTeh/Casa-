import { useSyncExternalStore } from 'react';
import { pwaInstallManager } from './install-manager';

export function usePwaInstall() {
  const snapshot = useSyncExternalStore(
    pwaInstallManager.subscribe,
    pwaInstallManager.getSnapshot,
    pwaInstallManager.getSnapshot,
  );

  return {
    ...snapshot,
    promptInstall: () => pwaInstallManager.promptInstall(),
  };
}
