// Test de mergePackageJson (fix F4) — la fusion préserve les deps de base
// (@tailwindcss/vite, tailwindcss…) quand un template apporte son propre package.json.
import { mergePackageJson } from "./projects.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}`);
  }
}

const base = {
  name: "generated-app",
  version: "0.0.0",
  scripts: { dev: "vite", build: "vite build" },
  dependencies: { react: "^19.2.0", "react-dom": "^19.2.0" },
  devDependencies: { "@tailwindcss/vite": "^4.1.0", tailwindcss: "^4.1.0", vite: "^7.0.0" },
};

console.log("[1] mergePackageJson : un template avec son propre package.json");
{
  // Cas mantine (F4) : pkg propre SANS @tailwindcss/vite.
  const tpl = {
    name: "mango-app",
    dependencies: { "@mantine/core": "^7.14.0", recharts: "^2.12.0" },
    devDependencies: { "@vitejs/plugin-react": "^4.0.0", vite: "^7.0.0" },
  };
  const merged = mergePackageJson(base, tpl);
  check("@tailwindcss/vite SURVIT (le bug F4)", merged.devDependencies?.["@tailwindcss/vite"] === "^4.1.0");
  check("tailwindcss survit", merged.devDependencies?.["tailwindcss"] === "^4.1.0");
  check("deps de base (react) survivent", merged.dependencies?.["react"] === "^19.2.0");
  check("deps du template ajoutées (@mantine/core)", merged.dependencies?.["@mantine/core"] === "^7.14.0");
  check("deps du template ajoutées (recharts)", merged.dependencies?.["recharts"] === "^2.12.0");
  check("devDeps du template ajoutées (@vitejs/plugin-react)", merged.devDependencies?.["@vitejs/plugin-react"] === "^4.0.0");
  check("scripts de base conservés", merged.scripts?.["dev"] === "vite");
  check("nom de base conservé", merged.name === "generated-app");
}

console.log("\n[2] mergePackageJson : le template gagne sur conflit de version");
{
  const tpl = { dependencies: { react: "^18.3.0" } };
  const merged = mergePackageJson(base, tpl);
  check("version react du template prime sur conflit", merged.dependencies?.["react"] === "^18.3.0");
  check("react-dom de base intact", merged.dependencies?.["react-dom"] === "^19.2.0");
}

console.log(`\n${fail === 0 ? "✅" : "❌"} projects : ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
