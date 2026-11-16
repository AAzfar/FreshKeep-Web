import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'My Companion App',
    short_name: 'Companion',
    description: 'Sync and manage your data across iOS, PC, and Android.',
    start_url: '/',
    display: 'standalone', // Hides browser URL bar on iOS & PC
    background_color: '#ffffff',
    theme_color: '#0f172a',
    icons: [
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
