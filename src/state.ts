import { isCivil } from './gantt/calendar';
import { AXIS_HEIGHT, ROW_HEIGHT } from './gantt/render';
import type { Zoom } from './gantt/scale';
import type { BaselineTaskDto, ProjectDto } from './model';
import { buildTree, parentIds, type Tree } from './tree';

export interface ViewState {
  project: ProjectDto | null;
  tree: Tree | null;
  fileName: string;
  collapsed: Set<string>;
  zoom: Zoom;
  showBaseline: boolean;
  baselineId: string | null;
}

/** Bedruckbare Breite A3 quer bei 10 mm Rand: 400 mm bei 96 dpi. */
export const PRINT_PAGE_WIDTH_PX = 1512;
/** Bedruckbare Höhe A3 quer bei 10 mm Rand: 277 mm bei 96 dpi. */
export const PRINT_PAGE_HEIGHT_PX = 1046;
/** Reserve gegen Rundung beim Skalieren, damit eine Druckseite nie überläuft. */
const PRINT_SAFETY_PX = 16;

export function initialState(): ViewState {
  return { project: null, tree: null, fileName: '', collapsed: new Set(), zoom: 'week', showBaseline: false, baselineId: null };
}

export function loadProject(state: ViewState, project: ProjectDto, filePath: string): ViewState {
  const active = project.baselines.find((b) => b.id === project.activeBaselineId) ?? project.baselines[0];
  return {
    ...state,
    project,
    tree: buildTree(project.tasks),
    fileName: filePath.split(/[\\/]/).pop() ?? filePath,
    collapsed: new Set(),
    showBaseline: false,
    baselineId: active?.id ?? null,
  };
}

export function toggleCollapsed(state: ViewState, taskId: string): ViewState {
  const collapsed = new Set(state.collapsed);
  if (collapsed.has(taskId)) collapsed.delete(taskId);
  else collapsed.add(taskId);
  return { ...state, collapsed };
}

export function collapseAll(state: ViewState): ViewState {
  return { ...state, collapsed: state.tree ? parentIds(state.tree) : new Set() };
}

export function expandAll(state: ViewState): ViewState {
  return { ...state, collapsed: new Set() };
}

export function missingDates(project: ProjectDto): number {
  return project.tasks.filter((t) => !isCivil(t.earlyStart) || !isCivil(t.earlyFinish)).length;
}

export function displayTitle(state: ViewState): string {
  if (!state.project) return 'Keine Datei geöffnet';
  return state.project.name.trim() || state.fileName.replace(/\.kairos$/i, '');
}

export function baselineMap(state: ViewState): Map<string, BaselineTaskDto> | null {
  const baseline = state.project?.baselines.find((b) => b.id === state.baselineId);
  return baseline ? new Map(baseline.tasks.map((t) => [t.taskId, t])) : null;
}

export function printZoom(totalWidthPx: number, pageWidthPx = PRINT_PAGE_WIDTH_PX): number {
  if (totalWidthPx <= 0) return 1;
  return Math.min(1, pageWidthPx / totalWidthPx);
}

/** Vorgangszeilen pro Druckseite (unter Kopfzeile/Zeitachse), passend zum Druck-Zoom. */
export function rowsPerPrintPage(zoom: number, pageHeightPx = PRINT_PAGE_HEIGHT_PX): number {
  const usable = pageHeightPx / zoom - AXIS_HEIGHT - PRINT_SAFETY_PX;
  return Math.max(1, Math.floor(usable / ROW_HEIGHT));
}
