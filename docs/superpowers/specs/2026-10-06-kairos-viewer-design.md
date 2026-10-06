# Kairos-Viewer – Design

Stand: 2026-10-06 · Status: Entwurf zur Freigabe

## 1. Ziel

Ein eigenständiges, plattformübergreifendes Programm (macOS und Windows), das `.kairos`-Dateien **nur anzeigt**: Vorgangsliste mit den Termindaten und ein Gantt-Chart. Das Originalprojekt Kairos (`<Kairos-Quellprojekt>`) bleibt unverändert und dient nur als Referenz für Format und Darstellung.

**Erfolgskriterien**
- `Kairos-Demo.kairos` (v2, 9 Vorgänge) und eine reale Projektdatei (v2, 62 Vorgänge) öffnen sich unter macOS und Windows. Nr, Dauer, Start, Ende, Vorgänger, Puffer und kritische Vorgänge stimmen mit der Kairos-App überein.
- Die geöffnete Datei bleibt byte-identisch.
- Es entstehen Installer: `.dmg` für macOS, `.msi` und NSIS-`.exe` für Windows.

**Nicht im Umfang:** Bearbeiten und Speichern, Neuberechnung der Termine (CPM), MS-Project-Import und -Export, Ansichten für Ressourcen, Netzplan, Kalender und EVM, sowie andere Sprachen als Deutsch.

## 2. Entscheidungen

| Thema | Entscheidung | Begründung |
|---|---|---|
| Termine | Gespeicherte CPM-Werte aus der Datei | Kairos schreibt beim Speichern `early_start`, `early_finish`, `total_float`, `free_float` und `is_critical`. Diese Werte sind in den v2-Beispielen vollständig gefüllt. Den Scheduler nachzubauen wäre teuer und könnte vom Original abweichen. |
| Stack | Tauri 2, Rust als Hülle, Frontend in TypeScript mit Vite und ohne Framework, Gantt in SVG | Kleine Installer, eine UI für beide Plattformen, gut testbar. |
| SQLite | `rusqlite` mit Feature `bundled` | Kein System-SQLite nötig, unter Windows problemlos. |
| Windows-Build | Lokal auf einem Windows-Rechner oder einer VM mit PowerShell-Skript | Wunsch des Nutzers. |
| Schemaversionen | v2 bis v5 | Die Beispieldateien sind v2, aktuell ist v5. |
| Extras | Baseline-Balken, kritischer Pfad, Druck und PDF | Wunsch des Nutzers. |

## 3. Dateiformat (Auszug, Quelle: `KairosKit/Sources/KairosKit/Persistence/Migrations.swift`)

**Grundlagen**
- `.kairos` ist eine SQLite-3-Datenbank. Die Version steht in `meta.schema_version`.
- IDs sind UUID-Strings.
- Datumswerte sind zeitzonenlose Strings: `YYYY-MM-DD` oder `YYYY-MM-DDTHH:MM`.
- Dauer, Lag und Puffer werden in **Arbeitsminuten** gespeichert.

**Gelesene Tabellen und Spalten**
- **`meta`:** schema_version
- **`project`:**
  - id, name, start_date, finish_date, hours_per_day, days_per_week, default_calendar_id
  - status_date und active_baseline_id ab v2
- **`task`:**
  - id, parent_id, order_index (Reihenfolge innerhalb der Geschwister), name
  - type: `normal`, `summary` oder `milestone`
  - duration_minutes, display_unit (`min`, `h` oder `d`), percent_complete (0…1), deadline
  - early_start, early_finish, total_float, free_float, is_critical, deadline_missed
  - fixed_finish ab v5 (nur für einen Konfliktmarker)
- **`dependency`:** predecessor_id, successor_id, type (`FS`, `SS`, `FF` oder `SF`), lag_minutes
- **Kalender:**
  - `calendar_workweek`: calendar_id, weekday (0 = Montag), is_working
  - `calendar_exception`: calendar_id, date, is_working
  - Maßgeblich ist der Kalender `project.default_calendar_id`.
- **Baselines:**
  - `baseline`: id, name
  - `baseline_task`: baseline_id, task_id, start, finish

## 4. Architektur

