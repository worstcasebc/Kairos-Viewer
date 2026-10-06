import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const project = fileURLToPath(new URL('.', import.meta.url));
const web = fileURLToPath(new URL('./web/', import.meta.url));

// Web-Build: statische Seite in dist-web/, relativ verlinkt (läuft auch in einem Unterverzeichnis).
export default defineConfig({
  root: web,
  base: './',
  // .wasm ist für Vite standardmäßig kein Asset; nur so greift ?inline (Data-URL statt eigener Datei).
  assetsInclude: ['**/*.wasm'],
  server: { port: 1430, strictPort: true, fs: { allow: [project] } },
  build: {
    outDir: fileURLToPath(new URL('./dist-web/', import.meta.url)),
    emptyOutDir: true,
    target: 'es2021',
    rollupOptions: {
      input: { index: `${web}index.html` },
    },
  },
});
