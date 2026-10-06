import { describe, expect, test } from 'vitest';
import {
  baselineMap, collapseAll, displayTitle, expandAll, initialState, loadProject, missingDates, printZoom, rowsPerPrintPage, toggleCollapsed,
} from '../src/state';
import { demoProject } from './fixtures/demo';

describe('loadProject', () => {
  test('setzt Baum, Dateiname und aktive Baseline', () => {
    const s = loadProject(initialState(), demoProject(), '/Users/x/Plan A.kairos');
    expect(s.tree?.preorder).toHaveLength(9);
    expect(s.fileName).toBe('Plan A.kairos');
    expect(s.baselineId).toBe('bl1');
    expect(s.showBaseline).toBe(false);
    expect(s.collapsed.size).toBe(0);
  });

  test('Windows-Pfad', () => {
    expect(loadProject(initialState(), demoProject(), 'C:\\Daten\\Plan.kairos').fileName).toBe('Plan.kairos');
  });

  test('unbekannte aktive Baseline → erste Baseline; keine Baselines → null', () => {
    const p = { ...demoProject(), activeBaselineId: 'weg' };
    expect(loadProject(initialState(), p, 'a.kairos').baselineId).toBe('bl1');
    expect(loadProject(initialState(), { ...p, baselines: [] }, 'a.kairos').baselineId).toBeNull();
  });

  test('Zoom bleibt beim Laden einer neuen Datei erhalten', () => {
    const s = { ...initialState(), zoom: 'day' as const };
    expect(loadProject(s, demoProject(), 'a.kairos').zoom).toBe('day');
  });
});

test('displayTitle: Projektname, sonst Dateiname ohne Endung', () => {
  const s = loadProject(initialState(), demoProject(), '/x/Plan A.kairos');
  expect(displayTitle(s)).toBe('Plan A');
  expect(displayTitle(loadProject(initialState(), { ...demoProject(), name: 'Relaunch' }, '/x/a.kairos'))).toBe('Relaunch');
  expect(displayTitle(initialState())).toBe('Keine Datei geöffnet');
});

test('Auf- und Zuklappen', () => {
  const s = loadProject(initialState(), demoProject(), 'a.kairos');
  const t = toggleCollapsed(s, 'umsetzung');
  expect([...t.collapsed]).toEqual(['umsetzung']);
  expect(toggleCollapsed(t, 'umsetzung').collapsed.size).toBe(0);
  expect([...collapseAll(s).collapsed].sort()).toEqual(['konzeption', 'umsetzung']);
  expect(expandAll(collapseAll(s)).collapsed.size).toBe(0);
});

test('missingDates zählt Vorgänge ohne gespeicherte Termine', () => {
  const p = demoProject();
  expect(missingDates(p)).toBe(0);
  p.tasks[0].earlyStart = null;
  p.tasks[1].earlyFinish = 'kaputt';
  expect(missingDates(p)).toBe(2);
});

test('baselineMap liefert die gewählte Baseline je Vorgang', () => {
  const s = loadProject(initialState(), demoProject(), 'a.kairos');
  expect(baselineMap(s)?.get('anforderungen')?.finish).toBe('2026-06-29T14:00');
  expect(baselineMap({ ...s, baselineId: null })).toBeNull();
});

test('printZoom skaliert nur herunter', () => {
  expect(printZoom(3024)).toBe(0.5);
  expect(printZoom(1000)).toBe(1);
  expect(printZoom(0)).toBe(1);
});

test('rowsPerPrintPage: Zeilen pro A3-Seite abhängig vom Druck-Zoom', () => {
  expect(rowsPerPrintPage(1)).toBe(41);
  expect(rowsPerPrintPage(0.5)).toBe(84);
  expect(rowsPerPrintPage(1, 50)).toBe(1);
});
