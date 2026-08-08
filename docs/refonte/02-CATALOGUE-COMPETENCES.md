# Refonte Mango — 02 · Catalogue détaillé des compétences

> Recensement exhaustif de **tout ce que l'écosystème sait faire**, visible ou invisible,
> avec pour chaque compétence : son module réel, l'équipe cible, le cerveau qui l'exécute,
> son coût et son état d'activation mesuré au 2026-08-04.
>
> C'est le document de référence pour l'intégration : **une compétence non listée ici n'existe pas.**

## Légende

- **État** : 🟢 actif en production · 🟡 gaté (code prêt, flag OFF) · ⚫ dormant (jamais importé) · 🔵 partiel
- **Coût** : `$0` local (Ollama) · `$` abonnement Claude · `$$` API payante tierce
- **Équipe** : affectation cible (voir doc 03)

---

# 1. Compétences outillées — les 41 outils de l'Élève

Ce sont les seules capacités que le modèle peut **appeler lui-même** (function calling).
Elles constituent le vrai périmètre d'action du système.

## 1.1 — Équipe 🔨 CONSTRUCTION (cerveau : `codeur`, local, `$0`)

| # | Compétence | Ce qu'elle fait | Module | Coût | État |
|---|---|---|---|---|---|
| 1 | `read_file` | Lit un fichier du projet | `eleve-tools.ts` | $0 | 🟢 |
| 2 | `write_file` | Écrit / crée un fichier | `eleve-action-tools.ts` | $0 | 🟢 |
| 3 | `edit_file` | Remplacement chirurgical dans un fichier | `eleve-action-tools.ts` | $0 | 🟢 |
| 4 | `list_files` | Arborescence du projet | `eleve-tools.ts` | $0 | 🟢 |
| 5 | `search_code` | Recherche texte/regex dans le code | `eleve-tools.ts` | $0 | 🟢 |
| 6 | `check_build` | Vérifie que le projet compile | `eleve-tools.ts` | $0 | 🟢 |
| 7 | `run_command` | Exécute une commande allowlistée | `eleve-action-tools.ts` | $0 | 🟢 |
| 8 | `add_dependency` | Ajoute une dépendance npm | `eleve-action-tools.ts` | $0 | 🟢 |
| 9 | `assemble_brique` | Assemble une brique backend pré-écrite | `eleve-bricks-tools.ts` | $0 | 🟢 |
| 10 | `finish` | Clôture le tour (déclenche le Gardien) | `eleve-action-tools.ts` | $0 | 🟢 |

## 1.2 — Équipe 🛡️ VÉRIFICATION (cerveau : `auditeur` + `juge`)

| # | Compétence | Ce qu'elle fait | Module | Coût | État |
|---|---|---|---|---|---|
| 11 | `ecris_test` | Écrit un test automatisé | `eleve-autotest-tools.ts` | $0 | 🟢 |
| 12 | `lance_tests` | Exécute la suite de tests | `eleve-autotest-tools.ts` | $0 | 🟢 |
| 13 | `teste_parcours` | Rejoue un parcours utilisateur (Playwright) | `eleve-parcours-tools.ts` | $0 | 🟢 |
| 14 | `verifie_coherence_images` | Vérifie image ↔ texte adjacent | `eleve-content-tools.ts` | $0 | 🟢 |
| 15 | `unity_build` | Compile un projet Unity | `eleve-unity-tools.ts` | $0 | 🟡 |
| 16 | `unity_test` | Teste un projet Unity | `eleve-unity-tools.ts` | $0 | 🟡 |

## 1.3 — Équipe 👁️ VISION (cerveau : `vision`, modèle VL)

| # | Compétence | Ce qu'elle fait | Module | Coût | État |
|---|---|---|---|---|---|
| 17 | `vois_ecran` | Capture et lit l'écran de l'app générée | `eleve-vision-tools.ts` | $0 | 🟢 |
| 18 | `lire_image` | Décrit / lit le contenu d'une image | `eleve-image-tools.ts` | $0 | 🟢 |
| 19 | `sharingan_url` | Analyse visuelle exhaustive d'une page web | `eleve-sharingan-tools.ts` | $0 | 🟢 |
| 20 | `sharingan_image` | Analyse visuelle exhaustive d'une image | `eleve-sharingan-tools.ts` | $0 | 🟢 |
| 21 | `regarde_site_web` | Vision externe d'un site (rendu réel) | `eleve-external-vision-tools.ts` | $0 | 🟡 |

## 1.4 — Équipe 🔎 RECHERCHE (cerveau : `chercheur`)

