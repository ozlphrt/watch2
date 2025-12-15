export default {
  server: {
    port: 3000,
    open: true
  },
  // Disable any PWA/service worker plugins
  plugins: [],
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d']
  },
  assetsInclude: ['**/*.wasm']
};

