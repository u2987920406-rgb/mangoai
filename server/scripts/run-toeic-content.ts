import "dotenv/config";
// ─── Générateur de contenu TOEIC piloté GLM ──────────────────────────────────
// GLM (l'Élève) rédige les questions TOEIC par module selon un schéma strict ;
// on valide, on récupère de vraies images Pexels, et on écrit la banque.
//   Lancer  :  npx tsx src/run-toeic-content.ts [moduleId...]   (vide = tous)
//   Reprend :  même commande (les modules déjà générés sont conservés)
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { askLLM } from "../src/llm-engine.js";
import { searchPexelsImages } from "../src/taste-images.js";

const GLM = {
  provider: "openai" as const,
  model: process.env.ELEVE_MODEL || "glm-5.2:cloud",
  baseUrl: process.env.ELEVE_API_URL,
  apiKeyEnv: "ELEVE_API_KEY",
  timeoutMs: 180_000,
  maxTokens: 6000,
};

const OUT_BASE = "D:/IA/MangoOS/workspace/toeic-quest/src/data/bank";
const outFor = (lvl: string) => `${OUT_BASE}/${lvl}.gen.js`;
const stateFor = (lvl: string) => `D:/IA/MangoOS/server/.toeic-content.${lvl}.state.json`;
const EXPORT_NAME = (lvl: string) => lvl === "debutant" ? "DEBUTANT_GEN" : lvl === "intermediaire" ? "INTERMEDIAIRE_GEN" : "AVANCE_GEN";

type Spec = { id: string; part: string; skill: string; count: number; theme: string };

// Modules Débutant à peupler (M16 = bilan, puise dans le niveau, pas de contenu propre).
const DEBUTANT_SPECS: Spec[] = [
  { id: "M01", part: "P1", skill: "listening", count: 10, theme: "everyday workplace and city scenes: an office, a person typing, a meeting, a street, a shop" },
  { id: "M02", part: "P1", skill: "listening", count: 10, theme: "places and objects: a warehouse, shelves, a kitchen, a parking lot, tools on a table" },
  { id: "M03", part: "P2", skill: "listening", count: 12, theme: "simple Wh- and Yes/No questions in an office (time, place, people, schedules)" },
  { id: "M04", part: "P2", skill: "listening", count: 12, theme: "How much / How long / Which questions about work logistics" },
  { id: "M05", part: "P5", skill: "vocab", count: 10, theme: "office vocabulary (word families: manage/manager/management, apply/applicant)" },
  { id: "M06", part: "P5", skill: "vocab", count: 10, theme: "basic verb tenses and time markers (present, past, future)" },
  { id: "M07", part: "P3", skill: "listening", count: 10, theme: "short man-woman conversations between colleagues at work (3-4 turns)" },
  { id: "M08", part: "P4", skill: "listening", count: 8, theme: "announcements and voicemails (airport, store, office reminders)" },
  { id: "M09", part: "P7", skill: "reading", count: 8, theme: "simple business emails and memos" },
  { id: "M10", part: "P5", skill: "vocab", count: 10, theme: "prepositions and logical connectors (by, for, before, during)" },
  { id: "M11", part: "P3", skill: "listening", count: 10, theme: "man-woman conversations about work problems and solutions (3-4 turns)" },
  { id: "M12", part: "P6", skill: "reading", count: 10, theme: "short text completion (one blank: word or connector that fits the paragraph)" },
  { id: "M13", part: "P7", skill: "reading", count: 8, theme: "notices, public announcements, simple advertisements" },
  { id: "M14", part: "P4", skill: "listening", count: 8, theme: "phone messages (caller, reason, requested action)" },
  { id: "M15", part: "P1", skill: "listening", count: 10, theme: "mixed review photos: people working, transport, dining, shopping" },
];

