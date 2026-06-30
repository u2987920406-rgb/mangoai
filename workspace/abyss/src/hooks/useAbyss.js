import { useState, useEffect, useRef, useCallback } from "react";

// ── useScrollDepth : calcule la profondeur simulée (0–maxDepth m) selon le scroll ─
export function useScrollDepth(maxDepth = 11000) {
  const [depth, setDepth] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const progress = docHeight > 0 ? Math.min(scrollTop / docHeight, 1) : 0;
        setScrollProgress(progress);
        setDepth(Math.round(progress * maxDepth));
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [maxDepth]);

  return { depth, scrollProgress };
}

// ── useFavorites : gestion des favoris persistés en localStorage ─
const STORAGE_KEY = "abyss-favorites";

export function useFavorites() {
  const [favorites, setFavorites] = useState([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setFavorites(JSON.parse(stored));
    } catch {
      // localStorage indisponible ou corrompu
    }
  }, []);

  const toggleFavorite = useCallback((creatureId) => {
    setFavorites((prev) => {
      const next = prev.includes(creatureId)
        ? prev.filter((id) => id !== creatureId)
        : [...prev, creatureId];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const isFavorite = useCallback(
    (creatureId) => favorites.includes(creatureId),
    [favorites]
  );

  return { favorites, toggleFavorite, isFavorite };
}

// ── useReveal : observer IntersectionObserver pour les animations reveal au scroll ─
export function useReveal() {
  const observerRef = useRef(null);

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("abyss-visible");
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -60px 0px" }
    );

    // Délai pour laisser le DOM se mettre à jour après un changement de vue
    const timer = setTimeout(() => {
      const els = document.querySelectorAll(".abyss-reveal:not(.abyss-visible)");
      els.forEach((el) => observer.observe(el));
    }, 80);

    observerRef.current = observer;

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);
}