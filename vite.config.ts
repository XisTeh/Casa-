/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/casae-mark.svg', 'favicon.svg'],
      manifest: {
        id: '/',
        name: 'Casaê',
        short_name: 'Casaê',
        description: 'Compras e gastos da casa, organizados em conjunto.',
        theme_color: '#173b45',
        background_color: '#f7f6f2',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        lang: 'pt-BR',
        orientation: 'portrait-primary',
        categories: ['lifestyle', 'productivity'],
        icons: [
          {
            src: '/icons/casae-mark.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: '/icons/casae-maskable.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['e2e/**', 'Aldebaran XVIII/**'],
    setupFiles: './src/test/setup.ts',
    css: true,
    coverage: { reporter: ['text', 'html'] },
  },
});
