# Kairos-Web-Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Kairos-Viewer läuft zusätzlich als statische Webseite. Der Nutzer öffnet eine `.kairos`-Datei im Browser, sie wird ausschließlich lokal mit sql.js gelesen und genauso dargestellt wie in der Desktop-App.

**Architecture:**
- **Gemeinsame Oberfläche:** `app.ts` arbeitet nur noch gegen eine schmale Plattform-Schnittstelle (`start`, `chooseFile`, `print`). Der heutige Tauri-Code wandert unverändert nach `platform/tauri.ts`.
- **Web-Seite:**
  - `platform/web.ts` nimmt Dateien über Dateiauswahl und Drag&Drop an.
  - `web/reader.ts` liest sie mit sql.js; das WebAssembly ist eingebettet.
- **Ein Reader-Verhalten:** Eine Referenzdatei (`demo-v2.expected.json`) bindet den Rust- und den TypeScript-Reader an dasselbe Ergebnis.
- **Datenschutz:** Strenge Sicherheits-Header mit `connect-src 'none'` erzwingen, dass nach dem Laden keine Netzwerkverbindung mehr möglich ist.

**Tech Stack:** TypeScript 5, Vite 6 (zweite Build-Konfiguration), Vitest 3 (jsdom und node), sql.js 1.14 (MIT) mit `@types/sql.js`, Rust (`serde_json` für die Referenzdatei), Node-Server ohne Abhängigkeiten für die lokale Vorschau.

**Spec:** `docs/superpowers/specs/2026-10-06-kairos-web-viewer-design.md` (ergänzt `docs/superpowers/specs/2026-10-06-kairos-viewer-design.md`)

## Global Constraints

- Die Projektdatei wird **nie** an einen Server übertragen. Kein `fetch`/XHR/WebSocket mit Dateiinhalten, keine Speicherung in `localStorage`, IndexedDB oder Cookies.
- CSP (Server-Header und `<meta>`): `default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`. `frame-ancestors` gilt nur im Header.
- sql.js 1.14, WebAssembly eingebettet über `sql.js/dist/sql-wasm.wasm?inline` und `initSqlJs({ wasmBinary })`. Keine `.wasm`-Datei in `dist-web/`.
- Höchstens 50 MB pro Datei. Nur Endung `.kairos`, Groß- und Kleinschreibung egal.
- Fehlermeldungen des Web-Readers sind **identisch** zu `reader.rs`:
  - „Die Datei ist keine Kairos-Projektdatei.“
  - „Die Kairos-Dateiversion X wird nicht unterstützt (unterstützt: 2–5).“
  - „Die Datei ist beschädigt: …“
- Weitere Meldungen der Web-Plattform:
  - „Nur .kairos-Dateien können geöffnet werden.“
  - „Die Datei ist größer als 50 MB.“
- Datenschutzhinweis im leeren Zustand: „Ihre Datei wird ausschließlich in Ihrem Browser verarbeitet und nicht übertragen.“
- Die Desktop-App verhält sich unverändert; ihr Bundle enthält kein sql.js, das Web-Bundle keinen Tauri-Code.
- Web-Build: `npm run build:web` erzeugt `dist-web/` mit `base: './'`. Lokale Vorschau: `npm run preview:web` auf `http://localhost:4173`.
- UI-Sprache ist Deutsch. Benutzertexte werden nur per `textContent` gesetzt.
- Öffentliches Repo:
  - Commits ohne `Claude-Session`-Zeile, Autor-E-Mail ist die noreply-Adresse (lokal konfiguriert).
  - Keine Kundennamen, keine `/Users/…`-Pfade und keine echten Projektdateien im Repo.

## Review Focus

- **Endung in Großbuchstaben** (`Plan.KAIROS`): wird angenommen. → Test in Task 6.
- **Dieselbe Datei zweimal hintereinander auswählen:** wird beide Male geladen, weil das Dateifeld zurückgesetzt wird. → Test in Task 6.
- **Datei über 50 MB:** wird abgelehnt, **bevor** sie gelesen wird. → Test in Task 6.
- **Abgeschnittene bzw. beschädigte Datei mit gültigem SQLite-Kopf:** Es kommt eine verständliche Meldung, kein Absturz. Die übergebenen Bytes bleiben unverändert. → Tests in Task 3 und Task 4.
- **Pfad-Traversal und andere HTTP-Methoden** gegen den Vorschau-Server: werden abgewiesen. → Test in Task 9.

---

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `src-tauri/tests/reader_tests.rs` (ergänzt) | Rust-Reader gegen die Referenzdatei |
| `tests/fixtures/demo-v2.expected.json` | Referenzausgabe für `demo-v2.kairos` (aus Rust erzeugt) |
| `src/web/sqlite.ts` | `createSqlJs(wasmBinary)`, `dataUrlToBytes(url)` |
| `src/web/sqlite-inline.ts` | Web-only: lädt sql.js einmalig mit eingebettetem WebAssembly |
| `src/web/reader.ts` | `readProject(bytes, sql)`, `ReaderError` |
| `src/platform/types.ts` | `Platform`, `PlatformCallbacks`, `LoadedFile` |
| `src/platform/tauri.ts` | Desktop-Plattform (bisheriger Tauri-Code aus `app.ts`) |
| `src/platform/web.ts` | Web-Plattform (Dateiauswahl, Drag&Drop, Prüfungen, Druck) |
| `src/app.ts` (geändert) | `startApp(root, platform, options)` ohne Tauri-Importe |
| `src/main.ts` (geändert) | Desktop-Einstieg |
| `src/web-main.ts` | Web-Einstieg |
| `src/vite-env.d.ts` | Vite-Typen (`?inline`) |
| `src/styles.css` (geändert) | Leerer Zustand zweizeilig |
| `src/web.css` | Fußzeile, Höhe des App-Bereichs im Web |
| `web/index.html`, `web/impressum.html`, `web/datenschutz.html`, `web/legal.css`, `web/public/favicon.png` | Web-Seiten |
| `vite.web.config.ts` | Web-Build nach `dist-web/` |
| `scripts/serve-web.mjs` | Lokale Vorschau mit Sicherheits-Headern |
| `deploy/nginx.conf.example`, `deploy/nginx-security-headers.conf`, `deploy/.htaccess.example` | Server-Konfiguration |
| `tests/helpers/sqljs.ts` | sql.js und Fixture-Bytes für Tests |
| `tests/web-sqlite.test.ts`, `tests/web-reader.test.ts`, `tests/platform-web.test.ts`, `tests/platform-tauri.test.ts`, `tests/serve-web.test.ts` | neue Tests |
| `tests/app.test.ts` (geändert) | gegen Test-Plattform |

---

### Task 1: Referenzdatei aus dem Rust-Reader

**Files:**
- Modify: `src-tauri/tests/reader_tests.rs` (Test anhängen)
- Create (generiert): `tests/fixtures/demo-v2.expected.json`

**Interfaces:**
- Produces: `tests/fixtures/demo-v2.expected.json` = `serde_json::to_string_pretty(read_project(demo-v2.kairos))` plus Zeilenumbruch. Wird in Task 4 vom TS-Reader konsumiert.

- [ ] **Step 1: Failing test anhängen** an `src-tauri/tests/reader_tests.rs`

```rust
/// Bindet Rust- und Web-Reader an dieselbe Ausgabe. Neu erzeugen: `UPDATE_GOLDEN=1 cargo test … demo_matches_golden_json`.
#[test]
fn demo_matches_golden_json() {
    let golden = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/demo-v2.expected.json");
    let actual = serde_json::to_value(read_project(&fixture("demo-v2.kairos")).unwrap()).unwrap();
    if std::env::var_os("UPDATE_GOLDEN").is_some() {
        std::fs::write(&golden, serde_json::to_string_pretty(&actual).unwrap() + "\n").unwrap();
    }
    let text = std::fs::read_to_string(&golden).expect("Referenzdatei fehlt – mit UPDATE_GOLDEN=1 erzeugen");
    let expected: serde_json::Value = serde_json::from_str(&text).unwrap();
    assert_eq!(actual, expected);
}
```

