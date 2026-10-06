import { beforeEach, expect, test, vi } from 'vitest';
import type { ProjectDto } from '../src/model';
import { MAX_FILE_BYTES, webPlatform } from '../src/platform/web';
import { demoProject } from './fixtures/demo';

function file(name: string, size?: number): File {
  const f = new File([new Uint8Array([1, 2, 3])], name);
  if (size !== undefined) Object.defineProperty(f, 'size', { value: size });
  return f;
}

function setup(readProject = vi.fn(async (_bytes: Uint8Array): Promise<ProjectDto> => demoProject())) {
  document.body.replaceChildren();
  const loaded = vi.fn();
  const failed = vi.fn();
  const print = vi.fn();
  const platform = webPlatform({ readProject, print });
  platform.start({ loaded, failed });
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const choose = (f: File) => {
    Object.defineProperty(input, 'files', { value: [f], configurable: true });
    input.dispatchEvent(new Event('change'));
  };
  const drop = (files: File[]) => {
    const event = Object.assign(new Event('drop', { cancelable: true }), { dataTransfer: { files } });
    window.dispatchEvent(event);
    return event;
  };
  return { platform, input, loaded, failed, print, readProject, choose, drop };
}

beforeEach(() => vi.restoreAllMocks());

test('verstecktes Dateifeld nur für .kairos', () => {
  const { input } = setup();
  expect(input.accept).toBe('.kairos');
  expect(input.hidden).toBe(true);
});

test('ausgewählte Datei wird gelesen und mit Dateinamen gemeldet', async () => {
  const { choose, loaded, readProject } = setup();
  choose(file('Plan.KAIROS'));
  await vi.waitFor(() => expect(loaded).toHaveBeenCalledWith({ project: demoProject(), fileName: 'Plan.KAIROS' }));
  expect([...readProject.mock.calls[0][0]]).toEqual([1, 2, 3]);
});

test('dieselbe Datei zweimal hintereinander wird zweimal gelesen', async () => {
  const { choose, loaded, input } = setup();
  choose(file('a.kairos'));
  await vi.waitFor(() => expect(loaded).toHaveBeenCalledTimes(1));
  expect(input.value).toBe('');
  choose(file('a.kairos'));
  await vi.waitFor(() => expect(loaded).toHaveBeenCalledTimes(2));
});

test('falsche Endung und zu große Dateien werden abgelehnt, ohne sie zu lesen', async () => {
  const { choose, failed, readProject } = setup();
  choose(file('notiz.txt'));
  choose(file('riesig.kairos', MAX_FILE_BYTES + 1));
  await vi.waitFor(() => expect(failed).toHaveBeenCalledTimes(2));
  expect(failed.mock.calls).toEqual([['Nur .kairos-Dateien können geöffnet werden.'], ['Die Datei ist größer als 50 MB.']]);
  expect(readProject).not.toHaveBeenCalled();
});

test('Lesefehler wird mit seiner Meldung gemeldet', async () => {
  const { choose, failed } = setup(vi.fn(async (_bytes: Uint8Array): Promise<ProjectDto> => {
    throw new Error('Die Datei ist keine Kairos-Projektdatei.');
  }));
  choose(file('x.kairos'));
  await vi.waitFor(() => expect(failed).toHaveBeenCalledWith('Die Datei ist keine Kairos-Projektdatei.'));
});

test('Drag&Drop: verhindert das Öffnen durch den Browser, nimmt die erste .kairos-Datei, ignoriert leere Drops', async () => {
  const { drop, loaded, failed } = setup();
  expect(drop([]).defaultPrevented).toBe(true);
  drop([file('bild.png'), file('plan.kairos')]);
  await vi.waitFor(() => expect(loaded).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'plan.kairos' })));
  expect(failed).not.toHaveBeenCalled();
});

test('chooseFile öffnet die Dateiauswahl, print druckt', async () => {
  const { platform, input, print } = setup();
  const click = vi.spyOn(input, 'click');
  await platform.chooseFile();
  expect(click).toHaveBeenCalledTimes(1);
  await platform.print();
  expect(print).toHaveBeenCalledTimes(1);
});
