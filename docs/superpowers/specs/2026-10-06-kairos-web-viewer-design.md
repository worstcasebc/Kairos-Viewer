# Kairos-Viewer im Web – Design

Stand: 2026-10-06 · Status: Entwurf zur Freigabe · Ergänzt: `2026-10-06-kairos-viewer-design.md`

## 1. Ziel

Der Kairos-Viewer bekommt neben macOS und Windows eine dritte Plattform: eine **statische Webseite**, die auf einem eigenen Webserver (nginx oder Apache) liegt. Nutzer öffnen dort eine `.kairos`-Datei und sehen dieselbe Vorgangsliste und dasselbe Gantt-Chart wie in der Desktop-App.

**Datenschutz-Grundprinzip:** Die Datei wird ausschließlich im Browser des Nutzers verarbeitet. Sie wird **nie** an den Server übertragen, weder dauerhaft noch temporär. Der Server liefert nur statische Dateien aus.

**Erfolgskriterien**
- `Kairos-Demo.kairos` und eine reale Projektdatei werden im Browser genauso dargestellt wie in der Desktop-App (gleiche Werte, gleiche Darstellung).
- Nach dem Laden der Seite stellt der Browser **keine einzige Netzwerkanfrage** mehr. Das lässt sich im Netzwerk-Tab der Entwicklerwerkzeuge prüfen und wird per CSP erzwungen.
- Für den Betrieb genügt ein beliebiger statischer Webserver. Es gibt keinen Server-Code, keine Datenbank und kein Upload-Verzeichnis.
- Die Desktop-App verhält sich unverändert.

**Nicht im Umfang:** Englische Oberfläche, Optimierung für Mobilgeräte, Dateizuordnung, PWA/Offline-Installation, echtes Hochladen an einen Server, Speichern zuletzt geöffneter Dateien.

## 2. Entscheidungen

| Thema | Entscheidung | Begründung |
|---|---|---|
| Verarbeitung | Komplett im Browser | Höchstes Datenschutzniveau, kein Server-Code, keine Löschlogik. |
| SQLite im Browser | sql.js 1.14 (SQLite als WebAssembly, MIT) | Ausgereift, liest eine Datenbank aus einem `Uint8Array` im Arbeitsspeicher. |
| WebAssembly-Laden | Ins JavaScript-Paket eingebettet (Vite `?inline`, übergeben als `wasmBinary`) | Ermöglicht `connect-src 'none'`: Die Seite darf keine Verbindung aufbauen, auch nicht zum eigenen Server. Das Paket wird dafür ca. 1,3 MB größer. |
| Codebasis | Eine gemeinsame Oberfläche, Plattform-Schnittstelle für Desktop und Web | Kein Auseinanderlaufen der Darstellung. |
| Reader | Desktop: Rust (unverändert). Web: neuer TypeScript-Reader mit identischem Verhalten | Desktop behält die bewährte schreibgeschützte Öffnung. Eine gemeinsame Referenzdatei hält beide Reader deckungsgleich. |
| Hosting | Eigener Webserver; Beispielkonfiguration für nginx und Apache | Volle Kontrolle über die Sicherheits-Header. |
| Rechtliches | `impressum.html` und `datenschutz.html` als Gerüst mit markierten Platzhaltern | Der Inhalt muss vom Betreiber geprüft und ergänzt werden. |
| Sprache | Nur Deutsch | Wie die Desktop-App. |
| Dateigröße | Höchstens 50 MB | Schützt den Browser-Tab; reale Projektdateien sind deutlich kleiner. |

## 3. Architektur

```
src/
  app.ts                 startApp(root, platform) – plattformneutral (keine Tauri-Importe mehr)
  platform/
    types.ts             Platform-Schnittstelle
    tauri.ts             Desktop-Umsetzung (heutiger Tauri-Code aus app.ts)
    web.ts               Web-Umsetzung (Dateiauswahl, Drag&Drop, Größen-/Endungsprüfung, window.print)
  web/
    reader.ts            readProject(bytes, sqlJs): ProjectDto – TypeScript-Gegenstück zu reader.rs
    sqlite.ts            initialisiert sql.js mit eingebettetem WebAssembly
  main.ts                Desktop-Einstieg: startApp(root, tauriPlatform())
  web-main.ts            Web-Einstieg: startApp(root, webPlatform(...))
index.html               Desktop-Seite (unverändert)
web/
  index.html             Web-Seite (Viewer + Datenschutzhinweis + Fußzeile mit Links)
  impressum.html         Gerüst mit Platzhaltern
  datenschutz.html       Entwurf passend zur Technik, mit Platzhaltern
vite.web.config.ts       Web-Build → dist-web/
deploy/
  nginx.conf.example     Server-Block mit allen Sicherheits-Headern
  .htaccess.example      Apache-Variante
scripts/
  serve-web.mjs          Lokale Vorschau von dist-web/ mit identischen Headern
tests/fixtures/
  demo-v2.expected.json  Referenzausgabe des Rust-Readers für demo-v2.kairos
```

