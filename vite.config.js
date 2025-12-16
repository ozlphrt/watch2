import { VitePWA } from 'vite-plugin-pwa';

export default {
  // Use root base path for development, /watch2/ for production (GitHub Pages)
  base: '/watch2/',
  server: {
    port: 3000,
    open: true
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['192.png', '512.png', 'favicon.ico'],
      manifest: {
        name: 'Watch Physics Simulation',
        short_name: 'Watch2',
        description: 'Interactive 3D watch with physics simulation',
        theme_color: '#a0a0b0',
        background_color: '#a0a0b0',
        display: 'standalone',
        orientation: 'any',
        scope: '/watch2/',
        start_url: '/watch2/',
        icons: [
          {
            src: '/watch2/192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/watch2/512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d']
  },
  assetsInclude: ['**/*.wasm']
};
