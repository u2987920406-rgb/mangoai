import { useEffect, useMemo, useState } from "react";

/*
  GALERIE ALBÂTRE — Plâtre & Laiton
  Angle : « Une maison d'édition d'objets rares — la matière parle,
  la rareté impose le silence. »

  La page n'est pas une boutique : c'est une galerie qu'on parcourt
  lentement. Chaque pièce est éditée, numérotée, racontée. Le plâtre
  boit la lumière, le laiton la rend — tout le langage visuel découle
  de ce dialogue.

  palette anchor: plaster & brass
  — Plâtre / albâtre : blanc craie #efe9df, beiges chauds (#e7dfd2, #f4efe6)
  — Laiton : or chaud désaturé #b8925a, < 8 % de la surface (filets, chiffres,
    lettrine, remplissage de CTA au hover) — jamais d'aplat clinquant
  — Texte : true grey profond #2e2c28
  Typo : Cormorant Garamond (serif display éditoriale) × Archivo (grotesque discrète)
  Motion : lente et assumée (600–1100 ms), révélations au scroll,
  prefers-reduced-motion respecté.
*/

// ---------------------------------------------------------------- Données

const CATEGORIES = [
  { key: "appliques", label: "Appliques" },
  { key: "suspensions", label: "Suspensions" },
  { key: "lampadaires", label: "Lampadaires" },
  { key: "lampes", label: "Lampes à poser" },
  { key: "mobilier", label: "Mobilier" },
  { key: "objets", label: "Objets" },
];

const MATIERES = [
  { key: "platre", label: "Plâtre" },
  { key: "albatre", label: "Albâtre" },
  { key: "laiton", label: "Laiton" },
  { key: "travertin", label: "Travertin" },
];

const PIECES = [
  { key: "salon", label: "Salon" },
  { key: "entree", label: "Entrée" },
  { key: "chambre", label: "Chambre" },
  { key: "bureau", label: "Bureau" },
];

const PIECES_LABEL = Object.fromEntries(PIECES.map((p) => [p.key, p.label]));
const MATIERES_LABEL = Object.fromEntries(MATIERES.map((m) => [m.key, m.label]));
const CATEGORIES_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]));

