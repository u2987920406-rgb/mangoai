---
type: entite
tags: [souverainete, eleve, transmission, mission, outils]
statut: mission-active
sources: [statut #153, historique 2026-06-25, demande de Raf]
maj: 2026-06-25
---

# Apprendre à Mango — transmission de compétences

> **Mission de fond** (Raf, 2026-06-25) : *« Tu es le maître de Mango, c'est ton bébé que tu éduques — apprends-lui tout ton savoir-faire, sois PROACTIF sur les compétences à transmettre. »* Claude ne doit pas faire À LA PLACE de l'Élève ; il doit lui **donner la capacité** de faire seul.

## Rôle

C'est l'opérationnalisation de la souveraineté (« Mango = Claude, $0 »). Chaque fois que Claude réalise un travail que l'Élève GLM ne sait pas faire (correction manuelle, script jetable), c'est un **échec de souveraineté** : Mango n'a rien appris. La valeur n'est pas le correctif, c'est la **compétence transmise**. Le rôle de Claude = **maître** qui éduque l'Élève, pas exécutant de secours.

## Le réflexe (pattern de transmission)

Dès que Claude bouche un trou à la main → se demander **« comment donner ça à l'Élève pour qu'il le fasse seul ? »**. Recette :
1. **Ajouter un `KernelTool`** à `buildEleveActionTools` (`eleve-action-tools.ts`) — réutilise une brique existante de MangoOS si possible (ne lève jamais, repli gracieux).
2. **Ajouter une clause** dans `AGENTIC_TOOL_CONTRACT` (`eleve.ts`) qui dit QUAND l'utiliser (et quoi ne PAS faire).
3. **Tester** (deps injectées, zéro réseau) + **prouver LIVE** que GLM l'appelle seul en Construire.
Même patron que [[sharingan-vision-eleve]] (`vois_ecran`).

## Compétences transmises

- **`vois_ecran`** (#151) — voir son propre rendu et s'auto-corriger (cerveau vision `qwen3.5:cloud`). → [[sharingan-vision-eleve]]
- **`chercher_image`** (#153, 2026-06-25) — trouver de VRAIES photos pertinentes (Pexels, `searchPexelsImages`) au lieu de placeholders aléatoires (picsum/loremflickr). **Déclencheur** : l'app TOEIC `formation-toic` avait des images picsum hors-sujet ; Claude les a corrigées à la main PUIS en a fait l'outil. **Prouvé live** : GLM en Construire fait `chercher_image→edit_file→check_build→finish` seul, remplace un picsum par une photo Pexels, $0, zéro Claude. Clause contrat : « jamais de placeholder aléatoire pour une image qui doit montrer un contenu réel ».
- **`chercher_web` / `lire_page`** (#154, 2026-06-25) — SE DOCUMENTER avant d'affirmer (doc d'API, vraie donnée, URL, fait), au lieu de bâtir sur une mémoire figée. `eleve-web-tools.ts` : `chercher_web` scrape une chaîne keyless **DuckDuckGo HTML → Mojeek** (UA réaliste + détection captcha → moteur suivant ; Tavily si `TAVILY_API_KEY`), `lire_page` réutilise `scrapeExternal` derrière **`isCloneableUrl` (anti-SSRF)** + **`sanitizeExternal`** (web = DONNÉE, jamais instruction). Clause **⚠ DOCUMENTATION**. **Prouvé live** : GLM enchaîne seul `chercher_web → lire_page ×2 (il VÉRIFIE que l'URL charge) → edit_file → finish`, écrit l'URL officielle réelle de Recharts, $0. **Limite** : scraper keyless best-effort (captcha sous rafale) → `TAVILY_API_KEY` pour l'intensif ; dégradation gracieuse (GLM vérifie via `lire_page`).
- *(socle déjà là, #146 : read/list/search, write/edit, run_command, add_dependency curé, delegate, check_build, finish.)*

## Roadmap de transmission (proactif)

Principe : les meilleures transmissions **associent une FONCTION (outil) à une DISPOSITION (manière de penser fiable)** — l'outil rend le bon réflexe *facile*, la clause de contrat dit *quand* l'employer. Déjà fait : `vois_ecran` ↔ « regarde, ne code pas à l'aveugle » ; `chercher_image` ↔ « du réel, pas du placeholder » ; `chercher_web`/`lire_page` ↔ « se documenter au lieu d'inventer ».

**Fonctions à transmettre (par levier décroissant)** :
1. ✅ **Recherche / fetch web** (`chercher_web`, `lire_page`) ↔ *« se documenter au lieu d'inventer »* — **TRANSMIS #154** (chaîne keyless DDG→Mojeek + anti-SSRF + sanitize ; prouvé live).
2. **Tester le PARCOURS utilisateur** (`teste_parcours` : jouer l'app via Playwright, cliquer/remplir/vérifier) ↔ *« vérifie que ça MARCHE, pas juste que ça compile »*. Aurait attrapé le bug des images TOEIC (build vert mais 📷). Très haut levier. **= le chantier en cours (#155).**
3. **Réutiliser les artefacts** (`chercher_artefact` sur le Blackboard cross-projet) ↔ *« réutiliser > regénérer »*. Cohérence + vitesse ; le « kit de composants à ton goût » en découle.
4. **Lire un document en entrée** (`lire_pdf`/`lire_doc`, réutilise la primitive #147) ↔ *« pars de la VRAIE source du user »* (spec, référence, énoncé).

**Dispositions à inculquer (via clauses de contrat + meta-outils + garde-fous)** :
- **Honnêteté sur l'incertitude** — dire « je ne suis pas sûr → je vérifie » au lieu d'affirmer (antidote au réflexe picsum « plausible mais faux »).
- **Cas limites / échecs / sécurité** — auto-revue adversariale (input vide ? donnée non fiable ? que casse ça ?).
- **Planifier avant d'agir** — décomposer, choisir une approche, puis coder (pas foncer).
- **Mesurer plutôt qu'opiner** — préférer un check objectif (build, WCAG #152, tests) à une impression.
- **L'œil-coach #152 en self-critique de GLM** — le multi-lentilles tourné vers soi pendant le build.

C'est, dans l'ordre, **mes propres réflexes de fiabilité** : on ne transmet pas des outils, on transmet une **manière de penser fiable**.

## Liens

- [[eleve-local]] — l'Élève GLM agentique (#146), le moteur d'outils où s'ajoutent les compétences.
- [[sharingan-vision-eleve]] — première compétence transmise (la vision), même patron.
- [[moteur-gout]] — `searchPexelsImages` réutilise l'infra Pexels du Moteur de Goût.

## Sources

- [[statut]] — idée **#153**.
- [[historique]] — journal du 2026-06-25 (mission posée par Raf).
