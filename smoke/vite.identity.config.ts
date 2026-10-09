import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Bundle Node du smoke « fiche d'identité » : node smoke/dist-identity/run.js
export default defineConfig({
  build: {
    ssr: at('./run_identity.ts'),
    outDir: at('./dist-identity'),
    emptyOutDir: true,
    target: 'es2022',
    minify: false,
  },
});
