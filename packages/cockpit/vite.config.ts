import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { COCKPIT_DEV_SERVER_PORT, COMMAND_TOKEN_META_NAME } from './src/contract/api.ts';

const DEFAULT_API_ORIGIN = 'http://127.0.0.1:7430';
const TEST_WORKER_CEILING = 2;
const CHUNK_WARNING_KILOBYTES = 600;

const TOKEN_PATTERN = new RegExp(`<meta name="${COMMAND_TOKEN_META_NAME}" content="([0-9a-f]+)">`);

function serverCommandToken(apiOrigin: string): Plugin {
  return {
    name: 'factory-command-token',
    apply: 'serve',
    async transformIndexHtml() {
      try {
        const token = TOKEN_PATTERN.exec(await (await fetch(`${apiOrigin}/`)).text())?.[1];
        return token === undefined ? [] : [{ tag: 'meta', attrs: { name: COMMAND_TOKEN_META_NAME, content: token }, injectTo: 'head' as const }];
      } catch {
        return [];
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'AGENT_FACTORY_');
  const apiOrigin = env['AGENT_FACTORY_API_ORIGIN'] ?? DEFAULT_API_ORIGIN;
  return {
    plugins: [react(), serverCommandToken(apiOrigin)],
    server: {
      port: COCKPIT_DEV_SERVER_PORT,
      proxy: { '/api': { target: apiOrigin, changeOrigin: false } },
    },
    preview: { port: COCKPIT_DEV_SERVER_PORT },
    build: {
      target: 'es2022',
      sourcemap: true,
      chunkSizeWarningLimit: CHUNK_WARNING_KILOBYTES,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      maxWorkers: TEST_WORKER_CEILING,
      minWorkers: 1,
      css: false,
      restoreMocks: true,
    },
  };
});
