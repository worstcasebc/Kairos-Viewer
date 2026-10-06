import { expect, test } from 'vitest';
import { startApp } from '../src/app';
import type { ProjectDto } from '../src/model';
import type { Platform, PlatformCallbacks } from '../src/platform/types';
import { demoProject, task } from './fixtures/demo';

/** Test-Plattform: Dateien werden direkt über die Callbacks „geöffnet“. */
function fakePlatform() {
  let callbacks: PlatformCallbacks | null = null;
  const fake = {
    printCalls: 0,
    chooseCalls: 0,
    open(project: ProjectDto, fileName = '/x/demo.kairos') {
      callbacks!.loaded({ project, fileName });
    },
    fail(message: string) {
      callbacks!.failed(message);
    },
    platform: {
      start(cb: PlatformCallbacks) {
        callbacks = cb;
      },
      async chooseFile() {
        fake.chooseCalls += 1;
      },
      async print() {
        fake.printCalls += 1;
      },
    } satisfies Platform,
  };
  return fake;
}

function setup(options = {}) {
  const fake = fakePlatform();
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  startApp(root, fake.platform, options);
  return { root, fake };
}

test('Kopfzeilen liegen in ihren Scrollbereichen und scrollen dadurch horizontal mit', () => {
  const { root, fake } = setup();
  fake.open(demoProject());
  expect(root.querySelectorAll('.table-rows .row')).toHaveLength(9);
  expect(root.querySelector('.table-scroll .header-row')).not.toBeNull();
  expect(root.querySelector('.gantt-scroll svg.gantt-axis')).not.toBeNull();
});

test('Neu-Rendern (Zoom) behält Kopfzeilen und Zeilen', () => {
  const { root, fake } = setup();
  fake.open(demoProject());
  (root.querySelector('[data-zoom="day"]') as HTMLButtonElement).click();
  expect(root.querySelectorAll('.table-scroll .header-row')).toHaveLength(1);
  expect(root.querySelectorAll('.gantt-scroll svg.gantt-axis')).toHaveLength(1);
  expect(root.querySelectorAll('.gantt-scroll svg.gantt-body')).toHaveLength(1);
  expect(root.querySelectorAll('.table-rows .row')).toHaveLength(9);
});

test('Titel aus dem Dateinamen, Öffnen-Knopf fragt die Plattform', () => {
  const { root, fake } = setup();
  fake.open(demoProject(), 'C:\\Daten\\Plan A.kairos');
  expect(root.querySelector('.title')?.textContent).toBe('Plan A');
  (root.querySelector('[data-action="open"]') as HTMLButtonElement).click();
  expect(fake.chooseCalls).toBe(1);
});

test('Drucken teilt lange Projekte in Seiten mit eigenen Kopfzeilen', async () => {
  const { root, fake } = setup();
  fake.open({
    ...demoProject(),
    tasks: Array.from({ length: 100 }, (_, i) =>
      task({ id: `t${i}`, name: `T${i}`, orderIndex: i, earlyStart: '2026-06-25T08:00', earlyFinish: '2026-06-26T08:00' }),
    ),
    dependencies: [],
  });
  (root.querySelector('[data-action="print"]') as HTMLButtonElement).click();
  await Promise.resolve();
  expect(fake.printCalls).toBe(1);
  const pages = [...root.querySelectorAll('.print-pages .print-page')];
  expect(pages.map((p) => p.querySelectorAll('.row').length)).toEqual([41, 41, 18]);
  for (const page of pages) {
    expect(page.querySelectorAll('.header-row')).toHaveLength(1);
    expect(page.querySelectorAll('svg.gantt-axis')).toHaveLength(1);
    expect(page.querySelectorAll('svg.gantt-body')).toHaveLength(1);
  }
});

test('Fehlermeldung bleibt bis zum nächsten erfolgreichen Öffnen stehen', () => {
  const { root, fake } = setup();
  fake.open(demoProject());
  const banner = root.querySelector('.banner') as HTMLElement;
  fake.fail('Die Datei ist keine Kairos-Projektdatei.');
  expect(banner.hidden).toBe(false);
  expect(banner.textContent).toBe('Die Datei ist keine Kairos-Projektdatei.');
  (root.querySelector('[data-zoom="day"]') as HTMLButtonElement).click();
  expect(banner.hidden).toBe(false);
  expect(banner.className).toBe('banner error');
  fake.open(demoProject());
  expect(banner.hidden).toBe(true);
});

test('Datenschutzhinweis im leeren Zustand, wenn übergeben', () => {
  const note = 'Ihre Datei wird ausschließlich in Ihrem Browser verarbeitet und nicht übertragen.';
  const withNote = setup({ privacyNote: note }).root.querySelector('.empty-note') as HTMLElement;
  expect(withNote.hidden).toBe(false);
  expect(withNote.textContent).toBe(note);
  expect((setup().root.querySelector('.empty-note') as HTMLElement).hidden).toBe(true);
});

test('mit fixedTitle bleibt der Seitentitel fest – kein Projektname im Browserverlauf', () => {
  const { fake } = setup({ fixedTitle: true });
  fake.open({ ...demoProject(), name: 'Geheimes Projekt' });
  expect(document.title).toBe('Kairos Viewer');
  const desktop = setup();
  desktop.fake.open({ ...demoProject(), name: 'Geheimes Projekt' });
  expect(document.title).toBe('Geheimes Projekt – Kairos Viewer');
});