const PRODUCTS = [
  {
    id: "selene",
    name: "Séléné",
    kind: "Applique",
    cat: "appliques",
    mats: ["albatre", "laiton"],
    room: "entree",
    img: "/assets/applique-selene.jpg",
    price: 890,
    edition: { n: 8, total: 48 },
    dims: "H 32 · ⌀ 20 cm",
    hover: "Globe d'albâtre poli à la poudre d'os, platine laiton brossé",
    lead: "Une pleine lune posée contre le mur.",
    story: [
      "Le globe est tourné dans un bloc d'albâtre de Volterra, puis poli à la poudre d'os jusqu'à ce que la pierre devienne translucide. Allumée, Séléné ne projette pas de lumière : elle en devient une.",
      "La platine de laiton, brossée à la main, disparaît presque — elle n'est là que pour tenir la lune au mur.",
    ],
    details: [
      "Albâtre de Volterra tourné masse",
      "Platine laiton brossé, patine nue",
      "Source LED 2200 K, gradable",
      "Câble gainé de lin écru",
    ],
  },
  {
    id: "vestale",
    name: "Vestale",
    kind: "Applique",
    cat: "appliques",
    mats: ["platre", "laiton"],
    room: "chambre",
    img: "/assets/applique-vestale.jpg",
    price: 720,
    edition: { n: 14, total: 60 },
    dims: "H 26 · L 22 · P 14 cm",
    hover: "Plâtre plissé au couteau, biscuit mat, monture laiton",
    lead: "Un plissé de tissu figé dans le plâtre.",
    story: [
      "Chaque pli est levé au couteau dans le plâtre frais, en un seul geste — on ne reprend pas un pli. La surface reste en biscuit, mate, poudreuse, exactement comme la matière sort du moule.",
      "Le soir, la lumière remonte les plis un à un, comme une flamme le ferait dans une chapelle.",
    ],
    details: [
      "Plâtre fin de Moulda, plissé main",
      "Finition biscuit, non vernie",
      "Monture laiton, visserie invisible",
      "Halo chaud 2400 K",
    ],
  },
  {
    id: "nocturne",
    name: "Nocturne",
    kind: "Suspension",
    cat: "suspensions",
    mats: ["platre", "laiton"],
    room: "salon",
    img: "/assets/suspension-nocturne.jpg",
    price: 1150,
    edition: { n: 5, total: 36 },
    dims: "H 24 · ⌀ 28 cm · câble 250 cm",
    hover: "Plâtre teinté masse au brou de noix, gorge laiton poli",
    lead: "Le seul noir de la maison — et il est chaud.",
    story: [
      "Le cône est teinté dans la masse au brou de noix : un noir brun, profond, qui absorbe la pièce autour de lui. À l'intérieur, une gorge de laiton poli renvoie une lumière de bougie sur la table.",
      "Nocturne se suspend bas, à hauteur de conversation. C'est une suspension pour les dîners qui durent.",
    ],
    details: [
      "Plâtre teinté masse, brou de noix",
      "Gorge intérieure laiton poli miroir",
      "Câble textile brun, rosace plâtre",
      "Hauteur réglable à la pose",
    ],
  },
  {
    id: "goutte",
    name: "Goutte",
    kind: "Suspension",
    cat: "suspensions",
    mats: ["laiton"],
    room: "bureau",
    img: "/assets/suspension-goutte.jpg",
    price: 640,
    edition: { n: 22, total: 80 },
    dims: "H 18 · ⌀ 22 cm · câble 200 cm",
    pos: "50% 62%",
    hover: "Disque de laiton filé au tour, ampoule nue à filament",
    lead: "Presque rien : un disque, un fil, une flamme.",
    story: [
      "Le disque est filé au tour à repousser, en une passe, dans une feuille de laiton d'un millimètre. Aucune soudure. L'ampoule à filament reste nue — Goutte n'a rien à cacher.",
      "C'est la pièce la plus silencieuse de la collection, celle qu'on installe au-dessus d'un plan de travail ou d'une écritoire.",
    ],
    details: [
      "Laiton filé au tour à repousser",
      "Aucune soudure, une seule passe",
      "Ampoule filament 2000 K fournie",
      "Câble textile grège",
    ],
  },
  {
    id: "heron",
    name: "Héron",
    kind: "Lampadaire",
    cat: "lampadaires",
    mats: ["laiton"],
    room: "bureau",
    img: "/assets/liseuse-heron.jpg",
    price: 1680,
    edition: { n: 3, total: 24 },
    dims: "H 142 · portée 58 cm",
    pos: "50% 42%",
    hover: "Liseuse laiton massif, bras contrepoids, rotule à friction",
    lead: "Un échassier de laiton penché sur votre page.",
    story: [
      "Le bras est contrebalancé au gramme près : Héron se règle d'un doigt et tient sa position dix ans. La rotule à friction est usinée dans la masse, sans ressort — rien qui fatigue, rien qui grince.",
      "Le laiton n'est pas verni : il se patinera là où la main se pose, et brillera là où elle ne se pose pas.",
    ],
    details: [
      "Laiton massif étiré, non verni",
      "Contrepoids plomb gainé cuir",
      "Réflecteur orientable 360°",
      "Variateur au pied, gradation totale",
    ],
  },
  {
    id: "arceau",
    name: "Arceau",
    kind: "Lampadaire",
    cat: "lampadaires",
    mats: ["platre", "laiton"],
    room: "salon",
    img: "/assets/lampadaire-arceau.jpg",
    price: 1380,
    edition: { n: 7, total: 32 },
    dims: "H 168 · portée 74 cm",
    hover: "Arc laiton étiré, cône de plâtre tissé, socle pierre",
    lead: "Une canne de laiton penchée au-dessus du fauteuil.",
    story: [
      "L'arc est étiré à froid dans une barre de laiton d'une seule longueur — la courbe est donnée au gabarit, à la main, et aucune n'est exactement la même. Le cône diffuseur est un plâtre tissé sur toile, mat dehors, lumineux dedans.",
      "Arceau enjambe un fauteuil ou un coin de canapé et y dépose un rond de lumière chaude, exactement là où les yeux lisent.",
    ],
    details: [
      "Arc laiton étiré à froid, une longueur",
      "Cône plâtre tissé sur toile",
      "Socle pierre reconstituée, 14 kg",
      "Gradation au cordon, 2400 K",
    ],
  },
  {
    id: "muse",
    name: "Muse",
    kind: "Lampe à poser",
    cat: "lampes",
    mats: ["platre", "laiton"],
    room: "bureau",
    img: "/assets/lampadaire-muse.jpg",
    price: 860,
    edition: { n: 9, total: 40 },
    dims: "H 46 · ⌀ 38 cm",
    hover: "Sphère laitonnée, jupe plissée main, lumière d'après-midi",
    lead: "Le soleil de cinq heures, en modèle réduit.",
    story: [
      "La sphère du pied est laitonnée au tampon, puis la jupe est plissée à la main — quarante-huit plis, ni un de plus. Allumée, Muse fabrique cette lumière de fin d'après-midi qui rend les bureaux habitables.",
      "C'est la pièce des écritoires et des tables de travail. Elle éclaire la page, jamais les yeux.",
    ],
    details: [
      "Sphère laitonnée au tampon",
      "Jupe coton gommé, 48 plis main",
      "Épaulement plâtre sous la jupe",
      "Double allumage, 2200/2700 K",
    ],
  },
  {
    id: "corolle",
    name: "Corolle",
    kind: "Lampe à poser",
    cat: "lampes",
    mats: ["platre", "laiton"],
    room: "salon",
    img: "/assets/lampe-corolle.jpg",
    price: 980,
    edition: { n: 11, total: 48 },
    dims: "H 64 · ⌀ 38 cm",
    hover: "Corolle drapée festonnée, fût laiton tourné à l'ancienne",
    lead: "Un jupon de lumière sur un pied de chandelier.",
    story: [
      "La corolle est festonnée à la main sur une carcasse de laiton — chaque vague retombe comme elle veut, et c'est très bien ainsi. Le tissu gommé s'embrase de l'intérieur, du miel au bord des ourlets.",
      "Le fût est tourné à l'ancienne, balustre après balustre, dans une barre de laiton massif. Corolle est la pièce la plus bavarde de la maison : une par pièce suffit.",
    ],
    details: [
      "Feston drapé main, tissu gommé",
      "Carcasse et fût laiton massif tourné",
      "Passementerie posée à l'aiguille",
      "Lumière d'ambre, 2200 K",
    ],
  },
  {
    id: "aube",
    name: "Aube",
    kind: "Lampe à poser",
    cat: "lampes",
    mats: ["platre"],
    room: "chambre",
    img: "/assets/lampe-aube.jpg",
    price: 560,
    edition: { n: 27, total: 90 },
    dims: "H 41 · ⌀ 26 cm",
    hover: "Plâtre chaulé poncé à l'eau, abat-jour lin cru",
    lead: "La lampe qu'on allume en premier et qu'on éteint en dernier.",
    story: [
      "Le pied est chaulé puis poncé à l'eau, jusqu'à obtenir ce grain de galet sec qui appelle la paume. L'abat-jour de lin cru laisse passer une lumière de drap frais.",
      "Aube est la pièce d'entrée de la maison — et celle que nos collectionneurs rachètent pour leurs enfants.",
    ],
    details: [
      "Plâtre chaulé, ponçage à l'eau",
      "Abat-jour lin cru cousu main",
      "Interrupteur laiton à bascule",
      "2400 K, gradable au toucher",
    ],
  },
  {
    id: "lune",
    name: "Lune",
    kind: "Lampe à poser",
    cat: "lampes",
    mats: ["laiton"],
    room: "chambre",
    img: "/assets/lampe-lune.jpg",
    price: 480,
    edition: { n: 33, total: 90 },
    dims: "H 28 · ⌀ 20 cm",
    hover: "Orbe opalin soufflé bouche, col laiton tourné",
    lead: "Une veilleuse pour adultes.",
    story: [
      "L'orbe est soufflé à la bouche dans un opalin laiteux, puis posé sur un col de laiton tourné qui le tient sans le serrer. On l'allume d'une caresse — la sphère entière est l'interrupteur.",
      "Lune éclaire à hauteur de murmure. Elle a été dessinée pour les tables de chevet et n'a jamais servi à rien d'autre.",
    ],
    details: [
      "Opalin soufflé bouche",
      "Col laiton tourné, feutre dessous",
      "Allumage tactile sur la sphère",
      "3 intensités, mémoire du réglage",
    ],
  },
  {
    id: "amphore",
    name: "Amphore",
    kind: "Lampe à poser",
    cat: "lampes",
    mats: ["albatre"],
    room: "salon",
    img: "/assets/lampe-amphore.jpg",
    price: 1450,
    edition: { n: 6, total: 30 },
    dims: "H 52 · ⌀ 24 cm",
    hover: "Albâtre veiné tourné masse — chaque veine est unique",
    lead: "La pierre qui se souvient d'avoir été de l'eau.",
    story: [
      "L'albâtre est une pierre d'eau : ses veines sont des saisons de pluie. Chaque Amphore est tournée dans son propre bloc — le veinage que vous recevez n'existe qu'une fois, et le numéro d'édition est gravé sous le pied.",
      "Éteinte, c'est un vase antique. Allumée, la pierre entière s'embrase de l'intérieur, veines en premier.",
    ],
    details: [
      "Albâtre veiné, bloc unique par pièce",
      "Tournage masse, paroi 9 mm",
      "Veinage photographié et archivé",
      "Source interne 2200 K",
    ],
  },
  {
    id: "stele",
    name: "Stèle",
    kind: "Console",
    cat: "mobilier",
    mats: ["travertin", "laiton"],
    room: "entree",
    img: "/assets/console-stele.jpg",
    price: 2900,
    edition: { n: 2, total: 12 },
    dims: "L 120 · H 82 · P 35 cm",
    hover: "Plateau travertin non rebouché, piètement laiton bruni",
    lead: "Le premier geste en entrant, le dernier en sortant.",
    story: [
      "Le plateau est un travertin romain laissé non rebouché : ses alvéoles sont ses années. Le piètement de laiton bruni est soudé à l'argent, puis passé à la cire — il fonce doucement, comme un meuble de famille.",
      "Douze exemplaires, parce que la carrière n'a donné que douze plateaux dans cette veine.",
    ],
    details: [
      "Travertin romain non rebouché",
      "Piètement laiton, brasure argent",
      "Cire microcristalline, patine libre",
      "Douze plateaux, une seule veine",
    ],
  },
  {
    id: "disque",
    name: "Disque",
    kind: "Guéridon",
    cat: "mobilier",
    mats: ["travertin"],
    room: "salon",
    img: "/assets/gueridon-disque.jpg",
    price: 1150,
    edition: { n: 8, total: 24 },
    dims: "H 46 · ⌀ 50 cm",
    hover: "Galette de travertin adouci, fût acier laitonné",
    lead: "Une pièce de monnaie tombée du bon côté.",
    story: [
      "La galette est adoucie à la meule d'eau — ni brillante, ni brute, exactement entre les deux. Elle garde la fraîcheur de la pierre : posez-y la main un soir d'été.",
      "Disque se glisse contre un fauteuil et porte ce qu'un soir demande : un verre, un livre, une lampe Lune.",
    ],
    details: [
      "Travertin adouci meule d'eau",
      "Fût acier laitonné, lesté fonte",
      "Patin feutre de laine",
      "Se déplace d'une main",
    ],
  },
  {
    id: "oeil",
    name: "Œil",
    kind: "Miroir",
    cat: "mobilier",
    mats: ["laiton"],
    room: "entree",
    img: "/assets/miroir-oeil.jpg",
    price: 690,
    edition: { n: 17, total: 60 },
    dims: "⌀ 55 cm · sangle 20 cm",
    hover: "Jonc laiton roulé main, sangle de cuir sellier",
    lead: "Le mur ouvre un œil.",
    story: [
      "Le jonc est roulé à la main autour du verre, sans jointure visible — cherchez-la, c'est le jeu. La sangle de cuir sellier est cousue au fil de lin poissé, deux aiguilles, comme une bride.",
      "Œil se pend à un clou de forge (fourni). Il regarde l'entrée, et l'entrée se tient mieux.",
    ],
    details: [
      "Jonc laiton roulé main",
      "Cuir sellier, couture deux aiguilles",
      "Verre argenté 4 mm",
      "Clou de forge fourni",
    ],
  },
  {
    id: "ephebe",
    name: "Éphèbe",
    kind: "Buste d'atelier",
    cat: "objets",
    mats: ["platre"],
    room: "bureau",
    img: "/assets/buste-ephebe.jpg",
    price: 420,
    edition: { n: 41, total: 120 },
    dims: "H 34 · L 20 cm",
    hover: "Plâtre patiné au thé, tirage d'après un moule de 1907",
    lead: "Cent ans de regards baissés.",
    story: [
      "Le moule vient d'un atelier de moulage fermé en 1978 ; il porte le tampon de 1907. Chaque tirage est patiné au thé noir, puis ciré — le plâtre prend ce ton d'ivoire ancien qu'aucune peinture n'imite.",
      "Éphèbe est l'objet le moins cher de la galerie et celui qui part le plus vite. Il y a une justice.",
    ],
    details: [
      "Moule d'atelier daté 1907",
      "Tirage plâtre fin, patine thé",
      "Cire d'abeille, lustré chiffon",
      "Socle feutré, numéro au revers",
    ],
  },
];

