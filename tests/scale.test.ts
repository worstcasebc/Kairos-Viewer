import { describe, expect, test } from 'vitest';
import { dayNumber } from '../src/gantt/calendar';
import { axisRows, computeRange, createScale } from '../src/gantt/scale';
import { demoProject } from './fixtures/demo';

describe('computeRange', () => {
  test('frühester Start − 2 Tage bis spätestes Ende + 7 Tage', () => {
    const range = computeRange(demoProject(), null, '2030-01-01');
    expect(range).toEqual({ startDay: dayNumber('2026-06-23'), endDay: dayNumber('2026-07-21') });
  });

  test('Baseline-Termine erweitern den Bereich', () => {
    const project = demoProject();
    project.baselines[0].tasks.push({ taskId: 'golive', start: '2026-08-01T08:00', finish: '2026-08-03T08:00' });
    expect(computeRange(project, 'bl1', '2030-01-01').endDay).toBe(dayNumber('2026-08-10'));
    expect(computeRange(project, null, '2030-01-01').endDay).toBe(dayNumber('2026-07-21'));
  });

  test('Ausreißer weit weg vom Median (kaputte Datei) blähen den Bereich nicht auf', () => {
    const project = demoProject();
    project.tasks[0].earlyStart = '1900-01-01T08:00';
    project.tasks[1].earlyFinish = '2999-12-31T17:00';
    expect(computeRange(project, null, '2030-01-01')).toEqual({
      startDay: dayNumber('2026-06-23'),
      endDay: dayNumber('2026-07-21'),
    });
  });

  test('ohne Termine: Projektstart, sonst heute', () => {
    const project = { ...demoProject(), tasks: [], baselines: [], startDate: '2026-01-05' };
    expect(computeRange(project, null, '2030-01-01')).toEqual({
      startDay: dayNumber('2026-01-03'),
      endDay: dayNumber('2026-02-04'),
    });
    expect(computeRange({ ...project, startDate: null }, null, '2030-01-10').startDay).toBe(dayNumber('2030-01-08'));
  });
});

describe('createScale', () => {
  test('Datum → x mit Uhrzeit-Anteil', () => {
    const scale = createScale('day', dayNumber('2026-06-23'), dayNumber('2026-07-21'));
    expect(scale.pxPerDay).toBe(70);
    expect(scale.x('2026-06-25T12:00')).toBe(175);
    expect(scale.xDay(dayNumber('2026-06-24'))).toBe(70);
    expect(scale.width).toBe(29 * 70);
  });

  test('Zoomstufen', () => {
    expect(createScale('week', 0, 0).pxPerDay).toBe(23);
    expect(createScale('month', 0, 0).pxPerDay).toBe(7);
  });
});

describe('axisRows', () => {
  test('Tageszoom: oben KW, unten Tage', () => {
    const rows = axisRows(createScale('day', dayNumber('2026-06-23'), dayNumber('2026-06-30')));
    expect(rows.bottom[0]).toEqual({ x: 0, width: 70, label: 'Di 23' });
    expect(rows.bottom).toHaveLength(8);
    expect(rows.top.map((c) => c.label)).toEqual(['KW 26 · 2026', 'KW 27 · 2026']);
    expect(rows.top[0].width).toBe(6 * 70);
  });

  test('Wochenzoom: oben Monate, unten KW', () => {
    const rows = axisRows(createScale('week', dayNumber('2026-06-23'), dayNumber('2026-07-21')));
    expect(rows.top.map((c) => c.label)).toEqual(['Juni 2026', 'Juli 2026']);
    expect(rows.bottom[0].label).toBe('KW 26');
  });

  test('Monatszoom: oben Jahre, unten Monate', () => {
    const rows = axisRows(createScale('month', dayNumber('2026-12-20'), dayNumber('2027-01-10')));
    expect(rows.top.map((c) => c.label)).toEqual(['2026', '2027']);
    expect(rows.bottom.map((c) => c.label)).toEqual(['Dez', 'Jan']);
  });
});
