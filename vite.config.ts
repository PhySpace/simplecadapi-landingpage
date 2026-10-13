import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { seoPlugin } from './seo/plugin';

export default defineConfig({
  plugins: [react(), seoPlugin()],
  build: { target: 'es2022', chunkSizeWarningLimit: 1600 },
});
