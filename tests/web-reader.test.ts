// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SqlJsStatic } from 'sql.js';
import { beforeAll, describe, expect, test } from 'vitest';
import { ReaderError, readProject } from '../src/web/reader';
import { fixtureBytes, testSqlJs } from './helpers/sqljs';

/** Minimale Kairos-Datei im Stil von v1/v2 ohne optionale Spalten und ohne Kalender-/Baseline-Tabellen (wie reader_tests.rs). */
const BASE_DDL = `
CREATE TABLE meta (schema_version INTEGER NOT NULL);
CREATE TABLE project (id TEXT PRIMARY KEY, name TEXT NOT NULL, start_date TEXT, finish_date TEXT,
  default_calendar_id TEXT, hours_per_day REAL NOT NULL, days_per_week REAL NOT NULL);
CREATE TABLE task (id TEXT PRIMARY KEY, parent_id TEXT, order_index INTEGER NOT NULL, name TEXT NOT NULL,
  type TEXT NOT NULL, duration_minutes INTEGER NOT NULL, display_unit TEXT NOT NULL, deadline TEXT,
  percent_complete REAL NOT NULL, early_start TEXT, early_finish TEXT, total_float INTEGER,
  free_float INTEGER, is_critical INTEGER, deadline_missed INTEGER);
CREATE TABLE dependency (id TEXT PRIMARY KEY, predecessor_id TEXT NOT NULL, successor_id TEXT NOT NULL,
  type TEXT NOT NULL, lag_minutes INTEGER NOT NULL);
INSERT INTO project VALUES ('p1', 'Synthetisch', '2026-01-05', NULL, NULL, 8.0, 5.0);
INSERT INTO task VALUES ('t1', NULL, 0, 'Alpha', 'normal', 960, 'd', NULL, 0.5,
  '2026-01-05T08:00', '2026-01-06T17:00', 0, 0, 1, 0);
INSERT INTO task VALUES ('t2', NULL, 1, 'Beta', 'milestone', 0, 'd', NULL, 0.0,
  NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO dependency VALUES ('d1', 't1', 't2', 'FF', -120);
`;

let sql: SqlJsStatic;
beforeAll(async () => {
  sql = await testSqlJs();
});

function makeDb(version: number, extraSql = ''): Uint8Array {
  const db = new sql.Database();
  try {
    db.run(BASE_DDL);
    db.run('INSERT INTO meta VALUES (?)', [version]);
    if (extraSql) db.run(extraSql);
    return db.export();
  } finally {
    db.close();
  }
}

const NOT_KAIROS = 'Die Datei ist keine Kairos-Projektdatei.';

describe('readProject – Prüfung', () => {
  test('Textdatei und leere Datei werden abgelehnt', () => {
    expect(() => readProject(new TextEncoder().encode('kein SQLite'), sql)).toThrow(NOT_KAIROS);
    expect(() => readProject(new Uint8Array(), sql)).toThrow(ReaderError);
  });

  test('SQLite ohne task-Tabelle wird abgelehnt', () => {
    const db = new sql.Database();
    db.run('CREATE TABLE meta (schema_version INTEGER); INSERT INTO meta VALUES (5);');
    const bytes = db.export();
    db.close();
    expect(() => readProject(bytes, sql)).toThrow(NOT_KAIROS);
  });

  test('Versionen außerhalb 2–5 mit Meldung wie in Rust', () => {
    expect(() => readProject(makeDb(6), sql)).toThrow('Die Kairos-Dateiversion 6 wird nicht unterstützt (unterstützt: 2–5).');
    expect(() => readProject(makeDb(1), sql)).toThrow('Die Kairos-Dateiversion 1 wird nicht unterstützt (unterstützt: 2–5).');
  });

  test('Projektzeile einer unterstützten Version', () => {
    const project = readProject(makeDb(2), sql);
    expect(project).toMatchObject({
      schemaVersion: 2,
      name: 'Synthetisch',
      startDate: '2026-01-05',
      statusDate: null,
      activeBaselineId: null,
      hoursPerDay: 8,
      daysPerWeek: 5,
    });
  });

  test('abgeschnittene Datei mit gültigem Kopf: verständliche Meldung statt Absturz', () => {
    const truncated = fixtureBytes('demo-v2.kairos').slice(0, 1024);
    expect(() => readProject(truncated, sql)).toThrow(/^Die Datei ist (beschädigt: |keine Kairos-Projektdatei\.)/);
  });

  test('die übergebenen Bytes werden nicht verändert', () => {
    const bytes = fixtureBytes('demo-v2.kairos');
    const copy = bytes.slice();
    readProject(bytes, sql);
    expect(bytes).toEqual(copy);
  });
});

describe('readProject – Daten', () => {
  test('deckungsgleich mit dem Rust-Reader (Referenzdatei)', () => {
    const expected = JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/demo-v2.expected.json'), 'utf-8'));
    expect(readProject(fixtureBytes('demo-v2.kairos'), sql)).toEqual(expected);
  });

  test('Datei ohne optionale Spalten und Tabellen', () => {
    const project = readProject(makeDb(2), sql);
    expect(project.tasks).toHaveLength(2);
    expect(project.tasks[0]).toMatchObject({
      name: 'Alpha',
      type: 'normal',
      durationMinutes: 960,
      percentComplete: 0.5,
      earlyStart: '2026-01-05T08:00',
      isCritical: true,
      fixedFinish: null,
    });
    expect(project.tasks[1]).toMatchObject({ earlyStart: null, totalFloat: null, isCritical: false, deadlineMissed: false });
    expect(project.dependencies).toEqual([{ predecessorId: 't1', successorId: 't2', type: 'FF', lagMinutes: -120 }]);
    expect(project.calendar).toBeNull();
    expect(project.baselines).toEqual([]);
  });

  test('v5-Spalten', () => {
    const project = readProject(
      makeDb(
        5,
        `ALTER TABLE task ADD COLUMN fixed_finish TEXT;
         ALTER TABLE project ADD COLUMN status_date TEXT;
         ALTER TABLE project ADD COLUMN active_baseline_id TEXT;
         UPDATE task SET fixed_finish = '2026-01-07T17:00' WHERE id = 't1';
         UPDATE project SET status_date = '2026-01-06';`,
      ),
      sql,
    );
    expect(project.schemaVersion).toBe(5);
    expect(project.statusDate).toBe('2026-01-06');
    expect(project.tasks[0].fixedFinish).toBe('2026-01-07T17:00');
  });
});
