// Spiegel des Rust-DTO (src-tauri/src/reader.rs). Optionale Werte kommen als null.

export type TaskType = 'normal' | 'summary' | 'milestone';
export type DisplayUnit = 'min' | 'h' | 'd';
export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF';

export interface TaskDto {
  id: string;
  parentId: string | null;
  orderIndex: number;
  name: string;
  type: TaskType;
  durationMinutes: number;
  displayUnit: DisplayUnit;
  percentComplete: number;
  deadline: string | null;
  earlyStart: string | null;
  earlyFinish: string | null;
  totalFloat: number | null;
  freeFloat: number | null;
  isCritical: boolean;
  deadlineMissed: boolean;
  fixedFinish: string | null;
}

export interface DependencyDto {
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  lagMinutes: number;
}

export interface WorkdayDto {
  weekday: number;
  isWorking: boolean;
}

export interface CalendarExceptionDto {
  date: string;
  isWorking: boolean;
}

export interface CalendarDto {
  workweek: WorkdayDto[];
  exceptions: CalendarExceptionDto[];
}

export interface BaselineTaskDto {
  taskId: string;
  start: string | null;
  finish: string | null;
}

export interface BaselineDto {
  id: string;
  name: string;
  tasks: BaselineTaskDto[];
}

export interface ProjectDto {
  schemaVersion: number;
  name: string;
  startDate: string | null;
  finishDate: string | null;
  statusDate: string | null;
  hoursPerDay: number;
  daysPerWeek: number;
  tasks: TaskDto[];
  dependencies: DependencyDto[];
  calendar: CalendarDto | null;
  baselines: BaselineDto[];
  activeBaselineId: string | null;
}
