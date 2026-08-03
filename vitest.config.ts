import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // expo-crypto has no Node build; tests use the shim added in Task 3.
      'expo-crypto': path.resolve(__dirname, './src/test/expo-crypto-shim.ts'),
    },
  },
});