- [ ] **Step 2: Test laufen lassen – muss fehlschlagen**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --test reader_tests demo_matches_golden_json`
Expected: FAIL mit „Referenzdatei fehlt – mit UPDATE_GOLDEN=1 erzeugen“.

- [ ] **Step 3: Referenzdatei erzeugen**

Run: `UPDATE_GOLDEN=1 cargo test --manifest-path src-tauri/Cargo.toml --test reader_tests demo_matches_golden_json`
Expected: PASS; `tests/fixtures/demo-v2.expected.json` existiert.

- [ ] **Step 4: Inhalt prüfen und ohne Variable erneut laufen lassen**

Run: `head -20 tests/fixtures/demo-v2.expected.json && grep -c '"name"' tests/fixtures/demo-v2.expected.json && cargo test --manifest-path src-tauri/Cargo.toml`
Expected:
- Die Datei beginnt mit `"activeBaselineId"` bzw. den camelCase-Feldern (`serde_json` sortiert die Schlüssel alphabetisch).
- Sie enthält 9 Vorgänge und eine Baseline „Basisplan“.
- Keine Pfade, keine Namen außer den Demo-Vorgängen.
- Alle Rust-Tests PASS (7 Unit, 16 Reader).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/tests/reader_tests.rs tests/fixtures/demo-v2.expected.json
git commit -m "test(reader): Referenzausgabe für demo-v2.kairos als gemeinsame Basis für Rust- und Web-Reader

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: sql.js einbinden

**Files:**
- Modify: `package.json` (Abhängigkeiten), `tsconfig.json` (`esModuleInterop`, `allowJs`)
- Create: `src/web/sqlite.ts`, `src/vite-env.d.ts`, `tests/helpers/sqljs.ts`
- Test: `tests/web-sqlite.test.ts`

**Interfaces:**
- Produces:
  - `createSqlJs(wasmBinary: ArrayBuffer): Promise<SqlJsStatic>`
  - `dataUrlToBytes(dataUrl: string): Uint8Array`
  - Test-Helfer: `testSqlJs(): Promise<SqlJsStatic>` und `fixtureBytes(name: string): Uint8Array` (liest aus `src-tauri/tests/fixtures/`)

- [ ] **Step 1: Abhängigkeiten installieren und TS-Optionen ergänzen**

Run: `npm install sql.js@^1.14 && npm install -D @types/sql.js`

In `tsconfig.json` unter `compilerOptions` ergänzen:
```json
    "esModuleInterop": true,
    "allowJs": true,
```

`src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />
```

`tests/helpers/sqljs.ts`:
```ts
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { SqlJsStatic } from 'sql.js';
import { createSqlJs } from '../../src/web/sqlite';

const require = createRequire(import.meta.url);
let cached: Promise<SqlJsStatic> | null = null;

/** sql.js für Tests, mit dem WebAssembly aus node_modules (statt eingebettet). */
export function testSqlJs(): Promise<SqlJsStatic> {
  if (!cached) {
    const wasm = readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'));
    cached = createSqlJs(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer);
  }
  return cached;
}

/** Bytes einer Fixture aus src-tauri/tests/fixtures (Vitest läuft im Projektordner). */
export function fixtureBytes(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(process.cwd(), 'src-tauri/tests/fixtures', name)));
}
```

- [ ] **Step 2: Failing test `tests/web-sqlite.test.ts`**

```ts
// @vitest-environment node
import { expect, test } from 'vitest';
import { dataUrlToBytes } from '../src/web/sqlite';
import { fixtureBytes, testSqlJs } from './helpers/sqljs';

test('dataUrlToBytes dekodiert Base64-Data-URLs', () => {
  expect([...dataUrlToBytes('data:application/wasm;base64,AGFzbQ==')]).toEqual([0, 97, 115, 109]);
});

test('createSqlJs öffnet eine Kairos-Datei aus Bytes', async () => {
  const sql = await testSqlJs();
  const db = new sql.Database(fixtureBytes('demo-v2.kairos'));
  try {
    expect(db.exec('SELECT count(*) FROM task')[0].values[0][0]).toBe(9);
  } finally {
    db.close();
  }
});
```

- [ ] **Step 3: Test laufen lassen – muss fehlschlagen**

Run: `npm test -- tests/web-sqlite.test.ts`
Expected: FAIL – „Failed to resolve import ../src/web/sqlite“.

- [ ] **Step 4: `src/web/sqlite.ts` implementieren**

```ts
import initSqlJs, { type SqlJsStatic } from 'sql.js';

/** Initialisiert sql.js mit einem bereits vorhandenen WebAssembly-Modul – ohne Netzwerkzugriff. */
export function createSqlJs(wasmBinary: ArrayBuffer): Promise<SqlJsStatic> {
  return initSqlJs({ wasmBinary });
}

/** Dekodiert eine Base64-Data-URL (z. B. aus Vites `?inline`) in Bytes. */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
```

- [ ] **Step 5: Tests und Typprüfung**

Run: `npm test && npx tsc --noEmit`
Expected: alle Tests PASS (bisher 88 + 2), `tsc` ohne Fehler.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json src/web/sqlite.ts src/vite-env.d.ts tests/helpers/sqljs.ts tests/web-sqlite.test.ts
git commit -m "feat(web): sql.js mit vorab geladenem WebAssembly initialisieren

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Web-Reader – Prüfung und Fehlermeldungen

**Files:**
- Create: `src/web/reader.ts`
- Test: `tests/web-reader.test.ts`

**Interfaces:**
- Consumes: `testSqlJs`, `fixtureBytes` (Task 2); `ProjectDto` (`src/model.ts`).
- Produces:
  - `class ReaderError extends Error`
  - `readProject(bytes: Uint8Array, sql: SqlJsStatic): ProjectDto`
  - In diesem Task enthält das Ergebnis nur die Projektzeile; Task 4 ergänzt die Listen.
  - `MIN_SCHEMA_VERSION = 2`, `MAX_SCHEMA_VERSION = 5`

- [ ] **Step 1: Failing tests `tests/web-reader.test.ts`**

```ts
// @vitest-environment node
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
```

- [ ] **Step 2: Test laufen lassen – muss fehlschlagen**

Run: `npm test -- tests/web-reader.test.ts`
Expected: FAIL – „Failed to resolve import ../src/web/reader“.

- [ ] **Step 3: `src/web/reader.ts` implementieren (Prüfung und Projektzeile)**

```ts
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
```

- [ ] **Step 4: Tests laufen lassen – müssen bestehen**

Run: `npm test && npx tsc --noEmit`
Expected: alle PASS. Schlägt nur der Abschneide-Test fehl, die tatsächliche Meldung ansehen. Sie muss mit „Die Datei ist beschädigt: “ oder „Die Datei ist keine Kairos-Projektdatei.“ beginnen. Ein anderes Verhalten, etwa ein nicht abgefangener Fehler, ist ein Code-Fehler und wird mit superpowers:systematic-debugging gesucht.

- [ ] **Step 5: Commit**

```bash
git add src/web/reader.ts tests/web-reader.test.ts
git commit -m "feat(web): TypeScript-Reader prüft Format und Version wie der Rust-Reader

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Web-Reader – Daten lesen, deckungsgleich mit Rust

**Files:**
- Modify: `src/web/reader.ts`
- Test: `tests/web-reader.test.ts` (Tests anhängen)

**Interfaces:**
- Consumes: `tests/fixtures/demo-v2.expected.json` (Task 1).
- Produces: `readProject` liefert das vollständige `ProjectDto`, deep-equal zur Rust-Ausgabe.

- [ ] **Step 1: Failing tests anhängen**

Imports oben in `tests/web-reader.test.ts` ergänzen:
```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
```

Am Dateiende anhängen:
```ts
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
```

- [ ] **Step 2: Test laufen lassen – muss fehlschlagen**

Run: `npm test -- tests/web-reader.test.ts`
Expected: FAIL – u. a. Referenzvergleich (`tasks: []` statt 9 Einträge).

- [ ] **Step 3: Lesefunktionen in `src/web/reader.ts` ergänzen**

Import erweitern:
```ts
import type { BaselineDto, CalendarDto, DependencyDto, DependencyType, DisplayUnit, ProjectDto, TaskDto, TaskType } from '../model';
```

In `readProject` die Zeilen
```ts
    const { project } = readProjectRow(db, version);
    return project;
```
ersetzen durch:
```ts
    const { project, defaultCalendarId } = readProjectRow(db, version);
    project.tasks = readTasks(db);
    project.dependencies = readDependencies(db);
    project.calendar = defaultCalendarId === null ? null : readCalendar(db, defaultCalendarId);
    project.baselines = readBaselines(db);
    return project;
```

