import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Bundle Node du smoke « liste nominative » : node smoke/dist-nominal/run.mjs
export default defineConfig({
  build: {
    ssr: at('./run_nominal.ts'),
    outDir: at('./dist-nominal'),
    emptyOutDir: true,
    target: 'es2022',
    minify: false,
    rollupOptions: {
      output: { entryNames: 'run' },
    },
  },
});
