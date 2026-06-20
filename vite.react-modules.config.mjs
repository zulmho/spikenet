import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  define: {
    'process.env.NODE_ENV': JSON.stringify('production')
  },
  build: {
    emptyOutDir: false,
    outDir: path.resolve(process.cwd(), 'public/js'),
    lib: {
      entry: path.resolve(process.cwd(), 'src/react-spikenet/main.jsx'),
      name: 'SpikeNetReactModules',
      formats: ['es'],
      fileName: () => 'spikenet-react-modules.js'
    },
    rollupOptions: {
      output: {
        assetFileNames: 'spikenet-react-modules.[ext]'
      }
    }
  },
  resolve: {
    alias: {
      '@react-modules': path.resolve(process.cwd(), 'src/module/ReactModules-main/modules')
    }
  }
});
