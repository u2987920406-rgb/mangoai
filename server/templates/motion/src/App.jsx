// Starter Framer Motion — landing animée (hero + reveal au scroll + cartes en cascade)
// Décris ton site dans le chat : Mango remplace le contenu, garde les animations.
import { motion } from 'framer-motion';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.12, duration: 0.6, ease: [0.22, 1, 0.36, 1] } }),
};

const features = [
  { titre: 'Rapide', texte: 'Animations fluides 60 fps, dérivées de la physique du sujet.' },
  { titre: 'Vivant', texte: 'Chaque élément entre en scène au bon moment, pas tous d’un coup.' },
  { titre: 'Sur-mesure', texte: 'Le mouvement raconte le sujet — il ne décore pas.' },
];

export default function App() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 selection:bg-indigo-500/40">
      {/* HERO */}
      <section className="relative flex min-h-[88vh] flex-col items-center justify-center overflow-hidden px-6 text-center">
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-indigo-600/30 blur-3xl"
          animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.p variants={fadeUp} initial="hidden" animate="show" custom={0}
          className="mb-4 text-sm font-medium uppercase tracking-[0.3em] text-indigo-400">
          Mango · Motion
        </motion.p>
        <motion.h1 variants={fadeUp} initial="hidden" animate="show" custom={1}
          className="max-w-3xl text-5xl font-bold leading-tight tracking-tight sm:text-7xl">
          Le mouvement qui <span className="text-indigo-400">raconte</span> ton produit.
        </motion.h1>
        <motion.p variants={fadeUp} initial="hidden" animate="show" custom={2}
          className="mt-6 max-w-xl text-lg text-neutral-400">
          Un starter d’animation prêt à l’emploi. Décris ton univers dans le chat — les transitions suivent.
        </motion.p>
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={3} className="mt-10 flex gap-4">
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.96 }}
            className="rounded-full bg-indigo-500 px-7 py-3 font-semibold text-white shadow-lg shadow-indigo-500/30">
            Commencer
          </motion.button>
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.96 }}
            className="rounded-full border border-neutral-700 px-7 py-3 font-semibold text-neutral-200">
            En savoir plus
          </motion.button>
        </motion.div>
      </section>

      {/* FEATURES — reveal au scroll */}
      <section className="mx-auto grid max-w-5xl gap-6 px-6 pb-32 sm:grid-cols-3">
        {features.map((f, i) => (
          <motion.div key={f.titre} variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }} custom={i}
            className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-7 backdrop-blur">
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-400 font-bold">
              {i + 1}
            </div>
            <h3 className="text-lg font-semibold">{f.titre}</h3>
            <p className="mt-2 text-sm text-neutral-400">{f.texte}</p>
          </motion.div>
        ))}
      </section>
    </div>
  );
}
