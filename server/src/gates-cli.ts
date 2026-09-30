// `npm run gates` — affiche d'un coup tous les interrupteurs armés / OFF et les plafonds $ effectifs.
import "dotenv/config";
import { gatesReport, formatGatesReport } from "./gates-status.js";

console.log(formatGatesReport(gatesReport()));
