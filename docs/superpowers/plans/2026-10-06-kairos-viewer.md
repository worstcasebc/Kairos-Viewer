# Kairos-Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein plattformübergreifender Viewer (macOS + Windows) zeigt `.kairos`-Dateien (SQLite) als Vorgangsliste mit Gantt-Chart an, ohne die Datei je zu verändern.

**Architecture:** Tauri 2. Ein Rust-Modul (`reader.rs`) liest die SQLite-Datei schreibgeschützt und schema-tolerant (v2–v5) in ein JSON-DTO. Das TypeScript-Frontend (Vite, ohne Framework) baut daraus mit reinen, getesteten Funktionen (Baum, Formatierung, Vorgänger-Text, Zeitskala) eine HTML-Tabelle und ein SVG-Gantt. Termine kommen ausschließlich aus den gespeicherten CPM-Spalten; es wird nichts neu berechnet.

**Tech Stack:** Tauri 2, Rust (rusqlite 0.32 `bundled`, serde, thiserror), TypeScript 5, Vite 6, Vitest 3 + jsdom, `@tauri-apps/plugin-dialog`.

**Spec:** `docs/superpowers/specs/2026-10-06-kairos-viewer-design.md`

## Global Constraints

- Das Originalprojekt `<Kairos-Quellprojekt>` wird **nie** verändert; es dient nur als Referenz.
- Die geöffnete `.kairos`-Datei bleibt byte-identisch; Öffnen nur über `file:…?mode=ro&immutable=1`.
- Unterstützte Schemaversionen: 2 bis 5 (`meta.schema_version`); andere → Fehler „Version X nicht unterstützt“.
- Termine/Puffer/kritisch nur aus den gespeicherten Spalten `early_start`, `early_finish`, `total_float`, `free_float`, `is_critical`, `deadline_missed`.
- Datumswerte sind zeitzonenlose Strings (`YYYY-MM-DD` / `YYYY-MM-DDTHH:MM`); niemals über lokale `Date`-Zeitzonen interpretieren, nur UTC-Arithmetik.
- Nr = 1-basierte Preorder-Nummer; Vorgänger-Token `<Nr><Typ≠FS><±Lag>`, Lag in `d`/`h`/`min`, Trenner „, “.
- Dauer mit Dezimalpunkt, max. 2 Nachkommastellen; Sammelvorgänge ohne Dauer; Datum „25.06.26, 08:00“.
- Zoom: Tag 70, Woche 23, Monat 7 Pixel pro Kalendertag. Zeilenhöhe 24 px, Kopfhöhe 40 px.
- Benutzertexte (Vorgangsnamen, Baseline-Namen) nur per `textContent`, nie per `innerHTML`.
- Tauri-Capabilities: nur `core:default` und `dialog:allow-open`.
- App: Name „Kairos Viewer“, Identifier `de.stevebaumann.kairos-viewer`, Version 0.1.0. UI-Sprache Deutsch.
- Die reale Projektdatei zum Vergleich wird nicht ins Repo kopiert (nur manuelle Prüfung).

## Review Focus

- Pfade mit Leerzeichen, Umlauten, `#` sowie Windows-Laufwerks- und UNC-Pfade öffnen sich korrekt → Tests in Task 2.
- Vorgangsnamen mit HTML-/Sonderzeichen (`<b>x</b>`, `&`) erscheinen wörtlich → Test in Task 10.
- Kaputte Hierarchie (Eltern-Zyklus, Selbstbezug, unbekannte `parent_id`) → jeder Vorgang genau einmal, kein Hängen → Tests in Task 5.
- Vorgänge ohne gespeicherte Termine bzw. Abhängigkeiten zu eingeklappten/unbekannten Vorgängen → kein Balken/Pfeil, kein Absturz, Hinweisbanner → Tests in Task 9 und Task 11.
- Leeres Projekt (0 Vorgänge) bzw. `hours_per_day = 0` → leere Ansicht ohne Division durch null → Tests in Task 6, 8 und 9.

---

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `.gitignore` | Frontend-Build und Tests |
| `scripts/make-icon.mjs` | erzeugt `app-icon.png` (Quelle für `tauri icon`) |
| `src-tauri/Cargo.toml`, `build.rs`, `tauri.conf.json`, `capabilities/default.json` | Tauri-Konfiguration |
| `src-tauri/src/main.rs` | Einstiegspunkt |
| `src-tauri/src/lib.rs` | Commands, Datei-Übergabe (argv / macOS „Opened“) |
| `src-tauri/src/reader.rs` | `.kairos` lesen → `ProjectDto` |
| `src-tauri/tests/reader_tests.rs`, `src-tauri/tests/fixtures/demo-v2.kairos` | Reader-Tests |
| `src/model.ts` | DTO-Typen |
| `src/tree.ts` | Baum, Preorder-Nr, sichtbare Zeilen |
| `src/format.ts` | Dauer, Puffer, Datum, Prozent |
| `src/predecessors.ts` | Vorgänger-Text |
| `src/gantt/calendar.ts` | Civil-Datum-Arithmetik, Arbeitstage, KW |
| `src/gantt/scale.ts` | Zoom, Bereich, Datum→x, Achsenbeschriftung |
| `src/gantt/render.ts` | SVG für Achse und Gantt-Körper |
| `src/table.ts` | Vorgangsliste (DOM) |
| `src/state.ts` | reiner Ansichtszustand (Laden, Auf-/Zuklappen, Baseline, Druck-Zoom) |
| `src/app.ts`, `src/main.ts`, `src/styles.css`, `src/print.css` | Verdrahtung, Layout, Druck |
| `tests/*.test.ts`, `tests/fixtures/demo.ts` | Vitest |
| `scripts/build-windows.ps1`, `README.md` | Build-Anleitung |

---

### Task 0: Voraussetzungen prüfen (Nutzeraktion)

- [ ] **Step 1: Rust prüfen**

Run: `cargo --version && rustc --version`
Expected: Versionen werden ausgegeben. Falls „command not found“: Nutzer bitten, `! curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y` auszuführen und danach eine neue Shell zu öffnen (bzw. `source "$HOME/.cargo/env"`). Ohne Rust nicht weitermachen.

- [ ] **Step 2: Xcode Command Line Tools und Node prüfen**

Run: `xcode-select -p && node --version && npm --version`
Expected: Pfad und Versionen (Node ≥ 20).

---

### Task 1: Projektgerüst (Tauri 2 + Vite/TS) mit Icon