Am Dateiende ergänzen:
```ts
const num = (value: SqlValue | undefined): number | null => (value === null || value === undefined ? null : Number(value));
const flag = (value: SqlValue | undefined): boolean => value !== null && value !== undefined && Number(value) !== 0;

function readTasks(db: Database): TaskDto[] {
  const cols = columns(db, 'task');
  const optional = ['deadline', 'early_start', 'early_finish', 'total_float', 'free_float', 'is_critical', 'deadline_missed', 'fixed_finish'];
  const select =
    `SELECT id, ${col(cols, 'parent_id')}, order_index, name, type, duration_minutes, display_unit, percent_complete, ` +
    `${optional.map((name) => col(cols, name)).join(', ')} FROM task ORDER BY rowid`;
  return rows(db, select).map((r) => ({
    id: String(r.id),
    parentId: text(r.parent_id),
    orderIndex: Number(r.order_index),
    name: String(r.name),
    type: String(r.type) as TaskType,
    durationMinutes: Number(r.duration_minutes),
    displayUnit: String(r.display_unit) as DisplayUnit,
    percentComplete: Number(r.percent_complete),
    deadline: text(r.deadline),
    earlyStart: text(r.early_start),
    earlyFinish: text(r.early_finish),
    totalFloat: num(r.total_float),
    freeFloat: num(r.free_float),
    isCritical: flag(r.is_critical),
    deadlineMissed: flag(r.deadline_missed),
    fixedFinish: text(r.fixed_finish),
  }));
}

function readDependencies(db: Database): DependencyDto[] {
  return rows(db, 'SELECT predecessor_id, successor_id, type, lag_minutes FROM dependency ORDER BY rowid').map((r) => ({
    predecessorId: String(r.predecessor_id),
    successorId: String(r.successor_id),
    type: String(r.type) as DependencyType,
    lagMinutes: Number(r.lag_minutes),
  }));
}

function readCalendar(db: Database, calendarId: string): CalendarDto | null {
  if (columns(db, 'calendar_workweek').size === 0) return null;
  const workweek = rows(
    db,
    'SELECT weekday, is_working FROM calendar_workweek WHERE calendar_id = ? ORDER BY weekday',
    [calendarId],
  ).map((r) => ({ weekday: Number(r.weekday), isWorking: flag(r.is_working) }));
  const exceptions =
    columns(db, 'calendar_exception').size === 0
      ? []
      : rows(db, 'SELECT date, is_working FROM calendar_exception WHERE calendar_id = ? ORDER BY date', [calendarId]).map(
          (r) => ({ date: String(r.date), isWorking: flag(r.is_working) }),
        );
  return { workweek, exceptions };
}

function readBaselines(db: Database): BaselineDto[] {
  const baselineCols = columns(db, 'baseline');
  if (baselineCols.size === 0 || columns(db, 'baseline_task').size === 0) return [];
  const order = baselineCols.has('captured_at') ? 'captured_at, rowid' : 'rowid';
  return rows(db, `SELECT id, name FROM baseline ORDER BY ${order}`).map((head) => ({
    id: String(head.id),
    name: String(head.name),
    tasks: rows(db, 'SELECT task_id, start, finish FROM baseline_task WHERE baseline_id = ? ORDER BY rowid', [
      String(head.id),
    ]).map((r) => ({ taskId: String(r.task_id), start: text(r.start), finish: text(r.finish) })),
  }));
}
```

- [ ] **Step 4: Tests laufen lassen – müssen bestehen**

Run: `npm test && npx tsc --noEmit`
Expected: alle PASS, insbesondere „deckungsgleich mit dem Rust-Reader“.

- [ ] **Step 5: Commit**

```bash
git add src/web/reader.ts tests/web-reader.test.ts
git commit -m "feat(web): TypeScript-Reader liest Vorgänge, Abhängigkeiten, Kalender und Baselines deckungsgleich mit Rust

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Plattform-Schnittstelle, Desktop-Plattform, `app.ts` entkoppeln

**Files:**
- Create: `src/platform/types.ts`, `src/platform/tauri.ts`
- Modify: `src/app.ts` (komplett ersetzen), `src/main.ts`, `src/styles.css`
- Modify: `tests/app.test.ts` (komplett ersetzen)
- Test: `tests/platform-tauri.test.ts`

**Interfaces:**
- Produces:
  - `interface LoadedFile { project: ProjectDto; fileName: string }`. `fileName` ist der Dateiname oder ein Pfad; `loadProject` nimmt den letzten Bestandteil.
  - `interface PlatformCallbacks { loaded(file: LoadedFile): void; failed(message: string): void }`
  - `interface Platform { start(callbacks: PlatformCallbacks): void; chooseFile(): Promise<void>; print(): Promise<void> }`
  - `tauriPlatform(): Platform`
  - `startApp(root: HTMLElement, platform: Platform, options?: StartOptions)` mit `interface StartOptions { privacyNote?: string }`

- [ ] **Step 1: `src/platform/types.ts` anlegen**

```ts
import type { ProjectDto } from '../model';

export interface LoadedFile {
  project: ProjectDto;
  /** Dateiname oder Pfad; für den Titel wird der letzte Pfadbestandteil verwendet. */
  fileName: string;
}

export interface PlatformCallbacks {
  loaded(file: LoadedFile): void;
  failed(message: string): void;
}

/** Alles, was zwischen Desktop (Tauri) und Web verschieden ist. */
export interface Platform {
  /** Registriert Drag&Drop und externe Dateiübergaben; Ergebnisse kommen über die Callbacks. */
  start(callbacks: PlatformCallbacks): void;
  /** Öffnet die Dateiauswahl; das Ergebnis kommt über die Callbacks. */
  chooseFile(): Promise<void>;
  /** Druckt die Seite (Druckseiten hat app.ts vorher erzeugt). */
  print(): Promise<void>;
}
```

- [ ] **Step 2: Failing tests schreiben**

`tests/app.test.ts` komplett ersetzen:
```ts
import { expect, test } from 'vitest';
import { startApp } from '../src/app';
import type { ProjectDto } from '../src/model';
import type { Platform, PlatformCallbacks } from '../src/platform/types';
import { demoProject, task } from './fixtures/demo';

/** Test-Plattform: Dateien werden direkt über die Callbacks „geöffnet“. */
function fakePlatform() {
  let callbacks: PlatformCallbacks | null = null;
  const fake = {
    printCalls: 0,
    chooseCalls: 0,
    open(project: ProjectDto, fileName = '/x/demo.kairos') {
      callbacks!.loaded({ project, fileName });
    },
    fail(message: string) {
      callbacks!.failed(message);
    },
    platform: {
      start(cb: PlatformCallbacks) {
        callbacks = cb;
      },
      async chooseFile() {
        fake.chooseCalls += 1;
      },
      async print() {
        fake.printCalls += 1;
      },
    } satisfies Platform,
  };
  return fake;
}

function setup(options = {}) {
  const fake = fakePlatform();
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  startApp(root, fake.platform, options);
  return { root, fake };
}

test('Kopfzeilen liegen in ihren Scrollbereichen und scrollen dadurch horizontal mit', () => {
  const { root, fake } = setup();
  fake.open(demoProject());
  expect(root.querySelectorAll('.table-rows .row')).toHaveLength(9);
  expect(root.querySelector('.table-scroll .header-row')).not.toBeNull();
  expect(root.querySelector('.gantt-scroll svg.gantt-axis')).not.toBeNull();
});

test('Neu-Rendern (Zoom) behält Kopfzeilen und Zeilen', () => {
  const { root, fake } = setup();
  fake.open(demoProject());
  (root.querySelector('[data-zoom="day"]') as HTMLButtonElement).click();
  expect(root.querySelectorAll('.table-scroll .header-row')).toHaveLength(1);
  expect(root.querySelectorAll('.gantt-scroll svg.gantt-axis')).toHaveLength(1);
  expect(root.querySelectorAll('.gantt-scroll svg.gantt-body')).toHaveLength(1);
  expect(root.querySelectorAll('.table-rows .row')).toHaveLength(9);
});

test('Titel aus dem Dateinamen, Öffnen-Knopf fragt die Plattform', () => {
  const { root, fake } = setup();
  fake.open(demoProject(), 'C:\\Daten\\Plan A.kairos');
  expect(root.querySelector('.title')?.textContent).toBe('Plan A');
  (root.querySelector('[data-action="open"]') as HTMLButtonElement).click();
  expect(fake.chooseCalls).toBe(1);
});

