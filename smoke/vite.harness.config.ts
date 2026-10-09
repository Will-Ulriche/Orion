import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Bundle navigateur du harness « aperçu liste nominative » :
//   npx vite build --config smoke/vite.harness.config.ts
// puis servir smoke/harness-dist/ et ouvrir index.html dans un navigateur.
export default defineConfig({
  root: at('./harness'),
  base: './',
  build: {
    outDir: at('./harness-dist'),
    emptyOutDir: true,
    target: 'es2022',
    minify: false,
  },
});
