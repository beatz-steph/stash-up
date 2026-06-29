import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['../../test/setup.ts', './test/setup.ts'],
    server: {
      deps: {
        inline: [/@workspace\/ui/],
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      '@test': path.resolve(__dirname, '../../test'),
      'server-only': path.resolve(__dirname, '../../test/empty-module.ts'),
    },
  },
});
