// Routes d'ACCUEIL (chat d'accueil conversationnel, brouillons, graduation vers
// l'atelier) + le flag home-quick-model — extraites verbatim de index.ts
// (comportement inchangé). HOME_BRAIN_NAMES (const de scope module d'index.ts,
// capturée par le handler home-chat) est déplacée ici à l'identique. Les import()
// dynamiques ./llm-engine.js deviennent ../llm-engine.js (fichier descendu d'un cran).
import express from "express";
import path from "node:path";
import fs from "node:fs";
import { flag } from "../flags.js";
import { temporalContext } from "../temporal-context.js";
import { ELEVE_PROVIDER, askEleveAgentic, chatEleve, supportsTools } from "../eleve.js";
import { ELEVE_MODEL } from "../eleve/provider.js";
import { buildEleveDiscussTools } from "../eleve-tools/eleve-action-tools.js";
import { FIDELITY_CLAUSE } from "../scenario.js";
import { brainArchitectureClause } from "../capabilities.js";
import { selfKnowledgePromptSection } from "../self-knowledge.js";
import { WORKSPACE_DIR } from "../projects.js";
import { requiredCapabilities, toolDemandSignal } from "../intent-capabilities.js";
import { runFrontierOrchestration } from "../frontier-orchestration.js";
import { brain } from "../brain.js";
import { getBrain } from "../brain/brain-registry.js";
import { ensureHomeScratch, cleanHomeScratch, graduateHomeScratch, detectsBuildIntent } from "../home-scratch.js";
import { clearInterrupt } from "../interrupt.js";
import { saveUpload } from "../uploads.js";

// Noms HUMAINS des cerveaux non-Élève sélectionnables à l'Accueil (#182 D3 — divulgation).
const HOME_BRAIN_NAMES: Record<string, string> = {
  fable: "Fable", sonnet: "Sonnet", opus: "Opus", haiku: "Haiku",
};