| # | Compétence | Ce qu'elle fait | Module | Coût | État |
|---|---|---|---|---|---|
| 22 | `chercher_web` | Recherche web | `eleve-web-tools.ts` | $$ | 🟢 |
| 23 | `lire_page` | Récupère et lit une page web | `eleve-web-tools.ts` | $0 | 🟢 |
| 24 | `requete_web` | Requête HTTP brute (API tierce) | `eleve-http-tools.ts` | $0 | 🟢 |
| 25 | `extraire_site` | Crawl + extraction structurée d'un site | `eleve-site-tools.ts` | $0 | 🟡 |
| 26 | `lis_video_youtube` | Transcript + résumé d'une vidéo | `eleve-youtube-tools.ts` | $0 | 🟡 |
| 27 | `chercher_image` | Recherche d'images (Pexels) | `eleve-action-tools.ts` | $$ | 🟢 |
| 28 | `chercher_artefact` | Recherche dans les artefacts mémorisés | `eleve-artefact-tools.ts` | $0 | 🟢 |

## 1.5 — Équipe 📄 EXTRACTION (cerveau : `extracteur`)

| # | Compétence | Ce qu'elle fait | Module | Coût | État |
|---|---|---|---|---|---|
| 29 | `lire_document` | PDF / Word / Excel / PowerPoint → texte | `eleve-document-tools.ts` | $0 | 🟢 |
| 30 | `lire_archive` | Ouvre et lit un .zip / .rar | `eleve-archive-tools.ts` | $0 | 🟢 |
| 31 | `decoupe_assets` | Découpe une maquette en assets | `eleve-slice-tools.ts` | $0 | 🟡 |

## 1.6 — Équipe 🎨 DESIGN (cerveau : `designer_ux`)

| # | Compétence | Ce qu'elle fait | Module | Coût | État |
|---|---|---|---|---|---|
| 32 | `verifie_design` | Note le design (contraste, palette, typo) | `eleve-design-tools.ts` | $0 | 🟢 |
| 33 | `genere_image` | Génère une image (FLUX local) | `eleve-flux-tools.ts` | $0 | 🟡 |
| 34 | `genere_contenu` | Génère du contenu structuré (textes, données) | `eleve-content-tools.ts` | $0 | 🟢 |

## 1.7 — Équipe 🧠 ANALYSE & PLAN (cerveau : `architecte`)

