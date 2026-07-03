---
domaine: editorial
détection: [magazine, éditorial, editorial, article, blog, long-form, longform, scrollytelling, récit, story, reportage, revue, presse, journal, essai, chronique, dossier]
---
# Magazine / éditorial / scrollytelling

## Angle avant tout
Décide UN angle non-évident AVANT de coder, écris-le en commentaire en tête d'App :
- **Une-de-journal détournée** : la page s'ouvre comme une une de presse (titre 10-14vw, surtitre, filet, colonnes) puis se déplie en récit continu au scroll.
- **Le chiffre-pivot** : tout l'article s'articule autour d'UNE donnée (un chiffre géant qui grossit/évolue au scroll) — le texte gravite autour d'elle.
- **Deux voix en contrepoint** : deux colonnes/registres typographiques alternés (récit serif vs faits sans-serif) qui se répondent, fusion au climax.
Interdit : le blog générique « titre + image bannière + paragraphes centrés 700px » sans idée de mise en scène.

## Squelette
1. **Ouverture** (100vh) : titre en très grande serif (8-12vw), surtitre/kicker en petites capitales espacées, auteur + date + temps de lecture, indice de scroll. PAS d'image obligatoire ici — la typo peut porter seule.
2. **Chapô** : 1 paragraphe en 1.4-1.6rem qui pose l'enjeu, largeur ~34rem.
3. **Corps du récit** : colonne de lecture 60-72 caractères (max-width ~38rem), sections séparées par des intertitres serif. Drop cap sur le premier paragraphe de chaque section (`::first-letter`, 3-4 lignes de haut).
4. **Moments de rupture** (tous les 3-4 paragraphes, ALTERNER les trois types) :
   - image pleine largeur (100vw, sort de la colonne) avec légende ;
   - pull quote 2-2.5rem en débord de grille ;
   - bloc chiffre/donnée plein écran (scrollytelling : la valeur se révèle en entrant dans le viewport).
5. **Climax visuel** : UNE section immersive (image fixe en `background-attachment` simulé via sticky + texte qui défile par-dessus).
6. **Chute** : dernier paragraphe court, puis signature, puis « à lire ensuite » (2-3 cards max).
Proportion cible : ~60 % colonne de lecture, ~40 % moments pleine largeur.

## Design
- **Typo** : pairing éditorial PRÉCIS — display/corps serif (« Playfair Display » ou « Lora », fallback `Georgia, serif`) + labels/kickers sans-serif (« Inter », fallback `system-ui`).
  - Corps : 1.125-1.25rem, `line-height: 1.7`. Intertitres : serif 2-2.5rem. Pull quotes : serif italique.
  - Kickers/légendes : 0.75rem, `letter-spacing: 0.12em`, uppercase.
- **Palette** : ancrée au SUJET de l'article (enquête climat → verts profonds/terre ; portrait mode → noir/crème/un rouge ; tech → encre bleue/papier).
  - Base = papier (blanc cassé #faf8f4 ou équivalent thématique), encre presque-noire, UN accent réservé aux liens/filets/drop caps. Jamais de dégradés.
- **Motion** (3 minimum) :
  - Révélation des images pleine largeur au scroll : opacity 0→1 + scale 1.04→1, 700ms ease-out.
  - Pull quotes qui glissent depuis leur débord : translateX ±24px→0, 500ms ease-out.
  - Compteur du chiffre-pivot animé en entrant dans le viewport : interpolation ~1.2s, ease-out, une seule fois.
  - Barre de progression de lecture : 3px en haut, width liée au % de scroll.
  - Respecter `prefers-reduced-motion` : tout devient statique, valeurs finales affichées directement.

## Composants canoniques
- `Ouverture` : titre serif clamp, kicker, méta — hiérarchie stricte, whitespace généreux.
- `Prose` : la colonne de lecture avec drop caps (`p:first-of-type::first-letter`), styles de liens soulignés à l'accent.
- `PullQuote` : `float` ou grille en débord (`margin-inline: -15%` en desktop), guillemet géant décoratif en accent.
- `FullBleed` : figure 100vw (`width: 100vw; margin-left: calc(50% - 50vw)`), légende en petit sans-serif.
- `ScrollyChiffre` : sticky + IntersectionObserver, un chiffre 8-12vw qui se révèle.
- `BarreLecture` : position fixed top, width = scroll %.

## Pièges (AVOID)
- Mur de texte : sans rupture visuelle toutes les 3-4 paragraphes, l'article meurt (axiome 31 — accumulation plate).
- Colonne trop large : > 75 caractères par ligne = illisible, quel que soit le style.
- Serif thin sur images ou fond sombre : illisible ; le texte sur image exige un voile (overlay 40-60 %) ou un scrim en dégradé.
- Scrollytelling gadget : chaque effet de scroll doit SERVIR le récit (révéler une donnée, marquer un chapitre) — sinon le supprimer (axiome 33).
- Contenu creux : écrire un VRAI article (600+ mots crédibles, sujet précis, chiffres sourcés-plausibles), jamais 3 paragraphes de remplissage.

## Données/Images
- Pexels : chercher des images DOCUMENTAIRES liées au sujet précis de l'article (lieux réels, gestes, matières — ex. « old printing press », « glacier aerial », « market vendor hands ») — jamais d'illustration « concept business » générique. 3-5 images max, toutes pleine largeur ou rien.
- Simuler : auteur avec nom + bio d'une ligne crédibles, date réaliste, temps de lecture calculé (~200 mots/min), 2-3 articles « à lire ensuite » avec vrais titres travaillés.
