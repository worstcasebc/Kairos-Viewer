import type { DisplayUnit } from './model';

export function minutesPerDay(hoursPerDay: number): number {
  return Math.round(hoursPerDay * 60);
}

/** Zahl mit höchstens zwei Nachkommastellen und Dezimalpunkt (wie Kairos' DurationParser). */
function number(value: number): string {
  return String(Math.round(value * 100) / 100);
}

export function formatDuration(minutes: number, unit: DisplayUnit, hoursPerDay: number): string {
  const mpd = minutesPerDay(hoursPerDay);
  const value = unit === 'min' ? minutes : unit === 'h' ? minutes / 60 : mpd > 0 ? minutes / mpd : 0;
  return `${number(value)} ${unit}`;
}

/** Puffer: ganze Tage, sonst Stunden; negativ mit „-“ (wie Kairos' FloatText). */
export function formatFloat(minutes: number | null, hoursPerDay: number): string {
  if (minutes === null) return '';
  const mpd = minutesPerDay(hoursPerDay);
  const magnitude = Math.abs(minutes);
  const unit: DisplayUnit = mpd > 0 && magnitude % mpd === 0 ? 'd' : 'h';
  const body = formatDuration(magnitude, unit, hoursPerDay);
  return minutes < 0 ? `-${body}` : body;
}

const CIVIL = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/;

export function formatDateTime(civil: string | null): string {
  if (!civil) return '';
  const m = CIVIL.exec(civil);
  if (!m) return civil;
  const date = `${m[3]}.${m[2]}.${m[1].slice(2)}`;
  return m[4] ? `${date}, ${m[4]}:${m[5]}` : date;
}

export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)} %`;
}
