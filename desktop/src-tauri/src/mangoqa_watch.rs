// Supervision du process MangoQA par la coque desktop (#180 É7, D7).
//
// MangoQA vit dans un dépôt SÉPARÉ (`D:\IA\MangoQA`, hors de ce repo) et reste un
// FANTÔME au sens de `fondation.md` §V : il n'agit jamais, ne reçoit d'ordres de
// personne — il tourne, observe, ÉCRIT ses verdicts (`breaker-verdict.json`,
// `observer-report.json`…) que MangoOS lit (`server/src/mangoqa.ts`). La coque ne fait
// QUE superviser son CYCLE DE VIE (start/stop/restart), exactement comme elle supervise
// déjà le sidecar Node backend+UI (sidecar.rs) — JAMAIS sa logique. Ce module ne lui
// donne aucun ordre métier : il exécute `npm run start` (= `tsx src/index.ts`, cf.
// D:\IA\MangoQA\package.json) et surveille que le process reste vivant, un point.
//
// Patron IDENTIQUE au sidecar (même style que sidecar.rs, watchdog en plus) :
//   1. spawn_mangoqa()  — lance `npm run start` dans le répertoire MangoQA
//   2. supervise()      — thread qui attend la fin du process (Child::try_wait) et le
//                         RESPAWN s'il meurt (watchdog simple demandé par le plan, "poll
//                         périodique du PID, respawn si absent" — ici implémenté via
//                         try_wait(), équivalent fonctionnel : on interroge l'OS pour
//                         savoir si le PID est toujours vivant, à intervalle régulier)
//   3. shutdown_mangoqa() — tue l'arbre de process à la fermeture de l'app (même
//                         mécanisme taskkill /T /F que shutdown_sidecar)
//
// Chemin du dépôt MangoQA : PAS dans ce repo, donc pas dérivable de CARGO_MANIFEST_DIR
// comme `repo_root()`. Repli sur un chemin par défaut cohérent avec la machine de Raf
// (`D:\IA\MangoQA`, cf. docs/plan-180-interface-autonome.md §1.3 et tous les plans #176-180
// qui le citent ainsi), overridable par la variable d'env `MANGOOS_MANGOQA_DIR` (utile en
// test / si le dépôt est ailleurs). Limite honnête assumée (comme repo_root() pour le
// sidecar) : chemin en dur pour la machine de dev, pas une découverte cross-machine.

use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::time::Duration;

/// Répertoire du dépôt MangoQA (séparé de ce repo). Overridable via
/// `MANGOOS_MANGOQA_DIR` (tests / machine différente) ; sinon chemin par défaut connu.
pub fn mangoqa_dir() -> PathBuf {
    match std::env::var("MANGOOS_MANGOQA_DIR") {
        Ok(v) if !v.trim().is_empty() => PathBuf::from(v),
        _ => PathBuf::from(r"D:\IA\MangoQA"),
    }
}

/// Lance `npm run start` (= `tsx src/index.ts`) dans le répertoire MangoQA, SI ce
/// répertoire existe — sinon retourne `None` sans jamais faire planter la coque (le
/// fantôme est une brique optionnelle : son absence ne doit jamais empêcher MangoOS de
/// démarrer, exactement comme readObserverReport/readBreakerVerdict sont fail-open côté
/// serveur).
pub fn spawn_mangoqa(dir: &Path) -> Option<Child> {
    if !dir.is_dir() {
        log::warn!("MangoQA introuvable ({} absent) — supervision désactivée, MangoOS continue sans fantôme", dir.display());
        return None;
    }
    log::info!("spawn MangoQA : npm run start (cwd={})", dir.display());
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = Command::new("cmd");
        c.args(["/C", "npm", "run", "start"]);
        c
    };
    #[cfg(not(target_os = "windows"))]
    let mut cmd = {
        let mut c = Command::new("npm");
        c.args(["run", "start"]);
        c
    };
    cmd.current_dir(dir);
    match cmd.spawn() {
        Ok(child) => {
            log::info!("MangoQA lancé (pid={})", child.id());
            Some(child)
        }
        Err(e) => {
            log::error!("échec du lancement de MangoQA : {e}");
            None
        }
    }
}

/// Arrêt propre de l'arbre de process MangoQA (même mécanisme que shutdown_sidecar :
/// /T /F tue tout le sous-arbre npm→tsx→node, pas seulement le process racine cmd/npm).
pub fn shutdown_mangoqa(pid: u32) {
    log::info!("arrêt de MangoQA (arbre de process racine pid={pid})");
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("taskkill").args(["/PID", &pid.to_string(), "/T", "/F"]).output();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = Command::new("kill").args(["-TERM", &format!("-{pid}")]).output();
    }
}

/// Watchdog : boucle bloquante (à lancer dans son propre thread) qui attend que le
/// process MangoQA courant se termine (`Child::wait`, poll de son statut de sortie —
/// c'est la manière idiomatique Rust de "poller le PID" : le noyau réveille le thread
/// dès que le process meurt, pas de sleep-loop actif nécessaire) puis le RESPAWN,
/// indéfiniment, tant que `mangoqa_dir()` existe. `on_pid_change` est appelé à chaque
/// (re)spawn avec le NOUVEAU pid (ou `None` si le spawn a échoué) — utilisé par lib.rs
/// pour tenir à jour le pid courant dans l'état partagé (pour l'arrêt propre à la
/// fermeture de l'app).
pub fn supervise(dir: PathBuf, mut on_pid_change: impl FnMut(Option<u32>)) {
    loop {
        let child = spawn_mangoqa(&dir);
        match child {
            None => {
                on_pid_change(None);
                // Répertoire absent (ou spawn KO) — on retente périodiquement, sans
                // jamais throw/bloquer la coque (le fantôme est optionnel).
                std::thread::sleep(Duration::from_secs(30));
                continue;
            }
            Some(mut c) => {
                on_pid_change(Some(c.id()));
                match c.wait() {
                    Ok(status) => {
                        log::warn!("MangoQA s'est arrêté (status={status}) — RESPAWN (watchdog #180 É7 D7)");
                    }
                    Err(e) => {
                        log::error!("erreur en attendant MangoQA : {e} — RESPAWN");
                    }
                }
                on_pid_change(None);
                // Petit délai avant respawn — évite une boucle de crash immédiate à
                // 100% CPU si MangoQA échoue instantanément à chaque lancement.
                std::thread::sleep(Duration::from_secs(2));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_dir_is_the_known_mangoqa_repo() {
        std::env::remove_var("MANGOOS_MANGOQA_DIR");
        assert_eq!(mangoqa_dir(), PathBuf::from(r"D:\IA\MangoQA"));
    }

    #[test]
    fn override_env_wins() {
        std::env::set_var("MANGOOS_MANGOQA_DIR", r"C:\ailleurs\MangoQA");
        assert_eq!(mangoqa_dir(), PathBuf::from(r"C:\ailleurs\MangoQA"));
        std::env::remove_var("MANGOOS_MANGOQA_DIR");
    }

    #[test]
    fn spawn_on_missing_dir_returns_none_without_panicking() {
        let dir = std::env::temp_dir().join("mangoos-test-mangoqa-dir-does-not-exist");
        let _ = std::fs::remove_dir_all(&dir);
        assert!(spawn_mangoqa(&dir).is_none());
    }
}
