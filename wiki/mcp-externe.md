---
type: entité
tags: [mcp, outils, blender, gimp, inkscape, phase-3b]
statut: chaînon livré (gaté OFF, testé serveur simulé) ; pilotage réel à prouver
sources: [statut, limites, "mcp-external.ts", kernel]
maj: 2026-06-29
---

# MCP externe

Loader de serveurs **MCP externes** (process/stdio) qui expose leurs outils dans la `ToolRegistry` de l'Élève — le chaînon manquant entre outils **hardcodés** et **découverte dynamique**.

## Rôle
L'adaptateur `toMcpServer`/`toOpenAITools` ([[kernel]]) existait, mais seul `visionServer` (in-process) était branché — aucun serveur MCP externe. Ce module connecte des serveurs déclarés et **publie leurs outils** à l'Élève. Cibles : **Blender** (modéliser/rendre/exporter glTF → assets pour le jeu Unity, synergie avec [[domaines-unity]]), **GIMP/Inkscape** (logos, icônes, retouche). **Phase 3b** du grand plan.

## Détails clés
- **`mcp-external.ts`** : client **JSON-RPC stdio maison** (zéro nouvelle dépendance), transport injectable (`McpTransport`) → testable avec un serveur simulé en mémoire. Handshake `initialize` → `notifications/initialized` → `tools/list` → `tools/call`.
- **JSON Schema → Zod** (`mcpSchemaToShape`/`jsonSchemaPropToZod`) : convertit le schéma d'un outil MCP en `ZodRawShape` pour respecter le contrat de `ToolRegistry` (sinon `z.object(shape).parse` stripperait les args).
- **Pont** `mcpToolToKernel(serverId, client, descriptor)` : nom **préfixé par serveur** (`blender__make_cube`, anti-collision) + sortie **`sanitizeExternal`** (lue comme DONNÉE, anti prompt-injection) ; ne lève jamais.
- **Config déclarative** `data/mcp-servers.json` : Blender + GIMP + Inkscape, **`enabled:false`** par défaut (rien ne tourne sans activation explicite).
- **Wiring** : `loadExternalMcpTools` (gate `ELEVE_MCP_EXTERNAL=on`, serveur HS sauté sans bloquer les autres) pré-chargé une fois dans `eleve.ts` (`ensureExternalMcpLoaded`) → `setExternalMcpTools` → enregistré synchroniquement par `buildEleveActionTools`.
- **Sécurité** : gaté OFF par défaut · déclaratif (pas d'auto-découverte) · sorties neutralisées · transport réel `stdioTransport` (newline-delimited JSON).
- **Tests** : `test-mcp-external` 19/19 (parsing, schéma→Zod, handshake, callTool, erreur/timeout, args préservés via ToolRegistry, serveur HS sauté).

## Limites
- [[limites|L59]] — **non prouvé live** : aucun serveur Blender/GIMP/Inkscape MCP installé. Loader+client+pont testés avec serveur simulé ; pilotage réel à valider une fois un vrai serveur branché.

## Liens
[[kernel]] · [[domaines-unity]] · [[transmission-competences]] · [[statut]] · [[limites]]

## Sources
`server/src/mcp-external.ts`, `server/data/mcp-servers.json`, `eleve-action-tools.ts`, `eleve.ts` · statut.md (2026-06-29 ba) · limites.md L59
