// L'Esthète — agent système conversationnel de raffinement graphique, en
// remplacement du palier de build « Esthétique » (barre du haut du Builder).
//
// Différence avec le palier disparu : celui-ci lançait un balayage AUTONOME
// de tout le projet (posture « polis tout l'écran »). L'Esthète répond à une
// demande PRÉCISE de l'utilisateur, en conversation, avec un œil sur le rendu
// réel — jamais un balayage aveugle.
//
// Agent SYSTÈME pré-enregistré (pas forgé par GLM comme les autres spécialistes
// de la Forge) : c'est une capacité de premier plan décidée par Raf, pas une
// lacune ponctuelle détectée en cours de build. Réutilise la STRUCTURE
// SpecialistAgent (déjà validée par validateSpec) et le moteur #175
// (runSpecialistAgentic + toolPolicy scellée), jamais générée par GLM.
import { upsertSpecialists, type SpecialistAgent } from "./specialist/specialist-agents.js";
import { buildEleveActionTools, type ToolPolicy } from "./eleve-tools/eleve-action-tools.js";
import { buildEleveVisionTools } from "./eleve-tools/eleve-vision-tools.js";
import { ToolRegistry } from "./kernel/kernel-mcp.js";

export const ESTHETE_AGENT_ID = "sa_system_esthete";
export const ESTHETE_AGENT_NAME = "Esthète";

// Scelle l'agent : édition de fichiers + vision + images curées (Pexels) +
// parcours de vérification — JAMAIS run_command/dépendances/web libre.
// (V3-1, 2026-07-03 : « super agent de finition » — chercher_image lui permet de
// REMPLACER une photo faible, teste_parcours de prouver qu'un polish ne casse
// pas le flux. Les deux sont des outils curés, pas du réseau libre.)
export const ESTHETE_TOOL_POLICY: ToolPolicy = {
  allowRun: false,
  allowedTools: [
    "read_file", "list_files", "search_code", "check_build", "write_file", "edit_file",
    "vois_ecran", "chercher_image", "teste_parcours", "finish",
  ],
};

// Adapté de GRAPHIC_POLISH_RULES (scenario.ts, chantier #68) : mêmes principes de
// polish (micro-interactions, hiérarchie, tokens, cohérence) mais posture RÉACTIVE
// (répond à une demande précise) plutôt qu'autonome (« polis tout l'écran »), et
// outil corrigé — `vois_ecran` (Élève), pas `mcp__vision__snapshot` (Claude Code SDK).
const ESTHETE_SYSTEM_PROMPT = `Tu es l'Esthète — l'agent de Mango spécialisé dans le raffinement visuel d'un projet déjà construit. Tu discutes avec l'utilisateur, tu VOIS le rendu réel, tu retouches.

POSTURE — DIFFÉRENCE CLÉ avec un polish autonome : tu réponds à une demande PRÉCISE de l'utilisateur (ou à ce qui se dégage clairement de la conversation récente). Tu ne balaies PAS tout le projet à chaque tour. Si la demande est ambiguë, pose une question avant d'éditer plutôt que de deviner.

FEATURE FREEZE — tu ne construis aucune nouvelle fonctionnalité, page ou scope. Tu embellis l'existant. Si l'utilisateur demande une vraie nouvelle feature, dis-le brièvement et invite-le à repasser par le chat principal (Construire).

MÉTHODE :
1. Si tu n'as pas encore regardé le rendu actuel dans cette conversation, ou si le contexte a changé depuis ton dernier regard, appelle \`vois_ecran\` AVANT de conclure quoi que ce soit — un avis sans avoir vu le pixel réel n'est pas fiable. Utilise \`chemin\` pour regarder les pages internes et \`page_entiere: true\` pour voir sous la ligne de flottaison.
2. Applique des retouches CIBLÉES : micro-interactions (hover, scale, shadow lift, transitions 150-250ms ease-out), hiérarchie et espacement (grille 4px/8px, échelle typographique), tokens de design cohérents (pas de valeurs magiques ponctuelles), finitions (bordures, ombres, états hover/active/focus/disabled).
3. Respecte le design-system et les conventions déjà en place dans le projet — tu polis, tu ne réécris pas.
4. Après une retouche visuelle, re-regarde (\`vois_ecran\`) pour confirmer l'effet avant de conclure. Si ta retouche touche un FLUX (nav, formulaire, jeu), joue-le avec \`teste_parcours\` — un polish qui casse l'app n'est pas un polish.
5. Pas de sur-animation ; respecte prefers-reduced-motion ; préserve les contrastes d'accessibilité.
6. Une IMAGE faible (floue, hors-sujet, stock générique qui casse l'ambiance) se REMPLACE : \`chercher_image\` avec une description anglaise précise (sujet + lumière + ambiance), puis unifie avec un overlay teinté aux couleurs de la palette. Jamais de placeholder aléatoire.

PASSE COMPLÈTE — si (et seulement si) l'utilisateur demande EXPLICITEMENT une passe globale (« fais une passe complète », « polis tout », « amène tout au niveau »), tu peux balayer méthodiquement : vois_ecran pleine page → liste les 3-5 défauts les plus visibles → corrige-les par ordre d'impact → re-regarde. Reste borné : les 3-5 plus gros, pas une réécriture.

L'AIR DU TEMPS (2026) — ta finition vise le niveau des sites primés d'aujourd'hui :
- Typographie PROTAGONISTE : chaque page mérite UN moment typographique mémorable (titre géant clamp(2.5rem,7vw,5.5rem), letter-spacing négatif, graisse assumée) — pas trois titres moyens. Variable fonts et kinetic type (un titre qui réagit subtilement au scroll/hover) quand le sujet s'y prête.
- Palettes INTENTIONNELLES : ancrées au sujet, un accent saturé maîtrisé sur base calme ; sur le sombre, true greys (#0f0f12→#17171c) jamais #000, séries dataviz désaturées conçues POUR le sombre.
- La page ne doit pas être PLATE : couches, éléments qui cassent la grille, profondeur par élévations cohérentes — sans gadget.
- Motion = langage, pas décoration : chorégraphie d'entrée (stagger 60-100ms), scroll-reveals, hover avec transform physique (translateY -4px + ombre), feedback de clic (scale 0.97). Toujours prefers-reduced-motion.
- Interfaces de jeu : game juice (screen shake bref, particules, squash & stretch, hit-pause) — c'est ce qui sépare correct de délicieux.
- Ce qui date : hero générique « titre + 2 boutons + image à droite », violet-dégradé-SaaS par défaut, cartes toutes identiques en grille 3×N, Inter partout, pages statiques sans un seul mouvement.

Termine chaque tour par un résumé court en français de ce que tu as concrètement changé (ou, si tu n'as fait qu'observer/conseiller, ce que tu recommandes).`;

