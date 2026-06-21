import { render, screen, fireEvent } from "@testing-library/react";
import ConfirmDelete from "./ConfirmDelete.jsx";

// La garde de suppression réutilisée pour la poubelle d'un projet ET la suppression
// en lot (popover ancré, pas de window.confirm natif). Verrou anti-régression sur une
// action DESTRUCTIVE : le popover doit s'ouvrir, ne confirmer que sur clic explicite,
// et se fermer (Annuler / Échap / clic extérieur) sans déclencher onConfirm.

function setup(overrides = {}) {
  const props = { onConfirm: vi.fn(), ...overrides };
  render(
    <ConfirmDelete {...props}>
      <span>poubelle</span>
    </ConfirmDelete>,
  );
  return props;
}

describe("ConfirmDelete", () => {
  it("popover fermé au départ (aucune confirmation visible)", () => {
    setup();
    expect(screen.getByText("poubelle")).toBeInTheDocument();
    expect(screen.queryByText("Supprimer")).not.toBeInTheDocument();
  });

  it("clic sur le déclencheur ouvre le popover (message + label par défaut)", () => {
    setup();
    fireEvent.click(screen.getByText("poubelle"));
    expect(screen.getByText("Supprimer ? Cette action est irréversible.")).toBeInTheDocument();
    expect(screen.getByText("Supprimer")).toBeInTheDocument();
    expect(screen.getByText("Annuler")).toBeInTheDocument();
  });

  it("confirmer appelle onConfirm puis ferme", () => {
    const props = setup();
    fireEvent.click(screen.getByText("poubelle"));
    fireEvent.click(screen.getByText("Supprimer"));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Annuler")).not.toBeInTheDocument();
  });

  it("Annuler ferme sans appeler onConfirm", () => {
    const props = setup();
    fireEvent.click(screen.getByText("poubelle"));
    fireEvent.click(screen.getByText("Annuler"));
    expect(props.onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByText("Supprimer ? Cette action est irréversible.")).not.toBeInTheDocument();
  });

  it("Échap ferme le popover", () => {
    setup();
    fireEvent.click(screen.getByText("poubelle"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Annuler")).not.toBeInTheDocument();
  });

  it("un clic extérieur ferme le popover", () => {
    setup();
    fireEvent.click(screen.getByText("poubelle"));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("Annuler")).not.toBeInTheDocument();
  });

  it("disabled : le clic n'ouvre rien", () => {
    setup({ disabled: true });
    fireEvent.click(screen.getByText("poubelle"));
    expect(screen.queryByText("Annuler")).not.toBeInTheDocument();
  });

  it("message et label personnalisés sont rendus", () => {
    setup({ message: "Effacer le projet ?", confirmLabel: "Effacer" });
    fireEvent.click(screen.getByText("poubelle"));
    expect(screen.getByText("Effacer le projet ?")).toBeInTheDocument();
    expect(screen.getByText("Effacer")).toBeInTheDocument();
  });
});
