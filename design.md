# Design — MangoOS

> **Deux surfaces, deux chartes.** Depuis le 2026-08-08, MangoOS a un écran d'entrée
> — **Serein** — dont la charte est indépendante de celle de l'atelier. Tout ce qui
> suit la section « Serein » décrit **l'atelier** (thème sombre violet), qui n'a pas
> changé et reste atteignable par la porte du bas.

## Serein — la surface d'entrée (2026-08-08)

On décrit, on voit apparaître, **on en discute**. Zéro navigation, zéro réglage.
Fichiers : `ui/src/serein/{Serein.jsx,theme.css,dire.js}`, monté par `ui/src/main.jsx`.

**Deux géométries, un seul basculement** — l'ancre est `projet` :

| | Largeur | Contenu |
|---|---|---|
| Avant toute création | colonne 40 rem centrée | Titre, composeur, suggestions |
| Premier tour | colonne 40 rem centrée | Attente plein cadre (rien à montrer à côté) |
| Après | **pleine largeur**, `minmax(0,1fr)` × 2 | Conversation à gauche, aperçu vivant à droite — **deux moitiés strictes** |

Les colonnes ont d'abord été inégales (`0.82fr / 1.3fr`, « c'est le résultat qu'on
regarde ») ; Raf a tranché pour **50/50** le 2026-08-08 : on passe autant de temps à
écrire qu'à regarder, et deux colonnes inégales font hésiter l'œil sur la principale.
Le plafond de largeur global a sauté avec — « la moitié de l'écran » veut dire l'écran.
Seule la **longueur de ligne** du texte reste plafonnée (42 rem) : invisible à 1440 px,
elle évite des lignes de 180 caractères sur un écran large.

⚠️ Sur la grille : `align-self: stretch` et `grid-template-rows: minmax(0, 1fr)`, **jamais**
`height: 100%` — le parent est un conteneur flex dont la hauteur vient de `flex: 1`, elle
n'est pas « définie » au sens des pourcentages, et la grille retombe alors sur la hauteur de
son contenu. Sans le `minmax(0, …)`, le fil de conversation fait grandir la rangée au lieu
de défiler.

**Direction : Apple (HIG).** Refonte complète après un retour de Raf — le premier jet
appliquait une doctrine « aucun dégradé, aucune ombre portée, aucune lueur » qui avait
produit une interface **non dessinée** (champ souligné d'un trait, suggestions en liens
soulignés). Apple repose au contraire sur des **surfaces**, des ombres douces, des rayons
continus et un tracking négatif. Densité prioritaire sur le confort de lecture (arbitrage
de Raf) : base **15 px**. Conservés parce qu'Apple les impose aussi : focus clavier visible,
`prefers-reduced-motion`.

**Tokens** (`--sr-*`, portés par `.serein` — jamais globaux, l'atelier sombre partage le document) :

| Token | Valeur | Usage |
|---|---|---|
| `--sr-fond` / `--sr-surface` | `#f5f5f7` / `#ffffff` | Page (+ halo radial très faible) / cartes |
| `--sr-encre` / `-2` / `-3` | `#1d1d1f` / `#4a4a4f` / `#6e6e73` | Texte principal / secondaire / tertiaire |
| `--sr-trait` / `--sr-trait-doux` | `#d2d2d7` / `#e8e8ed` | Bordures / séparateurs internes |
| `--sr-mangue` / `--sr-mangue-encre` | `#f57c1f` / `#b4520a` | Accent **unique** (anneau, icônes, barre) / accent **en texte** (5,4:1) |
| `--sr-vert` / `--sr-rouge` | `#0f7a45` / `#b3261e` | « C'est prêt » / échec (ton sourd, jamais un rouge d'alerte) |
| `--sr-r-controle` / `-fenetre` / `-carte` / `-pilule` | 12 / 16 / 20 / 980 px | Échelle de rayons |
| `--sr-ombre-1` / `-2` / `-3` | — | Profondeur à **deux étages** (contact court + diffusion longue) |
| `--sr-ease` | `cubic-bezier(.32,.72,0,1)` | Courbe de sortie Apple |

**Règles non négociables de cette surface :**
- L'accent mangue ne remplit **jamais** un grand aplat, et ne sert jamais de texte sur blanc
  (2,9:1) — c'est `--sr-mangue-encre` qui le fait. L'action principale est **encre**, pas accent.
- Le composeur ne porte **pas** d'anneau coloré au focus : le champ est focalisé au montage,
  et un `<textarea>` focalisé satisfait toujours `:focus-visible` — l'anneau resterait allumé
  en permanence et se lirait comme une erreur.
- `dire.js` reste la **seule frontière de vocabulaire** : aucune chaîne rendue ne contient de
  mot d'informaticien — y compris le nom de dossier (`site-pour-montrer-mes`), qui ne s'affiche
  jamais : la fenêtre d'aperçu porte la **demande**. Les réponses écrites de l'agent passent par
  `nettoyerReponse()` (chemins → « la page », blocs de code retirés) ; ce que ça ne couvre pas
  est écrit dans `limites.md` **L143**.