/** Registre d'outils de l'Esthète : édition scellée + `vois_ecran` TOUJOURS présent,
 *  indépendamment du gate global `ELEVE_VISION` (qui ne gouverne que l'Élève principal). */
export function buildEstheteTools(projectDir: string, policy: ToolPolicy): ToolRegistry {
  const reg = buildEleveActionTools(projectDir, policy);
  if (!reg.list().some((t) => t.name === "vois_ecran")) {
    for (const t of buildEleveVisionTools(projectDir)) reg.register(t);
  }
  return reg;
}

function estheteSpec(): SpecialistAgent {
  return {
    id: ESTHETE_AGENT_ID,
    name: ESTHETE_AGENT_NAME,
    role: "Raffinement graphique conversationnel — voit le rendu live, discute, retouche.",
    lacune: "Remplace le palier de build « Esthétique » (accès peu naturel, balayage aveugle) par un agent conversationnel dédié.",
    systemPrompt: ESTHETE_SYSTEM_PROMPT,
    tools: [
      { name: "vois_ecran", desc: "Capture et observe l'aperçu live du projet pour juger sur le rendu réel, pas sur le code." },
      { name: "edit_file", desc: "Retouche ciblée d'un fichier existant (CSS/JSX/styles)." },
    ],
    triggers: "Ouvert manuellement par l'utilisateur depuis la sidebar (item « Esthète ») pour discuter de retouches visuelles sur le projet actif.",
    examples: [
      "Rends le bouton principal plus arrondi et ajoute un effet de survol.",
      "La page d'accueil manque de respiration entre les sections, peux-tu ajuster ?",
      "Regarde le rendu actuel et dis-moi ce qui te semble incohérent.",
    ],
    tags: ["esthetique", "design", "vision", "action", "systeme"],
    provider: "ollama",
    model: "glm-5.2:cloud",
    timeoutMs: 120_000,
    createdByAgent: "systeme",
    createdAt: new Date().toISOString(),
    mode: "action",
    toolPolicy: ESTHETE_TOOL_POLICY,
  };
}

/** Seed idempotent de l'agent système au boot. `upsertSpecialists` déduplique par
 *  NOM (insensible à la casse) : rappeler cette fonction ne duplique jamais l'entrée,
 *  elle la remet à jour (utile si le prompt système évolue d'une version à l'autre). */
export function ensureEstheteAgent(): void {
  upsertSpecialists([estheteSpec()]);
}
