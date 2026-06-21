---
type: entite
tags: [architecture, vision, design-to-code, playwright]
statut: actif
sources: [memory, statut]
maj: 2026-06-20
---

# Vision & entrées visuelles

> Tout ce qui permet à l'agent de **partir d'un visuel** : image jointe, design Figma, site live, ou un clic sur l'aperçu. Posture **native-d'abord** — éviter les MCP lourds quand l'agent voit déjà les pixels.

## Rôle

Transformer des entrées visuelles en code React/Tailwind. Plusieurs canaux, tous branchés via des outils MCP **in-process** (`createSdkMcpServer`) et gated par mode dans [[coque-souple]] (`VISION_RULES_ELITE` vs `VISION_RULES_MVP`).

## Détails clés — les canaux

- **Vision native** (`vision.ts`) : le tool Read du preset lit PNG/JPEG/PDF (≤20 pages/appel). Les entrées passent par **un fichier + chemin dans le prompt**, jamais par des blocs image du message user (un tool result se compacte, pas le message). Budget `VISION_BUDGET` (10/tour, 3 en MVP), snapshots 1280×800 JPEG q80 ≈ 1400 tokens.
- **Figma natif** (idée 25) — **PAS le MCP officiel** : `figma.ts` appelle l'**API REST** (`/v1/files/:key/nodes` + `/v1/images`) → bloc image + tokens distillés (`distillDesign`). Auth `FIGMA_TOKEN`. ⚠ variables Figma = Enterprise-only en REST.
- **Clone web** (idée 31) — `clone_url` : screenshot full-page Playwright → l'agent reproduit. Garde-fou `isCloneableUrl` (anti-SSRF : bloque localhost/IP privées).
- **Aspire web** (`scrape_url`) — rend l'**information** (titre + texte + liens) là où clone_url rend les pixels. Post-traitement pur `processScraped` (tronque 16k, dédoublonne liens). Source citée, synthèse locale.
- **Relais clic → source** (idée 5) — pont pixel→code : un tampon **Babel** stampe en DEV chaque élément JSX avec `data-mango-src="fichier:ligne"` (zéro dépendance, neutralisé en prod). Un clic sur l'aperçu → `postMessage` → précharge le composer. ⚠ `fiber._debugSource` retiré en React 19 → la solution Babel est la parade insensible aux versions.
- **Édition visuelle chirurgicale** (idée 6) — `buildVisualEditPrompt` enrichit la tâche du `fichier:ligne` EXACT + extrait + consigne d'edit chirurgical. Vérification d'effet en prod (octets avant/après → `✓ Élément modifié` / `⚠ inchangé`). Model-agnostic (Claude ou [[eleve-local]]).

## Liens

Canaux gated par [[coque-souple]] · l'édition chirurgicale s'appuie sur la même chaîne que [[eleve-local]] (#1+#5+#6) · les designs produits/références alimentent le [[blackboard]] via le Bus.

## Sources

[[memory]] (vision, Figma #25, clone #31, scrape, clicksource #5, édition #6) · [[statut]].
