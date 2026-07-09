import { ALL_CATEGORIES, CATEGORY_META } from "./helpers.js";

// Toggles de filtre par catégorie — extrait verbatim de MultiProject.jsx.
export default function CategoryFilters({ active, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ALL_CATEGORIES.map((cat) => {
        const meta = CATEGORY_META[cat];
        const isActive = active.has(cat);
        return (
          <button
            key={cat}
            onClick={() => onChange(cat)}
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
              isActive
                ? `${meta.className} border-current`
                : "border-edge text-dim hover:text-ink"
            }`}
          >
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}
