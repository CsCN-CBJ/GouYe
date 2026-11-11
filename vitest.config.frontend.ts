// vitest.config.frontend.ts
// Sub-config for frontend DOM tests (happy-dom environment)
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'happy-dom',
        setupFiles: ['./tests/frontend/setup.js'],
        include: ['tests/frontend/**/*.test.{js,ts}'],
        sequence: { concurrent: false },
        fileParallelism: false,
        testTimeout: 5000,
    },
});
