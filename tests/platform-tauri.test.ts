import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { emit } from '@tauri-apps/api/event';
import { expect, test, vi } from 'vitest';
import { tauriPlatform } from '../src/platform/tauri';
import { demoProject } from './fixtures/demo';

test('Startdatei, Dateien per Event und Fehler werden über die Callbacks gemeldet; Drucken ruft print_window', async () => {
  const calls: string[] = [];
  mockWindows('main');
  mockIPC(
    (cmd, args) => {
      calls.push(cmd);
      if (cmd === 'initial_file') return '/x/start.kairos';
      if (cmd === 'open_project') {
        if ((args as { path: string }).path.includes('kaputt')) throw 'Die Datei ist keine Kairos-Projektdatei.';
        return demoProject();
      }
      return null;
    },
    { shouldMockEvents: true },
  );
  const loaded = vi.fn();
  const failed = vi.fn();
  const platform = tauriPlatform();
  platform.start({ loaded, failed });

  await vi.waitFor(() => expect(loaded).toHaveBeenCalledWith({ project: demoProject(), fileName: '/x/start.kairos' }));
  await emit('open-file', '/x/kaputt.kairos');
  await vi.waitFor(() => expect(failed).toHaveBeenCalledWith('Die Datei ist keine Kairos-Projektdatei.'));
  await platform.print();
  expect(calls).toContain('print_window');
});
