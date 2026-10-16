import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const project = fileURLToPath(new URL('.', import.meta.url));
const web = fileURLToPath(new URL('./web/', import.meta.url));

// Persönliche Angaben (Impressum/Datenschutz) stehen nur in .env.local und werden über %VITE_LEGAL_…% ins HTML eingesetzt.
// Fehlt ein Wert, bliebe der Platzhalter auf der veröffentlichten Seite stehen – deshalb bricht der Build dann ab.
function requireLegalValues(): Plugin {
  return {
    name: 'kairos-require-legal-values',
    apply: 'build',
    // order 'post': Vite erzeugt die HTML-Dateien selbst erst in generateBundle.
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        for (const file of Object.values(bundle)) {
          if (file.type !== 'asset' || !file.fileName.endsWith('.html')) continue;
          const missing = String(file.source).match(/%VITE_LEGAL_\w+%/g);
          if (missing) {
            this.error(`${file.fileName}: ${[...new Set(missing)].join(', ')} nicht gesetzt – .env.local nach .env.example anlegen.`);
          }
        }
      },
    },
  };
}

// Web-Build: statische Seite in dist-web/, relativ verlinkt (läuft auch in einem Unterverzeichnis).
export default defineConfig({
  root: web,
  base: './',
  envDir: project,
  plugins: [requireLegalValues()],
  // .wasm ist für Vite standardmäßig kein Asset; nur so greift ?inline (Data-URL statt eigener Datei).
  assetsInclude: ['**/*.wasm'],
  server: { port: 1430, strictPort: true, fs: { allow: [project] } },
  build: {
    outDir: fileURLToPath(new URL('./dist-web/', import.meta.url)),
    emptyOutDir: true,
    target: 'es2021',
    rollupOptions: {
      input: {
        index: `${web}index.html`,
        impressum: `${web}impressum.html`,
        datenschutz: `${web}datenschutz.html`,
      },
    },
  },
});
