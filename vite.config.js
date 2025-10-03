// vite.config.js
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  plugins: [svelte()],
  root: './renderer',
  build: {
    outDir: './dist',
    emptyOutDir: true
  },
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true
  }
}));
