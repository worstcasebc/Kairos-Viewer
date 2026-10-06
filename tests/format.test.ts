import { describe, expect, test } from 'vitest';
import { formatDateTime, formatDuration, formatFloat, formatPercent, minutesPerDay } from '../src/format';

describe('formatDuration', () => {
  test.each([
    [1440, 'd', 8, '3 d'],
    [960, 'd', 8, '2 d'],
    [720, 'd', 8, '1.5 d'],
    [500, 'd', 8, '1.04 d'],
    [0, 'd', 8, '0 d'],
    [90, 'h', 8, '1.5 h'],
    [45, 'min', 8, '45 min'],
    [480, 'd', 0, '0 d'],
  ] as const)('%i min als %s bei %i h/Tag → %s', (minutes, unit, hpd, expected) => {
    expect(formatDuration(minutes, unit, hpd)).toBe(expected);
  });
});

describe('formatFloat', () => {
  test.each([
    [null, ''],
    [0, '0 d'],
    [960, '2 d'],
    [-960, '-2 d'],
    [90, '1.5 h'],
    [37020, '617 h'],
  ] as const)('%s min → %s', (minutes, expected) => {
    expect(formatFloat(minutes, 8)).toBe(expected);
  });

  test('ohne Stunden pro Tag keine Division durch null', () => {
    expect(formatFloat(120, 0)).toBe('2 h');
  });
});

describe('formatDateTime', () => {
  test.each([
    ['2026-06-25T08:00', '25.06.26, 08:00'],
    ['2026-07-14', '14.07.26'],
    [null, ''],
    ['kaputt', 'kaputt'],
  ] as const)('%s → %s', (input, expected) => {
    expect(formatDateTime(input)).toBe(expected);
  });
});

test('formatPercent rundet auf ganze Prozent', () => {
  expect(formatPercent(0.5)).toBe('50 %');
  expect(formatPercent(1)).toBe('100 %');
  expect(formatPercent(0.333)).toBe('33 %');
});

test('minutesPerDay', () => {
  expect(minutesPerDay(8)).toBe(480);
  expect(minutesPerDay(7.5)).toBe(450);
});
