import { useState, useEffect } from "react";

export function Hero({ onStart }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <section
      id="hero"
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
    >
      {/* Image de fond */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: `url("https://images.pexels.com/photos/932638/pexels-photo-932638.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a4a7a]/40 via-[#031528]/60 to-[#000206]/90" />
      </div>

      {/* Contenu */}
      <div
        className={`relative z-10 mx-auto max-w-4xl px-6 text-center transition-all duration-1000 ${
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
        }`}
      >
        <div
          className={`inline-block mb-6 transition-all duration-1000 delay-200 ${
            mounted ? "opacity-100" : "opacity-0"
          }`}
        >
          <span className="text-xs uppercase tracking-[0.3em] text-cyan-300/80 font-medium">
            Plongée dans les grands fonds
          </span>
        </div>

        <h1
          className={`text-6xl md:text-8xl font-bold text-white mb-4 transition-all duration-1000 delay-300 ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
          style={{ letterSpacing: "-0.03em" }}
        >
          ABYSS
        </h1>

        <p
          className={`text-lg md:text-xl text-white/70 mb-10 max-w-2xl mx-auto transition-all duration-1000 delay-500 ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          Descendez dans l'obscurité la plus totale. Explorez les zones les plus
          inaccessibles de notre planète, où la lumière n'existe plus et où la vie
          s'adapte à l'impossible.
        </p>

        <button
          onClick={onStart}
          className={`group relative inline-flex items-center gap-3 px-8 py-4 rounded-full font-semibold text-[#031528] bg-[#F2A33C] hover:bg-[#ffba50] transition-all duration-300 shadow-lg hover:shadow-[0_0_30px_rgba(242,163,60,0.4)] hover:scale-105 transition-all duration-1000 delay-700 ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <span>Commencer la descente</span>
          <svg
            className="w-5 h-5 transition-transform duration-300 group-hover:translate-y-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
        </button>

        {/* Indicateur de scroll */}
        <div
          className={`absolute -bottom-24 left-1/2 -translate-x-1/2 transition-all duration-1000 delay-1000 ${
            mounted ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="flex flex-col items-center gap-2 text-white/40">
            <span className="text-xs uppercase tracking-wider">Scrollez pour descendre</span>
            <div className="w-px h-12 bg-gradient-to-b from-white/40 to-transparent animate-pulse" />
          </div>
        </div>
      </div>
    </section>
  );
}