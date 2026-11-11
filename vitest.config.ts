import dotenv from 'dotenv';
import { defineConfig } from 'vitest/config';

dotenv.config({ path: '.env.test' });

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    exclude: ['tests/frontend/**'],
    sequence: { concurrent: false },
    fileParallelism: false,
    testTimeout: 10000,
    env: {
      NODE_ENV: 'test',
    },
  },
});
