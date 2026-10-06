import type { ProjectDto } from '../model';
import { civilFromDayNumber, dayNumber, isCivil, isoWeek, isoWeekday, minuteOfDay } from './calendar';

export type Zoom = 'day' | 'week' | 'month';

export const PX_PER_DAY: Record<Zoom, number> = { day: 70, week: 23, month: 7 };

export interface TimeScale {
  zoom: Zoom;
  pxPerDay: number;
  startDay: number;
  endDay: number;
  width: number;
  x(civil: string): number;
  xDay(day: number): number;
}

export interface AxisCell {
  x: number;
  width: number;
  label: string;
}

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export function computeRange(project: ProjectDto, baselineId: string | null, today: string): { startDay: number; endDay: number } {
  const dates: string[] = [];
  for (const t of project.tasks) {
    if (isCivil(t.earlyStart)) dates.push(t.earlyStart);
    if (isCivil(t.earlyFinish)) dates.push(t.earlyFinish);
  }
  const baseline = project.baselines.find((b) => b.id === baselineId);
  for (const bt of baseline?.tasks ?? []) {
    if (isCivil(bt.start)) dates.push(bt.start);
    if (isCivil(bt.finish)) dates.push(bt.finish);
  }
  if (dates.length === 0) {
    const base = dayNumber(isCivil(project.startDate) ? project.startDate : today);
    return { startDay: base - 2, endDay: base + 30 };
  }
  const days = dates.map(dayNumber);
  return { startDay: Math.min(...days) - 2, endDay: Math.max(...days) + 7 };
}

export function createScale(zoom: Zoom, startDay: number, endDay: number): TimeScale {
  const pxPerDay = PX_PER_DAY[zoom];
  return {
    zoom,
    pxPerDay,
    startDay,
    endDay,
    width: (endDay - startDay + 1) * pxPerDay,
    x: (civil) => (dayNumber(civil) - startDay + minuteOfDay(civil) / 1440) * pxPerDay,
    xDay: (day) => (day - startDay) * pxPerDay,
  };
}

/** Fasst aufeinanderfolgende Tage mit gleichem Schlüssel zu Achsenzellen zusammen. */
function group(scale: TimeScale, key: (day: number) => string, label: (day: number) => string): AxisCell[] {
  const cells: AxisCell[] = [];
  let currentKey: string | null = null;
  for (let day = scale.startDay; day <= scale.endDay; day++) {
    const k = key(day);
    if (k === currentKey) {
      cells[cells.length - 1].width += scale.pxPerDay;
    } else {
      cells.push({ x: scale.xDay(day), width: scale.pxPerDay, label: label(day) });
      currentKey = k;
    }
  }
  return cells;
}

const year = (day: number) => civilFromDayNumber(day).slice(0, 4);
const month = (day: number) => Number(civilFromDayNumber(day).slice(5, 7)) - 1;
const weekYear = (day: number) => year(day - isoWeekday(day) + 3);

export function axisRows(scale: TimeScale): { top: AxisCell[]; bottom: AxisCell[] } {
  const weekKey = (d: number) => `${weekYear(d)}-${isoWeek(d)}`;
  const monthKey = (d: number) => civilFromDayNumber(d).slice(0, 7);
  switch (scale.zoom) {
    case 'day':
      return {
        top: group(scale, weekKey, (d) => `KW ${isoWeek(d)} · ${weekYear(d)}`),
        bottom: group(scale, String, (d) => `${WEEKDAYS[isoWeekday(d)]} ${Number(civilFromDayNumber(d).slice(8, 10))}`),
      };
    case 'week':
      return {
        top: group(scale, monthKey, (d) => `${MONTHS[month(d)]} ${year(d)}`),
        bottom: group(scale, weekKey, (d) => `KW ${isoWeek(d)}`),
      };
    case 'month':
      return {
        top: group(scale, year, year),
        bottom: group(scale, monthKey, (d) => MONTHS[month(d)].slice(0, 3)),
      };
  }
}
