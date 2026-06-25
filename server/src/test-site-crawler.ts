// Tests du crawler borné (#159 Phase 1). Déterministe, ZÉRO réseau : scrape /
// isAllowed / sleep injectés. On exerce : BFS même-domaine + profondeur, borne
// maxPages (truncated), anti-SSRF (page bloquée → skipped, pas de scrape), scrape
// qui lève → skipped (jamais throw), budget de sauts externes + pertinence, dédup,
// et les helpers purs (normalizeUrl / sameSite / relevanceScore / formatCrawlDigest).

import {
  crawlSite,
  normalizeUrl,
  baseDomain,
  sameSite,
  relevanceScore,
  formatCrawlDigest,
  type CrawlDeps,
  type CrawlReport,
} from "./site-crawler.js";
import type { ScrapedPage } from "./vision.js";

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

/** Fabrique un site simulé : map url → {text, links}. */
function fakeDeps(site: Record<string, { title?: string; text?: string; links?: string[] }>, opts: { block?: string[]; boom?: string[] } = {}): {
  deps: CrawlDeps;
  scraped: string[];
} {
  const scraped: string[] = [];
  const deps: CrawlDeps = {
    isAllowed: (u) => !(opts.block ?? []).some((b) => u.includes(b)),
    sleep: async () => {},
    scrape: async (u): Promise<ScrapedPage> => {
      scraped.push(u);
      if ((opts.boom ?? []).some((b) => u.includes(b))) throw new Error("timeout");
      const p = site[u] ?? site[u.replace(/\/$/, "")] ?? {};
      return {
        title: p.title ?? "",
        text: p.text ?? "",
        links: (p.links ?? []).map((href) => ({ href, label: href })),
        truncated: false,
      };
    },
  };
  return { deps, scraped };
}

