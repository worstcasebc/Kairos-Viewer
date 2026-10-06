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
