import { makeWorkingDayFn, todayCivil } from './gantt/calendar';
import { renderGanttAxis, renderGanttBody, type GanttOptions } from './gantt/render';
import { computeRange, createScale, type Zoom } from './gantt/scale';
import type { ProjectDto } from './model';
import type { LoadedFile, Platform } from './platform/types';
import { predecessorTexts } from './predecessors';
import {
  baselineMap, collapseAll, displayTitle, expandAll, initialState, loadProject, missingDates, printZoom,
  rowsPerPrintPage, toggleCollapsed, type ViewState,
} from './state';
import { renderTableBody, renderTableHeader, type TableOptions } from './table';
import { visibleRows } from './tree';

// Statisches Gerüst ohne Nutzerdaten – Inhalte werden ausschließlich per DOM-API/textContent gesetzt.
const LAYOUT = `
<header class="toolbar">
  <button type="button" data-action="open">Öffnen…</button>
  <span class="title"></span>
  <div class="segmented" role="group" aria-label="Zoom">
    <button type="button" data-zoom="day">Tag</button>
    <button type="button" data-zoom="week">Woche</button>
    <button type="button" data-zoom="month">Monat</button>
  </div>
  <label class="baseline-toggle"><input type="checkbox" data-action="baseline"> Baseline</label>
  <select data-action="baseline-select" aria-label="Baseline auswählen"></select>
  <button type="button" data-action="expand">Alle aufklappen</button>
  <button type="button" data-action="collapse">Alle zuklappen</button>
  <button type="button" data-action="print">Drucken…</button>
</header>
<div class="banner" hidden></div>
<div class="empty">
  <p class="empty-title">Kairos-Datei öffnen oder hierher ziehen</p>
  <p class="empty-note" hidden></p>
</div>
<main class="main" hidden>
  <section class="pane-table">
    <div class="table-scroll"><div class="table-header"></div><div class="table-rows"></div></div>
  </section>
  <div class="splitter" role="separator" aria-orientation="vertical"></div>
  <section class="pane-gantt">
    <div class="gantt-scroll"><div class="gantt-header"></div><div class="gantt-rows"></div></div>
  </section>
</main>
<div class="print-pages"></div>`;

export interface StartOptions {
  /** Zusatzzeile im leeren Zustand (Web: Datenschutzhinweis). */
  privacyNote?: string;
}

