import { describe, expect, test } from 'vitest';
import type { BaselineTaskDto } from '../src/model';
import { dayNumber, makeWorkingDayFn } from '../src/gantt/calendar';
import { AXIS_HEIGHT, ROW_HEIGHT, renderGanttAxis, renderGanttBody } from '../src/gantt/render';
import { createScale } from '../src/gantt/scale';
import { buildTree, visibleRows } from '../src/tree';
import { demoProject } from './fixtures/demo';

function render(opts: { collapsed?: string[]; baseline?: boolean; mutate?: (p: ReturnType<typeof demoProject>) => void } = {}) {
  const project = demoProject();
  opts.mutate?.(project);
  const rows = visibleRows(buildTree(project.tasks), new Set(opts.collapsed ?? []));
  const scale = createScale('day', dayNumber('2026-06-23'), dayNumber('2026-07-21'));
  const baseline = opts.baseline ? new Map<string, BaselineTaskDto>(project.baselines[0].tasks.map((t) => [t.taskId, t])) : null;
  return renderGanttBody({
    rows,
    dependencies: project.dependencies,
    scale,
    isWorkingDay: makeWorkingDayFn(project.calendar),
    today: '2026-07-01',
    statusDate: null,
    baseline,
  });
}

describe('renderGanttBody', () => {
  test('Balken, Sammelbalken, Meilenstein und Pfeile des Demo-Projekts', () => {
    const svg = render();
    expect(svg.getAttribute('height')).toBe(String(9 * ROW_HEIGHT));
    expect(svg.getAttribute('width')).toBe(String(29 * 70));
    expect(svg.querySelectorAll('rect.bar')).toHaveLength(6);
    expect(svg.querySelectorAll('rect.bar.critical')).toHaveLength(6);
    expect(svg.querySelectorAll('rect.summary')).toHaveLength(2);
    expect(svg.querySelectorAll('.milestone')).toHaveLength(1);
    expect(svg.querySelectorAll('path.dep')).toHaveLength(7);
    expect(svg.querySelectorAll('path.dep.critical')).toHaveLength(7);
    expect(svg.querySelectorAll('rect.progress')).toHaveLength(6);
    expect(svg.querySelectorAll('.baseline')).toHaveLength(0);
  });

  test('Balkenposition folgt der Zeitskala', () => {
    const bar = render().querySelector('[data-task-id="anforderungen"] rect.bar')!;
    expect(Number(bar.getAttribute('x'))).toBeCloseTo(2 * 70 + (8 / 24) * 70);
    expect(Number(bar.getAttribute('y'))).toBe(ROW_HEIGHT + 5);
  });

  test('Wochenenden werden schattiert, Heute-Linie gezeichnet', () => {
    const svg = render();
    // 2026-06-23..2026-07-21: 4 Samstage + 4 Sonntage
    expect(svg.querySelectorAll('rect.nonworking')).toHaveLength(8);
    expect(svg.querySelectorAll('line.today')).toHaveLength(1);
  });

  test('eingeklappte Vorgänge haben weder Balken noch Pfeile', () => {
    const svg = render({ collapsed: ['umsetzung'] });
    expect(svg.querySelectorAll('rect.bar')).toHaveLength(3);
    expect(svg.querySelectorAll('path.dep')).toHaveLength(2);
  });

  test('Vorgang ohne Termine: kein Balken, keine Pfeile dorthin', () => {
    const svg = render({
      mutate: (p) => {
        const t = p.tasks.find((x) => x.id === 'tests')!;
        t.earlyStart = null;
        t.earlyFinish = null;
      },
    });
    expect(svg.querySelectorAll('rect.bar')).toHaveLength(5);
    expect(svg.querySelectorAll('path.dep')).toHaveLength(5);
  });

  test('Baseline-Balken nur für Einträge mit Terminen', () => {
    expect(render({ baseline: true }).querySelectorAll('rect.baseline')).toHaveLength(2);
  });

  test('Tooltip zeigt den Namen als Text', () => {
    const svg = render({ mutate: (p) => (p.tasks.find((x) => x.id === 'tests')!.name = '<b>Tests</b>') });
    const title = svg.querySelector('[data-task-id="tests"] title')!;
    expect(title.textContent).toBe('<b>Tests</b>');
    expect(svg.querySelector('b')).toBeNull();
  });

  test('leeres Projekt rendert ohne Fehler', () => {
    const svg = render({ mutate: (p) => { p.tasks = []; p.dependencies = []; } });
    expect(svg.getAttribute('height')).toBe('0');
    expect(svg.querySelectorAll('path.dep')).toHaveLength(0);
  });
});

describe('Pfeilführung', () => {
  /** Letztes horizontales Segment eines Pfads: [von x, nach x]. */
  function lastSegment(svg: SVGSVGElement, from: string, to: string): [number, number] {
    const d = svg.querySelector(`path.dep[data-from="${from}"][data-to="${to}"]`)!.getAttribute('d')!;
    const xs: number[] = [];
    let x = 0;
    for (const [, cmd, value] of d.matchAll(/([MHV])([-\d.]+)(?:,[-\d.]+)?/g)) {
      if (cmd === 'M' || cmd === 'H') x = Number(value);
      xs.push(x);
    }
    return [xs[xs.length - 2], xs[xs.length - 1]];
  }

  test('FS-Pfeil erreicht den Anfang des Nachfolgers von links, auch ohne Abstand', () => {
    const [before, end] = lastSegment(render(), 'wireframes', 'frontend');
    expect(before).toBeLessThan(end);
  });

  test('FF-Pfeil erreicht das Ende des Nachfolgers von rechts', () => {
    const svg = render({ mutate: (p) => p.dependencies.push({ predecessorId: 'anforderungen', successorId: 'tests', type: 'FF', lagMinutes: 0 }) });
    const [before, end] = lastSegment(svg, 'anforderungen', 'tests');
    expect(before).toBeGreaterThan(end);
  });
});

test('renderGanttAxis zeichnet zwei Beschriftungszeilen'
, () => {
  const axis = renderGanttAxis(createScale('day', dayNumber('2026-06-23'), dayNumber('2026-06-30')));
  expect(axis.getAttribute('height')).toBe(String(AXIS_HEIGHT));
  const labels = [...axis.querySelectorAll('text')].map((t) => t.textContent);
  expect(labels).toContain('KW 26 · 2026');
  expect(labels).toContain('Di 23');
});
