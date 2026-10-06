import { describe, expect, test, vi } from 'vitest';
import { predecessorTexts } from '../src/predecessors';
import { COLUMNS, renderTableBody, renderTableHeader } from '../src/table';
import { buildTree, visibleRows } from '../src/tree';
import { demoProject } from './fixtures/demo';

function body(mutate?: (p: ReturnType<typeof demoProject>) => void, onToggle = vi.fn()) {
  const project = demoProject();
  mutate?.(project);
  const tree = buildTree(project.tasks);
  return renderTableBody({
    rows: visibleRows(tree, new Set()),
    predecessors: predecessorTexts(project.dependencies, tree, project.hoursPerDay),
    hoursPerDay: project.hoursPerDay,
    onToggle,
  });
}

const cells = (row: Element) => [...row.querySelectorAll('.cell')].map((c) => c.textContent);

test('Kopfzeile enthält alle Spalten', () => {
  expect([...renderTableHeader().querySelectorAll('.cell')].map((c) => c.textContent)).toEqual(
    COLUMNS.map((c) => c.label),
  );
  expect(COLUMNS.map((c) => c.label)).toEqual(['Nr', 'Name', 'Dauer', 'Start', 'Ende', 'Vorgänger', 'Ges. Puffer', 'Fr. Puffer', '% Fertig']);
});

describe('renderTableBody', () => {
  test('Zeilen und Zellwerte wie in Kairos', () => {
    const rows = body().querySelectorAll('.row');
    expect(rows).toHaveLength(9);
    expect(cells(rows[1])).toEqual(['2', 'Anforderungen', '3 d', '25.06.26, 08:00', '29.06.26, 14:00', '', '0 d', '0 d', '100 %']);
    expect(cells(rows[6])[5]).toBe('5, 6');
  });

  test('Sammelvorgang: fett, ohne Dauer, mit Aufklapp-Schalter', () => {
    const first = body().querySelectorAll('.row')[0];
    expect(first.classList.contains('summary')).toBe(true);
    expect(cells(first)[2]).toBe('');
    expect(first.querySelector('button.toggle')?.textContent).toBe('▾');
  });

  test('Klick auf den Schalter meldet die Vorgangs-ID', () => {
    const onToggle = vi.fn();
    const rows = body(undefined, onToggle).querySelectorAll('.row');
    (rows[3].querySelector('button.toggle') as HTMLButtonElement).click();
    expect(onToggle).toHaveBeenCalledWith('umsetzung');
  });

  test('kritische Vorgänge und gerissene Deadlines werden markiert', () => {
    const rows = body((p) => (p.tasks.find((t) => t.id === 'tests')!.deadlineMissed = true)).querySelectorAll('.row');
    expect(rows[1].classList.contains('critical')).toBe(true);
    expect(rows[0].classList.contains('critical')).toBe(false);
    expect(rows[7].querySelector('.warn')?.textContent).toBe('⚠');
  });

  test('Namen mit HTML werden wörtlich angezeigt', () => {
    const rows = body((p) => (p.tasks.find((t) => t.id === 'tests')!.name = '<b>Tests</b> & mehr')).querySelectorAll('.row');
    expect(rows[7].querySelector('.name-text')?.textContent).toBe('<b>Tests</b> & mehr');
    expect(rows[7].querySelector('b')).toBeNull();
  });

  test('Einrückung nach Tiefe', () => {
    const rows = body().querySelectorAll('.row');
    expect((rows[1].querySelectorAll('.cell')[1] as HTMLElement).style.paddingLeft).toBe('22px');
    expect((rows[0].querySelectorAll('.cell')[1] as HTMLElement).style.paddingLeft).toBe('6px');
  });
});
