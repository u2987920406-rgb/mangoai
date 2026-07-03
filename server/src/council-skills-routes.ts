// Council and Skills routes.
// Council (#44): diagnostic experts, recovery plan.
// Skills: list, create, delete skills + manual skill creation.
// All routes are self-contained (no agentBusy, no SSE).
import fs from "node:fs";
import path from "node:path";
import type { Express, Request, Response } from "express";
import { runCouncil, loadRecoveryPlan, clearRecoveryPlan } from "./orchestrator.js";
import { listSkills, readSkill, expandSkillBody, SKILLS_DIR } from "./skills.js";
import { projectDir, projectExists } from "./projects.js";

export function registerCouncilSkillsRoutes(app: Express): void {
  // ── Idée #44 — Conseil d'experts (rattrapage projet dévié, lecture seule) ────

  // Convoque le conseil : N lentilles diagnostiquent en lecture seule → plan de
  // reprise priorisé sauvegardé en .recovery-plan.md. N'écrit jamais de code.
  app.post("/api/council/:name", async (req: Request, res: Response) => {
    const name = req.params["name"] as string;
    const { problem } = req.body as { problem?: string };
    if (!projectExists(name)) {
      res.status(404).json({ error: `Projet "${name}" introuvable` });
      return;
    }
    try {
      const result = await runCouncil(name, typeof problem === "string" ? problem : "");
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Plan de reprise courant (s'il existe)
  app.get("/api/council/:name", (req: Request, res: Response) => {
    const name = req.params["name"] as string;
    const dir = projectExists(name) ? projectDir(name) : null;
    res.json({ plan: dir ? loadRecoveryPlan(dir) : "" });
  });

  // Efface le plan de reprise (rattrapage terminé)
  app.delete("/api/council/:name", (req: Request, res: Response) => {
    const name = req.params["name"] as string;
    if (projectExists(name)) clearRecoveryPlan(projectDir(name));
    res.json({ ok: true });
  });

  // ── Skills API ───────────────────────────────────────────────────────────────

  // List all skills — `slug` (identifiant tapé après `/`) et le drapeau
  // d'invocation manuelle exposés pour l'autocomplétion + l'expansion du composer (#174).
  app.get("/api/skills", (_req: Request, res: Response) => {
    res.json({
      skills: listSkills().map(({ name, description, slug, disableModelInvocation }) => ({
        name,
        description,
        slug,
        disableModelInvocation: Boolean(disableModelInvocation),
      })),
    });
  });

  // #174 — Corps complet d'une skill + expansion. `?args=<texte>` renvoie aussi
  // `expanded` (corps substitué prêt à devenir le tour utilisateur). 404 si le
  // slug est inconnu/illisible (le composer retombe alors sur l'envoi brut).
  app.get("/api/skills/:slug", (req: Request, res: Response) => {
    const slug = req.params["slug"] as string;
    const skill = readSkill(slug);
    if (!skill) {
      res.status(404).json({ error: `Skill "${slug}" introuvable` });
      return;
    }
    const argsText = typeof req.query["args"] === "string" ? (req.query["args"] as string) : "";
    res.json({
      name: skill.name,
      description: skill.description,
      slug: skill.slug,
      body: skill.body,
      disableModelInvocation: skill.disableModelInvocation,
      arguments: skill.arguments,
      expanded: expandSkillBody(skill.body, argsText, skill.arguments),
    });
  });

  // Create a new skill
  app.post("/api/skills", (req: Request, res: Response) => {
    const { name, description, content } = req.body as { name?: string; description?: string; content?: string };
    if (!name?.trim() || !content?.trim()) {
      res.status(400).json({ error: "name et content sont requis" });
      return;
    }
    const slug = name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const dir = path.join(SKILLS_DIR, slug);
    const file = path.join(dir, "SKILL.md");
    try {
      fs.mkdirSync(dir, { recursive: true });
      const frontmatter = `---\nname: ${name.trim()}\ndescription: ${(description ?? "").trim()}\n---\n\n${content.trim()}\n`;
      fs.writeFileSync(file, frontmatter, "utf8");
      res.json({ ok: true, slug });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Delete a skill
  app.delete("/api/skills/:name", (req: Request, res: Response) => {
    const slug = req.params["name"] as string;
    // (Un, 2026-07-03) U8 — :name brut + fs.rmSync récursif = suppression de
    // n'importe quel dossier via "../..". Un slug de skill est toujours
    // kebab-case (cf. POST /api/skills) : tout le reste est rejeté.
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) {
      res.status(400).json({ error: "nom de skill invalide" });
      return;
    }
    const dir = path.join(SKILLS_DIR, slug);
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Manual skill creation endpoint (alternative, richer form)
  app.post("/api/skill", (req: Request, res: Response) => {
    const { name, description, body } = req.body as { name?: string; description?: string; body?: string };
    const rawName = (name ?? "").trim();
    const rawDesc = (description ?? "").trim();
    const rawBody = (body ?? "").trim();
    if (!rawName || !rawBody) {
      res.status(400).json({ error: "name et body requis" });
      return;
    }
    const slug = rawName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "skill";
    const skillDir = path.join(SKILLS_DIR, slug);
    const skillFile = path.join(skillDir, "SKILL.md");
    try {
      fs.mkdirSync(skillDir, { recursive: true });
      const content = `---\nname: ${rawName}\ndescription: ${rawDesc}\n---\n\n${rawBody}`;
      fs.writeFileSync(skillFile, content, "utf8");
      res.json({ ok: true, slug });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });
}