**Files:**
- Create: `.gitignore`, `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.ts`, `tests/smoke.test.ts`
- Create: `scripts/make-icon.mjs`
- Create: `src-tauri/Cargo.toml`, `src-tauri/build.rs`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`
- Generated: `app-icon.png`, `src-tauri/icons/*`, `package-lock.json`, `src-tauri/Cargo.lock`

**Interfaces:**
- Produces: Rust-Crate `kairos_viewer_lib` mit `pub fn run()`; npm-Skripte `dev`, `build`, `test`, `tauri`.

- [ ] **Step 1: `.gitignore` anlegen**

```gitignore
node_modules/
dist/
src-tauri/target/
src-tauri/gen/
.DS_Store
```

- [ ] **Step 2: `package.json` anlegen**

```json
{
  "name": "kairos-viewer",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "tauri": "tauri"
  },
  "dependencies": {
    "@tauri-apps/api": "^2",
    "@tauri-apps/plugin-dialog": "^2"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2",
    "jsdom": "^25",
    "typescript": "^5.6",
    "vite": "^6",
    "vitest": "^3"
  }
}
```

- [ ] **Step 3: `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.ts`**

`vite.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: { target: 'es2021', outDir: 'dist' },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] },
});
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2021", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true
  },
  "include": ["src", "tests"]
}
```

`index.html`:
```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Kairos Viewer</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/main.ts` (Platzhalter, wird in Task 12 ersetzt):
```ts
document.getElementById('app')!.textContent = 'Kairos Viewer';
```

`tests/smoke.test.ts` (wird in Task 5 gelöscht):
```ts
import { expect, test } from 'vitest';

test('vitest läuft', () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 4: Abhängigkeiten installieren, Frontend bauen, Test laufen lassen**

Run: `npm install && npm run build && npm test`
Expected: `dist/index.html` existiert; Vitest meldet „1 passed“.

- [ ] **Step 5: Icon-Generator `scripts/make-icon.mjs` schreiben**

```js
// Erzeugt app-icon.png (1024×1024, RGBA): blaues abgerundetes Quadrat mit drei Gantt-Balken.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const S = 1024;
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
const BARS = [
  [200, 300, 560, 380],
  [420, 470, 820, 550],
  [300, 640, 700, 720],
];
const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  const row = y * (S * 4 + 1);
  raw[row] = 0;
  for (let x = 0; x < S; x++) {
    const i = row + 1 + x * 4;
    let rgba = [0, 0, 0, 0];
    if (inRoundRect(x, y, 64, 64, 960, 960, 180)) rgba = [47, 111, 214, 255];
    if (BARS.some(([x0, y0, x1, y1]) => inRoundRect(x, y, x0, y0, x1, y1, 40))) rgba = [255, 255, 255, 255];
    raw.set(rgba, i);
  }
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr.set([8, 6, 0, 0, 0], 8);
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);
writeFileSync('app-icon.png', png);
console.log('app-icon.png geschrieben');
```

- [ ] **Step 6: Rust-/Tauri-Dateien anlegen**

`src-tauri/Cargo.toml`:
```toml
[package]
name = "kairos-viewer"
version = "0.1.0"
description = "Viewer für Kairos-Projektdateien"
edition = "2021"

[lib]
name = "kairos_viewer_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-dialog = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rusqlite = { version = "0.32", features = ["bundled"] }
thiserror = "2"

[dev-dependencies]
tempfile = "3"
```

`src-tauri/build.rs`:
```rust
fn main() {
    tauri_build::build()
}
```

`src-tauri/src/main.rs`:
```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    kairos_viewer_lib::run()
}
```

`src-tauri/src/lib.rs` (vorläufig, wird in Task 4 ersetzt):
```rust
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .run(tauri::generate_context!())
        .expect("Kairos Viewer konnte nicht gestartet werden");
}
```

`src-tauri/tauri.conf.json`:
```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Kairos Viewer",
  "version": "0.1.0",
  "identifier": "de.stevebaumann.kairos-viewer",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "Kairos Viewer",
        "width": 1400,
        "height": 850,
        "minWidth": 800,
        "minHeight": 500,
        "dragDropEnabled": true
      }
    ],
    "security": {
      "csp": "default-src 'self'; connect-src ipc: http://ipc.localhost; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "category": "Productivity",
    "shortDescription": "Viewer für Kairos-Projektdateien",
    "fileAssociations": [
      {
        "ext": ["kairos"],
        "name": "Kairos-Projekt",
        "description": "Kairos-Projektdatei",
        "role": "Viewer"
      }
    ]
  }
}
```

`src-tauri/capabilities/default.json`:
```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Minimale Rechte des Viewers",
  "windows": ["main"],
  "permissions": ["core:default", "dialog:allow-open"]
}
```

- [ ] **Step 7: Icons erzeugen und Rust bauen**

Run: `node scripts/make-icon.mjs && npx tauri icon app-icon.png && cargo check --manifest-path src-tauri/Cargo.toml`
Expected: `src-tauri/icons/` enthält `icon.icns`, `icon.ico`, `32x32.png`, `128x128.png`, `128x128@2x.png`; `cargo check` endet ohne Fehler (erster Lauf dauert mehrere Minuten).

- [ ] **Step 8: App starten**

Run: `npm run tauri dev` (im Hintergrund), nach dem Start das Fenster prüfen, dann beenden.
Expected: Fenster „Kairos Viewer“ mit dem Text „Kairos Viewer“.

- [ ] **Step 9: Commit**

```bash
git add .gitignore package.json package-lock.json vite.config.ts tsconfig.json index.html src tests scripts/make-icon.mjs app-icon.png src-tauri
git commit -m "chore: Tauri-2-Projektgerüst mit Vite/TypeScript und App-Icon"
```

---

### Task 2: Reader – Öffnen und Validierung

**Files:**
- Create: `src-tauri/src/reader.rs`
- Modify: `src-tauri/src/lib.rs` (Zeile `pub mod reader;` oben ergänzen)
- Test: `src-tauri/tests/reader_tests.rs`

**Interfaces:**
- Produces:
  - `pub fn sqlite_uri(path: &Path) -> String`
  - `pub fn read_project(path: &Path) -> Result<ProjectDto, ReadError>` (in diesem Task liefert er nach erfolgreicher Validierung ein `ProjectDto` nur mit Projektzeile; Task 3 ergänzt die Listen)
  - `pub enum ReadError { Io(std::io::Error), NotAKairosFile, UnsupportedVersion(i64), Corrupt(String) }` mit deutscher `Display`-Meldung
  - DTO-Structs (vollständig, siehe Step 3), serde `camelCase`, `None` → `null`

- [ ] **Step 1: Failing tests schreiben** – `src-tauri/tests/reader_tests.rs`

```rust
use kairos_viewer_lib::reader::{read_project, sqlite_uri, ReadError};
use rusqlite::Connection;
use std::path::{Path, PathBuf};

/// Minimale Kairos-Datei im Stil von v1/v2 ohne optionale Spalten und ohne Kalender-/Baseline-Tabellen.
const BASE_DDL: &str = "
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
";

pub fn make_db(dir: &Path, file: &str, version: i64, extra_sql: &str) -> PathBuf {
    let path = dir.join(file);
    let conn = Connection::open(&path).unwrap();
    conn.execute_batch(BASE_DDL).unwrap();
    conn.execute("INSERT INTO meta VALUES (?1)", [version]).unwrap();
    conn.execute_batch(extra_sql).unwrap();
    drop(conn);
    path
}

#[test]
fn uri_encodes_spaces_hash_and_umlauts() {
    assert_eq!(
        sqlite_uri(Path::new("/Users/a b/Plan #1 Ü.kairos")),
        "file:/Users/a%20b/Plan%20%231%20%C3%9C.kairos?mode=ro&immutable=1"
    );
}

#[test]
fn uri_handles_windows_drive_and_unc_paths() {
    assert_eq!(
        sqlite_uri(Path::new("C:\\Daten\\Plan.kairos")),
        "file:/C:/Daten/Plan.kairos?mode=ro&immutable=1"
    );
    assert_eq!(
        sqlite_uri(Path::new("\\\\server\\share\\Plan.kairos")),
        "file:////server/share/Plan.kairos?mode=ro&immutable=1"
    );
}

#[test]
fn rejects_text_file() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("notiz.kairos");
    std::fs::write(&path, "kein SQLite").unwrap();
    assert!(matches!(read_project(&path), Err(ReadError::NotAKairosFile)));
}

#[test]
fn rejects_empty_file() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("leer.kairos");
    std::fs::write(&path, "").unwrap();
    assert!(matches!(read_project(&path), Err(ReadError::NotAKairosFile)));
}

#[test]
fn reports_missing_file_as_io_error() {
    let dir = tempfile::tempdir().unwrap();
    assert!(matches!(read_project(&dir.path().join("fehlt.kairos")), Err(ReadError::Io(_))));
}

#[test]
fn rejects_sqlite_without_task_table() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("fremd.kairos");
    let conn = Connection::open(&path).unwrap();
    conn.execute_batch("CREATE TABLE meta (schema_version INTEGER); INSERT INTO meta VALUES (5);").unwrap();
    drop(conn);
    assert!(matches!(read_project(&path), Err(ReadError::NotAKairosFile)));
}

#[test]
fn rejects_unsupported_versions() {
    let dir = tempfile::tempdir().unwrap();
    let v6 = make_db(dir.path(), "v6.kairos", 6, "");
    let v1 = make_db(dir.path(), "v1.kairos", 1, "");
    assert!(matches!(read_project(&v6), Err(ReadError::UnsupportedVersion(6))));
    assert!(matches!(read_project(&v1), Err(ReadError::UnsupportedVersion(1))));
}

#[test]
fn error_messages_are_german() {
    assert_eq!(
        ReadError::UnsupportedVersion(6).to_string(),
        "Die Kairos-Dateiversion 6 wird nicht unterstützt (unterstützt: 2–5)."
    );
    assert_eq!(ReadError::NotAKairosFile.to_string(), "Die Datei ist keine Kairos-Projektdatei.");
}

#[test]
fn reads_project_row_of_supported_version() {
    let dir = tempfile::tempdir().unwrap();
    let path = make_db(dir.path(), "Projekt #1 Übersicht.kairos", 2, "");
    let project = read_project(&path).unwrap();
    assert_eq!(project.schema_version, 2);
    assert_eq!(project.name, "Synthetisch");
    assert_eq!(project.start_date.as_deref(), Some("2026-01-05"));
    assert_eq!(project.status_date, None);
    assert_eq!(project.active_baseline_id, None);
    assert_eq!(project.hours_per_day, 8.0);
    assert_eq!(project.days_per_week, 5.0);
}
```

- [ ] **Step 2: Test laufen lassen – muss fehlschlagen**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --test reader_tests`
Expected: FAIL – Kompilierfehler „unresolved import `kairos_viewer_lib::reader`“.

- [ ] **Step 3: `src-tauri/src/reader.rs` implementieren**

```rust
//! Liest `.kairos`-Dateien (SQLite, Schema v2–v5) schreibgeschützt in ein serialisierbares DTO.
//! Die Datei wird per `immutable=1` geöffnet: SQLite legt weder Journal noch Sperren an.

use rusqlite::{Connection, OpenFlags, OptionalExtension};
use serde::Serialize;
use std::collections::HashSet;
use std::io::Read;
use std::path::Path;

pub const MIN_SCHEMA_VERSION: i64 = 2;
pub const MAX_SCHEMA_VERSION: i64 = 5;
const REQUIRED_TABLES: [&str; 4] = ["meta", "project", "task", "dependency"];

#[derive(Debug, thiserror::Error)]
pub enum ReadError {
    #[error("Die Datei konnte nicht gelesen werden: {0}")]
    Io(#[from] std::io::Error),
    #[error("Die Datei ist keine Kairos-Projektdatei.")]
    NotAKairosFile,
    #[error("Die Kairos-Dateiversion {0} wird nicht unterstützt (unterstützt: 2–5).")]
    UnsupportedVersion(i64),
    #[error("Die Datei ist beschädigt: {0}")]
    Corrupt(String),
}

impl From<rusqlite::Error> for ReadError {
    fn from(error: rusqlite::Error) -> Self {
        ReadError::Corrupt(error.to_string())
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDto {
    pub schema_version: i64,
    pub name: String,
    pub start_date: Option<String>,
    pub finish_date: Option<String>,
    pub status_date: Option<String>,
    pub hours_per_day: f64,
    pub days_per_week: f64,
    pub tasks: Vec<TaskDto>,
    pub dependencies: Vec<DependencyDto>,
    pub calendar: Option<CalendarDto>,
    pub baselines: Vec<BaselineDto>,
    pub active_baseline_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskDto {
    pub id: String,
    pub parent_id: Option<String>,
    pub order_index: i64,
    pub name: String,
    #[serde(rename = "type")]
    pub task_type: String,
    pub duration_minutes: i64,
    pub display_unit: String,
    pub percent_complete: f64,
    pub deadline: Option<String>,
    pub early_start: Option<String>,
    pub early_finish: Option<String>,
    pub total_float: Option<i64>,
    pub free_float: Option<i64>,
    pub is_critical: bool,
    pub deadline_missed: bool,
    pub fixed_finish: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyDto {
    pub predecessor_id: String,
    pub successor_id: String,
    #[serde(rename = "type")]
    pub dep_type: String,
    pub lag_minutes: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarDto {
    pub workweek: Vec<WorkdayDto>,
    pub exceptions: Vec<CalendarExceptionDto>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkdayDto {
    pub weekday: i64,
    pub is_working: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarExceptionDto {
    pub date: String,
    pub is_working: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BaselineDto {
    pub id: String,
    pub name: String,
    pub tasks: Vec<BaselineTaskDto>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BaselineTaskDto {
    pub task_id: String,
    pub start: Option<String>,
    pub finish: Option<String>,
}

/// SQLite-URI für schreibgeschütztes, unveränderliches Öffnen. Kodiert alles außer
/// unreservierten Zeichen, `/` und `:`; Backslashes (Windows) werden zu `/`.
pub fn sqlite_uri(path: &Path) -> String {
    let raw = path.to_string_lossy().replace('\\', "/");
    let mut encoded = String::with_capacity(raw.len());
    for byte in raw.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'/' | b':' => {
                encoded.push(byte as char)
            }
            other => encoded.push_str(&format!("%{other:02X}")),
        }
    }
    // UNC (`//server/share`) braucht eine leere Authority davor, Laufwerkspfade (`C:/…`) einen führenden `/`.
    let prefix = if encoded.starts_with("//") {
        "//"
    } else if encoded.starts_with('/') {
        ""
    } else {
        "/"
    };
    format!("file:{prefix}{encoded}?mode=ro&immutable=1")
}

fn has_sqlite_header(path: &Path) -> Result<bool, ReadError> {
    let mut file = std::fs::File::open(path)?;
    let mut header = [0u8; 16];
    match file.read_exact(&mut header) {
        Ok(()) => Ok(&header == b"SQLite format 3\0"),
        Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => Ok(false),
        Err(e) => Err(e.into()),
    }
}

/// Spaltennamen einer Tabelle; leer, wenn die Tabelle fehlt.
fn columns(conn: &Connection, table: &str) -> Result<HashSet<String>, ReadError> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info(\"{table}\")"))?;
    let names = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<Result<HashSet<_>, _>>()?;
    Ok(names)
}

/// Spalte für SELECT – oder `NULL AS name`, wenn die Datei (ältere Version) sie nicht hat.
fn col(available: &HashSet<String>, name: &str) -> String {
    if available.contains(name) {
        name.to_string()
    } else {
        format!("NULL AS {name}")
    }
}

fn open_readonly(path: &Path) -> Result<Connection, ReadError> {
    let flags = OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI | OpenFlags::SQLITE_OPEN_NO_MUTEX;
    Ok(Connection::open_with_flags(sqlite_uri(path), flags)?)
}

pub fn read_project(path: &Path) -> Result<ProjectDto, ReadError> {
    if !has_sqlite_header(path)? {
        return Err(ReadError::NotAKairosFile);
    }
    let conn = open_readonly(path)?;
    for table in REQUIRED_TABLES {
        if columns(&conn, table)?.is_empty() {
            return Err(ReadError::NotAKairosFile);
        }
    }
    let version: i64 = conn
        .query_row("SELECT schema_version FROM meta LIMIT 1", [], |row| row.get(0))
        .optional()?
        .ok_or(ReadError::NotAKairosFile)?;
    if !(MIN_SCHEMA_VERSION..=MAX_SCHEMA_VERSION).contains(&version) {
        return Err(ReadError::UnsupportedVersion(version));
    }
    let (project, _default_calendar_id) = read_project_row(&conn, version)?;
    Ok(project)
}

fn read_project_row(conn: &Connection, version: i64) -> Result<(ProjectDto, Option<String>), ReadError> {
    let cols = columns(conn, "project")?;
    let sql = format!(
        "SELECT name, {}, {}, {}, hours_per_day, days_per_week, {}, {} FROM project LIMIT 1",
        col(&cols, "start_date"),
        col(&cols, "finish_date"),
        col(&cols, "status_date"),
        col(&cols, "default_calendar_id"),
        col(&cols, "active_baseline_id"),
    );
    conn.query_row(&sql, [], |row| {
        Ok((
            ProjectDto {
                schema_version: version,
                name: row.get(0)?,
                start_date: row.get(1)?,
                finish_date: row.get(2)?,
                status_date: row.get(3)?,
                hours_per_day: row.get(4)?,
                days_per_week: row.get(5)?,
                tasks: Vec::new(),
                dependencies: Vec::new(),
                calendar: None,
                baselines: Vec::new(),
                active_baseline_id: row.get(7)?,
            },
            row.get::<_, Option<String>>(6)?,
        ))
    })
    .optional()?
    .ok_or(ReadError::NotAKairosFile)
}
```

In `src-tauri/src/lib.rs` als erste Zeile ergänzen:
```rust
pub mod reader;
```

- [ ] **Step 4: Tests laufen lassen – müssen bestehen**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --test reader_tests`
Expected: PASS (9 Tests). Warnung zu `_default_calendar_id` ist erlaubt; sie verschwindet in Task 3.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/reader.rs src-tauri/src/lib.rs src-tauri/tests/reader_tests.rs
git commit -m "feat(reader): .kairos schreibgeschützt öffnen und Version/Struktur prüfen"
```

---

### Task 3: Reader – Vorgänge, Abhängigkeiten, Kalender, Baselines lesen

**Files:**
- Modify: `src-tauri/src/reader.rs` (Funktion `read_project` und neue Lesefunktionen)
- Create: `src-tauri/tests/fixtures/demo-v2.kairos` (Kopie)
- Test: `src-tauri/tests/reader_tests.rs` (Tests anhängen)

**Interfaces:**
- Consumes: `read_project_row`, `columns`, `col` aus Task 2.
- Produces: `read_project` liefert vollständiges `ProjectDto`: Vorgänge in `rowid`-Reihenfolge, Abhängigkeiten in `rowid`-Reihenfolge, Kalender des `default_calendar_id` (Arbeitswoche nach `weekday`, Ausnahmen nach `date`), Baselines nach `captured_at`.

- [ ] **Step 1: Fixture kopieren (Original bleibt unberührt)**

Run: `mkdir -p src-tauri/tests/fixtures && cp "<Kairos-Quellprojekt>/docs/handbuch/beispiel/Kairos-Demo.kairos" src-tauri/tests/fixtures/demo-v2.kairos`

- [ ] **Step 2: Failing tests anhängen** – an `src-tauri/tests/reader_tests.rs`

```rust
fn fixture(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures").join(name)
}

#[test]
fn reads_minimal_file_without_optional_columns_and_tables() {
    let dir = tempfile::tempdir().unwrap();
    let path = make_db(dir.path(), "minimal.kairos", 2, "");
    let project = read_project(&path).unwrap();
    assert_eq!(project.tasks.len(), 2);
    let alpha = &project.tasks[0];
    assert_eq!(alpha.name, "Alpha");
    assert_eq!(alpha.task_type, "normal");
    assert_eq!(alpha.duration_minutes, 960);
    assert_eq!(alpha.percent_complete, 0.5);
    assert_eq!(alpha.early_start.as_deref(), Some("2026-01-05T08:00"));
    assert!(alpha.is_critical);
    assert_eq!(alpha.fixed_finish, None);
    let beta = &project.tasks[1];
    assert_eq!(beta.early_start, None);
    assert_eq!(beta.total_float, None);
    assert!(!beta.is_critical);
    assert!(!beta.deadline_missed);
    assert_eq!(project.dependencies.len(), 1);
    assert_eq!(project.dependencies[0].dep_type, "FF");
    assert_eq!(project.dependencies[0].lag_minutes, -120);
    assert_eq!(project.calendar, None);
    assert!(project.baselines.is_empty());
}

#[test]
fn reads_v5_columns() {
    let dir = tempfile::tempdir().unwrap();
    let path = make_db(
        dir.path(),
        "v5.kairos",
        5,
        "ALTER TABLE task ADD COLUMN fixed_finish TEXT;
         ALTER TABLE project ADD COLUMN status_date TEXT;
         ALTER TABLE project ADD COLUMN active_baseline_id TEXT;
         UPDATE task SET fixed_finish = '2026-01-07T17:00' WHERE id = 't1';
         UPDATE project SET status_date = '2026-01-06';",
    );
    let project = read_project(&path).unwrap();
    assert_eq!(project.schema_version, 5);
    assert_eq!(project.status_date.as_deref(), Some("2026-01-06"));
    assert_eq!(project.tasks[0].fixed_finish.as_deref(), Some("2026-01-07T17:00"));
}

#[test]
fn reads_demo_file() {
    let project = read_project(&fixture("demo-v2.kairos")).unwrap();
    assert_eq!(project.schema_version, 2);
    assert_eq!(project.name, "");
    assert_eq!(project.hours_per_day, 8.0);
    assert_eq!(project.tasks.len(), 9);
    assert_eq!(project.dependencies.len(), 7);

    let by_name = |n: &str| project.tasks.iter().find(|t| t.name == n).unwrap();
    let anf = by_name("Anforderungen");
    assert_eq!(anf.duration_minutes, 1440);
    assert_eq!(anf.display_unit, "d");
    assert_eq!(anf.early_start.as_deref(), Some("2026-06-25T08:00"));
    assert_eq!(anf.early_finish.as_deref(), Some("2026-06-29T14:00"));
    assert_eq!(anf.total_float, Some(0));
    assert!(anf.is_critical);
    assert_eq!(anf.parent_id.as_deref(), Some(by_name("Konzeption").id.as_str()));
    let konzeption = by_name("Konzeption");
    assert_eq!(konzeption.task_type, "summary");
    assert_eq!(konzeption.total_float, None);
    assert!(!konzeption.is_critical);
    assert_eq!(by_name("Go-Live").task_type, "milestone");

    let first = &project.dependencies[0];
    assert_eq!(first.predecessor_id, anf.id);
    assert_eq!(first.successor_id, by_name("Wireframes").id);
    assert_eq!(first.dep_type, "FS");
    assert_eq!(project.dependencies.iter().filter(|d| d.dep_type == "SS").count(), 1);

    let calendar = project.calendar.as_ref().unwrap();
    assert_eq!(calendar.workweek.iter().map(|w| w.weekday).collect::<Vec<_>>(), vec![0, 1, 2, 3, 4]);
    assert!(calendar.workweek.iter().all(|w| w.is_working));

    assert_eq!(project.baselines.len(), 1);
    assert_eq!(project.baselines[0].name, "Basisplan");
    assert_eq!(project.baselines[0].tasks.len(), 9);
    assert_eq!(project.active_baseline_id.as_deref(), Some(project.baselines[0].id.as_str()));
}

#[test]
fn reading_leaves_file_byte_identical_without_sidecar_files() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("Kopie mit Leerzeichen #2.kairos");
    std::fs::copy(fixture("demo-v2.kairos"), &path).unwrap();
    let before = std::fs::read(&path).unwrap();
    read_project(&path).unwrap();
    assert_eq!(std::fs::read(&path).unwrap(), before);
    for suffix in ["-journal", "-wal", "-shm"] {
        let sidecar = PathBuf::from(format!("{}{suffix}", path.display()));
        assert!(!sidecar.exists(), "{suffix}-Datei wurde angelegt");
    }
}

#[test]
fn serializes_camel_case_with_nulls() {
    let project = read_project(&fixture("demo-v2.kairos")).unwrap();
    let json = serde_json::to_value(&project).unwrap();
    assert!(json.get("hoursPerDay").is_some());
    assert!(json["statusDate"].is_null());
    assert_eq!(json["tasks"][0]["type"], "summary");
    assert!(json["tasks"][0].get("earlyStart").is_some());
    assert!(json["dependencies"][0].get("lagMinutes").is_some());
}
```

Hinweis: `serde_json` ist bereits Dependency (Task 1) und damit in Integrationstests nutzbar.

- [ ] **Step 3: Test laufen lassen – muss fehlschlagen**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --test reader_tests`
Expected: FAIL – u. a. `reads_demo_file` mit `left: 0, right: 9` bei `tasks.len()`.

- [ ] **Step 4: Lesefunktionen in `reader.rs` implementieren**

`read_project` – die letzten zwei Zeilen ersetzen durch:
```rust
    let (mut project, default_calendar_id) = read_project_row(&conn, version)?;
    project.tasks = read_tasks(&conn)?;
    project.dependencies = read_dependencies(&conn)?;
    project.calendar = match default_calendar_id {
        Some(id) => read_calendar(&conn, &id)?,
        None => None,
    };
    project.baselines = read_baselines(&conn)?;
    Ok(project)
```

Neue Funktionen am Ende von `reader.rs`:
```rust
fn flag(value: Option<i64>) -> bool {
    value.unwrap_or(0) != 0
}

fn read_tasks(conn: &Connection) -> Result<Vec<TaskDto>, ReadError> {
    let cols = columns(conn, "task")?;
    let sql = format!(
        "SELECT id, {}, order_index, name, type, duration_minutes, display_unit, percent_complete, \
         {}, {}, {}, {}, {}, {}, {}, {} FROM task ORDER BY rowid",
        col(&cols, "parent_id"),
        col(&cols, "deadline"),
        col(&cols, "early_start"),
        col(&cols, "early_finish"),
        col(&cols, "total_float"),
        col(&cols, "free_float"),
        col(&cols, "is_critical"),
        col(&cols, "deadline_missed"),
        col(&cols, "fixed_finish"),
    );
    let mut stmt = conn.prepare(&sql)?;
    let tasks = stmt
        .query_map([], |row| {
            Ok(TaskDto {
                id: row.get(0)?,
                parent_id: row.get(1)?,
                order_index: row.get(2)?,
                name: row.get(3)?,
                task_type: row.get(4)?,
                duration_minutes: row.get(5)?,
                display_unit: row.get(6)?,
                percent_complete: row.get(7)?,
                deadline: row.get(8)?,
                early_start: row.get(9)?,
                early_finish: row.get(10)?,
                total_float: row.get(11)?,
                free_float: row.get(12)?,
                is_critical: flag(row.get(13)?),
                deadline_missed: flag(row.get(14)?),
                fixed_finish: row.get(15)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(tasks)
}

fn read_dependencies(conn: &Connection) -> Result<Vec<DependencyDto>, ReadError> {
    let mut stmt =
        conn.prepare("SELECT predecessor_id, successor_id, type, lag_minutes FROM dependency ORDER BY rowid")?;
    let deps = stmt
        .query_map([], |row| {
            Ok(DependencyDto {
                predecessor_id: row.get(0)?,
                successor_id: row.get(1)?,
                dep_type: row.get(2)?,
                lag_minutes: row.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(deps)
}

fn read_calendar(conn: &Connection, calendar_id: &str) -> Result<Option<CalendarDto>, ReadError> {
    if columns(conn, "calendar_workweek")?.is_empty() {
        return Ok(None);
    }
    let mut stmt =
        conn.prepare("SELECT weekday, is_working FROM calendar_workweek WHERE calendar_id = ?1 ORDER BY weekday")?;
    let workweek = stmt
        .query_map([calendar_id], |row| {
            Ok(WorkdayDto { weekday: row.get(0)?, is_working: flag(row.get(1)?) })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let exceptions = if columns(conn, "calendar_exception")?.is_empty() {
        Vec::new()
    } else {
        let mut stmt =
            conn.prepare("SELECT date, is_working FROM calendar_exception WHERE calendar_id = ?1 ORDER BY date")?;
        let rows = stmt
            .query_map([calendar_id], |row| {
                Ok(CalendarExceptionDto { date: row.get(0)?, is_working: flag(row.get(1)?) })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };
    Ok(Some(CalendarDto { workweek, exceptions }))
}

fn read_baselines(conn: &Connection) -> Result<Vec<BaselineDto>, ReadError> {
    let baseline_cols = columns(conn, "baseline")?;
    if baseline_cols.is_empty() || columns(conn, "baseline_task")?.is_empty() {
        return Ok(Vec::new());
    }
    let order = if baseline_cols.contains("captured_at") { "captured_at, rowid" } else { "rowid" };
    let mut stmt = conn.prepare(&format!("SELECT id, name FROM baseline ORDER BY {order}"))?;
    let heads = stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?
        .collect::<Result<Vec<_>, _>>()?;
    let mut task_stmt =
        conn.prepare("SELECT task_id, start, finish FROM baseline_task WHERE baseline_id = ?1 ORDER BY rowid")?;
    let mut baselines = Vec::with_capacity(heads.len());
    for (id, name) in heads {
        let tasks = task_stmt
            .query_map([&id], |row| {
                Ok(BaselineTaskDto { task_id: row.get(0)?, start: row.get(1)?, finish: row.get(2)? })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        baselines.push(BaselineDto { id, name, tasks });
    }
    Ok(baselines)
}
```

- [ ] **Step 5: Tests laufen lassen – müssen bestehen**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --test reader_tests`
Expected: PASS (14 Tests), keine Warnungen.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/reader.rs src-tauri/tests
git commit -m "feat(reader): Vorgänge, Abhängigkeiten, Kalender und Baselines schema-tolerant lesen"
```

---

### Task 4: Tauri-Commands und Dateiübergabe beim Start

**Files:**
- Modify: `src-tauri/src/lib.rs` (komplett ersetzen)

**Interfaces:**
- Consumes: `reader::read_project`, `reader::ProjectDto`.
- Produces (für das Frontend, Task 12/13):
  - Command `open_project` mit Argument `{ path: string }` → `ProjectDto` oder Fehlertext (string)
  - Command `initial_file` → `string | null` (einmalig; danach `null`)
  - Command `print_window` → öffnet den System-Druckdialog
  - Event `open-file` (Payload: Pfad als string) bei macOS-Dateiöffnung zur Laufzeit
  - `pub fn kairos_arg<I: IntoIterator<Item = String>>(args: I) -> Option<String>`

- [ ] **Step 1: Failing test schreiben** – `src-tauri/src/lib.rs` komplett ersetzen durch:

```rust
pub mod reader;

/// Erstes Programmargument (ohne Programmnamen), das auf `.kairos` endet – Windows/Linux übergeben
/// per Doppelklick geöffnete Dateien so.
pub fn kairos_arg<I: IntoIterator<Item = String>>(args: I) -> Option<String> {
    let _ = args;
    None
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .run(tauri::generate_context!())
        .expect("Kairos Viewer konnte nicht gestartet werden");
}

#[cfg(test)]
mod tests {
    use super::kairos_arg;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn finds_kairos_argument_case_insensitive() {
        assert_eq!(
            kairos_arg(args(&["viewer.exe", "--flag", "C:\\Daten\\Plan.KAIROS"])),
            Some("C:\\Daten\\Plan.KAIROS".to_string())
        );
    }

    #[test]
    fn ignores_program_name_and_other_files() {
        assert_eq!(kairos_arg(args(&["/x/a.kairos"])), None);
        assert_eq!(kairos_arg(args(&["viewer", "notiz.txt"])), None);
    }
}
```

- [ ] **Step 2: Test laufen lassen – muss fehlschlagen**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib`
Expected: FAIL – `finds_kairos_argument_case_insensitive` (`left: None`).

- [ ] **Step 3: Implementierung** – in `lib.rs` die Funktionen `kairos_arg` und `run` ersetzen durch:

```rust
use std::sync::Mutex;
use tauri::Manager;

/// Datei, die vor dem Laden des Frontends übergeben wurde (argv oder macOS „Opened“).
#[derive(Default)]
struct PendingFile(Mutex<Option<String>>);

pub fn kairos_arg<I: IntoIterator<Item = String>>(args: I) -> Option<String> {
    args.into_iter().skip(1).find(|a| a.to_lowercase().ends_with(".kairos"))
}

#[tauri::command]
fn open_project(path: String) -> Result<reader::ProjectDto, String> {
    reader::read_project(std::path::Path::new(&path)).map_err(|e| e.to_string())
}

#[tauri::command]
fn initial_file(pending: tauri::State<'_, PendingFile>) -> Option<String> {
    pending.0.lock().unwrap().take()
}

#[tauri::command]
fn print_window(window: tauri::WebviewWindow) -> Result<(), String> {
    window.print().map_err(|e| e.to_string())
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(PendingFile(Mutex::new(kairos_arg(std::env::args()))))
        .invoke_handler(tauri::generate_handler![open_project, initial_file, print_window])
        .build(tauri::generate_context!())
        .expect("Kairos Viewer konnte nicht gestartet werden");

    app.run(|_handle, _event| {
        // macOS liefert per Finder geöffnete Dateien als Event statt als Argument.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = &_event {
            use tauri::Emitter;
            let path = urls
                .iter()
                .filter_map(|url| url.to_file_path().ok())
                .map(|p| p.to_string_lossy().into_owned())
                .find(|p| p.to_lowercase().ends_with(".kairos"));
            if let Some(path) = path {
                *_handle.state::<PendingFile>().0.lock().unwrap() = Some(path.clone());
                let _ = _handle.emit("open-file", path);
            }
        }
    });
}
```

(`use tauri::Manager;` wird für `state()` gebraucht; auf Nicht-macOS ggf. als unbenutzt gewarnt – dann `#[allow(unused_imports)]` über die `use`-Zeile setzen.)

- [ ] **Step 4: Tests laufen lassen – müssen bestehen**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS (2 Lib-Tests + 14 Reader-Tests).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(app): Commands open_project, initial_file, print_window und Dateiübergabe beim Start"
```

---

### Task 5: Modell-Typen und Vorgangsbaum

**Files:**
- Create: `src/model.ts`, `src/tree.ts`, `tests/fixtures/demo.ts`
- Delete: `tests/smoke.test.ts`
- Test: `tests/tree.test.ts`

**Interfaces:**
- Produces:
  - `model.ts`: `TaskType`, `DisplayUnit`, `DependencyType`, `TaskDto`, `DependencyDto`, `WorkdayDto`, `CalendarExceptionDto`, `CalendarDto`, `BaselineTaskDto`, `BaselineDto`, `ProjectDto` (siehe Code)
  - `tree.ts`: `interface TreeNode { task: TaskDto; depth: number; nr: number; children: TreeNode[] }`, `interface Tree { roots: TreeNode[]; byId: Map<string, TreeNode>; preorder: TreeNode[] }`, `interface VisibleRow { node: TreeNode; hasChildren: boolean; collapsed: boolean }`, `buildTree(tasks: TaskDto[]): Tree`, `visibleRows(tree: Tree, collapsed: ReadonlySet<string>): VisibleRow[]`, `parentIds(tree: Tree): Set<string>`
  - `tests/fixtures/demo.ts`: `task(partial)`, `dep(pred, succ, type?, lag?)`, `demoProject(): ProjectDto`

- [ ] **Step 1: `src/model.ts` anlegen**

```ts
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
```

- [ ] **Step 2: Test-Fixture `tests/fixtures/demo.ts` anlegen** (Werte aus `Kairos-Demo.kairos`)

```ts
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

/** Demo-Projekt; Vorgänge bewusst NICHT in Baumreihenfolge. */
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
```

- [ ] **Step 3: Failing tests `tests/tree.test.ts` schreiben**

```ts
import { describe, expect, test } from 'vitest';
import { buildTree, parentIds, visibleRows } from '../src/tree';
import { demoProject, task } from './fixtures/demo';

