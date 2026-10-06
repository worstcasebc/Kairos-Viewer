import type { BaselineTaskDto, DependencyDto } from '../model';
import type { VisibleRow } from '../tree';
import { dayNumber, isCivil } from './calendar';
import { axisRows, type TimeScale } from './scale';

export const ROW_HEIGHT = 24;
export const AXIS_HEIGHT = 40;

export interface GanttOptions {
  rows: VisibleRow[];
  dependencies: DependencyDto[];
  scale: TimeScale;
  isWorkingDay: (day: number) => boolean;
  today: string;
  statusDate: string | null;
  baseline: Map<string, BaselineTaskDto> | null;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.appendChild(node);
  return node;
}

interface Anchor {
  startX: number;
  endX: number;
  y: number;
  critical: boolean;
}

function arrowMarkers(svg: SVGSVGElement): void {
  const defs = el('defs', {}, svg);
  for (const id of ['arrow', 'arrow-critical']) {
    const marker = el('marker', { id, viewBox: '0 0 8 8', refX: 8, refY: 4, markerWidth: 7, markerHeight: 7, orient: 'auto' }, defs);
    el('path', { d: 'M0,0 L8,4 L0,8 z', class: id }, marker);
  }
}

function verticalLine(svg: SVGSVGElement, x: number, height: number, cls: string): void {
  el('line', { x1: x, x2: x, y1: 0, y2: height, class: cls }, svg);
}

