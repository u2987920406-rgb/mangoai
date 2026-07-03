// Test de la logique PURE d'esthete-routes.ts : construction du contexte texte
// (buildTask) à partir de l'historique — fenêtre glissante, filtrage des rôles
// non-conversationnels (tool/status/error), pas de crash sur historique vide.
import { buildTask, MAX_HISTORY_CONTEXT } from "./esthete-routes.js"
import type { ChatEntry } from "./history.js"

let pass = 0
let fail = 0
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}

const entry = (role: ChatEntry["role"], text: string): ChatEntry => ({ role, text, ts: new Date(0).toISOString() })

console.log("─".repeat(60))
console.log("test-esthete-routes")
console.log("─".repeat(60))

// ---- Historique vide : pas de préambule, juste le message ----
{
  const task = buildTask([], "rends le bouton plus arrondi")
  check("historique vide → pas de 'Conversation en cours'", !task.includes("Conversation en cours"))
  check("historique vide → contient le message", task.includes("rends le bouton plus arrondi"))
}

// ---- Historique présent : contexte + nouveau message ----
{
  const history: ChatEntry[] = [entry("user", "regarde la page d'accueil"), entry("agent", "j'ai ajouté un effet de survol")]
  const task = buildTask(history, "et sur mobile ?")
  check("historique présent → préambule de contexte", task.includes("Conversation en cours"))
  check("contient le tour user précédent", task.includes("regarde la page d'accueil"))
  check("contient le tour agent précédent", task.includes("j'ai ajouté un effet de survol"))
  check("contient le nouveau message", task.includes("et sur mobile ?"))
}

// ---- Rôles non-conversationnels filtrés (tool/status/error) ----
{
  const history: ChatEntry[] = [
    entry("user", "demande initiale"),
    entry("tool", "vois_ecran appelé"),
    entry("status", "Gardien : correction 1/2"),
    entry("error", "timeout réseau"),
    entry("agent", "voilà ce que j'ai fait"),
  ]
  const task = buildTask(history, "suite")
  check("tool exclu du transcript", !task.includes("vois_ecran appelé"))
  check("status exclu du transcript", !task.includes("Gardien : correction"))
  check("error exclu du transcript", !task.includes("timeout réseau"))
  check("user/agent conservés", task.includes("demande initiale") && task.includes("voilà ce que j'ai fait"))
}

// ---- Fenêtre glissante : seuls les MAX_HISTORY_CONTEXT derniers tours comptent ----
{
  const history: ChatEntry[] = []
  for (let i = 0; i < MAX_HISTORY_CONTEXT + 5; i++) history.push(entry("user", `message numéro ${i}`))
  const task = buildTask(history, "dernier")
  check("le tour le plus ANCIEN est hors fenêtre (tronqué)", !task.includes("message numéro 0"))
  check("le tour le plus RÉCENT de l'historique est dans la fenêtre", task.includes(`message numéro ${MAX_HISTORY_CONTEXT + 4}`))
}

console.log(`\nesthete-routes : ${pass}/${pass + fail}`)
if (fail > 0) process.exit(1)
