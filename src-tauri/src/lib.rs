// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(serde::Deserialize)]
struct DeckStat {
    name: String,
    due: i32,
    total: i32,
}

#[tauri::command]
fn update_tray(app: AppHandle, due: i32, new: i32, total: i32, decks: Vec<DeckStat>) -> Result<(), String> {
    let tray = app.tray_by_id("main").ok_or("tray not found")?;
    let title = format!("Revision — Due {} • New {} • Total {}", due, new, total);
    let header = MenuItem::with_id(&app, "header", title, false, None::<&str>).map_err(|e| e.to_string())?;
    let review_i = MenuItem::with_id(&app, "review", "▶ Start Review", true, None::<&str>).map_err(|e| e.to_string())?;
    let show_i = MenuItem::with_id(&app, "show", "Show Revision", true, None::<&str>).map_err(|e| e.to_string())?;
    let widget_i = MenuItem::with_id(&app, "widget", "Toggle Widget", true, None::<&str>).map_err(|e| e.to_string())?;
    let sep1 = PredefinedMenuItem::separator(&app).map_err(|e| e.to_string())?;
    let sep2 = PredefinedMenuItem::separator(&app).map_err(|e| e.to_string())?;
    let quit_i = MenuItem::with_id(&app, "quit", "Quit", true, None::<&str>).map_err(|e| e.to_string())?;

    // If decks provided, add a disabled summary line per deck (optional, keep simple)
    let menu = if decks.is_empty() {
        Menu::with_items(&app, &[&header, &sep1, &review_i, &show_i, &widget_i, &sep2, &quit_i]).map_err(|e| e.to_string())?
    } else {
        // Build with up to 4 deck lines as disabled items
        let mut deck_items: Vec<MenuItem<tauri::Wry>> = Vec::new();
        for d in decks.iter().take(4) {
            let label = format!("{} — Due {} • {}", d.name, d.due, d.total);
            let short = if label.chars().count() > 48 {
                format!("{}…", label.chars().take(47).collect::<String>())
            } else {
                label
            };
            let item = MenuItem::with_id(&app, format!("deck_{}", d.name), short, false, None::<&str>).map_err(|e| e.to_string())?;
            deck_items.push(item);
        }
        // Need to keep deck_items alive while building menu, so we handle references carefully
        match deck_items.len() {
            0 => Menu::with_items(&app, &[&header, &sep1, &review_i, &show_i, &widget_i, &sep2, &quit_i]).map_err(|e| e.to_string())?,
            1 => Menu::with_items(&app, &[&header, &sep1, &review_i, &show_i, &widget_i, &sep2, &deck_items[0], &quit_i]).map_err(|e| e.to_string())?,
            2 => Menu::with_items(&app, &[&header, &sep1, &review_i, &show_i, &widget_i, &sep2, &deck_items[0], &deck_items[1], &quit_i]).map_err(|e| e.to_string())?,
            3 => Menu::with_items(&app, &[&header, &sep1, &review_i, &show_i, &widget_i, &sep2, &deck_items[0], &deck_items[1], &deck_items[2], &quit_i]).map_err(|e| e.to_string())?,
            _ => Menu::with_items(&app, &[&header, &sep1, &review_i, &show_i, &widget_i, &sep2, &deck_items[0], &deck_items[1], &deck_items[2], &deck_items[3], &quit_i]).map_err(|e| e.to_string())?,
        }
    };

    tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    let tooltip = format!("Revision — Due {} • New {}", due, new);
    let _ = tray.set_tooltip(Some(tooltip));
    let _ = tray.set_title(Some(format!("Due {}", due)));
    Ok(())
}

#[tauri::command]
fn toggle_widget(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("widget") {
        if w.is_visible().unwrap_or(false) {
            w.hide().map_err(|e| e.to_string())?;
        } else {
            w.show().map_err(|e| e.to_string())?;
            w.set_focus().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn show_widget(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("widget") {
        w.show().map_err(|e| e.to_string())?;
        w.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn hide_widget(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("widget") {
        w.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            let show_i = MenuItem::with_id(app, "show", "Show Revision", true, None::<&str>)?;
            let review_i = MenuItem::with_id(app, "review", "▶ Start Review", true, None::<&str>)?;
            let widget_i = MenuItem::with_id(app, "widget", "Toggle Widget", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let header = MenuItem::with_id(app, "header", "Revision — Loading…", false, None::<&str>)?;
            let menu = Menu::with_items(app, &[&header, &sep, &review_i, &show_i, &widget_i, &quit_i])?;

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
                    "widget" => {
                        if let Some(w) = app.get_webview_window("widget") {
                            if w.is_visible().unwrap_or(false) {
                                let _ = w.hide();
                            } else {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
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
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let label = window.label();
                if label == "main" || label == "widget" {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![greet, update_tray, toggle_widget, show_widget, hide_widget])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
