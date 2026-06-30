import { useEffect, useState } from "react";
import { cn } from "../lib/utils.js";

// ─── Barre d'XP avec niveau ──────────────────────────────────────────────────
export function XPBar({ level, xpInLevel, xpForNext, compact = false }) {
  const pct = Math.min(100, (xpInLevel / xpForNext) * 100);
  return (
    <div className={cn("flex items-center gap-3", compact && "gap-2")}>
      <div className={cn(
        "flex items-center justify-center rounded-full bg-primary text-primary-foreground font-bold shrink-0",
        compact ? "w-8 h-8 text-xs" : "w-10 h-10 text-sm"
      )}>
        {level}
      </div>
      <div className="flex-1">
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>Niveau {level}</span>
          <span>{xpInLevel} / {xpForNext} XP</span>
        </div>
        <div className="h-3 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-700 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Streak indicator ─────────────────────────────────────────────────────────
export function StreakBadge({ streak }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-50 border border-orange-200">
      <span className="text-lg">🔥</span>
      <span className="font-bold text-sm text-orange-600">{streak}</span>
      <span className="text-xs text-orange-500">jours</span>
    </div>
  );
}

// ─── Score TOEIC estimé ──────────────────────────────────────────────────────
export function ScoreDisplay({ score, size = "md" }) {
  const sizes = {
    sm: { num: "text-2xl", label: "text-xs" },
    md: { num: "text-4xl", label: "text-sm" },
    lg: { num: "text-5xl", label: "text-base" },
  };
  const s = sizes[size] || sizes.md;
  return (
    <div className="text-center">
      <div className={cn("font-extrabold text-foreground", s.num)}>{score}</div>
      <div className={cn("text-muted-foreground", s.label)}>Score TOEIC estimé</div>
    </div>
  );
}

// ─── Badge card ──────────────────────────────────────────────────────────────
export function BadgeCard({ badge, earned = false }) {
  return (
    <div className={cn(
      "flex flex-col items-center gap-2 p-4 rounded-2xl border-2 text-center transition-all",
      earned
        ? "border-accent bg-accent/5 shadow-sm"
        : "border-border bg-muted/30 opacity-50 grayscale"
    )}>
      <div className="text-4xl">{badge.emoji}</div>
      <div className="font-bold text-sm">{badge.name}</div>
      <div className="text-xs text-muted-foreground">{badge.description}</div>
    </div>
  );
}

// ─── Confetti animation ──────────────────────────────────────────────────────
export function Confetti({ show, count = 30 }) {
  if (!show) return null;
  const colors = ["#F2A33C", "#E8624A", "#58cc02", "#1cb0f6", "#a5ed6e"];
  const pieces = Array.from({ length: count }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    duration: 2 + Math.random() * 1.5,
    color: colors[i % colors.length],
    size: 8 + Math.random() * 8,
  }));
  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      {pieces.map((p) => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            background: p.color,
            borderRadius: p.id % 2 === 0 ? "50%" : "2px",
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </div>
  );
}

// ─── Timer ───────────────────────────────────────────────────────────────────
export function SessionTimer({ active, onExpire, seconds = 0 }) {
  const [timeLeft, setTimeLeft] = useState(seconds);

  useEffect(() => {
    if (!active) return;
    setTimeLeft(seconds);
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (onExpire) onExpire();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [active, seconds, onExpire]);

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const isLow = timeLeft <= 30 && timeLeft > 0;

  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-1.5 rounded-full font-mono font-bold text-sm transition-colors",
      isLow ? "bg-red-50 text-red-600 animate-pulse" : "bg-muted text-foreground"
    )}>
      <span>⏱️</span>
      <span>{String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}</span>
    </div>
  );
}

// ─── Reveal on scroll wrapper ────────────────────────────────────────────────
export function Reveal({ children, delay = 0, className = "" }) {
  const [ref, setRef] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ref) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(ref);
    return () => observer.disconnect();
  }, [ref]);

  return (
    <div
      ref={setRef}
      className={cn("reveal", visible && "revealed", className)}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}