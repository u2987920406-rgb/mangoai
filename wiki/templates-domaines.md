---
type: entité
tags: [templates, domaines, design, prompt, bibliotheque, detection]
statut: livré
sources: ["nuit 2026-07-03"]
maj: 2026-07-03
---

# Templates de domaine (bibliothèque locale)

~20 manifests markdown (`server/templates/*.md`), un par domaine d'app, injectés dans le prompt de l'Élève quand le domaine est détecté sur la demande — le squelette, les contraintes design et les pièges d'un domaine, compilés une fois pour toutes (recherche web 2026-07-03), zéro dépendance réseau au runtime.

## Rôle

Chaque app repartait de zéro : mêmes questions de structure, mêmes pièges retombés (autoplay audio bloqué, simulation qui diverge, hero générique). Un manifest TRANSMET le savoir du domaine sans coder à la place de l'Élève (directive [[transmission-competences]]) : 3 angles créatifs non-évidents + l'interdit du cliché (axiome UX-34 opérationnalisé), squelette proportionné, pairing typographique précis, logique d'ancrage de palette, micro-interactions chiffrées, pièges AVOID spécifiques, consignes Pexels/données. Ne pas confondre avec les **starters techniques** (dossiers `server/templates/<nom>/`, ex. vitrine/phaser) : les manifests sont les fichiers `.md` à la racine du même dossier.

## Détails clés

| Pièce | Détail |
|---|---|
| **20 domaines** | landing-saas · jeu-arcade (gold standards main) · portfolio · restaurant · e-commerce · dashboard · dataviz-explorer · crypto-finance · jeu-puzzle · simulateur · musique-audio · app-productivite · education · ia-chat · editorial · evenement · immobilier-voyage · sante-sport · enfants-ludique · dark-luxe |
| **Format** | frontmatter `domaine` + `détection: [mots-clés FR/EN]` · Angle avant tout / Squelette / Design / Composants canoniques / Pièges (AVOID) / Données-Images |
| **Détection** | `template-library.ts` : normalisation désaccentuée + frontière de mots (« jeudi » ≠ « jeu »), score pondéré par longueur du mot-clé, **seuil 2** anti-faux-positifs, meilleur score gagne, repli "" (comportement inchangé). Pure, synchrone, cache par dossier. |
| **Injection** | bloc `domainTemplate` dans `assembleSystemPrompt` (scenario.ts, après `blueprints`), alimenté aux 2 sites : agent.ts (Maître) et index.ts (Élève, systemFull) — pattern constellations #74. |
| **Tests** | `test-template-library.ts` 21/0 — parsing, FR/EN/accents, frontières, seuil, les 20 manifests réels (uniques, substantiels, format gold standard), détections bout-en-bout. |

## Liens
[[boucle-curation]] · [[transmission-competences]] · [[gardien-cloture]] · [[moteur-gout]] · [[statut]] · [[historique]]

## Sources
Nuit 2026-07-03 (`statut.md` dl · `historique.md` Journal 2026-07-03 · `docs/taxonomie-templates.md` · `docs/recherche-web-2026-07-03.md`) · modules `template-library.ts` / `scenario.ts` (bloc `domainTemplate`).
