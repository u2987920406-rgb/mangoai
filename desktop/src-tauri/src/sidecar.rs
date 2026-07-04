// Supervision du sidecar Node (backend Express 3000 + UI Vite 5173).
//
// Choix d'implémentation (documenté en synthèse de mission) : on ne bundle PAS un binaire
// Node via le mécanisme "sidecar" officiel de Tauri (qui exige un binaire Node précompilé
// par plateforme, `binaries/node-<target-triple>.exe`, absent de ce repo). On réutilise
// directement `node scripts/start.mjs` via `std::process::Command` — c'est le même sidecar
// au sens fonctionnel (process supervisé, démarré/arrêté par la coque), sans dupliquer la
// logique métier de démarrage backend+UI déjà écrite en JS (anti-orphelin, npm run start,
// npm run dev, attente de port, ouverture navigateur qu'on neutralise ici car Tauri ouvre
// sa propre fenêtre).
//
// En plus de l'anti-orphelin déjà présent dans start.mjs, on refait un anti-orphelin natif
// EN RUST avant de spawn — défense en profondeur explicitement demandée par le plan #180 É4 :
// même si start.mjs est un jour cassé/modifié sans le garde-fou, la coque native reste sûre.

use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::time::{Duration, Instant};

pub const BACKEND_PORT: u16 = 3000;
pub const UI_PORT: u16 = 5173;

/// Racine du repo MangoOS, calculée depuis l'emplacement compile-time de ce crate
/// (desktop/src-tauri). Limite connue (documentée en synthèse) : en distribution packagée
/// pour un tiers, ce chemin compile-time ne sera plus valide — il faudra copier
/// scripts/server/ui dans les ressources bundlées (jalon distribution, hors scope É4 ici,
/// cette coque vise la machine de dev de Raf).
pub fn repo_root() -> PathBuf {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest_dir
        .parent() // desktop/
        .and_then(Path::parent) // MangoOS/
        .expect("impossible de résoudre la racine du repo depuis CARGO_MANIFEST_DIR")
        .to_path_buf()
}

fn port_is_free(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

/// Anti-orphelin natif Rust : si un process écoute déjà sur `port`, le tue (Windows :
/// netstat -ano -p tcp -> PID en LISTENING -> taskkill /F /PID). Miroir de killPortOwner()
/// dans scripts/start.mjs, porté en Rust comme demandé par le plan.
pub fn kill_port_owner(port: u16) {
    if port_is_free(port) {
        return;
    }
    log::warn!("port {port} déjà occupé — recherche d'un process orphelin (anti-orphelin Rust)");

    #[cfg(target_os = "windows")]
    {
        let output = Command::new("netstat").args(["-ano", "-p", "tcp"]).output();
        let Ok(output) = output else {
            log::error!("netstat a échoué, anti-orphelin Rust abandonné pour le port {port}");
            return;
        };
        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut pids = std::collections::HashSet::new();
        for line in stdout.lines() {
            let cols: Vec<&str> = line.split_whitespace().collect();
            // Colonnes attendues : Proto Local Foreign State PID
            if cols.len() >= 5 && cols[0].eq_ignore_ascii_case("TCP") && cols[3].eq_ignore_ascii_case("LISTENING") {
                if let Some(local_port) = cols[1].rsplit(':').next() {
                    if local_port.parse::<u16>() == Ok(port) {
                        pids.insert(cols[4].to_string());
                    }
                }
            }
        }
        for pid in pids {
            log::warn!("→ taskkill /F /PID {pid} (orphelin port {port})");
            let _ = Command::new("taskkill").args(["/F", "/PID", &pid]).output();
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let output = Command::new("sh")
            .arg("-c")
            .arg(format!("lsof -ti tcp:{port}"))
            .output();
        if let Ok(output) = output {
            for pid in String::from_utf8_lossy(&output.stdout).lines() {
                let pid = pid.trim();
                if !pid.is_empty() {
                    log::warn!("→ kill -9 {pid} (orphelin port {port})");
                    let _ = Command::new("kill").args(["-9", pid]).output();
                }
            }
        }
    }
}

fn wait_for_port_listening(port: u16, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    loop {
        if !port_is_free(port) {
            return true; // quelqu'un écoute désormais
        }
        if Instant::now() > deadline {
            return false;
        }
        std::thread::sleep(Duration::from_millis(400));
    }
}

/// Lance `node scripts/start.mjs` après anti-orphelin natif sur le port backend, puis
/// attend que le backend ET l'UI répondent (avec timeout, comme start.mjs). Retourne le
/// `Child` (le process node racine de start.mjs) pour supervision (PID, arrêt à la fermeture).
pub fn spawn_sidecar() -> std::io::Result<Child> {
    kill_port_owner(BACKEND_PORT);

    let root = repo_root();
    let script = root.join("scripts").join("start.mjs");
    log::info!("spawn sidecar : node {}", script.display());

    let child = Command::new("node")
        .arg(&script)
        .current_dir(&root)
        // (#180 É6) seul signal fiable, côté process Node, que MangoOS tourne DANS la
        // coque desktop Tauri (par opposition à `npm run start` / onglet navigateur).
        // Lu par eleve-system-tools.ts pour n'activer open_folder/reveal_in_explorer
        // QUE quand la coque est réellement là — sans échec silencieux hors coque.
        .env("MANGOOS_DESKTOP_SHELL", "1")
        .spawn()?;

    let backend_up = wait_for_port_listening(BACKEND_PORT, Duration::from_secs(30));
    log::info!("backend prêt sur :3000 = {backend_up}");
    let ui_up = wait_for_port_listening(UI_PORT, Duration::from_secs(30));
    log::info!("UI prête sur :5173 = {ui_up}");

    Ok(child)
}

/// Arrêt propre : tue l'arbre de process entier du sidecar (node start.mjs + npm start +
/// npm dev + leurs enfants) via `taskkill /PID <pid> /T /F`. On ne compte pas sur le
/// gestionnaire SIGINT interne de start.mjs (peu fiable à recevoir depuis un process Rust
/// parent sur Windows) : /T tue tout le sous-arbre directement, ce qui est la garantie
/// "zéro orphelin" demandée par le plan.
pub fn shutdown_sidecar(pid: u32) {
    log::info!("arrêt du sidecar (arbre de process racine pid={pid})");
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .output();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = Command::new("kill").args(["-TERM", &format!("-{pid}")]).output();
    }
    // Filet de sécurité supplémentaire : au cas où l'arbre ne serait pas complet
    // (ex. npm.cmd détaché), on repasse l'anti-orphelin sur les deux ports connus.
    kill_port_owner(BACKEND_PORT);
    kill_port_owner(UI_PORT);
}
