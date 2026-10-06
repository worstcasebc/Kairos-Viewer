pub mod reader;

use std::sync::Mutex;
#[allow(unused_imports)]
use tauri::Manager;

/// Datei, die vor dem Laden des Frontends übergeben wurde (argv oder macOS „Opened“).
#[derive(Default)]
struct PendingFile(Mutex<Option<String>>);

/// Erstes Programmargument (ohne Programmnamen), das auf `.kairos` endet – Windows/Linux übergeben
/// per Doppelklick geöffnete Dateien so.
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
