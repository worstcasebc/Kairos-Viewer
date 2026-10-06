import type { DependencyDto, DependencyType, ProjectDto, TaskDto } from '../../src/model';

export function task(p: Partial<TaskDto> & Pick<TaskDto, 'id' | 'name'>): TaskDto {
  return {
    parentId: null,
    orderIndex: 0,
    type: 'normal',
    durationMinutes: 0,
    displayUnit: 'd',
    percentComplete: 0,
    deadline: null,
    earlyStart: null,
    earlyFinish: null,
    totalFloat: null,
    freeFloat: null,
    isCritical: false,
    deadlineMissed: false,
    fixedFinish: null,
    ...p,
  };
}

export function dep(predecessorId: string, successorId: string, type: DependencyType = 'FS', lagMinutes = 0): DependencyDto {
  return { predecessorId, successorId, type, lagMinutes };
}

const crit = { totalFloat: 0, freeFloat: 0, isCritical: true };

/** Demo-Projekt (Werte aus Kairos-Demo.kairos); Vorgänge bewusst NICHT in Baumreihenfolge. */
export function demoProject(): ProjectDto {
  return {
    schemaVersion: 2,
    name: '',
    startDate: null,
    finishDate: null,
    statusDate: null,
    hoursPerDay: 8,
    daysPerWeek: 5,
    tasks: [
      task({ id: 'golive', name: 'Go-Live', orderIndex: 3, type: 'milestone', earlyStart: '2026-07-14T11:00', earlyFinish: '2026-07-14T11:00', ...crit }),
      task({ id: 'umsetzung', name: 'Umsetzung', orderIndex: 1, type: 'summary', earlyStart: '2026-07-01T12:00', earlyFinish: '2026-07-09T14:00' }),
      task({ id: 'konzeption', name: 'Konzeption', orderIndex: 0, type: 'summary', earlyStart: '2026-06-25T08:00', earlyFinish: '2026-07-01T12:00' }),
      task({ id: 'anforderungen', name: 'Anforderungen', parentId: 'konzeption', orderIndex: 0, durationMinutes: 1440, percentComplete: 1, earlyStart: '2026-06-25T08:00', earlyFinish: '2026-06-29T14:00', ...crit }),
      task({ id: 'wireframes', name: 'Wireframes', parentId: 'konzeption', orderIndex: 1, durationMinutes: 960, percentComplete: 1, earlyStart: '2026-06-29T14:00', earlyFinish: '2026-07-01T12:00', ...crit }),
      task({ id: 'frontend', name: 'Frontend', parentId: 'umsetzung', orderIndex: 0, durationMinutes: 2400, earlyStart: '2026-07-01T12:00', earlyFinish: '2026-07-07T16:00', ...crit }),
      task({ id: 'backend', name: 'Backend', parentId: 'umsetzung', orderIndex: 1, durationMinutes: 2400, earlyStart: '2026-07-01T12:00', earlyFinish: '2026-07-07T16:00', ...crit }),
      task({ id: 'integration', name: 'Integration', parentId: 'umsetzung', orderIndex: 2, durationMinutes: 960, earlyStart: '2026-07-07T16:00', earlyFinish: '2026-07-09T14:00', ...crit }),
      task({ id: 'tests', name: 'Tests', orderIndex: 2, durationMinutes: 1440, earlyStart: '2026-07-09T14:00', earlyFinish: '2026-07-14T11:00', ...crit }),
    ],
    dependencies: [
      dep('anforderungen', 'wireframes'),
      dep('wireframes', 'frontend'),
      dep('frontend', 'backend', 'SS'),
      dep('frontend', 'integration'),
      dep('backend', 'integration'),
      dep('integration', 'tests'),
      dep('tests', 'golive'),
    ],
    calendar: { workweek: [0, 1, 2, 3, 4].map((weekday) => ({ weekday, isWorking: true })), exceptions: [] },
    baselines: [
      {
        id: 'bl1',
        name: 'Basisplan',
        tasks: [
          { taskId: 'konzeption', start: '2026-06-25T08:00', finish: '2026-07-01T12:00' },
          { taskId: 'anforderungen', start: '2026-06-25T08:00', finish: '2026-06-29T14:00' },
          { taskId: 'tests', start: null, finish: null },
        ],
      },
    ],
    activeBaselineId: 'bl1',
  };
}
