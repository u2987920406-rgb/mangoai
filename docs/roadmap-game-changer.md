# Feuille de route — 5 chantiers game-changer (2026-07-03)

> Décidés par Raf après recul sur MangoOS + MangoQA. Chacun **accomplit** la vision fondatrice (`fondation.md`) plutôt que d'en dévier : « Mango Office » et le multimodal y figurent déjà, et la proactivité EST le Visage 2 (Observateur-Conseil) appliqué à Mango Core. Principe directeur maintenu : **standards à la périphérie, custom au cœur** ; chaque nouvelle capacité = un agent/driver, pas un gonflement du noyau.

| # | Chantier | Ce que ça débloque | Patron réutilisé | Priorité | Statut | Modèle optimal | Effort |
|---|----------|--------------------|--------------------|----------|--------|----------------|--------|
| #176 | **Proactivité + remise en question** | Mango cesse d'être un exécutant docile : il propose la suite, signale un problème avant qu'on demande, et remet en question SA sortie ET la demande de Raf quand il voit mieux | Stratège #164 + Gardien #161 + Visage 2 MangoQA | P0 | 🟢 **livré (spine)** | 🧠 Opus 4.8 | M |
| #177 | **Voir une vidéo YouTube** | Comprendre une vidéo (transcript + images-clés), en extraire l'info, générer des prompts | `extraire_site` (voir→comprendre→reformuler→persister) | P1 | 🟢 **fondation livrée** | ⚖️ Sonnet 4.6 | M |
| #178 | **Univers narratif multi-tomes cohérent** (Tolkien, ~10 000 pages) | Générer une saga cohérente sur des millions de tokens | Blackboard (bible d'entités) + juge souverain (Gardien de continuité) + distillation | P1 | 🟢 **spine livré** · boucle = plan | 🧠 Opus 4.8 | XL |
| #179 | **Giga-apps interconnectées** (façon Office) | Un environnement d'apps qui partagent données + événements | `mangoAppContract` + `mangoData` (déjà là) | P2 | 📋 **plan** | 🧠 Opus 4.8 | L |
| #180 | **Interface de bureau autonome** (façon Claude Desktop) | MangoOS comme app installable qui fait tout ce que fait Claude Code/Desktop | Distribution jalon A + périmètre d'action élargi contrôlé | P2 | 📋 **plan** | 🧠 Opus 4.8 | XL |
| **#181** | **⭐ Générateur de FORMATION à la demande** (priorité Raf, 2026-07-03) | Créer une formation pro sur N'IMPORTE quel domaine : écosystème complet — ergonomie d'apprentissage, sources vérifiées, textes lisibles, schémas/vidéos selon le sujet, logique pédagogique, outils adaptés au contexte | template-library (domaine `education` existe) + Gardien (vérif sources/textes/composants) + #177 vidéo + #178 continuité + `genere_contenu`/`verifie_coherence_images` | **P0 (prioritaire)** | 📋 **à concevoir en premier** | 🧠 Opus 4.8 | XL |

## ⭐ #181 — Générateur de formation (demande prioritaire de Raf)

Raf veut un **« spécialiste de création de formation » professionnel sur demande** : donner un sujet quelconque → obtenir un écosystème de formation complet et de qualité. Exigences explicites :
- **Ergonomie & logique d'apprentissage** : progression pédagogique réelle (pré-requis → notions → pratique → évaluation), pas un dump de texte.
- **Sources VÉRIFIÉES** : chaque affirmation traçable à une source réelle (chercher_web/lire_page/extraire_site + #177 vidéo), contrôle anti-hallucination.
- **Composants vérifiés** : textes lisibles (échelle typo, longueur de ligne), schémas quand ils clarifient, vidéos quand elles apportent — décidé par le sujet, pas systématique.
- **Adaptatif au contexte** : les outils/format choisis selon le domaine (un cours de code ≠ un cours d'histoire ≠ un cours de cuisine).
Ce chantier RÉUTILISE presque tout l'arsenal (template `education`, Gardien pour la vérif, vidéo #177, continuité #178 pour la cohérence inter-modules, génération de contenu). C'est un **agrégateur de haut niveau** — d'où sa priorité : il capitalise sur les 5 autres. **À concevoir dès la reprise** (plan détaillé + spine : modèle de cursus + Gardien pédagogique de sources).

## Ce qui est livré CETTE session vs planifié

- **#176 Proactivité** — livré comme capacité réelle (bloc de réflexion fin-de-tour + posture de remise en question), gaté, testé. C'est le flagship : il rend *tous* les autres chantiers meilleurs.
- **#177 Vidéo** — fondation livrée : outil `voir_video` avec logique pure testée et deps injectées ; la dépendance externe (yt-dlp/ffmpeg pour l'extraction de frames) est documentée en limite, l'outil est gaté.
- **#178 Bible narrative** — spine livré : modèle d'entités + cœur de vérification de continuité (le « Gardien narratif »), pur et testé. La boucle de génération multi-tomes (le gros morceau XL) est un plan détaillé.
- **#179 / #180** — designs d'architecture écrits (`docs/plan-*.md`), prêts à exécuter par phases.

## Séquencement recommandé (après cette session)
1. **#176** est déjà là → l'affiner avec l'usage réel (calibrer ce que Mango remet en question).
2. **#177** → brancher yt-dlp/ffmpeg (dépendance externe) + preuve live sur une vraie vidéo.
3. **#178** → construire la boucle par-dessus le spine : génération chapitre-par-chapitre qui lit/écrit la bible, Gardien de continuité en clôture de chaque chapitre. C'est le chantier le plus ambitieux (« le plus toi »).
4. **#179** → bus inter-apps par-dessus mangoData, un environnement-shell.
5. **#180** → distribution jalon A (installeur) + élargissement contrôlé du périmètre d'action hors workspace.

## Note d'échelle honnête
#178 et #180 sont **XL** : plusieurs sessions chacun. Cette session pose leurs fondations prouvées (modèle + gardien de continuité testés pour #178 ; plan + prérequis pour #180) — pas la totalité. La valeur immédiate est dans #176 (livré, transverse) et #177 (fondation, proche).
