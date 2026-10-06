import type { CalendarDto } from '../model';

const MS_PER_DAY = 86_400_000;
const CIVIL = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;

export function isCivil(s: string | null): s is string {
  return s !== null && CIVIL.test(s);
}

/** Tage seit 1970-01-01 (UTC-Arithmetik, zeitzonenunabhängig). */
export function dayNumber(civil: string): number {
  const y = Number(civil.slice(0, 4));
  const m = Number(civil.slice(5, 7));
  const d = Number(civil.slice(8, 10));
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

export function minuteOfDay(civil: string): number {
  if (civil.length < 16) return 0;
  return Number(civil.slice(11, 13)) * 60 + Number(civil.slice(14, 16));
}

export function civilFromDayNumber(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

/** 0 = Montag … 6 = Sonntag (1970-01-01 war ein Donnerstag). */
export function isoWeekday(day: number): number {
  return (((day + 3) % 7) + 7) % 7;
}

export function isoWeek(day: number): number {
  const thursday = day - isoWeekday(day) + 3;
  const jan1 = dayNumber(`${civilFromDayNumber(thursday).slice(0, 4)}-01-01`);
  return Math.floor((thursday - jan1) / 7) + 1;
}

export function makeWorkingDayFn(calendar: CalendarDto | null): (day: number) => boolean {
  const exceptions = new Map((calendar?.exceptions ?? []).map((e) => [e.date, e.isWorking]));
  const week =
    calendar && calendar.workweek.length > 0
      ? new Set(calendar.workweek.filter((w) => w.isWorking).map((w) => w.weekday))
      : new Set([0, 1, 2, 3, 4]);
  return (day) => exceptions.get(civilFromDayNumber(day)) ?? week.has(isoWeekday(day));
}

export function todayCivil(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
