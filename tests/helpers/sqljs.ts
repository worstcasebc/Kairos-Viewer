import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { SqlJsStatic } from 'sql.js';
import { createSqlJs } from '../../src/web/sqlite';

const require = createRequire(import.meta.url);
let cached: Promise<SqlJsStatic> | null = null;

/** sql.js für Tests, mit dem WebAssembly aus node_modules (statt eingebettet). */
export function testSqlJs(): Promise<SqlJsStatic> {
  if (!cached) {
    const wasm = readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'));
    cached = createSqlJs(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer);
  }
  return cached;
}

/** Bytes einer Fixture aus src-tauri/tests/fixtures (Vitest läuft im Projektordner). */
export function fixtureBytes(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(process.cwd(), 'src-tauri/tests/fixtures', name)));
}
