import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const isGame = process.env.VITE_ENTRY === 'game';
const isProduction = process.env.NODE_ENV === 'production';

export default defineConfig({
  base: isProduction ? '/watch2/' : '/',
  root: isGame ? resolve(__dirname, 'game') : resolve(__dirname),
  server: {
    port: isGame ? 3001 : 3000,
    host: true, // Listen on all interfaces (IPv4 and IPv6)
    open: isGame ? '/' : true,
  },
  build: {
    rollupOptions: {
      input: isGame ? resolve(__dirname, 'game/index.html') : resolve(__dirname, 'index.html'),
    },
  },
  plugins: [
    // Only enable PWA in production builds
    ...(isProduction ? [
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: isGame ? 'Watch Matching Game' : 'Watch Physics Simulation',
          short_name: isGame ? 'Watch Game' : 'Watch Sim',
          description: isGame ? 'Match colored cubes with Greek letters' : '3D watch with physics simulation',
          theme_color: '#000000',
          background_color: '#000000',
          display: 'standalone',
          scope: isGame ? '/watch2/game/' : '/watch2/',
          start_url: isGame ? '/watch2/game/' : '/watch2/',
          icons: [
            {
              src: isProduction ? '/watch2/192.png' : '/192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: isProduction ? '/watch2/512.png' : '/512.png',
              sizes: '512x512',
              type: 'image/png',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        },
      }),
    ] : []),
  ],
});
