// D7 (audit 2026-09-28, constat B10) — preuve du CACHE du registre des cerveaux.
//
// Ce que ce test doit prouver, et rien d'autre :
//   (a) deux lectures consécutives ne font qu'UNE lecture disque (le compteur
//       `brainRegistryCacheStats().diskReads` est la preuve, pas une impression) ;
//   (b) l'ÉDITION À CHAUD marche encore : le fichier modifié (mtime neuf) est relu,
//       sans redémarrage — c'est la propriété que le cache n'avait pas le droit de
//       casser (Atelier des cerveaux) ;
//   (c) `saveBrainRegistry` invalide explicitement (ne pas dépendre de l'horloge) ;
//   (d) le résultat reste une COPIE : muter ce que renvoie getBrain ne corrompt pas
//       le cache (le contrat d'avant, où chaque appel construisait un objet neuf) ;
//   (e) fichier absent → défauts, et BRAIN_LOCAL_ONLY reste appliqué SUR un cache-hit.
//
// Aucun réseau, aucun appel modèle : uniquement un fichier temporaire.

import fs from "node:fs"
import os from "node:os"
import path from "node:path"

let pass = 0, fail = 0
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mango-brain-cache-"))
const file = path.join(tmp, "brain-registry.json")

function writeRegistry(model: string, mtimeSeconds?: number): void {
  fs.writeFileSync(file, JSON.stringify({ codeur: { provider: "ollama", model } }, null, 2))
  // mtime forcé : garantit un horodatage DIFFÉRENT même si l'écriture tombe dans la
  // même granularité d'horloge que la précédente (le test ne doit pas dépendre du FS).
  if (mtimeSeconds !== undefined) {
    const t = new Date(mtimeSeconds * 1000)
    fs.utimesSync(file, t, t)
  }
}

writeRegistry("modele-a", 1_700_000_000)
process.env.BRAIN_REGISTRY_FILE = file
delete process.env.BRAIN_LOCAL_ONLY

// Import APRÈS avoir posé BRAIN_REGISTRY_FILE (registryFile() est paresseux, mais on
// veut aussi un module fraîchement chargé, donc un cache vierge).
const {
  getBrain,
  loadBrainRegistry,
  saveBrainRegistry,
  brainRegistryCacheStats,
  resetBrainRegistryCache,
} = await import("../brain/brain-registry.js")

async function run() {
  // ── (a) deux lectures → une seule lecture disque ──────────────────────────
  resetBrainRegistryCache()
  const first = getBrain("codeur")
  const second = getBrain("codeur")
  const statsA = brainRegistryCacheStats()
  check("1ʳᵉ lecture : la valeur du fichier est servie", first.model === "modele-a")
  check("2ᵉ lecture : même valeur", second.model === "modele-a")
  check(`2 lectures → 1 SEULE lecture disque (diskReads=${statsA.diskReads})`, statsA.diskReads === 1)
  check(`2ᵉ lecture servie par le cache (hits=${statsA.hits})`, statsA.hits === 1)

  // 10 lectures de plus : toujours une seule lecture disque (le cas des 75 sites d'appel).
  for (let i = 0; i < 10; i++) getBrain("codeur")
  const statsB = brainRegistryCacheStats()
  check(`12 lectures au total → toujours 1 lecture disque (diskReads=${statsB.diskReads})`, statsB.diskReads === 1)

  // ── (b) ÉDITION À CHAUD : mtime neuf → valeur relue, sans redémarrage ─────
  writeRegistry("modele-b", 1_700_000_060) // +60 s
  const hot = getBrain("codeur")
  const statsC = brainRegistryCacheStats()
  check("édition à chaud : la NOUVELLE valeur est lue", hot.model === "modele-b")
  check(`édition à chaud : une 2ᵉ lecture disque a eu lieu (diskReads=${statsC.diskReads})`, statsC.diskReads === 2)

  // ── (c) saveBrainRegistry invalide explicitement ──────────────────────────
  const reg = loadBrainRegistry()
  reg.codeur = { provider: "ollama", model: "modele-c" }
  saveBrainRegistry(reg)
  check("après saveBrainRegistry : la valeur écrite est relue", getBrain("codeur").model === "modele-c")

  // ── (d) le résultat est une COPIE (muter ne corrompt pas le cache) ────────
  const mine = getBrain("codeur")
  mine.model = "mutation-locale"
  check("muter le résultat ne corrompt pas le cache", getBrain("codeur").model === "modele-c")

  // ── (e) fichier absent → défauts ; BRAIN_LOCAL_ONLY appliqué sur cache-hit ─
  process.env.BRAIN_LOCAL_ONLY = "on"
  const local = getBrain("codeur") // servi par le CACHE, rideau de fer ré-appliqué
  check("BRAIN_LOCAL_ONLY pris en compte même sur un cache-hit", local.localOnly === true)
  delete process.env.BRAIN_LOCAL_ONLY
  check("rideau de fer retiré : localOnly retombe", getBrain("codeur").localOnly !== true)

  const missing = path.join(tmp, "absent.json")
  process.env.BRAIN_REGISTRY_FILE = missing
  const def = getBrain("codeur")
  check("fichier absent → repli sur DEFAULT_REGISTRY", def.model === "qwythos-tools:q6")
  process.env.BRAIN_REGISTRY_FILE = file
  check("retour au fichier présent → sa valeur à nouveau", getBrain("codeur").model === "modele-c")

  fs.rmSync(tmp, { recursive: true, force: true })
  console.log(`\n${fail === 0 ? "✅" : "❌"} brain-registry-cache : ${pass} pass, ${fail} fail`)
  if (fail > 0) process.exit(1)
}

run().catch((e) => { console.error(e); process.exit(1) })
