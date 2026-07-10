/*
  ANGLE : « L'atelier vivant — regarde une idée devenir une app, gardée par le goût. »
  Pas une landing SaaS : un atelier de nuit. La matière (pierre, argile, métal) rencontre
  la machine (le pipeline, les verdicts). Palette anchor: mango violet studio —
  violet signature #7c5cff (la discipline), mangue chaude #ffab5e (l'étincelle de forge),
  vrais gris, zéro dégradé arc-en-ciel. Typo : Fraunces (display, chaleur artisanale)
  × Archivo (grotesque lisible). Moment typographique fort : « vivant » en italique géant.
  Tous les faits cités viennent du wiki MangoOS (kernel, boucle-curation, moteur-gout,
  gardien-cloture, mangoqa, eleve-local) — rien d'inventé.
*/
import Pipeline from "./Pipeline.jsx";
import Reveal from "./Reveal.jsx";

const CHAINE = [
  {
    n: "Kernel",
    ref: "#108",
    title: "Tout est observable, le cerveau est remplaçable",
    text:
      "Cinq piliers : un Brain Adapter interchangeable par variable d'environnement, un Event Bus où chaque événement passe, un Blackboard d'artefacts persistant, un registre d'outils neutre, et du tracing OpenTelemetry local-first. MangoQA observe tout par là — sans jamais toucher au flux.",
  },
  {
    n: "Boucle de curation",
    ref: "#117 → #130",
    title: "Chaque projet rend les suivants meilleurs",
    text:
      "Mesurer, réinjecter, prouver, orienter. Sur un run réel, le taux de réutilisation d'artefacts est monté de 0 % à 67 %, et les tours avec réutilisation ont coûté environ 10 % de moins. Quand les données manquent, le verdict est « insufficient » — l'honnêteté est câblée.",
  },
  {
    n: "Moteur de Goût",
    ref: "#149",
    title: "Le goût de son humain, appris en un geste",
    text:
      "K variantes d'une même app, un tap sur la préférée — le choix devient un axiome de goût. Un juge-pixels note ensuite chaque rendu selon le goût appris, pas dans l'absolu. La nuit génère, le matin un push sur le téléphone : valider prend une seconde.",
  },
  {
    n: "Le Gardien",
    ref: "#161",
    title: "Personne ne « finit » sans passer la porte",
    text:
      "Gate de clôture dans la boucle même : intention (la bonne tâche ?), goût (jugé par un cerveau distinct de l'exécutant), QA mesurée. Verdict rouge → l'Élève repart corriger, relances bornées. Convergent, jamais un mur : au pire, un « incomplet » assumé.",
  },
];

const LENTILLES = [
  ["Intention", "un juge souverain compare la demande au livré — jamais d'auto-jugement"],
  ["Goût", "7 lentilles de critique, ancrées sur les axiomes appris de l'utilisateur"],
  ["QA WCAG", "contrastes calculés au pixel, WCAG 2.1 exact — mesuré, pas ressenti"],
  ["Équilibre", "garde déterministe anti « contenu collé à gauche », zéro LLM"],
  ["Vraies images", "un placeholder qui charge est détecté et refusé — Pexels obligatoire"],
  ["teste_parcours", "l'app s'ouvre vraiment ; une seule erreur console et on ne livre pas"],
];

const VISAGES = [
  {
    t: "Le Disjoncteur",
    d: "Déterministe, zéro LLM, purement défensif : circuit nocturne, garde-fou de coût, verrou de régression, kill switch d'agent. Au premier run grandeur nature : 5 déclenchements réels — le filet a servi.",
  },
  {
    t: "L'Œil Design",
    d: "La couche objective du design : WCAG 2.1 calculé exactement, adhérence à la palette mesurée. Jamais bloquant — il sépare le mesuré du subjectif, et pose le subjectif en questions.",
  },
  {
    t: "L'Auditeur de Flux",
    d: "Il reconstruit le graphe de navigation de l'app et cherche ce que les tests ne voient pas : routes mortes, écrans inatteignables, boutons sans destination. Le chemin humain, audité.",
  },
];

const PREUVES = [
  {
    slug: "maison-onyx",
    img: "/assets/onyx-viewport.png",
    note: "5/5",
    axiome: "Un noyau propagé partout — pas une optimisation locale.",
    desc: "Maison d'architecte en pierre noire. Dix dimensions jugées, dix adorées : quand la racine est juste, tout suit.",
  },
  {
    slug: "abysse-vivante",
    img: "/assets/abysse-viewport.png",
    note: "5/5",
    axiome: "L'ergonomie épouse la logique interne du sujet.",
    desc: "Une descente dans la fosse océanique où l'interface elle-même s'enfonce — le mouvement porte le sens.",
  },
  {
    slug: "neon-drift",
    img: "/assets/neon-drift-viewport.png",
    note: "5/5",
    axiome: "Une seule tentative — le raisonnement amont avait tout résolu.",
    desc: "Course nocturne saturée de néons. Zéro itération : le brief était cristallisé avant la première ligne.",
  },
  {
    slug: "lumen-synesthesie",
    img: "/assets/lumen-viewport.png",
    note: "5/5",
    axiome: "L'originalité tenue de bout en bout produit la sidération.",
    desc: "Une expérience synesthésique son-couleur. L'essence d'abord, puis une cohérence totale — rien ne dépasse.",
  },
];

