import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    include: ['tests/**/*.test.ts'],
  },
});
