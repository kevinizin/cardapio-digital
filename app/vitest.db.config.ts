import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

// Testes que precisam de um Postgres descartável (TEST_DATABASE_URL).
process.env.TZ = 'America/Sao_Paulo';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['server/**/*.db.test.ts'],
      environment: 'node',
      env: { TZ: 'America/Sao_Paulo' },
      fileParallelism: false,
    },
  }),
);
