import { defineConfig } from 'vitest/config';

/** Integration tests drive real git repositories and processes; a loaded machine needs more than the default 5 s. */
const INTEGRATION_TEST_TIMEOUT_MS = 30_000;

export default defineConfig({
  test: {
    testTimeout: INTEGRATION_TEST_TIMEOUT_MS,
    hookTimeout: INTEGRATION_TEST_TIMEOUT_MS,
  },
});
