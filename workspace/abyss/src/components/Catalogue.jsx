import { useState, useMemo, useCallback } from "react";
import { CREATURES, ZONES } from "../data/abyssData.js";

// ── Icône favori (cœur) ──
function HeartIcon({ filled, className = "" }) {
  return (
    <svg
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
      />
    </svg>
  );
}

// ── Carte créature ──
function CreatureCard({ creature, onOpen, isFav, onToggleFav }) {
  return (
    <div className="abyss-reveal abyss-card-glow rounded-2xl overflow-hidden bg-[#061325]/80 border border-white/10 group cursor-pointer"
      onClick={() => onOpen(creature)}
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <img
          src={creature.image}
          alt={creature.name}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#020812] via-transparent to-transparent" />
        {/* Badge bioluminescence */}
        {creature.bioluminescence && (
          <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-cyan-500/20 backdrop-blur-sm border border-cyan-400/30 text-cyan-300 text-[10px] font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            Bioluminescent
          </div>
        )}
        {/* Bouton favori */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFav(creature.id);
          }}
          className={`absolute top-3 right-3 w-9 h-9 rounded-full backdrop-blur-sm flex items-center justify-center transition-all duration-300 ${
            isFav
              ? "bg-[#E8624A] text-white shadow-[0_0_15px_rgba(232,98,74,0.5)]"
              : "bg-black/40 text-white/60 hover:text-[#E8624A] hover:bg-black/60"
          }`}
          aria-label={isFav ? "Retirer des favoris" : "Ajouter aux favoris"}
        >
          <HeartIcon filled={isFav} className="w-5 h-5" />
        </button>
        {/* Nom + profondeur */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3 className="text-white font-bold text-lg leading-tight">{creature.name}</h3>
          <p className="text-white/50 text-xs italic">{creature.latin}</p>
        </div>
      </div>
      {/* Footer */}
      <div className="p-4 flex items-center justify-between text-sm">
        <span className="text-cyan-300/70">{creature.zoneLabel}</span>
        <span className="text-white/50 font-mono text-xs">{creature.depthLabel}</span>
      </div>
    </div>
  );
}