```
Kairos-Viewer/
  package.json, vite.config.ts, tsconfig.json, index.html
  src/                     Frontend (TypeScript)
    model.ts               DTO-Typen (Spiegel des Rust-DTO)
    tree.ts                Baum aus parent_id/order_index, Preorder-Nr, sichtbare Zeilen je Collapse-Zustand
    format.ts              Dauer, Datum und Puffer formatieren
    predecessors.ts        Vorgänger-Text pro Vorgang
    gantt/scale.ts         Zoomstufe, Zeitachse, Datum → x
    gantt/render.ts        SVG-Erzeugung
    table.ts               Vorgangsliste
    app.ts / main.ts       Zustand, Toolbar, Öffnen, Scroll-Sync, Drucken
    styles.css, print.css
  src-tauri/
    Cargo.toml, tauri.conf.json, capabilities/
    src/lib.rs             Tauri-Setup, Commands, Öffnen über Dateiassoziation/argv
    src/reader.rs          Lesen der .kairos-Datei → ProjectDto
    tests/reader_tests.rs  + tests/fixtures/*.kairos (Kopien, synthetische Dateien)
  scripts/build-windows.ps1
  README.md
```

### 4.1 Reader (Rust, `reader.rs`)

Die öffentliche Funktion ist `read_project(path) -> Result<ProjectDto, ReadError>`.

1. **Header prüfen:** Die ersten 16 Bytes müssen `SQLite format 3\0` sein, sonst `NotAKairosFile`.
2. **Öffnen:** URI `file:<pfad>?mode=ro&immutable=1` mit `SQLITE_OPEN_READ_ONLY | SQLITE_OPEN_URI`. So entstehen weder Journal noch Sperren, und die Datei wird nicht verändert. Pfade werden URI-kodiert, damit Leerzeichen, `#`, `?` und Windows-Backslashes funktionieren.
3. **Tabellen prüfen:** `meta`, `project`, `task` und `dependency` müssen existieren, sonst `NotAKairosFile`.
4. **Version prüfen:** `schema_version` muss zwischen 2 und 5 liegen, sonst `UnsupportedVersion(n)`.
5. **Spalten lesen:** Die vorhandenen Spalten jeder Tabelle werden per `PRAGMA table_info` ermittelt, und die SELECT-Liste wird daraus gebaut. Fehlt eine optionale Spalte, wird `None` bzw. der Default verwendet. Fehlen Kalender- oder Baseline-Tabellen, bleiben die Listen leer.
6. **Einheiten:** Rust reicht Rohwerte durch (Minuten, Strings, 0 oder 1 als bool). Formatiert wird nur im Frontend.

Fehlertypen: `Io`, `NotAKairosFile`, `UnsupportedVersion(i64)`, `Corrupt(String)`. Sie werden als deutsche Klartextmeldung ins Frontend serialisiert.

Tauri-Commands:
- `open_project(path: String) -> Result<ProjectDto, String>`
- `initial_file() -> Option<String>` liefert den Pfad, wenn die App über einen Doppelklick oder ein Argument gestartet wurde.

### 4.2 DTO (gekürzt)

```ts
interface ProjectDto {
  schemaVersion: number; name: string; startDate?: string; finishDate?: string; statusDate?: string;
  hoursPerDay: number; daysPerWeek: number;
  tasks: TaskDto[]; dependencies: DependencyDto[];
  calendar?: { workweek: { weekday: number; isWorking: boolean }[]; exceptions: { date: string; isWorking: boolean }[] };
  baselines: { id: string; name: string; tasks: { taskId: string; start?: string; finish?: string }[] }[];
  activeBaselineId?: string;
}
interface TaskDto {
  id: string; parentId?: string; orderIndex: number; name: string; type: 'normal'|'summary'|'milestone';
  durationMinutes: number; displayUnit: 'min'|'h'|'d'; percentComplete: number; deadline?: string;
  earlyStart?: string; earlyFinish?: string; totalFloat?: number; freeFloat?: number;
  isCritical: boolean; deadlineMissed: boolean;
}
interface DependencyDto { predecessorId: string; successorId: string; type: 'FS'|'SS'|'FF'|'SF'; lagMinutes: number }
```

### 4.3 Frontend-Logik (reine Funktionen, ohne DOM)

