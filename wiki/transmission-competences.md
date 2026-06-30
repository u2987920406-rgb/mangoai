---
type: entite
tags: [souverainete, eleve, transmission, mission, outils]
statut: mission-active
sources: [statut #153, historique 2026-06-25, demande de Raf]
maj: 2026-06-30
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
- **`requete_web`** (#166, 2026-06-27) — APPELER UNE API (la « main Internet » générique) : GET (lire/récupérer) ou POST (corps JSON) sur une URL publique, là où `chercher_web`/`lire_page` ne font que LIRE des pages. `eleve-http-tools.ts` `requete_web({url, methode?, entetes?, corps?})` réutilise **`isCloneableUrl`** (anti-SSRF : refuse localhost/IP privées/loopback/link-local dont métadonnées cloud `169.254.169.254`) + **`sanitizeExternal`** (réponse = DONNÉE) ; méthodes limitées **GET/POST** ; réponse **bornée** (8000 car · timeout 15 s · refus >5 Mo) ; `sanitizeHeaders` (string→string ≤12, Host/Content-Length interdits) ; **pas d'écriture disque** (v1, L43) ; ne lève jamais ; gaté `ELEVE_HTTP` (défaut ON). **Décision de Raf** : GET+POST, bordé+anti-SSRF. **Prouvé live contre le vrai Internet** : GET `api.github.com/zen`/`httpbin/get`, POST `httpbin/post` (corps transmis+renvoyé enveloppé `<<<UNTRUSTED_INPUT>>>`), `localhost:3000` REFUSÉ (anti-SSRF). `test-eleve-http-tools 19`. **Cloisonnement** : cet outil est dans le registre génération-d'apps, **PAS** dans `buildSelfRegistry` (auto-amélioration reste sans réseau, [[auto-amelioration]] B2). **Limite L43** : pas de téléchargement-vers-fichier.
- **`lire_document`** (#157, étendu **#158**, 2026-06-25) — PARTIR DE LA VRAIE SOURCE : ouvrir le document fourni par l'utilisateur (cahier des charges, énoncé, PDF/Word/Excel/PowerPoint de référence) au lieu de construire depuis une paraphrase vague. `eleve-document-tools.ts` `lire_document(chemin, page?)` : **PDF** → texte page par page (`extractPdfText` de #147) ; **`.docx`** → `mammoth` ; **`.xlsx`/`.pptx`** → `officeparser` ; `.txt/.md/.csv/.json/.html…` → UTF-8. Confiné au projet (`resolveInside`), plafond 40 k, libs chargées en `await import` dynamique (zéro coût test, $0 local), ne lève jamais (isError pédagogique : introuvable→`.assets/`, `.doc/.xls` hérité→demande un export, PDF scanné→signalé). Clause **⚠ PARS DE LA VRAIE SOURCE**. **#158 — arbitrage sécurité notable** : SheetJS (`xlsx`) npm a des advisories high « No fix available » (prototype-pollution + ReDoS) → écarté au profit d'`officeparser`. **Prouvé live** sur `mango-recettes` : (#157) GLM lit un vrai PDF cahier des charges et recopie le titre exact « Le Carnet de Mamie Lucette » + couleur `#B4541E` dans `App.jsx` ; (#158) GLM lit un vrai `.xlsx` (officeparser) et recopie les valeurs exactes du tableur (`Cafe Arabica` 3.5, `The Earl Grey` 2.8) dans `src/tarifs.js`, $0. **C'est #147 qui réalise enfin sa destinée** (primitive PDF → outil de l'Élève). **Limite** : `.doc/.xls/.ppt` hérités (binaire OLE) non lus (demande un export récent) ; PDF scanné = pas de texte (piste : `renderPdfPage` #147 + `vois_ecran` #151). C'est la disposition n°4 de la roadmap, acquise.
- **`chercher_artefact`** (#156, 2026-06-25) — RÉUTILISER au lieu de réinventer : interroger la mémoire d'artefacts cross-projet du Blackboard (aujourd'hui des PALETTES design captées/produites ailleurs) avant de définir un univers visuel. `eleve-artefact-tools.ts` `chercher_artefact(couleurs?, n?)` : couleurs hex → palettes les plus proches (cosinus, réutilise `searchArtifacts` de [[blackboard]]/`kernel-artifacts.ts`) ; sans couleur → artefacts récents (`listArtifacts`) ; **pur, déterministe, zéro réseau** (embedding = histogramme RGB), ne lève jamais (isError pédagogique). Clause **⚠ RÉUTILISER > RÉINVENTER**. **Prouvé live** sur `mango-cafe-ts` : le Blackboard a 53 palettes réelles ; **GLM appelle `chercher_artefact` seul** avec une palette café (orange/brun/crème) → finish, $0 ; l'outil renvoie de vraies palettes proches (`mango-galerie` ambre/crème/brun ~79-80 %). **Limite** : la mémoire ne contient que des palettes pour l'instant → l'outil grandira avec d'autres artefacts (composants, layouts). C'est la disposition n°3 de la roadmap, acquise.
- **`teste_parcours`** (#155, 2026-06-25) — JOUER l'app et vérifier que le FLUX marche pour l'utilisateur, pas juste qu'elle compile. `eleve-parcours.ts` `runParcours(url, etapes)` sur **UNE page persistante** (l'état persiste entre les clics — clé de fiabilité vs un contexte par étape), capture console+pageerror, vérifs déterministes (`texte`/`selecteur` visible · `image_chargee` naturalWidth>0 · `aucune_erreur_console`), ne lève jamais ; outil `teste_parcours(etapes)` (réutilise `startPreview`, isError si échec → la boucle GLM se corrige). Clause **⚠ VÉRIFIER LE PARCOURS**. **Prouvé live** sur formation-toic : POSITIF (titre+image+console ✓) ; **NÉGATIF** (image cassée volontairement → détectée « naturalWidth=0 — image cassée », le bug-classe TOEIC, fichier restauré) ; GLM appelle `teste_parcours` seul → finish, zéro Claude. C'est la disposition n°2 de la roadmap, acquise.
- **`genere_contenu` + `verifie_coherence_images`** (2026-06-30) — PRODUIRE ET FIABILISER UNE BANQUE DE CONTENU. **Déclencheur** : en finalisant [[toeic-quest]], Claude a dû écrire des **runners externes** (`run-toeic-content.ts`, `run-toeic-coherence.ts`) pour faire rédiger ~455 questions par GLM et faire juger les images par le VL → travail de production, mais **Mango n'avait rien appris** (outils non agentiques). Transmis en deux KernelTools (cœur générique PUR `eleve-content.ts`, gate `ELEVE_CONTENT=on`) : **`genere_contenu({sujet, schema, n, cles_requises?, langue?, fichier?})`** rédige un lot d'items structurés JSON validés (via GLM) et l'écrit dans le projet (écriture confinée) ; **`verifie_coherence_images({fichier, champ_image?, champ_scene?, corriger?})`** lit un JSON d'items, fait juger chaque image par `qwen3-vl:8b` (think:false) et **corrige via Pexels** si incohérent (réutilise `searchPexelsImages` de [[moteur-gout]]). Cœur `generateContentItems`/`checkImageCoherence` : deps injectées, ne lèvent jamais. **test-eleve-content 31/31** · **prouvé live** (3 fiches fruits rédigées+validées ; image « plage » incohérente détectée → corrigée). Disposition associée : *« peuple et fiabilise tes données toi-même »*. Limite [[limites]] L65 (qualité bornée par le cerveau Élève ; VL/Pexels requis pour la correction).
- *(socle déjà là, #146 : read/list/search, write/edit, run_command, add_dependency curé, delegate, check_build, finish.)*

## Roadmap de transmission (proactif)

Principe : les meilleures transmissions **associent une FONCTION (outil) à une DISPOSITION (manière de penser fiable)** — l'outil rend le bon réflexe *facile*, la clause de contrat dit *quand* l'employer. Déjà fait : `vois_ecran` ↔ « regarde, ne code pas à l'aveugle » ; `chercher_image` ↔ « du réel, pas du placeholder » ; `chercher_web`/`lire_page` ↔ « se documenter au lieu d'inventer » ; `chercher_artefact` ↔ « réutiliser > réinventer » ; `lire_document` ↔ « pars de la vraie source du user ».

**Fonctions à transmettre (par levier décroissant)** :
1. ✅ **Recherche / fetch web** (`chercher_web`, `lire_page`) ↔ *« se documenter au lieu d'inventer »* — **TRANSMIS #154** (chaîne keyless DDG→Mojeek + anti-SSRF + sanitize ; prouvé live).
2. ✅ **Tester le PARCOURS utilisateur** (`teste_parcours` : jouer l'app via Playwright, cliquer/remplir/vérifier) ↔ *« vérifie que ça MARCHE, pas juste que ça compile »* — **TRANSMIS #155** (page persistante + vérifs déterministes + détection image cassée/erreur console ; prouvé live positif ET négatif).
3. ✅ **Réutiliser les artefacts** (`chercher_artefact` sur le Blackboard cross-projet) ↔ *« réutiliser > regénérer »* — **TRANSMIS #156** (recherche cosinus sur les palettes persistées, pur/déterministe ; prouvé live : GLM réutilise seul une palette `mango-galerie` proche d'une cible café). **Étendu 2026-06-26** : (a) **L29** — la réutilisation via l'outil est désormais **MESURÉE** (genre `artifact`, cf. [[boucle-curation]]) ; (b) **L3 Phase A** — l'outil gagne une **recherche par SENS (texte, param `recherche`)** qui atteint la **bibliothèque de COMPOSANTS cross-projet** (`searchComponentsRanked`, embedding texte + repli mots-clés), pas que les palettes par couleur → le « kit de composants à ton goût » se concrétise (prouvé live : « barre de recherche »→`SearchBar`). **Reste** : layouts comme type distinct, embedding texte pour sites/palettes, skills dans l'outil.
4. ✅ **Lire un document en entrée** (`lire_document`, réutilise la primitive #147) ↔ *« pars de la VRAIE source du user »* (spec, référence, énoncé) — **TRANSMIS #157** (PDF + textes) **puis #158** (Word `.docx` via mammoth, Excel `.xlsx` + PowerPoint `.pptx` via officeparser ; SheetJS écarté pour vulnérabilités). Prouvé live bout-en-bout sur PDF *et* `.xlsx` (GLM recopie titre/couleur/valeurs exacts dans le code). **Suite** : PDF scanné (image) via `renderPdfPage` #147 + `vois_ecran` #151 ; `.doc/.xls` hérités si besoin.
5. **Planifier avant d'agir** (méta-outil / clause) ↔ *« décompose et choisis une approche, puis code »* — disposition, pas un outil ; à inculquer par clause de contrat. **= prochain candidat.**

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

- [[statut]] — idées **#153 → #157**.
- [[historique]] — journal du 2026-06-25 (mission posée par Raf).
- [[blackboard]] — la mémoire d'artefacts cross-projet qu'interroge `chercher_artefact` (#156).
