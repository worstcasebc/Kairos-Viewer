import { expect, test, vi } from 'vitest';
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { startApp } from '../src/app';
import type { ProjectDto } from '../src/model';
import { demoProject, task } from './fixtures/demo';

let printCalls = 0;

async function openProject(project: ProjectDto, rows: number): Promise<HTMLElement> {
  printCalls = 0;
  mockWindows('main');
  mockIPC((cmd) => {
    if (cmd === 'initial_file') return '/x/demo.kairos';
    if (cmd === 'open_project') return project;
    if (cmd === 'print_window') printCalls += 1;
    if (cmd.startsWith('plugin:event|')) return 1;
    return null;
  });
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  startApp(root);
  await vi.waitFor(() => expect(root.querySelectorAll('.table-rows .row')).toHaveLength(rows));
  return root;
}

const openDemo = () => openProject(demoProject(), 9);

test('Kopfzeilen liegen in ihren Scrollbereichen und scrollen dadurch horizontal mit', async () => {
  const root = await openDemo();
  expect(root.querySelector('.table-scroll .header-row')).not.toBeNull();
  expect(root.querySelector('.gantt-scroll svg.gantt-axis')).not.toBeNull();
});

test('Neu-Rendern (Zoom) behält Kopfzeilen und Zeilen', async () => {
  const root = await openDemo();
  (root.querySelector('[data-zoom="day"]') as HTMLButtonElement).click();
  expect(root.querySelectorAll('.table-scroll .header-row')).toHaveLength(1);
  expect(root.querySelectorAll('.gantt-scroll svg.gantt-axis')).toHaveLength(1);
  expect(root.querySelectorAll('.gantt-scroll svg.gantt-body')).toHaveLength(1);
  expect(root.querySelectorAll('.table-rows .row')).toHaveLength(9);
});

test('Drucken teilt lange Projekte in Seiten mit eigenen Kopfzeilen', async () => {
  const many: ProjectDto = {
    ...demoProject(),
    tasks: Array.from({ length: 100 }, (_, i) =>
      task({ id: `t${i}`, name: `T${i}`, orderIndex: i, earlyStart: '2026-06-25T08:00', earlyFinish: '2026-06-26T08:00' }),
    ),
    dependencies: [],
  };
  const root = await openProject(many, 100);
  (root.querySelector('[data-action="print"]') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(printCalls).toBe(1));
  const pages = [...root.querySelectorAll('.print-pages .print-page')];
  expect(pages.map((p) => p.querySelectorAll('.row').length)).toEqual([41, 41, 18]);
  for (const page of pages) {
    expect(page.querySelectorAll('.header-row')).toHaveLength(1);
    expect(page.querySelectorAll('svg.gantt-axis')).toHaveLength(1);
    expect(page.querySelectorAll('svg.gantt-body')).toHaveLength(1);
  }
});
