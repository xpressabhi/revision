// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[tauri::command]
fn update_tray(app: AppHandle, due: i32, new: i32, total: i32) -> Result<(), String> {
    println!("[boot] frontend mounted — due={} new={} total={}", due, new, total);
    let tray = app.tray_by_id("main").ok_or("tray not found")?;
    let title = format!("Revision — Due {} • New {} • Total {}", due, new, total);
    let header = MenuItem::with_id(&app, "header", title, false, None::<&str>).map_err(|e| e.to_string())?;
    let review_i = MenuItem::with_id(&app, "review", "▶ Start Review", true, None::<&str>).map_err(|e| e.to_string())?;
    let show_i = MenuItem::with_id(&app, "show", "Show Revision", true, None::<&str>).map_err(|e| e.to_string())?;
    let sep1 = PredefinedMenuItem::separator(&app).map_err(|e| e.to_string())?;
    let sep2 = PredefinedMenuItem::separator(&app).map_err(|e| e.to_string())?;
    let quit_i = MenuItem::with_id(&app, "quit", "Quit", true, None::<&str>).map_err(|e| e.to_string())?;

    let menu = Menu::with_items(&app, &[&header, &sep1, &review_i, &show_i, &sep2, &quit_i]).map_err(|e| e.to_string())?;
    tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    let tooltip = format!("Revision — Due {} • New {}", due, new);
    let _ = tray.set_tooltip(Some(tooltip));
    let _ = tray.set_title(Some(format!("Due {}", due)));
    Ok(())
}

#[tauri::command]
fn debug_log(msg: String) {
    println!("[webview] {}", msg);
}

/// Extract an Anki deck (`.apkg`) or stage a raw Anki SQLite file for import.
/// Returns the absolute path of a `collection.anki21` SQLite file inside the
/// app data dir, which the frontend then opens read-only via the SQL plugin.
#[tauri::command]
fn stage_anki_db(app: AppHandle, path: String) -> Result<String, String> {
    use std::io::Read;

    let data_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let out_dir = data_dir.join("anki-import");
    std::fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;
    let dest = out_dir.join("collection.anki21");
    let rel = "anki-import/collection.anki21".to_string();
    let src = std::path::PathBuf::from(&path);
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    if ext == "apkg" || ext == "zip" {
        let file = std::fs::File::open(&src).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

        if archive.by_name("collection.anki21").is_ok() {
            let mut entry = archive.by_name("collection.anki21").map_err(|e| e.to_string())?;
            let mut out = std::fs::File::create(&dest).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
            return Ok(rel.clone());
        }
        if archive.by_name("collection.anki2").is_ok() {
            let mut entry = archive.by_name("collection.anki2").map_err(|e| e.to_string())?;
            let mut out = std::fs::File::create(&dest).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
            return Ok(rel.clone());
        }
        if archive.by_name("collection.anki21b").is_ok() {
            let mut entry = archive.by_name("collection.anki21b").map_err(|e| e.to_string())?;
            let mut compressed = Vec::new();
            entry.read_to_end(&mut compressed).map_err(|e| e.to_string())?;
            let decoded = zstd::stream::decode_all(compressed.as_slice()).map_err(|e| e.to_string())?;
            std::fs::write(&dest, decoded).map_err(|e| e.to_string())?;
            return Ok(rel.clone());
        }
        return Err("No collection database found in the .apkg".into());
    }

    std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    Ok(rel)
}

#[tauri::command]
fn cleanup_anki_import(app: AppHandle) -> Result<(), String> {
    let data_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let dir = data_dir.join("anki-import");
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let capture_shortcut = Shortcut::new(Some(Modifiers::ALT | Modifiers::SHIFT), Code::KeyK);
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler({
                    let shortcut = capture_shortcut.clone();
                    move |app, pressed, event| {
                        if event.state() == ShortcutState::Pressed && pressed == &shortcut {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                            let _ = app.emit("global-capture", ());
                        }
                    }
                })
                .build(),
        )
        .setup({
            let shortcut = capture_shortcut.clone();
            move |app| {
                if let Err(e) = app.global_shortcut().register(shortcut) {
                    println!("[shortcut] could not register global capture hotkey: {}", e);
                }
                let show_i = MenuItem::with_id(app, "show", "Show Revision", true, None::<&str>)?;
                let review_i = MenuItem::with_id(app, "review", "▶ Start Review", true, None::<&str>)?;
                let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
                let sep = PredefinedMenuItem::separator(app)?;
                let header = MenuItem::with_id(app, "header", "Revision — Loading…", false, None::<&str>)?;
                let menu = Menu::with_items(app, &[&header, &sep, &review_i, &show_i, &quit_i])?;

                let _tray = TrayIconBuilder::with_id("main")
                    .icon(app.default_window_icon().unwrap().clone())
                    .tooltip("Revision — Active Recall")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "show" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                        "review" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                                let _ = w.emit("tray-review", ());
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let app = tray.app_handle();
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    })
                    .build(app)?;

                Ok(())
            }
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            update_tray,
            debug_log,
            stage_anki_db,
            cleanup_anki_import
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
