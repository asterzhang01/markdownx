import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Build as library for embedding in native apps
    lib: {
      entry: resolve(__dirname, 'src/index.tsx'),
      name: 'MarkdownXEditor',
      formats: ['es', 'umd'],
      fileName: (format) => `editor.${format}.js`,
    },
    rollupOptions: {
      // External dependencies that shouldn't be bundled
      external: ['react', 'react-dom'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
        },
      },
    },
  },
  // For standalone usage (dev mode)
  server: {
    port: 3001,
    host: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