describe('buildTree', () => {
  test('ordnet nach Hierarchie und order_index, Nr ist Preorder', () => {
    const tree = buildTree(demoProject().tasks);
    expect(tree.preorder.map((n) => [n.nr, n.task.name, n.depth])).toEqual([
      [1, 'Konzeption', 0],
      [2, 'Anforderungen', 1],
      [3, 'Wireframes', 1],
      [4, 'Umsetzung', 0],
      [5, 'Frontend', 1],
      [6, 'Backend', 1],
      [7, 'Integration', 1],
      [8, 'Tests', 0],
      [9, 'Go-Live', 0],
    ]);
    expect(tree.byId.get('backend')?.nr).toBe(6);
  });

  test('gleicher order_index wird deterministisch über die id sortiert', () => {
    const tree = buildTree([task({ id: 'b', name: 'B' }), task({ id: 'a', name: 'A' })]);
    expect(tree.preorder.map((n) => n.task.id)).toEqual(['a', 'b']);
  });

  test('unbekannte parent_id wird zur Wurzel', () => {
    const tree = buildTree([task({ id: 'x', name: 'X', parentId: 'gibt-es-nicht' })]);
    expect(tree.roots.map((n) => n.task.id)).toEqual(['x']);
  });

  test('Selbstbezug und Eltern-Zyklus: jeder Vorgang genau einmal, kein Hängen', () => {
    const tree = buildTree([
      task({ id: 's', name: 'Selbst', parentId: 's' }),
      task({ id: 'a', name: 'A', parentId: 'b', orderIndex: 1 }),
      task({ id: 'b', name: 'B', parentId: 'a', orderIndex: 2 }),
    ]);
    expect(tree.preorder.map((n) => n.task.id).sort()).toEqual(['a', 'b', 's']);
    expect(tree.preorder.map((n) => n.nr)).toEqual([1, 2, 3]);
  });

  test('leere Liste ergibt leeren Baum', () => {
    const tree = buildTree([]);
    expect(tree.roots).toEqual([]);
    expect(tree.preorder).toEqual([]);
  });
});