// ── Modale fiche détaillée ──
function CreatureModal({ creature, onClose, isFav, onToggleFav }) {
  if (!creature) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-w-3xl w-full max-h-[90vh] overflow-y-auto rounded-2xl bg-[#061325] border border-cyan-400/20 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Image */}
        <div className="relative aspect-[16/9] overflow-hidden rounded-t-2xl">
          <img
            src={creature.image}
            alt={creature.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#061325] to-transparent" />
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/70 transition-colors"
            aria-label="Fermer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Contenu */}
        <div className="p-6 md:p-8">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-3xl font-bold text-white">{creature.name}</h2>
              <p className="text-cyan-300/60 italic">{creature.latin}</p>
            </div>
            <button
              onClick={() => onToggleFav(creature.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm transition-all duration-300 ${
                isFav
                  ? "bg-[#E8624A] text-white"
                  : "bg-white/10 text-white/70 hover:bg-white/20"
              }`}
            >
              <HeartIcon filled={isFav} className="w-4 h-4" />
              {isFav ? "Dans le carnet" : "Ajouter au carnet"}
            </button>
          </div>

          <p className="text-white/70 leading-relaxed mb-6">{creature.description}</p>

          {/* Stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="rounded-xl bg-white/5 border border-white/10 p-3">
              <div className="text-xs uppercase tracking-wider text-white/40 mb-1">Zone</div>
              <div className="text-sm font-semibold text-cyan-300">{creature.zoneLabel}</div>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 p-3">
              <div className="text-xs uppercase tracking-wider text-white/40 mb-1">Profondeur</div>
              <div className="text-sm font-semibold text-white">{creature.depthLabel}</div>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 p-3">
              <div className="text-xs uppercase tracking-wider text-white/40 mb-1">Taille</div>
              <div className="text-sm font-semibold text-white">{creature.size}</div>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 p-3">
              <div className="text-xs uppercase tracking-wider text-white/40 mb-1">Bioluminescence</div>
              <div className="text-sm font-semibold text-white">
                {creature.bioluminescence ? "Oui" : "Non"}
              </div>
            </div>
          </div>

          {/* Faits */}
          <div>
            <h3 className="text-sm uppercase tracking-wider text-[#F2A33C] mb-3 font-medium">
              Le saviez-vous ?
            </h3>
            <ul className="space-y-2">
              {creature.facts.map((fact, i) => (
                <li key={i} className="flex items-start gap-2 text-white/70 text-sm">
                  <span className="text-cyan-400 mt-1">▸</span>
                  <span>{fact}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Catalogue principal ──
export function Catalogue({ favorites, toggleFavorite, isFavorite }) {
  const [search, setSearch] = useState("");
  const [zoneFilter, setZoneFilter] = useState("all");
  const [bioFilter, setBioFilter] = useState("all");
  const [sortBy, setSortBy] = useState("depth-asc");
  const [selected, setSelected] = useState(null);

  const filtered = useMemo(() => {
    let result = CREATURES.filter((c) => {
      // Recherche texte
      if (search) {
        const q = search.toLowerCase();
        if (
          !c.name.toLowerCase().includes(q) &&
          !c.latin.toLowerCase().includes(q) &&
          !c.zoneLabel.toLowerCase().includes(q)
        )
          return false;
      }
      // Filtre zone
      if (zoneFilter !== "all" && c.zone !== zoneFilter) return false;
      // Filtre bioluminescence
      if (bioFilter === "yes" && !c.bioluminescence) return false;
      if (bioFilter === "no" && c.bioluminescence) return false;
      return true;
    });

    // Tri
    result = [...result].sort((a, b) => {
      if (sortBy === "depth-asc") return a.depth - b.depth;
      if (sortBy === "depth-desc") return b.depth - a.depth;
      if (sortBy === "name-asc") return a.name.localeCompare(b.name);
      if (sortBy === "name-desc") return b.name.localeCompare(a.name);
      return 0;
    });

    return result;
  }, [search, zoneFilter, bioFilter, sortBy]);

  const handleOpen = useCallback((c) => setSelected(c), []);
  const handleClose = useCallback(() => setSelected(null), []);

  return (
    <section id="catalogue" className="relative py-20 scroll-mt-20">
      <div className="mx-auto max-w-6xl px-6">
        {/* En-tête */}
        <div className="text-center mb-10 abyss-reveal">
          <span className="text-xs uppercase tracking-[0.3em] text-cyan-300/60 font-medium">
            Bestiaire
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-white mt-3 mb-4">
            Catalogue des créatures
          </h2>
          <p className="text-white/60 max-w-2xl mx-auto">
            {CREATURES.length} espèces, du plus inoffensif au plus étrange. Filtrez,
            cherchez, triez — et ajoutez vos découvertes à votre carnet de plongée.
          </p>
        </div>

        {/* Barre de filtres */}
        <div className="abyss-reveal rounded-2xl bg-[#061325]/80 border border-white/10 p-4 md:p-5 mb-8 space-y-4">
          {/* Recherche */}
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Rechercher une créature..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/40 text-sm focus:outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/30 transition-colors"
            />
          </div>

          {/* Filtres + tri */}
          <div className="flex flex-wrap gap-3">
            {/* Filtre zone */}
            <select
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value)}
              className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-cyan-400/50 cursor-pointer"
            >
              <option value="all">Toutes les zones</option>
              {ZONES.map((z) => (
                <option key={z.id} value={z.id} className="bg-[#061325]">
                  {z.name}
                </option>
              ))}
            </select>

            {/* Filtre bioluminescence */}
            <select
              value={bioFilter}
              onChange={(e) => setBioFilter(e.target.value)}
              className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-cyan-400/50 cursor-pointer"
            >
              <option value="all">Bioluminescence : toutes</option>
              <option value="yes" className="bg-[#061325]">Bioluminescentes uniquement</option>
              <option value="no" className="bg-[#061325]">Non bioluminescentes</option>
            </select>

            {/* Tri */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-cyan-400/50 cursor-pointer ml-auto"
            >
              <option value="depth-asc" className="bg-[#061325]">Profondeur ↑</option>
              <option value="depth-desc" className="bg-[#061325]">Profondeur ↓</option>
              <option value="name-asc" className="bg-[#061325]">Nom A → Z</option>
              <option value="name-desc" className="bg-[#061325]">Nom Z → A</option>
            </select>
          </div>

          {/* Compteur résultats */}
          <div className="text-xs text-white/40">
            {filtered.length} créature{filtered.length > 1 ? "s" : ""} trouvée
            {filtered.length > 1 ? "s" : ""}
          </div>
        </div>

        {/* Grille de créatures */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((c) => (
              <CreatureCard
                key={c.id}
                creature={c}
                onOpen={handleOpen}
                isFav={isFavorite(c.id)}
                onToggleFav={toggleFavorite}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 text-white/40">
            <p className="text-lg mb-2">Aucune créature trouvée</p>
            <p className="text-sm">Essayez de modifier vos filtres</p>
          </div>
        )}
      </div>

      {/* Modale fiche détaillée */}
      {selected && (
        <CreatureModal
          creature={selected}
          onClose={handleClose}
          isFav={isFavorite(selected.id)}
          onToggleFav={toggleFavorite}
        />
      )}
    </section>
  );
}