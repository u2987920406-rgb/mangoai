// Tests des helpers PURS de site-crawler.ts (#159 Phase 1).
// Déterministe, ZÉRO réseau. On vérifie notamment la dédup `www.`/apex (L12).

import { normalizeUrl, baseDomain, sameSite, relevanceScore, isBoilerplateLink, linkText } from "./site-crawler-helpers.js";

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

function run() {
  console.log("\n[1] normalizeUrl — base + fragment + protocole");
  {
    check("absolue via base", normalizeUrl("/about", "https://jeu.com") === "https://jeu.com/about");
    check("fragment retiré", normalizeUrl("https://jeu.com/page#section") === "https://jeu.com/page");
    check("query conservée", normalizeUrl("https://jeu.com/search?q=test") === "https://jeu.com/search?q=test");
    check("non-http → vide", normalizeUrl("mailto:a@b.com") === "");
    check("invalide → vide", normalizeUrl(":::not-a-url") === "");
  }

  console.log("\n[2] normalizeUrl — dédup www./apex (L12)");
  {
    const www = normalizeUrl("https://www.exemple.com/page");
    const apex = normalizeUrl("https://exemple.com/page");
    check("www. retiré de l'hôte", www === "https://exemple.com/page");
    check("www et apex → même URL normalisée", www === apex);
    check("www. retiré même avec query", normalizeUrl("https://www.exemple.com/s?q=1") === "https://exemple.com/s?q=1");
    check("sous-domaine non-www préservé", normalizeUrl("https://blog.exemple.com/p") === "https://blog.exemple.com/p");
    check("www. seul (pas d'autre sous-domaine) retiré", normalizeUrl("https://www.blog.exemple.com/p") === "https://blog.exemple.com/p");
  }

  console.log("\n[3] baseDomain");
  {
    check("domaine simple", baseDomain("https://exemple.com/p") === "exemple.com");
    check("sous-domaine → apex", baseDomain("https://blog.exemple.com/p") === "exemple.com");
    check("www. → apex", baseDomain("https://www.exemple.com/p") === "exemple.com");
    check("host brut accepté", baseDomain("exemple.org") === "exemple.org");
    check("co.uk style → 2 labels", baseDomain("https://shop.co.uk/x") === "co.uk");
  }

  console.log("\n[4] sameSite");
  {
    check("même domaine = true", sameSite("https://exemple.com/a", "https://exemple.com/b"));
    check("www vs apex = true (L12)", sameSite("https://www.exemple.com/a", "https://exemple.com/b"));
    check("sous-domaine vs apex = true", sameSite("https://blog.exemple.com/a", "https://exemple.com/b"));
    check("domaines différents = false", !sameSite("https://exemple.com", "https://autre.com"));
    check("vide = false", !sameSite("", "https://exemple.com"));
  }

  console.log("\n[5] relevanceScore");
  {
    check("mots-clés présents", relevanceScore("le jeu d'aventure", ["jeu", "aventure"]) === 2);
    check("mot < 3 lettres ignoré", relevanceScore("le jeu", ["le", "jeu"]) === 1);
    check("aucun match = 0", relevanceScore("rien à voir", ["jeu"]) === 0);
    check("insensible à la casse", relevanceScore("JEU AVENTURE", ["jeu", "aventure"]) === 2);
  }

  console.log("\n[6] isBoilerplateLink");
  {
    check("login = boilerplate", isBoilerplateLink("Log in", "https://x.com/login"));
    check("signup = boilerplate", isBoilerplateLink("Sign up", "https://x.com/signup"));
    check("privacy = boilerplate", isBoilerplateLink("Privacy", "https://x.com/privacy"));
    check("contenu normal = false", !isBoilerplateLink("Gameplay", "https://x.com/gameplay"));
    check("redirect param = boilerplate", isBoilerplateLink("Retour", "https://x.com/page?redirect=home"));
  }

  console.log("\n[7] linkText");
  {
    const t = linkText("Voir le gameplay", "https://jeu.com/gameplay");
    check("contient le libellé", t.includes("Voir le gameplay"));
    check("contient le chemin décodé", t.includes("gameplay"));
    check("url invalide → libellé seul", linkText("Lien", ":::").includes("Lien"));
  }

  console.log(`\n${pass} passés, ${fail} échoués`);
  if (fail > 0) process.exit(1);
}

run();
