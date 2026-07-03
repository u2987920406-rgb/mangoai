# Corpus Fable 5 — étude du raisonnement frontière (fenêtre → 2026-07-07)

**Pourquoi ce corpus (décision de Raf, 2026-07-03)** : Fable 5 n'est pleinement accessible que jusqu'au 7 juillet. Au-delà des livrables (architectures, revues, plans), on capture ICI **comment Fable raisonne** — pour l'étudier ensuite, quand il ne sera plus accessible, et en distiller des règles de méthode injectables dans les modèles qui prendront sa place (Opus, GLM…), sur le modèle des axiomes UX.

## Ce que chaque mission Fable doit léguer

1. **Le livrable** (`docs/plan-*.md` ou rapport de revue) — autonome, exécutable par Sonnet/Opus après la fenêtre.
2. **L'annexe « trace de raisonnement »** (dans le livrable) : démarche adoptée · alternatives considérées et REJETÉES (avec le pourquoi) · heuristiques employées · points de bascule de la réflexion · « ce qui a failli me tromper ».
3. **À la clôture du sprint** : distillation transverse des patterns récurrents → `methode-fable.md` (les axiomes de méthode d'architecte).

## Registre des missions

| Mission | Livrable | Statut | Ce qu'on y étudie |
|---|---|---|---|
| Conception Pilier C (2026-07-03) | `docs/plan-pilier-C-liquidite-cerveau.md` | ✅ FAIT (avant le corpus) | La simplification « dispatch propage déjà → boucher 4 trous, pas construire » — chercher l'existant AVANT de concevoir |
| Revue fondations (2026-07-03) | `docs/revue-fable-fondations-2026-07-03.md` | ✅ FAIT (avant le corpus) | La détection du 🔴1 : croiser DEUX mécanismes prouvés isolément pour trouver le défaut d'interaction |
| Architecture #181 — moteur pédagogique adaptatif | `docs/plan-181-formation-adaptative.md` (41 Ko) | ✅ FAIT | 7 décisions (moteur=template/sujet=donnée, FSRS, boucle à 2 vitesses, volet PÉDAGO du Gardien) ; heuristique phare : « chercher le rail avant de poser des rails » (5 décisions/7 = assemblages de l'existant) |
| Architecture #178 — mémoire narrative 10 000 pages | `docs/plan-178-bible-narrative.md` (55 Ko) | ✅ FAIT | 7 décisions (SQLite `.bible`, intervalles de validité en coordonnées-chapitre, vérité/connaissance/visibilité séparées, fiche compilée > RAG, extraction à étages) ; asymétrie structurante : bible→prose fiable, prose→bible jamais — placer la confiance en amont |
| Architecture #179 — décomposition giga-apps | `docs/plan-179-giga-apps.md` | ✅ FAIT | 8 décisions (DAG de modules ≤15 fichiers/run GLM, contrats TS exécutables gelés par hook deny, séquentiel topologique puis worktrees, Opus décompose/GLM génère/le déterminisme intègre, tableur d'abord) ; auto-analyse des angles morts (biais de réutilisation) |
| Revue globale MangoOS (moteur génération + MangoQA + nocturne) | rapport à venir | 🔨 lancée | Méthode de revue d'un système inconnu de grande taille |
| Design #177-ambitieux — base de connaissance cross-vidéos YouTube | `docs/plan-177-video-connaissance.md` | ✅ FAIT | Enquête d'abord : « voir_video » du roadmap = fantôme (rien n'existe) ; yt-dlp déjà prouvé sur la machine (skill lire-youtube). Claims à VERBATIM OBLIGATOIRE vérifié mécaniquement (l'hallucination ne peut pas entrer) ; réconciliation qui classe/pondère sans décréter le vrai ; jonction #181 par banques sourcées horodatées |
| **Boucle de transmission GLM↔Fable** (validée par Raf 2026-07-03) | corrections Fable sur exécution GLM réelle | 📋 après un 1er plan exécuté | LA matière de distillation la plus précieuse : pas « comment Fable pense » mais « ce que Fable corrige chez GLM » |
| Designs #180 · #176 | `docs/plan-180-interface-autonome.md` · `docs/plan-176-stratege-global.md` | 🔨 lancées | Boucle perception-action · méta-raisonnement |
| Câblage harnais : rôle `architecte` → Fable 5 | `data/brain-registry.json` (architecte = claude/claude-fable-5, repli GLM déclaré) | ✅ FAIT | Le SIÈGE de Fable dans le harnais — MangoOS dispatche lui-même vers Fable pendant la fenêtre ; le fallback C2 du Pilier C protège ; après le 7/07, re-pointer = 1 ligne |
| Distillation finale → `methode-fable.md` | `docs/corpus-fable/methode-fable.md` | 📋 clôture du sprint | Les patterns transverses, en règles injectables |
