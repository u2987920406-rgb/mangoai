---
type: entite
tags: [architecture, agents, ollama, specialisation, souverainete, pdf, rag]
statut: actif
sources: [statut, historique]
maj: 2026-06-22
---

# Agents Spécialisés Locaux

> Constellation d'agents Gemma **spécialisés par domaine** — UX/UI, Layout CSS, PDF — tournant à $0 via Ollama, avec Claude en escalade minimale. Livré au **#145** (2026-06-22, les 3 chantiers).

## Rôle

Passer d'un seul [[eleve-local]] généraliste à une constellation de spécialistes locaux. Motivation : **souveraineté** (si Anthropic coupe l'accès sur pression gouvernementale, MangoOS tourne sans eux) + **prix** (petits abonnements locaux ou chinois à $0). Mécanisme d'entraînement identique à l'Élève : accumulation d'axiomes par domaine via la boucle relay — pas de LoRA, pas de fine-tuning.

## Architecture

### ModelProfile

Chaque spécialiste est un `ModelProfile` (`server/src/models/profile.ts`) :

```typescript
interface ModelProfile {
  id: string;
  matches: (model: string) => boolean;
  system: string;           // prompt système spécialisé
  axiomFiles: string[];     // [".axioms.md", ".axioms.uxui.md"]
  escalateAppendix: string; // redirige Claude vers le bon fichier
  caps: { axiomCap, fileBudget, fileMax, maxAttempts };
}
```

- **WRITE-ONLY regime** : les spécialistes émettent `<write>` uniquement (jamais `<edit>` → évite les échecs find/replace sur fichiers larges).
- **Partitionnement des axiomes** : `escalateAppendix` instruit Claude d'écrire les axiomes UX/shadcn dans `.axioms.uxui.md`, les axiomes Grid/Flex dans `.axioms.layout.md` → chaque spécialiste apprend dans son propre fichier, sans parasitage.

### Relay paramétrable

`RelayOptions` accepte désormais deux champs optionnels :
- `profile?: ModelProfile` — surcharge le profil pour CET appel
- `eleveModel?: string` — surcharge le modèle Ollama pour cet appel

`runRelay()` résout les caps **localement** (non plus au niveau module) → chaque appel est indépendant. Quand `eleveModel !== ELEVE_MODEL`, `deps.askEleve` est enveloppé pour router vers le bon modèle Ollama.

## Spécialistes livrés

### Agent UX/UI (`server/src/models/uxui.ts`)

- Domaine : React components, shadcn/Radix, accessibilité WCAG, micro-interactions
- Axiomes : `.axioms.md` (général) + `.axioms.uxui.md` (spécialisé)
- Variables d'env : `UXUI_AGENT_MODEL` (fallback `ELEVE_MODEL`)
- Mode UI : sélecteur "Agent UX/UI" (icône Layers)

### Agent Layout (`server/src/models/layout.ts`)

- Domaine : CSS Grid, Flexbox, Container Queries, responsive design
- Axiomes : `.axioms.md` (général) + `.axioms.layout.md` (spécialisé)
- Variables d'env : `LAYOUT_AGENT_MODEL` (fallback `ELEVE_MODEL`)
- Mode UI : sélecteur "Agent Layout" (icône LayoutGrid)

### Agent PDF (`server/src/pdf-pipeline.ts` + `pdf-routes.ts`)

Pipeline document indépendant, 100 % local : extraction `pdfjs-dist` (pur JS, build legacy Node, **import dynamique** → les tests n'en dépendent pas) → `chunkPages` (split paragraphes + re-split au-delà de 800 chars, garde `pageNum`/`charStart` pour le sourcing) → embedding Ollama (`nomic-embed-text`, best-effort) → [[blackboard]] SQLite **dédié** (`data/pdf-store.db`, isolé des artefacts design du Kernel).

- `queryPdf` — RAG : récupération sémantique (cosinus) ou **repli mots-clés** déterministe → synthèse Gemma locale + sources avec n° de page
- `extractStructuredFromPdf` — JSON structuré (`parseJsonLoose` tolère les fences markdown)
- Routes : `POST /api/pdf/upload` (multer disque 50 Mo) · `POST /:docId/query` · `POST /:docId/extract` · `GET /api/pdf` · `DELETE /:docId` ; câblées async best-effort dans `index.ts`
- Tout injectable (`PdfDeps`) → `test-pdf-pipeline.ts` **34/34** sans réseau ni PDF réel ; extracteur `pdfjs-dist` prouvé sur un vrai PDF
- Env : `PDF_AGENT_MODEL` (fallback modèle Ollama par défaut)

**Reste optionnel** : surface UI (fenêtre PDF dans le [[bureau-os]]).

## Liens

Repose sur [[eleve-local]] (boucle relay) · stocke les axiomes via [[memoire-expertise]] · base PDF vers [[blackboard]] · connexe [[kernel]] (Brain Adapter #108, Ollama/LiteLLM).

## Sources

[[statut]] #145 · [[historique]] session 2026-06-22.