// Échantillons Intermédiaire (rendre quelques modules jouables, difficulté 2 dominante).
const INTERMEDIAIRE_SPECS: Spec[] = [
  { id: "M17", part: "P1", skill: "listening", count: 8, theme: "complex photos with several people or actions (a busy office, a construction site, a team meeting)" },
  { id: "M18", part: "P2", skill: "listening", count: 10, theme: "indirect responses to workplace questions (the answer does not echo the question)" },
  { id: "M19", part: "P5", skill: "vocab", count: 10, theme: "business vocabulary (finance, HR, logistics): profit vs revenue, applicant vs employee" },
  { id: "M20", part: "P3", skill: "listening", count: 10, theme: "longer man-woman conversations, 4-5 turns, with a small problem and a plan" },
  { id: "M22", part: "P7", skill: "reading", count: 8, theme: "company articles and reports with a main idea per paragraph" },
  { id: "M24", part: "P6", skill: "reading", count: 8, theme: "text completion with connectors and contextually correct words" },
  { id: "M21", part: "P4", skill: "listening", count: 8, theme: "structured business presentations and briefings with signposting (first, however, finally)" },
  { id: "M23", part: "P5", skill: "vocab", count: 10, theme: "passive voice and conditional sentences in a business context" },
  { id: "M25", part: "P3", skill: "listening", count: 10, theme: "man-woman conversations with disagreement or compromise (negotiation, opinions)" },
  { id: "M26", part: "P4", skill: "listening", count: 8, theme: "public announcements (station, store, event) with the key info after an intro" },
  { id: "M27", part: "P5", skill: "vocab", count: 10, theme: "advanced logical connectors (nevertheless, therefore, whereas)" },
  { id: "M28", part: "P7", skill: "reading", count: 8, theme: "longer single passages requiring simple inference" },
  { id: "M29", part: "P2", skill: "listening", count: 10, theme: "tag questions and rhetorical questions expecting agreement or nuance" },
  { id: "M30", part: "P3", skill: "listening", count: 10, theme: "three-speaker conversations (the question targets one specific speaker)" },
  { id: "M31", part: "P6", skill: "reading", count: 8, theme: "text completion focused on tense and pronoun consistency across a paragraph" },
  { id: "M32", part: "P7", skill: "reading", count: 8, theme: "professional email threads (sender, subject, request of each message)" },
  { id: "M33", part: "P4", skill: "listening", count: 8, theme: "informative radio/podcast excerpts (theme, speaker, 2-3 key points)" },
  { id: "M34", part: "P5", skill: "vocab", count: 10, theme: "business collocations (meet a deadline, place an order, reach an agreement)" },
  { id: "M35", part: "P1", skill: "listening", count: 8, theme: "review photos: people working, transport, dining, shopping (intermediate detail)" },
];

// Échantillons Avancé (dont le double passage P7D).
const AVANCE_SPECS: Spec[] = [
  { id: "M37", part: "P1", skill: "listening", count: 8, theme: "nuanced photos where only one description is fully accurate (subtle details)" },
  { id: "M39", part: "P5", skill: "vocab", count: 10, theme: "specialized vocabulary (contracts, compliance, finance) with precise meanings" },
  { id: "M40", part: "P3", skill: "listening", count: 8, theme: "fast man-woman conversations with implied meaning and negotiation" },
  { id: "M42", part: "P7", skill: "reading", count: 8, theme: "passages requiring inference about intent and tone" },
  { id: "M44", part: "P7D", skill: "reading", count: 8, theme: "two linked documents (email + reply, or notice + schedule) where some answers require combining both" },
  { id: "M45", part: "P5", skill: "vocab", count: 10, theme: "tricky grammar (subject-verb agreement at distance, gerund vs infinitive, irregular comparatives)" },
  { id: "M38", part: "P2", skill: "listening", count: 8, theme: "idiomatic and colloquial responses (It's not my call, etc.)" },
  { id: "M41", part: "P4", skill: "listening", count: 8, theme: "dense technical talks structured around figures and conclusions" },
  { id: "M43", part: "P6", skill: "reading", count: 8, theme: "demanding text completion (register, cohesion, precise word choice)" },
  { id: "M46", part: "P3", skill: "listening", count: 8, theme: "man-woman conversations with varied phrasing and implied meaning" },
  { id: "M47", part: "P7D", skill: "reading", count: 8, theme: "two linked documents requiring cross-referencing to answer (advanced)" },
  { id: "M48", part: "P5", skill: "vocab", count: 10, theme: "fine grammar and style (parallelism, logical articulation, precise lexis)" },
];