describe('visibleRows', () => {
  test('alles aufgeklappt zeigt alle Zeilen', () => {
    const rows = visibleRows(buildTree(demoProject().tasks), new Set());
    expect(rows).toHaveLength(9);
    expect(rows[0]).toMatchObject({ hasChildren: true, collapsed: false });
    expect(rows[1]).toMatchObject({ hasChildren: false, collapsed: false });
  });

  test('eingeklappter Sammelvorgang verbirgt seine Kinder', () => {
    const rows = visibleRows(buildTree(demoProject().tasks), new Set(['umsetzung']));
    expect(rows.map((r) => r.node.task.name)).toEqual(['Konzeption', 'Anforderungen', 'Wireframes', 'Umsetzung', 'Tests', 'Go-Live']);
    expect(rows[3].collapsed).toBe(true);
  });

  test('ein Blatt kann nicht eingeklappt sein', () => {
    const rows = visibleRows(buildTree(demoProject().tasks), new Set(['tests']));
    expect(rows.find((r) => r.node.task.id === 'tests')?.collapsed).toBe(false);
  });
});

test('parentIds liefert alle Vorgänge mit Kindern', () => {
  expect([...parentIds(buildTree(demoProject().tasks))].sort()).toEqual(['konzeption', 'umsetzung']);
});
```

- [ ] **Step 4: Test laufen lassen – muss fehlschlagen**

Run: `rm tests/smoke.test.ts && npm test`
Expected: FAIL – „Failed to resolve import ../src/tree“.

- [ ] **Step 5: `src/tree.ts` implementieren**

```ts
import type { TaskDto } from './model';

export interface TreeNode {
  task: TaskDto;
  depth: number;
  /** 1-basierte Preorder-Nummer (Nr.-Spalte wie in Kairos). */
  nr: number;
  children: TreeNode[];
}

export interface Tree {
  roots: TreeNode[];
  byId: Map<string, TreeNode>;
  preorder: TreeNode[];
}

export interface VisibleRow {
  node: TreeNode;
  hasChildren: boolean;
  collapsed: boolean;
}

function compareTasks(a: TaskDto, b: TaskDto): number {
  if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function buildTree(tasks: TaskDto[]): Tree {
  const ids = new Set(tasks.map((t) => t.id));
  const childrenOf = new Map<string | null, TaskDto[]>();
  for (const t of tasks) {
    const parent = t.parentId !== null && t.parentId !== t.id && ids.has(t.parentId) ? t.parentId : null;
    const list = childrenOf.get(parent) ?? [];
    list.push(t);
    childrenOf.set(parent, list);
  }
  for (const list of childrenOf.values()) list.sort(compareTasks);

  const byId = new Map<string, TreeNode>();
  const preorder: TreeNode[] = [];
  const visit = (t: TaskDto, depth: number): TreeNode => {
    const node: TreeNode = { task: t, depth, nr: 0, children: [] };
    byId.set(t.id, node);
    preorder.push(node);
    node.nr = preorder.length;
    for (const child of childrenOf.get(t.id) ?? []) {
      if (!byId.has(child.id)) node.children.push(visit(child, depth + 1));
    }
    return node;
  };

  const roots = (childrenOf.get(null) ?? []).map((t) => visit(t, 0));
  // Vorgänge in Eltern-Zyklen sind von keiner Wurzel erreichbar – als zusätzliche Wurzeln anhängen.
  for (const t of [...tasks].sort(compareTasks)) {
    if (!byId.has(t.id)) roots.push(visit(t, 0));
  }
  return { roots, byId, preorder };
}

export function visibleRows(tree: Tree, collapsed: ReadonlySet<string>): VisibleRow[] {
  const rows: VisibleRow[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      const hasChildren = node.children.length > 0;
      const isCollapsed = hasChildren && collapsed.has(node.task.id);
      rows.push({ node, hasChildren, collapsed: isCollapsed });
      if (!isCollapsed) walk(node.children);
    }
  };
  walk(tree.roots);
  return rows;
}

export function parentIds(tree: Tree): Set<string> {
  return new Set(tree.preorder.filter((n) => n.children.length > 0).map((n) => n.task.id));
}
```

- [ ] **Step 6: Tests laufen lassen – müssen bestehen**

Run: `npm test`
Expected: PASS (9 Tests).

- [ ] **Step 7: Commit**

```bash
git add src/model.ts src/tree.ts tests
git commit -m "feat(tree): DTO-Typen und Vorgangsbaum mit Preorder-Nummern"
```

---

### Task 6: Formatierung (Dauer, Puffer, Datum, Prozent)

**Files:**
- Create: `src/format.ts`
- Test: `tests/format.test.ts`

**Interfaces:**
- Consumes: `DisplayUnit` aus `model.ts`.
- Produces: `minutesPerDay(hoursPerDay: number): number`, `formatDuration(minutes: number, unit: DisplayUnit, hoursPerDay: number): string`, `formatFloat(minutes: number | null, hoursPerDay: number): string`, `formatDateTime(civil: string | null): string`, `formatPercent(fraction: number): string`

- [ ] **Step 1: Failing tests schreiben**

```ts
import { describe, expect, test } from 'vitest';
import { formatDateTime, formatDuration, formatFloat, formatPercent, minutesPerDay } from '../src/format';

describe('formatDuration', () => {
  test.each([
    [1440, 'd', 8, '3 d'],
    [960, 'd', 8, '2 d'],
    [720, 'd', 8, '1.5 d'],
    [500, 'd', 8, '1.04 d'],
    [0, 'd', 8, '0 d'],
    [90, 'h', 8, '1.5 h'],
    [45, 'min', 8, '45 min'],
    [480, 'd', 0, '0 d'],
  ] as const)('%i min als %s bei %i h/Tag → %s', (minutes, unit, hpd, expected) => {
    expect(formatDuration(minutes, unit, hpd)).toBe(expected);
  });
});

describe('formatFloat', () => {
  test.each([
    [null, ''],
    [0, '0 d'],
    [960, '2 d'],
    [-960, '-2 d'],
    [90, '1.5 h'],
    [37020, '617 h'],
  ] as const)('%s min → %s', (minutes, expected) => {
    expect(formatFloat(minutes, 8)).toBe(expected);
  });

  test('ohne Stunden pro Tag keine Division durch null', () => {
    expect(formatFloat(120, 0)).toBe('2 h');
  });
});

describe('formatDateTime', () => {
  test.each([
    ['2026-06-25T08:00', '25.06.26, 08:00'],
    ['2026-07-14', '14.07.26'],
    [null, ''],
    ['kaputt', 'kaputt'],
  ] as const)('%s → %s', (input, expected) => {
    expect(formatDateTime(input)).toBe(expected);
  });
});

test('formatPercent rundet auf ganze Prozent', () => {
  expect(formatPercent(0.5)).toBe('50 %');
  expect(formatPercent(1)).toBe('100 %');
  expect(formatPercent(0.333)).toBe('33 %');
});

test('minutesPerDay', () => {
  expect(minutesPerDay(8)).toBe(480);
  expect(minutesPerDay(7.5)).toBe(450);
});
```

- [ ] **Step 2: Test laufen lassen – muss fehlschlagen**

Run: `npm test -- tests/format.test.ts`
Expected: FAIL – „Failed to resolve import ../src/format“.

- [ ] **Step 3: `src/format.ts` implementieren**

```ts
import type { DisplayUnit } from './model';

export function minutesPerDay(hoursPerDay: number): number {
  return Math.round(hoursPerDay * 60);
}

/** Zahl mit höchstens zwei Nachkommastellen und Dezimalpunkt (wie Kairos' DurationParser). */
function number(value: number): string {
  return String(Math.round(value * 100) / 100);
}