### 3.1 Plattform-Schnittstelle (`src/platform/types.ts`)

```ts
export interface LoadedFile {
  project: ProjectDto;
  /** Anzeigename (Dateiname), für Titel und Dateiname-Fallback. */
  fileName: string;
}

export interface PlatformCallbacks {
  loaded(file: LoadedFile): void;
  failed(message: string): void;
}

export interface Platform {
  /** Registriert Drag&Drop und externe Dateiübergaben; meldet Ergebnisse über die Callbacks. */
  start(callbacks: PlatformCallbacks): void;
  /** Öffnet den Dateiauswahldialog; Ergebnis kommt über die Callbacks. */
  chooseFile(): Promise<void>;
  /** Druckt die aktuelle Seite (die Druckseiten erzeugt app.ts vorher). */
  print(): Promise<void>;
}
```

`app.ts` behält die bisherige Logik:
- Ansichtszustand, Rendering, Scroll-Sync und Splitter.
- Die Druckseiten, bevor `platform.print()` aufgerufen wird.
- Fehlerbanner und Banner für fehlende Termine.

`loadProject(state, project, fileName)` erhält jetzt den Dateinamen statt eines Pfads. `fileName` aus einem Pfad funktioniert weiterhin, weil der letzte Pfadbestandteil genommen wird.

**Desktop (`tauri.ts`)** übernimmt den bisherigen Code unverändert:
- `open_project` per `invoke`, Dialog mit `.kairos`-Filter.
- Drag&Drop, Event `open-file` plus `initial_file`, `print_window`.

**Web (`web.ts`)**, erzeugt mit `webPlatform({ readProject, pickInput, dropTarget, print })` (testbar über injizierte Abhängigkeiten):
- `chooseFile()` öffnet ein verstecktes `<input type="file" accept=".kairos">`.
- **Drag&Drop:** `dragover` und `drop` auf `window`, dabei Standardverhalten verhindern, damit der Browser die Datei nicht selbst öffnet.
- **Prüfung vor dem Lesen:**
  - Endung `.kairos`, sonst „Nur .kairos-Dateien können geöffnet werden.“
  - Größe höchstens 50 MB, sonst „Die Datei ist größer als 50 MB.“
- **Lesen:** `file.arrayBuffer()`, dann `readProject(new Uint8Array(…))`. Fehler werden als deutsche Meldung über `failed` gemeldet.
- `print()` ruft `window.print()` auf.
- Keine Speicherung: kein `localStorage`, keine IndexedDB, keine Cookies. Nach dem Lesen wird keine Referenz auf die Bytes gehalten.

### 3.2 TypeScript-Reader (`src/web/reader.ts`)

`readProject(bytes: Uint8Array, sql: SqlJsStatic): ProjectDto` liefert dasselbe DTO wie `reader.rs` (`src/model.ts`). Es wirft `ReaderError` mit denselben deutschen Meldungen:

| Fall | Meldung (identisch zu Rust) |
|---|---|
| Kein SQLite-Kopf (`SQLite format 3\0`) bzw. leere Datei | „Die Datei ist keine Kairos-Projektdatei.“ |
| Pflichttabelle `meta`, `project`, `task` oder `dependency` fehlt; keine `meta`- bzw. `project`-Zeile | „Die Datei ist keine Kairos-Projektdatei.“ |
| `schema_version` außerhalb 2–5 | „Die Kairos-Dateiversion X wird nicht unterstützt (unterstützt: 2–5).“ |
| sql.js-Fehler beim Lesen | „Die Datei ist beschädigt: …“ |

**Ablauf** (wie `reader.rs`):
- Spalten per `PRAGMA table_info`. Fehlende optionale Spalten werden als `NULL AS name` gelesen.
- Vorgänge und Abhängigkeiten in `rowid`-Reihenfolge.
- Kalender des `default_calendar_id`, Arbeitswoche nach `weekday`, Ausnahmen nach `date`.
- Baselines nach `captured_at, rowid`.
- Booleans aus 0/1/NULL.
- Die Datenbank wird in `finally` geschlossen (`db.close()`).

`src/web/sqlite.ts` initialisiert sql.js einmalig mit dem eingebetteten WebAssembly:
- Import `sql.js/dist/sql-wasm.wasm?inline` ergibt eine Data-URL. Daraus wird ein `Uint8Array`, das als `initSqlJs({ wasmBinary })` übergeben wird.
- Dadurch gibt es keinen `fetch` und keine Netzwerkanfrage.

### 3.3 Web-Seite (`web/index.html`)

- **Gleiches Layout wie die Desktop-App,** mit zwei Ergänzungen:
  - **Leerer Zustand:** „Kairos-Datei öffnen oder hierher ziehen“, darunter „Ihre Datei wird ausschließlich in Ihrem Browser verarbeitet und nicht übertragen.“
  - **Fußzeile** (nicht im Druck) mit Links „Impressum“ und „Datenschutz“.
