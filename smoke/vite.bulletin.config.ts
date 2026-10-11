import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Bundle Node du smoke « bulletin » : node smoke/dist-bulletin/run_bulletin.js
export default defineConfig({
  build: {
    ssr: at('./run_bulletin.ts'),
    outDir: at('./dist-bulletin'),
    emptyOutDir: true,
    target: 'es2022',
    minify: false,
  },
});
