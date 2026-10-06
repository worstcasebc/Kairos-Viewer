import type { SqlJsStatic } from 'sql.js';
// Das WebAssembly wird als Data-URL ins Bundle eingebettet: kein Nachladen, daher CSP connect-src 'none' möglich.
import wasmDataUrl from 'sql.js/dist/sql-wasm.wasm?inline';
import { createSqlJs, dataUrlToBytes } from './sqlite';

let loading: Promise<SqlJsStatic> | null = null;

/** sql.js einmalig initialisieren (beim ersten Öffnen einer Datei). */
export function loadSqlJs(): Promise<SqlJsStatic> {
  loading ??= createSqlJs(dataUrlToBytes(wasmDataUrl).buffer as ArrayBuffer);
  return loading;
}
