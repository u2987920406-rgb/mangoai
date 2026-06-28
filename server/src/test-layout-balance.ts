// Tests du détecteur d'équilibre de mise en page (layout-balance.ts). Pur, déterministe.

import {
  findUncentered,
  scanFilesForBalance,
  formatBalanceRaison,
  type BalanceFinding,
} from "./layout-balance.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

console.log("\n[1] JSX — LE BUG : max-w large SANS mx-auto → signalé");
{
  const code = `<div className="relative z-10 mt-12 grid grid-cols-3 gap-4 px-5 max-w-3xl">x</div>`;
  const f = findUncentered(code, "Hero.jsx");
  check("1 finding", f.length === 1);
  check("kind jsx-maxw-no-center", f[0]?.kind === "jsx-maxw-no-center");
  check("ligne 1", f[0]?.line === 1);
}

console.log("\n[2] JSX — max-w AVEC mx-auto → OK (pas de finding)");
{
  const code = `<div className="mx-auto max-w-7xl px-5 py-32">ok</div>`;
  check("0 finding", findUncentered(code, "App.jsx").length === 0);
}

console.log("\n[3] JSX — m-auto compte aussi comme centrage");
{
  const code = `<section className="max-w-4xl m-auto p-8">ok</section>`;
  check("0 finding (m-auto)", findUncentered(code, "App.jsx").length === 0);
}

console.log("\n[4] JSX — petits max-w (xs/sm/md) IGNORÉS (cartes centrées par flex)");
{
  const code = `<div className="max-w-sm px-4"><div className="max-w-md">card</div></div>`;
  check("0 finding (petits max-w hors cible)", findUncentered(code, "Card.jsx").length === 0);
}

console.log("\n[5] JSX — asymétrie VOLONTAIRE (ml-auto) → pas signalée");
{
  const code = `<div className="max-w-2xl ml-auto pr-8">aligné à droite exprès</div>`;
  check("0 finding (ml-auto = voulu)", findUncentered(code, "App.jsx").length === 0);
}

console.log("\n[6] JSX — max-w-full / max-w-none → jamais signalés");
{
  const code = `<div className="max-w-full px-6">a</div><div className="max-w-none">b</div>`;
  check("0 finding", findUncentered(code, "App.jsx").length === 0);
}

console.log("\n[7] JSX — className={cn(\"…\")} et template literal détectés");
{
  const a = `<div className={cn("max-w-5xl px-4", active && "ring")}>x</div>`;
  const b = "<div className={`max-w-6xl py-10`}>y</div>";
  check("cn() littéral signalé", findUncentered(a, "A.jsx").length === 1);
  check("template literal signalé", findUncentered(b, "B.jsx").length === 1);
}

console.log("\n[8] CSS — LE BUG : max-width fixe SANS margin auto → signalé");
{
  const code = `.hero-content {\n  position: relative;\n  z-index: 2;\n  max-width: 760px;\n  padding: 80px 24px;\n}`;
  const f = findUncentered(code, "index.css");
  check("1 finding", f.length === 1);
  check("kind css-maxwidth-no-center", f[0]?.kind === "css-maxwidth-no-center");
}

console.log("\n[9] CSS — max-width AVEC margin:0 auto → OK");
{
  const code = `.section { max-width: 1200px; margin: 0 auto; padding: 5rem 1.5rem; }`;
  check("0 finding (margin auto)", findUncentered(code, "index.css").length === 0);
}

console.log("\n[10] CSS — margin-inline:auto et margin-left/right:auto comptent");
{
  const a = `.wrap { max-width: 900px; margin-inline: auto; }`;
  const b = `.box { max-width: 60rem; margin-left: auto; margin-right: auto; }`;
  check("margin-inline auto → OK", findUncentered(a, "a.css").length === 0);
  check("margin-left/right auto → OK", findUncentered(b, "b.css").length === 0);
}

console.log("\n[11] CSS — max-width:100% ou none → ignorés (suivent le parent)");
{
  const code = `.img { max-width: 100%; }\n.fluid { max-width: none; }`;
  check("0 finding", findUncentered(code, "index.css").length === 0);
}

console.log("\n[12] CSS — bloc auto-positionné (absolute/transform) → pas de faux positif");
{
  const code = `.overlay { position: absolute; left: 50%; transform: translateX(-50%); max-width: 800px; }`;
  check("0 finding (centré par transform)", findUncentered(code, "index.css").length === 0);
}

console.log("\n[13] scanFilesForBalance — agrège via un lecteur injecté, ignore les non-trouvés");
{
  const fs: Record<string, string> = {
    "src/Hero.jsx": `<div className="max-w-3xl px-5">x</div>`,
    "src/index.css": `.hero { max-width: 700px; padding: 2rem; }`,
    "src/ok.jsx": `<div className="mx-auto max-w-5xl">ok</div>`,
    "README.md": `max-w-3xl mais pas du code`,
  };
  const findings = scanFilesForBalance(
    ["src/Hero.jsx", "src/index.css", "src/ok.jsx", "README.md", "src/absent.jsx"],
    (f) => fs[f] ?? null,
  );
  check("2 findings (Hero + css, pas ok ni md ni absent)", findings.length === 2);
  check("README.md ignoré (extension)", !findings.some((x) => x.file.endsWith(".md")));
}

console.log("\n[14] formatBalanceRaison — message non vide + cite fichiers, vide si rien");
{
  const findings: BalanceFinding[] = [
    { file: "src/Hero.jsx", line: 46, kind: "jsx-maxw-no-center", snippet: "max-w-3xl px-5" },
  ];
  const r = formatBalanceRaison(findings);
  check("contient STRUCTURE", r.includes("STRUCTURE"));
  check("contient mx-auto", r.includes("mx-auto"));
  check("cite le fichier:ligne", r.includes("src/Hero.jsx:46"));
  check("vide si aucun finding", formatBalanceRaison([]) === "");
}

console.log(`\n${pass} ✓ / ${fail} ✗`);
if (fail > 0) process.exit(1);
