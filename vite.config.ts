import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { host: '0.0.0.0', port: 5173, strictPort: true, allowedHosts: true, cors: true },
  build: {
    outDir: 'dist',
    target: 'chrome120',
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        /** Keep the boot chunk small: framework, UI kit, charts and drag/drop
         *  are separate long-lived chunks that cache independently. */
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/react-router|\/react\/|react-dom|scheduler/.test(id)) return 'react';
          if (/recharts|d3-|victory/.test(id)) return 'charts';
          if (/framer-motion|@headlessui|@floating-ui/.test(id)) return 'ui';
          if (/@dnd-kit/.test(id)) return 'dnd';
          if (/date-fns|rrule|zod|lucide-react|zustand|clsx|marked|qrcode/.test(id)) return 'vendor';
          return undefined;
        },
      },
    },
  },
});
