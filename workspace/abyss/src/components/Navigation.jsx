import { useState, useEffect } from "react";

const NAV_LINKS = [
  { id: "zones", label: "Zones" },
  { id: "catalogue", label: "Catalogue" },
  { id: "carnet", label: "Carnet" },
  { id: "quiz", label: "Quiz" },
];

export function NavBar({ currentView, onNavigate, favCount }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleClick = (id) => {
    onNavigate(id);
    setMobileOpen(false);
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-[#020812]/90 backdrop-blur-md border-b border-white/10"
          : "bg-transparent"
      }`}
    >
      <nav className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <button
          onClick={() => onNavigate("descent")}
          className="flex items-center gap-2 group"
        >
          <svg className="w-7 h-7 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 2C12 2 6 8 6 14a6 6 0 0012 0c0-6-6-12-6-12z" />
            <circle cx="12" cy="14" r="2" fill="currentColor" />
          </svg>
          <span className="text-xl font-bold text-white tracking-tight">ABYSS</span>
        </button>

        {/* Liens desktop */}
        <div className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((link) => (
            <button
              key={link.id}
              onClick={() => handleClick(link.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                currentView === link.id
                  ? "text-cyan-300 bg-white/5"
                  : "text-white/60 hover:text-white hover:bg-white/5"
              }`}
            >
              {link.label}
            </button>
          ))}
          {/* Badge favoris */}
          <button
            onClick={() => handleClick("carnet")}
            className="relative ml-2 px-3 py-2 rounded-full text-sm font-medium text-white/60 hover:text-[#F2A33C] transition-colors flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            {favCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#E8624A] text-white text-[10px] font-bold flex items-center justify-center">
                {favCount}
              </span>
            )}
          </button>
        </div>

        {/* Bouton menu mobile */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden w-10 h-10 flex items-center justify-center text-white"
          aria-label="Menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            {mobileOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </nav>

      {/* Menu mobile */}
      {mobileOpen && (
        <div className="md:hidden bg-[#020812]/95 backdrop-blur-md border-t border-white/10">
          <div className="px-6 py-4 space-y-1">
            {NAV_LINKS.map((link) => (
              <button
                key={link.id}
                onClick={() => handleClick(link.id)}
                className={`block w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                  currentView === link.id
                    ? "text-cyan-300 bg-white/5"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                {link.label}
                {link.id === "carnet" && favCount > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#E8624A] text-white text-[10px] font-bold">
                    {favCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}

export function Footer() {
  return (
    <footer className="relative z-10 border-t border-white/10 bg-[#020812] py-10">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <svg className="w-6 h-6 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 2C12 2 6 8 6 14a6 6 0 0012 0c0-6-6-12-6-12z" />
              <circle cx="12" cy="14" r="2" fill="currentColor" />
            </svg>
            <span className="text-lg font-bold text-white tracking-tight">ABYSS</span>
          </div>
          <p className="text-sm text-white/40 text-center">
            Plongée immersive dans les grands fonds marins · Données éducatives ·{" "}
            <span className="text-[#F2A33C]">Photos Pexels</span>
          </p>
          <p className="text-xs text-white/30">
            95 % de l'océan reste inexploré
          </p>
        </div>
      </div>
    </footer>
  );
}