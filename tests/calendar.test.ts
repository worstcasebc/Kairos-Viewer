import { describe, expect, test } from 'vitest';
import {
  civilFromDayNumber, dayNumber, isCivil, isoWeek, isoWeekday, makeWorkingDayFn, minuteOfDay, todayCivil,
} from '../src/gantt/calendar';

describe('Civil-Datum', () => {
  test('dayNumber und Umkehrung', () => {
    expect(dayNumber('1970-01-02')).toBe(1);
    expect(dayNumber('2026-06-25T14:00')).toBe(dayNumber('2026-06-25'));
    expect(civilFromDayNumber(dayNumber('2026-06-25'))).toBe('2026-06-25');
  });

  test('minuteOfDay', () => {
    expect(minuteOfDay('2026-06-25T14:30')).toBe(870);
    expect(minuteOfDay('2026-06-25')).toBe(0);
  });

  test('isCivil', () => {
    expect(isCivil('2026-06-25')).toBe(true);
    expect(isCivil('2026-06-25T08:00')).toBe(true);
    expect(isCivil('25.06.2026')).toBe(false);
    expect(isCivil(null)).toBe(false);
  });

  test('Wochentag 0 = Montag', () => {
    expect(isoWeekday(dayNumber('2026-06-25'))).toBe(3);
    expect(isoWeekday(dayNumber('2026-06-29'))).toBe(0);
    expect(isoWeekday(dayNumber('2026-06-28'))).toBe(6);
  });

  test('ISO-Kalenderwoche inklusive Jahreswechsel', () => {
    expect(isoWeek(dayNumber('2026-06-25'))).toBe(26);
    expect(isoWeek(dayNumber('2027-01-01'))).toBe(53);
    expect(isoWeek(dayNumber('2026-01-01'))).toBe(1);
  });

  test('todayCivil nutzt das lokale Datum', () => {
    expect(todayCivil(new Date(2026, 9, 6, 23, 30))).toBe('2026-10-06');
  });
});

describe('makeWorkingDayFn', () => {
  test('ohne Kalender Montag bis Freitag', () => {
    const working = makeWorkingDayFn(null);
    expect(working(dayNumber('2026-06-26'))).toBe(true);
    expect(working(dayNumber('2026-06-27'))).toBe(false);
  });

  test('Arbeitswoche und Ausnahmen des Kalenders', () => {
    const working = makeWorkingDayFn({
      workweek: [0, 1, 2, 3, 4].map((weekday) => ({ weekday, isWorking: weekday !== 2 })),
      exceptions: [
        { date: '2026-06-26', isWorking: false },
        { date: '2026-06-27', isWorking: true },
      ],
    });
    expect(working(dayNumber('2026-06-24'))).toBe(false);
    expect(working(dayNumber('2026-06-25'))).toBe(true);
    expect(working(dayNumber('2026-06-26'))).toBe(false);
    expect(working(dayNumber('2026-06-27'))).toBe(true);
    expect(working(dayNumber('2026-06-28'))).toBe(false);
  });
});
