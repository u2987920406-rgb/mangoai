import { CATEGORY_META } from "./helpers.js";

// Badge de catégorie — extrait verbatim de MultiProject.jsx.
export default function CategoryBadge({ category }) {
  const meta = CATEGORY_META[category] ?? CATEGORY_META.other;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${meta.className}`}>
      {meta.label}
    </span>
  );
}
