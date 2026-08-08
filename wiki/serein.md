---
type: entite
tags: [ui, surface, design, refonte]
statut: livré
sources: [historique, statut, design, docs/refonte/04-PARCOURS-ET-MENUS.md]
maj: 2026-08-08
---

# Serein

> **La surface d'entrée de MangoOS** : on décrit ce qu'on veut, on le voit apparaître, et **on en discute**. Zéro navigation, zéro réglage. L'atelier complet (5 écrans, 9 fenêtres, sélecteurs de cerveau) n'est pas supprimé — il est rangé derrière une porte en bas de page.

## Rôle

Serein répond à un constat de la [[refonte]] (doc 04) : l'écran d'accueil de MangoOS était un **cockpit**. Chaque sélecteur (modèle, mode, jauge de contexte, compteur de coût) est une décision juste pour Raf, et une question sans réponse pour quelqu'un d'autre — donc une occasion de se dire « ce n'est pas pour moi ».

`ui/src/main.jsx` monte Serein **par défaut** ; l'atelier ([[dette-technique|App.jsx]]) est chargé à la demande. Deux garde-fous, nés d'un premier jet où la porte était à sens unique : un paramètre d'URL qui force la surface (`?serein` / `?atelier`) et un retour visible monté **par-dessus** l'atelier.

## Deux moments, un seul basculement

L'ancre de tout est `projet` : tant qu'il est nul, rien n'existe.

| Moment | Ce que l'écran montre |
|---|---|
| **Avant** toute création | La question, le composeur, trois suggestions. Une colonne de 40 rem, centrée |
| **Le premier tour** | La demande rappelée, le geste en cours, une barre d'activité, un bouton pour arrêter — **plein cadre** : il n'y a encore rien à montrer à côté, donc rien ne justifie de couper l'écran |
| **Après** | **Deux volets, deux moitiés strictes** : la conversation à gauche, l'aperçu vivant à droite, sur toute la largeur de l'écran |
| **Échec** | Sans aperçu → l'écran entier, jamais accusateur. Avec aperçu → un simple message dans le fil : on n'efface pas ce qui marche pour annoncer ce qui n'a pas marché |

Le clavier suffit à tout : Entrée envoie, Maj+Entrée passe à la ligne, Échap arrête.

## La conversation (2026-08-08)

Demande de Raf : *« il faudrait que l'on puisse converser aussi. »*

**Le serveur savait déjà tout faire** — `/api/chat` distingue un projet neuf d'un projet existant, garde une **session par projet** (`saveSession`/`getSession`), réinjecte les 12 derniers tours dans le contexte de l'Élève, et `GET /api/history/:name` sert la conversation déjà mise en forme. Aucune ligne de serveur n'a été touchée.

**Ce qui l'empêchait était un bug latent de l'écran** : le nom du projet était re-dérivé de **chaque** phrase (`nommerDapres`). Un second message n'aurait donc pas modifié la création — il en aurait ouvert une **autre**, sous un autre nom, en repartant de zéro. La conversation était impossible **par construction**, pas par manque d'interface. Le nom est maintenant pris une fois et figé.

Ce qui n'est **pas** revenu avec la conversation : sélecteur de modèle, sélecteur de mode, jauge de contexte, compteur de coût, menus. C'est ce qui sépare cet écran de l'atelier.

**Prouvé en réel le 2026-08-08** (zéro stub, `sonnet` + mode élite, 112 s pour deux tours) : le second tour ne crée aucun nouveau dossier, les deux demandes vivent dans le même `.chat-history.json`, la modification est lue dans le DOM de l'aperçu, et le **git du projet généré** porte un commit par tour, nommé d'après la demande.

**Deux moitiés strictes** (retour de Raf le même jour) : les colonnes étaient d'abord inégales, au motif que « c'est le résultat qu'on regarde ». Faux — on passe autant de temps à écrire qu'à regarder, et deux colonnes inégales font hésiter l'œil sur laquelle est la principale. Le plafond de largeur global a sauté avec ; seule la longueur de ligne du texte reste bornée, pour ne pas produire des lignes de 180 caractères sur un écran large.

Deux choix de forme qui portent du sens :
- la réponse de Mango s'affiche **sans bulle** (une marque et du texte) — deux bulles face à face feraient une messagerie, or il n'y a qu'une personne et un outil ;
- l'aperçu se **remonte** après chaque tour plutôt que de compter sur le seul rechargement à chaud de Vite, qui ne suit pas un ajout de dépendance.

## Le vocabulaire

