import { defineConfig } from 'vitest/config';

export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: { target: 'es2021', outDir: 'dist' },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] },
});
