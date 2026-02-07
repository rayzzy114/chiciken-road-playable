import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    assetsInlineLimit: 100000000, // Inline all assets (images, audio) as Base64
    cssCodeSplit: false, // Disable CSS code splitting
    minify: 'terser', // Use terser for better minification
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log statements
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug'], // Remove specific functions
        passes: 3, // Multiple passes for better optimization
      },
      mangle: {
        safari10: true,
      },
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true, // Inline dynamic imports
      },
      treeshake: {
        moduleSideEffects: false, // Aggressive tree-shaking
        propertyReadSideEffects: false,
        tryCatchDeoptimization: false,
      },
    },
  },
  optimizeDeps: {
    exclude: [], // Ensure all deps are optimized
  },
});