- **`tree.ts`**
  - Kinder werden nach `orderIndex` sortiert. Bei Gleichstand entscheidet die `id`, damit die Reihenfolge deterministisch bleibt.
  - Wurzeln sind Vorgänge ohne `parentId` oder mit einer unbekannten `parentId`.
  - **Nr** ist der 1-basierte Preorder-Index, wie die Nr.-Spalte in Kairos (`OutlineNumbering.preorder`).
  - `visibleRows(tree, collapsed: Set<id>)` liefert die sichtbaren Zeilen mit Tiefe.
- **`format.ts`**
  - **Dauer:** `minutesPerDay = hoursPerDay * 60`.
    - `d` ergibt `minutes / minutesPerDay` mit höchstens zwei Nachkommastellen, deutschem Komma und Suffix „ d“. Beispiel: 1440 min bei 8 h ergeben „3 d“.
    - `h` ergibt Stunden mit „ h“, `min` ergibt Minuten mit „ min“.
    - Ein Meilenstein mit 0 Minuten wird als „0 d“ angezeigt.
  - **Datum:** `2026-06-25T08:00` wird zu „25.06.26 08:00“. Die Formatierung arbeitet direkt auf dem String, nicht über `Date`.
  - **Puffer:** wie die Dauer in Tagen. Leer, wenn `null`.
- **`predecessors.ts`**
  - Je Nachfolger die eingehenden Abhängigkeiten in Datenreihenfolge als Token `<Nr><Typ≠FS><±Lag>`.
  - Der Lag steht in `d`, wenn er durch `minutesPerDay` teilbar ist, sonst in `h`, wenn er durch 60 teilbar ist, sonst in `min`.
  - Die Tokens werden mit „, “ verbunden. Das entspricht `DependencyTokenIO.format`.
- **`gantt/scale.ts`**
  - Zoomstufen in Pixel pro Kalendertag: Tag 70, Woche 23, Monat 7.
  - **Bereich:** frühester Start minus 2 Tage bis spätester Ende-Termin plus 7 Tage, einschließlich der Baseline-Termine.
  - `x(civil) = (tageSeitAnfang + minutenImTag/1440) * pxPerDay`. Dabei werden Tage per UTC-Arithmetik aus dem String berechnet.
  - **Achse:** Kopfzeile oben (Monat/Jahr bzw. KW), Unterteilung unten (Tag bzw. Woche bzw. Monat).

### 4.4 Darstellung

- **Layout**
  - Toolbar mit: Öffnen, Dateiname, Zoom Tag/Woche/Monat, Checkbox „Baseline“ (nur aktiv, wenn Baselines existieren, mit Auswahl der Baseline, vorbelegt mit `activeBaselineId`), Alle aufklappen/zuklappen, Drucken.
  - Darunter liegen Tabelle und Gantt nebeneinander mit verschiebbarem Splitter.
  - Zeilenhöhe 24 px. Tabelle und Gantt teilen sich das vertikale Scrollen, horizontal scrollt nur das Gantt. Der Tabellenkopf ist so hoch wie die Zeitachse.
- **Spalten**
  - Nr, Name (eingerückt, mit Auf-/Zu-Pfeil für Sammelvorgänge), Dauer, Start, Ende, Vorgänger, Gesamtpuffer, Freier Puffer, % Fertig.
  - Sammelvorgänge stehen in Fett.
  - Kritische Vorgänge zeigen den Namen in Rot.
  - Ein Warnsymbol erscheint bei `deadlineMissed`.
- **Gantt (SVG)**
  - Hintergrund:
    - Arbeitsfreie Tage sind grau hinterlegt, gemäß Arbeitswoche und Ausnahmen des Projektkalenders. Ohne Kalender gelten Samstag und Sonntag als frei.
    - Das Tagesraster wird in der Tagesansicht gezeichnet.
    - Die Heute-Linie ist rot gestrichelt.
    - Eine Statusdatum-Linie erscheint, falls ein Statusdatum gesetzt ist.
  - Vorgänge:
    - Normale Vorgänge sind blaue Balken, kritische rote. Der Fortschritt ist als dunklerer Anteil eingezeichnet.
    - Sammelvorgänge sind schwarze Klammerbalken.
    - Meilensteine sind Rauten am Start.
    - Ohne `earlyStart` oder `earlyFinish` wird kein Balken gezeichnet.
  - Baseline: ein grauer, dünner Balken unter dem Vorgangsbalken, wenn aktiviert.
  - Abhängigkeiten:
    - Orthogonale Pfeile von der Kante, die zum Typ passt: FS ist Ende → Anfang, SS Anfang → Anfang, FF Ende → Ende, SF Anfang → Ende.
    - Pfeile sind rot, wenn beide Vorgänge kritisch sind.
    - Pfeile zu oder von eingeklappten Vorgängen werden ausgelassen.
