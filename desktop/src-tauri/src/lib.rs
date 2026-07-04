mod breaker_watch;
mod mangoqa_watch;
mod sidecar;

use std::sync::Mutex;
use std::time::Duration;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;

/// Identifiant du tray, pour le retrouver depuis les threads de fond
/// (`app.tray_by_id(MAIN_TRAY_ID)`) sans avoir à faire voyager le handle lui-même.
const MAIN_TRAY_ID: &str = "main-tray";

/// PID du process racine du sidecar (node scripts/start.mjs), pour l'arrêter à la fermeture.
struct SidecarState(Mutex<Option<u32>>);

/// PID courant du process MangoQA supervisé (#180 É7, D7) — mis à jour par le watchdog
/// à chaque (re)spawn, lu à l'arrêt de l'app pour tuer proprement l'arbre de process.
struct MangoQaState(Mutex<Option<u32>>);

fn do_shutdown(app: &AppHandle) {
    let state = app.state::<SidecarState>();
    let pid = state.0.lock().unwrap().take();
    if let Some(pid) = pid {
        sidecar::shutdown_sidecar(pid);
    }
    let qa_state = app.state::<MangoQaState>();
    let qa_pid = qa_state.0.lock().unwrap().take();
    if let Some(qa_pid) = qa_pid {
        mangoqa_watch::shutdown_mangoqa(qa_pid);
    }
}

/// Commande native exposée au frontend (plan #180 É4) : ouvre le sélecteur de dossier natif
/// et renvoie le chemin choisi (ou None si annulé). Pas branchée à l'UI MangoOS ici — c'est
/// le travail d'É5 (consentement de coffres). Ici on prouve juste que la commande marche.
#[tauri::command]
fn pick_folder(app: AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .blocking_pick_folder()
        .map(|p| p.to_string())
}

/// Commande de test manuel : envoie une notification OS native. Sert de preuve en situation
/// réelle pour le canal "tray + notification système" du plan (D7 : futur canal MangoQA).
#[tauri::command]
fn send_test_notification(app: AppHandle) -> Result<(), String> {
    app.notification()
        .builder()
        .title("MangoOS")
        .body("Notification de test — coque desktop opérationnelle.")
        .show()
        .map_err(|e| e.to_string())
}

/// Commande native (#180 É6, D5) : ouvre un dossier dans l'explorateur de fichiers natif.
/// Même patron que `pick_folder`. Le chemin fourni vient d'un outil serveur déjà confiné
/// par le périmètre (perimeter-context.ts) — cette commande ne fait qu'ouvrir, elle ne
/// résout ni ne valide de chemin elle-même (ce n'est pas son rôle de sûreté).
#[tauri::command]
fn open_folder(app: AppHandle, path: String) -> Result<(), String> {
    app.opener().open_path(path, None::<&str>).map_err(|e| e.to_string())
}

/// Commande native (#180 É6, D5) : révèle/sélectionne un fichier dans l'explorateur natif
/// (Explorer/Finder/gestionnaire de fichiers Linux selon l'OS).
#[tauri::command]
fn reveal_in_explorer(app: AppHandle, path: String) -> Result<(), String> {
    app.opener().reveal_item_in_dir(path).map_err(|e| e.to_string())
}

/// Commande native (#180 É6, D5) : ouvre une URL dans le navigateur par défaut du système.
/// Le repli hors coque (mode navigateur classique) vit côté serveur (eleve-system-tools.ts,
/// via child_process) — cette commande est le chemin natif quand la coque est active.
#[tauri::command]
fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

