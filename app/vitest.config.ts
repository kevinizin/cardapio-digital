import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

// Os testes rodam de propósito num fuso diferente de Paris (São Paulo, UTC-3)
// para provar que as regras não dependem do fuso do computador.
process.env.TZ = 'America/Sao_Paulo';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['src/**/*.test.{ts,tsx}'],
      environment: 'node',
      env: { TZ: 'America/Sao_Paulo' },
      restoreMocks: true,
    },
  }),
);