export function startApp(root: HTMLElement, platform: Platform, options: StartOptions = {}): void {
  let state: ViewState = initialState();
  root.innerHTML = LAYOUT;
  const q = <T extends Element>(selector: string) => root.querySelector(selector) as T;

  const titleEl = q<HTMLSpanElement>('.title');
  const banner = q<HTMLDivElement>('.banner');
  const emptyHint = q<HTMLDivElement>('.empty');
  const mainEl = q<HTMLElement>('.main');
  const tablePane = q<HTMLElement>('.pane-table');
  const tableHeader = q<HTMLDivElement>('.table-header');
  const tableScroll = q<HTMLDivElement>('.table-scroll');
  const tableRows = q<HTMLDivElement>('.table-rows');
  const ganttHeader = q<HTMLDivElement>('.gantt-header');
  const ganttScroll = q<HTMLDivElement>('.gantt-scroll');
  const ganttRows = q<HTMLDivElement>('.gantt-rows');
  const splitter = q<HTMLDivElement>('.splitter');
  const baselineCheckbox = q<HTMLInputElement>('[data-action="baseline"]');
  const baselineSelect = q<HTMLSelectElement>('[data-action="baseline-select"]');
  const zoomButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-zoom]')];
  const printPages = q<HTMLDivElement>('.print-pages');
  if (options.privacyNote) {
    const note = q<HTMLParagraphElement>('.empty-note');
    note.textContent = options.privacyNote;
    note.hidden = false;
  }
  // Zuletzt gerenderte Ansicht; der Druck baut daraus seitenweise eigene Tabellen-/Gantt-Stücke.
  let view: { table: TableOptions; gantt: GanttOptions } | null = null;

  // Letzte Fehlermeldung; bleibt bei jedem Neu-Rendern stehen, bis eine Datei erfolgreich geöffnet wurde.
  let errorMessage: string | null = null;

  function showBanner(text: string, kind: 'info' | 'error'): void {
    banner.textContent = text;
    banner.className = `banner ${kind}`;
    banner.hidden = false;
  }

  function showError(text: string): void {
    errorMessage = text;
    showBanner(text, 'error');
  }

  function renderToolbar(project: ProjectDto | null): void {
    titleEl.textContent = displayTitle(state);
    document.title = project ? `${displayTitle(state)} – Kairos Viewer` : 'Kairos Viewer';
    for (const b of zoomButtons) b.setAttribute('aria-pressed', String(b.dataset.zoom === state.zoom));
    const hasBaselines = (project?.baselines.length ?? 0) > 0;
    baselineCheckbox.disabled = !hasBaselines;
    baselineCheckbox.checked = state.showBaseline;
    baselineSelect.hidden = !hasBaselines;
    baselineSelect.replaceChildren(
      ...(project?.baselines ?? []).map((b) => {
        const option = document.createElement('option');
        option.value = b.id;
        option.textContent = b.name;
        option.selected = b.id === state.baselineId;
        return option;
      }),
    );
  }

  function render(): void {
    const { project, tree } = state;
    renderToolbar(project);
    emptyHint.hidden = project !== null;
    mainEl.hidden = project === null;
    if (!project || !tree) return;

    const rows = visibleRows(tree, state.collapsed);
    const today = todayCivil();
    const baselineId = state.showBaseline ? state.baselineId : null;
    const range = computeRange(project, baselineId, today);
    const scale = createScale(state.zoom, range.startDay, range.endDay);
    view = {
      table: {
        rows,
        predecessors: predecessorTexts(project.dependencies, tree, project.hoursPerDay),
        hoursPerDay: project.hoursPerDay,
        onToggle: (id) => {
          state = toggleCollapsed(state, id);
          render();
        },
      },
      gantt: {
        rows,
        dependencies: project.dependencies,
        scale,
        isWorkingDay: makeWorkingDayFn(project.calendar),
        today,
        statusDate: project.statusDate,
        baseline: state.showBaseline ? baselineMap(state) : null,
      },
    };
    tableHeader.replaceChildren(renderTableHeader());
    tableRows.replaceChildren(renderTableBody(view.table));
    ganttHeader.replaceChildren(renderGanttAxis(scale));
    ganttRows.replaceChildren(renderGanttBody(view.gantt));
    syncScroll();

    const missing = missingDates(project);
    if (errorMessage) {
      showBanner(errorMessage, 'error');
    } else if (missing > 0) {
      showBanner(`${missing} Vorgänge ohne gespeicherte Termine – Datei in Kairos öffnen und speichern.`, 'info');
    } else {
      banner.hidden = true;
    }
  }

  function showLoaded({ project, fileName }: LoadedFile): void {
    state = loadProject(state, project, fileName);
    errorMessage = null;
    ganttScroll.scrollTop = 0;
    ganttScroll.scrollLeft = 0;
    render();
  }

  /** Druckseiten mit festen Zeilenblöcken: Tabelle und Gantt brechen so garantiert gemeinsam um. */
  function renderPrintPages(perPage: number): void {
    if (!view) return;
    const { table, gantt } = view;
    const pages: HTMLElement[] = [];
    for (let start = 0; start === 0 || start < table.rows.length; start += perPage) {
      const rows = table.rows.slice(start, start + perPage);
      const page = document.createElement('div');
      page.className = 'print-page';
      const tablePart = document.createElement('div');
      tablePart.className = 'print-table';
      const header = document.createElement('div');
      header.className = 'table-header';
      header.appendChild(renderTableHeader());
      tablePart.append(header, renderTableBody({ ...table, rows }));
      const ganttPart = document.createElement('div');
      ganttPart.className = 'print-gantt';
      ganttPart.append(renderGanttAxis(gantt.scale), renderGanttBody({ ...gantt, rows }));
      page.append(tablePart, ganttPart);
      pages.push(page);
    }
    printPages.replaceChildren(...pages);
  }

  async function printProject(): Promise<void> {
    if (!state.project) return;
    // Volle Tabellenbreite (scrollWidth), nicht die Bildschirmbreite des Bereichs.
    const zoom = printZoom(tableScroll.scrollWidth + ganttScroll.scrollWidth);
    document.documentElement.style.setProperty('--print-zoom', String(zoom));
    renderPrintPages(rowsPerPrintPage(zoom));
    try {
      await platform.print();
    } catch (error) {
      showError(`Drucken fehlgeschlagen: ${String(error)}`);
    }
  }

  // Scroll-Sync: Gantt führt vertikal, die Tabelle folgt. Die Kopfzeilen liegen (sticky) in ihren
  // Scrollbereichen und laufen horizontal von selbst mit.
  function syncScroll(): void {
    tableScroll.scrollTop = ganttScroll.scrollTop;
  }
  ganttScroll.addEventListener('scroll', syncScroll);
  tableScroll.addEventListener(
    'wheel',
    (event) => {
      if (event.deltaY === 0) return;
      event.preventDefault();
      ganttScroll.scrollTop += event.deltaY;
    },
    { passive: false },
  );

  // Splitter
  splitter.addEventListener('pointerdown', (down) => {
    const startX = down.clientX;
    const startWidth = tablePane.getBoundingClientRect().width;
    splitter.setPointerCapture(down.pointerId);
    const move = (ev: PointerEvent) => {
      const width = Math.max(200, Math.min(window.innerWidth - 200, startWidth + ev.clientX - startX));
      root.style.setProperty('--table-w', `${width}px`);
    };
    const up = () => {
      splitter.removeEventListener('pointermove', move);
      splitter.removeEventListener('pointerup', up);
    };
    splitter.addEventListener('pointermove', move);
    splitter.addEventListener('pointerup', up);
  });

  // Toolbar
  q<HTMLButtonElement>('[data-action="open"]').addEventListener('click', () => void platform.chooseFile());
  q<HTMLButtonElement>('[data-action="expand"]').addEventListener('click', () => {
    state = expandAll(state);
    render();
  });
  q<HTMLButtonElement>('[data-action="collapse"]').addEventListener('click', () => {
    state = collapseAll(state);
    render();
  });
  q<HTMLButtonElement>('[data-action="print"]').addEventListener('click', () => void printProject());
  for (const button of zoomButtons) {
    button.addEventListener('click', () => {
      state = { ...state, zoom: button.dataset.zoom as Zoom };
      render();
    });
  }
  baselineCheckbox.addEventListener('change', () => {
    state = { ...state, showBaseline: baselineCheckbox.checked };
    render();
  });
  baselineSelect.addEventListener('change', () => {
    state = { ...state, baselineId: baselineSelect.value };
    render();
  });

  // Dateien kommen über die Plattform: Dialog, Drag&Drop, Startargument (Desktop) bzw. Dateiauswahl (Web).
  platform.start({ loaded: showLoaded, failed: showError });

  render();
}
