import { describe, expect, it } from 'vitest';
import { DEV_SERVICE_WORKER_PATH, DEV_SERVICE_WORKER_SOURCE } from '../pwa/dev-service-worker';

describe('Service Worker de desenvolvimento', () => {
  it('assume uma origem antiga, recarrega os clientes e não apaga dados locais', () => {
    expect(DEV_SERVICE_WORKER_PATH).toBe('/sw.js');
    expect(DEV_SERVICE_WORKER_SOURCE).toContain('skipWaiting');
    expect(DEV_SERVICE_WORKER_SOURCE).toContain('clients.claim');
    expect(DEV_SERVICE_WORKER_SOURCE).toContain('registration.unregister');
    expect(DEV_SERVICE_WORKER_SOURCE).toContain('client.navigate(client.url)');
    expect(DEV_SERVICE_WORKER_SOURCE).not.toContain('caches.delete');
    expect(DEV_SERVICE_WORKER_SOURCE).not.toContain('indexedDB.deleteDatabase');
  });
});
