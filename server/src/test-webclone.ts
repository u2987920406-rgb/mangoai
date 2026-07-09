// Preuve déterministe du garde-fou d'URL du clone-from-URL (alternative native
// à Figma). La capture elle-même est réseau/Playwright (non testée ici) ; on
// verrouille le filtre isCloneableUrl : http(s) publics seulement, pas de
// localhost/plages privées (hygiène anti-SSRF, et n'attaque pas l'aperçu local).
//
// Lancer :  npx tsx src/test-webclone.ts

import { isCloneableUrl } from "./vision.js";

import { line, makeCheck } from "./test-util.js";
let failures = 0;
const check = makeCheck(() => { failures++; });

line("═");
console.log("webclone — garde-fou isCloneableUrl");
line();

// Acceptés : sites publics http(s)
check("https public", isCloneableUrl("https://stripe.com"));
check("http public + chemin", isCloneableUrl("http://example.com/pricing"));
check("sous-domaine + port", isCloneableUrl("https://app.acme.io:8443/x"));

// Rejetés : protocole, localhost, plages privées, saisies invalides
check("ftp rejeté", !isCloneableUrl("ftp://example.com"));
check("localhost rejeté", !isCloneableUrl("http://localhost:5173"));
check("127.0.0.1 rejeté", !isCloneableUrl("http://127.0.0.1:3000"));
check("192.168.x rejeté", !isCloneableUrl("http://192.168.1.10"));
check("10.x rejeté", !isCloneableUrl("http://10.0.0.5"));
check("172.16.x rejeté (privé)", !isCloneableUrl("http://172.16.0.1"));
check("172.32.x ACCEPTÉ (hors plage privée)", isCloneableUrl("http://172.32.0.1"));
check("*.local rejeté", !isCloneableUrl("http://imprimante.local"));
check("texte non-URL rejeté", !isCloneableUrl("coucou"));
check("vide rejeté", !isCloneableUrl(""));

line("═");
console.log(failures === 0 ? "✅ Garde-fou prouvé (http(s) publics only)." : `❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