const LEVEL_SPECS: Record<string, Spec[]> = { debutant: DEBUTANT_SPECS, intermediaire: INTERMEDIAIRE_SPECS, avance: AVANCE_SPECS };

const PART_INSTRUCTIONS: Record<string, string> = {
  P1: `TOEIC Part 1 (Photographs). For each item invent a clear, photographable scene. Provide:
- "imageQuery": a SHORT English search phrase (2-5 words) describing the scene to find a matching stock photo.
- "transcript": the four spoken options labelled, e.g. "(A) A woman is typing on a laptop. (B) ... (C) ... (D) ...".
- "choices": the SAME four descriptive sentences as an array of 4 strings (without the (A)(B) labels).
- "answer": index (0-3) of the sentence that truly matches the scene in imageQuery.
- "question": always "Sélectionnez la phrase qui décrit le mieux l'image."
- "voiceGender": "male" or "female".
- "explanation": in FRENCH, why the correct sentence matches and others don't.`,
  P2: `TOEIC Part 2 (Question-Response). For each item:
- "prompt": { "text": the spoken question/statement in English, "gender": "male" or "female" }.
- "choices": an array of EXACTLY 3 short spoken responses.
- "answer": index (0-2) of the best response (often indirect/natural, not echoing words).
- "question": always "Choisissez la meilleure réponse à la question entendue."
- "explanation": in FRENCH.
Do NOT include an image.`,
  P3: `TOEIC Part 3 (Conversations). For each item write a natural MAN-WOMAN conversation:
- "lines": array of 3-4 objects { "speaker": "M" or "W", "gender": "male" or "female", "text": "..." }, alternating speakers.
- "imageQuery": SHORT English phrase for a contextual business/workplace photo.
- "question": a comprehension question in ENGLISH about the conversation.
- "choices": array of 4 English options.
- "answer": index (0-3).
- "explanation": in FRENCH, quoting the relevant line.`,
  P4: `TOEIC Part 4 (Short Talks). For each item:
- "transcript": a short monologue in English (announcement, voicemail, briefing), 2-4 sentences.
- "imageQuery": SHORT English phrase for a contextual photo.
- "voiceGender": "male" or "female".
- "question": comprehension question in ENGLISH.
- "choices": array of 4 English options.
- "answer": index (0-3).
- "explanation": in FRENCH.`,
  P5: `TOEIC Part 5 (Incomplete Sentences). For each item:
- "type": "fillblank".
- "sentence": one English business sentence containing a blank written as "_____".
- "choices": array of 4 English options (grammar or vocabulary).
- "answer": index (0-3).
- "explanation": in FRENCH, the grammar/vocab rule.
Do NOT include an image.`,
  P6: `TOEIC Part 6 (Text Completion), simplified to one blank. For each item:
- "type": "fillblank".
- "sentence": a SHORT English business paragraph (1-2 sentences) with one blank "_____" (often a connector or correct word in context).
- "choices": array of 4 English options.
- "answer": index (0-3).
- "explanation": in FRENCH, why it fits the context.
Do NOT include an image.`,
  P7: `TOEIC Part 7 (Reading Comprehension), single passage. For each item:
- "passage": an English business document (email, memo, notice, ad), 3-6 sentences. You may use "\\n" for line breaks.
- "imageQuery": SHORT English phrase for a contextual photo.
- "question": comprehension question in ENGLISH.
- "choices": array of 4 English options.
- "answer": index (0-3).
- "explanation": in FRENCH.`,
  P7D: `TOEIC Part 7 (Reading Comprehension), DOUBLE passage. For each item:
- "passages": array of EXACTLY 2 objects { "label": short English label, "text": an English document of 3-5 sentences }. The two documents must be LINKED (e.g. an email and its reply, a notice and a schedule).
- "imageQuery": SHORT English phrase for a contextual photo.
- "question": a comprehension question in ENGLISH whose answer REQUIRES combining both documents.
- "choices": array of 4 English options.
- "answer": index (0-3).
- "explanation": in FRENCH, expliquant le croisement des deux documents.`,
};

