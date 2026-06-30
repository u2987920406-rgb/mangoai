import { CREATURES } from "../data/abyssData.js";

function HeartIcon({ className = "" }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  );
}

export function DiveBook({ favorites, toggleFavorite, isFavorite, onNavigate }) {
  // Récupère les créatures favorites
  const favCreatures = CREATURES.filter((c) => favorites.includes(c.id));

  return (
    <section id="carnet" className="relative py-20 scroll-mt-20">
      <div className="mx-auto max-w-6xl px-6">
        {/* En-tête */}
        <div className="text-center mb-10 abyss-reveal">
          <span className="text-xs uppercase tracking-[0.3em] text-[#F2A33C]/80 font-medium">
            Vos découvertes
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-white mt-3 mb-4">
            Carnet de plongée
          </h2>
          <p className="text-white/60 max-w-2xl mx-auto">
            Les créatures que vous avez marquées comme favorites, conservées entre
            vos visites.
          </p>
        </div>

        {favCreatures.length === 0 ? (
          /* État vide */
          <div className="abyss-reveal rounded-2xl bg-[#061325]/60 border border-white/10 p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
              <HeartIcon className="w-8 h-8 text-white/30" />
            </div>
            <h3 className="text-xl font-semibold text-white/70 mb-2">
              Votre carnet est vide
            </h3>
            <p className="text-white/40 text-sm mb-6 max-w-md mx-auto">
              Explorez le catalogue et cliquez sur le cœur d'une créature pour
              l'ajouter à votre carnet de plongée.
            </p>
            <button
              onClick={onNavigate}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#F2A33C] text-[#031528] font-semibold text-sm hover:bg-[#ffba50] transition-colors"
            >
              Explorer le catalogue
            </button>
          </div>
        ) : (
          /* Liste des favoris */
          <div className="abyss-reveal grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {favCreatures.map((c) => (
              <div
                key={c.id}
                className="abyss-card-glow rounded-2xl overflow-hidden bg-[#061325]/80 border border-white/10 group"
              >
                <div className="relative aspect-[4/3] overflow-hidden">
                  <img
                    src={c.image}
                    alt={c.name}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#020812] to-transparent" />
                  {c.bioluminescence && (
                    <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-cyan-500/20 backdrop-blur-sm border border-cyan-400/30 text-cyan-300 text-[10px] font-medium flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                      Bioluminescent
                    </div>
                  )}
                  <button
                    onClick={() => toggleFavorite(c.id)}
                    className="absolute top-3 right-3 w-9 h-9 rounded-full bg-[#E8624A] text-white flex items-center justify-center shadow-[0_0_15px_rgba(232,98,74,0.5)] hover:scale-110 transition-transform"
                    aria-label="Retirer des favoris"
                  >
                    <HeartIcon className="w-5 h-5" />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <h3 className="text-white font-bold text-lg">{c.name}</h3>
                    <p className="text-white/50 text-xs italic">{c.latin}</p>
                  </div>
                </div>
                <div className="p-4 flex items-center justify-between text-sm">
                  <span className="text-cyan-300/70">{c.zoneLabel}</span>
                  <span className="text-white/50 font-mono text-xs">{c.depthLabel}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Statistiques du carnet */}
        {favCreatures.length > 0 && (
          <div className="abyss-reveal mt-8 grid grid-cols-3 gap-4 max-w-2xl mx-auto">
            <div className="rounded-xl bg-white/5 border border-white/10 p-4 text-center">
              <div className="text-2xl font-bold text-[#F2A33C]">{favCreatures.length}</div>
              <div className="text-xs uppercase tracking-wider text-white/40 mt-1">
                Créatures
              </div>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 p-4 text-center">
              <div className="text-2xl font-bold text-cyan-400">
                {favCreatures.filter((c) => c.bioluminescence).length}
              </div>
              <div className="text-xs uppercase tracking-wider text-white/40 mt-1">
                Bioluminescentes
              </div>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 p-4 text-center">
              <div className="text-2xl font-bold text-white">
                {new Set(favCreatures.map((c) => c.zone)).size}
              </div>
              <div className="text-xs uppercase tracking-wider text-white/40 mt-1">
                Zones explorées
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}