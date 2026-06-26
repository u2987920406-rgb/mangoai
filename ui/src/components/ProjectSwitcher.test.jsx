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
});
