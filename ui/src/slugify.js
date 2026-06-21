// Dérive un slug de projet propre depuis un texte libre (description / idée).
// Partagé entre la Home et la fenêtre App Builder pour éviter la duplication.
export function slugify(text) {
  return (
    (text ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .split(/\s+/)
      .slice(0, 4)
      .join("-")
      .slice(0, 40) || "mon-projet"
  );
}