export function formatDuration(minutes: number, unit: DisplayUnit, hoursPerDay: number): string {
  const mpd = minutesPerDay(hoursPerDay);
  const value = unit === 'min' ? minutes : unit === 'h' ? minutes / 60 : mpd > 0 ? minutes / mpd : 0;
  return `${number(value)} ${unit}`;
}

/** Puffer: ganze Tage, sonst Stunden; negativ mit „-“ (wie Kairos' FloatText). */
export function formatFloat(minutes: number | null, hoursPerDay: number): string {
  if (minutes === null) return '';
  const mpd = minutesPerDay(hoursPerDay);
  const magnitude = Math.abs(minutes);
  const unit: DisplayUnit = mpd > 0 && magnitude % mpd === 0 ? 'd' : 'h';
  const body = formatDuration(magnitude, unit, hoursPerDay);
  return minutes < 0 ? `-${body}` : body;
}

const CIVIL = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/;

export function formatDateTime(civil: string | null): string {
  if (!civil) return '';
  const m = CIVIL.exec(civil);
  if (!m) return civil;
  const date = `${m[3]}.${m[2]}.${m[1].slice(2)}`;
  return m[4] ? `${date}, ${m[4]}:${m[5]}` : date;
}

export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)} %`;
}
```

- [ ] **Step 4: Tests laufen lassen – müssen bestehen**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/format.ts tests/format.test.ts
git commit -m "feat(format): Dauer, Puffer, Datum und Prozent wie in Kairos formatieren"
```

---

### Task 7: Vorgänger-Text

**Files:**
- Create: `src/predecessors.ts`
- Test: `tests/predecessors.test.ts`

**Interfaces:**
- Consumes: `Tree` (`byId`, `nr`) aus `tree.ts`; `minutesPerDay` aus `format.ts`; `DependencyDto`.
- Produces: `formatLag(lagMinutes: number, minutesPerDay: number): string`, `predecessorTexts(dependencies: DependencyDto[], tree: Tree, hoursPerDay: number): Map<string, string>` (Schlüssel = Nachfolger-ID; Vorgänge ohne Vorgänger fehlen in der Map)

- [ ] **Step 1: Failing tests schreiben**

```ts
import { describe, expect, test } from 'vitest';
import { formatLag, predecessorTexts } from '../src/predecessors';
import { buildTree } from '../src/tree';
import { dep, demoProject } from './fixtures/demo';

describe('predecessorTexts', () => {
  const project = demoProject();
  const tree = buildTree(project.tasks);

  test('Demo-Projekt wie in Kairos', () => {
    const texts = predecessorTexts(project.dependencies, tree, 8);
    expect(texts.get('wireframes')).toBe('2');
    expect(texts.get('frontend')).toBe('3');
    expect(texts.get('backend')).toBe('5SS');
    expect(texts.get('integration')).toBe('5, 6');
    expect(texts.get('golive')).toBe('8');
    expect(texts.get('konzeption')).toBeUndefined();
  });

  test('Typ und Lag werden angehängt', () => {
    const texts = predecessorTexts(
      [dep('anforderungen', 'tests', 'FF', 960), dep('wireframes', 'tests', 'SF', -120)],
      tree,
      8,
    );
    expect(texts.get('tests')).toBe('2FF+2d, 3SF-2h');
  });

  test('Abhängigkeiten zu unbekannten Vorgängen werden übersprungen', () => {
    const texts = predecessorTexts([dep('gibt-es-nicht', 'tests'), dep('tests', 'auch-nicht')], tree, 8);
    expect(texts.size).toBe(0);
  });
});

describe('formatLag', () => {
  test.each([
    [960, '+2d'],
    [-480, '-1d'],
    [-120, '-2h'],
    [45, '+45min'],
    [90, '+90min'],
  ])('%i → %s', (lag, expected) => {
    expect(formatLag(lag, 480)).toBe(expected);
  });

  test('ohne Minuten pro Tag nur Stunden/Minuten', () => {
    expect(formatLag(480, 0)).toBe('+8h');
  });
});
```

- [ ] **Step 2: Test laufen lassen – muss fehlschlagen**

Run: `npm test -- tests/predecessors.test.ts`
Expected: FAIL – „Failed to resolve import ../src/predecessors“.

- [ ] **Step 3: `src/predecessors.ts` implementieren**

```ts
import { minutesPerDay } from './format';
import type { DependencyDto } from './model';
import type { Tree } from './tree';

/** Lag kompakt mit Vorzeichen: ganze Tage → d, ganze Stunden → h, sonst min (wie DependencyTokenIO). */
export function formatLag(lagMinutes: number, mpd: number): string {
  const abs = Math.abs(lagMinutes);
  const body = mpd > 0 && abs % mpd === 0 ? `${abs / mpd}d` : abs % 60 === 0 ? `${abs / 60}h` : `${abs}min`;
  return (lagMinutes < 0 ? '-' : '+') + body;
}

export function predecessorTexts(dependencies: DependencyDto[], tree: Tree, hoursPerDay: number): Map<string, string> {
  const mpd = minutesPerDay(hoursPerDay);
  const tokens = new Map<string, string[]>();
  for (const d of dependencies) {
    const predecessor = tree.byId.get(d.predecessorId);
    if (!predecessor || !tree.byId.has(d.successorId)) continue;
    let token = String(predecessor.nr);
    if (d.type !== 'FS') token += d.type;
    if (d.lagMinutes !== 0) token += formatLag(d.lagMinutes, mpd);
    const list = tokens.get(d.successorId) ?? [];
    list.push(token);
    tokens.set(d.successorId, list);
  }
  return new Map([...tokens].map(([id, list]) => [id, list.join(', ')]));
}
```

- [ ] **Step 4: Tests laufen lassen – müssen bestehen**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/predecessors.ts tests/predecessors.test.ts
git commit -m "feat(predecessors): Vorgänger-Text im Kairos-Format"
```

---

### Task 8: Kalender-Arithmetik und Zeitskala

**Files:**
- Create: `src/gantt/calendar.ts`, `src/gantt/scale.ts`
- Test: `tests/calendar.test.ts`, `tests/scale.test.ts`

**Interfaces:**
- Consumes: `CalendarDto`, `ProjectDto`.
- Produces:
  - `calendar.ts`: `isCivil(s: string | null): s is string`, `dayNumber(civil: string): number`, `minuteOfDay(civil: string): number`, `civilFromDayNumber(day: number): string`, `isoWeekday(day: number): number` (0 = Mo), `isoWeek(day: number): number`, `makeWorkingDayFn(calendar: CalendarDto | null): (day: number) => boolean`, `todayCivil(now?: Date): string`
  - `scale.ts`: `type Zoom = 'day' | 'week' | 'month'`, `PX_PER_DAY: Record<Zoom, number>`, `interface TimeScale { zoom: Zoom; pxPerDay: number; startDay: number; endDay: number; width: number; x(civil: string): number; xDay(day: number): number }`, `computeRange(project: ProjectDto, baselineId: string | null, today: string): { startDay: number; endDay: number }`, `createScale(zoom: Zoom, startDay: number, endDay: number): TimeScale`, `interface AxisCell { x: number; width: number; label: string }`, `axisRows(scale: TimeScale): { top: AxisCell[]; bottom: AxisCell[] }`

- [ ] **Step 1: Failing tests `tests/calendar.test.ts`**

```ts
import { describe, expect, test } from 'vitest';
import {
  civilFromDayNumber, dayNumber, isCivil, isoWeek, isoWeekday, makeWorkingDayFn, minuteOfDay, todayCivil,
} from '../src/gantt/calendar';

describe('Civil-Datum', () => {
  test('dayNumber und Umkehrung', () => {
    expect(dayNumber('1970-01-02')).toBe(1);
    expect(dayNumber('2026-06-25T14:00')).toBe(dayNumber('2026-06-25'));
    expect(civilFromDayNumber(dayNumber('2026-06-25'))).toBe('2026-06-25');
  });

  test('minuteOfDay', () => {
    expect(minuteOfDay('2026-06-25T14:30')).toBe(870);
    expect(minuteOfDay('2026-06-25')).toBe(0);
  });

  test('isCivil', () => {
    expect(isCivil('2026-06-25')).toBe(true);
    expect(isCivil('2026-06-25T08:00')).toBe(true);
    expect(isCivil('25.06.2026')).toBe(false);
    expect(isCivil(null)).toBe(false);
  });

  test('Wochentag 0 = Montag', () => {
    expect(isoWeekday(dayNumber('2026-06-25'))).toBe(3);
    expect(isoWeekday(dayNumber('2026-06-29'))).toBe(0);
    expect(isoWeekday(dayNumber('2026-06-28'))).toBe(6);
  });

  test('ISO-Kalenderwoche inklusive Jahreswechsel', () => {
    expect(isoWeek(dayNumber('2026-06-25'))).toBe(26);
    expect(isoWeek(dayNumber('2027-01-01'))).toBe(53);
    expect(isoWeek(dayNumber('2026-01-01'))).toBe(1);
  });

  test('todayCivil nutzt das lokale Datum', () => {
    expect(todayCivil(new Date(2026, 9, 6, 23, 30))).toBe('2026-10-06');
  });
});

describe('makeWorkingDayFn', () => {
  test('ohne Kalender Montag bis Freitag', () => {
    const working = makeWorkingDayFn(null);
    expect(working(dayNumber('2026-06-26'))).toBe(true);
    expect(working(dayNumber('2026-06-27'))).toBe(false);
  });

  test('Arbeitswoche und Ausnahmen des Kalenders', () => {
    const working = makeWorkingDayFn({
      workweek: [0, 1, 2, 3, 4].map((weekday) => ({ weekday, isWorking: weekday !== 2 })),
      exceptions: [
        { date: '2026-06-26', isWorking: false },
        { date: '2026-06-27', isWorking: true },
      ],
    });
    expect(working(dayNumber('2026-06-24'))).toBe(false);
    expect(working(dayNumber('2026-06-25'))).toBe(true);
    expect(working(dayNumber('2026-06-26'))).toBe(false);
    expect(working(dayNumber('2026-06-27'))).toBe(true);
    expect(working(dayNumber('2026-06-28'))).toBe(false);
  });
});
```

- [ ] **Step 2: Failing tests `tests/scale.test.ts`**

```ts
import { describe, expect, test } from 'vitest';
import { dayNumber } from '../src/gantt/calendar';
import { axisRows, computeRange, createScale } from '../src/gantt/scale';
import { demoProject } from './fixtures/demo';

describe('computeRange', () => {
  test('frühester Start − 2 Tage bis spätestes Ende + 7 Tage', () => {
    const range = computeRange(demoProject(), null, '2030-01-01');
    expect(range).toEqual({ startDay: dayNumber('2026-06-23'), endDay: dayNumber('2026-07-21') });
  });

  test('Baseline-Termine erweitern den Bereich', () => {
    const project = demoProject();
    project.baselines[0].tasks.push({ taskId: 'golive', start: '2026-08-01T08:00', finish: '2026-08-03T08:00' });
    expect(computeRange(project, 'bl1', '2030-01-01').endDay).toBe(dayNumber('2026-08-10'));
    expect(computeRange(project, null, '2030-01-01').endDay).toBe(dayNumber('2026-07-21'));
  });

  test('ohne Termine: Projektstart, sonst heute', () => {
    const project = { ...demoProject(), tasks: [], baselines: [], startDate: '2026-01-05' };
    expect(computeRange(project, null, '2030-01-01')).toEqual({
      startDay: dayNumber('2026-01-03'),
      endDay: dayNumber('2026-02-04'),
    });
    expect(computeRange({ ...project, startDate: null }, null, '2030-01-10').startDay).toBe(dayNumber('2030-01-08'));
  });
});

describe('createScale', () => {
  test('Datum → x mit Uhrzeit-Anteil', () => {
    const scale = createScale('day', dayNumber('2026-06-23'), dayNumber('2026-07-21'));
    expect(scale.pxPerDay).toBe(70);
    expect(scale.x('2026-06-25T12:00')).toBe(175);
    expect(scale.xDay(dayNumber('2026-06-24'))).toBe(70);
    expect(scale.width).toBe(29 * 70);
  });

  test('Zoomstufen', () => {
    expect(createScale('week', 0, 0).pxPerDay).toBe(23);
    expect(createScale('month', 0, 0).pxPerDay).toBe(7);
  });
});

describe('axisRows', () => {
  test('Tageszoom: oben KW, unten Tage', () => {
    const rows = axisRows(createScale('day', dayNumber('2026-06-23'), dayNumber('2026-06-30')));
    expect(rows.bottom[0]).toEqual({ x: 0, width: 70, label: 'Di 23' });
    expect(rows.bottom).toHaveLength(8);
    expect(rows.top.map((c) => c.label)).toEqual(['KW 26 · 2026', 'KW 27 · 2026']);
    expect(rows.top[0].width).toBe(6 * 70);
  });

  test('Wochenzoom: oben Monate, unten KW', () => {
    const rows = axisRows(createScale('week', dayNumber('2026-06-23'), dayNumber('2026-07-21')));
    expect(rows.top.map((c) => c.label)).toEqual(['Juni 2026', 'Juli 2026']);
    expect(rows.bottom[0].label).toBe('KW 26');
  });

  test('Monatszoom: oben Jahre, unten Monate', () => {
    const rows = axisRows(createScale('month', dayNumber('2026-12-20'), dayNumber('2027-01-10')));
    expect(rows.top.map((c) => c.label)).toEqual(['2026', '2027']);
    expect(rows.bottom.map((c) => c.label)).toEqual(['Dez', 'Jan']);
  });
});
```

