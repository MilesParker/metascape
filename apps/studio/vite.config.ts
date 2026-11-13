// SPDX-License-Identifier: EPL-2.0
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the built Studio works from any folder of a static host.
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // React and the router change rarely; keep them in a chunk browsers can cache.
        manualChunks(id: string) {
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
          if (id.includes('node_modules/@tanstack/')) return 'router';
          return undefined;
        },
      },
    },
  },
});
