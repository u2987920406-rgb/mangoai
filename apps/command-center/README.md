# Mango Command Center 🥭

Le **poste de pilotage** de toutes les idées et chantiers de MangoOS (#13 → #143). Un Kanban
local-first, taillé au goût Apple/mangue de Raf, qui sert aussi de **prototype vivant du Kanban
de #139** et d'un premier pas vers le **vault #141**.

> Outil **personnel** : l'ADN visuel MangoOS (tons mangue + violet, style Apple translucide)
> s'applique ici — ce n'est pas une app client générée.

## Lancer

```bash
cd D:\IA\MangoOS\apps\command-center
npm install      # une seule fois
npm run dev      # → http://localhost:5180
```

Build de production : `npm run build` (tsc strict + vite). Aperçu du build : `npm run preview`.

> Port dédié **5180** — il ne touche pas aux ports de MangoOS (backend 3000 · UI 5173 · app générée 5174).

## Ce que ça fait

### Board
- **4 colonnes** : Idées · En cours · Bloqué · Fait. Compteur + somme d'effort (Σ) par colonne.
- **Cartes soignées** : badge `#id`, titre, **badge modèle** (⚡ Haiku / ⚖️ Sonnet / 🧠 Opus),
  **chip effort** (XS→XL, gradient cyan→rouge + liseré gauche), tags et dépendances `#`-cliquables,
  notes tronquées, date relative.
- **Déplacer une carte** : boutons **← / →** ou **glisser-déposer** natif entre colonnes.
- **Survol d'une carte** = met en évidence ses **dépendances** (bleu) et ce qu'elle **débloque** (vert).

### Intelligence (le pilote, pas juste un tableau)
- **🚀 Prêt à démarrer** : les idées en statut *Idée* dont **toutes les dépendances sont faites** —
  voilà ce que tu peux attaquer maintenant, quick-wins d'abord (tri par effort croissant). `⛓ N` =
  combien d'autres idées cette carte débloque.
- **🕑 Activité récente** : chaque changement de statut est journalisé (la donnée qui compounde).
- **Tri** par # · effort · modèle · date de mise à jour.

### Données & confort
- **Recherche** (titre / notes / tags / #) + **filtres** modèle / effort / tag + bouton *Filtres* pour
  réinitialiser.
- **En-tête stats** : total, avancement %, répartition par colonne, par modèle, histogramme d'effort.
- **Export / Import JSON** (sauvegarde + portabilité) et **⟲ Seed** (revenir au jeu de cartes d'origine).
- **Raccourcis** : `N` = nouvelle idée · `/` = focus recherche · `Échap` = fermer le modal.

## Données

Tout vit dans le **localStorage** du navigateur :
- `mango.command-center.v1` — les cartes.
- `mango.command-center.history.v1` — le journal de statut.

Au **premier lancement**, le board est amorcé depuis `src/seed.ts` (≈ 38 cartes réelles extraites de
`statut.md`). Ensuite, l'outil est à toi : ajoute, déplace, complète — c'est tout l'intérêt.

Un import accepte soit un export complet de l'app, soit un simple tableau d'`Idea[]`. Les entrées
invalides sont filtrées silencieusement (un stockage corrompu ne plante jamais l'app).

## Structure

```
src/
├── types.ts            modèle de données + référentiels (statut, modèle, effort)
├── seed.ts             ~38 cartes réelles (depuis statut.md)
├── storage.ts          load/save localStorage + journal + export/import/reset
├── lib.ts              dates relatives, tri, parsing CSV/deps, readyToStart, unlocks
├── App.tsx             état, raccourcis, filtres, mutations
└── components/
    ├── Board.tsx       les 4 colonnes
    ├── Column.tsx      une colonne + drag&drop + état vide
    ├── IdeaCard.tsx    une carte (badges, actions, confirm inline)
    ├── EditModal.tsx   ajout / édition complète
    ├── Toolbar.tsx     recherche, filtres, tri, export/import
    ├── Stats.tsx       en-tête de statistiques
    ├── ReadyPanel.tsx  « Prêt à démarrer »
    └── HistoryPanel.tsx « Activité récente »
```

## Modèle de données

```ts
type Status = 'idea' | 'doing' | 'blocked' | 'done'
type ModelTier = 'haiku' | 'sonnet' | 'opus' | 'none'   // ⚡ / ⚖️ / 🧠 / —
type Effort = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'none'
interface Idea {
  id: number; title: string; status: Status
  model: ModelTier; effort: Effort
  tags: string[]; deps: number[]; notes: string
  updatedAt: number
}
```

## Étendre

- **Nouvelle carte** : bouton `＋ Nouvelle idée` (ou `N`). Le `#` est attribué automatiquement
  (`max(id)+1`), mais tu peux le laisser tel quel — l'outil gère n'importe quel numéro.
- **Dépendances** : saisis les `#` séparés par des virgules dans le modal. La carte apparaît alors
  dans « Prêt à démarrer » dès que toutes ses dépendances passent en *Fait*.
- **Re-seeder après une refonte du tableau** : édite `src/seed.ts` puis clique **⟲ Seed**.

---

Construit en **Vite + React 19 + TypeScript strict**, CSS écrit à la main (zéro Tailwind),
glassmorphism mangue/violet, **aucun backend**. 🥭
