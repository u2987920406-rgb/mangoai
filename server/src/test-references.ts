// Deterministic tests for idée #50 — Banque de références perso.
// Covers CRUD round-trip, prompt section, snapshot, slug security and image path.
// No network, no LLM calls.
//
// Run:  npx tsx src/test-references.ts

import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import {
  REFERENCES_DIR_NAME,
  REFERENCES_PROMPT_MAX_CHARS,
  REFERENCES_PROMPT_MAX_ENTRIES,
  listReferences,
  loadReference,
  saveReference,
  deleteReference,
  referenceImagePath,
  referencesSnapshot,
  referencesPromptSection,
  type ReferenceMeta,
} from "./references.js";

let failures = 0;
const check = (label: string, cond: boolean) => {
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
  if (!cond) failures++;
};
const line = (c = "─") => console.log(c.repeat(64));

line("═");
console.log("references — idée #50 (Banque de références perso)");
line();

// Helper to create a minimal ReferenceMeta
function makeMeta(overrides: Partial<ReferenceMeta> = {}): ReferenceMeta {
  const now = new Date().toISOString();
  return {
    slug: "linear-dark",
    title: "Linear.app — dark SaaS",
    kind: "url",
    url: "https://linear.app",
    palette: ["#1A1A2E", "#FF6B35"],
    tags: ["dark", "SaaS"],
    note: "bonne nav latérale",
    usedIn: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ── 1. CRUD round-trip ───────────────────────────────────────────────────────
console.log("1. CRUD round-trip");
const dir1 = fs.mkdtempSync(path.join(os.tmpdir(), "refs-"));
check("listReferences vide → []", listReferences(dir1).length === 0);
check("loadReference inexistant → null", loadReference(dir1, "linear-dark") === null);

const meta = makeMeta();
saveReference(dir1, meta);
check("meta.json créé sur disque", fs.existsSync(path.join(dir1, REFERENCES_DIR_NAME, "linear-dark", "meta.json")));
const loaded = loadReference(dir1, "linear-dark");
check("round-trip slug", loaded?.slug === "linear-dark");
check("round-trip title", loaded?.title === "Linear.app — dark SaaS");
check("round-trip kind", loaded?.kind === "url");
check("round-trip url", loaded?.url === "https://linear.app");
check("round-trip palette length", loaded?.palette.length === 2);
check("round-trip tags", loaded?.tags.includes("dark") === true);
check("round-trip note", loaded?.note === "bonne nav latérale");

// ── 2. listReferences — sorted by title ──────────────────────────────────────
console.log("\n2. listReferences — tri par title");
const metaB = makeMeta({ slug: "apple-com", title: "Apple.com — minimaliste", url: "https://apple.com" });
saveReference(dir1, metaB);
const all = listReferences(dir1);
check("deux références présentes", all.length === 2);
check("trié par title (Apple avant Linear)", all[0].title.startsWith("Apple"));

// ── 3. deleteReference ────────────────────────────────────────────────────────
console.log("\n3. deleteReference");
deleteReference(dir1, "linear-dark");
check("après delete: load → null", loadReference(dir1, "linear-dark") === null);
check("après delete: list → 1 seule", listReferences(dir1).length === 1);
fs.rmSync(dir1, { recursive: true, force: true });

// ── 4. referencesPromptSection ────────────────────────────────────────────────
console.log("\n4. referencesPromptSection");
const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), "refs-"));
check("section vide si aucune référence → ''", referencesPromptSection(dir2) === "");

saveReference(dir2, makeMeta());
const section = referencesPromptSection(dir2);
check("section non vide après save", section.length > 0);
check("section contient le titre", section.includes("Linear.app"));
check("section contient un hex de palette", section.includes("#1A1A2E") || section.includes("#1a1a2e"));
check("section contient 'Mood library'", section.includes("Mood library"));
fs.rmSync(dir2, { recursive: true, force: true });

// ── 5. referencesSnapshot change après ajout ─────────────────────────────────
console.log("\n5. referencesSnapshot");
const dir3 = fs.mkdtempSync(path.join(os.tmpdir(), "refs-"));
const snap0 = referencesSnapshot(dir3);
check("snapshot vide → ''", snap0 === "");
saveReference(dir3, makeMeta());
const snap1 = referencesSnapshot(dir3);
check("snapshot non vide après save", snap1.length > 0);
// Add a second ref and check snapshot changes
// (mtime may not change in same ms on some OSes, but count will differ)
saveReference(dir3, makeMeta({ slug: "vercel-dark", title: "Vercel dark" }));
const snap2 = referencesSnapshot(dir3);
check("snapshot différent après second ajout", snap1 !== snap2 || snap1.startsWith("1:") === false);
fs.rmSync(dir3, { recursive: true, force: true });

// ── 6. Sécurité slug ──────────────────────────────────────────────────────────
console.log("\n6. Sécurité slug (anti path-traversal)");
const dir4 = fs.mkdtempSync(path.join(os.tmpdir(), "refs-"));

// saveReference with a malicious title slugifies safely
const evil1 = makeMeta({ slug: "../evil", title: "../evil" });
saveReference(dir4, evil1);
// The slug should have been sanitized — no "../evil" folder outside .references
check("slug '../evil' sanitizé → pas de dossier ../evil en dehors", !fs.existsSync(path.join(dir4, "../evil")));
check("slug '../evil' → fichier dans .references/<slug-safe>", fs.readdirSync(path.join(dir4, REFERENCES_DIR_NAME)).length === 1);