- **Hinweisbanner** erscheinen, wenn Vorgänge ohne gespeicherte Termine existieren („Termine fehlen – Datei in Kairos öffnen und speichern“) und bei Lesefehlern.
- **Öffnen**
  - Über Dateidialog (`tauri-plugin-dialog`, Filter `*.kairos`) und Drag&Drop ins Fenster.
  - Über Dateiassoziation `.kairos`: unter macOS über das Event `RunEvent::Opened`, unter Windows über `argv[1]`.
  - Auch mit einem Kommandozeilenargument.
- **Drucken/PDF**
  - Der Menüpunkt bzw. Button ruft `window.print()` auf.
  - `print.css` blendet die Toolbar aus und druckt im Querformat A3.
  - Tabelle und Gantt werden nicht abgeschnitten, sondern in voller Höhe nebeneinander gedruckt. Ist das Gantt zu breit, wird es auf die Seitenbreite skaliert.
  - Als PDF speichert man über den System-Druckdialog („Als PDF sichern“ bzw. „Microsoft Print to PDF“).

### 4.5 Sicherheit

- Tauri-Capabilities sind minimal: `dialog:allow-open`, keine Shell-Rechte und kein allgemeiner Dateisystemzugriff. Gelesen wird ausschließlich über den eigenen Command.
- CSP lässt nur lokale Ressourcen zu.
- Vorgangsnamen werden als Text eingefügt (`textContent`), nie als HTML.

## 5. Build

- **Voraussetzungen macOS:** Rust über `rustup` (fehlt aktuell) und Node 20 oder neuer (vorhanden: 25.7).
- **macOS:** `npm run tauri build` erzeugt `.app` und `.dmg`. Ein Universal-Build ist optional über `--target universal-apple-darwin`. Signierung und Notarisierung sind optional und können später analog `MyProject/scripts/notarize.sh` ergänzt werden.
- **Windows:**
  - Voraussetzungen: Rust (MSVC-Toolchain), Visual Studio Build Tools mit C++-Workload, Node LTS und die WebView2-Runtime (in Windows 11 enthalten).
  - `scripts/build-windows.ps1` prüft die Voraussetzungen und führt `npm ci` sowie `npm run tauri build` aus.
  - Ergebnis: `.msi` (WiX) und NSIS-`.exe` unter `src-tauri/target/release/bundle/`.
- **App-Identität:** Name „Kairos Viewer“, Identifier `de.stevebaumann.kairos-viewer`, Version 0.1.0.

## 6. Tests

- **Rust (`cargo test`):**
  - Fixtures: Kopie von `Kairos-Demo.kairos`.
  - Zusätzlich synthetische Dateien, die im Test per SQL erzeugt werden:
    - v5 mit allen Spalten
    - v6 (wird abgelehnt)
    - eine Textdatei
    - eine SQLite-Datei ohne `task`-Tabelle
  - Geprüft wird:
    - Anzahl und Werte von Vorgängen und Abhängigkeiten
    - fehlende optionale Spalten werden toleriert
    - Fehlertypen
    - Hash der Datei vor und nach dem Lesen ist gleich
- **TypeScript (Vitest):**
  - `tree`: Reihenfolge, Preorder-Nr, Collapse
  - `format`: Dauer, Datum, Puffer
  - `predecessors`: FS ohne Typ, SS/FF/SF, Lag in d/h/min, negativer Lag
  - `scale`: Datum → x, Bereich, Achsenbeschriftung
  - Der Render-Smoke-Test prüft am Demo-DTO die Anzahl der Balken und Pfeile.
- **Manuell:** Beide Beispieldateien neben der Kairos-App öffnen und Werte und Gantt vergleichen. PDF drucken. Installer auf macOS und Windows installieren und Dateien per Doppelklick öffnen.
