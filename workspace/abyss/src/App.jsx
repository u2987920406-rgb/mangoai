import { useState, useCallback } from "react";
import { useScrollDepth, useFavorites, useReveal } from "./hooks/useAbyss.js";
import {
  DepthBackground,
  DepthIndicator,
  Bioluminescence,
} from "./components/DepthSystem.jsx";
import { Hero } from "./components/Hero.jsx";
import { ZoneSections } from "./components/ZoneSections.jsx";
import { Catalogue } from "./components/Catalogue.jsx";
import { DiveBook } from "./components/DiveBook.jsx";
import { Quiz } from "./components/Quiz.jsx";
import { NavBar, Footer } from "./components/Navigation.jsx";

export default function App() {
  const { depth, scrollProgress } = useScrollDepth(11000);
  const { favorites, toggleFavorite, isFavorite } = useFavorites();
  const [view, setView] = useState("descent");

  // Re-trigger reveal observer on view change
  useReveal();

  const handleNavigate = useCallback((target) => {
    setView(target);
    setTimeout(() => {
      if (target === "descent") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        const el = document.getElementById(target);
        if (el) {
          el.scrollIntoView({ behavior: "smooth" });
        }
      }
    }, 50);
  }, []);

  const handleStart = useCallback(() => {
    const el = document.getElementById("zones");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }, []);

  return (
    <div className="relative min-h-screen">
      {/* Fond dynamique + particules */}
      <DepthBackground scrollProgress={scrollProgress} />
      <Bioluminescence scrollProgress={scrollProgress} />
      <DepthIndicator depth={depth} scrollProgress={scrollProgress} />

      {/* Navigation */}
      <NavBar
        currentView={view}
        onNavigate={handleNavigate}
        favCount={favorites.length}
      />

      {/* Contenu principal — page unique avec sections */}
      <main className="relative z-10 pt-16">
        <Hero onStart={handleStart} />
        <ZoneSections />
        <Catalogue
          favorites={favorites}
          toggleFavorite={toggleFavorite}
          isFavorite={isFavorite}
        />
        <DiveBook
          favorites={favorites}
          toggleFavorite={toggleFavorite}
          isFavorite={isFavorite}
          onNavigate={() => handleNavigate("catalogue")}
        />
        <Quiz />
      </main>

      <Footer />
    </div>
  );
}