function buildPrompt(spec: Spec) {
  const system = `You are a professional TOEIC test-item writer (ETS exam style). You produce authentic, exam-realistic items aimed at learners progressing toward TOEIC 800. Difficulty for this BEGINNER module: keep language clear and common, distractors plausible but fair. Mix difficulty levels: about half "difficulty":1 and half "difficulty":2.
You output ONLY a valid JSON array. No markdown, no commentary, no code fences.`;

  const user = `Write ${spec.count} TOEIC items.
Module theme: ${spec.theme}.

${PART_INSTRUCTIONS[spec.part]}

Every item MUST also include: "part": "${spec.part}", "skill": "${spec.skill}", "difficulty": 1 or 2.
Explanations MUST be written in FRENCH. All English text must be correct, natural and unambiguous, with exactly ONE correct answer.

Return ONLY a JSON array of ${spec.count} item objects. Begin with [ and end with ].`;

  return { system, user };
}

// Extrait le premier tableau JSON équilibré d'un texte (tolère fences/texte autour).
function extractJsonArray(text: string): any[] {
  let t = text.trim();
  t = t.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = t.indexOf("[");
  if (start < 0) throw new Error("no array start");
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else {
      if (c === '"') inStr = true;
      else if (c === "[") depth++;
      else if (c === "]") { depth--; if (depth === 0) return JSON.parse(t.slice(start, i + 1)); }
    }
  }
  throw new Error("unbalanced array");
}

// Valide un item selon sa partie. Renvoie null si invalide (rejeté).
function validate(item: any, spec: Spec): boolean {
  if (!item || typeof item !== "object") return false;
  if (typeof item.answer !== "number") return false;
  if (typeof item.explanation !== "string" || item.explanation.length < 8) return false;
  const ch = item.choices;
  const want = spec.part === "P2" ? 3 : 4;
  if (!Array.isArray(ch) || ch.length !== want) return false;
  if (item.answer < 0 || item.answer >= ch.length) return false;
  if (new Set(ch.map((c: any) => String(c).trim().toLowerCase())).size !== ch.length) return false; // pas de doublon
  if (spec.part === "P1" && (!item.transcript || !item.imageQuery)) return false;
  if (spec.part === "P2" && (!item.prompt || !item.prompt.text)) return false;
  if (spec.part === "P3" && (!Array.isArray(item.lines) || item.lines.length < 2 || !item.question)) return false;
  if (spec.part === "P4" && (!item.transcript || !item.question)) return false;
  if ((spec.part === "P5" || spec.part === "P6") && (!item.sentence || !item.sentence.includes("_____"))) return false;
  if (spec.part === "P7" && (!item.passage || !item.question)) return false;
  if (spec.part === "P7D" && (!Array.isArray(item.passages) || item.passages.length < 2 || !item.question)) return false;
  return true;
}

async function imageFor(query: string): Promise<string | null> {
  try {
    const imgs = await searchPexelsImages(query, 1);
    return imgs[0]?.url || null;
  } catch { return null; }
}

