// #138 OS d'apps — Preuve déterministe du contrat MangoApp + du mode compose.
// Manifest load/save/section (sur dir temporaire) + assemblage du scénario 🧩.
//
// Lancer :  npx tsx src/test-mango-app-contract.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  hasManifest, loadManifest, saveManifest, mangoAppContractSection, accessAllowsWrite, findManifestById,
  normalizeSchema, validateAgainstSchema, findCollectionSchema, type MangoAppManifest,
} from "./mango-app-contract.js";
import { assembleSystemPrompt } from "./scenario.js";
import { ALLOWED_MODES } from "./agent.js";

import { line, makeCheck } from "./test-util.js";
let failures = 0;
const check = makeCheck(() => { failures++; });

line("═");
console.log("mango-app-contract — manifest + mode compose");
line();

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mangoapp-"));

// 1. Pas de manifest au départ → section vide, hasManifest false.
check("hasManifest false au départ", hasManifest(dir) === false);
check("loadManifest null au départ", loadManifest(dir) === null);

// 2. Save + reload défensif.
const saved = saveManifest(dir, {
  id: "mango-taches",
  name: "Mango Tâches",
  icon: "📋",
  color: "#f59e0b",
  navEntry: { label: "Tâches", route: "/" },
  collections: [{ name: "tasks", access: "readwrite" }],
});
check("saveManifest tamponne createdAt", typeof saved.createdAt === "string" && saved.createdAt.length > 0);
check("hasManifest true après save", hasManifest(dir) === true);
const loaded = loadManifest(dir);
check("loadManifest relit l'id", loaded?.id === "mango-taches");
check("loadManifest relit la collection", loaded?.collections[0]?.name === "tasks" && loaded?.collections[0]?.access === "readwrite");

// 3. JSON corrompu → null (jamais d'exception).
fs.writeFileSync(path.join(dir, ".mangoapp.json"), "{ not json", "utf8");
check("JSON corrompu → loadManifest null", loadManifest(dir) === null);
// On remet un manifest valide pour la suite.
saveManifest(dir, { id: "mango-taches", name: "Mango Tâches", icon: "📋", color: "#f59e0b", navEntry: { label: "Tâches", route: "/" }, collections: [{ name: "tasks", access: "readwrite" }] });

// 4. Section de prompt.
const section = mangoAppContractSection(dir);
check("section contient le contrat MangoApp", /CONTRAT MANGOAPP/.test(section));
check("section impose .mangoapp.json", /\.mangoapp\.json/.test(section));
check("section rappelle le manifest actuel", /Mango Tâches/.test(section) && /tasks/.test(section));
check("section vide hors contexte (dir vide)", mangoAppContractSection("") === "");

