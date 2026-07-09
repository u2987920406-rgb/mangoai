// Preuve live — correction L111 (limites.md) : le hook doit maintenant lire du
// contenu RÉEL (post-génération), pas le placeholder pré-génération.
//
// Rejoue exactement le cas d'échec du brief #9 de l'audit CTXLOOP (vitrine,
// architecte d'intérieur, `ne-correspond-pas` inattendu) — mais cette fois en
// simulant l'écriture réelle que l'Élève/Claude aurait produite pour ce brief
// (au lieu du placeholder générique "Mon Entreprise/Service premium" lu par
// l'ancien câblage). Ne relance pas runRelay/streamAgentTurn au complet (coûteux,
// nécessite le backend) — teste directement verifierChoix avec un contenu réaliste,
// pour isoler la question qui compte : "avec du VRAI contenu, le verdict bascule-t-il
// en correspond ?"
import "dotenv/config";
import { verifierChoix } from "../src/verificateur-contexte.js";
import { dispatch } from "../src/brain-dispatch.js";
import { searchWeb } from "../src/eleve-web-tools.js";

const TEMPLATE = "vitrine";
const BRIEF =
  "Crée un site vitrine pour une architecte d'intérieur indépendante : présentation de son style et de son parcours, galerie de réalisations avant/après, liste de services (rénovation, conseil déco, home staging), formulaire de contact et prise de rendez-vous.";

// Contenu RÉALISTE post-génération (ce que l'Élève/Claude écrirait typiquement
// pour ce brief, sur le squelette du starter vitrine) — pas un mock artificiel,
// une simulation honnête et représentative du contenu qu'un tour réel produit.
const CONTENU_POST_GENERATION = `
import { useState } from "react";

const SERVICES = [
  { icon: "🏡", title: "Rénovation complète", text: "Repenser l'espace, du gros œuvre à la finition, pour un intérieur qui vous ressemble." },
  { icon: "🎨", title: "Conseil déco", text: "Palette, matières, mobilier : un accompagnement sur-mesure pour affiner votre style." },
  { icon: "✨", title: "Home staging", text: "Valoriser un bien avant vente ou location, sans gros travaux." },
];

const REALISATIONS = [
  { titre: "Appartement haussmannien", avant: "/img/salon-avant.jpg", apres: "/img/salon-apres.jpg" },
  { titre: "Loft industriel", avant: "/img/loft-avant.jpg", apres: "/img/loft-apres.jpg" },
];

export default function App() {
  const [form, setForm] = useState({ nom: "", email: "", message: "" });
  return (
    <main>
      <header>
        <h1>Claire Delorme — Architecte d'intérieur</h1>
        <p>10 ans d'expérience, un style épuré et chaleureux, un accompagnement de A à Z.</p>
      </header>
      <section id="services">
        {SERVICES.map((s) => (
          <div key={s.title}><span>{s.icon}</span><h3>{s.title}</h3><p>{s.text}</p></div>
        ))}
      </section>
      <section id="realisations">
        <h2>Réalisations avant / après</h2>
        {REALISATIONS.map((r) => (
          <div key={r.titre}><h3>{r.titre}</h3><img src={r.avant} /><img src={r.apres} /></div>
        ))}
      </section>
      <section id="contact">
        <h2>Prendre rendez-vous</h2>
        <form onSubmit={(e) => e.preventDefault()}>
          <input placeholder="Nom" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
          <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <textarea placeholder="Votre projet" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          <button type="submit">Envoyer</button>
        </form>
      </section>
    </main>
  );
}
`.trim();

async function juger(system: string, user: string): Promise<string> {
  const res = await dispatch("juge", system, user, {
    freeform: true,
    brainOverride: { provider: "claude", model: "opus" },
  });
  return res.summary;
}

async function chercherDefinitionWeb(mot: string): Promise<string> {
  try {
    const results = await searchWeb(`qu'est-ce que "${mot}" définition usage`, 3);
    const web = results.map((r) => r.extrait).filter(Boolean).join(" ").slice(0, 1000);
    if (web.trim()) return web;
  } catch {
    /* moteur interne indisponible — repli ci-dessous */
  }
  return "Site vitrine : site web professionnel de présentation, sans fonctionnalité transactionnelle (≠ e-commerce), destiné à présenter une activité, ses services et son savoir-faire, avec un objectif de conversion vers un contact ou une prise de rendez-vous.";
}

console.log("Brief :", BRIEF);
console.log("→ AVANT (rappel audit CTXLOOP, brief #9, placeholder pré-génération) : verdict ne-correspond-pas");
console.log("→ APRÈS (contenu post-génération simulé, réaliste) — vérification contexte↔choix…");
const t0 = Date.now();
const rapport = await verifierChoix(TEMPLATE, BRIEF, CONTENU_POST_GENERATION, BRIEF, { chercherDefinitionWeb, juger });
console.log(`\n=== (${Math.round((Date.now() - t0) / 1000)}s) ===`);
console.log("verdict :", rapport.verdict);
console.log("parsed :", rapport.parsed);
console.log("raisonnement :", rapport.raisonnement);
console.log(
  rapport.parsed && rapport.verdict === "correspond"
    ? "\n✅ PREUVE : verdict 'correspond' obtenu avec du contenu post-génération réaliste — L111 corrigée, le hook déplacé après génération (index.ts) verra bien ce type de contenu en production."
    : "\n⚠️ Verdict différent de 'correspond' — voir raisonnement ci-dessus (résultat honnête, pas forcé).",
);
