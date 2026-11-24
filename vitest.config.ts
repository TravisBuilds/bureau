import { defineConfig, configDefaults } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    exclude: [
      ...configDefaults.exclude,
      // Playwright specs: run with `npm run test:e2e`
      'tests/e2e/**',
      // Standalone scripts / node:test files, not vitest suites (run with `npx tsx <file>` or `node --test`)
      'tests/api-routes.test.ts',
      'tests/authorize-endpoint.test.ts',
      'tests/cimd.test.ts',
      'tests/dns-rebinding.test.ts',
      'tests/dns-rebinding-integration.test.ts',
      'tests/oauth-flow-hardened.test.ts',
      'tests/oauth-functions-minimal.test.ts',
      'tests/oauth-hardening.test.ts',
      'tests/oauth-hardening-full.test.ts',
      // Legacy DB suites with their own setup (docker-compose / hardcoded creds, or they need
      // bureau_app to touch auth.*, which is forbidden). Superseded by tests/clone-security.test.ts.
      // Set LEGACY_DB_TESTS=1 to include them (npm run test:integration does).
      ...(process.env.LEGACY_DB_TESTS
        ? []
        : [
            'tests/integration/**',
            'tests/isolation/**',
            'tests/real-database-verification.test.ts',
            'tests/decisions/decisions-integration.test.ts',
          ]),
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