test('Drucken teilt lange Projekte in Seiten mit eigenen Kopfzeilen', async () => {
  const { root, fake } = setup();
  fake.open({
    ...demoProject(),
    tasks: Array.from({ length: 100 }, (_, i) =>
      task({ id: `t${i}`, name: `T${i}`, orderIndex: i, earlyStart: '2026-06-25T08:00', earlyFinish: '2026-06-26T08:00' }),
    ),
    dependencies: [],
  });
  (root.querySelector('[data-action="print"]') as HTMLButtonElement).click();
  await Promise.resolve();
  expect(fake.printCalls).toBe(1);
  const pages = [...root.querySelectorAll('.print-pages .print-page')];
  expect(pages.map((p) => p.querySelectorAll('.row').length)).toEqual([41, 41, 18]);
  for (const page of pages) {
    expect(page.querySelectorAll('.header-row')).toHaveLength(1);
    expect(page.querySelectorAll('svg.gantt-axis')).toHaveLength(1);
    expect(page.querySelectorAll('svg.gantt-body')).toHaveLength(1);
  }
});

test('Fehlermeldung bleibt bis zum nächsten erfolgreichen Öffnen stehen', () => {
  const { root, fake } = setup();
  fake.open(demoProject());
  const banner = root.querySelector('.banner') as HTMLElement;
  fake.fail('Die Datei ist keine Kairos-Projektdatei.');
  expect(banner.hidden).toBe(false);
  expect(banner.textContent).toBe('Die Datei ist keine Kairos-Projektdatei.');
  (root.querySelector('[data-zoom="day"]') as HTMLButtonElement).click();
  expect(banner.hidden).toBe(false);
  expect(banner.className).toBe('banner error');
  fake.open(demoProject());
  expect(banner.hidden).toBe(true);
});

test('Datenschutzhinweis im leeren Zustand, wenn übergeben', () => {
  const note = 'Ihre Datei wird ausschließlich in Ihrem Browser verarbeitet und nicht übertragen.';
  const withNote = setup({ privacyNote: note }).root.querySelector('.empty-note') as HTMLElement;
  expect(withNote.hidden).toBe(false);
  expect(withNote.textContent).toBe(note);
  expect((setup().root.querySelector('.empty-note') as HTMLElement).hidden).toBe(true);
});
```

`tests/platform-tauri.test.ts`:
```ts
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { emit } from '@tauri-apps/api/event';
import { expect, test, vi } from 'vitest';
import { tauriPlatform } from '../src/platform/tauri';
import { demoProject } from './fixtures/demo';

test('Startdatei, Dateien per Event und Fehler werden über die Callbacks gemeldet; Drucken ruft print_window', async () => {
  const calls: string[] = [];
  mockWindows('main');
  mockIPC(
    (cmd, args) => {
      calls.push(cmd);
      if (cmd === 'initial_file') return '/x/start.kairos';
      if (cmd === 'open_project') {
        if ((args as { path: string }).path.includes('kaputt')) throw 'Die Datei ist keine Kairos-Projektdatei.';
        return demoProject();
      }
      return null;
    },
    { shouldMockEvents: true },
  );
  const loaded = vi.fn();
  const failed = vi.fn();
  const platform = tauriPlatform();
  platform.start({ loaded, failed });

  await vi.waitFor(() => expect(loaded).toHaveBeenCalledWith({ project: demoProject(), fileName: '/x/start.kairos' }));
  await emit('open-file', '/x/kaputt.kairos');
  await vi.waitFor(() => expect(failed).toHaveBeenCalledWith('Die Datei ist keine Kairos-Projektdatei.'));
  await platform.print();
  expect(calls).toContain('print_window');
});
```

- [ ] **Step 3: Tests laufen lassen – müssen fehlschlagen**

Run: `npm test -- tests/app.test.ts tests/platform-tauri.test.ts`
Expected: FAIL. `platform-tauri` scheitert an „Failed to resolve import ../src/platform/tauri“. Die App-Tests scheitern, weil `startApp` noch Tauri-Aufrufe macht und keine Plattform nutzt; die Zeilen erscheinen dort nicht über `fake.open`.

- [ ] **Step 4: `src/platform/tauri.ts` anlegen**

```ts
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { open } from '@tauri-apps/plugin-dialog';
import type { ProjectDto } from '../model';
import type { Platform, PlatformCallbacks } from './types';

/** Desktop: Lesen per Rust-Command, Dateiübergabe per Drag&Drop, Startargument und macOS „Opened“. */
export function tauriPlatform(): Platform {
  let callbacks: PlatformCallbacks | null = null;

  async function openPath(path: string): Promise<void> {
    if (!callbacks) return;
    try {
      const project = await invoke<ProjectDto>('open_project', { path });
      callbacks.loaded({ project, fileName: path });
    } catch (error) {
      callbacks.failed(String(error));
    }
  }

  return {
    start(cb) {
      callbacks = cb;
      void getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type !== 'drop') return;
        const path = event.payload.paths.find((p) => p.toLowerCase().endsWith('.kairos'));
        if (path) void openPath(path);
        else cb.failed('Nur .kairos-Dateien können geöffnet werden.');
      });
      void listen<string>('open-file', (event) => void openPath(event.payload)).then(async () => {
        const initial = await invoke<string | null>('initial_file');
        if (initial) await openPath(initial);
      });
    },
    async chooseFile() {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: 'Kairos-Projekt', extensions: ['kairos'] }],
      });
      if (typeof selected === 'string') await openPath(selected);
    },
    async print() {
      await invoke('print_window');
    },
  };
}
```

- [ ] **Step 5: `src/app.ts` umbauen**

Folgende Änderungen, sonst bleibt die Datei unverändert:

a) Die vier Tauri-Imports (Zeilen 1–4) ersetzen durch:
```ts
import type { LoadedFile, Platform } from './platform/types';
```

b) In `LAYOUT` die Zeile
```html
<div class="empty">Kairos-Datei öffnen oder hierher ziehen</div>
```
ersetzen durch:
```html
<div class="empty">
  <p class="empty-title">Kairos-Datei öffnen oder hierher ziehen</p>
  <p class="empty-note" hidden></p>
</div>
```

c) Signatur und Optionen:
```ts
export interface StartOptions {
  /** Zusatzzeile im leeren Zustand (Web: Datenschutzhinweis). */
  privacyNote?: string;
}