- **Titel:** „Kairos Viewer“.
- **Favicon:** das App-Icon, lokal eingebunden.
- **CSP zusätzlich als `<meta http-equiv="Content-Security-Policy">`** mit denselben Direktiven wie der Server-Header, soweit `<meta>` sie unterstützt. Das ist eine zusätzliche Absicherung, falls ein Header fehlt.

### 3.4 Sicherheits-Header (nginx/Apache-Beispiel, lokale Vorschau)

```
Content-Security-Policy: default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline';
                         img-src 'self' data:; connect-src 'none'; font-src 'none'; object-src 'none';
                         base-uri 'none'; form-action 'none'; frame-ancestors 'none'
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
Cross-Origin-Opener-Policy: same-origin
Strict-Transport-Security: max-age=31536000   (nur nginx/Apache unter HTTPS)
```

**Weitere Einstellungen:**
- **Caching:** gehashte Assets (`/assets/*`) ein Jahr `immutable`, HTML `no-cache`.
- **MIME-Typen:** `.wasm` wird nicht ausgeliefert, weil das Modul eingebettet ist.
- **Logs:** Das nginx-Beispiel enthält ein Log-Format mit gekürzter IP (letztes Oktett auf 0) und einen Hinweis auf kurze Aufbewahrung.

`scripts/serve-web.mjs`:
- Ein kleiner Node-Server ohne Abhängigkeiten. Er liefert `dist-web/` mit genau diesen Headern ohne HSTS aus, auf `http://localhost:4173`.
- Er erlaubt nur `GET`/`HEAD` und schützt vor Pfad-Traversal.

### 3.5 Build

- `npm run build:web` führt `tsc --noEmit` und `vite build --config vite.web.config.ts` aus. Ergebnis: `dist-web/` mit `index.html`, `impressum.html`, `datenschutz.html` und `assets/`. `base: './'` sorgt dafür, dass die Seite auch in einem Unterverzeichnis läuft.
- `npm run preview:web` baut zuerst und startet dann `scripts/serve-web.mjs`.
- Der Desktop-Build (`npm run build`, `tauri build`) bleibt unverändert und enthält kein sql.js.

### 3.6 Rechtliche Seiten

**`impressum.html`**
- Struktur nach § 5 DDG: Name, Anschrift, Kontakt.
- Alle Werte sind als `[PLATZHALTER: …]` markiert.

**`datenschutz.html`** ist ein Entwurf passend zur Technik:
- Verantwortlicher (Platzhalter).
- Server-Logfiles: Art. 6 Abs. 1 lit. f DSGVO, Inhalt, Speicherdauer (Platzhalter).
- **Ausdrücklich:**
  - Projektdateien werden ausschließlich lokal im Browser verarbeitet und nicht übertragen.
  - Keine Cookies, kein Tracking, keine externen Dienste oder Schriften.
- Betroffenenrechte, Beschwerderecht.
- Hinweis oben im Quelltext und sichtbar im Entwurf: „Entwurf – vor Veröffentlichung rechtlich prüfen.“

## 4. Tests

- **Referenzdatei `tests/fixtures/demo-v2.expected.json`:**
  - Wird aus dem Rust-Reader erzeugt.
  - Rust-Test: `read_project(demo-v2.kairos)` serialisiert ergibt exakt diese Datei.
  - TS-Test: `readProject(Bytes von demo-v2.kairos)` ergibt sie ebenfalls (deep equal).
- **TS-Reader-Tests** entsprechend `reader_tests.rs`:
  - Textdatei, leere Datei, SQLite ohne `task`, Version 1 und 6, Datei ohne optionale Spalten und Tabellen, v5-Spalten.
  - Der Test erzeugt die synthetischen Dateien mit sql.js und exportiert sie als Bytes.
- **Web-Plattform-Tests** mit jsdom und injiziertem Reader:
  - falsche Endung
  - Datei größer als 50 MB (`File` mit vorgetäuschter Größe)
  - Erfolgsfall meldet `loaded` mit Dateinamen
  - Reader-Fehler meldet `failed`
  - Drop ohne Datei wird ignoriert
- **App-Tests:**
  - Laufen künftig gegen eine Test-Plattform statt gegen Tauri-Mocks.
  - Die bestehenden Prüfungen (Kopfzeilen, Druckseiten, Fehlerbanner) bleiben erhalten.
- **Desktop:** Die Rust-Tests bleiben unverändert, dazu kommt der Test gegen die Referenzdatei.
- **Manuell in Chrome:** über `npm run preview:web` mit echten Headern.
  - Demo und reale Datei öffnen, jeweils über Auswahl und Drag&Drop.
  - Netzwerk-Tab: nach dem Laden der Seite 0 Anfragen.
  - Konsole: 0 CSP-Verstöße.
  - Druck-PDF, Impressum und Datenschutz erreichbar.
  - Desktop-App startet und zeigt die Demo-Datei wie bisher.
