import type { RegisterSWOptions } from 'vite-plugin-pwa/types';

export const PWA_UPDATE_READY_KEY = 'casae:pwa-update-ready';

type RegisterServiceWorker = (
  options?: RegisterSWOptions,
) => (reloadPage?: boolean) => Promise<void>;

type UpdateControllerOptions = {
  register: RegisterServiceWorker;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  documentRef: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
  reload: () => void;
};

export function startPwaUpdateController({
  register,
  storage,
  documentRef,
  reload,
}: UpdateControllerOptions) {
  const applyOnThisOpening = storage.getItem(PWA_UPDATE_READY_KEY) === 'true';
  let registration: ServiceWorkerRegistration | undefined;
  let activateUpdate: (reloadPage?: boolean) => Promise<void> = async () => undefined;

  const checkForUpdate = () => {
    if (documentRef.visibilityState === 'visible') void registration?.update();
  };

  activateUpdate = register({
    immediate: true,
    onNeedRefresh: () => {
      if (applyOnThisOpening) {
        storage.removeItem(PWA_UPDATE_READY_KEY);
        void activateUpdate(true);
        return;
      }
      storage.setItem(PWA_UPDATE_READY_KEY, 'true');
    },
    onNeedReload: () => {
      storage.removeItem(PWA_UPDATE_READY_KEY);
      reload();
    },
    onRegisteredSW: (_serviceWorkerUrl, currentRegistration) => {
      registration = currentRegistration;
      checkForUpdate();
    },
  });

  documentRef.addEventListener('visibilitychange', checkForUpdate);

  return () => documentRef.removeEventListener('visibilitychange', checkForUpdate);
}