pub fn run() {
    tauri::Builder::default()
        // Le plugin single-instance DOIT être enregistré en premier (doc officielle Tauri) :
        // si une 2e instance est lancée, ce callback tourne dans l'instance déjà vivante et
        // ramène sa fenêtre au premier plan au lieu de laisser un 2e process démarrer.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .manage(SidecarState(Mutex::new(None)))
        .manage(MangoQaState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            pick_folder,
            send_test_notification,
            open_folder,
            reveal_in_explorer,
            open_url
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Tray : icône + menu "Quitter". La fermeture depuis le tray doit, comme la
            // fermeture de fenêtre, arrêter proprement le sidecar (zéro orphelin port 3000).
            let quit_item = MenuItem::with_id(app, "quit", "Quitter MangoOS", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&quit_item])?;
            let _tray = TrayIconBuilder::with_id(MAIN_TRAY_ID)
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&tray_menu)
                .tooltip("MangoOS")
                .on_menu_event(|app, event| {
                    if event.id() == "quit" {
                        do_shutdown(app);
                        app.exit(0);
                    }
                })
                .build(app)?;

            // Démarrage du sidecar + création de la fenêtre APRÈS que backend+UI répondent
            // (aucune fenêtre "main" n'est déclarée dans tauri.conf.json : on la construit
            // ici, une fois prêt, pour éviter d'afficher une page blanche/erreur de connexion
            // pendant les quelques secondes de démarrage de npm/vite).
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                match sidecar::spawn_sidecar() {
                    Ok(child) => {
                        let pid = child.id();
                        let state = app_handle.state::<SidecarState>();
                        *state.0.lock().unwrap() = Some(pid);

                        let url = format!("http://localhost:{}", sidecar::UI_PORT);
                        let build_result = WebviewWindowBuilder::new(
                            &app_handle,
                            "main",
                            WebviewUrl::External(url.parse().unwrap()),
                        )
                        .title("MangoOS")
                        .inner_size(1280.0, 800.0)
                        .build();

                        match build_result {
                            Ok(_window) => {
                                log::info!("fenêtre MangoOS créée");
                                match app_handle
                                    .notification()
                                    .builder()
                                    .title("MangoOS")
                                    .body("MangoOS est prêt.")
                                    .show()
                                {
                                    Ok(()) => log::info!("notification de démarrage envoyée (OK)"),
                                    Err(e) => log::error!("échec envoi notification de démarrage : {e}"),
                                }
                            }
                            Err(e) => log::error!("échec création fenêtre MangoOS : {e}"),
                        }
                    }
                    Err(e) => {
                        log::error!("échec du démarrage du sidecar : {e}");
                    }
                }
            });

            // Supervision MangoQA (#180 É7, D7) : démarre AVEC l'app, watchdog qui
            // RESPAWN s'il meurt — patron IDENTIQUE à la supervision du sidecar
            // ci-dessus, jamais d'ordre métier (fantôme, cf. mangoqa_watch.rs). Le PID
            // courant est tenu à jour dans MangoQaState pour l'arrêt propre à la fermeture.
            let qa_app_handle = app.handle().clone();
            std::thread::spawn(move || {
                let dir = mangoqa_watch::mangoqa_dir();
                mangoqa_watch::supervise(dir, move |pid| {
                    let state = qa_app_handle.state::<MangoQaState>();
                    *state.0.lock().unwrap() = pid;
                });
            });

            // Notification OS + badge tray sur verdict rouge (#180 É7, D7) : poll
            // <repo>/workspace/.mangoqa/breaker-verdict.json (même fichier, même cadence
            // ~5s que le Disjoncteur MangoQA côté serveur, readBreakerVerdict/mangoqa.ts).
            let breaker_app_handle = app.handle().clone();
            let workspace_dir = sidecar::repo_root().join("workspace");
            std::thread::spawn(move || {
                breaker_watch::supervise(breaker_app_handle, workspace_dir, MAIN_TRAY_ID, Duration::from_secs(5));
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                // Fermer la fenêtre principale arrête le sidecar (backend + UI) — test de
                // preuve central du plan #180 É4 : zéro process orphelin sur le port 3000
                // après fermeture.
                do_shutdown(window.app_handle());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
