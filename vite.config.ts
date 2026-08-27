/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { casaeManifest } from './src/pwa/manifest.ts';
import {
  DEV_SERVICE_WORKER_PATH,
  DEV_SERVICE_WORKER_SOURCE,
} from './src/pwa/dev-service-worker.ts';

function devServiceWorkerCleanup(): Plugin {
  return {
    name: 'casae-dev-service-worker-cleanup',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
        if (pathname !== DEV_SERVICE_WORKER_PATH) return next();
        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Service-Worker-Allowed', '/');
        response.end(DEV_SERVICE_WORKER_SOURCE);
      });
    },
  };
}

export default defineConfig({
  plugins: [
    devServiceWorkerCleanup(),
    react(),
    VitePWA({
      registerType: 'prompt',
      manifest: casaeManifest,
      workbox: {
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: [
          'apple-touch-icon.png',
          'icons/casae-icon-*.png',
          'icons/casae-maskable-512.png',
          'icons/casae-maskable.svg',
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    environment: 'jsdom',
    env: {
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
    },
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['e2e/**', 'Aldebaran XVIII/**'],
    setupFiles: './src/test/setup.ts',
    css: true,
    coverage: { reporter: ['text', 'html'] },
  },
});