| # | Compétence | Ce qu'elle fait | Module | Coût | État |
|---|---|---|---|---|---|
| 35 | `planifier` | Pose un plan d'exécution en étapes | `eleve-planifier-tools.ts` | $0 | 🟢 |
| 36 | `etape_faite` | Marque une étape terminée | `eleve-planifier-tools.ts` | $0 | 🟢 |
| 37 | `etape_bloquee` | Signale un blocage (déclenche l'escalade) | `eleve-planifier-tools.ts` | $0 | 🟢 |

## 1.8 — Système (hors équipe — palier sécurité, jamais autonome)

| # | Compétence | Ce qu'elle fait | Module | Coût | État |
|---|---|---|---|---|---|
| 38 | `run_system_command` | Commande système élargie | `eleve-system-tools.ts` | $0 | 🟡 `DESKTOP_SYSTEM_SHELL=off` |
| 39 | `open_url` | Ouvre une URL dans le navigateur | `eleve-system-tools.ts` | $0 | 🟡 |
| 40 | `open_folder` | Ouvre un dossier | `eleve-system-tools.ts` | $0 | 🟡 |
| 41 | `reveal_in_explorer` | Révèle un fichier dans l'explorateur | `eleve-system-tools.ts` | $0 | 🟡 |

> ⚠️ **Ces 4 compétences sont refusées inconditionnellement à un acteur autonome**, quel que
> soit le flag (fail-safe codé en dur). C'est correct — à conserver tel quel.

**Bilan outils : 41 compétences · 27 🟢 actives · 14 🟡 gatées · 0 morte.**
Le périmètre d'action est sain — c'est son **exposition** qui est le problème, pas son contenu.

---

# 2. Compétences invisibles — les services backend

Ce sont les capacités que l'utilisateur ne peut pas appeler, mais qui s'exécutent pour lui.
**C'est ici que se trouve la vraie valeur du produit — et c'est ici que rien n'est montré.**

## 2.1 — Section CERVEAU (le socle) 🟢 GARDE

| Compétence | Ce qu'elle fait | Module | État |
|---|---|---|---|
| Dispatch par rôle | Route un appel vers LE cerveau de ce rôle | `brain/brain-dispatch.ts` | 🟢 |
| Registre de cerveaux | 16 rôles configurables à chaud | `brain/brain-registry.ts` | 🟢 |
| Repli inter-providers | Bascule automatique sur timeout/panne | `brain-dispatch.ts` | 🟢 `BRAIN_FALLBACK=on` |
| Garde de souveraineté | Un rôle `localOnly` ne sort jamais vers un cloud | `brain-dispatch.ts` | 🟢 |
| Rate limiting par provider | Fenêtre glissante 60 s + backoff exponentiel | `brain-dispatch.ts` | 🟢 |
| Contrat Mango | Format de réponse imposé + parsing robuste | `agent/agent-contract.ts` | 🟢 |
| Anti-injection | Encadre toute entrée externe non fiable | `agent/agent-contract.ts` | 🟢 |
| Circuit breaker de session | Arrête un pipeline emballé | `agent/agent-contract.ts` | 🟢 |
| Vote d'ensemble | N modèles répondent, un agrégateur tranche | `brain/brain-ensemble.ts` | 🟡 OFF |
| Profils de cerveau | Registres pré-remplis (full-local, cloud…) | `apply-brain-profile.ts` | ⚫ |
| Cache sémantique LLM | Évite de repayer un appel quasi-identique | `llm/llm-cache.ts` | 🟡 OFF |
| Transport multi-provider | 8 providers (claude, ollama, openai, deepseek, mistral, groq, openrouter, litellm) | `llm/llm-engine.ts` | 🟢 |

## 2.2 — Section MÉMOIRE 🔵 À FUSIONNER (17 → 1)

| Compétence | Ce qu'elle fait | Module | État |
|---|---|---|---|
| Axiomes | Règles durables apprises | `axioms.ts` | 🟢 |
| Validation d'axiome | Dédup sémantique + quarantaine avant promotion | `axioms-validation.ts` | 🟡 OFF |
| Détection de dérive | Repère deux axiomes contradictoires | `axioms-drift.ts` | 🟡 OFF |
| Préférences | Ce que l'utilisateur aime / refuse | `preferences.ts` | 🟢 |
| Identité | Qui est l'utilisateur, en couches | `identity.ts` | 🟢 |
| Références | Sites / images de référence | `references.ts` | 🟢 |
| Lexique | Vocabulaire propre à l'utilisateur | `lexique.ts` | 🟢 |
| Procédures | Recettes réutilisables | `procedures.ts` | 🟢 |
| Blackboard sémantique | Stockage vectoriel SQLite + recherche cosinus | `kernel/kernel-blackboard*.ts` | 🟢 |
| Purge / TTL | Oubli des artefacts trop vieux | `kernel-blackboard-decay.ts` | 🟡 OFF |
| Mémoire de travail | État du tour en cours | `working-memory.ts` | 🟢 |
| Rappel proactif | Injecte les souvenirs pertinents dans la boucle | `eleve-memoire.ts` | 🟡 **OFF** ⚠️ |
| Compaction | Résume le contexte quand il déborde | `compaction.ts` + `eleve-compaction.ts` | 🟢 |
| Manifeste de schéma | Versionne les magasins fichiers | `memory-manifest.ts` | 🟡 OFF |
| RAG sur notes | Recherche sémantique dans les notes | `notes-rag.ts` | 🟢 |
| Registre de concepts | Vérifie le SENS d'un mot avant d'agir | `concept-registry.ts` | 🟢 |
| Base de savoir vidéo | Ingestion + réconciliation de transcripts | `savoir/` ×4 | 🔵 **à moitié construit** ⚠️ |

> ⚠️ **Trouvaille majeure : `ELEVE_MEMOIRE=off`.** Le rappel proactif de souvenirs — c'est-à-dire
> **le mécanisme qui rend la mémoire vivante dans la boucle** — n'est pas activé. Le système
> *stocke* énormément et *rappelle* peu. C'est la cause racine du ressenti « la mémoire est mal gérée ».

## 2.3 — Section VÉRIFICATION 🟢 GARDE (différenciateur)

| Compétence | Ce qu'elle vérifie | Module | État |
|---|---|---|---|
| Juge d'intention | Le livré correspond-il à la demande ? | `eleve-gate.ts` | 🟢 |
| Volet IMAGES | Cadrage + pertinence sémantique des images | `eleve-gate-images.ts` | 🟢 ON par défaut |
| Volet CONSTANTES | Constantes physiques fausses (table IAU/NASA) | `eleve-gate-constants.ts` | 🟢 ON par défaut |
| Volet CONTENU | Auto-cohérence par item d'un tableau de données | `eleve-gate-content.ts` | 🟡 **OFF** |
| Volet PÉDAGO | Couverture curriculum, leçon-avant-exercice | `eleve-gate-pedago.ts` | 🟡 OFF |
| Vérificateur de contexte | Le gabarit correspond-il au sens du mot ? | `verificateur-contexte.ts` | 🟢 |
| Chaîne ambiguë | Cohérence jointe de plusieurs termes du brief | `chaine-ambigue.ts` | 🟢 |
| Anti-spirale | Détecte une boucle de correction stérile | `eleve-antispiral.ts` | 🟢 |
| Règle des 3 essais | Arrête après 3 échecs sur le même blocage | `stratege/stratege-signals.ts` | 🟢 |
| Audit d'intégrité | Snapshot-diff de 12 stores globaux | `integrity-audit.ts` | 🟡 OFF |
| Catalogue de régression | Index de 10 incidents réels + statut guarded/gap | `regression/regression-catalog.ts` | ⚫ |
| Sonde de chaos | Tue le backend et vérifie la reprise | `regression/chaos-runner.ts` | ⚫ |

## 2.4 — Section MANGOQA (auditeur indépendant) 🟢 GARDE

| Visage / branche | Ce qu'il fait | Module | État |
|---|---|---|---|
| 🏛️ Disjoncteur — architecture | Cohérence structurelle | `branches/architecture.ts` | 🟢 |
| 🏛️ Disjoncteur — sécurité | Failles, secrets exposés | `branches/security.ts` | 🟢 |
| 🏛️ Disjoncteur — accessibilité | WCAG | `branches/accessibility.ts` | 🟢 |
| 🏛️ Disjoncteur — performance | Poids, rendus coûteux | `branches/performance.ts` | 🟢 |
| 🏛️ Disjoncteur — tests | Couverture | `branches/tests.ts` | 🟢 |
| 🏛️ Disjoncteur — design system | Cohérence tokens (**conseil, jamais bloquant**) | `branches/design-system.ts` | 🟢 |
| 👀 Observateur-Conseil | Patterns de rejets récurrents → conseils | `observer.ts` | 🟢 |
| 🎨 Œil Design | Jugement esthétique souple | `design-eye/` | 🟢 |
| 🔍 Flux-Eye | Graphe de flux, analyse profonde | `flux-eye/` | 🟢 |
| 📦 Suite-Eye | Audit d'une suite d'apps | `suite-eye/` | 🟢 |
| 🐕 Watchdog | Relance après crash (2 crashs absorbés en prod) | `watchdog.ts` | 🟢 |
| 📓 Retex (boîte noire) | Journalise les rejets, les réinjecte | `retex.ts` | 🟢 |
| 🛑 Autorité d'arrêt | Peut stopper la production nocturne | flag `MANGOQA_STOP_AUTHORITY` | 🟡 **OFF** |

## 2.5 — Section GOÛT & DESIGN 🔵 À FUSIONNER (9 → 1 équipe)

| Compétence | Ce qu'elle fait | Module | État |
|---|---|---|---|
| Moteur de goût | Jugement **relatif** (comparaison de paires) | `taste/taste-compare.ts` | 🟢 |
| Ancres de goût | Références visuelles validées par l'utilisateur | `taste/taste-refs.ts` | 🟢 |
| Directions | 3 propositions de direction artistique | `taste/taste-directions.ts` | 🟢 |
| Génération de variantes | Produit des skins alternatifs | `taste/taste-generate.ts` | 🟢 |
| Boucle de goût nocturne | Apprend le goût pendant la nuit | `taste/taste-nocturnal.ts` | 🟢 |
| Design system | Tokens, charte | `design/design-system.ts` | 🟢 |
| Coach design | Conseils ciblés | `design/design-coach.ts` | 🟢 |
| Métriques design | Score mesurable | `design/design-metrics.ts` | 🟢 |
| Équilibre de mise en page | Analyse de composition | `layout-balance.ts` | 🟢 |
| Loop design | Audit → correction → comparaison avant/après | `design-loop.ts` | 🟢 opt-in |
| Fourche de wireframes | 3 wireframes en couleur | `wireframe-fork.ts` | 🟢 |
| Idéation | Wireframe + palette + composants | `ideation.ts` | 🟢 |
| Diagrammes | Mermaid avant/après | `diagram.ts` | 🟢 |
| Génération d'images | FLUX local | `krea.ts` + flux tools | 🟡 |

## 2.6 — Section AUTONOME ⚠️ DÉCISION REQUISE

| Compétence | Ce qu'elle fait | Module | État réel |
|---|---|---|---|
| Boucle nocturne | Génère et apprend la nuit | `nocturnal.ts` | 🟢 mais **invisible** |
| Budget nocturne | Plafond de dépense dur | `nocturnal-budget.ts` | 🟡 OFF |
| Auto-évolution | Détecte une lacune → forge un spécialiste | `self/self-evolution*.ts` | 🟢 `SELF_EVOLVE=on` |
| Score de lacune | Décide si une lacune vaut une forge (seuil 60) | `self-evolution.ts` | 🟢 |
| Stratège global | Briefing cross-projet, 8 collecteurs | `stratege/` ×13 | 🟡 **OFF — jamais exécuté** |
| Évolution de prompts | Propose des variantes de prompts | `prompt-evolution.ts` | 🟡 OFF |
| Harnais A/B | Compare 2 variantes sur un jeu de tâches | `ab-harness.ts` | 🟡 OFF |
| Auto-ablation | Retire une brique et mesure l'impact | `auto-ablation.ts` | 🟡 OFF |
| Apprentissage inverse | — | `reverse-learn.ts` | ⚫ jamais importé |
| Train-loop | Entraînement nocturne | `train-loop.ts` | 🟡 |
| Veille IA | Suit l'actualité IA | `veille.ts` | 🟢 |
| Radar IA | Détecte les nouveautés | `radar.ts` | 🟢 |
| Planificateur cron | Tâches récurrentes | `cron-scheduler.ts` | 🟢 |
| Mode simulation | Exécute dans un worktree jetable avant d'appliquer | `dry-run.ts` | ⚫ jamais importé |

---

# 3. Les 11 spécialistes forgés → affectation par équipe

Ils ont été créés automatiquement par la Forge en réponse à des lacunes réelles.
**Ils ne doivent plus être un concept de premier niveau — ce sont des membres d'équipe.**

| Spécialiste | Compétences internes | Cerveau actuel | Équipe cible |
|---|---|---|---|
| Déchiffreur de PDF scannés | détecter couche texte · rastériser · OCR · reconstruire structure · corriger OCR | `glm-ocr:latest` | 📄 **Extraction** |
| Anatomiste de classeurs | parse xlsx · shared strings · formats · plages fusionnées · tables nommées | `glm-5.2:cloud` | 📄 **Extraction** |
| Sémaphore de liens | classifier · scorer pertinence · patterns de navigation · dédupliquer URLs | `glm-5.2:cloud` | 🔎 **Recherche** |
| Iconographe bilingue | traduire requête Pexels · enrichir contexte · proposer replis | `glm-5.2:cloud` | 🔎 **Recherche** |
| Aiguilleur d'étapes | lire plan · marquer étape · signaler écart · calculer progression | `glm-5.2:cloud` | 🧠 **Analyse & Plan** |
| Diffomètre sémantique | snapshot · diff ligne à ligne · classifier · verdict de couverture | `glm-5.2:cloud` | 🛡️ **Vérification** |
| Aiguilleur d'outillage | extraire contraintes · mapper outil · allowlist · détecter surdimensionnement | `glm-5.2:cloud` | 🧠 **Analyse & Plan** |
| Arbitre du Score Design | — | — | 🎨 **Design** |
| Contremaître local | — | — | 🔨 **Construction** |
| Juge d'Adéquation | — | — | 🛡️ **Vérification** |
| Esthète | — | — | 🎨 **Design** |

> **Observation** : les 11 spécialistes se répartissent **naturellement** dans 6 équipes, sans
> forcer. C'est la meilleure preuve que le découpage par équipes proposé est le bon — il a été
> découvert par le système lui-même, pas imposé.

---

# 4. Synthèse — la carte d'une équipe

Format cible pour chaque équipe (voir doc 03 pour le détail) :

```
ÉQUIPE 📄 EXTRACTION
├─ Cerveau        : rôle `extracteur` → un seul modèle pour toute l'équipe
├─ Mission        : transformer un document opaque en texte exploitable
├─ Compétences    : lire_document · lire_archive · decoupe_assets
├─ Membres        : Déchiffreur de PDF scannés · Anatomiste de classeurs
├─ S'allume quand : une pièce jointe est présente, ou une compétence est demandée
├─ S'éteint quand : la tâche d'extraction est close (résultat en mémoire Projet)
└─ Coût           : $0 (local)
```

**Nombre total de compétences recensées : 41 outillées + 68 invisibles + 11 spécialistes = 120.**
Cible : **toutes conservées**, réparties dans **8 équipes**, dont **aucune n'est exposée en menu**.
