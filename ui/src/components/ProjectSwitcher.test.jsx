import { render, screen, fireEvent, within } from "@testing-library/react";
import { ProjectSwitcher } from "./Header.jsx";

// Sélecteur de projet dans l'en-tête du workspace (demande de Raf : changer de
// projet sans repasser par l'accueil). Logique verrouillée : le bouton montre le
// projet actif ; ouvrir rafraîchit la liste + vide la recherche ; le filtre est
// scrollable/cherchable ; cliquer un AUTRE projet bascule (onSwitch) ; cliquer le
// projet ACTIF ne rebascule pas (no-op) ; liste vide → message.
//
// Note : le nom du projet actif apparaît à la fois sur le bouton déclencheur ET
// dans la liste → on scope toute requête de liste au PANNEAU du menu (.animate-pop).

const PROJECTS = ["alpha", "mango-boutique", "zeta-app"];

function setup(overrides = {}) {
  const props = {
    projectName: "mango-boutique",
    projects: PROJECTS,
    onSwitch: vi.fn(),
    onRefresh: vi.fn(),
    ...overrides,
  };
  render(<ProjectSwitcher {...props} />);
  const trigger = screen.getByTitle(/Changer de projet/i);
  return { props, trigger };
}

// Le panneau ouvert (contient la recherche + la liste), résolu depuis l'input.
const panel = () => screen.getByPlaceholderText(/Filtrer les projets/i).closest(".animate-pop");

describe("ProjectSwitcher", () => {
  it("le bouton affiche le projet actif et le menu est fermé au départ", () => {
    const { trigger } = setup();
    expect(trigger).toHaveTextContent("mango-boutique");
    expect(screen.queryByPlaceholderText(/Filtrer les projets/i)).toBeNull();
  });

  it("ouvrir rafraîchit la liste et révèle les projets", () => {
    const { props, trigger } = setup();
    fireEvent.click(trigger);
    expect(props.onRefresh).toHaveBeenCalledTimes(1);
    const p = panel();
    PROJECTS.forEach((name) => expect(within(p).getByText(name)).toBeTruthy());
  });

  it("cliquer un AUTRE projet bascule via onSwitch et ferme le menu", () => {
    const { props, trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.click(within(panel()).getByText("zeta-app"));
    expect(props.onSwitch).toHaveBeenCalledWith("zeta-app");
    expect(screen.queryByPlaceholderText(/Filtrer les projets/i)).toBeNull();
  });

  it("cliquer le projet ACTIF ne rebascule pas (no-op)", () => {
    const { props, trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.click(within(panel()).getByText("mango-boutique"));
    expect(props.onSwitch).not.toHaveBeenCalled();
  });

  it("le filtre de recherche réduit la liste", () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.change(screen.getByPlaceholderText(/Filtrer les projets/i), { target: { value: "zeta" } });
    const p = panel();
    expect(within(p).getByText("zeta-app")).toBeTruthy();
    expect(within(p).queryByText("alpha")).toBeNull();
  });

  it("aucune correspondance → message", () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.change(screen.getByPlaceholderText(/Filtrer les projets/i), { target: { value: "introuvable" } });
    expect(screen.getByText(/Aucun projet pour/i)).toBeTruthy();
  });

  it("liste de projets vide → message « Aucun projet pour l'instant »", () => {
    const { trigger } = setup({ projects: [], projectName: "mon-app" });
    fireEvent.click(trigger);
    expect(screen.getByText(/Aucun projet pour l'instant/i)).toBeTruthy();
  });

  it("accole les étoiles de revue (#93) au nom d'un projet noté", () => {
    const { trigger } = setup({ reviews: { alpha: { score: 4 }, "zeta-app": { score: 0 } } });
    fireEvent.click(trigger);
    // 4 étoiles sur la ligne « alpha » (via le title « Revu — 4/5 »).
    const badge = within(panel()).getByTitle(/Revu — 4\/5/i);
    expect(badge.querySelectorAll("svg").length).toBe(4); // 4 étoiles
    // un seul projet noté (alpha) → un seul badge ; zeta-app (score 0) n'en a pas.
    expect(within(panel()).getAllByTitle(/Revu —/i).length).toBe(1);
  });
});

describe("ProjectSwitcher — filtres de tri (Récent / Nom)", () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* noop */ } });

  // L'API renvoie déjà l'ordre de récence ; on simule un ordre NON-alphabétique.
  const RECENCY = ["zeta-app", "alpha", "mango-boutique"];
  const open = (projectName = "mango-boutique") => {
    render(<ProjectSwitcher projectName={projectName} projects={RECENCY} onSwitch={vi.fn()} onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByTitle(/Changer de projet/i));
  };
  // Noms des lignes de la LISTE (hors pills de tri), dans l'ordre affiché.
  const rowNames = () => {
    const list = screen.getByPlaceholderText(/Filtrer les projets/i).closest(".animate-pop").querySelector(".max-h-72");
    return [...list.querySelectorAll("button")].map((b) => b.textContent.trim());
  };

  it("par défaut = « Récent » : garde l'ordre de l'API (récence)", () => {
    open("zeta-app"); // actif épinglé en tête → reste en ordre API
    // ordre API = zeta, alpha, mango ; actif (zeta) en tête → zeta, alpha, mango
    expect(rowNames()).toEqual(["zeta-app", "alpha", "mango-boutique"]);
  });

  it("clic « Nom » → ordre alphabétique (A→Z) pour les non-actifs", () => {
    open("zeta-app");
    fireEvent.click(screen.getByRole("button", { name: /Nom/i }));
    // alphabétique = alpha, mango, zeta ; actif (zeta) épinglé en tête
    expect(rowNames()).toEqual(["zeta-app", "alpha", "mango-boutique"].slice(0, 1).concat(["alpha", "mango-boutique"]));
  });

  it("« Nom » puis retour « Récent » rétablit l'ordre de récence", () => {
    open("alpha");
    fireEvent.click(screen.getByRole("button", { name: /Nom/i }));
    // alpha actif en tête, puis mango, zeta (alphabétique)
    expect(rowNames()).toEqual(["alpha", "mango-boutique", "zeta-app"]);
    fireEvent.click(screen.getByRole("button", { name: /Récent/i }));
    // retour récence : alpha actif en tête, puis zeta, mango (ordre API moins alpha)
    expect(rowNames()).toEqual(["alpha", "zeta-app", "mango-boutique"]);
  });
});
