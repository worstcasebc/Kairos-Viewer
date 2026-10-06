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

#[test]
fn reads_relative_path() {
    // cargo test läuft im Paketordner (src-tauri); der Pfad ist bewusst relativ.
    let project = read_project(Path::new("tests/fixtures/demo-v2.kairos")).unwrap();
    assert_eq!(project.tasks.len(), 9);
}
