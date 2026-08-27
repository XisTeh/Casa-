export const DEV_SERVICE_WORKER_PATH = '/sw.js';

export const DEV_SERVICE_WORKER_SOURCE = `
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    const windows = await self.clients.matchAll({ type: 'window' });
    await self.registration.unregister();
    await Promise.all(windows.map((client) => client.navigate(client.url)));
  })());
});
`;
