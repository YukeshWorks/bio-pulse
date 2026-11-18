import { promises as fs } from 'node:fs';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * Serves fixtures/demo at /demo-data/ in the dev server only (`npm run dev:demo`).
 * Demonstration data is never copied into the production build.
 */
function demoData(): Plugin {
  const root = path.resolve('fixtures/demo');
  return {
    name: 'biopulse-demo-data',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/demo-data', async (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\/+/, '');
        const file = path.resolve(root, rel);
        if (!file.startsWith(root + path.sep) || !file.endsWith('.json')) return next();
        try {
          const body = await fs.readFile(file);
          res.setHeader('Content-Type', 'application/json');
          res.end(body);
        } catch {
          res.statusCode = 404;
          res.end('{}');
        }
      });
    },
  };
}

export default defineConfig({
  // Relative base so the site works at https://<user>.github.io/<repo>/ and on custom domains.
  base: './',
  plugins: [react(), tailwindcss(), demoData()],
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
