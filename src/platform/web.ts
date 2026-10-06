import type { ProjectDto } from '../model';
import type { Platform, PlatformCallbacks } from './types';

export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export interface WebPlatformDeps {
  /** Liest die Bytes einer .kairos-Datei (Web: sql.js im Browser). */
  readProject(bytes: Uint8Array): Promise<ProjectDto>;
  /** Druckfunktion; Standard ist window.print. */
  print?: () => void;
}

const isKairos = (name: string) => name.toLowerCase().endsWith('.kairos');

function readBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('Die Datei konnte nicht gelesen werden.'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Web: Die Datei wird ausschließlich im Browser gelesen – keine Übertragung, keine Speicherung.
 * Nach dem Lesen hält die Plattform keine Referenz auf Datei oder Bytes.
 */
export function webPlatform(deps: WebPlatformDeps): Platform {
  let callbacks: PlatformCallbacks | null = null;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.kairos';
  input.hidden = true;

  async function openFile(file: File): Promise<void> {
    if (!callbacks) return;
    if (!isKairos(file.name)) return callbacks.failed('Nur .kairos-Dateien können geöffnet werden.');
    if (file.size > MAX_FILE_BYTES) return callbacks.failed('Die Datei ist größer als 50 MB.');
    try {
      const project = await deps.readProject(await readBytes(file));
      callbacks.loaded({ project, fileName: file.name });
    } catch (error) {
      callbacks.failed(error instanceof Error ? error.message : String(error));
    }
  }

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    // Zurücksetzen, damit dieselbe Datei erneut ausgewählt werden kann.
    input.value = '';
    if (file) void openFile(file);
  });

  return {
    start(cb) {
      callbacks = cb;
      document.body.appendChild(input);
      // Ohne preventDefault würde der Browser die Datei selbst öffnen bzw. herunterladen.
      window.addEventListener('dragover', (event) => event.preventDefault());
      window.addEventListener('drop', (event) => {
        event.preventDefault();
        const files = [...((event as DragEvent).dataTransfer?.files ?? [])];
        if (files.length === 0) return;
        void openFile(files.find((f) => isKairos(f.name)) ?? files[0]);
      });
    },
    async chooseFile() {
      input.click();
    },
    async print() {
      (deps.print ?? (() => window.print()))();
    },
  };
}
