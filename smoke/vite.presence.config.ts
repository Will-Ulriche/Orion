import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Bundle Node du smoke « liste de présence » : node smoke/dist-presence/run.mjs
export default defineConfig({
  build: {
    ssr: at('./run_presence.ts'),
    outDir: at('./dist-presence'),
    emptyOutDir: true,
    target: 'es2022',
    minify: false,
    rollupOptions: {
      output: { entryNames: 'run' },
    },
  },
});
