import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { open } from '@tauri-apps/plugin-dialog';
import type { ProjectDto } from '../model';
import type { Platform, PlatformCallbacks } from './types';

/** Desktop: Lesen per Rust-Command, Dateiübergabe per Drag&Drop, Startargument und macOS „Opened“. */
export function tauriPlatform(): Platform {
  let callbacks: PlatformCallbacks | null = null;

  async function openPath(path: string): Promise<void> {
    if (!callbacks) return;
    try {
      const project = await invoke<ProjectDto>('open_project', { path });
      callbacks.loaded({ project, fileName: path });
    } catch (error) {
      callbacks.failed(String(error));
    }
  }

  return {
    start(cb) {
      callbacks = cb;
      void getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type !== 'drop') return;
        const path = event.payload.paths.find((p) => p.toLowerCase().endsWith('.kairos'));
        if (path) void openPath(path);
        else cb.failed('Nur .kairos-Dateien können geöffnet werden.');
      });
      void listen<string>('open-file', (event) => void openPath(event.payload)).then(async () => {
        const initial = await invoke<string | null>('initial_file');
        if (initial) await openPath(initial);
      });
    },
    async chooseFile() {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: 'Kairos-Projekt', extensions: ['kairos'] }],
      });
      if (typeof selected === 'string') await openPath(selected);
    },
    async print() {
      await invoke('print_window');
    },
  };
}
