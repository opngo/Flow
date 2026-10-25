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
         *  are separate long-lived chunks that cache independently.
         *
         *  Order matters, and so does the anchoring of the React rule.
         *  `@headlessui/react` used to match a bare `/react/` test, which put a
         *  package that depends on framer-motion into the framework chunk while
         *  framer-motion itself sat in the UI chunk — a cycle between the two,
         *  and a production build that threw "Cannot read properties of
         *  undefined (reading 'createContext')" before React had initialised.
         *  Dependencies are now assigned before their dependents. */
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/framer-motion|@headlessui|@floating-ui/.test(id)) return 'ui';
          if (/react-router|node_modules\/react\/|node_modules\/react-dom\/|scheduler/.test(id)) return 'react';
          if (/recharts|d3-|victory/.test(id)) return 'charts';
          if (/@dnd-kit/.test(id)) return 'dnd';
          if (/date-fns|rrule|zod|lucide-react|zustand|clsx|marked|qrcode/.test(id)) return 'vendor';
          return undefined;
        },
      },
    },
  },
});
