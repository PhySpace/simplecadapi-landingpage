import { mkdirSync, writeFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { seoPlugin } from './seo/plugin';

/** dev only: the capture page (src/capture.ts) saves the hero loops into public/hero */
const heroSave = (): Plugin => ({
  name: 'sca-hero-save',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__hero/save', (req, res) => {
      const name = new URL(req.url ?? '', 'http://localhost').searchParams.get('name') ?? '';
      if (req.method !== 'POST' || !/^[a-z0-9_.-]+$/i.test(name)) {
        res.statusCode = 400;
        res.end('bad request');
        return;
      }
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        mkdirSync('public/hero', { recursive: true });
        writeFileSync(`public/hero/${name}`, Buffer.concat(chunks));
        res.end('ok');
      });
    });
  },
});

export default defineConfig({
  plugins: [react(), seoPlugin(), heroSave()],
  build: { target: 'es2022', chunkSizeWarningLimit: 1600 },
});
