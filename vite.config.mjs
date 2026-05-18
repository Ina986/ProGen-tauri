import { defineConfig } from 'vite';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  root: 'src',
  publicDir: false,
  cacheDir: '../node_modules/.vite',
  clearScreen: false,
  server: {
    port: 1450,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: 'ws', host, port: 1451 }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
});
