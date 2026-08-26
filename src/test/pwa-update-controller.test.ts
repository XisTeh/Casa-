import { vi } from 'vitest';
import { indexedDB as fakeIndexedDB } from 'fake-indexeddb';
import { PWA_UPDATE_READY_KEY, startPwaUpdateController } from '../pwa/update-controller';

function createStorage(initialValue?: string) {
  const values = new Map<string, string>();
  if (initialValue) values.set(PWA_UPDATE_READY_KEY, initialValue);
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
  };
}

function setup(initialValue?: string) {
  const storage = createStorage(initialValue);
  const activateUpdate = vi.fn().mockResolvedValue(undefined);
  let callbacks: Parameters<Parameters<typeof startPwaUpdateController>[0]['register']>[0];
  const register = vi.fn((options) => {
    callbacks = options;
    return activateUpdate;
  });
  const documentRef = {
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const reload = vi.fn();
  const dispose = startPwaUpdateController({ register, storage, documentRef, reload });
  return { activateUpdate, callbacks: callbacks!, dispose, documentRef, reload, storage };
}

describe('atualização controlada do PWA', () => {
  it('marca a versão pronta sem recarregar nem tocar no IndexedDB durante o uso atual', () => {
    const deleteDatabase = vi.spyOn(fakeIndexedDB, 'deleteDatabase');
    const { activateUpdate, callbacks, reload, storage } = setup();

    callbacks?.onNeedRefresh?.();

    expect(storage.setItem).toHaveBeenCalledWith(PWA_UPDATE_READY_KEY, 'true');
    expect(activateUpdate).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(deleteDatabase).not.toHaveBeenCalled();
  });

  it('ativa a versão que já estava pronta na abertura seguinte', () => {
    const { activateUpdate, callbacks, storage } = setup('true');

    callbacks?.onNeedRefresh?.();

    expect(storage.removeItem).toHaveBeenCalledWith(PWA_UPDATE_READY_KEY);
    expect(activateUpdate).toHaveBeenCalledWith(true);
  });

  it('verifica no início e ao voltar do background, recarregando só após assumir controle', () => {
    const { callbacks, documentRef, reload, storage } = setup('true');
    const update = vi.fn().mockResolvedValue(undefined);
    callbacks?.onRegisteredSW?.('/sw.js', { update } as unknown as ServiceWorkerRegistration);
    expect(update).toHaveBeenCalledOnce();

    const visibilityHandler = documentRef.addEventListener.mock.calls.find(
      ([event]) => event === 'visibilitychange',
    )?.[1] as EventListener;
    visibilityHandler(new Event('visibilitychange'));
    expect(update).toHaveBeenCalledTimes(2);

    callbacks?.onNeedReload?.();
    expect(storage.removeItem).toHaveBeenCalledWith(PWA_UPDATE_READY_KEY);
    expect(reload).toHaveBeenCalledOnce();
  });
});
