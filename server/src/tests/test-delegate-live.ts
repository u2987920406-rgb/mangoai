// Preuve live de la délégation : consulte un VRAI agent forgé (Ollama local, $0).
import "dotenv/config"
import { consultSpecialist } from "../specialist/specialist-delegate.js"

const main = async () => {
  const task = "Lis un PDF scanné (image, sans couche texte) d'une facture et extrais les montants pour l'app."
  console.log(`Tâche : ${task}\nBlocage simulé : plafond d'itérations.\n→ consultSpecialist…\n`)
  const r = await consultSpecialist({ task, blockage: "plafond d'itérations atteint sans finir" })
  if (!r) { console.log("Aucun spécialiste pertinent (ou invocation KO)."); return }
  console.log(`🤝 Délégué à : « ${r.agent.name} » (cible ${r.agent.lacune}, score ${r.score}, cerveau ${r.agent.provider}/${r.agent.model})\n`)
  console.log("Analyse renvoyée (extrait) :\n" + r.advice.slice(0, 900))
}
main().catch((e) => { console.error("delegate-live:", e); process.exit(1) })
