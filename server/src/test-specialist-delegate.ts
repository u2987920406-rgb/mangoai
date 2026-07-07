// Tests de la délégation (specialist-delegate.ts) — matching pur + consultation injectée.
import {
  tokenize, pickSpecialist, consultSpecialist, buildDelegateNudge, buildForgedResumeNudge, isUsableAdvice,
} from "./specialist-delegate.js"
import type { SpecialistAgent } from "./specialist-agents.js"

let pass = 0, fail = 0
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}

const mk = (over: Partial<SpecialistAgent>): SpecialistAgent => ({
  id: over.id ?? "sa_x", name: over.name ?? "X", role: over.role ?? "rôle",
  lacune: over.lacune ?? "", systemPrompt: "prompt système assez long pour être valide ici",
  tools: [], triggers: over.triggers ?? "", examples: [], tags: over.tags ?? [],
  provider: "ollama", model: "gemma4:12b", createdByAgent: "codeur", createdAt: "2026-06-28T00:00:00.000Z",
})

const pdf = mk({ id: "sa_pdf", name: "Déchiffreur de PDF scannés", role: "expert extraction PDF image scanné OCR", tags: ["pdf", "ocr", "document"], triggers: "quand la tâche mentionne un PDF scanné" })
const diff = mk({ id: "sa_diff", name: "Diffomètre sémantique", role: "comparateur de diff réel fichier par fichier", tags: ["diff", "regression", "git"], triggers: "comparer deux états" })
const specs = [pdf, diff]

console.log("[1] tokenize")
{
  const t = tokenize("Lis ce PDF scanné, à la page")
  check("garde les mots significatifs", t.has("pdf") && t.has("scanne") && t.has("lis"))
  check("retire stopwords et courts", !t.has("le") && !t.has("la") && !t.has("ce"))
  check("normalise les accents (scanné→scanne)", t.has("scanne"))
  check("vide → set vide", tokenize("").size === 0)
}

console.log("\n[2] pickSpecialist")
{
  const m = pickSpecialist(specs, "il faut lire un PDF scanné OCR et extraire le texte")
  check("matche le bon agent (PDF)", m?.agent.id === "sa_pdf")
  const m2 = pickSpecialist(specs, "compare le diff git de régression entre deux fichiers")
  check("matche le bon agent (diff)", m2?.agent.id === "sa_diff")
  check("aucun recouvrement → null", pickSpecialist(specs, "un deckbuilder de cartes médiéval") === null)
  check("seuil min respecté", pickSpecialist(specs, "pdf", { min: 2 }) === null)
}

console.log("\n[3] consultSpecialist (injecté)")
{
  const load = () => specs
  const run = async (id: string, t: string) => ({ ok: true, text: `conseils de ${id} sur: ${t.slice(0, 20)}` })
  const ok = await consultSpecialist({ task: "lire un PDF scanné et résumer", blockage: "plafond" }, { load, run })
  check("consulte l'agent matché", !!ok && ok.agent.id === "sa_pdf" && ok.advice.includes("conseils de sa_pdf"))
  const none = await consultSpecialist({ task: "un jeu de cartes fantasy", blockage: "plafond" }, { load, run })
  check("aucun match → null", none === null)
  const empty = await consultSpecialist({ task: "PDF scanné OCR", blockage: "x" }, { load, run: async () => ({ ok: true, text: "  " }) })
  check("réponse vide → null", empty === null)
  const ko = await consultSpecialist({ task: "PDF scanné OCR", blockage: "x" }, { load, run: async () => ({ ok: false, text: "boom" }) })
  check("run ok:false → null", ko === null)
  const thrown = await consultSpecialist({ task: "PDF scanné OCR", blockage: "x" }, { load, run: async () => { throw new Error("net") } })
  check("run qui lève → null (ne propage pas)", thrown === null)
  // (revue Fable #4) réponse hors-format en mode conseil → jamais injectée verbatim
  const jsonBlob = await consultSpecialist({ task: "PDF scanné OCR", blockage: "x" }, { load, run: async () => ({ ok: true, text: '{"score": 80, "note": "ras"}' }) })
  check("réponse JSON pure (mode conseil) → null, pas injectée", jsonBlob === null)
  const refus = await consultSpecialist({ task: "PDF scanné OCR", blockage: "x" }, { load, run: async () => ({ ok: true, text: "Désolé, je ne peux pas t'aider avec ça." }) })
  check("réponse de refus → null", refus === null)
  const tropCourt = await consultSpecialist({ task: "PDF scanné OCR", blockage: "x" }, { load, run: async () => ({ ok: true, text: "ok." }) })
  check("réponse trop courte → null", tropCourt === null)
}

