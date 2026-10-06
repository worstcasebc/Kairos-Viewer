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