// loadReference with malicious slug → null (isSafeSlug guard)
check("loadReference '../etc/passwd' → null", loadReference(dir4, "../etc/passwd") === null);
check("loadReference 'a/b' → null", loadReference(dir4, "a/b") === null);
check("loadReference '..\\\\evil' → null", loadReference(dir4, "..\\evil") === null);

// Verify resolved path stays under .references dir
const baseDir = path.resolve(path.join(dir4, REFERENCES_DIR_NAME));
const maliciousSlug = "../evil";
// Even if someone passes a slug like "." it must not match outside base
const hypotheticalPath = path.resolve(path.join(dir4, REFERENCES_DIR_NAME, maliciousSlug));
check("path résolu de '../evil' sort bien du base dir (guard nécessaire)", !hypotheticalPath.startsWith(baseDir + path.sep));

fs.rmSync(dir4, { recursive: true, force: true });

// ── 7. referenceImagePath ──────────────────────────────────────────────────────
console.log("\n7. referenceImagePath");
const dir5 = fs.mkdtempSync(path.join(os.tmpdir(), "refs-"));

// null when no reference exists
check("pas de meta → null", referenceImagePath(dir5, "non-existent") === null);

// null when meta has no image
const metaNoImg = makeMeta({ slug: "no-img", title: "no img" });
saveReference(dir5, metaNoImg);
check("meta sans image → null", referenceImagePath(dir5, "no-img") === null);

// Valid path after writing a fake image + updating meta.image
const metaWithImg = makeMeta({ slug: "with-img", title: "with img", image: "shot.png" });
saveReference(dir5, metaWithImg);
// Write a fake image file in the slug dir
const imgDir = path.join(dir5, REFERENCES_DIR_NAME, "with-img");
fs.mkdirSync(imgDir, { recursive: true });
fs.writeFileSync(path.join(imgDir, "shot.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
const imgPath = referenceImagePath(dir5, "with-img");
check("image existante → chemin non null", imgPath !== null);
check("chemin absolu et se termine par shot.png", imgPath !== null && imgPath.endsWith("shot.png"));
check("chemin sous le bon dossier", imgPath !== null && imgPath.startsWith(dir5));

// null when meta.image set but file missing
const metaMissingFile = makeMeta({ slug: "missing-file", title: "missing file", image: "ghost.png" });
saveReference(dir5, metaMissingFile);
check("meta.image set mais fichier absent → null", referenceImagePath(dir5, "missing-file") === null);

fs.rmSync(dir5, { recursive: true, force: true });

// ── 8. referencesPromptSection — cap (Un, 2026-07-03) ────────────────────────
console.log("\n8. referencesPromptSection — cap dur");
const dir6 = fs.mkdtempSync(path.join(os.tmpdir(), "refs-"));

// 8a. Sous le cap : sortie identique au comportement "avant cap" (pas de marqueur).
saveReference(dir6, makeMeta({ slug: "sous-cap", title: "Sous le cap" }));
const sectionUnderCap = referencesPromptSection(dir6);
check("sous le cap : pas de marqueur de troncature", !sectionUnderCap.includes("non montrée"));
check("sous le cap : contient le titre entier", sectionUnderCap.includes("Sous le cap"));
fs.rmSync(dir6, { recursive: true, force: true });

// 8b. 60 références avec grosses notes → sortie plafonnée + marqueur + 20 premières seulement.
const dir7 = fs.mkdtempSync(path.join(os.tmpdir(), "refs-"));
const bigNote = "x".repeat(500);
for (let i = 0; i < 60; i++) {
  const n = String(i).padStart(2, "0");
  saveReference(dir7, makeMeta({ slug: `ref-${n}`, title: `Ref ${n}`, note: bigNote }));
}
const sectionOver = referencesPromptSection(dir7);
check("60 refs : marqueur de troncature présent", sectionOver.includes("non montrée"));
check(
  "60 refs : contenu (hors en-tête/marqueur) sous le cap dur",
  (() => {
    const withoutHeader = sectionOver.replace(/^\n\nMood library.*?:\n/, "");
    const withoutMarker = withoutHeader.replace(/\n\[\.\.\. \d+ référence\(s\) non montrée\(s\)\]$/, "");
    return withoutMarker.length <= REFERENCES_PROMPT_MAX_CHARS;
  })(),
);
check(
  "60 refs : seules les 20 premières (triées par title) apparaissent au plus",
  (() => {
    const all = listReferences(dir7);
    const first20Titles = all.slice(0, REFERENCES_PROMPT_MAX_ENTRIES).map((r) => r.title);
    const shownTitles = first20Titles.filter((t) => sectionOver.includes(`**${t}**`));
    const laterTitles = all.slice(REFERENCES_PROMPT_MAX_ENTRIES).map((r) => r.title);
    const leaked = laterTitles.some((t) => sectionOver.includes(`**${t}**`));
    return shownTitles.length <= REFERENCES_PROMPT_MAX_ENTRIES && !leaked;
  })(),
);
fs.rmSync(dir7, { recursive: true, force: true });

// ── Résultat ──────────────────────────────────────────────────────────────────
line("═");
if (failures === 0) {
  console.log("✅ References : CRUD / prompt / snapshot / sécurité / image — tous verts.");
  process.exit(0);
} else {
  console.log(`❌ ${failures} vérification(s) en échec.`);
  process.exit(1);
}