`serein/dire.js` est la **seule frontière de vocabulaire** du produit : aucune chaîne rendue à l'écran ne contient de mot d'informaticien (ni prompt, ni modèle, ni agent, ni token, ni build, ni workspace). Il traduit le flux d'événements du moteur en gestes (`write_file` → « J'écris une page ») et **rend `null` le plus souvent** — la majorité de ce que le moteur émet est du bruit. Une interface calme n'est pas une interface qui cache, c'est une interface qui trie.

Le ton des échecs est une règle, pas un style : « Je n'y arrive pas », jamais « votre demande est invalide ».

Depuis que la conversation existe, les **réponses écrites** de l'agent s'affichent — et elles parlent volontiers en machine. Arbitrage de Raf : **on nettoie les chemins, on ne réécrit pas la phrase** (`nettoyerReponse`). Les blocs de code partent, `src/App.jsx` devient « la page », le Markdown est aplati. La moitié des 19 tests de ce fichier gèle les pièges **inverses** — « et/ou », « 24/7 », une adresse web, un accent grave qui n'entoure pas un chemin doivent **survivre** : le vrai risque d'un nettoyage n'est pas d'en laisser passer, c'est d'en manger trop. Ce que ça ne couvre pas est écrit dans [[limites|L143]] : la détection est **formelle**, donc « un composant React avec un state local » passe encore.

## La refonte visuelle du 2026-08-08

Le premier jet appliquait une doctrine écrite en dur dans `theme.css` : *« aucun dégradé, aucune ombre portée, aucune lueur »*. Retour de Raf, sans détour : **« l'interface est dégueulasse, tu n'as rien compris au thème d'Apple ou Google »**. Il avait raison, et la doctrine était la cause.

**Le malentendu** : Apple n'est pas « plat ». Le HIG repose sur des **surfaces** qui portent le contenu, des ombres douces, des rayons continus, un tracking **négatif** aux grandes tailles, et une seule couleur saturée employée avec parcimonie. Material 3 dit la même chose autrement (élévation tonale 0→5, échelle de formes jusqu'à 28 dp, *state layers*). La règle interdisait précisément ce qui fait tenir les deux systèmes. Résultat : un `<textarea>` souligné d'un trait, un bouton posé à côté d'un texte gris, des suggestions en liens soulignés. Pas sobre — **non dessiné**.

**Ce qui remplace** (direction Apple, arbitrée par Raf) : fond gris froid `#f5f5f7`, composeur en carte blanche à deux étages d'ombre, échelle typographique à tracking serré, accent mangue **unique et non décoratif** (anneau, icônes, barre d'activité — jamais un grand aplat), action principale en encre, états sur tout ce qui se clique, aperçu encadré comme une **fenêtre**. Densité assumée : base 15 px, la priorité est allée au rendu plutôt qu'au confort de lecture d'un profil non technique — le focus clavier visible et `prefers-reduced-motion` restent, Apple les impose aussi.

## Ce que l'épisode apprend

**Une interface qu'on n'a jamais regardée n'est pas livrée.** Les quatre états avaient été écrits sans qu'une seule capture soit prise. Le contrôle visuel a trouvé, en trois captures, ce que ni `tsc`, ni le build, ni 77 tests ne pouvaient voir :

- un halo mangue allumé **en permanence** au repos (le champ est focalisé au montage, et un `<textarea>` focalisé satisfait toujours `:focus-visible`) — ça ressemblait à un champ en erreur ;
- une barre d'activité qui passait la moitié de son cycle **hors piste**, donc un simple trait gris ;
- un titre qui laissait deux mots seuls sur la seconde ligne ;
- un **slug technique** (`site-pour-montrer-mes`) affiché dans la barre de la fenêtre d'aperçu, sur le produit dont la règle n°1 est de n'afficher aucun mot de machine.

Moyen retenu, réutilisable : Playwright en `channel: 'chrome'` (le navigateur **déjà installé**, aucun téléchargement), plus un stub de `/api/chat` rejouant un flux SSE fabriqué — les trois autres états se photographient sans lancer de génération, donc sans coût.

## Liens

[[refonte]] · [[dette-technique]] · [[moteur-gout]] · [[oeil-coach]] · [[audit-2-0]] · [[vision]]

## Sources

- `ui/src/serein/{Serein.jsx,theme.css,dire.js,dire.test.js}` et `ui/src/main.jsx` — **copie vivante `D:\IA\MangoOS`** (décision n°4 de `docs/refonte/README.md`)
- Côté serveur, inchangé : `routes/chat-route.ts` (session par projet, fenêtre de 12 tours), `history.ts`, `project-io-routes.ts`
- [[historique]] — Journal 2026-08-08 (suite 5 : la refonte visuelle · suite 6 : la conversation)
- [[design]] — section « Serein »
