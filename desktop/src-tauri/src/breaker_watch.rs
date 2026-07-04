// Notification OS + badge tray sur verdict rouge (#180 É7, D7).
//
// MangoQA (Disjoncteur, Visage 1) écrit toutes les 5s <workspace>/.mangoqa/breaker-verdict.json
// (cf. server/src/mangoqa.ts, readBreakerVerdict — `{ safe: bool, trips: [...] }`). La
// coque LIT ce fichier, exactement comme MangoOS le lit côté serveur : SEULE LECTURE,
// fail-open (absent/invalide → ignoré, jamais de panic), et ne fait qu'AFFICHER — elle
// n'agit jamais sur le verdict (le fantôme reste fantôme, la coque n'est qu'un porte-voix
// vers Raf, cf. plan D7 "n'alerte que Raf").
//
// Deux effets sur transition safe:true → safe:false (jamais répété tant que le verdict
// reste rouge, pour ne pas spammer Raf à chaque poll) :
//   1. notification système native (réutilise le MÊME canal que send_test_notification/
//      la notif de démarrage déjà câblées en lib.rs à l'É4 — aucune duplication)
//   2. badge visuel sur l'icône du tray : bascule vers une icône ROUGE générée en mémoire
//      (pas d'asset PNG à ajouter — un petit carré rouge de 32x32 construit en RGBA brut,
//      voir alert_icon()) + tooltip explicite. Retour à l'icône par défaut sur transition
//      inverse (safe:false → safe:true).

use std::path::PathBuf;
use std::time::Duration;

use serde::Deserialize;
use tauri::image::Image;
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

#[derive(Debug, Deserialize)]
struct BreakerTripLite {
    #[serde(default)]
    breaker: String,
    #[serde(default)]
    reason: String,
}

#[derive(Debug, Deserialize)]
struct BreakerVerdictFile {
    safe: bool,
    #[serde(default)]
    trips: Vec<BreakerTripLite>,
}

/// Miroir minimal de readBreakerVerdict (mangoqa.ts) : garde de forme + fail-open. Un
/// fichier absent/trop gros/invalide → `None`, jamais de panic. `max_bytes` réplique
/// BREAKER_VERDICT_MAX_BYTES (1 Mo) côté serveur.
fn read_breaker_verdict(file: &PathBuf) -> Option<BreakerVerdictFile> {
    let meta = std::fs::metadata(file).ok()?;
    if meta.len() > 1_000_000 {
        return None;
    }
    let raw = std::fs::read_to_string(file).ok()?;
    serde_json::from_str::<BreakerVerdictFile>(&raw).ok()
}

/// Génère une petite icône ROUGE unie (32x32 RGBA) EN MÉMOIRE, sans asset externe — le
/// "badge" visuel de l'icône tray en cas d'alerte. Volontairement minimal (pas de
/// design), mais bien une icône DIFFÉRENTE de l'icône par défaut (pas juste un tooltip).
fn alert_icon() -> Image<'static> {
    const SIZE: u32 = 32;
    let mut rgba = Vec::with_capacity((SIZE * SIZE * 4) as usize);
    for _ in 0..(SIZE * SIZE) {
        rgba.extend_from_slice(&[214, 40, 40, 255]); // rouge alerte opaque
    }
    Image::new_owned(rgba, SIZE, SIZE)
}

