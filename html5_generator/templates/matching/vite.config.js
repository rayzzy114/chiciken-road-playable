import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  root: '.',
  base: './',
  server: {
    host: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  plugins: [viteSingleFile()]
});