export function startApp(root: HTMLElement, platform: Platform, options: StartOptions = {}): void {
```
Direkt nach den `q<…>`-Konstanten einfügen:
```ts
  if (options.privacyNote) {
    const note = q<HTMLParagraphElement>('.empty-note');
    note.textContent = options.privacyNote;
    note.hidden = false;
  }
```

d) Die Funktionen `openPath` und `chooseFile` ersetzen durch:
```ts
  function showLoaded({ project, fileName }: LoadedFile): void {
    state = loadProject(state, project, fileName);
    errorMessage = null;
    ganttScroll.scrollTop = 0;
    ganttScroll.scrollLeft = 0;
    render();
  }
```

e) In `printProject` die Zeile `await invoke('print_window');` ersetzen durch `await platform.print();`.

f) Den Öffnen-Knopf ändern zu:
```ts
  q<HTMLButtonElement>('[data-action="open"]').addEventListener('click', () => void platform.chooseFile());
```

g) Den Block „Dateien von außen: Drag&Drop, macOS-Dateiöffnung, Startargument“ (`getCurrentWebview()…` und `listen…`) ersetzen durch:
```ts
  // Dateien kommen über die Plattform: Dialog, Drag&Drop, Startargument (Desktop) bzw. Dateiauswahl (Web).
  platform.start({ loaded: showLoaded, failed: showError });
```

`src/main.ts` ersetzen durch:
```ts
import './styles.css';
import './print.css';
import { startApp } from './app';
import { tauriPlatform } from './platform/tauri';

startApp(document.getElementById('app')!, tauriPlatform());
```

In `src/styles.css` die Zeile
```css
.empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: 16px; }
```
ersetzen durch:
```css
.empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: var(--muted); font-size: 16px; text-align: center; padding: 0 16px; }
.empty p { margin: 0; }
.empty-note { font-size: 13px; max-width: 520px; }
```

- [ ] **Step 6: Tests, Typprüfung, Desktop-Build**

Run: `npm test && npm run build && grep -c "__TAURI" dist/assets/*.js`
Expected: alle Tests PASS, `tsc` und Vite ohne Fehler. Das Desktop-Bundle enthält weiterhin Tauri-Code (Zahl ≥ 1).

- [ ] **Step 7: Desktop-App kurz starten**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`, dann `npm run dev` im Hintergrund und `src-tauri/target/debug/kairos-viewer "$PWD/src-tauri/tests/fixtures/demo-v2.kairos"`. Nach 3 Sekunden prüfen, ob der Prozess läuft (`pgrep -f target/debug/kairos-viewer`), dann App und Vite beenden.
Expected: Die App startet. Ist der Bildschirm entsperrt, zeigt ein Screenshot (`screencapture -x`) die 9 Zeilen der Demo-Datei.

- [ ] **Step 8: Commit**

```bash
git add src/platform src/app.ts src/main.ts src/styles.css tests/app.test.ts tests/platform-tauri.test.ts
git commit -m "refactor(app): Plattform-Schnittstelle, Tauri-Code nach platform/tauri.ts

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Web-Plattform

**Files:**
- Create: `src/platform/web.ts`
- Test: `tests/platform-web.test.ts`

**Interfaces:**
- Consumes: `Platform`, `PlatformCallbacks` (Task 5).
- Produces:
  - `MAX_FILE_BYTES = 50 * 1024 * 1024`
  - `interface WebPlatformDeps { readProject(bytes: Uint8Array): Promise<ProjectDto>; print?: () => void }`
  - `webPlatform(deps: WebPlatformDeps): Platform`

- [ ] **Step 1: Failing tests `tests/platform-web.test.ts`**

```ts
import { beforeEach, expect, test, vi } from 'vitest';
import type { ProjectDto } from '../src/model';
import { MAX_FILE_BYTES, webPlatform } from '../src/platform/web';
import { demoProject } from './fixtures/demo';

function file(name: string, size?: number): File {
  const f = new File([new Uint8Array([1, 2, 3])], name);
  if (size !== undefined) Object.defineProperty(f, 'size', { value: size });
  return f;
}

function setup(readProject = vi.fn(async (): Promise<ProjectDto> => demoProject())) {
  document.body.replaceChildren();
  const loaded = vi.fn();
  const failed = vi.fn();
  const print = vi.fn();
  const platform = webPlatform({ readProject, print });
  platform.start({ loaded, failed });
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const choose = (f: File) => {
    Object.defineProperty(input, 'files', { value: [f], configurable: true });
    input.dispatchEvent(new Event('change'));
  };
  const drop = (files: File[]) => {
    const event = Object.assign(new Event('drop', { cancelable: true }), { dataTransfer: { files } });
    window.dispatchEvent(event);
    return event;
  };
  return { platform, input, loaded, failed, print, readProject, choose, drop };
}

beforeEach(() => vi.restoreAllMocks());

test('verstecktes Dateifeld nur für .kairos', () => {
  const { input } = setup();
  expect(input.accept).toBe('.kairos');
  expect(input.hidden).toBe(true);
});

test('ausgewählte Datei wird gelesen und mit Dateinamen gemeldet', async () => {
  const { choose, loaded, readProject } = setup();
  choose(file('Plan.KAIROS'));
  await vi.waitFor(() => expect(loaded).toHaveBeenCalledWith({ project: demoProject(), fileName: 'Plan.KAIROS' }));
  expect([...(readProject.mock.calls[0][0] as Uint8Array)]).toEqual([1, 2, 3]);
});

test('dieselbe Datei zweimal hintereinander wird zweimal gelesen', async () => {
  const { choose, loaded, input } = setup();
  choose(file('a.kairos'));
  await vi.waitFor(() => expect(loaded).toHaveBeenCalledTimes(1));
  expect(input.value).toBe('');
  choose(file('a.kairos'));
  await vi.waitFor(() => expect(loaded).toHaveBeenCalledTimes(2));
});

test('falsche Endung und zu große Dateien werden abgelehnt, ohne sie zu lesen', async () => {
  const { choose, failed, readProject } = setup();
  choose(file('notiz.txt'));
  choose(file('riesig.kairos', MAX_FILE_BYTES + 1));
  await vi.waitFor(() => expect(failed).toHaveBeenCalledTimes(2));
  expect(failed.mock.calls).toEqual([['Nur .kairos-Dateien können geöffnet werden.'], ['Die Datei ist größer als 50 MB.']]);
  expect(readProject).not.toHaveBeenCalled();
});

test('Lesefehler wird mit seiner Meldung gemeldet', async () => {
  const { choose, failed } = setup(vi.fn(async () => {
    throw new Error('Die Datei ist keine Kairos-Projektdatei.');
  }));
  choose(file('x.kairos'));
  await vi.waitFor(() => expect(failed).toHaveBeenCalledWith('Die Datei ist keine Kairos-Projektdatei.'));
});

test('Drag&Drop: verhindert das Öffnen durch den Browser, nimmt die erste .kairos-Datei, ignoriert leere Drops', async () => {
  const { drop, loaded, failed } = setup();
  expect(drop([]).defaultPrevented).toBe(true);
  drop([file('bild.png'), file('plan.kairos')]);
  await vi.waitFor(() => expect(loaded).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'plan.kairos' })));
  expect(failed).not.toHaveBeenCalled();
});

test('chooseFile öffnet die Dateiauswahl, print druckt', async () => {
  const { platform, input, print } = setup();
  const click = vi.spyOn(input, 'click');
  await platform.chooseFile();
  expect(click).toHaveBeenCalledTimes(1);
  await platform.print();
  expect(print).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Test laufen lassen – muss fehlschlagen**

Run: `npm test -- tests/platform-web.test.ts`
Expected: FAIL – „Failed to resolve import ../src/platform/web“.

- [ ] **Step 3: `src/platform/web.ts` implementieren**

```ts
import type { ProjectDto } from '../model';
import type { Platform, PlatformCallbacks } from './types';

export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export interface WebPlatformDeps {
  /** Liest die Bytes einer .kairos-Datei (Web: sql.js im Browser). */
  readProject(bytes: Uint8Array): Promise<ProjectDto>;
  /** Druckfunktion; Standard ist window.print. */
  print?: () => void;
}

const isKairos = (name: string) => name.toLowerCase().endsWith('.kairos');

function readBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('Die Datei konnte nicht gelesen werden.'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Web: Die Datei wird ausschließlich im Browser gelesen – keine Übertragung, keine Speicherung.
 * Nach dem Lesen hält die Plattform keine Referenz auf Datei oder Bytes.
 */
export function webPlatform(deps: WebPlatformDeps): Platform {
  let callbacks: PlatformCallbacks | null = null;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.kairos';
  input.hidden = true;

  async function openFile(file: File): Promise<void> {
    if (!callbacks) return;
    if (!isKairos(file.name)) return callbacks.failed('Nur .kairos-Dateien können geöffnet werden.');
    if (file.size > MAX_FILE_BYTES) return callbacks.failed('Die Datei ist größer als 50 MB.');
    try {
      const project = await deps.readProject(await readBytes(file));
      callbacks.loaded({ project, fileName: file.name });
    } catch (error) {
      callbacks.failed(error instanceof Error ? error.message : String(error));
    }
  }

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    // Zurücksetzen, damit dieselbe Datei erneut ausgewählt werden kann.
    input.value = '';
    if (file) void openFile(file);
  });

  return {
    start(cb) {
      callbacks = cb;
      document.body.appendChild(input);
      // Ohne preventDefault würde der Browser die Datei selbst öffnen bzw. herunterladen.
      window.addEventListener('dragover', (event) => event.preventDefault());
      window.addEventListener('drop', (event) => {
        event.preventDefault();
        const files = [...((event as DragEvent).dataTransfer?.files ?? [])];
        if (files.length === 0) return;
        void openFile(files.find((f) => isKairos(f.name)) ?? files[0]);
      });
    },
    async chooseFile() {
      input.click();
    },
    async print() {
      (deps.print ?? (() => window.print()))();
    },
  };
}
```

- [ ] **Step 4: Tests laufen lassen – müssen bestehen**

Run: `npm test && npx tsc --noEmit`
Expected: alle PASS.

- [ ] **Step 5: Commit**

```bash
git add src/platform/web.ts tests/platform-web.test.ts
git commit -m "feat(web): Web-Plattform mit Dateiauswahl, Drag&Drop, Endungs- und Größenprüfung

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Web-Einstieg und Web-Build