- [ ] **Step 3: Tests laufen lassen – müssen fehlschlagen**

Run: `npm test -- tests/calendar.test.ts tests/scale.test.ts`
Expected: FAIL – Imports nicht auflösbar.

- [ ] **Step 4: `src/gantt/calendar.ts` implementieren**

```ts
import type { CalendarDto } from '../model';

const MS_PER_DAY = 86_400_000;
const CIVIL = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;

export function isCivil(s: string | null): s is string {
  return s !== null && CIVIL.test(s);
}

/** Tage seit 1970-01-01 (UTC-Arithmetik, zeitzonenunabhängig). */
export function dayNumber(civil: string): number {
  const y = Number(civil.slice(0, 4));
  const m = Number(civil.slice(5, 7));
  const d = Number(civil.slice(8, 10));
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

export function minuteOfDay(civil: string): number {
  if (civil.length < 16) return 0;
  return Number(civil.slice(11, 13)) * 60 + Number(civil.slice(14, 16));
}

export function civilFromDayNumber(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

/** 0 = Montag … 6 = Sonntag (1970-01-01 war ein Donnerstag). */
export function isoWeekday(day: number): number {
  return (((day + 3) % 7) + 7) % 7;
}

export function isoWeek(day: number): number {
  const thursday = day - isoWeekday(day) + 3;
  const jan1 = dayNumber(`${civilFromDayNumber(thursday).slice(0, 4)}-01-01`);
  return Math.floor((thursday - jan1) / 7) + 1;
}

export function makeWorkingDayFn(calendar: CalendarDto | null): (day: number) => boolean {
  const exceptions = new Map((calendar?.exceptions ?? []).map((e) => [e.date, e.isWorking]));
  const week =
    calendar && calendar.workweek.length > 0
      ? new Set(calendar.workweek.filter((w) => w.isWorking).map((w) => w.weekday))
      : new Set([0, 1, 2, 3, 4]);
  return (day) => exceptions.get(civilFromDayNumber(day)) ?? week.has(isoWeekday(day));
}

export function todayCivil(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
```

- [ ] **Step 5: `src/gantt/scale.ts` implementieren**

```ts
import type { ProjectDto } from '../model';
import { civilFromDayNumber, dayNumber, isCivil, isoWeek, isoWeekday, minuteOfDay } from './calendar';

export type Zoom = 'day' | 'week' | 'month';

export const PX_PER_DAY: Record<Zoom, number> = { day: 70, week: 23, month: 7 };

export interface TimeScale {
  zoom: Zoom;
  pxPerDay: number;
  startDay: number;
  endDay: number;
  width: number;
  x(civil: string): number;
  xDay(day: number): number;
}

export interface AxisCell {
  x: number;
  width: number;
  label: string;
}

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export function computeRange(project: ProjectDto, baselineId: string | null, today: string): { startDay: number; endDay: number } {
  const dates: string[] = [];
  for (const t of project.tasks) {
    if (isCivil(t.earlyStart)) dates.push(t.earlyStart);
    if (isCivil(t.earlyFinish)) dates.push(t.earlyFinish);
  }
  const baseline = project.baselines.find((b) => b.id === baselineId);
  for (const bt of baseline?.tasks ?? []) {
    if (isCivil(bt.start)) dates.push(bt.start);
    if (isCivil(bt.finish)) dates.push(bt.finish);
  }
  if (dates.length === 0) {
    const base = dayNumber(isCivil(project.startDate) ? project.startDate : today);
    return { startDay: base - 2, endDay: base + 30 };
  }
  const days = dates.map(dayNumber);
  return { startDay: Math.min(...days) - 2, endDay: Math.max(...days) + 7 };
}

export function createScale(zoom: Zoom, startDay: number, endDay: number): TimeScale {
  const pxPerDay = PX_PER_DAY[zoom];
  return {
    zoom,
    pxPerDay,
    startDay,
    endDay,
    width: (endDay - startDay + 1) * pxPerDay,
    x: (civil) => (dayNumber(civil) - startDay + minuteOfDay(civil) / 1440) * pxPerDay,
    xDay: (day) => (day - startDay) * pxPerDay,
  };
}

/** Fasst aufeinanderfolgende Tage mit gleichem Schlüssel zu Achsenzellen zusammen. */
function group(scale: TimeScale, key: (day: number) => string, label: (day: number) => string): AxisCell[] {
  const cells: AxisCell[] = [];
  let currentKey: string | null = null;
  for (let day = scale.startDay; day <= scale.endDay; day++) {
    const k = key(day);
    if (k === currentKey) {
      cells[cells.length - 1].width += scale.pxPerDay;
    } else {
      cells.push({ x: scale.xDay(day), width: scale.pxPerDay, label: label(day) });
      currentKey = k;
    }
  }
  return cells;
}

const year = (day: number) => civilFromDayNumber(day).slice(0, 4);
const month = (day: number) => Number(civilFromDayNumber(day).slice(5, 7)) - 1;
const weekYear = (day: number) => year(day - isoWeekday(day) + 3);

export function axisRows(scale: TimeScale): { top: AxisCell[]; bottom: AxisCell[] } {
  const weekKey = (d: number) => `${weekYear(d)}-${isoWeek(d)}`;
  const monthKey = (d: number) => civilFromDayNumber(d).slice(0, 7);
  switch (scale.zoom) {
    case 'day':
      return {
        top: group(scale, weekKey, (d) => `KW ${isoWeek(d)} · ${weekYear(d)}`),
        bottom: group(scale, String, (d) => `${WEEKDAYS[isoWeekday(d)]} ${Number(civilFromDayNumber(d).slice(8, 10))}`),
      };
    case 'week':
      return {
        top: group(scale, monthKey, (d) => `${MONTHS[month(d)]} ${year(d)}`),
        bottom: group(scale, weekKey, (d) => `KW ${isoWeek(d)}`),
      };
    case 'month':
      return {
        top: group(scale, year, year),
        bottom: group(scale, monthKey, (d) => MONTHS[month(d)].slice(0, 3)),
      };
  }
}
```

- [ ] **Step 6: Tests laufen lassen – müssen bestehen**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/gantt/calendar.ts src/gantt/scale.ts tests/calendar.test.ts tests/scale.test.ts
git commit -m "feat(gantt): Kalender-Arithmetik, Zoomstufen und Zeitachse"
```

---

### Task 9: Gantt-SVG rendern

**Files:**
- Create: `src/gantt/render.ts`
- Test: `tests/render.test.ts`

**Interfaces:**
- Consumes: `VisibleRow` (tree.ts), `TimeScale`, `axisRows` (scale.ts), `isCivil`, `dayNumber`, `civilFromDayNumber` (calendar.ts), `DependencyDto`, `BaselineTaskDto`.
- Produces: `ROW_HEIGHT = 24`, `AXIS_HEIGHT = 40`, `interface GanttOptions { rows: VisibleRow[]; dependencies: DependencyDto[]; scale: TimeScale; isWorkingDay: (day: number) => boolean; today: string; statusDate: string | null; baseline: Map<string, BaselineTaskDto> | null }`, `renderGanttBody(opts: GanttOptions): SVGSVGElement`, `renderGanttAxis(scale: TimeScale): SVGSVGElement`. CSS-Klassen: `nonworking`, `grid`, `row-line`, `today`, `status-date`, `bar`, `progress`, `summary`, `milestone`, `baseline`, `dep`, `critical`; Marker-IDs `arrow`, `arrow-critical`.

- [ ] **Step 1: Failing tests schreiben**

```ts
import { describe, expect, test } from 'vitest';
import type { BaselineTaskDto } from '../src/model';
import { dayNumber, makeWorkingDayFn } from '../src/gantt/calendar';
import { AXIS_HEIGHT, ROW_HEIGHT, renderGanttAxis, renderGanttBody } from '../src/gantt/render';
import { createScale } from '../src/gantt/scale';
import { buildTree, visibleRows } from '../src/tree';
import { demoProject } from './fixtures/demo';

function render(opts: { collapsed?: string[]; baseline?: boolean; mutate?: (p: ReturnType<typeof demoProject>) => void } = {}) {
  const project = demoProject();
  opts.mutate?.(project);
  const rows = visibleRows(buildTree(project.tasks), new Set(opts.collapsed ?? []));
  const scale = createScale('day', dayNumber('2026-06-23'), dayNumber('2026-07-21'));
  const baseline = opts.baseline ? new Map<string, BaselineTaskDto>(project.baselines[0].tasks.map((t) => [t.taskId, t])) : null;
  return renderGanttBody({
    rows,
    dependencies: project.dependencies,
    scale,
    isWorkingDay: makeWorkingDayFn(project.calendar),
    today: '2026-07-01',
    statusDate: null,
    baseline,
  });
}

describe('renderGanttBody', () => {
  test('Balken, Sammelbalken, Meilenstein und Pfeile des Demo-Projekts', () => {
    const svg = render();
    expect(svg.getAttribute('height')).toBe(String(9 * ROW_HEIGHT));
    expect(svg.getAttribute('width')).toBe(String(29 * 70));
    expect(svg.querySelectorAll('rect.bar')).toHaveLength(6);
    expect(svg.querySelectorAll('rect.bar.critical')).toHaveLength(6);
    expect(svg.querySelectorAll('rect.summary')).toHaveLength(2);
    expect(svg.querySelectorAll('.milestone')).toHaveLength(1);
    expect(svg.querySelectorAll('path.dep')).toHaveLength(7);
    expect(svg.querySelectorAll('path.dep.critical')).toHaveLength(7);
    expect(svg.querySelectorAll('rect.progress')).toHaveLength(6);
    expect(svg.querySelectorAll('.baseline')).toHaveLength(0);
  });

  test('Balkenposition folgt der Zeitskala', () => {
    const bar = render().querySelector('[data-task-id="anforderungen"] rect.bar')!;
    expect(Number(bar.getAttribute('x'))).toBeCloseTo(2 * 70 + (8 / 24) * 70);
    expect(Number(bar.getAttribute('y'))).toBe(ROW_HEIGHT + 5);
  });

  test('Wochenenden werden schattiert, Heute-Linie gezeichnet', () => {
    const svg = render();
    // 2026-06-23..2026-07-21: 4 Samstage + 4 Sonntage
    expect(svg.querySelectorAll('rect.nonworking')).toHaveLength(8);
    expect(svg.querySelectorAll('line.today')).toHaveLength(1);
  });

  test('eingeklappte Vorgänge haben weder Balken noch Pfeile', () => {
    const svg = render({ collapsed: ['umsetzung'] });
    expect(svg.querySelectorAll('rect.bar')).toHaveLength(3);
    expect(svg.querySelectorAll('path.dep')).toHaveLength(2);
  });

  test('Vorgang ohne Termine: kein Balken, keine Pfeile dorthin', () => {
    const svg = render({
      mutate: (p) => {
        const t = p.tasks.find((x) => x.id === 'tests')!;
        t.earlyStart = null;
        t.earlyFinish = null;
      },
    });
    expect(svg.querySelectorAll('rect.bar')).toHaveLength(5);
    expect(svg.querySelectorAll('path.dep')).toHaveLength(5);
  });

  test('Baseline-Balken nur für Einträge mit Terminen', () => {
    expect(render({ baseline: true }).querySelectorAll('rect.baseline')).toHaveLength(2);
  });

  test('Tooltip zeigt den Namen als Text', () => {
    const svg = render({ mutate: (p) => (p.tasks.find((x) => x.id === 'tests')!.name = '<b>Tests</b>') });
    const title = svg.querySelector('[data-task-id="tests"] title')!;
    expect(title.textContent).toBe('<b>Tests</b>');
    expect(svg.querySelector('b')).toBeNull();
  });

  test('leeres Projekt rendert ohne Fehler', () => {
    const svg = render({ mutate: (p) => { p.tasks = []; p.dependencies = []; } });
    expect(svg.getAttribute('height')).toBe('0');
    expect(svg.querySelectorAll('path.dep')).toHaveLength(0);
  });
});