console.log("\n[2b] pickSpecialist — filtre par winrate (revue Fable #3)")
{
  const mauvais = mk({ id: "sa_mauvais", name: "Mauvais agent PDF", role: "expert PDF scanné", tags: ["pdf", "ocr"], triggers: "pdf" })
  ;(mauvais as { stats?: { consulted: number; wins: number } }).stats = { consulted: 5, wins: 0 } // 0% winrate, échantillon significatif
  const bon = mk({ id: "sa_bon", name: "Bon agent PDF", role: "expert PDF scanné fiable", tags: ["pdf", "ocr"], triggers: "pdf" })
  ;(bon as { stats?: { consulted: number; wins: number } }).stats = { consulted: 5, wins: 4 } // 80% winrate
  const pool = [mauvais, bon]
  const withoutFilter = pickSpecialist(pool, "il faut lire un pdf scanné ocr", { min: 1 })
  check("sans filtre : le premier au score max gagne (comportement historique)", withoutFilter?.agent.id === "sa_mauvais")
  const withFilter = pickSpecialist(pool, "il faut lire un pdf scanné ocr", { min: 1, minWinrate: 0.25, minUsesForFilter: 4 })
  check("avec filtre winrate : l'agent à 0% (≥4 usages) est ignoré, le bon matche", withFilter?.agent.id === "sa_bon")
  const jeune = mk({ id: "sa_jeune", name: "Agent PDF tout juste forgé", role: "expert PDF scanné", tags: ["pdf", "ocr"], triggers: "pdf" })
  ;(jeune as { stats?: { consulted: number; wins: number } }).stats = { consulted: 1, wins: 0 } // 0% mais SOUS le seuil d'échantillon
  const withFilterJeune = pickSpecialist([jeune], "il faut lire un pdf scanné ocr", { min: 1, minWinrate: 0.25, minUsesForFilter: 4 })
  check("agent tout juste forgé (sous minUsesForFilter) → PAS filtré malgré 0%", withFilterJeune?.agent.id === "sa_jeune")
}

console.log("\n[3c] consultSpecialist — comptabilise la consultation (revue Fable #3)")
{
  const load = () => specs
  const seen: string[] = []
  const ok = await consultSpecialist(
    { task: "lire un PDF scanné et résumer", blockage: "plafond" },
    { load, run: async (id, t) => ({ ok: true, text: `conseils de ${id} sur: ${t.slice(0, 20)}` }), recordConsulted: (id) => { seen.push(id) } },
  )
  check("consulte + comptabilise (recordConsulted appelé)", !!ok && seen.includes("sa_pdf"))
  const seen2: string[] = []
  const rejete = await consultSpecialist(
    { task: "lire un PDF scanné et résumer", blockage: "plafond" },
    { load, run: async () => ({ ok: true, text: "ok." /* trop court, rejeté par isUsableAdvice */ }), recordConsulted: (id) => { seen2.push(id) } },
  )
  check("même une réponse rejetée (hors-format) est comptabilisée", rejete === null && seen2.includes("sa_pdf"))
  const seen3: string[] = []
  await consultSpecialist(
    { task: "lire un PDF scanné et résumer", blockage: "plafond" },
    { load, run: async () => ({ ok: false, text: "" }), recordConsulted: (id) => { seen3.push(id) } },
  )
  check("un échec de transport (ok:false) n'est PAS comptabilisé", seen3.length === 0)
}

console.log("\n[3d] isUsableAdvice — (revue Fable #4)")
{
  check("prose normale (mode conseil) → utilisable", isUsableAdvice("1. Vérifie le fichier X.\n2. Corrige l'import.", "conseil").usable)
  check("JSON pur (mode conseil) → rejeté", !isUsableAdvice('{"a":1}', "conseil").usable)
  check("JSON pur (mode ACTION) → toléré (pas de check JSON en action)", isUsableAdvice('{"a":1,"b":"assez long pour passer le seuil"}', "action").usable)
  check("refus → rejeté", !isUsableAdvice("Je ne suis pas en mesure de répondre à cela.", "conseil").usable)
  check("vide → rejeté", !isUsableAdvice("", "conseil").usable)
  check("trop court → rejeté", !isUsableAdvice("oui", "conseil").usable)
  check("JSON malformé (accolades sans être du vrai JSON) → laisse passer aux autres checks", isUsableAdvice("{ceci n'est pas du json mais du texte suffisamment long}", "conseil").usable)
}

console.log("\n[4] buildDelegateNudge")
{
  const n = buildDelegateNudge("Déchiffreur de PDF scannés", "1. fais X\n2. fais Y")
  check("contient nom + analyse + finish", n.includes("Déchiffreur de PDF scannés") && n.includes("fais X") && n.includes("finish"))
}

console.log("\n[5] buildForgedResumeNudge (reprise robuste #168 T3)")
{
  const n = buildForgedResumeNudge("Aiguilleur d'outillage", "wrong-tool", "réorienter vers read_file/edit_file")
  check("mentionne l'agent forgé", n.includes("Aiguilleur d'outillage"))
  check("cite le blocage", n.includes("wrong-tool"))
  check("porte le remède + appelle finish", n.includes("réorienter vers read_file/edit_file") && n.includes("finish"))
}

console.log(`\n${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
