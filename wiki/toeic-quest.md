---
type: projet
tags: [app, formation, toeic, gout, transmission]
statut: livré (1er palier vérifié)
sources: [statut.md 2026-06-30 (bg), limites.md L62-L64]
maj: 2026-06-30
---

# TOEIC Quest

> Vraie **formation TOEIC sur un an** (vers le score 800+) : moteur bâti par Claude, **contenu rédigé par GLM (l'Élève)**, cohérence des images **jugée par le VL souverain**.

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