- La réponse de Mango s'affiche **sans bulle** — une marque et du texte. Deux bulles face à face
  feraient une messagerie ; il n'y a qu'une personne et un outil.
- Aucun réglage ne revient avec la conversation : ni modèle, ni mode, ni jauge, ni compteur.
  C'est ce qui sépare cette surface de l'atelier.

**Contrôle visuel obligatoire** avant de dire « fait » : Playwright en `channel: 'chrome'`
(navigateur déjà installé, aucun téléchargement) ; les états `travail`/`pret`/`echec` se
photographient en stubant `/api/chat` avec un flux SSE fabriqué — vrai composant, vrai
parseur, zéro appel modèle.

---

## Stack UI (atelier)
- **Tailwind CSS v4** (plugin `@tailwindcss/vite`, tokens dans `@theme` de `ui/src/index.css`)
- **lucide-react** pour les icônes (plus d'emojis dans l'UI, sauf le logo 🥭)
- **react-markdown** pour le rendu des réponses de l'agent

## Écrans
### Home (`ui/src/components/Home.jsx`)
Hero centré avec halo violet (`.hero-glow`) : logo, tagline « Décris ton idée, on la construit », grande carte prompt (textarea + nom de projet auto-slugifié + bouton ✦), cartes templates (Vierge/Vitrine/E-commerce/Dashboard/Blog), suggestions cliquables, grille « Projets récents ».

### Workspace
Header épuré + deux colonnes :
- **Gauche (40 %, min 360px)** : chat (`ui/src/Chat.jsx`)
- **Droite (60 %)** : aperçu live (`ui/src/Preview.jsx`)

## Palette (thème sombre premium violet)
Tokens Tailwind (`@theme` → classes `bg-*`, `text-*`, `border-*`) :
| Token | Couleur | Usage |
|---|---|---|
| `bg` | `#0b0d12` | Fond principal |
| `panel` | `#12141c` | Panneaux (chat, header) |
| `raised` | `#1a1d28` | Surfaces flottantes (menus, toasts, modal) |
| `edge` / `edge-soft` | `#232734` / `#1c202c` | Bordures |
| `ink` | `#e8eaf0` | Texte principal |
| `dim` / `faint` | `#8b91a3` / `#565c6e` | Texte secondaire / tertiaire |
| `accent` / `accent-soft` | `#7c5cff` / `#9678ff` | Accent violet |
| `bubble` | `#1f2330` | Bulle utilisateur |
| `ok` / `err` | `#3ecf8e` / `#ff5c5c` | Succès / erreur |

## Typographie
- UI : `Inter` (Google Fonts, chargée dans `ui/index.html`)
- Code / outils / URLs : `JetBrains Mono`

## Composants (`ui/src/components/`)
- **Header.jsx** : logo cliquable (retour Home), nom du projet, lien site publié, dropdown modèle (Zap/Gauge/Brain), dropdown versions (rollback), bouton zip, bouton Publier (violet, Rocket), coût session
- **Dropdown.jsx** : menu custom remplaçant les `<select>` natifs (fermeture au clic extérieur, `DropdownItem` avec icône/label/hint/actif)
- **ToolGroup.jsx** : actions de l'agent regroupées en bloc repliable « N actions » ; replié, il affiche la dernière action en cours ; sait parser les entrées d'historique (`"📄 Write src/App.tsx"`) comme les événements SSE live (`{name, detail}`)
- **Toast.jsx** : pile de toasts bas-droite (succès/erreur, lien optionnel, auto-dismiss 8 s) — remplace `alert()`
- **ConfirmModal.jsx** : modal de confirmation (rollback) — remplace `confirm()`
- **Home.jsx** : écran d'accueil (voir plus haut)

## Chat
- Bulles utilisateur à droite (fond `bubble`), réponses agent à gauche avec label « ✦ MangoOS » et rendu **markdown** (styles `.md` dans index.css)
- Lignes outils regroupées en `ToolGroup` repliable
- Pendant la génération : texte « MangoOS travaille… » avec shimmer violet (`.shimmer-text`)
- Input : carte arrondie, textarea auto-grow (max 160px), bouton envoyer ↑ / stop ■, Entrée pour envoyer
- État vide : icône Sparkles + invitation

## Preview
- Barre style navigateur : point d'état (vert lumineux = serveur OK), pilule URL mono, toggle desktop/mobile (mobile = iframe 390px centrée), bouton recharger, ouvrir ↗
- Iframe encadrée : coins arrondis, bordure, ombre portée
- Bandeau d'erreurs runtime (relay) + bouton « Corriger » conservés

## Animations (keyframes dans `@theme`)
- `fade-up` : apparition des messages et sections Home
- `pop` : menus, toasts, modal
- `shimmer` : indicateur de génération
- Scrollbars fines stylées (`.nice-scroll`)

## UX
- L'aperçu se met à jour seul via le HMR de Vite (pas de reload manuel nécessaire)
- Erreurs agent affichées en rouge dans le chat, jamais silencieuses
- Déploiement : toast de succès avec lien + pilule verte dans le header
