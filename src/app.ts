import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { open } from '@tauri-apps/plugin-dialog';
import { makeWorkingDayFn, todayCivil } from './gantt/calendar';
import { renderGanttAxis, renderGanttBody } from './gantt/render';
import { computeRange, createScale, type Zoom } from './gantt/scale';
import type { ProjectDto } from './model';
import { predecessorTexts } from './predecessors';
import {
  baselineMap, collapseAll, displayTitle, expandAll, initialState, loadProject, missingDates, printZoom,
  toggleCollapsed, type ViewState,
} from './state';
import { renderTableBody, renderTableHeader } from './table';
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
<div class="empty">Kairos-Datei öffnen oder hierher ziehen</div>
<main class="main" hidden>
  <section class="pane-table"><div class="table-header"></div><div class="table-scroll"></div></section>
  <div class="splitter" role="separator" aria-orientation="vertical"></div>
  <section class="pane-gantt"><div class="gantt-header"></div><div class="gantt-scroll"></div></section>
</main>`;

export function startApp(root: HTMLElement): void {
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
  const ganttHeader = q<HTMLDivElement>('.gantt-header');
  const ganttScroll = q<HTMLDivElement>('.gantt-scroll');
  const splitter = q<HTMLDivElement>('.splitter');
  const baselineCheckbox = q<HTMLInputElement>('[data-action="baseline"]');
  const baselineSelect = q<HTMLSelectElement>('[data-action="baseline-select"]');
  const zoomButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-zoom]')];

  function showBanner(text: string, kind: 'info' | 'error'): void {
    banner.textContent = text;
    banner.className = `banner ${kind}`;
    banner.hidden = false;
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
    tableHeader.replaceChildren(renderTableHeader());
    tableScroll.replaceChildren(
      renderTableBody({
        rows,
        predecessors: predecessorTexts(project.dependencies, tree, project.hoursPerDay),
        hoursPerDay: project.hoursPerDay,
        onToggle: (id) => {
          state = toggleCollapsed(state, id);
          render();
        },
      }),
    );

    const today = todayCivil();
    const baselineId = state.showBaseline ? state.baselineId : null;
    const range = computeRange(project, baselineId, today);
    const scale = createScale(state.zoom, range.startDay, range.endDay);
    ganttHeader.replaceChildren(renderGanttAxis(scale));
    ganttScroll.replaceChildren(
      renderGanttBody({
        rows,
        dependencies: project.dependencies,
        scale,
        isWorkingDay: makeWorkingDayFn(project.calendar),
        today,
        statusDate: project.statusDate,
        baseline: state.showBaseline ? baselineMap(state) : null,
      }),
    );
    syncScroll();

    const missing = missingDates(project);
    if (missing > 0) {
      showBanner(`${missing} Vorgänge ohne gespeicherte Termine – Datei in Kairos öffnen und speichern.`, 'info');
    } else {
      banner.hidden = true;
    }
  }

  async function openPath(path: string): Promise<void> {
    try {
      const project = await invoke<ProjectDto>('open_project', { path });
      state = loadProject(state, project, path);
      ganttScroll.scrollTop = 0;
      ganttScroll.scrollLeft = 0;
      render();
    } catch (error) {
      showBanner(String(error), 'error');
    }
  }

  async function chooseFile(): Promise<void> {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'Kairos-Projekt', extensions: ['kairos'] }],
    });
    if (typeof selected === 'string') await openPath(selected);
  }

  async function printProject(): Promise<void> {
    if (!state.project) return;
    const total = tablePane.getBoundingClientRect().width + ganttScroll.scrollWidth;
    document.documentElement.style.setProperty('--print-zoom', String(printZoom(total)));
    try {
      await invoke('print_window');
    } catch (error) {
      showBanner(`Drucken fehlgeschlagen: ${String(error)}`, 'error');
    }
  }

  // Scroll-Sync: Gantt führt; Tabelle folgt vertikal, Achse folgt horizontal.
  function syncScroll(): void {
    tableScroll.scrollTop = ganttScroll.scrollTop;
    ganttHeader.scrollLeft = ganttScroll.scrollLeft;
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
  q<HTMLButtonElement>('[data-action="open"]').addEventListener('click', () => void chooseFile());
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

  // Dateien von außen: Drag&Drop, macOS-Dateiöffnung, Startargument
  void getCurrentWebview().onDragDropEvent((event) => {
    if (event.payload.type !== 'drop') return;
    const path = event.payload.paths.find((p) => p.toLowerCase().endsWith('.kairos'));
    if (path) void openPath(path);
    else showBanner('Nur .kairos-Dateien können geöffnet werden.', 'error');
  });
  void listen<string>('open-file', (event) => void openPath(event.payload)).then(async () => {
    const initial = await invoke<string | null>('initial_file');
    if (initial) await openPath(initial);
  });

  render();
}
