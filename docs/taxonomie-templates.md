# Taxonomie des templates/frameworks locaux (~20 domaines)

Principe (validé par la recherche web + axiomes maison) : un template = **un manifest markdown compact** injecté dans le prompt de l'Élève quand le domaine est détecté. Il ne code PAS à la place de l'Élève (directive transmission) : il lui donne le squelette structurel, les contraintes design du domaine, les pièges AVOID, et les composants canoniques à ne pas réinventer. GLM-5.2 reste l'exécutant à 100 %.

## Structure d'un manifest (uniforme)

```
---
domaine: <slug>
détection: [mots-clés FR/EN]
---
# <Domaine>
## Angle avant tout        ← 2-3 angles créatifs éprouvés pour ce domaine (axiome UX 34)
## Squelette               ← sections/écrans canoniques, ordre, proportions
## Design                  ← typo (pairing précis), palette (logique d'ancrage), motion (3 micro-interactions minimum)
## Composants canoniques   ← hero/cards/nav/HUD... avec leurs attributs précis
## Pièges (AVOID)          ← les axiomes AVOID spécifiques au domaine
## Données/Images          ← quoi chercher sur Pexels, quelles données simuler
```

## Les 20 domaines

| # | Slug | Domaine | Exemples de projets |
|---|------|---------|---------------------|
| 1 | landing-saas | Landing page produit/SaaS | outil, service, app à vendre |
| 2 | portfolio | Portfolio créatif | photographe, designer, dev |
| 3 | restaurant | Restaurant / food | resto, café, recettes vitrine |
| 4 | e-commerce | Boutique / produit | shop, fiche produit, drop |
| 5 | dashboard | Dashboard analytique | KPIs, monitoring, admin |
| 6 | jeu-arcade | Jeu canvas arcade | shooter, runner, breakout |
| 7 | jeu-puzzle | Jeu de réflexion | 2048, memory, sokoban, mots |
| 8 | simulateur | Simulateur/sandbox | physique, écosystème, foule |
| 9 | dataviz-explorer | Explorateur de données | carte interactive, timeline, comparateur |
| 10 | musique-audio | Expérience audio | synthé, visualiseur, drum machine |
| 11 | editorial | Magazine / éditorial | blog long-form, article scrollytelling |
| 12 | evenement | Événement | concert, festival, conférence, mariage |
| 13 | immobilier-voyage | Vitrine lieu | hôtel, destination, bien immo |
| 14 | app-productivite | Outil de productivité | todo, kanban, notes, tracker |
| 15 | education | Apprentissage | quiz, flashcards, cours interactif |
| 16 | sante-sport | Santé / fitness | suivi d'entraînement, nutrition, méditation |
| 17 | crypto-finance | Finance | tracker de marché, budget, calculateurs |
| 18 | ia-chat | Interface IA/chat | assistant, playground, bot |
| 19 | enfants-ludique | Univers enfants | jeu éducatif, histoire interactive |
| 20 | dark-luxe | Marque premium | montre, parfum, automobile, heist |

## Branchement dans le pipeline

1. `server/templates/<slug>.md` — les 20 manifests.
2. `server/src/template-library.ts` — chargement + **détection du domaine** par mots-clés sur la demande utilisateur (score simple, seuil ; aucun appel LLM supplémentaire) + repli « aucun template » (comportement actuel inchangé).
3. Injection dans `assembleSystemPrompt` (scenario.ts) comme bloc conditionnel, à la manière des blocs existants.
4. Tests : détection (FR/EN, accents), non-régression quand aucun domaine ne matche, manifests tous chargeables.
