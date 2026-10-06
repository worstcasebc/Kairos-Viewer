pub mod reader;

use std::ffi::OsString;
use std::path::Path;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

/// Übergibt von außen geöffnete Dateien (Startargument, macOS „Opened“, zweite Instanz) ans Frontend.
/// Bis das Frontend `initial_file` aufruft, wird die Datei zurückgehalten; danach nur noch per Event
/// gesendet. So kommt jede Datei genau einmal an.
#[derive(Debug, Default)]
pub struct FileHandoff {
    pending: Option<String>,
    ready: bool,
}

impl FileHandoff {
    pub fn with_initial(path: Option<String>) -> Self {
        Self { pending: path, ready: false }
    }

    /// Frontend ist bereit (Event-Listener registriert) und holt die zurückgehaltene Datei ab.
    pub fn take_initial(&mut self) -> Option<String> {
        self.ready = true;
        self.pending.take()
    }

    /// Neue Datei von außen: `Some` = jetzt per Event senden, `None` = für `take_initial` zurückgehalten.
    pub fn deliver(&mut self, path: String) -> Option<String> {
        if self.ready {
            Some(path)
        } else {
            self.pending = Some(path);
            None
        }
    }
}

struct Handoff(Mutex<FileHandoff>);

fn is_kairos_path(path: &str) -> bool {
    path.to_lowercase().ends_with(".kairos")
}

/// Erstes Programmargument (ohne Programmnamen), das auf `.kairos` endet – Windows/Linux übergeben
/// per Doppelklick geöffnete Dateien so. Argumente, die kein gültiges Unicode sind, werden übersprungen.
pub fn kairos_arg<I: IntoIterator<Item = OsString>>(args: I) -> Option<String> {
    args.into_iter()
        .skip(1)
        .filter_map(|a| a.into_string().ok())
        .find(|a| is_kairos_path(a))
}

/// Relative Pfade (Kommandozeile einer zweiten Instanz) gegen deren Arbeitsverzeichnis auflösen.
pub fn resolve_against(path: String, cwd: &Path) -> String {
    if Path::new(&path).is_absolute() {
        path
    } else {
        cwd.join(path).to_string_lossy().into_owned()
    }
}

/// Liest nur `.kairos`-Dateien; andere Pfade werden gar nicht erst angefasst.
pub fn open_project_checked(path: &str) -> Result<reader::ProjectDto, String> {
    if !is_kairos_path(path) {
        return Err("Nur .kairos-Dateien können geöffnet werden.".to_string());
    }
    reader::read_project(Path::new(path)).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_project(path: String) -> Result<reader::ProjectDto, String> {
    open_project_checked(&path)
}

#[tauri::command]
fn initial_file(handoff: tauri::State<'_, Handoff>) -> Option<String> {
    handoff.0.lock().unwrap().take_initial()
}

#[tauri::command]
fn print_window(window: tauri::WebviewWindow) -> Result<(), String> {
    window.print().map_err(|e| e.to_string())
}

/// Datei ans Frontend geben: sofort per Event, falls es bereit ist, sonst zurückhalten.
fn hand_over<R: tauri::Runtime>(app: &tauri::AppHandle<R>, path: String) {
    let emit_now = app.state::<Handoff>().0.lock().unwrap().deliver(path);
    if let Some(path) = emit_now {
        let _ = app.emit("open-file", path);
    }
}

pub fn run() {
    let app = tauri::Builder::default()
        // Muss als erstes Plugin registriert werden. Unter Windows startet ein Doppelklick auf eine
        // weitere Datei sonst eine zweite Instanz; so landet die Datei im laufenden Fenster.
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            let path = kairos_arg(argv.into_iter().map(OsString::from))
                .map(|p| resolve_against(p, Path::new(&cwd)));
            if let Some(path) = path {
                hand_over(app, path);
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(Handoff(Mutex::new(FileHandoff::with_initial(kairos_arg(std::env::args_os())))))
        .invoke_handler(tauri::generate_handler![open_project, initial_file, print_window])
        .build(tauri::generate_context!())
        .expect("Kairos Viewer konnte nicht gestartet werden");

    app.run(|_handle, _event| {
        // macOS liefert per Finder geöffnete Dateien als Event statt als Argument.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = &_event {
            let path = urls
                .iter()
                .filter_map(|url| url.to_file_path().ok())
                .map(|p| p.to_string_lossy().into_owned())
                .find(|p| is_kairos_path(p));
            if let Some(path) = path {
                hand_over(_handle, path);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::{kairos_arg, open_project_checked, resolve_against, FileHandoff};
    use std::ffi::OsString;
    use std::path::Path;

    fn args(list: &[&str]) -> Vec<OsString> {
        list.iter().map(OsString::from).collect()
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

    #[cfg(unix)]
    #[test]
    fn skips_non_unicode_arguments_without_panicking() {
        use std::os::unix::ffi::OsStringExt;
        let broken = OsString::from_vec(vec![b'x', 0xff, b'.', b'k', b'a', b'i', b'r', b'o', b's']);
        let list = vec![OsString::from("viewer"), broken, OsString::from("/x/Plan.kairos")];
        assert_eq!(kairos_arg(list), Some("/x/Plan.kairos".to_string()));
    }

    #[test]
    fn resolves_relative_paths_of_second_instance_against_its_cwd() {
        let cwd = std::env::temp_dir();
        let resolved = resolve_against("Plan.kairos".to_string(), &cwd);
        assert_eq!(Path::new(&resolved), cwd.join("Plan.kairos"));
        let absolute = cwd.join("x.kairos").to_string_lossy().into_owned();
        assert_eq!(resolve_against(absolute.clone(), Path::new("/anders")), absolute);
    }

    #[test]
    fn open_project_rejects_other_file_types() {
        let err = open_project_checked("/etc/hosts").unwrap_err();
        assert_eq!(err, "Nur .kairos-Dateien können geöffnet werden.");
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/demo-v2.kairos");
        assert_eq!(open_project_checked(&fixture.to_string_lossy()).unwrap().tasks.len(), 9);
    }

    #[test]
    fn handoff_holds_file_until_frontend_is_ready_then_only_emits() {
        let mut handoff = FileHandoff::with_initial(None);
        assert_eq!(handoff.deliver("/a.kairos".to_string()), None, "vor Bereitschaft zurückhalten");
        assert_eq!(handoff.take_initial(), Some("/a.kairos".to_string()));
        assert_eq!(handoff.take_initial(), None, "nur einmal ausliefern");
        assert_eq!(handoff.deliver("/b.kairos".to_string()), Some("/b.kairos".to_string()), "danach per Event");
        assert_eq!(handoff.take_initial(), None, "per Event gelieferte Datei nicht zusätzlich zurückhalten");
    }

    #[test]
    fn handoff_returns_start_argument_once() {
        let mut handoff = FileHandoff::with_initial(Some("/start.kairos".to_string()));
        assert_eq!(handoff.take_initial(), Some("/start.kairos".to_string()));
        assert_eq!(handoff.take_initial(), None);
    }
}
