import initSqlJs, { type SqlJsStatic } from 'sql.js';

/** Initialisiert sql.js mit einem bereits vorhandenen WebAssembly-Modul – ohne Netzwerkzugriff. */
export function createSqlJs(wasmBinary: ArrayBuffer): Promise<SqlJsStatic> {
  return initSqlJs({ wasmBinary });
}

/** Dekodiert eine Base64-Data-URL (z. B. aus Vites `?inline`) in Bytes. */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
