# Référentiel des capacités de MangoOS — la carte de ce que Mango SAIT FAIRE

> **Document de référence vivant** (créé 2026-07-03, sur demande de Raf) : compétences, savoir-faire, skills, agents spécialisés et points de qualité — pour audit rapide. **À mettre à jour à chaque livraison** qui ajoute/renforce une capacité (même rythme que statut.md). Remplace-et-étend l'inventaire du 2026-07-02 (`audit-competences-mango.md`).
> Convention maturité : ✅ mûr & prouvé live · 🟢 livré & testé · ⚠️ opt-in (gaté OFF) · 🚧 partiel.

## 1. Outils de l'Élève (~32 KernelTools — ce que GLM peut FAIRE de ses mains)

| Famille | Outils | Gate (état actuel) | Maturité |
|---|---|---|---|
| Fichiers & build | read_file, list_files, search_code, check_build, write_file, edit_file, run_command (borné), add_dependency (allowlist) | toujours ON | ✅ |
| Web & recherche | chercher_web, lire_page, requete_web (API), chercher_image (Pexels, vraies photos) | ON | ✅ |
| Documents & archives | lire_document (PDF/DOCX/XLSX/PPTX), lire_archive (ZIP/RAR) | ON | ✅ (PDF scannés = L4) |
| Exploration web profonde | extraire_site (5 phases : naviguer/voir/comprendre/reformuler/illustrer, persisté en artefact) | ON | ✅ |
| Vision (l'œil) | **vois_ecran** (rendu→VL→critique texte ; **multi-pages `chemin` + pleine hauteur `page_entiere` depuis 2026-07-03**), lire_image | ELEVE_VISION=**on** | ✅ |
| Génération d'images | genere_image (ComfyUI local → Krea 2 cloud → conseil Pexels), decoupe_assets | ELEVE_FLUX/KREA · OFF (solde Krea = L74) | ⚠️ |
| Test / QA | **teste_parcours** (joue un vrai parcours utilisateur : clics/saisies/attendus/erreurs console) | ON | ✅ |
| Auto-test | ecris_test (persiste un parcours dans `.mango-tests/`), lance_tests (rejoue la suite, ✗ → se corrige) | ELEVE_AUTOTEST=**on** | 🟢 |
| Planification | planifier (plan d'étapes AVANT de coder), etape_faite (suivi) — plan-ancre rappelé s'il dérive | ON | ✅ |
| Réutilisation cross-projet | chercher_artefact (Blackboard SQLite : composants, palettes, sites extraits) | ON | ✅ |
| Contenu structuré | genere_contenu, verifie_coherence_images | ELEVE_CONTENT · OFF | ⚠️ |
| Infra back | assemble_brique — 5 briques éprouvées (auth · db SQLite · paiement Stripe · sécurité · RGPD), résolution transitive des requires | ELEVE_BRICKS · OFF | ⚠️ (166 tests) |
| Secrets | utilise_secret (références `secret://`, coffre AES-256-GCM local + Bitwarden bws, valeur JAMAIS dans le LLM) | ELEVE_VAULT · OFF | ⚠️ (71 tests) |
| Domaine Unity | unity_build, unity_test (build headless C#) | ELEVE_UNITY · OFF | ⚠️ |
| Délégation | delegate (sous-tâche à un sous-agent borné, profondeur+budget partagés, cerveau par intention) | ON (dans la boucle) | ✅ |

## 2. Cerveaux (13 rôles, Brain-Dispatch #150 — QUI pense quoi)

| Rôle | Modèle actuel | Sert à |
|---|---|---|
| codeur (exécutant principal) | **glm-5.2:cloud** (openai-compat, function-calling) | La boucle agentique de build — le cœur souverain $0 |
| juge | **qwen3.5:cloud** | Intention du Gardien (juge ≠ exécutant, principe de séparation) |
| vision | **qwen3.5:cloud** (VL) | vois_ecran, critique design, juge pixel du Moteur de Goût |
| stratege | qwen3.5:cloud | Diagnostic de blocage → choix du remède (#164) |
| auditeur | qwen3.5:cloud | Revues/audits |
| orchestrateur · architecte · designer_ux · extracteur · testeur · optimiseur · chercheur · forgeron | glm-5.2:cloud | Rôles spécialisés routés par intention ; le forgeron crée les agents #168 |
| (escalade) Maître | Claude (sonnet/opus via abonnement) | Filet quand l'Élève bute — coût réel, mesuré par tour |

## 3. Agents spécialisés & méta-systèmes

| Agent / système | Ce qu'il fait | Gate | Maturité |
|---|---|---|---|
| **L'Esthète** (`sa_system_esthete`) — SUPER AGENT DE FINITION | Agent SYSTÈME conversationnel avec vision live : chat multi-tours par projet, voit la preview (`vois_ecran` multi-pages), édite le style, **remplace les images faibles (`chercher_image`)**, **prouve qu'un polish ne casse rien (`teste_parcours`)**, **passe complète sur demande**, savoir « air du temps 2026 » (typo protagoniste, motion=langage, patterns qui datent), budget dédié 10 itér. ; Gardien dans sa boucle, non-supprimable (403) | actif | ✅ enrichi 2026-07-03 (12 tests) |
| Forge d'agents (#168) | Blocage non couvert → lacune notée → le forgeron crée un agent ciblé (validation Raf, semi-auto) | ON | ✅ |
| Subagents exécutants (#175) | Un agent forgé en mode « action » reçoit SA boucle agentique avec outils SCELLÉS à la forge (allowlist, jamais run_command/réseau), budget 6 itér. | ELEVE_DELEGATE_AGENTIC · OFF | 🟢 (preuve scénario) |
| Le Stratège (#164, P0-P4) | Quand l'exécutant bloque : DIAGNOSTIQUE la cause → CHOISIT le remède → APPREND (procédure distillée #75) → tranche l'ambigu → mesure la souveraineté | ELEVE_STRATEGE=**on** (observe) | ✅ |
| Agents UX/UI & Layout (#145) | Profils spécialisés routés par la boucle relay | actifs | ✅ |
| Skills à invocation directe (#174) | `/slug args` au composer → expansion du SKILL.md (substitution $ARGUMENTS) | ON | 🟢 (back prouvé HTTP, L72 navigateur) |
| Cron agentique (#173 Loop) | Tâches planifiées qui passent par la VRAIE boucle (runRelay), disjoncteur 4 runs/h + $1/h | CRON_AGENTIC=**on** (dormant, 0 tâche) | 🟢 |
| Hooks déclaratifs (#172) | Gardes par config (`.hooks/hooks.json`, PreToolUse/PostToolUse/PreFinish/OnBlock…) sans réécrire les gardes natives | ELEVE_HOOKS=**on** | 🟢 |
| Auto-amélioration (B1-B4) | Mango améliore SON code : worktree isolé + diff relu + garde par réversibilité | semi-auto | 🚧 |
| Exécution spéculative (#171) | Brouillons d'actions vérifiés par le build réel de l'app (verify projet-agnostique) | ELEVE_SPECULATIVE · OFF | 🟢 (prouvé fps-doom) |

## 4. Gardes de qualité (la chaîne « build-vert ≠ réussi »)

| Garde | Ce qu'elle vérifie | Gate | Maturité |
|---|---|---|---|
| **Gardien #161** (clôture, 7 volets + observation) | ① intention (juge souverain + scope-guard, **KO désormais LOGGÉ « NON vérifié ⚠ »**) · ② goût (VL qwen3.5, axiomes 1500 car, **plancher 50 bloquant même en observe**) · ③ QA WCAG (mesures objectives) · ④ équilibre layout (déterministe) · ⑤ **vraies images** (scan placeholders) · ⑥ tests projet (si script) · ⑦ relance bornée au contexte FRAIS + anti-thrash · + **artisanat observé** (polices/échelle typo/couleurs littérales/motion, N15) — tourne AUSSI après le Maître, capture PLEINE HAUTEUR (N8) | ELEVE_CLOSURE_GATE=**on** (⭐⭐⭐ jamais OFF) | ✅ (49 tests) |
| teste_parcours de clôture | Accueil chargé sans erreur console, côté Élève ET Maître ; **saut loggé « NON vérifié ⚠ »** (2026-07-03) | ELEVE_GATE_PARCOURS=**on** | 🟢 |
| MangoQA (sentinelle fantôme) | 6 branches d'audit + Disjoncteur (5 réflexes bornés) + Œil Design + Auditeur de flux ; verdict RED = critère de re-correction en clôture | watcher séparé | ✅ (L70 résolu) |
| Anti-spirale & anti-blocage | Détecte les boucles improductives, retire les outils d'exploration, nudge | natif | ✅ |
| Disjoncteur cron | Fenêtre glissante 1 h (runs + budget $) en condition d'ENTRÉE | natif | 🟢 |
| Garde-coût / killswitch | Plafond $ cumulé → bascule locale ; durée/tours → interruption | natif | ✅ (5 trips réels au run 06-20) |

## 5. Savoir injecté (ce que Mango SAIT — le prompt d'un tour de build)

| Savoir | Contenu | Depuis |
|---|---|---|
| **20 templates de domaine** | `server/templates/*.md` — par domaine : 3 angles non-évidents + interdit du cliché, squelette, pairing typo, ancrage palette, motion chiffré, pièges AVOID, consignes Pexels ; détection auto par mots-clés FR/EN (`template-library.ts`) | 2026-07-03 |
| **DESIGN_CRAFT_RULES** | Typographie par registre émotionnel (pairings nommés, échelle clamp, un moment typographique/page) · palette ANCRÉE au sujet (ancre citée, true greys, UN accent) · motion minimum (3 micro-interactions, stagger, reduced-motion) | 2026-07-03 |
| **DESIGN_AXIOMS_RULES** | Les axiomes UX 10-34 / AVOID 25-39 appris des builds jugés (angle AVANT le code, concept central, hiérarchie avant couleur, composition ≠ accumulation, fonctionnel-ressenti) — enfin visibles du modèle qui génère | 2026-07-03 |
| Table d'ALIAS d'outils | Les règles historiques (moodboard/Sharingan) traduites vers les outils RÉELS de l'Élève — l'ancrage visuel ne se saute plus en silence | 2026-07-03 |
| Axiomes appris (`.axioms.md`) | Boucle de distillation continue (nocturne, feedback, build-review) — sélection pertinente par tour | #58+ |
| Constellations (#74) | Packs de règles coordonnées déclenchés par le contexte (formulaires, a11y…) | ✅ |
| Procédures (#75) | Démarches de résolution passées (situation→remède), récupération sémantique | ✅ |
| Blackboard cross-projet | Palettes, composants, skills, sites extraits — persistant SQLite, réutilisation prouvée (reuseRate 0→67 % au run 06-20) | #115-#122 |
| Notes RAG + mémoire projet | Notes personnelles pertinentes au tour + `.memory.md` par projet | ✅ |
| Scénarios par mode | MVP (rapide) · Élite (arsenal complet) · Finition (durcissement) · projet/compose (gros chantiers) · nocturne/esthetique (internes) | Coque Souple |
| GRAPHIC_POLISH_RULES | Passe d'embellissement haute-fidélité (mode interne, consommé par design-coach/run-finish) | #68 |

## 6. Moteurs & infra (ce qui porte tout)

| Système | Rôle | Maturité |
|---|---|---|
| Boucle agentique Élève (eleve.ts/eleve-runtime) | Function-calling GLM, 36 itér., compaction, délégation, **timeouts réseau anti-deadlock (2026-07-03)**, relances au contexte FRAIS | ✅ |
| Escalade Maître + re-correction | L'Élève bute → Claude corrige → le Gardien re-vérifie → reboucle bornée (prouvé live sur festival-aurora) | ✅ (L69 = juge aveugle post-Maître, ouvert) |
| Preview pool (Vite) + vision Playwright | Dev-servers LRU par projet, capture JPEG (+ fullPage), navigateur subprocess isolé | ✅ (orphelins = N20) |
| Moteur de Goût (#149) + Œil-Coach (#152) | Juge pixel VL, variantes K-skins, review mobile Raf, distillation d'axiomes de goût | ✅ |
| Boucle nocturne (#58) + taste-nocturnal | Génération autonome de nuit + tri matinal | ✅ (isolation agentBusy = N18) |
| Auto-évolution (#168) + open-gaps | Chaque mur de capacité devient une lacune traçée puis un agent | ✅ |
| Kernel (#108-#130) | Traces/spans, Event Bus, curation, métriques de coût par tour | ✅ |
| Souveraineté mesurée | `/api/sovereignty` : % tours Élève vs Maître (89 % réel mesuré) | ✅ |
| Registre des limites (`limites.md`) | 77 limites honnêtes tracées (nom·blocage·piste·codable ?·modèle·effort) — rien ne se perd | ✅ |

## 7. Qualité de l'OS lui-même (shell & DX)

| Point fort | Détail |
|---|---|
| Shell 2.0 (`?v2`) | Sidebar 4 sections + palette ⌘K + design system TS (tokens, Modal accessible, ErrorBoundary par panneau) + a11y (axe-core 0 critique, reduced-motion, focus-visible) |
| App Builder complet | 3 paliers (MVP/Élite/Finition) + Esthète en sidebar + Perfect Plan 15q / Gros chantier 30q + Kanban + publish (Cloudflare/Vercel/Netlify/GitHub/zip) |
| Tests | ~170 suites serveur (`test-*.ts`) + vitest UI 75 ; tsc strict des deux côtés |
| Docs vivantes | statut.md (état) · historique.md (journal) · wiki Obsidian (pages-entités interconnectées) · limites.md (registre) · CE fichier (capacités) |
| Galerie de référence | 100+ projets générés dont 20+ vitrines (heist-night, patagonia, bauhaus, toeic-quest…) + les 6 de la nuit 2026-07-03 |

---
*Dernière mise à jour : 2026-07-03 (nuit level-up). Prochaine mise à jour : à chaque livraison qui touche une capacité.*
