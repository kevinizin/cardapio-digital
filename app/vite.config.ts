import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Porta usual 5173; se estiver ocupada, o Vite escolhe a próxima livre
// (strictPort: false) sem encerrar processos de outros projetos.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: false },
  preview: { port: 4173, strictPort: false },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // Bibliotecas em arquivos próprios: melhor cache entre versões da demonstração.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('react-router')) return 'router';
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
          if (id.includes('luxon')) return 'luxon';
          if (id.includes('zod')) return 'zod';
          if (id.includes('lucide-react')) return 'icons';
          return 'vendor';
        },
      },
    },
  },
});
