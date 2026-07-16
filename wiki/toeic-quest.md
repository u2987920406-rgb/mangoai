---
type: projet
tags: [app, formation, toeic, gout, transmission, client]
statut: rebranding en cours (Phase 2/5 livrée) — livraison client à un jeune femme de 25 ans, web + mobile
sources: [statut.md 2026-07-16, limites.md L62-L64/L115, historique.md Journal 2026-07-16]
maj: 2026-07-16
---

# Yes I Can Toeic *(anciennement TOEIC Quest)*

> Vraie **formation TOEIC sur un an** (vers le score 800+) : moteur bâti par Claude, **contenu rédigé par GLM (l'Élève)**, cohérence des images **jugée par le VL souverain**. **Renommée et rebrandée en 2026-07-16** pour une livraison à un client payant (web + mobile via Capacitor) — voir section « Rebranding client » ci-dessous.

## Rebranding client (2026-07-16, en cours)

Raf livre ce produit à un client payant sous le nom **« Yes I Can Toeic »**, cible = jeune femme de 25 ans (enjeu carrière/mobilité internationale), ton « sérieux ET ludique ». Plan en 5 phases (`C:\Users\PC-DELL\.claude\plans\statut-stateless-glade.md`) :
- **Phase 1 ✅ LIVRÉE** — 3 directions de maquettes explorées (Studio Confiance chaleureux → pastel aquarelle nacré → référence Dribbble "Flashlight App" par UIOVIA) ; direction finale tranchée : cartes blanches sur halo diffus dégradé, badges de couleur pleine par fonction (corail/ambre/cyan/violet), cadran à graduations, bouton orbe glossy.
- **Phase 2 ✅ LIVRÉE** — rebranding réel appliqué : nom partout (`index.html`, `package.json`, `App.jsx`, `Dashboard.jsx`, README, tests), tokens `--mango`→`--accent-primary` + palette corail/ambre/cyan/violet (`index.css`), mascotte-mangue retirée et remplacée par un badge orbe glossy (`Mascot.jsx` réécrit, même API, 8 sites d'appel inchangés), clé `localStorage` migrée en reset simple (`yesicantoeic_progress_v1`). Vérifié : build vert, 4/4 tests Playwright verts, contrôle visuel Chrome OK.
- **Phase 3 ✅ LIVRÉE** — biais de position corrigé (script de rééquilibrage), épuisement de nouveauté fixé (`seenIds`), 4 défauts de contenu corrigés à la source, `localStorage` durci (validation de forme + `schemaVersion` + `saveError`), 6 nouveaux fichiers de tests + profil mobile Playwright (36/36 verts), polices auto-hébergées, `safe-area-inset` posé. 2 défauts de contenu restants nécessitent une passe d'authoring (limites.md L130/L131).
- **Phase 4 ✅ LIVRÉE (câblage)** — Capacitor installé, `android/`+`ios/` scaffoldés, icônes/splash générés (placeholder à remplacer par le vrai logo client), scripts `cap:sync`/`cap:android`/`cap:ios`. **Limite bloquante (L133)** : aucun toolchain natif (Java/Android SDK/Xcode) sur cette machine → build réel jamais testé, à faire par Raf sur un poste équipé.
- **Phase 5 ✅ LIVRÉE** — `README.md` étendu (hébergement web, build/signature Android+iOS, coût réel Apple Developer 99$/an, checklist de retest).

**Plan à 5 phases COMPLET côté ingénierie.** Ce qui reste est entre les mains de Raf : premier build natif réel (L133, aucun toolchain sur la machine de dev), décision sur les 229 images distantes (L132), 2 défauts de contenu nécessitant de l'authoring (L130/L131).

## Rôle

Application React (`workspace/toeic-quest/`) que Raf veut **utiliser pour de vrai** et **vendre**. C'est un cas d'école de la doctrine [[transmission-competences]] : **Claude outille, MangoOS produit la formation**. ~2h/semaine, 52 semaines, 3 niveaux (Débutant/Intermédiaire/Avancé), les **7 parties officielles du TOEIC** (P1 Photos · P2 Question-Réponse · P3 Conversations homme-femme · P4 Short Talks · P5 Phrases · P6 Complétion · P7 Compréhension, simple + double passage).

## Détails clés

- **Moteur (Claude)** — `data/curriculum.js` (52 modules, déverrouillage par bilans, prérequis inter-niveaux acquis au placement) ; **façade rétro-compatible** (`data/questions.js` reconstruit l'API historique → les 3 modes libres restent intacts ; banque taguée dans `data/bank/`) ; **scoring TOEIC réaliste 800+** (pondéré difficulté + couverture) + XP différencié (10/15/25) ; **moteur de voix H/F** (`lib/speech.js` : `pickVoice` UK Female/UK Male, `speakSequence` joue le dialogue ligne par ligne avec watchdog anti-bug Chrome + surlignage du locuteur actif) ; 5 écrans (placement, sélection de niveau, **carte de parcours type Duolingo**, module, diagnostic) + bouton de réinitialisation.
- **Contenu (GLM)** — `server/src/run-toeic-content.ts` : génération pilotée GLM par module (schéma strict par partie, validation, vraies images Pexels), resumable. **~290 questions** écrites par `glm-5.2:cloud` ($0 côté Claude), dont le double passage P7.
- **Cohérence image↔texte (VL)** — `server/src/run-toeic-coherence.ts` : `qwen3-vl:8b` local (think désactivé, réponse parsée dans `thinking`) juge les images Part 1 (l'image DOIT illustrer la bonne réponse) → 46 jugées, 6 remplacées, 1 question retirée. Répond à la demande explicite de Raf « que les images correspondent aux textes » (cf. AXIOME-UX-10).
- **Vérifié live (Chrome MCP)** : placement 12/12 → Niveau Avancé · conversation H/F (voix distinctes + surlignage) · P2 à 3 choix · carte de parcours peuplée (M1 ouvert, suite verrouillée) · 0 erreur console · build vert.
- **Choix produit (AskUserQuestion)** : moteur complet + 1er palier vérifié · **produit mono-utilisateur d'excellence** (pas de backend/paiement) · voix navigateur ($0) · parties officielles 1-7.

## Liens

- [[transmission-competences]] — GLM produit la formation, Claude fournit le moteur et les recettes.
- [[moteur-gout]] — la cohérence image↔texte jugée par le VL prolonge la chaîne de goût/QA.
- [[limites]] — L62 (qualité TTS variable selon l'OS), L63 (Inter/Avancé à industrialiser au même moteur GLM), L64 (code-split du bundle).
- [[statut]] · [[historique]] — entrées du 2026-06-30 (bg).

## Sources

- `statut.md` — entrée « Dernière mise à jour 2026-06-30 (bg) ».
- `limites.md` — L62, L63, L64.
- Plan : `.claude/plans/a-fait-deux-fois-mellow-finch.md`.
