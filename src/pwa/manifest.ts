export const casaeManifest = {
  id: '/',
  name: 'Casaê',
  short_name: 'Casaê',
  description: 'Compras e gastos da casa, organizados em conjunto.',
  theme_color: '#11343d',
  background_color: '#11343d',
  display: 'standalone' as const,
  start_url: '/',
  scope: '/',
  lang: 'pt-BR',
  orientation: 'portrait-primary' as const,
  categories: ['lifestyle', 'productivity'],
  icons: [
    {
      src: '/icons/casae-app-v3-192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any' as const,
    },
    {
      src: '/icons/casae-app-v3-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any' as const,
    },
    {
      src: '/icons/casae-maskable-v3-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable' as const,
    },
  ],
};
