# Atelier de Mango — journal des chantiers d'auto-amélioration

> Trace des chantiers lancés dans **Réglages › Intelligence › Atelier de Mango**.
> Rappel du mécanisme : Mango améliore son PROPRE code dans une **copie isolée**
> (git worktree sous `D:\IA\.mango-self\`), s'auto-vérifie (`tsc` + tests en bac à
> sable), puis **Raf relit le diff** et décide **Fusionner** / **Jeter**.
>
> But de ce fichier : garder une mémoire de ce que Raf a demandé, ce que Mango a
> produit, et le verdict — pour repérer les patterns (bon périmètre vs surface
> exposée) et les leçons. Mis à jour à chaque chantier observé.

## Le bon périmètre (leçon transverse)

L'auto-amélioration **excelle** sur le **borné + interne + sans effet de bord** :
une fonction utilitaire, un **outil de l'Élève confiné**, un test manquant. Là,
« `tsc` + tests verts » EST un critère de réussite suffisant.

Elle est **risquée** sur tout ce qui crée une **surface** — routes HTTP, accès
système, réseau, secrets, permissions : `tsc`+tests verts **ne voient pas** une
faille d'exposition. → C'est **Raf qui relit le diff** qui sert de filet.
Piste ouverte : un **juge de sécurité** (cerveau fort, pas GLM) qui relit le diff
d'auto-amélioration et lève « surface exposée / secret lisible / bind large »
AVANT de présenter le résultat. Voir [[limites]].

**✅ Fiabilisation livrée (2026-07-02)** — vérification de CLÔTURE honnête. Avant, le badge
« type-check ✓ / tests ✓ » de l'Atelier signifiait juste « l'Élève a APPELÉ l'outil » (un
`check_types` vert appelé AVANT d'écrire un test cassé suffisait) → un chantier « vert »
pouvait casser le repo à la fusion (cas `lire_image`). Désormais `verifySelfClosure`
(`mango-self.ts`) lance, sur l'état FINAL du worktree, le **VRAI `tsc --noEmit`** (le même
contrôle que le repo) **+ exécute les `test-*.ts` modifiés** en bac à sable ; `self-routes.ts`
fait pointer les badges dessus et l'UI (`AtelierMango.jsx`) affiche **vert ✓ / rouge ✗ /
non-vérifié —** + un **bandeau d'avertissement détaillé** (erreurs tsc + tests en échec)
AVANT le bouton Fusionner. « Vert » veut enfin dire « le repo restera vert ». test-mango-self
+9 (verifySelfClosure).

## Journal (le plus récent en haut)

### 2026-07-02 — « peut apprendre à lire les .png » → outil `lire_image` ✅ FUSIONNÉ
- **Demande de Raf** : apprendre à lire les fichiers `.png`.
- **Produit** (worktree `peut-apprendre-a-lire-les-p-mr2q7zzn`) :
  - `server/src/eleve-image-tools.ts` (nouveau) — KernelTool **`lire_image`** : lit une
    image du projet (PNG/JPEG/WebP/GIF) → cerveau `vision` (VL via Brain-Dispatch #150)
    → **description texte** (structure, couleurs hex, typo, layout) pour GLM non-multimodal.
  - `server/src/eleve-action-tools.ts` (modifié) — branché sous le gate `ELEVE_VISION=on`.
  - `server/src/test-eleve-image-tools.ts` (nouveau) — 7 scénarios (happy path, path vide,
    hors projet, format, inexistant, VL dégradé, objectif défaut).
- **Verdict** : ✅ **FUSIONNÉ par Raf** — **bon périmètre** : outil **INTERNE** de l'Élève,
  **confiné** au projet (anti path-traversal correct `abs.startsWith(root + path.sep)`),
  **gaté** `ELEVE_VISION=on`, cap 4 Mo, deps injectées + import lazy (astuce sandbox comprise).
  Vraie transmission de compétence (cf. `vois_ecran` #151).
- **2 défauts corrigés APRÈS fusion** (le repo n'était plus vert) : (1) le test référençait
  le type `AgentResult` **sans l'importer** → `tsc` cassé (2 erreurs) → mock simplifié en
  `{status, summary}` (= `DispatchResult`) ; (2) le test [7] cherchait `/description/` alors
  que le code produit « **Décris** cette image » → assertion fausse, corrigée en `/décris/` ;
  + indentation du branchement alignée. **Après correctifs** : `tsc` 0 · **test-eleve-image-tools
  20/0** · non-régr. eleve-runtime 49/0.
- **Leçon** : le **bac à sable de l'auto-amélioration ne reproduit pas le `tsc --noEmit` strict
  du repo** (esbuild transpile en **ignorant les annotations de type**, et les assertions de
  test faussées passent) → un chantier « vert » dans le worktree peut **casser le repo à la
  fusion**. Vérifier `tsc` + tests du repo **APRÈS chaque fusion** reste nécessaire, même sur
  un bon chantier. **✅ Corrigé à la source (2026-07-02)** : la **vérif de clôture**
  (`verifySelfClosure`) fait désormais tourner le vrai `tsc --noEmit` + les `test-*.ts`
  modifiés sur l'état final, et les badges de l'Atelier sont **honnêtes** (rouge + détail si
  le repo casserait). Voir la section « Fiabilisation livrée » en haut.

### 2026-07-02 — « intègre l'accès à mon PC » → routes HTTP `/api/pc/*` 🗑️ JETÉ
- **Demande de Raf** : pouvoir avoir accès à mon PC.
- **Produit** (worktree `peut-tu-integrer-le-fait-de-mr2pp12r`, jeté) :
  `pc-access-routes.ts` (3 routes GET `info`/`list`/`read` lisant le système de fichiers),
  branché dans `index.ts`, + `test-pc-access.ts`.
- **Verdict** : 🗑️ **JETÉ — faille de sécurité critique**. Routes montées sur le serveur
  `HOST=0.0.0.0` (tout le LAN) + `app.use(cors())` **ouvert** (n'importe quel site web ouvert
  dans le navigateur peut LIRE la réponse) ; racine par défaut = **`C:\` entier** ; `.env`
  dans les extensions lisibles ; **aucun jeton d'auth** ; secrets en query string. → un onglet
  malveillant pouvait lire `.credentials` / clés API. `tsc`+tests **verts** (le bac à sable ne
  voit pas l'exposition — d'où l'importance de la relecture humaine). **Leçon** : ne pas confier
  à l'auto-amélioration ce qui crée une surface réseau sans juge de sécurité.

### 2026-07-02 — « améliore-toi, essaye de trouver… » → (vide) ⚪ AVORTÉ
- **Produit** (worktree `am-liore-toi-essaye-de-trou-mqxz165k`) : aucun fichier
  (chantier avorté / sans diff).
- **Verdict** : rien à fusionner.

## Tableau récap

| Date | Demande (résumé) | Produit | tsc / tests | Verdict | Modèle optimal | Effort |
|---|---|---|---|---|---|---|
| 2026-07-02 | lire les `.png` | outil `lire_image` (interne, gaté) | ✅ après 2 correctifs (tsc 0 · 20/0) | ✅ Fusionné | — | — |
| 2026-07-02 | accès à mon PC | routes HTTP `/api/pc/*` | ✓ (mais faille non vue) | 🗑️ Jeté (sécurité) | — | — |
| 2026-07-02 | « essaye de trouver… » | — | — | ⚪ Avorté | — | — |

## Comment mettre à jour ce fichier

À chaque chantier lancé dans l'Atelier : ajouter une entrée en tête du Journal
(date · demande · worktree + fichiers produits · verdict + réserve/leçon) et une
ligne au tableau récap. Verdict = ⏳ En attente · ✅ Fusionné · 🗑️ Jeté · ⚪ Avorté.