**Files:**
- Create: `src/web/sqlite-inline.ts`, `src/web-main.ts`, `src/web.css`, `web/index.html`, `web/public/favicon.png` (Kopie), `vite.web.config.ts`
- Modify: `package.json` (Skripte), `.gitignore`

**Interfaces:**
- Consumes: `createSqlJs`, `dataUrlToBytes` (Task 2), `readProject` (Task 4), `webPlatform` (Task 6), `startApp(…, { privacyNote })` (Task 5).
- Produces: `loadSqlJs(): Promise<SqlJsStatic>` (Web-only), `npm run build:web` → `dist-web/`.

- [ ] **Step 1: Dateien anlegen**

`src/web/sqlite-inline.ts`:
```ts
import type { SqlJsStatic } from 'sql.js';
// Das WebAssembly wird als Data-URL ins Bundle eingebettet: kein Nachladen, daher CSP connect-src 'none' möglich.
import wasmDataUrl from 'sql.js/dist/sql-wasm.wasm?inline';
import { createSqlJs, dataUrlToBytes } from './sqlite';

let loading: Promise<SqlJsStatic> | null = null;

/** sql.js einmalig initialisieren (beim ersten Öffnen einer Datei). */
export function loadSqlJs(): Promise<SqlJsStatic> {
  loading ??= createSqlJs(dataUrlToBytes(wasmDataUrl).buffer as ArrayBuffer);
  return loading;
}
```

`src/web-main.ts`:
```ts
import './styles.css';
import './print.css';
import './web.css';
import { startApp } from './app';
import { webPlatform } from './platform/web';
import { readProject } from './web/reader';
import { loadSqlJs } from './web/sqlite-inline';

startApp(
  document.getElementById('app')!,
  webPlatform({ readProject: async (bytes) => readProject(bytes, await loadSqlJs()) }),
  { privacyNote: 'Ihre Datei wird ausschließlich in Ihrem Browser verarbeitet und nicht übertragen.' },
);
```

`src/web.css`:
```css
/* Web: App-Bereich plus Fußzeile mit Impressum/Datenschutz. */
body { display: flex; flex-direction: column; }
#app { flex: 1; height: auto; min-height: 0; }
.site-footer { flex: none; display: flex; gap: 16px; justify-content: flex-end; padding: 4px 10px; font-size: 12px; border-top: 1px solid var(--line); background: var(--head); }
.site-footer a { color: var(--muted); }
@media print { .site-footer { display: none; } }
```

`web/index.html` (die CSP folgt in Task 9, die Fußzeilen-Ziele in Task 8):
```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="referrer" content="no-referrer" />
    <title>Kairos Viewer</title>
    <link rel="icon" type="image/png" href="./favicon.png" />
  </head>
  <body>
    <div id="app"></div>
    <footer class="site-footer">
      <a href="./impressum.html">Impressum</a>
      <a href="./datenschutz.html">Datenschutz</a>
    </footer>
    <script type="module" src="../src/web-main.ts"></script>
  </body>
</html>
```

`vite.web.config.ts`:
```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const project = fileURLToPath(new URL('.', import.meta.url));
const web = fileURLToPath(new URL('./web/', import.meta.url));

// Web-Build: statische Seite in dist-web/, relativ verlinkt (läuft auch in einem Unterverzeichnis).
export default defineConfig({
  root: web,
  base: './',
  server: { port: 1430, strictPort: true, fs: { allow: [project] } },
  build: {
    outDir: fileURLToPath(new URL('./dist-web/', import.meta.url)),
    emptyOutDir: true,
    target: 'es2021',
    rollupOptions: {
      input: { index: `${web}index.html` },
    },
  },
});
```

Skripte in `package.json` ergänzen:
```json
    "build:web": "tsc --noEmit && vite build --config vite.web.config.ts",
    "dev:web": "vite --config vite.web.config.ts",
```

`.gitignore`: Zeile `dist-web/` unter `dist/` ergänzen.

Favicon: `mkdir -p web/public && cp src-tauri/icons/128x128.png web/public/favicon.png`

- [ ] **Step 2: Web-Build ausführen und Bundles prüfen**

Run:
```bash
npm run build:web && ls dist-web dist-web/assets && \
  ls dist-web/assets/*.wasm 2>/dev/null | wc -l && \
  grep -l "data:application/wasm;base64" dist-web/assets/*.js | wc -l && \
  grep -l "__TAURI" dist-web/assets/*.js | wc -l
```
Expected:
- `dist-web/` enthält `index.html`, `favicon.png` und `assets/`.
- 0 `.wasm`-Dateien.
- 1 JS-Datei mit eingebettetem WebAssembly.
- 0 Dateien mit Tauri-Code.

Ist doch eine `.wasm`-Datei entstanden oder fehlt die Data-URL, hat Vite `?inline` für `.wasm` nicht angewendet. Das ist ein Plan-Fehler. Ruling: In `vite.web.config.ts` `build.assetsInlineLimit: () => true` setzen und erneut prüfen. Den Befund im Ledger festhalten.

- [ ] **Step 3: Desktop-Bundle enthält kein sql.js**

Run: `npm run build && grep -l "wasmBinary\|data:application/wasm" dist/assets/*.js | wc -l`
Expected: 0.

- [ ] **Step 4: Web-Seite im Dev-Server testen (Chrome DevTools MCP)**

`npm run dev:web` im Hintergrund starten und `http://localhost:1430/` öffnen. Die Demo-Datei kommt über `upload_file` auf das versteckte Dateifeld: Der Uid kommt aus `take_snapshot`; alternativ das Feld per `evaluate_script` kurz sichtbar machen.
Expected:
- Der leere Zustand zeigt beide Zeilen inklusive Datenschutzhinweis.
- Nach dem Öffnen von `src-tauri/tests/fixtures/demo-v2.kairos` erscheinen 9 Zeilen und das Gantt wie in der Desktop-App.
- Die Fußzeile ist sichtbar.

Danach den Dev-Server beenden.

- [ ] **Step 5: Tests und Commit**

Run: `npm test`
Expected: alle PASS.

