// Tests du matching tolérant aux fins de ligne (edit-match.ts). Pur, déterministe.

import { resolveEdit } from "./edit-match.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

console.log("\n[1] LE BUG : find en LF sur un fichier CRLF → doit matcher (aligné)");
{
  const before = "ligne1\r\nligne2\r\nligne3\r\n";
  const res = resolveEdit(before, "ligne2\nligne3", "X\nY");
  check("trouvé malgré CRLF↔LF", res.ok === true);
  if (res.ok) {
    check("flag aligned=true", res.aligned === true);
    check("replace inséré EN CRLF (convention du fichier)", res.after === "ligne1\r\nX\r\nY\r\n");
  }
}

console.log("\n[2] Rétro-compat : find exact (même convention) marche, sans alignement");
{
  const before = "a\r\nb\r\nc";
  const res = resolveEdit(before, "b\r\nc", "Z");
  check("trouvé exact", res.ok === true && (res.ok && res.after === "a\r\nZ"));
  check("aligned=false (match direct)", res.ok && res.aligned === false);
}

console.log("\n[3] Fichier LF + find LF (cas Unix) → marche");
{
  const before = "x\ny\nz\n";
  const res = resolveEdit(before, "y\nz", "Q");
  check("trouvé", res.ok === true && (res.ok && res.after === "x\nQ\n"));
}

console.log("\n[4] Fichier LF + find CRLF → aligné vers LF");
{
  const before = "x\ny\nz\n";
  const res = resolveEdit(before, "y\r\nz", "Q\r\nR");
  check("trouvé (CRLF→LF)", res.ok === true);
  check("replace inséré en LF", res.ok && res.after === "x\nQ\nR\n");
}

console.log("\n[5] Garde : introuvable");
{
  const res = resolveEdit("abc\r\ndef\r\n", "zzz\nyyy", "Q");
  check("introuvable → reason", res.ok === false && res.reason === "introuvable");
}

console.log("\n[6] Garde : ambigu (2+ occurrences) — y compris après alignement");
{
  const before = "foo\r\nbar\r\nfoo\r\nbar\r\n";
  const res = resolveEdit(before, "foo\nbar", "X");
  check("ambigu détecté malgré l'alignement", res.ok === false && res.reason === "ambigu");
}

console.log("\n[7] Édition sur une seule ligne (pas de newline) — inchangé");
{
  const before = "const x = 1;\r\nconst y = 2;\r\n";
  const res = resolveEdit(before, "const x = 1;", "const x = 42;");
  check("remplacement simple", res.ok === true && (res.ok && res.after === "const x = 42;\r\nconst y = 2;\r\n"));
}

console.log("\n[8] find vide → introuvable (pas de remplacement absurde)");
{
  const res = resolveEdit("abc\r\n", "", "X");
  check("find vide refusé", res.ok === false && res.reason === "introuvable");
}

console.log(`\n${fail === 0 ? "✅" : "❌"} edit-match : ${pass}/${pass + fail} (échecs : ${fail})`);
if (fail > 0) process.exit(1);
