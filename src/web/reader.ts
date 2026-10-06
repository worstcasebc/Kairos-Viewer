// TypeScript-Gegenstück zu src-tauri/src/reader.rs: liest .kairos (SQLite, Schema v2–v5) aus Bytes im
// Arbeitsspeicher. Gleiches Verhalten und gleiche Fehlermeldungen; abgesichert über
// tests/fixtures/demo-v2.expected.json.

import type { Database, SqlJsStatic, SqlValue } from 'sql.js';
import type { ProjectDto } from '../model';

export const MIN_SCHEMA_VERSION = 2;
export const MAX_SCHEMA_VERSION = 5;
const REQUIRED_TABLES = ['meta', 'project', 'task', 'dependency'];
const SQLITE_HEADER = 'SQLite format 3\0';

export class ReaderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReaderError';
  }
}

type Row = Record<string, SqlValue>;

const notKairos = () => new ReaderError('Die Datei ist keine Kairos-Projektdatei.');
const corrupt = (error: unknown) =>
  new ReaderError(`Die Datei ist beschädigt: ${error instanceof Error ? error.message : String(error)}`);

function hasSqliteHeader(bytes: Uint8Array): boolean {
  if (bytes.length < SQLITE_HEADER.length) return false;
  for (let i = 0; i < SQLITE_HEADER.length; i++) {
    if (bytes[i] !== SQLITE_HEADER.charCodeAt(i)) return false;
  }
  return true;
}

function rows(db: Database, sql: string, params: SqlValue[] = []): Row[] {
  const statement = db.prepare(sql);
  try {
    statement.bind(params);
    const result: Row[] = [];
    while (statement.step()) result.push(statement.getAsObject() as Row);
    return result;
  } finally {
    statement.free();
  }
}

/** Spaltennamen einer Tabelle; leer, wenn die Tabelle fehlt. */
function columns(db: Database, table: string): Set<string> {
  return new Set(rows(db, `PRAGMA table_info("${table}")`).map((r) => String(r.name)));
}

/** Spalte für SELECT – oder `NULL AS name`, wenn die Datei (ältere Version) sie nicht hat. */
function col(available: Set<string>, name: string): string {
  return available.has(name) ? name : `NULL AS ${name}`;
}

const text = (value: SqlValue | undefined): string | null => (value === null || value === undefined ? null : String(value));

export function readProject(bytes: Uint8Array, sql: SqlJsStatic): ProjectDto {
  if (!hasSqliteHeader(bytes)) throw notKairos();
  let db: Database;
  try {
    db = new sql.Database(bytes);
  } catch (error) {
    throw corrupt(error);
  }
  try {
    for (const table of REQUIRED_TABLES) {
      if (columns(db, table).size === 0) throw notKairos();
    }
    const meta = rows(db, 'SELECT schema_version FROM meta LIMIT 1')[0];
    if (!meta) throw notKairos();
    const version = Number(meta.schema_version);
    if (!(version >= MIN_SCHEMA_VERSION && version <= MAX_SCHEMA_VERSION)) {
      throw new ReaderError(`Die Kairos-Dateiversion ${version} wird nicht unterstützt (unterstützt: 2–5).`);
    }
    const { project } = readProjectRow(db, version);
    return project;
  } catch (error) {
    if (error instanceof ReaderError) throw error;
    throw corrupt(error);
  } finally {
    db.close();
  }
}

function readProjectRow(db: Database, version: number): { project: ProjectDto; defaultCalendarId: string | null } {
  const cols = columns(db, 'project');
  const row = rows(
    db,
    `SELECT name, ${col(cols, 'start_date')}, ${col(cols, 'finish_date')}, ${col(cols, 'status_date')}, ` +
      `hours_per_day, days_per_week, ${col(cols, 'default_calendar_id')}, ${col(cols, 'active_baseline_id')} ` +
      'FROM project LIMIT 1',
  )[0];
  if (!row) throw notKairos();
  return {
    project: {
      schemaVersion: version,
      name: String(row.name),
      startDate: text(row.start_date),
      finishDate: text(row.finish_date),
      statusDate: text(row.status_date),
      hoursPerDay: Number(row.hours_per_day),
      daysPerWeek: Number(row.days_per_week),
      tasks: [],
      dependencies: [],
      calendar: null,
      baselines: [],
      activeBaselineId: text(row.active_baseline_id),
    },
    defaultCalendarId: text(row.default_calendar_id),
  };
}