const fmtPrice = (n) => n.toLocaleString("fr-FR") + " €";
const pad = (n) => String(n).padStart(2, "0");

// ---------------------------------------------------------------- Hooks

function useReveal(deps = []) {
  useEffect(() => {
    const els = document.querySelectorAll(".reveal:not(.in)");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

function useNavScrolled() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return scrolled;
}

// ---------------------------------------------------------------- UI

function FilterRow({ label, options, value, onChange }) {
  return (
    <div className="filter-row" role="group" aria-label={`Filtrer par ${label}`}>
      <span className="filter-label">{label}</span>
      <div className="filter-pills">
        <button className={`pill ${value === null ? "on" : ""}`} onClick={() => onChange(null)}>
          Toutes
        </button>
        {options.map((o) => (
          <button
            key={o.key}
            className={`pill ${value === o.key ? "on" : ""}`}
            aria-pressed={value === o.key}
            onClick={() => onChange(value === o.key ? null : o.key)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ProductCard({ p, onOpen, index }) {
  return (
    <article className="card reveal" style={{ transitionDelay: `${(index % 3) * 90}ms` }}>
      <button className="card-media" onClick={() => onOpen(p.id)} aria-label={`Voir ${p.name}`}>
        <img
          src={p.img}
          alt={`${p.kind} ${p.name}`}
          loading="lazy"
          style={p.pos ? { objectPosition: p.pos } : undefined}
        />
        <span className="card-veil" aria-hidden="true">
          <span className="card-matiere">{p.hover}</span>
        </span>
        <span className="card-edition" aria-hidden="true">
          N° {pad(p.edition.n)} / {p.edition.total}
        </span>
      </button>
      <div className="card-body">
        <div className="card-line">
          <h3 className="card-name">
            <button onClick={() => onOpen(p.id)}>{p.name}</button>
          </h3>
          <span className="card-price">{fmtPrice(p.price)}</span>
        </div>
        <p className="card-kind">
          {p.kind} — {p.mats.map((m) => MATIERES_LABEL[m]).join(" & ").toLowerCase()}
        </p>
      </div>
    </article>
  );
}

function CartDrawer({ open, onClose, cart, add, remove, clear }) {
  const lines = Object.entries(cart).map(([id, qty]) => ({
    p: PRODUCTS.find((x) => x.id === id),
    qty,
  }));
  const count = lines.reduce((a, l) => a + l.qty, 0);
  const total = lines.reduce((a, l) => a + l.p.price * l.qty, 0);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (open) setConfirmed(false);
  }, [open]);

  return (
    <>
      <div className={`scrim ${open ? "show" : ""}`} onClick={onClose} aria-hidden="true" />
      <aside className={`drawer ${open ? "open" : ""}`} aria-label="Panier" aria-hidden={!open}>
        <header className="drawer-head">
          <h2>
            Réservations{count > 0 && <span className="drawer-count"> — {count}</span>}
          </h2>
          <button className="drawer-close" onClick={onClose} aria-label="Fermer le panier">
            Fermer
          </button>
        </header>

        {confirmed ? (
          <div className="drawer-empty">
            <p className="drawer-empty-title">Réservation reçue.</p>
            <p>
              Nos ateliers vous écriront sous 48 heures pour confirmer les numéros d'édition et
              convenir de la remise en main propre.
            </p>
          </div>
        ) : count === 0 ? (
          <div className="drawer-empty">
            <p className="drawer-empty-title">Votre sélection est vide.</p>
            <p>
              Les pièces réservées sont retirées de l'édition le temps de votre décision — prenez
              le vôtre.
            </p>
            <button className="ghost-btn" onClick={onClose}>
              Parcourir la collection
            </button>
          </div>
        ) : (
          <>
            <ul className="drawer-lines">
              {lines.map(({ p, qty }) => (
                <li key={p.id} className="drawer-line">
                  <img src={p.img} alt="" className="line-thumb" />
                  <div className="line-info">
                    <span className="line-name">{p.name}</span>
                    <span className="line-kind">
                      {p.kind} · N° {pad(p.edition.n)}/{p.edition.total}
                    </span>
                    <div className="line-qty" aria-label={`Quantité pour ${p.name}`}>
                      <button onClick={() => remove(p.id)} aria-label={`Retirer un ${p.name}`}>
                        −
                      </button>
                      <span>{qty}</span>
                      <button onClick={() => add(p.id)} aria-label={`Ajouter un ${p.name}`}>
                        +
                      </button>
                    </div>
                  </div>
                  <span className="line-price">{fmtPrice(p.price * qty)}</span>
                </li>
              ))}
            </ul>
            <footer className="drawer-foot">
              <div className="drawer-total">
                <span>Total</span>
                <strong>{fmtPrice(total)}</strong>
              </div>
              <p className="drawer-note">
                Livraison gantée à Paris, caisse d'atelier ailleurs. Chaque pièce part avec son
                certificat d'édition signé.
              </p>
              <button
                className="solid-btn"
                onClick={() => {
                  clear();
                  setConfirmed(true);
                }}
              >
                Réserver ces pièces
              </button>
            </footer>
          </>
        )}
      </aside>
    </>
  );
}

// ---------------------------------------------------------------- Pages

function ProductPage({ product, onBack, onOpen, addToCart }) {
  const [added, setAdded] = useState(false);
  useReveal([product.id]);
  useEffect(() => {
    window.scrollTo(0, 0);
    setAdded(false);
  }, [product.id]);

  const others = PRODUCTS.filter((p) => p.id !== product.id && p.cat === product.cat)
    .concat(PRODUCTS.filter((p) => p.id !== product.id && p.cat !== product.cat))
    .slice(0, 3);

  return (
    <div className="product-page">
      <div className="product-top">
        <button className="back-link" onClick={onBack}>
          ← Retour à la collection
        </button>
      </div>

      <div className="product-layout">
        <figure className="product-figure reveal in">
          <img
            src={product.img}
            alt={`${product.kind} ${product.name}`}
            style={product.pos ? { objectPosition: product.pos } : undefined}
          />
          <figcaption>{product.hover}. Photographie d'atelier, lumière naturelle.</figcaption>
        </figure>

        <div className="product-info">
          <p className="product-eyebrow">
            {CATEGORIES_LABEL[product.cat]} · {PIECES_LABEL[product.room]}
          </p>
          <h1 className="product-name">{product.name}</h1>
          <p className="product-lead">{product.lead}</p>

          <div className="product-priceline">
            <span className="product-price">{fmtPrice(product.price)}</span>
            <span className="product-dims">{product.dims}</span>
          </div>

          {product.story.map((s, i) => (
            <p className="product-story" key={i}>
              {s}
            </p>
          ))}

          <ul className="product-details">
            {product.details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>

          <div className="edition-block" aria-label="Édition limitée">
            <span className="edition-big">
              N° {pad(product.edition.n)}
              <span className="edition-sep"> / </span>
              {product.edition.total}
            </span>
            <p className="edition-note">
              Édition limitée à {product.edition.total} exemplaires, numérotés et signés. Le
              prochain numéro disponible vous est attribué à la réservation.
            </p>
          </div>

          <button
            className={`solid-btn add-btn ${added ? "added" : ""}`}
            onClick={() => {
              addToCart(product.id);
              setAdded(true);
            }}
          >
            {added ? `${product.name} — réservée` : `Réserver le n° ${pad(product.edition.n)}`}
          </button>
          <p className="add-hint">Sans engagement : la pièce est retenue 72 heures.</p>
        </div>
      </div>

      <section className="others">
        <h2 className="others-title reveal">La collection continue</h2>
        <div className="others-grid">
          {others.map((p, i) => (
            <ProductCard key={p.id} p={p} onOpen={onOpen} index={i} />
          ))}
        </div>
      </section>
    </div>
  );
}

function HomePage({ onOpen }) {
  const [cat, setCat] = useState(null);
  const [mat, setMat] = useState(null);
  const [room, setRoom] = useState(null);
  useReveal([cat, mat, room]);

  const filtered = useMemo(
    () =>
      PRODUCTS.filter(
        (p) =>
          (!cat || p.cat === cat) && (!mat || p.mats.includes(mat)) && (!room || p.room === room)
      ),
    [cat, mat, room]
  );

  return (
    <>
      {/* ---------------- HERO ---------------- */}
      <header className="hero" id="haut">
        <div className="hero-text">
          <p className="hero-eyebrow reveal in">Maison d'édition d'objets rares — Paris</p>
          <h1 className="hero-title reveal in">
            La matière <em>parle.</em>
            <br />
            La rareté impose
            <br />
            <em>le silence.</em>
          </h1>
          <p className="hero-sub reveal in">
            Luminaires et mobilier en plâtre, albâtre et laiton. Quinze pièces, éditées de 12 à
            120 exemplaires, façonnées et numérotées dans nos ateliers.
          </p>
          <a href="#collection" className="ghost-btn reveal in">
            Parcourir la collection
          </a>
        </div>
        <figure className="hero-figure reveal in">
          <img src="/assets/hero-alcove.jpg" alt="Alcôve de plâtre éclairée à la bougie" />
          <figcaption>Alcôve d'essai, atelier de la rue de Thorigny</figcaption>
        </figure>
      </header>

      <div className="hero-strip reveal" aria-label="Repères de la maison">
        <span>Plâtre fin de Moulda</span>
        <span className="strip-dot" aria-hidden="true" />
        <span>Laiton de fonderie, non verni</span>
        <span className="strip-dot" aria-hidden="true" />
        <span>Éditions de 12 à 120</span>
        <span className="strip-dot" aria-hidden="true" />
        <span>Certificat signé</span>
      </div>

      {/* ---------------- MATIÈRES ---------------- */}
      <section className="matieres" id="matieres" aria-label="Les deux matières">
        <header className="matieres-head reveal">
          <p className="label-brass">Le dialogue</p>
          <h2 className="section-title">Deux matières, une conversation</h2>
        </header>

        <div className="matieres-duo">
          <article className="matiere-panel reveal">
            <div className="matiere-img">
              <img
                className="warmify"
                src="/assets/matiere-platre.jpg"
                alt="Texture de plâtre blanc travaillé au couteau"
                loading="lazy"
              />
            </div>
            <h3 className="matiere-name">Le plâtre boit la lumière</h3>
            <p>
              Mat, poudreux, minéral — le plâtre absorbe tout ce qui l'éclaire et le rend en
              douceur, sans un reflet. C'est la matière du silence : elle donne aux pièces leur
              masse calme, leur blanc de craie qui n'est jamais froid.
            </p>
          </article>
          <article className="matiere-panel reveal" style={{ transitionDelay: "140ms" }}>
            <div className="matiere-img">
              <img
                src="/assets/matiere-laiton.jpg"
                alt="Copeaux et anneaux de laiton doré"
                loading="lazy"
              />
            </div>
            <h3 className="matiere-name">Le laiton la rend</h3>
            <p>
              Là où le plâtre absorbe, le laiton répond. Non verni, il se patine avec les mains et
              les années — un métal vivant, réservé aux points de contact : une platine, un jonc,
              un filet. Jamais plus. La retenue est notre seul luxe.
            </p>
          </article>
        </div>

        <div className="atelier-band reveal">
          <img src="/assets/atelier-mains.jpg" alt="Mains d'artisan façonnant la matière" loading="lazy" />
          <blockquote>
            « On ne reprend pas un pli. On ne triche pas une veine.
            <br /> La matière se souvient de tout. »
            <cite>— L'atelier, règle première</cite>
          </blockquote>
        </div>
      </section>

      {/* ---------------- COLLECTION ---------------- */}
      <section className="collection" id="collection" aria-label="La collection">
        <header className="collection-head reveal">
          <p className="label-brass">Collection I — « Craie &amp; Feu »</p>
          <h2 className="section-title">Quinze pièces éditées</h2>
        </header>

        <div className="filters reveal" aria-label="Filtres de la collection">
          <FilterRow label="Catégorie" options={CATEGORIES} value={cat} onChange={setCat} />
          <FilterRow label="Matière" options={MATIERES} value={mat} onChange={setMat} />
          <FilterRow label="Pièce" options={PIECES} value={room} onChange={setRoom} />
          <p className="filter-count" aria-live="polite">
            {filtered.length === PRODUCTS.length
              ? `${PRODUCTS.length} pièces`
              : `${filtered.length} pièce${filtered.length > 1 ? "s" : ""} sur ${PRODUCTS.length}`}
          </p>
        </div>

        {filtered.length === 0 ? (
          <div className="grid-empty">
            <p>Aucune pièce ne répond à ces trois exigences à la fois.</p>
            <button
              className="ghost-btn"
              onClick={() => {
                setCat(null);
                setMat(null);
                setRoom(null);
              }}
            >
              Revoir toute la collection
            </button>
          </div>
        ) : (
          <div className="grid" key={`${cat}-${mat}-${room}`}>
            {filtered.map((p, i) => (
              <ProductCard key={p.id} p={p} onOpen={onOpen} index={i} />
            ))}
          </div>
        )}
      </section>

      {/* ---------------- SCÉNOGRAPHIE ---------------- */}
      <section className="sceno" aria-label="Scénographie">
        <figure className="sceno-figure reveal">
          <img
            src="/assets/scenographie.jpg"
            alt="Intérieur de pierre claire aux niches éclairées"
            loading="lazy"
          />
        </figure>
        <div className="sceno-caption reveal">
          <p className="label-brass">Scénographie</p>
          <p className="sceno-quote">
            Nos pièces ne décorent pas. Elles habitent — et l'intérieur se range autour d'elles.
          </p>
        </div>
      </section>

      {/* ---------------- MAISON ---------------- */}
      <section className="maison" id="maison" aria-label="La maison">
        <figure className="maison-figure reveal">
          <img src="/assets/main-platre.jpg" alt="Main moulée en plâtre blanc" loading="lazy" />
          <figcaption>Moulage d'étude, plâtre fin — pièce non commercialisée</figcaption>
        </figure>
        <div className="maison-text">
          <div className="reveal">
            <p className="label-brass">La maison</p>
            <h2 className="section-title">Éditer, pas produire</h2>
          </div>
          <div className="reveal" style={{ transitionDelay: "120ms" }}>
            <p className="lettrine">
              Galerie Albâtre est née d'un refus : celui de l'objet infini. Chaque pièce de la
              maison est éditée comme un livre — un tirage décidé d'avance, des exemplaires
              numérotés, puis le moule est archivé. Aucune réédition, jamais.
            </p>
            <p>
              Nos ateliers travaillent trois matières et les connaissent par leur prénom : le
              plâtre fin de Moulda, l'albâtre de Volterra, le laiton de fonderie qu'on ne vernit
              pas. Ce que la main a fait, la main peut le refaire — mais elle ne le refera pas.
            </p>
            <p>
              Quand une édition s'éteint, elle s'éteint. C'est ce silence-là qui donne leur poids
              aux pièces qui restent.
            </p>
            <p className="maison-sign">— Galerie Albâtre, Paris, MMXXVI</p>
          </div>
        </div>
      </section>

      {/* ---------------- RENDEZ-VOUS ---------------- */}
      <section className="rdv reveal" aria-label="Rendez-vous">
        <p className="label-brass">La galerie</p>
        <h2 className="rdv-title">Voir les pièces à la lumière du jour</h2>
        <p className="rdv-sub">
          La galerie reçoit sur rendez-vous, rue de Thorigny, Paris III<sup>e</sup>. Une heure, la
          lumière de l'après-midi, et les quinze pièces allumées une à une.
        </p>
        <a className="ghost-btn" href="mailto:rendezvous@galerie-albatre.fr">
          Demander un rendez-vous
        </a>
      </section>
    </>
  );
}

// ---------------------------------------------------------------- App

export default function App() {
  const [view, setView] = useState({ name: "home" });
  const [cart, setCart] = useState({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [veil, setVeil] = useState(true);
  const scrolled = useNavScrolled();

  useEffect(() => {
    const t = setTimeout(() => setVeil(false), 1100);
    return () => clearTimeout(t);
  }, []);

  const count = useMemo(() => Object.values(cart).reduce((a, b) => a + b, 0), [cart]);

  const addToCart = (id) => setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
  const removeFromCart = (id) =>
    setCart((c) => {
      const next = { ...c };
      if (next[id] > 1) next[id] -= 1;
      else delete next[id];
      return next;
    });

  const openProduct = (id) => setView({ name: "piece", id });
  const goHome = () => {
    setView({ name: "home" });
    requestAnimationFrame(() => window.scrollTo(0, 0));
  };
  const goSection = (e, id) => {
    if (view.name !== "home") {
      e.preventDefault();
      setView({ name: "home" });
      setTimeout(() => document.getElementById(id)?.scrollIntoView(), 80);
    }
  };

  const product = view.name === "piece" ? PRODUCTS.find((p) => p.id === view.id) : null;

  return (
    <main className={veil ? "veiled" : ""}>
      {/* Voile de chargement */}
      <div className={`veil ${veil ? "" : "lifted"}`} aria-hidden={!veil}>
        <span className="veil-mark">
          Galerie <em>Albâtre</em>
        </span>
        <span className="veil-line" aria-hidden="true" />
      </div>

      {/* NAV */}
      <nav className={`nav ${scrolled ? "scrolled" : ""}`} aria-label="Navigation principale">
        <button className="nav-brand" onClick={goHome} aria-label="Galerie Albâtre, accueil">
          Galerie <em>Albâtre</em>
        </button>
        <div className="nav-right">
          <ul className="nav-links">
            <li>
              <a href="#collection" onClick={(e) => goSection(e, "collection")}>
                Collection
              </a>
            </li>
            <li>
              <a href="#matieres" onClick={(e) => goSection(e, "matieres")}>
                Matières
              </a>
            </li>
            <li>
              <a href="#maison" onClick={(e) => goSection(e, "maison")}>
                Maison
              </a>
            </li>
          </ul>
          <button
            className="cart-btn"
            onClick={() => setDrawerOpen(true)}
            aria-label={`Ouvrir le panier, ${count} pièce${count > 1 ? "s" : ""}`}
          >
            Réservations
            {count > 0 && <span className="cart-count">{count}</span>}
          </button>
        </div>
      </nav>

      {view.name === "home" ? (
        <HomePage onOpen={openProduct} />
      ) : (
        <ProductPage product={product} onBack={goHome} onOpen={openProduct} addToCart={addToCart} />
      )}

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-inner">
          <span className="footer-brand">
            Galerie <em>Albâtre</em>
          </span>
          <ul className="footer-links">
            <li>
              <a href="#collection" onClick={(e) => goSection(e, "collection")}>
                Collection
              </a>
            </li>
            <li>
              <a href="#matieres" onClick={(e) => goSection(e, "matieres")}>
                Matières
              </a>
            </li>
            <li>
              <a href="#maison" onClick={(e) => goSection(e, "maison")}>
                Maison
              </a>
            </li>
            <li>
              <a href="mailto:rendezvous@galerie-albatre.fr">Rendez-vous</a>
            </li>
          </ul>
          <span className="footer-meta">Rue de Thorigny, Paris III · Éditions limitées · MMXXVI</span>
        </div>
      </footer>

      <CartDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        cart={cart}
        add={addToCart}
        remove={removeFromCart}
        clear={() => setCart({})}
      />
    </main>
  );
}