export function registerHomeRoutes(app: express.Express): void {

// #182 D3/É5 suite — expose le gate HOME_QUICK_MODEL au client (aucune route
// générique /api/flags n'existe déjà ; on en ajoute une isolée, minimale).
app.get("/api/flags/home-quick-model", (_req, res) => {
  res.json({ enabled: flag("HOME_QUICK_MODEL") });
});

// ── Chat d'accueil — conversation directe avec MangoOS (sans projectName) ──
app.post("/api/home-chat", async (req, res) => {
  const { messages, model, convId } = req.body as {
    messages?: Array<{ role: string; content: string }>;
    model?: string;
    convId?: string; // brouillon de la conversation d'accueil (disque + outils)
  };
  if (!messages?.length) {
    res.status(400).json({ error: "messages required" });
    return;
  }
  // Chaque tour d'accueil repart d'un drapeau d'arrêt PROPRE — même règle que /api/chat.
  // Sans ça, un seul « Stop » (drapeau module de interrupt.ts) rendait TOUTES les
  // discussions d'accueil suivantes muettes (« ⏹ Arrêté à ta demande »). Bug débusqué
  // en montant l'Accueil conversationnel du shell 2.0 (2026-07-02).
  clearInterrupt();
  const MODEL_MAP: Record<string, string> = {
    fable:  "claude-fable-5",              // Fable 5 — le plus capable (via abonnement, cf. llm-engine)
    sonnet: "claude-sonnet-4-6",
    opus:   "claude-opus-4-8",
    haiku:  "claude-haiku-4-5-20251001",
  };
  const resolvedModel = MODEL_MAP[model ?? "sonnet"] ?? "claude-sonnet-4-6";
  const last = messages[messages.length - 1];
  const history = messages
    .slice(0, -1)
    .map((m) => `${m.role === "user" ? "Humain" : "MangoOS"} : ${m.content}`)
    .join("\n");

  // Mango propose-t-il de passer à l'atelier ? (intention de CONSTRUIRE détectée)
  const suggestGraduate = detectsBuildIntent(last?.content ?? "");

  try {
    // ── ÉLÈVE (GLM) → home AGENTIQUE : la page d'accueil « peut tout faire dès le départ ».
    // Le brouillon `convId` donne un disque (.assets) ; l'Élève reçoit les outils de LECTURE
    // (read/list/search + web + lire_document + lire_archive + requete_web GET) — PAS d'écriture
    // ni de build (c'est Raf qui valide la graduation vers l'atelier). Repli chatEleve sans outils.
    // (2026-07-12) Ollama local est désormais aussi outillable (E4, askEleveAgentic) —
    // avant, seul openai-compat déclenchait cette branche : l'Accueil en Élève 100 %
    // local (ex. Qwythos) tombait toujours en repli texte pur, sans jamais pouvoir
    // réellement appeler un outil (regarde_site_web, chercher_web, vois_ecran…).
    if (model === "eleve" && supportsTools(ELEVE_PROVIDER) && convId) {
      const scratch = ensureHomeScratch(convId);
      const sys = [
        flag("TEMPORAL_AWARENESS") ? temporalContext() : "",
        "Tu es MangoOS, l'assistant IA personnel de Raf — chaleureux, direct, concis. Réponds en français sauf si on te parle en anglais.",
        "Tu es une application AUTONOME sur la machine de Raf — NI Claude Code, NI un terminal, NI un outil externe. Ne renvoie jamais vers un terminal/des réglages d'un autre logiciel : tout se fait DANS MangoOS.",
        "TU AS DES OUTILS, sers-t'en SANS demander la permission : LIS les fichiers joints et le brouillon (read_file/list_files/search_code), OUVRE une archive (.zip/.rar → lire_archive), lis un PDF/Word/Excel (lire_document), lis le WEB (lire_page/chercher_web/extraire_site) et interroge une API en GET (requete_web). Les pièces jointes de Raf sont dans .assets/. Ne dis JAMAIS « je n'ai pas accès au disque/à internet » ni « colle le contenu » : ouvre-les toi-même.",
        FIDELITY_CLAUSE,
        brainArchitectureClause(),
        selfKnowledgePromptSection(WORKSPACE_DIR),
        "Tu es ici en posture DISCUTER (lire, analyser, conseiller) — tu n'écris pas de fichiers et ne construis pas d'app ICI. Quand Raf veut CONSTRUIRE ou PLANIFIER, propose-lui de passer dans l'ATELIER (workspace) : « on ouvre l'atelier ? j'y emporte nos fichiers et le contexte » — c'est LUI qui valide.",
        history ? `\n— Historique —\n${history}` : "",
      ].filter(Boolean).join("\n");
      // #182 É2 — le registre offert suit le BESOIN de la tâche, pas la posture : une
      // pièce jointe dans .assets/ ou un mot-clé « regarde/rends » ÉLARGIT les capacités
      // read-safe (vision incluse) au-delà du défaut (read-local + read-web).
      let hasAttachment = false;
      try {
        const assetsDir = path.join(scratch, ".assets");
        hasAttachment = fs.existsSync(assetsDir) && fs.readdirSync(assetsDir).length > 0;
      } catch { /* best-effort */ }
      const homeCaps = await requiredCapabilities(last.content, { hasAttachment });
      // Raf (2026-07-11) : process.env.ELEVE_MODEL est un repli figé au démarrage —
      // Réglages (Atelier des cerveaux → brain-registry.json → `codeur`, la même
      // source que le flux Construire, cf. globalFallback()) doit rester la SEULE
      // source vivante, sans redémarrage du backend pour prendre effet.
      const r = await askEleveAgentic(sys, last.content, buildEleveDiscussTools(scratch, homeCaps), {
        model: getBrain("codeur").model || process.env.ELEVE_MODEL,
      });
      res.json({ text: (r.text ?? "").trim() || "(réponse vide de l'Élève)", suggestGraduate });
      return;
    }

    // ── Repli : conversation TEXTE (Claude, ou Élève sans brouillon/endpoint cloud) ──
    const system = [
      flag("TEMPORAL_AWARENESS") ? temporalContext() : "",
      "Tu es MangoOS, l'assistant IA personnel de Raf. Tu es chaleureux, direct et concis.",
      "Réponds en français sauf si on te parle en anglais.",
      "Tu es une application autonome qui tourne sur la machine de Raf — tu n'es NI Claude Code, NI un terminal, NI un outil externe. Ne mentionne jamais « Claude Code », ne renvoie jamais vers un terminal, une commande slash, ou des réglages d'un autre logiciel : tout (permissions, actions, génération) se fait à l'intérieur de MangoOS.",
      "ACCÈS AUX FICHIERS : dans cette conversation tu n'as pas d'outils de lecture disque — pour qu'on te montre un fichier, demande à Raf de l'ATTACHER avec le bouton trombone 📎 ; son contenu t'arrivera dans le message entre des balises [[FILE:nom]]…[[/FILE]]. Ne prétends jamais avoir lu un fichier que tu n'as pas reçu ainsi.",
      // (2026-07-12) Ce chat d'accueil construit son PROPRE prompt système (jamais
      // assembleSystemPrompt/scenario.ts) — sans ces 2 clauses, le cerveau actif niait
      // connaître Sharingan/la vision du système. Cas réel remonté par Raf. Voir
      // capabilities.ts / self-knowledge.ts pour le contexte complet.
      brainArchitectureClause(),
      selfKnowledgePromptSection(WORKSPACE_DIR),
      history ? `\n— Historique —\n${history}` : "",
    ].filter(Boolean).join("\n");
    let text: string;
    if (model === "eleve") {
      text = await chatEleve(system, last.content);
    } else if (model === "qwen") {
      // Qwen (« KUEN ») — VL/juge local via Ollama Cloud, souverain. Routage explicite du provider.
      const { askLLM } = await import("../llm/llm-engine.js");
      text = await askLLM(system, last.content, { provider: "ollama", model: "qwen3.5:cloud", maxTokens: 2048 });
    } else {
      // ── Cerveau NON-ÉLÈVE (Fable/Opus/Sonnet/Haiku) — chemin TEXTE PUR (askLLM sans
      // outils). #182 D3/É5 : ne plus rester SILENCIEUX quand la tâche réclame des outils.
      let hasAttachment = false;
      if (convId) {
        try {
          const a = path.join(ensureHomeScratch(convId), ".assets");
          hasAttachment = fs.existsSync(a) && fs.readdirSync(a).length > 0;
        } catch { /* best-effort */ }
      }
      const demanded = toolDemandSignal(last.content, { hasAttachment });
      // #182 D3/É5 suite — sous le gate, le registre `accueil` (popup rapide, n'importe
      // quel modèle Ollama installé) REMPLACE le MODEL_MAP figé comme source du
      // brainOverride. OFF (défaut) → accueilBrain reste null, comportement byte-identique.
      const accueilBrain = flag("HOME_QUICK_MODEL") ? getBrain("accueil") : null;
      const brainOverride = accueilBrain ?? { provider: "claude" as const, model: resolvedModel };
      const brainName = accueilBrain && accueilBrain.provider !== "claude"
        ? (accueilBrain.model ?? "Ce cerveau")
        : HOME_BRAIN_NAMES[model ?? "sonnet"] ?? "Ce cerveau";
      // Sans ça, le modèle n'a AUCUN moyen de savoir quel cerveau il est réellement
      // (le prompt partagé `system` ne le dit jamais) — il ne peut donc que rester
      // vague quand Raf demande « quel modèle es-tu ? ». On ne l'ajoute QUE quand
      // Raf a choisi un cerveau via la popup rapide (`accueilBrain`), pour garder
      // le repli Claude par défaut byte-identique (gate OFF ou choix jamais fait).
      const systemForBrain = accueilBrain
        ? `${system}\nIdentité : le cerveau qui te fait fonctionner en ce moment est « ${brainName} » (choisi par Raf via la popup rapide de l'accueil). Si Raf demande quel modèle/cerveau tu utilises, réponds-le honnêtement et précisément (ex. « J'utilise ${brainName} en ce moment »), ne reste jamais vague.`
        : system;

      if (demanded.size > 0 && flag("FRONTIER_TOOLS_ANY_BRAIN") && convId && ELEVE_PROVIDER === "openai") {
        // ── Mode ON — ORCHESTRATION : l'Élève outille, le cerveau choisi raisonne. ──
        const scratch = ensureHomeScratch(convId);
        const caps = await requiredCapabilities(last.content, { hasAttachment });
        const fr = await runFrontierOrchestration(
          {
            task: last.content,
            scratchDir: scratch,
            requiredCaps: caps,
            brainLabel: model ?? "sonnet",
            brainName,
            brainOverride,
            system: systemForBrain,
          },
          {
            // Raf (2026-07-11) : binding LIVE (eleve/provider.ts), plus jamais process.env.ELEVE_MODEL brut.
            runEleveTools: (sys, task, tools) =>
              askEleveAgentic(sys, task, tools, { model: ELEVE_MODEL }),
            dispatch: brain.dispatch,
          },
        );
        text = fr.text;
      } else {
        // ── Mode OFF (défaut) — repli TEXTE, mais HONNÊTE : si la tâche réclamait des
        // outils, on le DIT (plus de repli muet) ; sinon comportement byte-identique. ──
        const { askLLM } = await import("../llm/llm-engine.js");
        // Gate OFF (accueilBrain null) : appel STRICTEMENT identique à avant ce
        // chantier (aucun `provider` explicite — laisse askLLM/resolveProvider()
        // décider comme aujourd'hui). Gate ON : provider/model du registre `accueil`.
        text = accueilBrain
          ? await askLLM(systemForBrain, last.content, { provider: accueilBrain.provider, model: accueilBrain.model, maxTokens: 2048 })
          : await askLLM(system, last.content, { model: resolvedModel, maxTokens: 2048 });
        if (demanded.size > 0) {
          const disclosure =
            `${brainName} ne pilote pas les outils ici ; sélectionne l'Élève (GLM 5.2) ` +
            `pour une réponse outillée, ou je te réponds au mieux sans outils.`;
          text = `${disclosure}\n\n${text}`;
        }
      }
    }
    res.json({ text, suggestGraduate });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Accueil : upload d'une pièce jointe dans le BROUILLON d'une conversation (disque caché
// .home/<convId>/.assets) → l'Élève agentique peut ensuite la LIRE (lire_archive/lire_document/Read).
app.post(
  "/api/home/upload/:convId",
  express.raw({ type: () => true, limit: "51mb" }),
  (req, res) => {
    try {
      const dir = ensureHomeScratch(req.params.convId);
      const relPath = saveUpload(dir, String(req.query.filename ?? ""), req.body as Buffer);
      res.json({ path: relPath });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  },
);

// Accueil → atelier : GRADUATION d'un brouillon en vrai projet workspace (scaffold + copie
// des pièces jointes + historique amorcé). C'est Raf qui décide (bouton ou proposition acceptée).
app.post("/api/home/graduate", async (req, res) => {
  const { convId, name, messages } = req.body as {
    convId?: string;
    name?: string;
    messages?: Array<{ role: string; content: string }>;
  };
  if (!convId || !name?.trim()) {
    res.status(400).json({ error: "convId et name requis" });
    return;
  }
  try {
    const out = await graduateHomeScratch(convId, name, Array.isArray(messages) ? messages : []);
    res.json({ ok: true, name: out.name });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Accueil : suppression du brouillon (quand Raf supprime la conversation côté UI).
app.delete("/api/home/scratch/:convId", (req, res) => {
  cleanHomeScratch(req.params.convId);
  res.json({ ok: true });
});

}