function SectionTitle({ eyebrow, children, id }) {
  return (
    <header className="sec-head" id={id}>
      <Reveal as="p" className="eyebrow">{eyebrow}</Reveal>
      <Reveal as="h2" delay={80}>{children}</Reveal>
    </header>
  );
}

export default function App() {
  return (
    <div className="site">
      <a className="skip" href="#atelier">Aller au contenu</a>

      <header className="nav">
        <a className="brand" href="#top" aria-label="MangoOS — accueil">
          <span className="brand-mark" aria-hidden="true" />
          MangoOS
        </a>
        <nav aria-label="Navigation principale">
          <a href="#atelier">L’atelier</a>
          <a href="#qualite">La qualité</a>
          <a href="#preuves">Preuves</a>
          <a href="#souverainete">Souveraineté</a>
        </nav>
        <a className="btn btn-small" href="#entrer">Entrer dans l’atelier</a>
      </header>

      <main id="top">
        {/* ——— 1 · HERO MANIFESTE ——— */}
        <section className="hero">
          <div className="hero-glow" aria-hidden="true" />
          <p className="eyebrow hero-eyebrow">MangoOS + MangoQA — l’atelier local-first qui fabrique des apps</p>
          <h1>
            L’atelier <em className="vivant">vivant</em>
          </h1>
          <p className="hero-sub">
            Décris une app en une phrase. Regarde l’Élève la construire, le Gardien la juger —
            intention, goût, qualité — et reçois une app <strong>finie</strong>.
            Pas un générateur : un atelier qui apprend ton goût.
          </p>
          <div className="hero-actions">
            <a className="btn" href="#demo">Voir le pipeline en direct</a>
            <a className="btn btn-ghost" href="#atelier">Comment ça marche</a>
          </div>

          <div id="demo" className="hero-demo">
            <Pipeline />
          </div>

          <ul className="hero-stats" aria-label="Chiffres réels de l'atelier">
            <li><strong>20+</strong><span>apps livrées en juin 2026</span></li>
            <li><strong>4</strong><span>notées 5/5 en revue</span></li>
            <li><strong>0 → 67 %</strong><span>réutilisation d’artefacts, run réel</span></li>
            <li><strong>$0</strong><span>en routine — cloud borné, escalade seulement</span></li>
          </ul>
        </section>

        {/* ——— 2 · COMMENT ÇA MARCHE ——— */}
        <section className="chaine" aria-labelledby="atelier">
          <SectionTitle id="atelier" eyebrow="Comment ça marche">
            Une idée traverse quatre machines,
            <br />
            aucune ne dort.
          </SectionTitle>

          <Reveal className="chaine-figure">
            <img
              src="/assets/atelier-lumiere.jpg"
              alt="Silhouette d'un artisan au travail dans un atelier traversé de lumière"
              loading="lazy"
            />
            <p className="figure-cap">
              La chaîne n’est pas une métaphore : chaque maillon ci-dessous existe,
              est testé, et a tourné en réel.
            </p>
          </Reveal>

          <div className="chaine-grid">
            {CHAINE.map((c, i) => (
              <Reveal as="article" key={c.n} delay={i * 90} className="chaine-card">
                <div className="chaine-card-head">
                  <h3>{c.n}</h3>
                  <span className="ref">{c.ref}</span>
                </div>
                <p className="chaine-title">{c.title}</p>
                <p className="chaine-text">{c.text}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ——— 3 · LA QUALITÉ COMME RELIGION ——— */}
        <section className="qualite" aria-labelledby="qualite">
          <SectionTitle id="qualite" eyebrow="La qualité comme religion">
            Un build vert ne prouve rien.
            <br />
            Alors on juge tout, deux fois.
          </SectionTitle>

          <div className="qualite-cols">
            <Reveal className="qualite-col">
              <h3 className="qualite-h">Le Gardien — dans la boucle</h3>
              <p className="qualite-intro">
                Avant que l’Élève ait le droit de dire « fini », six volets se prononcent.
                Rouge → il repart corriger, relances bornées.
              </p>
              <ul className="lentilles">
                {LENTILLES.map(([t, d], i) => (
                  <Reveal as="li" key={t} delay={i * 70}>
                    <strong>{t}</strong>
                    <span>{d}</span>
                  </Reveal>
                ))}
              </ul>
            </Reveal>

            <Reveal className="qualite-col" delay={120}>
              <h3 className="qualite-h">MangoQA — le fantôme</h3>
              <p className="qualite-intro">
                Un système séparé qui observe chaque génération via le bus d’événements.
                Il n’écrit jamais, ne bloque jamais — il rend des verdicts.
              </p>
              <div className="visages">
                {VISAGES.map((v, i) => (
                  <Reveal as="article" key={v.t} delay={i * 90} className="visage">
                    <h4>{v.t}</h4>
                    <p>{v.d}</p>
                  </Reveal>
                ))}
              </div>
            </Reveal>
          </div>

          <Reveal className="honnete">
            <img
              src="/assets/forge-metal.jpg"
              alt="Forgeron au travail, gerbe d'étincelles dans un atelier sombre"
              loading="lazy"
            />
            <blockquote>
              <p>
                Nuit du 1ᵉʳ juillet 2026 : une app sort deux fois rouge de la clôture.
                L’atelier re-corrige, re-juge, puis livre <em>« incomplet assumé »</em> —
                coût borné à 3,22 $.
              </p>
              <footer>La qualité, c’est aussi dire la vérité quand ça ne passe pas.</footer>
            </blockquote>
          </Reveal>
        </section>

        {/* ——— 4 · PREUVES ——— */}
        <section className="preuves" aria-labelledby="preuves">
          <SectionTitle id="preuves" eyebrow="Preuves — nuit du 3 juillet 2026">
            Quatre apps notées 5/5.
            <br />
            Vraies captures, zéro maquette.
          </SectionTitle>

          <div className="preuves-grid">
            {PREUVES.map((p, i) => (
              <Reveal as="article" key={p.slug} delay={i * 90} className="preuve">
                <div className="preuve-shot">
                  <img src={p.img} alt={`Capture réelle de l'app ${p.slug}`} loading="lazy" />
                  <span className="preuve-note">{p.note}</span>
                </div>
                <div className="preuve-body">
                  <h3>{p.slug}</h3>
                  <p className="preuve-axiome">« {p.axiome} »</p>
                  <p className="preuve-desc">{p.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal as="p" className="preuves-note">
            Chaque note 5/5 devient un axiome UX réinjecté dans les builds suivants —
            l’atelier ne recommence jamais de zéro.
          </Reveal>
        </section>

        {/* ——— 5 · SOUVERAINETÉ ——— */}
        <section className="souv" aria-labelledby="souverainete">
          <SectionTitle id="souverainete" eyebrow="Souveraineté">
            Le cerveau local d’abord.
            <br />
            Le cloud en escalade, jamais en béquille.
          </SectionTitle>

          <div className="souv-grid">
            <Reveal className="souv-card">
              <h3>La routine tourne sans Claude</h3>
              <p>
                L’Élève — GLM via Ollama, repli local Gemma à 0 $ — écrit le code dans une boucle
                agentique maison. Le juge de goût est un cerveau <strong>distinct</strong> de
                l’exécutant : personne ne se note soi-même.
              </p>
            </Reveal>
            <Reveal className="souv-card" delay={90}>
              <h3>L’escalade est un événement, pas un réflexe</h3>
              <p>
                Claude n’intervient que sur échec objectif, en opt-in, borné en relances et en coût.
                Le principe gravé dans le code : <em>« MangoOS apprend à son cerveau à finir,
                il ne le remplace pas. »</em>
              </p>
            </Reveal>
            <Reveal className="souv-card" delay={180}>
              <h3>Zéro exposition Internet</h3>
              <p>
                Validation du goût depuis le téléphone : LAN uniquement, un push ntfy le matin,
                aucun tunnel public. Le Disjoncteur surveille le coût et coupe avant la dérive.
              </p>
            </Reveal>
          </div>

          <Reveal className="souv-mains">
            <figure>
              <img src="/assets/atelier-mains.jpg" alt="Mains d'artisan affûtant un outil en atelier" loading="lazy" />
            </figure>
            <figure>
              <img src="/assets/matiere-argile.jpg" alt="Mains façonnant l'argile sur un tour de potier" loading="lazy" />
            </figure>
            <figure>
              <img src="/assets/horloger-precision.jpg" alt="Horloger réparant un mécanisme à l'outil de précision" loading="lazy" />
            </figure>
          </Reveal>
        </section>

        {/* ——— 6 · CTA FINAL ——— */}
        <section className="cta" id="entrer">
          <Reveal as="h2">
            Ton idée mérite un atelier,
            <br />
            pas un générateur.
          </Reveal>
          <Reveal as="p" delay={90} className="cta-sub">
            Local-first : le moteur sur le port 3000, l’atelier sur le 5173,
            ton app sur le 5174. Décris-la — le reste est gardé.
          </Reveal>
          <Reveal delay={180}>
            <a className="btn btn-big" href="http://localhost:5173">Ouvrir MangoOS</a>
          </Reveal>
        </section>
      </main>

      <footer className="footer">
        <p>
          MangoOS + MangoQA — construit dans l’atelier, jugé par le Gardien.
          Photos : Pexels (vraies images, règle absolue). Captures : vraies apps générées.
        </p>
      </footer>
    </div>
  );
}