// 5. Mode compose côté API + scénario.
check("ALLOWED_MODES contient 'compose'", (ALLOWED_MODES as readonly string[]).includes("compose"));
const prompt = assembleSystemPrompt({ mode: "compose", model: "sonnet", projectDir: dir });
check("scénario compose : posture App composable", /App composable/.test(prompt));
check("scénario compose : contrat MangoApp injecté", /MangoApp contract/.test(prompt) || /CONTRAT MANGOAPP/.test(prompt));
check("scénario compose : règles données partagées (api/shared)", /\/api\/shared\//.test(prompt));
check("scénario compose : sync SSE temps réel imposée (#138-P2)", /EventSource/.test(prompt) && /\/stream/.test(prompt));
check("scénario compose : repli polling conservé", /fall back to short polling/i.test(prompt));
check("scénario compose : en-tête ACL X-MangoApp-Id (#138-P2)", /X-MangoApp-Id/.test(prompt));
check("scénario compose : garde l'arsenal Élite (analytic)", /native extended thinking/.test(prompt));
// Garde-fou : le mode compose ne traîne PAS le scaffold/projectPlan du mode
// projet (marqueur distinctif = le manifest de chantier .project-plan.json).
// Témoin : le mode projet, lui, le porte bien.
const projet = assembleSystemPrompt({ mode: "projet", model: "sonnet", projectDir: dir });
check("scénario compose : pas de socle-d'abord (.project-plan.json absent)", !/\.project-plan\.json/.test(prompt));
check("témoin : le mode projet porte bien le socle-d'abord", /\.project-plan\.json/.test(projet));

// 6. ACL par app (#138 Phase 2) — helpers purs.
check("accessAllowsWrite: readwrite → true", accessAllowsWrite("readwrite") === true);
check("accessAllowsWrite: write → true", accessAllowsWrite("write") === true);
check("accessAllowsWrite: read → false", accessAllowsWrite("read") === false);
check("accessAllowsWrite: non déclarée (null) → false", accessAllowsWrite(null) === false);
// findManifestById sur de vrais dossiers : `dir` porte un manifest id mango-taches.
check("findManifestById trouve l'app par id", findManifestById([dir], "mango-taches")?.name === "Mango Tâches");
check("findManifestById: id inconnu → null", findManifestById([dir], "inconnu") === null);
check("findManifestById: id vide → null", findManifestById([dir], "") === null);

// 7. Validation de schéma par collection (#138 Phase 2) — helpers purs.
const taskSchema = { title: "string", done: "boolean", priority: "number?" };
check("schéma : doc conforme → ok", validateAgainstSchema({ title: "Acheter", done: false, priority: 2 }, taskSchema).ok === true);
check("schéma : champ optionnel absent → ok", validateAgainstSchema({ title: "Acheter", done: false }, taskSchema).ok === true);
check("schéma : champ HORS schéma toléré → ok", validateAgainstSchema({ title: "x", done: true, note: "libre" }, taskSchema).ok === true);
check("schéma : champ requis manquant → rejet", validateAgainstSchema({ done: true }, taskSchema).ok === false);
check("schéma : mauvais type (done=string) → rejet", validateAgainstSchema({ title: "x", done: "oui" }, taskSchema).ok === false);
check("schéma : NaN n'est pas un number → rejet", validateAgainstSchema({ title: "x", done: true, priority: NaN }, taskSchema).ok === false);
check("schéma : valeur non-objet → rejet", validateAgainstSchema(["pas", "un", "objet"], taskSchema).ok === false);
check("schéma : array reconnu", validateAgainstSchema({ tags: ["a", "b"] }, { tags: "array" }).ok === true);
check("schéma : object reconnu (array ≠ object)", validateAgainstSchema({ meta: { k: 1 } }, { meta: "object" }).ok === true && validateAgainstSchema({ meta: [1] }, { meta: "object" }).ok === false);
check("schéma : type 'any' accepte tout", validateAgainstSchema({ x: 5 }, { x: "any" }).ok === true && validateAgainstSchema({ x: "s" }, { x: "any" }).ok === true);
const rej = validateAgainstSchema({ done: true }, taskSchema);
check("schéma : message d'erreur nomme le champ fautif", rej.ok === false && /title/.test(rej.error));

// normalizeSchema — parsing défensif.
check("normalizeSchema : objet de strings → schéma", JSON.stringify(normalizeSchema({ a: "string", b: "number?" })) === JSON.stringify({ a: "string", b: "number?" }));
check("normalizeSchema : valeurs non-string filtrées", JSON.stringify(normalizeSchema({ a: "string", b: 42, c: null })) === JSON.stringify({ a: "string" }));
check("normalizeSchema : non-objet → undefined", normalizeSchema("x") === undefined && normalizeSchema(null) === undefined && normalizeSchema(["string"]) === undefined);
check("normalizeSchema : objet vide → undefined", normalizeSchema({}) === undefined);

// loadManifest relit le schéma d'une collection.
const sdir = fs.mkdtempSync(path.join(os.tmpdir(), "mangoapp-schema-"));
saveManifest(sdir, { id: "mango-taches", name: "Mango Tâches", icon: "📋", color: "#f59e0b", navEntry: { label: "Tâches", route: "/" }, collections: [{ name: "tasks", access: "readwrite", schema: { title: "string", done: "boolean" } }] });
const sloaded = loadManifest(sdir);
check("loadManifest relit le schéma de collection", sloaded?.collections[0]?.schema?.title === "string" && sloaded?.collections[0]?.schema?.done === "boolean");
fs.rmSync(sdir, { recursive: true, force: true });

// findCollectionSchema — préfère l'écrivain.
const idn = (s: string) => s;
const writer: MangoAppManifest = { id: "w", name: "W", icon: "📝", color: "#000", navEntry: { label: "W", route: "/" }, collections: [{ name: "tasks", access: "write", schema: { title: "string" } }], createdAt: "" };
const reader: MangoAppManifest = { id: "r", name: "R", icon: "👁", color: "#000", navEntry: { label: "R", route: "/" }, collections: [{ name: "tasks", access: "read", schema: { title: "any" } }], createdAt: "" };
check("findCollectionSchema : préfère le schéma de l'écrivain", findCollectionSchema([reader, writer], "tasks", idn)?.title === "string");
check("findCollectionSchema : repli sur un lecteur si pas d'écrivain", findCollectionSchema([reader], "tasks", idn)?.title === "any");
check("findCollectionSchema : aucune déclaration → null", findCollectionSchema([{ ...reader, collections: [{ name: "tasks", access: "read" }] }], "tasks", idn) === null);
check("findCollectionSchema : collection inconnue → null", findCollectionSchema([writer], "autre", idn) === null);

fs.rmSync(dir, { recursive: true, force: true });
line("═");
console.log(failures === 0 ? "✅ Contrat MangoApp + mode compose prouvés." : `❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
