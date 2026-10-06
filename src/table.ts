import { formatDateTime, formatDuration, formatFloat, formatPercent } from './format';
import type { TaskDto } from './model';
import type { VisibleRow } from './tree';

export const COLUMNS = [
  { key: 'nr', label: 'Nr', width: 44, numeric: true },
  { key: 'name', label: 'Name', width: 260, numeric: false },
  { key: 'duration', label: 'Dauer', width: 70, numeric: true },
  { key: 'start', label: 'Start', width: 118, numeric: false },
  { key: 'finish', label: 'Ende', width: 118, numeric: false },
  { key: 'preds', label: 'Vorgänger', width: 100, numeric: false },
  { key: 'totalFloat', label: 'Ges. Puffer', width: 84, numeric: true },
  { key: 'freeFloat', label: 'Fr. Puffer', width: 84, numeric: true },
  { key: 'percent', label: '% Fertig', width: 68, numeric: true },
] as const;

export type ColumnKey = (typeof COLUMNS)[number]['key'];

export interface TableOptions {
  rows: VisibleRow[];
  predecessors: Map<string, string>;
  hoursPerDay: number;
  onToggle: (taskId: string) => void;
}

const INDENT_PX = 16;
const CELL_PADDING_PX = 6;

export function columnTemplate(): string {
  return COLUMNS.map((c) => `${c.width}px`).join(' ');
}

export function cellText(key: ColumnKey, task: TaskDto, nr: number, predecessors: string, hoursPerDay: number): string {
  switch (key) {
    case 'nr': return String(nr);
    case 'name': return task.name;
    case 'duration': return task.type === 'summary' ? '' : formatDuration(task.durationMinutes, task.displayUnit, hoursPerDay);
    case 'start': return formatDateTime(task.earlyStart);
    case 'finish': return formatDateTime(task.earlyFinish);
    case 'preds': return predecessors;
    case 'totalFloat': return formatFloat(task.totalFloat, hoursPerDay);
    case 'freeFloat': return formatFloat(task.freeFloat, hoursPerDay);
    case 'percent': return formatPercent(task.percentComplete);
  }
}

function cell(text: string, numeric: boolean): HTMLDivElement {
  const div = document.createElement('div');
  div.className = numeric ? 'cell num' : 'cell';
  div.textContent = text;
  return div;
}

export function renderTableHeader(): HTMLElement {
  const header = document.createElement('div');
  header.className = 'header-row';
  header.style.setProperty('--cols', columnTemplate());
  for (const c of COLUMNS) header.appendChild(cell(c.label, c.numeric));
  return header;
}

function nameCell(row: VisibleRow, onToggle: (taskId: string) => void): HTMLDivElement {
  const task = row.node.task;
  const div = document.createElement('div');
  div.className = 'cell';
  div.style.paddingLeft = `${CELL_PADDING_PX + row.node.depth * INDENT_PX}px`;
  if (row.hasChildren) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toggle';
    button.textContent = row.collapsed ? '▸' : '▾';
    button.setAttribute('aria-label', row.collapsed ? 'Aufklappen' : 'Zuklappen');
    button.addEventListener('click', () => onToggle(task.id));
    div.appendChild(button);
  } else {
    const spacer = document.createElement('span');
    spacer.className = 'toggle-spacer';
    div.appendChild(spacer);
  }
  const name = document.createElement('span');
  name.className = 'name-text';
  name.textContent = task.name;
  div.appendChild(name);
  if (task.deadlineMissed) {
    const warn = document.createElement('span');
    warn.className = 'warn';
    warn.title = 'Deadline überschritten';
    warn.textContent = '⚠';
    div.appendChild(warn);
  }
  div.title = task.name;
  return div;
}

export function renderTableBody(opts: TableOptions): HTMLElement {
  const container = document.createElement('div');
  container.className = 'table-body';
  container.style.setProperty('--cols', columnTemplate());
  for (const row of opts.rows) {
    const task = row.node.task;
    const div = document.createElement('div');
    div.className = 'row';
    if (task.type === 'summary') div.classList.add('summary');
    if (task.isCritical) div.classList.add('critical');
    for (const c of COLUMNS) {
      if (c.key === 'name') {
        div.appendChild(nameCell(row, opts.onToggle));
      } else {
        const text = cellText(c.key, task, row.node.nr, opts.predecessors.get(task.id) ?? '', opts.hoursPerDay);
        div.appendChild(cell(text, c.numeric));
      }
    }
    container.appendChild(div);
  }
  return container;
}
