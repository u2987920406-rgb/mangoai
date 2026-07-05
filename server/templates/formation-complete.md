---
domaine: formation-complete
détection: [formation complete, formation adaptative, cursus, parcours de formation, parcours d'apprentissage, programme de formation, cours complet, formation multi-semaines, apprendre le, se former a, se former au, curriculum, plan de formation]
---
# Formation adaptative complète (multi-semaines) — PAS un quiz

## Ce manifest N'EST PAS `education.md`
`education.md` décrit un QUIZ mono-session (10 questions, 3 minutes, confetti à la fin). Ce manifest décrit un AUTRE produit : une formation complète avec curriculum, mémoire de l'apprenant persistante, répétition espacée et reprise entre sessions — un cursus qu'on suit sur des semaines, pas une session qu'on termine en 3 minutes. Ne PAS piocher les micro-interactions de `education.md` en pensant que c'est le même genre : les squelettes divergent dès l'écran d'accueil (ici : une CARTE de parcours avec des modules verrouillés/déverrouillés, pas un écran « Commencer » unique).

Techniquement, ce manifest de DOMAINE décrit l'HABILLAGE et le CONTENU à produire par-dessus le starter technique `server/templates/formation/` (le moteur — écrans, FSRS, modèle apprenant, sync — est déjà écrit, testé, ne PAS le réécrire). Ce qui varie ici : le curriculum, les banques d'items, l'identité visuelle du sujet, d'éventuels composants spécifiques au domaine (lecteur audio pour une langue, bac à code pour un langage).

## Angle avant tout
Décide UN angle non-évident pour l'identité visuelle du SUJET (pas de « école générique ») :
- **Atelier du praticien** : le sujet comme un métier qu'on apprend en atelier — outils, gestes, progression par compagnonnage (photo argentique, cuisine, artisanat).
- **Ascension par paliers** : le curriculum comme une montée visible (carte de parcours en sentier/étages), chaque module validé fait physiquement progresser sur la carte.
- **Cabinet d'expert** : rigueur, sources visibles en évidence, ton posé (sujets académiques/techniques pointus — TypeScript avancé, certifications).
Interdit : reproduire l'angle « jeu télévisé » d'un quiz sur un produit qui dure des semaines — la dramaturgie d'un buzzer s'épuise en un après-midi, pas en un cursus.

## Squelette (celui du starter `formation/`, ne pas en inventer un autre)
1. **Placement** : test court (quelques items représentatifs, un par module) qui amorce la maîtrise estimée — jamais éliminatoire, toujours transparent sur le fait que c'est un point de départ, pas un verdict.
2. **Carte de parcours** : modules dans l'ordre des prérequis, verrouillage visible, barre de maîtrise par module (pas juste "vu/pas vu"), accès direct à la file de révision du jour si des cartes sont échues.
3. **Leçon AVANT exercice, toujours** — règle non négociable (voir Pièges ci-dessous) : contenu rédigé avec soin + sources déclarées et VISIBLES (l'apprenant doit pouvoir cliquer et vérifier), puis seulement ensuite l'exercice qui met le contenu à l'épreuve.
4. **Exercice** : joue un item du curriculum (qcm/flashcard/texte-à-trous/appariement, ou un type spécifique au domaine ajouté au registre d'`ItemRenderer` — jamais en cassant le switch existant).
5. **Révision** : la file du jour (FSRS), présentée comme un rituel bref et sans pression — pas un examen.
6. **Bilan de session** : compétences faibles nommées explicitement (pas juste un score), invite à revenir plus tard plutôt que sommation de tout finir d'un coup — une formation n'a pas de "fin de partie" au sens du quiz.

## Design
- **Typo** : registre du SUJET, pas un défaut "école". Un cursus technique pointu → grotesk sobre (Space Grotesk, IBM Plex Sans) ; un artisanat/métier manuel → une display chaleureuse (Fraunces, Recoleta) ; un sujet académique dense → serif éditorial posé (Source Serif, Lora).
- **Palette** : ancrée au sujet précis (photographie argentique → gris argentique + rouille ; TypeScript → bleu terminal ; cuisine → tons d'ingrédients réels), jamais une palette "école" générique (bleu-blanc-jaune primaire).
- **Densité de contenu** : une leçon a un VRAI corps de texte (plusieurs paragraphes structurés, pas 3 lignes) — le ratio leçon/exercice se voit à l'œil : si toutes les pages ressemblent à des QCM, c'est raté (cf. Piège n°1).

## Pièges (AVOID) — le risque produit n°1 du chantier #181
- **Dérive « quiz déguisé »** (le piège le plus important de ce manifest) : livrer une formation qui n'est qu'un empilement de QCM avec des leçons squelettiques (2-3 phrases) est un ÉCHEC, même si le build est vert et le moteur fonctionne. Le contenu EST le produit — une leçon bâclée trahit tout l'effort du moteur, exactement comme documenté dans `education.md` pour le quiz simple, en pire (ici l'apprenant s'engage sur des semaines).
- **Leçon absente ou après l'exercice** : ne jamais faire deviner une notion jamais enseignée. Chaque module doit couvrir ses `skillIds` par au moins une leçon AVANT tout exercice qui les teste (le volet PÉDAGO du Gardien, É4, vérifiera cette couverture — mais ne pas attendre le gate pour bien faire).
- **Sources absentes ou décoratives** : une leçon sans `sources` non vides n'est pas conforme (schéma É1 le refuse) ; des sources génériques (page d'accueil Wikipédia au lieu de l'article précis) ne satisfont pas l'esprit de la règle même si elles passent le schéma.
- **Confondre "beaucoup de contenu" et "bon contenu"** : 40 modules à 3 items chacun bâclés valent moins que 15 modules soignés. Mieux vaut un curriculum plus court mais dont chaque leçon supporte la lecture attentive d'un vrai apprenant.
- **Réécrire le moteur** : ne jamais dupliquer/réinventer `lib/engine.ts`, `lib/spaced.ts` ou `lib/learner-store.ts` du starter pour "mieux coller au sujet" — le moteur est un TEMPLATE délibérément générique (D1) ; toute spécialisation domaine passe par le CONTENU (curriculum/banques) ou par un NOUVEAU renderer ajouté au registre d'`ItemRenderer`, jamais par une réécriture du cœur.

## Données/Contenu attendu
- Curriculum réaliste : modules avec prérequis cohérents (pas de cycle), `skillIds` qui reflètent vraiment des compétences distinctes du sujet (pas un module = un skillId générique fourre-tout).
- Banque d'items par module couvrant TOUS les types déclarés dans `typesAttendus`, avec un vrai ratio leçon/exercice (au moins une leçon substantielle par module avant ses exercices).
- Chaque leçon porte 1 à 3 `sources` réelles et précises (URL vers une page qui traite VRAIMENT le sujet de la leçon, pas une page générique).
- Domaines à vérité formelle (code, maths) : préférer des exercices vérifiables par exécution (le Gardien sait lancer des tests, `ELEVE_GATE_TESTS`) à un simple QCM sur la syntaxe.