// Met l'item au format de la banque (ajoute id/moduleId/level, image, transcript P3).
async function finalize(item: any, spec: Spec, n: number, level: string): Promise<any> {
  const realPart = spec.part === "P7D" ? "P7" : spec.part;
  const out: any = {
    id: `${spec.part}-${spec.id}-G${String(n).padStart(2, "0")}`,
    moduleId: spec.id,
    level,
    part: realPart,
    skill: spec.skill,
    difficulty: item.difficulty === 2 ? 2 : 1,
    question: item.question,
    choices: item.choices.map((c: any) => String(c)),
    answer: item.answer,
    explanation: item.explanation,
  };
  if (item.type) out.type = item.type;
  if (item.sentence) out.sentence = item.sentence;
  if (item.passage) out.passage = item.passage;
  if (Array.isArray(item.passages)) {
    out.passages = item.passages.map((p: any) => ({ label: String(p.label || ""), text: String(p.text || "") }));
    if (!out.passage) out.passage = out.passages.map((p: any) => `${p.label}\n${p.text}`).join("\n\n");
  }
  if (item.transcript) out.transcript = item.transcript;
  if (item.prompt) out.prompt = { text: String(item.prompt.text), gender: item.prompt.gender === "male" ? "male" : "female" };
  if (item.voiceGender) out.voiceGender = item.voiceGender === "male" ? "male" : "female";
  if (Array.isArray(item.lines)) {
    out.lines = item.lines.map((l: any) => ({ speaker: l.speaker === "M" ? "M" : "W", gender: l.gender === "male" ? "male" : "female", text: String(l.text) }));
    if (!out.transcript) out.transcript = out.lines.map((l: any) => `${l.speaker}: ${l.text}`).join(" ");
  }
  if (!out.question) out.question = spec.part === "P1" ? "Sélectionnez la phrase qui décrit le mieux l'image." : "Choisissez la bonne réponse.";
  // Image (parties visuelles)
  if (["P1", "P3", "P4", "P7", "P7D"].includes(spec.part) && item.imageQuery) {
    const url = await imageFor(String(item.imageQuery));
    if (url) out.image = url;
  }
  return out;
}

async function generateModule(spec: Spec, level: string): Promise<any[]> {
  const { system, user } = buildPrompt(spec);
  let raw = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      raw = await askLLM(system, user, GLM);
      const arr = extractJsonArray(raw);
      const valid = arr.filter((it) => validate(it, spec));
      if (valid.length >= Math.ceil(spec.count * 0.6)) {
        const out: any[] = [];
        let n = 1;
        for (const it of valid) out.push(await finalize(it, spec, n++, level));
        return out;
      }
      console.log(`  ⚠ ${spec.id}: ${valid.length}/${arr.length} valides (tentative ${attempt + 1}) — retry`);
    } catch (e: any) {
      console.log(`  ⚠ ${spec.id}: parsing/échec (${e.message}) tentative ${attempt + 1}`);
    }
  }
  return [];
}

function loadState(level: string): Record<string, any[]> {
  const f = stateFor(level);
  if (existsSync(f)) { try { return JSON.parse(readFileSync(f, "utf8")); } catch { /* */ } }
  return {};
}
function saveState(level: string, s: Record<string, any[]>) { writeFileSync(stateFor(level), JSON.stringify(s, null, 1)); }

function writeBank(level: string, state: Record<string, any[]>) {
  const all = Object.values(state).flat();
  const header = `// ─── Banque ${level} — GÉNÉRÉE par GLM (l'Élève) ──────────────────────────────\n`
    + `// Contenu rédigé par glm-5.2:cloud, validé (schéma) + images Pexels réelles.\n`
    + `// Régénérable via : npx tsx server/src/run-toeic-content.ts ${level}\n\n`
    + `export const ${EXPORT_NAME(level)} = `;
  const out = outFor(level);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, header + JSON.stringify(all, null, 2) + ";\n");
}

async function main() {
  const args = process.argv.slice(2);
  const level = (args[0] && LEVEL_SPECS[args[0]]) ? args.shift()! : "debutant";
  const allSpecs = LEVEL_SPECS[level];
  const specs = args.length ? allSpecs.filter((s) => args.includes(s.id)) : allSpecs;
  const state = loadState(level);
  console.log(`🍋 Génération de contenu TOEIC (GLM) — niveau ${level} — ${specs.length} module(s)\n`);
  for (const spec of specs) {
    if (state[spec.id]?.length && !args.includes(spec.id)) {
      console.log(`  ⏭  ${spec.id} déjà généré (${state[spec.id].length} q) — skip`);
      continue;
    }
    process.stdout.write(`  ✍  ${spec.id} (${spec.part}, ${spec.count} visées)… `);
    const items = await generateModule(spec, level);
    console.log(`${items.length} questions OK`);
    if (items.length) { state[spec.id] = items; saveState(level, state); writeBank(level, state); }
  }
  const total = Object.values(state).flat().length;
  console.log(`\n✅ Total banque ${level} générée : ${total} questions → ${outFor(level)}`);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