/// Boucle bloquante (à lancer dans son propre thread) : poll `breaker-verdict.json`
/// toutes les `interval` (par défaut 5s, même cadence que l'écriture du Disjoncteur),
/// met à jour tray + notifie SEULEMENT sur transition vers rouge.
pub fn supervise(app: AppHandle, workspace_dir: PathBuf, tray_id: &'static str, interval: Duration) {
    let verdict_file = workspace_dir.join(".mangoqa").join("breaker-verdict.json");
    let mut last_safe: Option<bool> = None;

    loop {
        let verdict = read_breaker_verdict(&verdict_file);
        let safe = verdict.as_ref().map(|v| v.safe);

        // Fail-open : verdict absent/illisible → ne touche à RIEN (pas d'alerte fantôme
        // sur une simple absence de fichier, ex. MangoQA pas encore démarré).
        if let Some(current_safe) = safe {
            let became_unsafe = last_safe != Some(false) && !current_safe;
            let became_safe_again = last_safe == Some(false) && current_safe;

            if became_unsafe {
                let trips = verdict.as_ref().map(|v| v.trips.as_slice()).unwrap_or(&[]);
                let detail = if trips.is_empty() {
                    "Le Disjoncteur MangoQA signale un problème.".to_string()
                } else {
                    trips
                        .iter()
                        .map(|t| format!("{} : {}", t.breaker, t.reason))
                        .collect::<Vec<_>>()
                        .join(" · ")
                };
                log::warn!("verdict MangoQA → ALERTE (safe:false) : {detail}");
                let _ = app
                    .notification()
                    .builder()
                    .title("MangoOS — alerte MangoQA")
                    .body(detail)
                    .show();
                if let Some(tray) = app.tray_by_id(tray_id) {
                    let _ = tray.set_icon(Some(alert_icon()));
                    let _ = tray.set_tooltip(Some("MangoOS — ⚠ Alerte MangoQA (Disjoncteur)"));
                }
            } else if became_safe_again {
                log::info!("verdict MangoQA → revenu à safe:true, badge retiré");
                let restored_icon = app.default_window_icon().cloned();
                if let Some(tray) = app.tray_by_id(tray_id) {
                    if let Some(icon) = restored_icon {
                        let _ = tray.set_icon(Some(icon));
                    }
                    let _ = tray.set_tooltip(Some("MangoOS"));
                }
            }
            last_safe = Some(current_safe);
        }

        std::thread::sleep(interval);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_valid_red_verdict() {
        let dir = std::env::temp_dir().join(format!("breaker-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("breaker-verdict.json");
        std::fs::write(
            &file,
            r#"{"safe":false,"trips":[{"breaker":"cost-guard","action":"stop","reason":"budget dépassé"}],"evaluatedAt":123}"#,
        )
        .unwrap();

        let v = read_breaker_verdict(&file).expect("verdict lu");
        assert!(!v.safe);
        assert_eq!(v.trips.len(), 1);
        assert_eq!(v.trips[0].breaker, "cost-guard");
        assert_eq!(v.trips[0].reason, "budget dépassé");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn reads_valid_green_verdict() {
        let dir = std::env::temp_dir().join(format!("breaker-test-green-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("breaker-verdict.json");
        std::fs::write(&file, r#"{"safe":true,"trips":[],"evaluatedAt":123}"#).unwrap();

        let v = read_breaker_verdict(&file).expect("verdict lu");
        assert!(v.safe);
        assert!(v.trips.is_empty());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn absent_file_is_fail_open() {
        let file = std::env::temp_dir().join("mangoos-test-breaker-verdict-absent.json");
        let _ = std::fs::remove_file(&file);
        assert!(read_breaker_verdict(&file).is_none());
    }

    #[test]
    fn invalid_json_is_fail_open() {
        let dir = std::env::temp_dir().join(format!("breaker-test-invalid-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("breaker-verdict.json");
        std::fs::write(&file, "pas du json").unwrap();

        assert!(read_breaker_verdict(&file).is_none());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn malformed_missing_safe_field_is_fail_open() {
        let dir = std::env::temp_dir().join(format!("breaker-test-malformed-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("breaker-verdict.json");
        std::fs::write(&file, r#"{"trips":[]}"#).unwrap(); // "safe" manquant → invalide

        assert!(read_breaker_verdict(&file).is_none());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn alert_icon_builds_without_panicking() {
        // Preuve que la génération d'icône rouge en mémoire (le "badge") est fonctionnelle
        // — aucune dépendance à un asset externe (image::Image::new_owned pur en RAM).
        let _icon = alert_icon();
    }
}
