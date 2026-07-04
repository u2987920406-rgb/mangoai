---
type: entite
tags: [desktop, perimetre, tauri, scheduler, mangoqa, securite]
statut: complet
sources: [statut, historique, plan-180-interface-autonome]
maj: 2026-07-05
---

# Interface de bureau autonome (#180)

MangoOS devient une vraie **app de bureau** (fenêtre native Tauri, pas un onglet) et gagne un **périmètre d'action élargi CONTRÔLÉ** — deux axes orthogonaux jamais couplés (D1), le VÉHICULE (packaging, risque faible) et le PÉRIMÈTRE (autorité d'agir, risque élevé, cœur du chantier).

## Rôle

Exécute le patron « distribution jalon A + périmètre d'action élargi contrôlé » de la roadmap. Le véhicule fait ce que fait n'importe quel installeur desktop (fenêtre, tray, sidecar Node supervisé). Le périmètre est le vrai différenciateur de sûreté : le pouvoir d'agir hors-workspace suit le PILOTE (D4) — large quand Raf est présent, restreint automatiquement quand personne ne supervise (nuit/cron/Stratège), et ce basculement n'est pas une promesse de doc mais une vérification RUNTIME que les garde-fous de la revue globale (`[[mangoqa]]` autorité d'arrêt, budget-$ dur, bus QA) sont ARMÉS, pas juste existants.

## Détails clés

- **D1** — véhicule ≠ périmètre, jamais couplés. Le danger n'est jamais dans la fenêtre, il est dans le pouvoir d'agir.
- **D2/É4** — coque **Tauri** mince (WebView + sidecar Node), pas Electron. `desktop/src-tauri/src/sidecar.rs` : anti-orphelin port 3000 EN RUST avant spawn, lance `node scripts/start.mjs`, arrêt `taskkill /T /F` = zéro orphelin. Fenêtre construite APRÈS que backend+UI répondent. Single-instance, tray, notifications (`tauri-plugin-notification`).
- **D3/É1-É2, É5** — périmètre = **coffres consentis** (workspace + N dossiers grantés via picker natif), jamais un accès disque libre. `server/src/perimeter.ts` : `resolveInside(root)` généralisé en `resolveInsideAny(roots)` — le TEST de confinement ne change jamais, seul l'ensemble des racines légitimes s'élargit. Grants persistés atomiquement (`data/desktop-grants.json`), révocables, UI `Coffres.jsx`.
- **D4 (décision centrale)** — le périmètre suit l'ACTEUR (`interactive` vs `autonomous`). Un acteur autonome n'obtient le palier élargi (coffres en lecture seule) que si `MANGOQA_STOP_AUTHORITY` ET `NOCTURNAL_BUDGET_HARD` ET `NOCTURNAL_QA_BUS` sont TOUS armés — sinon **fail-safe** : retombée automatique au workspace historique. Nuance capitale : la clôture QA (`[[gardien-cloture]]`) est fail-open (une panne du juge ne bloque pas) ; le périmètre est fail-**safe** (dans le doute, on restreint) — un gate de POUVOIR échoue fermé, un gate de QUALITÉ échoue ouvert.
- **D5/É6** — `run_command` élargi = 2ᵉ allowlist « système » gatée (`DESKTOP_SYSTEM_SHELL`), **interactif seulement**, refus inconditionnel en autonome, au-dessus du plancher inviolable `FORBIDDEN_RUN` (jamais affaibli). Outils déterministes préférés au shell libre (`open_folder`/`reveal_in_explorer`/`open_url`). Une violation de périmètre devient un signal lu par le Disjoncteur MangoQA (`perimeter-incidents.ts`).
- **D6/É7** — multi-projets = plusieurs vues, mais l'exécution agentique reste un **scheduler BORNÉ** (`server/src/agent-scheduler.ts`, pool de taille fixe `DESKTOP_MAX_CONCURRENT_RUNS` déf. 1) qui partage le MÊME ledger `data/global-budget.json` que `NOCTURNAL_BUDGET_HARD` (réutilisé tel quel) — deux runs de front ne peuvent PAS, à eux deux, dépasser le plafond dur. Prouvé contre le vrai fichier sur disque (28/28). `agent-lock.ts` (le verrou global historique) reste intact, non modifié — le pool est un mécanisme neuf, indépendant, câblage dans les routes HTTP différé (limite L92).
- **D7/É7** — MangoQA devient un service **SUPERVISÉ** par la coque (`desktop/src-tauri/src/mangoqa_watch.rs` : démarre `npm run start` dans `D:\IA\MangoQA`, watchdog respawn si mort, arrêt propre à la fermeture) sans jamais lui donner d'ordre métier — le fantôme reste un fantôme (`fondation.md` §V). La coque lit son verdict (`breaker_watch.rs` : poll `breaker-verdict.json` toutes les 5s, miroir de `readBreakerVerdict`) et lui offre enfin un canal réel vers Raf : notification OS native + badge tray (icône rouge générée en mémoire) sur transition vers `safe:false`.

## Limites honnêtes

9 risques du plan §4 + 3 propres à É7, tous inscrits `[[limites]]` L85-L95 : pas d'isolation OS réelle (contrôle applicatif seulement) · `FORBIDDEN_RUN` = blacklist incomplète par nature · signature d'exécutable = achat externe · empaquetage Tauri cross-OS non prouvé (Windows seulement) · interaction gates `DESKTOP_*`×reprise jamais testée ensemble · scheduler prouvé isolément mais pas câblé en production · chemin MangoQA en dur pour la machine de Raf · badge tray fonctionnel mais visuellement minimal.

## Liens

[[perimetre]] (à écrire si le concept grossit) · [[mangoqa]] · [[gardien-cloture]] · [[loop]] (cron agentique, même famille de budget) · [[stratege-global]] (autre acteur autonome soumis au même palier D4) · [[limites]]

## Sources

`docs/plan-180-interface-autonome.md` · `statut.md` (2026-07-05) · `historique.md` (Idée #180) · `docs/roadmap-game-changer.md`