async function run() {
  console.log("\n[1] Helpers purs");
  {
    check("normalizeUrl retire le fragment", normalizeUrl("https://a.com/x#frag") === "https://a.com/x");
    check("normalizeUrl résout le relatif", normalizeUrl("/p2", "https://a.com/p1") === "https://a.com/p2");
    check("normalizeUrl rejette non-http", normalizeUrl("javascript:alert(1)") === "");
    check("baseDomain sous-domaine", baseDomain("https://sub.exemple.com/x") === "exemple.com");
    check("sameSite vrai cross-sous-domaine", sameSite("https://a.exemple.com", "https://b.exemple.com/x"));
    check("sameSite faux cross-domaine", !sameSite("https://exemple.com", "https://autre.com"));
    check("relevanceScore compte les mots-clés", relevanceScore("guide zelda openworld", ["zelda", "rpg"]) === 1);
  }

  console.log("\n[2] BFS même-domaine + profondeur");
  {
    const site = {
      "https://jeu.com/": { title: "Accueil", text: "page accueil", links: ["https://jeu.com/a", "https://jeu.com/b"] },
      "https://jeu.com/a": { title: "A", text: "page a", links: ["https://jeu.com/c"] },
      "https://jeu.com/b": { title: "B", text: "page b", links: [] },
      "https://jeu.com/c": { title: "C", text: "page c (profondeur 2)", links: [] },
    };
    const { deps, scraped } = fakeDeps(site);
    const r = await crawlSite("https://jeu.com/", { maxDepth: 2, politeDelayMs: 0 }, deps);
    check("4 pages explorées", r.pages.length === 4);
    check("graine en premier", r.pages[0].url === "https://jeu.com/");
    check("profondeur respectée (c en depth 2)", r.pages.find((p) => p.url.endsWith("/c"))?.depth === 2);
    check("aucune page hors domaine", r.pages.every((p) => p.url.includes("jeu.com")));
    check("pas de doublon scrape", new Set(scraped).size === scraped.length);
  }

  console.log("\n[3] Borne maxPages → truncated");
  {
    const site: Record<string, { links: string[] }> = {};
    const links = Array.from({ length: 10 }, (_, i) => `https://big.com/p${i}`);
    site["https://big.com/"] = { links };
    for (const l of links) site[l] = { links: [] };
    const { deps } = fakeDeps(site as never);
    const r = await crawlSite("https://big.com/", { maxPages: 4, politeDelayMs: 0 }, deps);
    check("coupé à 4 pages", r.pages.length === 4);
    check("truncated = true", r.truncated === true);
  }

  console.log("\n[4] Anti-SSRF : un lien PERTINENT mais privé est enfilé PUIS bloqué (jamais scrapé)");
  {
    // Cas d'attaque réaliste : la page pointe un lien « admin » (pertinent vu l'objectif)
    // vers une adresse privée. Il est candidat au crawl, mais l'anti-SSRF le refuse.
    const site = {
      "https://ok.com/": { links: ["https://ok.com/safe", "http://localhost:3000/admin"] },
      "https://ok.com/safe": { text: "ok", links: [] },
    };
    const { deps, scraped } = fakeDeps(site as never, { block: ["localhost"] });
    const r = await crawlSite("https://ok.com/", { objectif: "admin", politeDelayMs: 0 }, deps);
    check("localhost jamais scrapé", !scraped.some((u) => u.includes("localhost")));
    check("localhost dans skipped (SSRF)", r.skipped.some((s) => s.url.includes("localhost") && /SSRF/i.test(s.reason)));
    check("la page sûre, elle, est bien lue", r.pages.some((p) => p.url.endsWith("/safe")));
  }

  console.log("\n[5] scrape qui lève → skipped, ne throw jamais");
  {
    const site = {
      "https://x.com/": { links: ["https://x.com/bad", "https://x.com/good"] },
      "https://x.com/good": { text: "bon", links: [] },
    };
    const { deps } = fakeDeps(site as never, { boom: ["bad"] });
    let threw = false;
    let r: CrawlReport | undefined;
    try {
      r = await crawlSite("https://x.com/", { politeDelayMs: 0 }, deps);
    } catch {
      threw = true;
    }
    check("ne throw jamais", !threw);
    check("page bonne lue, mauvaise skipped", !!r && r.pages.some((p) => p.url.endsWith("/good")) && r.skipped.some((s) => s.url.endsWith("/bad")));
  }

  console.log("\n[6] Sauts externes : budget + pertinence");
  {
    const site = {
      "https://hub.com/": {
        text: "accueil",
        links: ["https://wiki-zelda.com/guide", "https://spam-casino.com/win", "https://hub.com/p1"],
      },
      "https://hub.com/p1": { text: "p1", links: [] },
      "https://wiki-zelda.com/guide": { text: "guide zelda", links: [] },
      "https://spam-casino.com/win": { text: "casino", links: [] },
    };
    const { deps } = fakeDeps(site as never);
    const r = await crawlSite("https://hub.com/", { objectif: "zelda", maxExternalHops: 1, politeDelayMs: 0 }, deps);
    check("le saut externe PERTINENT (zelda) est suivi", r.pages.some((p) => p.url.includes("wiki-zelda")));
    check("le saut externe NON pertinent (casino) est écarté", !r.pages.some((p) => p.url.includes("casino")));
    check("page externe marquée external", r.pages.find((p) => p.url.includes("wiki-zelda"))?.external === true);
  }

  console.log("\n[7] URL graine invalide → rapport vide, pas de throw");
  {
    const { deps } = fakeDeps({});
    const r = await crawlSite("pas une url", {}, deps);
    check("0 page + skipped 'URL invalide'", r.pages.length === 0 && r.skipped.some((s) => /invalide/i.test(s.reason)));
  }

  console.log("\n[8] formatCrawlDigest (pur)");
  {
    const report: CrawlReport = {
      seed: "https://s.com/",
      pages: [
        { url: "https://s.com/", title: "Titre", text: "x".repeat(3000), links: [{ href: "https://s.com/a", label: "Aller A" }], depth: 0, external: false },
        { url: "https://ext.com/g", title: "Externe", text: "ext", links: [], depth: 1, external: true },
      ],
      skipped: [],
      truncated: false,
    };
    const d = formatCrawlDigest(report, 100);
    check("titre + url présents", d.includes("Titre") && d.includes("https://s.com/"));
    check("texte tronqué à la borne", d.includes("…") && !d.includes("x".repeat(200)));
    check("page externe préfixée ↗", d.includes("↗ Externe"));
    check("liens listés", d.includes("Aller A"));
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} site-crawler : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
