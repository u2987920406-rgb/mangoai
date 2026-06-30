import { ZONES } from "../data/abyssData.js";

function ZoneCard({ zone, index }) {
  const isReversed = index % 2 === 1;

  return (
    <div
      id={zone.id}
      className="abyss-reveal min-h-[70vh] flex items-center py-16 scroll-mt-20"
    >
      <div className="mx-auto max-w-6xl w-full px-6">
        <div
          className={`grid md:grid-cols-2 gap-8 md:gap-12 items-center ${
            isReversed ? "md:[direction:rtl]" : ""
          }`}
        >
          {/* Image */}
          <div className="relative rounded-2xl overflow-hidden shadow-2xl group [direction:ltr]">
            <div className="aspect-[4/3] overflow-hidden">
              <img
                src={zone.image}
                alt={zone.name}
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
            </div>
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                boxShadow: `inset 0 0 80px ${zone.color}80`,
              }}
            />
            {/* Badge de profondeur */}
            <div className="absolute top-4 left-4 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm text-cyan-300 text-xs font-mono">
              {zone.depthMin} – {zone.depthMax} m
            </div>
          </div>

          {/* Texte */}
          <div className="[direction:ltr]">
            <div
              className="inline-block px-3 py-1 rounded-full text-xs font-medium mb-3"
              style={{
                backgroundColor: `${zone.color}40`,
                color: "#00e5ff",
              }}
            >
              Zone {index + 1} / 5
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-1">
              {zone.name}
            </h2>
            <p className="text-lg text-cyan-300/70 mb-4 italic">{zone.subtitle}</p>
            <p className="text-white/70 mb-6 leading-relaxed">
              {zone.description}
            </p>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
                <div className="text-xs uppercase tracking-wider text-white/40 mb-1">
                  Température
                </div>
                <div className="text-sm font-semibold text-white">
                  {zone.temperature}
                </div>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
                <div className="text-xs uppercase tracking-wider text-white/40 mb-1">
                  Pression
                </div>
                <div className="text-sm font-semibold text-white">
                  {zone.pressure}
                </div>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
                <div className="text-xs uppercase tracking-wider text-white/40 mb-1">
                  Luminosité
                </div>
                <div className="text-sm font-semibold text-white">
                  {zone.luminosity}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ZoneSections() {
  return (
    <section id="zones" className="relative py-12">
      {/* En-tête de section */}
      <div className="mx-auto max-w-6xl px-6 mb-8 text-center abyss-reveal">
        <span className="text-xs uppercase tracking-[0.3em] text-cyan-300/60 font-medium">
          Le parcours
        </span>
        <h2 className="text-4xl md:text-5xl font-bold text-white mt-3 mb-4">
          Les zones de profondeur
        </h2>
        <p className="text-white/60 max-w-2xl mx-auto">
          De la surface ensoleillée aux tranchées les plus profondes, chaque zone
          est un monde à part entière avec ses propres règles.
        </p>
      </div>

      {ZONES.map((zone, i) => (
        <ZoneCard key={zone.id} zone={zone} index={i} />
      ))}
    </section>
  );
}