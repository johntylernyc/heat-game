import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'src/client',
  plugins: [react()],
  server: {
    proxy: {
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
  test: {
    root: '.',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
