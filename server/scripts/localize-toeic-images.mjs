import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";

const OUT_BASE = "D:/IA/MangoOS/workspace/toeic-quest/src/data/bank";
const IMG_DIR = "D:/IA/MangoOS/workspace/toeic-quest/public/assets/pexels";
const LEVELS = ["debutant", "intermediaire", "avance"];

mkdirSync(IMG_DIR, { recursive: true });

function extractId(url) {
  const m = url.match(/\/photos\/(\d+)\//);
  return m ? m[1] : null;
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
}

async function main() {
  let downloaded = 0, cached = 0, failed = 0, rewritten = 0;
  const fails = [];

  for (const level of LEVELS) {
    const path = `${OUT_BASE}/${level}.gen.js`;
    let text = readFileSync(path, "utf8");
    const urls = [...new Set(text.match(/https:\/\/images\.pexels\.com\/photos\/\d+\/[^"]*/g) || [])];

    for (const url of urls) {
      const id = extractId(url);
      if (!id) { fails.push(url); failed++; continue; }
      const dest = `${IMG_DIR}/${id}.jpeg`;
      if (!existsSync(dest)) {
        try {
          await download(url, dest);
          downloaded++;
        } catch (e) {
          fails.push(`${url} :: ${e.message}`);
          failed++;
          continue;
        }
      } else {
        cached++;
      }
      const localPath = `/assets/pexels/${id}.jpeg`;
      const before = text;
      text = text.split(url).join(localPath);
      if (text !== before) rewritten++;
    }

    writeFileSync(path, text);
    const remaining = (text.match(/https:\/\/images\.pexels\.com/g) || []).length;
    console.log(`  💾 ${level}.gen.js réécrit — URLs distantes restantes : ${remaining}`);
  }

  console.log(`\n✅ ${downloaded} téléchargées · ${cached} déjà en cache · ${rewritten} références réécrites · ${failed} échecs`);
  if (fails.length) { console.log("⚠ Échecs :"); for (const f of fails) console.log("   - " + f); }
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