export function renderGanttBody(opts: GanttOptions): SVGSVGElement {
  const { rows, scale } = opts;
  const height = rows.length * ROW_HEIGHT;
  const svg = el('svg', { width: scale.width, height, viewBox: `0 0 ${scale.width} ${height}`, class: 'gantt-body' });
  arrowMarkers(svg);

  // Hintergrund: arbeitsfreie Tage (aufeinanderfolgende als ein Rechteck), Tagesraster, Zeilenlinien
  let freeRunStart: number | null = null;
  for (let day = scale.startDay; day <= scale.endDay + 1; day++) {
    const free = day <= scale.endDay && !opts.isWorkingDay(day);
    if (free && freeRunStart === null) freeRunStart = day;
    if (!free && freeRunStart !== null) {
      const x = scale.xDay(freeRunStart);
      el('rect', { x, y: 0, width: scale.xDay(day) - x, height, class: 'nonworking' }, svg);
      freeRunStart = null;
    }
    if (day <= scale.endDay && scale.zoom === 'day') verticalLine(svg, scale.xDay(day), height, 'grid');
  }
  rows.forEach((_, i) => {
    const y = (i + 1) * ROW_HEIGHT - 0.5;
    el('line', { x1: 0, x2: scale.width, y1: y, y2: y, class: 'row-line' }, svg);
  });

  const inRange = (civil: string) => dayNumber(civil) >= scale.startDay && dayNumber(civil) <= scale.endDay;
  if (isCivil(opts.today) && inRange(opts.today)) verticalLine(svg, scale.x(`${opts.today.slice(0, 10)}T12:00`), height, 'today');
  if (isCivil(opts.statusDate) && inRange(opts.statusDate)) verticalLine(svg, scale.x(opts.statusDate), height, 'status-date');

  // Vorgänge
  const anchors = new Map<string, Anchor>();
  rows.forEach((row, i) => {
    const t = row.node.task;
    if (!isCivil(t.earlyStart) || !isCivil(t.earlyFinish)) return;
    const top = i * ROW_HEIGHT;
    const x1 = scale.x(t.earlyStart);
    const x2 = scale.x(t.earlyFinish);
    const width = Math.max(2, x2 - x1);
    const g = el('g', { 'data-task-id': t.id }, svg);
    el('title', {}, g).textContent = t.name;

    const bl = opts.baseline?.get(t.id);
    if (bl && isCivil(bl.start) && isCivil(bl.finish)) {
      const bx = scale.x(bl.start);
      el('rect', { x: bx, y: top + ROW_HEIGHT - 6, width: Math.max(2, scale.x(bl.finish) - bx), height: 4, class: 'baseline' }, g);
    }

    const critical = t.isCritical ? ' critical' : '';
    if (t.type === 'milestone') {
      const cy = top + ROW_HEIGHT / 2;
      el('polygon', { points: `${x1},${cy - 7} ${x1 + 7},${cy} ${x1},${cy + 7} ${x1 - 7},${cy}`, class: `milestone${critical}` }, g);
      anchors.set(t.id, { startX: x1, endX: x1, y: cy, critical: t.isCritical });
      return;
    }
    if (t.type === 'summary') {
      const y = top + 8;
      el('rect', { x: x1, y, width, height: 6, class: 'summary' }, g);
      el('polygon', { points: `${x1},${y + 6} ${x1 + 6},${y + 6} ${x1},${y + 11}`, class: 'summary' }, g);
      el('polygon', { points: `${x1 + width},${y + 6} ${x1 + width - 6},${y + 6} ${x1 + width},${y + 11}`, class: 'summary' }, g);
    } else {
      el('rect', { x: x1, y: top + 5, width, height: 14, rx: 2, class: `bar${critical}` }, g);
      el('rect', { x: x1, y: top + 5, width: width * Math.min(1, Math.max(0, t.percentComplete)), height: 14, rx: 2, class: 'progress' }, g);
    }
    anchors.set(t.id, { startX: x1, endX: x1 + width, y: top + ROW_HEIGHT / 2, critical: t.isCritical });
  });

  // Abhängigkeiten: orthogonaler Pfad von der passenden Kante des Vorgängers zur Kante des Nachfolgers
  for (const d of opts.dependencies) {
    const from = anchors.get(d.predecessorId);
    const to = anchors.get(d.successorId);
    if (!from || !to) continue;
    const fromStart = d.type[0] === 'S';
    const toStart = d.type[1] === 'S';
    const fx = fromStart ? from.startX : from.endX;
    const tx = toStart ? to.startX : to.endX;
    // Austritt 8 px vor/nach der Kante; Eintritt in den Nachfolger immer von der Außenseite
    // (Anfang von links, Ende von rechts). Passt das nicht direkt, Umweg zwischen den Zeilen.
    const outX = fx + (fromStart ? -8 : 8);
    const inX = tx + (toStart ? -8 : 8);
    const direct = toStart ? outX <= tx : outX >= tx;
    const midY = to.y + (to.y > from.y ? -ROW_HEIGHT / 2 : ROW_HEIGHT / 2);
    const route = direct
      ? `M${fx},${from.y} H${outX} V${to.y} H${tx}`
      : `M${fx},${from.y} H${outX} V${midY} H${inX} V${to.y} H${tx}`;
    const critical = from.critical && to.critical;
    el('path', {
      d: route,
      class: `dep${critical ? ' critical' : ''}`,
      'data-from': d.predecessorId,
      'data-to': d.successorId,
      'marker-end': `url(#${critical ? 'arrow-critical' : 'arrow'})`,
    }, svg);
  }
  return svg;
}

export function renderGanttAxis(scale: TimeScale): SVGSVGElement {
  const svg = el('svg', { width: scale.width, height: AXIS_HEIGHT, viewBox: `0 0 ${scale.width} ${AXIS_HEIGHT}`, class: 'gantt-axis' });
  const { top, bottom } = axisRows(scale);
  const half = AXIS_HEIGHT / 2;
  for (const [cells, y] of [[top, 0], [bottom, half]] as const) {
    for (const cell of cells) {
      el('line', { x1: cell.x + 0.5, x2: cell.x + 0.5, y1: y, y2: y + half, class: 'axis-line' }, svg);
      if (cell.width >= 18) {
        el('text', { x: cell.x + 4, y: y + 14, class: 'axis-label' }, svg).textContent = cell.label;
      }
    }
  }
  el('line', { x1: 0, x2: scale.width, y1: half + 0.5, y2: half + 0.5, class: 'axis-line' }, svg);
  return svg;
}
