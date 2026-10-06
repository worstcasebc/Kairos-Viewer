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