```bash
git add src/web/sqlite-inline.ts src/web-main.ts src/web.css web/index.html web/public/favicon.png vite.web.config.ts package.json .gitignore
git commit -m "feat(web): Web-Einstieg und statischer Build nach dist-web mit eingebettetem sql.js

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Impressum und Datenschutz

**Files:**
- Create: `web/impressum.html`, `web/datenschutz.html`, `web/legal.css`
- Modify: `vite.web.config.ts` (zusätzliche Eingänge)

- [ ] **Step 1: Seiten anlegen**

`web/legal.css`:
```css
:root { color-scheme: light dark; font: 15px/1.55 -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; }
body { max-width: 760px; margin: 0 auto; padding: 24px 16px 48px; }
h1 { font-size: 1.6rem; } h2 { font-size: 1.15rem; margin-top: 1.8em; }
.placeholder { background: #fff3c4; color: #5c4800; padding: 0 3px; border-radius: 3px; }
.draft { border: 2px solid #c98a00; padding: 8px 12px; border-radius: 6px; }
a { color: #2f6fd6; }
```

`web/impressum.html`:
```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="referrer" content="no-referrer" />
    <title>Impressum – Kairos Viewer</title>
    <link rel="icon" type="image/png" href="./favicon.png" />
    <link rel="stylesheet" href="./legal.css" />
  </head>
  <body>
    <!-- PLATZHALTER ersetzen; vor Veröffentlichung rechtlich prüfen. -->
    <p><a href="./index.html">← Zurück zum Kairos Viewer</a></p>
    <h1>Impressum</h1>
    <p>Angaben gemäß § 5 Digitale-Dienste-Gesetz (DDG)</p>
    <p>
      <span class="placeholder">[PLATZHALTER: Vor- und Nachname bzw. Firma]</span><br />
      <span class="placeholder">[PLATZHALTER: Straße und Hausnummer]</span><br />
      <span class="placeholder">[PLATZHALTER: PLZ und Ort]</span>
    </p>
    <h2>Kontakt</h2>
    <p>E-Mail: <span class="placeholder">[PLATZHALTER: E-Mail-Adresse]</span></p>
    <h2>Verantwortlich für den Inhalt</h2>
    <p><span class="placeholder">[PLATZHALTER: Name, Anschrift – falls abweichend]</span></p>
  </body>
</html>
```

`web/datenschutz.html`:
```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="referrer" content="no-referrer" />
    <title>Datenschutz – Kairos Viewer</title>
    <link rel="icon" type="image/png" href="./favicon.png" />
    <link rel="stylesheet" href="./legal.css" />
  </head>
  <body>
    <!-- Entwurf passend zur Technik des Kairos Viewers. PLATZHALTER ersetzen und vor Veröffentlichung rechtlich prüfen. -->
    <p><a href="./index.html">← Zurück zum Kairos Viewer</a></p>
    <h1>Datenschutzerklärung</h1>
    <p class="draft">Entwurf – vor Veröffentlichung rechtlich prüfen und Platzhalter ersetzen.</p>

    <h2>1. Verantwortlicher</h2>
    <p>
      <span class="placeholder">[PLATZHALTER: Name bzw. Firma, Anschrift]</span><br />
      E-Mail: <span class="placeholder">[PLATZHALTER: E-Mail-Adresse]</span>
    </p>

    <h2>2. Ihre Projektdateien verlassen Ihren Computer nicht</h2>
    <p>
      Der Kairos Viewer liest die von Ihnen ausgewählte Datei ausschließlich in Ihrem Browser. Die Datei und ihre Inhalte
      werden <strong>nicht</strong> an unseren Server oder an Dritte übertragen und nicht gespeichert – weder dauerhaft noch
      vorübergehend. Nach dem Schließen oder Neuladen der Seite sind die Daten aus dem Arbeitsspeicher Ihres Browsers entfernt.
      Technisch ist der Seite durch eine Sicherheitsrichtlinie (Content Security Policy) jede Netzwerkverbindung nach dem Laden
      untersagt.
    </p>

    <h2>3. Aufruf der Webseite (Server-Logfiles)</h2>
    <p>
      Beim Aufruf der Seite verarbeitet der Webserver technisch notwendige Daten, die Ihr Browser übermittelt: IP-Adresse
      (gekürzt gespeichert), Datum und Uhrzeit, aufgerufene Datei, Statuscode und übertragene Datenmenge. Zweck ist die
      Auslieferung und der sichere Betrieb der Seite. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse am
      sicheren Betrieb). Die Logdateien werden nach <span class="placeholder">[PLATZHALTER: z. B. 7 Tagen]</span> gelöscht.
      Hoster: <span class="placeholder">[PLATZHALTER: Name und Anschrift des Hosters bzw. „eigener Server“]</span>.
    </p>

    <h2>4. Keine Cookies, kein Tracking</h2>
    <p>
      Die Seite setzt keine Cookies, speichert nichts in Ihrem Browser (kein Local Storage, keine IndexedDB) und verwendet
      keine Analyse- oder Trackingdienste. Es werden keine Inhalte von Dritten (z. B. Schriftarten, Skripte, CDNs) geladen.
    </p>

    <h2>5. Ihre Rechte</h2>
    <p>
      Sie haben das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der
      Verarbeitung (Art. 18), Widerspruch (Art. 21) sowie Datenübertragbarkeit (Art. 20). Wenden Sie sich dazu an den oben
      genannten Verantwortlichen. Sie haben außerdem das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren
      (Art. 77 DSGVO), z. B. <span class="placeholder">[PLATZHALTER: zuständige Aufsichtsbehörde]</span>.
    </p>

    <p>Stand: <span class="placeholder">[PLATZHALTER: Datum]</span></p>
  </body>
</html>
```

In `vite.web.config.ts` die `input` erweitern:
```ts
      input: {
        index: `${web}index.html`,
        impressum: `${web}impressum.html`,
        datenschutz: `${web}datenschutz.html`,
      },
```

- [ ] **Step 2: Bauen**

Run: `npm run build:web && ls dist-web/*.html && grep -c "PLATZHALTER" dist-web/impressum.html dist-web/datenschutz.html`
Expected: `index.html`, `impressum.html`, `datenschutz.html`. Die Platzhalter-Zähler sind größer als 0, die Platzhalter bleiben also bewusst sichtbar.

- [ ] **Step 3: Commit**

```bash
git add web/impressum.html web/datenschutz.html web/legal.css vite.web.config.ts
git commit -m "feat(web): Impressum und Datenschutzerklärung als Gerüst mit Platzhaltern

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Sicherheits-Header, lokale Vorschau, Server-Konfiguration

**Files:**
- Create: `scripts/serve-web.mjs`, `deploy/nginx.conf.example`, `deploy/nginx-security-headers.conf`, `deploy/.htaccess.example`
- Modify: `web/index.html`, `web/impressum.html`, `web/datenschutz.html` (CSP-Meta), `package.json` (Skript `preview:web`)
- Test: `tests/serve-web.test.ts`

**Interfaces:**
- Produces:
  - `serve-web.mjs` exportiert `CSP: string`, `SECURITY_HEADERS: Record<string, string>`, `resolveSafe(root: string, urlPath: string): string | null` und `createWebServer(root: string): import('node:http').Server`.
  - Beim Direktaufruf lauscht der Server auf `127.0.0.1:4173`.

- [ ] **Step 1: Failing test `tests/serve-web.test.ts`**

```ts
// @vitest-environment node
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { CSP, createWebServer, resolveSafe } from '../scripts/serve-web.mjs';

describe('resolveSafe', () => {
  const root = join(tmpdir(), 'kv-root');
  test('liefert Dateien unterhalb der Wurzel, / wird zu index.html', () => {
    expect(resolveSafe(root, '/')).toBe(join(root, 'index.html'));
    expect(resolveSafe(root, '/assets/a.js?v=1')).toBe(join(root, 'assets/a.js'));
  });
  test('weist Pfad-Traversal ab', () => {
    expect(resolveSafe(root, '/../etc/passwd')).toBeNull();
    expect(resolveSafe(root, '/%2e%2e/%2e%2e/etc/passwd')).toBeNull();
    expect(resolveSafe(root, '/%E0%A4%A')).toBeNull();
  });
});

describe('createWebServer', () => {
  let base = '';
  const server = (() => {
    const dir = mkdtempSync(join(tmpdir(), 'kv-web-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>x</title>');
    writeFileSync(join(dir, 'assets', 'app-1234.js'), 'console.log(1)');
    return createWebServer(dir);
  })();
  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  test('liefert HTML mit allen Sicherheits-Headern', async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toBe(CSP);
    expect(CSP).toContain("connect-src 'none'");
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
  });

  test('Assets langlebig gecacht, unbekannte Pfade 404, andere Methoden 405', async () => {
    expect((await fetch(`${base}/assets/app-1234.js`)).headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect((await fetch(`${base}/fehlt.html`)).status).toBe(404);
    const post = await fetch(`${base}/`, { method: 'POST', body: 'x' });
    expect(post.status).toBe(405);
    expect(post.headers.get('allow')).toBe('GET, HEAD');
  });
});
```

- [ ] **Step 2: Test laufen lassen – muss fehlschlagen**

Run: `npm test -- tests/serve-web.test.ts`
Expected: FAIL – „Failed to resolve import ../scripts/serve-web.mjs“.

- [ ] **Step 3: `scripts/serve-web.mjs` implementieren**

```js
// Lokale Vorschau von dist-web/ mit denselben Sicherheits-Headern wie deploy/nginx.conf.example (ohne HSTS).
// Aufruf: npm run preview:web  →  http://localhost:4173
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CSP = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'none'",
  "font-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

export const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP,
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/** Pfad innerhalb von root oder null (Traversal, ungültige Kodierung). */
export function resolveSafe(root, urlPath) {
  let path;
  try {
    path = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }
  if (path.endsWith('/')) path += 'index.html';
  const base = resolve(root);
  const full = resolve(base, `.${path}`);
  return full.startsWith(base + sep) ? full : null;
}

export function createWebServer(root) {
  return createServer(async (req, res) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const file = resolveSafe(root, req.url ?? '/');
    if (!file) {
      res.writeHead(400).end();
      return;
    }
    try {
      const body = await readFile(file);
      const type = TYPES[extname(file)] ?? 'application/octet-stream';
      const cache = file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Nicht gefunden');
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const root = fileURLToPath(new URL('../dist-web/', import.meta.url));
  createWebServer(root).listen(4173, '127.0.0.1', () => {
    console.log('Kairos Viewer (Web) mit Sicherheits-Headern: http://localhost:4173');
  });
}
```

`package.json`-Skript ergänzen:
```json
    "preview:web": "npm run build:web && node scripts/serve-web.mjs",
```

- [ ] **Step 4: Tests laufen lassen – müssen bestehen**

Run: `npm test && npx tsc --noEmit`
Expected: alle PASS. Meldet `tsc` fehlende Typen für den `.mjs`-Import, ist `allowJs` aus Task 2 nicht aktiv. Dann `tsconfig.json` prüfen.

- [ ] **Step 5: CSP-Meta in die drei HTML-Seiten**

In `web/index.html`, `web/impressum.html` und `web/datenschutz.html` jeweils direkt nach `<meta charset="UTF-8" />` einfügen. Das ist dieselbe CSP ohne `frame-ancestors`, das in `<meta>` nicht wirkt:
```html
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
    />
```

- [ ] **Step 6: Server-Konfiguration anlegen**

`deploy/nginx-security-headers.conf`:
```nginx
# Sicherheits-Header des Kairos Viewers (Web). In jedem location-Block einbinden, der add_header nutzt:
# nginx erbt add_header nicht in Blöcke mit eigenen add_header-Anweisungen.
add_header Content-Security-Policy "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" always;
add_header Referrer-Policy "no-referrer" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), interest-cohort=()" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;
add_header Strict-Transport-Security "max-age=31536000" always;
```

`deploy/nginx.conf.example`:
```nginx
# Kairos Viewer (Web) – Beispiel für nginx. PLATZHALTER anpassen.
# Inhalt von dist-web/ nach /var/www/kairos-viewer kopieren, nginx-security-headers.conf nach /etc/nginx/snippets/.

# --- in den http { }-Block (z. B. /etc/nginx/conf.d/kairos-log.conf) ---
# IP-Adressen gekürzt protokollieren (letztes Oktett bzw. hintere 80 Bit von IPv6 auf 0).
map $remote_addr $remote_addr_anon {
    ~(?P<ip>\d+\.\d+\.\d+)\.\d+    $ip.0;
    ~(?P<ip>[^:]+:[^:]+:[^:]+):    $ip::;
    default                        0.0.0.0;
}
log_format kairos_anon '$remote_addr_anon - [$time_local] "$request" $status $body_bytes_sent';

# --- Server ---
server {
    listen 80;
    server_name viewer.example.de;            # PLATZHALTER
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name viewer.example.de;            # PLATZHALTER
    ssl_certificate     /etc/letsencrypt/live/viewer.example.de/fullchain.pem;   # PLATZHALTER
    ssl_certificate_key /etc/letsencrypt/live/viewer.example.de/privkey.pem;     # PLATZHALTER

    root /var/www/kairos-viewer;
    index index.html;
    access_log /var/log/nginx/kairos-viewer.log kairos_anon;  # Aufbewahrung per logrotate kurz halten (z. B. 7 Tage)

    # Nur lesen – Uploads gibt es nicht.
    limit_except GET HEAD { deny all; }
    client_max_body_size 1k;

    location /assets/ {
        include snippets/nginx-security-headers.conf;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        try_files $uri =404;
    }

    location / {
        include snippets/nginx-security-headers.conf;
        add_header Cache-Control "no-cache" always;
        try_files $uri $uri/ =404;
    }
}
```

`deploy/.htaccess.example`:
```apache
# Kairos Viewer (Web) – Beispiel für Apache (mod_headers). Als .htaccess in das Verzeichnis mit dem Inhalt von dist-web/.
# HTTPS und die Protokollierung (gekürzte IPs, kurze Aufbewahrung) werden in der Server-/Hoster-Konfiguration eingestellt.
<IfModule mod_headers.c>
  Header always set Content-Security-Policy "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
  Header always set Referrer-Policy "no-referrer"
  Header always set X-Content-Type-Options "nosniff"
  Header always set Permissions-Policy "camera=(), microphone=(), geolocation=(), interest-cohort=()"
  Header always set Cross-Origin-Opener-Policy "same-origin"
  Header always set Strict-Transport-Security "max-age=31536000" "expr=%{HTTPS} == 'on'"

  <FilesMatch "\.html$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
  <FilesMatch "\.(js|css)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
</IfModule>

Options -Indexes
<LimitExcept GET HEAD>
  Require all denied
</LimitExcept>
```

- [ ] **Step 7: Bauen, Tests und Commit**

Run: `npm run build:web && grep -c "Content-Security-Policy" dist-web/*.html && npm test`
Expected: jede HTML-Datei enthält die Meta-CSP (je 1), alle Tests PASS.

```bash
git add scripts/serve-web.mjs tests/serve-web.test.ts deploy web/index.html web/impressum.html web/datenschutz.html package.json
git commit -m "feat(web): Sicherheits-Header (CSP connect-src 'none'), lokale Vorschau, nginx-/Apache-Konfiguration

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Dokumentation und Ende-zu-Ende-Prüfung

**Files:**
- Modify: `README.md` (Abschnitt Web)

- [ ] **Step 1: README ergänzen**

Nach dem Abschnitt „Release-Build“ einfügen:

````markdown
## Web-Version

Der Viewer läuft auch als statische Webseite. Die Datei wird **ausschließlich im Browser** gelesen (sql.js als eingebettetes
WebAssembly) und nie an den Server übertragen; die Sicherheitsrichtlinie (`connect-src 'none'`) verbietet der Seite nach dem
Laden jede Netzwerkverbindung. Keine Cookies, kein Tracking, keine externen Ressourcen.

```bash
npm run build:web      # → dist-web/ (statisch, relativ verlinkt)
npm run preview:web    # lokal mit denselben Sicherheits-Headern: http://localhost:4173
```

Ausliefern: Inhalt von `dist-web/` auf einen beliebigen Webserver kopieren und die Header aus
`deploy/nginx.conf.example` + `deploy/nginx-security-headers.conf` bzw. `deploy/.htaccess.example` übernehmen.
`web/impressum.html` und `web/datenschutz.html` enthalten Platzhalter (`[PLATZHALTER: …]`), die vor der Veröffentlichung
ersetzt und rechtlich geprüft werden müssen.
````

- [ ] **Step 2: Ende-zu-Ende-Prüfung mit echten Headern (Chrome DevTools MCP)**

`npm run preview:web` im Hintergrund starten und `http://localhost:4173/` in Chrome öffnen.

1. **Konsole:** keine CSP-Verstöße (`list_console_messages`, Typ `error`/`issue`).
2. **Netzwerk:**
   - `list_network_requests` notieren.
   - Demo-Datei über das Dateifeld öffnen (`upload_file`).
   - Erneut `list_network_requests`: **keine** neuen Anfragen nach dem Öffnen.
3. **Darstellung:**
   - 9 Zeilen, Vorgänger „5, 6“ bei Integration, kritischer Pfad rot.
   - Zoom „Tag“ und Baseline an.
   - Screenshot vergleichen mit der Desktop-Darstellung.
4. **Fehlerfälle:**
   - Eine Textdatei mit Endung `.kairos` öffnen: roter Banner „Die Datei ist keine Kairos-Projektdatei.“
   - Eine `.txt`-Datei: „Nur .kairos-Dateien können geöffnet werden.“
5. **Abwehr per CSP:** In der Konsole `fetch('/x')` per `evaluate_script` ausführen. Der Aufruf muss mit einem CSP-Fehler scheitern (`connect-src 'none'`).
6. **Rechtsseiten:** Impressum und Datenschutz über die Fußzeile erreichbar, Platzhalter sichtbar.
7. **Druck:** Headless-Chrome-PDF von `http://localhost:4173/` erzeugen. Dafür die Datei per `evaluate_script` öffnen, dann drucken. Fußzeile und Toolbar sind nicht im Druck.

Danach den Vorschau-Server beenden.

- [ ] **Step 3: Gesamte Testsuite und Desktop-Build**

Run: `npm test && cargo test --manifest-path src-tauri/Cargo.toml && npm run tauri build`
Expected: alle Tests PASS; `.app` und `.dmg` werden gebaut.

- [ ] **Step 4: Prüfung auf sensible Daten vor dem Commit**

Run: `git grep -nE "/Users/|CDI|gmail|Projektplan_" -- . ':!*.lock' ; git log -1 --format='%ae'`
Expected: keine Treffer. Erlaubt sind nur die erfundenen Testpfade `/Users/a b/…` und `/Users/x/…` in den Tests. Die Autor-Adresse ist die noreply-Adresse.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: Web-Version im README

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