test('renderGanttAxis zeichnet zwei Beschriftungszeilen', () => {
  const axis = renderGanttAxis(createScale('day', dayNumber('2026-06-23'), dayNumber('2026-06-30')));
  expect(axis.getAttribute('height')).toBe(String(AXIS_HEIGHT));
  const labels = [...axis.querySelectorAll('text')].map((t) => t.textContent);
  expect(labels).toContain('KW 26 · 2026');
  expect(labels).toContain('Di 23');
});
```

- [ ] **Step 2: Test laufen lassen – muss fehlschlagen**

Run: `npm test -- tests/render.test.ts`
Expected: FAIL – Import nicht auflösbar.

- [ ] **Step 3: `src/gantt/render.ts` implementieren**

```ts
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

  // Hintergrund: arbeitsfreie Tage, Tagesraster, Zeilenlinien
  for (let day = scale.startDay; day <= scale.endDay; day++) {
    const x = scale.xDay(day);
    if (!opts.isWorkingDay(day)) el('rect', { x, y: 0, width: scale.pxPerDay, height, class: 'nonworking' }, svg);
    if (scale.zoom === 'day') verticalLine(svg, x, height, 'grid');
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
    const bendX = fx + (fromStart ? -8 : 8);
    const critical = from.critical && to.critical;
    el('path', {
      d: `M${fx},${from.y} H${bendX} V${to.y} H${tx}`,
      class: `dep${critical ? ' critical' : ''}`,
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
```

Hinweis zum Achsentest: Im Tageszoom sind alle Zellen ≥ 70 px breit, daher erscheinen alle Beschriftungen; schmale Monatszellen (< 18 px) bleiben im Monatszoom bewusst unbeschriftet.

- [ ] **Step 4: Tests laufen lassen – müssen bestehen**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/gantt/render.ts tests/render.test.ts
git commit -m "feat(gantt): SVG-Gantt mit Balken, Meilensteinen, Pfeilen, Kalender und Baseline"
```

---

### Task 10: Vorgangsliste (Tabelle)

**Files:**
- Create: `src/table.ts`
- Test: `tests/table.test.ts`

**Interfaces:**
- Consumes: `VisibleRow`, `TaskDto`, Formatierer aus `format.ts`.
- Produces: `COLUMNS` (Array `{ key, label, width, numeric }`), `columnTemplate(): string`, `cellText(key: ColumnKey, task: TaskDto, nr: number, predecessors: string, hoursPerDay: number): string`, `interface TableOptions { rows: VisibleRow[]; predecessors: Map<string, string>; hoursPerDay: number; onToggle: (taskId: string) => void }`, `renderTableHeader(): HTMLElement`, `renderTableBody(opts: TableOptions): HTMLElement`. CSS-Klassen: `header-row`, `row`, `summary`, `critical`, `cell`, `num`, `toggle`, `toggle-spacer`, `name-text`, `warn`.

- [ ] **Step 1: Failing tests schreiben**

```ts
import { describe, expect, test, vi } from 'vitest';
import { predecessorTexts } from '../src/predecessors';
import { COLUMNS, renderTableBody, renderTableHeader } from '../src/table';
import { buildTree, visibleRows } from '../src/tree';
import { demoProject } from './fixtures/demo';

function body(mutate?: (p: ReturnType<typeof demoProject>) => void, onToggle = vi.fn()) {
  const project = demoProject();
  mutate?.(project);
  const tree = buildTree(project.tasks);
  return renderTableBody({
    rows: visibleRows(tree, new Set()),
    predecessors: predecessorTexts(project.dependencies, tree, project.hoursPerDay),
    hoursPerDay: project.hoursPerDay,
    onToggle,
  });
}

const cells = (row: Element) => [...row.querySelectorAll('.cell')].map((c) => c.textContent);

test('Kopfzeile enthält alle Spalten', () => {
  expect([...renderTableHeader().querySelectorAll('.cell')].map((c) => c.textContent)).toEqual(
    COLUMNS.map((c) => c.label),
  );
  expect(COLUMNS.map((c) => c.label)).toEqual(['Nr', 'Name', 'Dauer', 'Start', 'Ende', 'Vorgänger', 'Ges. Puffer', 'Fr. Puffer', '% Fertig']);
});

describe('renderTableBody', () => {
  test('Zeilen und Zellwerte wie in Kairos', () => {
    const rows = body().querySelectorAll('.row');
    expect(rows).toHaveLength(9);
    expect(cells(rows[1])).toEqual(['2', 'Anforderungen', '3 d', '25.06.26, 08:00', '29.06.26, 14:00', '', '0 d', '0 d', '100 %']);
    expect(cells(rows[6])[5]).toBe('5, 6');
  });

  test('Sammelvorgang: fett, ohne Dauer, mit Aufklapp-Schalter', () => {
    const first = body().querySelectorAll('.row')[0];
    expect(first.classList.contains('summary')).toBe(true);
    expect(cells(first)[2]).toBe('');
    expect(first.querySelector('button.toggle')?.textContent).toBe('▾');
  });

  test('Klick auf den Schalter meldet die Vorgangs-ID', () => {
    const onToggle = vi.fn();
    const rows = body(undefined, onToggle).querySelectorAll('.row');
    (rows[3].querySelector('button.toggle') as HTMLButtonElement).click();
    expect(onToggle).toHaveBeenCalledWith('umsetzung');
  });

  test('kritische Vorgänge und gerissene Deadlines werden markiert', () => {
    const rows = body((p) => (p.tasks.find((t) => t.id === 'tests')!.deadlineMissed = true)).querySelectorAll('.row');
    expect(rows[1].classList.contains('critical')).toBe(true);
    expect(rows[0].classList.contains('critical')).toBe(false);
    expect(rows[7].querySelector('.warn')?.textContent).toBe('⚠');
  });

  test('Namen mit HTML werden wörtlich angezeigt', () => {
    const rows = body((p) => (p.tasks.find((t) => t.id === 'tests')!.name = '<b>Tests</b> & mehr')).querySelectorAll('.row');
    expect(rows[7].querySelector('.name-text')?.textContent).toBe('<b>Tests</b> & mehr');
    expect(rows[7].querySelector('b')).toBeNull();
  });

  test('Einrückung nach Tiefe', () => {
    const rows = body().querySelectorAll('.row');
    expect((rows[1].querySelectorAll('.cell')[1] as HTMLElement).style.paddingLeft).toBe('22px');
    expect((rows[0].querySelectorAll('.cell')[1] as HTMLElement).style.paddingLeft).toBe('6px');
  });
});
```

- [ ] **Step 2: Test laufen lassen – muss fehlschlagen**

Run: `npm test -- tests/table.test.ts`
Expected: FAIL – Import nicht auflösbar.

- [ ] **Step 3: `src/table.ts` implementieren**

```ts
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
```

- [ ] **Step 4: Tests laufen lassen – müssen bestehen**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/table.ts tests/table.test.ts
git commit -m "feat(table): Vorgangsliste mit Auf-/Zuklappen und Markierungen"
```

---

### Task 11: Ansichtszustand

**Files:**
- Create: `src/state.ts`
- Test: `tests/state.test.ts`

**Interfaces:**
- Consumes: `ProjectDto`, `BaselineTaskDto`, `buildTree`, `parentIds`, `Tree`, `Zoom`.
- Produces: `interface ViewState { project: ProjectDto | null; tree: Tree | null; fileName: string; collapsed: Set<string>; zoom: Zoom; showBaseline: boolean; baselineId: string | null }`, `initialState(): ViewState`, `loadProject(state, project, filePath): ViewState`, `toggleCollapsed(state, taskId): ViewState`, `collapseAll(state): ViewState`, `expandAll(state): ViewState`, `missingDates(project: ProjectDto): number`, `displayTitle(state): string`, `baselineMap(state): Map<string, BaselineTaskDto> | null`, `PRINT_PAGE_WIDTH_PX = 1512`, `printZoom(totalWidthPx: number, pageWidthPx?: number): number`

- [ ] **Step 1: Failing tests schreiben**

```ts
import { describe, expect, test } from 'vitest';
import {
  baselineMap, collapseAll, displayTitle, expandAll, initialState, loadProject, missingDates, printZoom, toggleCollapsed,
} from '../src/state';
import { demoProject } from './fixtures/demo';

describe('loadProject', () => {
  test('setzt Baum, Dateiname und aktive Baseline', () => {
    const s = loadProject(initialState(), demoProject(), '/Users/x/Plan A.kairos');
    expect(s.tree?.preorder).toHaveLength(9);
    expect(s.fileName).toBe('Plan A.kairos');
    expect(s.baselineId).toBe('bl1');
    expect(s.showBaseline).toBe(false);
    expect(s.collapsed.size).toBe(0);
  });

  test('Windows-Pfad', () => {
    expect(loadProject(initialState(), demoProject(), 'C:\\Daten\\Plan.kairos').fileName).toBe('Plan.kairos');
  });

  test('unbekannte aktive Baseline → erste Baseline; keine Baselines → null', () => {
    const p = { ...demoProject(), activeBaselineId: 'weg' };
    expect(loadProject(initialState(), p, 'a.kairos').baselineId).toBe('bl1');
    expect(loadProject(initialState(), { ...p, baselines: [] }, 'a.kairos').baselineId).toBeNull();
  });

  test('Zoom bleibt beim Laden einer neuen Datei erhalten', () => {
    const s = { ...initialState(), zoom: 'day' as const };
    expect(loadProject(s, demoProject(), 'a.kairos').zoom).toBe('day');
  });
});

test('displayTitle: Projektname, sonst Dateiname ohne Endung', () => {
  const s = loadProject(initialState(), demoProject(), '/x/Plan A.kairos');
  expect(displayTitle(s)).toBe('Plan A');
  expect(displayTitle(loadProject(initialState(), { ...demoProject(), name: 'Relaunch' }, '/x/a.kairos'))).toBe('Relaunch');
  expect(displayTitle(initialState())).toBe('Keine Datei geöffnet');
});

test('Auf- und Zuklappen', () => {
  const s = loadProject(initialState(), demoProject(), 'a.kairos');
  const t = toggleCollapsed(s, 'umsetzung');
  expect([...t.collapsed]).toEqual(['umsetzung']);
  expect(toggleCollapsed(t, 'umsetzung').collapsed.size).toBe(0);
  expect([...collapseAll(s).collapsed].sort()).toEqual(['konzeption', 'umsetzung']);
  expect(expandAll(collapseAll(s)).collapsed.size).toBe(0);
});

test('missingDates zählt Vorgänge ohne gespeicherte Termine', () => {
  const p = demoProject();
  expect(missingDates(p)).toBe(0);
  p.tasks[0].earlyStart = null;
  p.tasks[1].earlyFinish = 'kaputt';
  expect(missingDates(p)).toBe(2);
});

test('baselineMap liefert die gewählte Baseline je Vorgang', () => {
  const s = loadProject(initialState(), demoProject(), 'a.kairos');
  expect(baselineMap(s)?.get('anforderungen')?.finish).toBe('2026-06-29T14:00');
  expect(baselineMap({ ...s, baselineId: null })).toBeNull();
});

test('printZoom skaliert nur herunter', () => {
  expect(printZoom(3024)).toBe(0.5);
  expect(printZoom(1000)).toBe(1);
  expect(printZoom(0)).toBe(1);
});
```

- [ ] **Step 2: Test laufen lassen – muss fehlschlagen**

Run: `npm test -- tests/state.test.ts`
Expected: FAIL – Import nicht auflösbar.

- [ ] **Step 3: `src/state.ts` implementieren**

```ts
import { isCivil } from './gantt/calendar';
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
```

- [ ] **Step 4: Tests laufen lassen – müssen bestehen**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state.ts tests/state.test.ts
git commit -m "feat(state): Ansichtszustand für Laden, Auf-/Zuklappen, Baseline und Druck"
```

---

### Task 12: App-Oberfläche verdrahten (Öffnen, Layout, Scroll-Sync)

**Files:**
- Create: `src/app.ts`, `src/styles.css`
- Modify: `src/main.ts` (komplett ersetzen)

**Interfaces:**
- Consumes: alles aus Tasks 5–11; Tauri: `invoke('open_project', { path })`, `invoke('initial_file')`, Event `open-file`; `open` aus `@tauri-apps/plugin-dialog`; `getCurrentWebview().onDragDropEvent`.
- Produces: `startApp(root: HTMLElement): void`; interne Funktion `printProject()` wird in Task 13 an den Druck-Button gehängt (hier bereits mit Button verdrahtet, Druck-CSS folgt in Task 13).

- [ ] **Step 1: `src/main.ts` ersetzen**

```ts
import './styles.css';
import './print.css';
import { startApp } from './app';

startApp(document.getElementById('app')!);
```

Und leere `src/print.css` anlegen (Inhalt in Task 13):
```css
/* Druck-Layout: siehe Task 13 */
```

- [ ] **Step 2: `src/app.ts` implementieren**

```ts
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
```

- [ ] **Step 3: `src/styles.css` anlegen**

```css
:root {
  --bg: #ffffff;
  --fg: #1d1d1f;
  --muted: #6e6e73;
  --line: #e3e3e8;
  --head: #f6f6f8;
  --accent: #2f6fd6;
  --bar: #4a7fd6;
  --critical: #d64545;
  --summary: #333336;
  --baseline: #9aa0a6;
  --nonworking: #f1f1f4;
  --row-h: 24px;
  --axis-h: 40px;
  --table-w: 760px;
  font: 13px/1.3 -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1e1e20;
    --fg: #e8e8ea;
    --muted: #9a9aa0;
    --line: #38383c;
    --head: #28282b;
    --summary: #d8d8dc;
    --nonworking: #26262a;
  }
}

html, body { margin: 0; height: 100%; background: var(--bg); color: var(--fg); }
#app { display: flex; flex-direction: column; height: 100vh; }
[hidden] { display: none !important; }

.toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 6px 10px; background: var(--head); border-bottom: 1px solid var(--line); }
.toolbar .title { font-weight: 600; margin-right: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 120px; }
.toolbar button, .toolbar select { font: inherit; padding: 3px 9px; border: 1px solid var(--line); border-radius: 5px; background: var(--bg); color: var(--fg); cursor: pointer; }
.toolbar button:disabled, .toolbar input:disabled + * { opacity: .5; }
.segmented { display: inline-flex; }
.segmented button { border-radius: 0; margin-left: -1px; }
.segmented button:first-child { border-radius: 5px 0 0 5px; }
.segmented button:last-child { border-radius: 0 5px 5px 0; }
.segmented button[aria-pressed='true'] { background: var(--accent); border-color: var(--accent); color: #fff; }

.banner { padding: 6px 10px; }
.banner.info { background: #fff6d6; color: #5c4800; }
.banner.error { background: #fde2e2; color: #7a1010; }

.empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: 16px; }

.main { flex: 1; display: flex; min-height: 0; }
.pane-table { width: var(--table-w); flex: none; display: flex; flex-direction: column; min-width: 200px; }
.table-header { height: var(--axis-h); background: var(--head); border-bottom: 1px solid var(--line); overflow: hidden; box-sizing: border-box; }
.table-scroll { flex: 1; overflow-x: auto; overflow-y: hidden; }
.splitter { width: 5px; flex: none; cursor: col-resize; background: var(--line); }
.pane-gantt { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.gantt-header { height: var(--axis-h); flex: none; overflow: hidden; background: var(--head); border-bottom: 1px solid var(--line); box-sizing: border-box; }
.gantt-scroll { flex: 1; overflow: auto; }
.gantt-header svg, .gantt-scroll svg { display: block; }

.header-row, .row { display: grid; grid-template-columns: var(--cols); align-items: center; white-space: nowrap; box-sizing: border-box; }
.header-row { height: calc(var(--axis-h) - 1px); font-weight: 600; }
.row { height: var(--row-h); border-bottom: 1px solid var(--line); }
.cell { padding: 0 6px; overflow: hidden; text-overflow: ellipsis; }
.cell.num { text-align: right; font-variant-numeric: tabular-nums; }
.row.summary { font-weight: 600; }
.row.critical .name-text { color: var(--critical); }
.toggle { width: 16px; padding: 0; border: 0; background: none; color: inherit; cursor: pointer; font: inherit; }
.toggle-spacer { display: inline-block; width: 16px; }
.warn { color: #c98a00; margin-left: 4px; }

.gantt-body .nonworking { fill: var(--nonworking); }
.gantt-body .grid { stroke: var(--line); stroke-width: .5; }
.gantt-body .row-line { stroke: var(--line); stroke-width: 1; }
.gantt-body .today { stroke: var(--critical); stroke-dasharray: 4 3; stroke-width: 1.5; }
.gantt-body .status-date { stroke: #2a9d5c; stroke-dasharray: 4 3; stroke-width: 1.5; }
.gantt-body .bar { fill: var(--bar); }
.gantt-body .bar.critical { fill: var(--critical); }
.gantt-body .progress { fill: rgba(0, 0, 0, .28); }
.gantt-body .summary { fill: var(--summary); }
.gantt-body .milestone { fill: var(--summary); }
.gantt-body .milestone.critical { fill: var(--critical); }
.gantt-body .baseline { fill: var(--baseline); }
.gantt-body .dep { fill: none; stroke: var(--muted); stroke-width: 1.2; }
.gantt-body .dep.critical { stroke: var(--critical); }
.gantt-body path.arrow { fill: var(--muted); }
.gantt-body path.arrow-critical { fill: var(--critical); }
.gantt-axis .axis-line { stroke: var(--line); }
.gantt-axis .axis-label { fill: var(--fg); font-size: 11px; }
```

- [ ] **Step 3b: Zeilenhöhe von Tabelle und Gantt angleichen prüfen**

Die Tabellenzeile ist 24 px inkl. 1 px Unterkante (`box-sizing: border-box`), die Gantt-Zeile 24 px mit Linie bei `(i+1)*24 - 0.5`; Kopf beider Seiten 40 px. Kein Code – beim manuellen Test (Step 5) auf Deckung der Zeilen achten.

- [ ] **Step 4: Typprüfung, Tests, Build**

Run: `npm run build && npm test`
Expected: `tsc` ohne Fehler, Vitest PASS.

- [ ] **Step 5: Manuell prüfen mit `npm run tauri dev`**

Prüfen (Ergebnis notieren):
1. Leeres Fenster zeigt „Kairos-Datei öffnen oder hierher ziehen“.
2. „Öffnen…“ → `src-tauri/tests/fixtures/demo-v2.kairos` → Titel „demo-v2“, 9 Zeilen, Nr 1–9, Vorgänger „5, 6“ bei Integration, „5SS“ bei Backend.
3. Eine reale Projektdatei (62 Vorgänge) per Drag&Drop öffnen → 62 Vorgänge.
4. Beide Dateien parallel in Kairos öffnen und Nr, Dauer, Start, Ende, Vorgänger, Puffer, kritische Vorgänge vergleichen (Screenshot von beiden).
5. Zoom Tag/Woche/Monat, Auf-/Zuklappen (Pfeile verschwinden mit), Baseline an/aus, Splitter, vertikales Scrollen bleibt synchron (auch Mausrad über Tabelle).
6. Eine Textdatei mit Endung `.kairos` öffnen → roter Banner „Die Datei ist keine Kairos-Projektdatei.“
7. Nach dem Öffnen: `shasum` der Demo-Datei unverändert, keine `-journal`-Datei daneben.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts src/app.ts src/styles.css src/print.css
git commit -m "feat(app): Oberfläche mit Öffnen, Drag&Drop, Zoom, Baseline und Scroll-Sync"
```

---

### Task 13: Drucken / PDF

**Files:**
- Modify: `src/print.css` (komplett ersetzen)

**Interfaces:**
- Consumes: CSS-Variable `--print-zoom` (gesetzt in `printProject()`, Task 12), Command `print_window` (Task 4).

- [ ] **Step 1: `src/print.css` schreiben**

```css
@media print {
  @page { size: A3 landscape; margin: 10mm; }
  :root {
    --bg: #fff; --fg: #000; --muted: #555; --line: #d0d0d5; --head: #f2f2f4;
    --summary: #222; --nonworking: #f0f0f2;
  }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body, #app { height: auto; overflow: visible; background: #fff; }
  .toolbar, .banner, .splitter, .empty { display: none !important; }
  .main { display: flex; height: auto; overflow: visible; zoom: var(--print-zoom, 1); }
  .pane-table, .pane-gantt, .table-scroll, .gantt-scroll, .gantt-header {
    overflow: visible !important; height: auto !important; max-height: none !important;
  }
  .pane-gantt { flex: none; }
  .row { break-inside: avoid; }
}
```

- [ ] **Step 2: Build und Tests**

Run: `npm run build && npm test`
Expected: PASS.

- [ ] **Step 3: Manuell prüfen mit `npm run tauri dev`**

1. Demo-Datei öffnen, Zoom „Woche“, „Drucken…“ → Systemdruckdialog erscheint.
2. Als PDF sichern → PDF öffnen: Toolbar fehlt, Tabelle und Gantt nebeneinander, Zeilen decken sich, Farben (kritisch rot, Wochenenden grau) sichtbar.
3. Reale Projektdatei (62 Vorgänge) mit Zoom „Tag“ drucken → Inhalt wird auf Seitenbreite verkleinert; mehrseitiger Ausdruck schneidet keine Zeilen ab. Falls WKWebView das SVG an der Seitengrenze abschneidet: Befund mit Screenshot dem Nutzer melden, bevor weitergemacht wird.

- [ ] **Step 4: Commit**

```bash
git add src/print.css
git commit -m "feat(print): Druck-Layout A3 quer mit Skalierung auf Seitenbreite"
```

---

### Task 14: Builds und Dokumentation

**Files:**
- Create: `README.md`, `scripts/build-windows.ps1`

- [ ] **Step 1: `scripts/build-windows.ps1` schreiben**

```powershell
# Baut den Kairos Viewer unter Windows (.msi und NSIS-.exe).
# Aufruf aus dem Projektordner:  powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

function Require-Command($name, $hint) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        Write-Host "FEHLT: $name. $hint" -ForegroundColor Red
        exit 1
    }
}

Require-Command node  'Node.js LTS installieren: https://nodejs.org'
Require-Command npm   'Wird mit Node.js installiert.'
Require-Command cargo 'Rust installieren: https://rustup.rs (Standard-Toolchain stable-msvc).'

$hostLine = (rustc -vV | Select-String '^host:').ToString()
if ($hostLine -notmatch 'msvc') {
    Write-Host "Rust-Toolchain muss MSVC sein ($hostLine). Ausführen: rustup default stable-msvc" -ForegroundColor Red
    exit 1
}

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$vcTools = if (Test-Path $vswhere) {
    & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
}
if (-not $vcTools) {
    Write-Host 'Visual Studio Build Tools mit C++-Workload fehlen: https://visualstudio.microsoft.com/visual-cpp-build-tools/' -ForegroundColor Red
    exit 1
}

npm ci;   if ($LASTEXITCODE) { exit $LASTEXITCODE }
npm test; if ($LASTEXITCODE) { exit $LASTEXITCODE }
cargo test --manifest-path src-tauri\Cargo.toml; if ($LASTEXITCODE) { exit $LASTEXITCODE }
npm run tauri build; if ($LASTEXITCODE) { exit $LASTEXITCODE }

Get-ChildItem src-tauri\target\release\bundle -Recurse -Include *.msi, *-setup.exe |
    ForEach-Object { Write-Host "Erstellt: $($_.FullName)" -ForegroundColor Green }
```

- [ ] **Step 2: `README.md` schreiben**

````markdown
# Kairos Viewer

Reiner Viewer für Kairos-Projektdateien (`.kairos`, Schema v2–v5) unter macOS und Windows:
Vorgangsliste (Nr, Name, Dauer, Start, Ende, Vorgänger, Puffer, % Fertig) und Gantt-Chart
mit kritischem Pfad, Baseline-Balken und Druck/PDF. Die Datei wird nur gelesen und nie verändert.
Termine stammen aus den von Kairos gespeicherten Werten – wer eine Datei ohne Termine öffnet,
muss sie einmal in Kairos öffnen und speichern.

## Entwicklung (macOS)

Voraussetzungen: Xcode Command Line Tools, Node ≥ 20, Rust (`curl https://sh.rustup.rs -sSf | sh`).

```bash
npm install
npm run build          # einmalig nötig, bevor `cargo test` läuft (Tauri prüft dist/)
npm test               # Frontend-Tests (Vitest)
cargo test --manifest-path src-tauri/Cargo.toml   # Reader-Tests
npm run tauri dev      # App starten
```

## Release-Build

**macOS:** `npm run tauri build` → `src-tauri/target/release/bundle/dmg/Kairos Viewer_0.1.0_*.dmg`.
Für Apple Silicon und Intel: `rustup target add x86_64-apple-darwin && npm run tauri build -- --target universal-apple-darwin`.
Die App ist unsigniert; beim ersten Start Rechtsklick → „Öffnen“.

**Windows (lokal):** Voraussetzungen Node LTS, Rust (MSVC), Visual Studio Build Tools mit C++-Workload,
WebView2 (in Windows 10/11 enthalten). Dann im Projektordner:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1
```

Ergebnis: `.msi` und `*-setup.exe` unter `src-tauri\target\release\bundle\`.

## Dateizuordnung

Der Installer registriert `.kairos` mit der Rolle „Viewer“. Ist auf dem Mac auch Kairos installiert,
im Finder über „Informationen → Öffnen mit“ festlegen, welches Programm Standard ist.

## Aufbau

- `src-tauri/src/reader.rs` – liest die SQLite-Datei schreibgeschützt (`immutable=1`) in ein DTO.
- `src/tree.ts`, `format.ts`, `predecessors.ts` – Baum, Formatierung, Vorgänger-Text (wie Kairos).
- `src/gantt/` – Kalender-Arithmetik, Zeitskala, SVG-Rendering.
- `src/table.ts`, `src/app.ts` – Oberfläche.
- Design: `docs/superpowers/specs/2026-10-06-kairos-viewer-design.md`.
````

- [ ] **Step 3: macOS-Release bauen und installieren**

Run: `npm run tauri build`
Expected: `.app` und `.dmg` unter `src-tauri/target/release/bundle/`. DMG öffnen, App in einen Testordner kopieren, starten, Demo-Datei per „Öffnen…“ laden. Per Finder „Öffnen mit → Kairos Viewer“ eine `.kairos`-Datei öffnen → Datei erscheint (prüft `RunEvent::Opened`).

- [ ] **Step 4: Gesamte Testsuite**

Run: `npm test && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: alle Tests PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md scripts/build-windows.ps1
git commit -m "docs: README und Windows-Build-Skript"
```

- [ ] **Step 6: Windows-Build (Nutzer, auf Windows-Rechner/VM)**

Repository auf den Windows-Rechner kopieren (oder klonen), `scripts\build-windows.ps1` ausführen, `.msi` installieren, Demo-Datei per Doppelklick öffnen (prüft `argv`-Übergabe), Drucken → „Microsoft Print to PDF“.
