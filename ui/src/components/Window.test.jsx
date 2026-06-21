import { render, screen, fireEvent } from "@testing-library/react";
import Window from "./Window.jsx";

// Le CADRE de fenêtre réutilisé par TOUTES les fenêtres flottantes (#136 bureau-os) :
// position/zIndex, fermeture, focus, drag (clamp aux bords) et resize (clamp MIN_W/MIN_H).
// jsdom : window.innerWidth/innerHeight = 1024×768 par défaut (utilisés par les clamps).

const baseWin = { id: "w1", title: "Ma fenêtre", x: 100, y: 80, width: 600, height: 400, zIndex: 5 };

function setup(overrides = {}) {
  const props = {
    win: baseWin,
    onClose: vi.fn(),
    onFocus: vi.fn(),
    onMove: vi.fn(),
    onResize: vi.fn(),
    ...overrides,
  };
  render(
    <Window {...props}>
      <div>contenu ici</div>
    </Window>,
  );
  const container = screen.getByText("contenu ici").closest("div.fixed");
  const titleBar = screen.getByText("Ma fenêtre").parentElement;
  return { props, container, titleBar };
}

describe("Window", () => {
  it("rend le titre, le contenu et applique position/zIndex", () => {
    const { container } = setup();
    expect(screen.getByText("Ma fenêtre")).toBeInTheDocument();
    expect(screen.getByText("contenu ici")).toBeInTheDocument();
    expect(container.style.left).toBe("100px");
    expect(container.style.top).toBe("80px");
    expect(container.style.width).toBe("600px");
    expect(container.style.height).toBe("400px");
    expect(container.style.zIndex).toBe("5");
  });

  it("le bouton fermer appelle onClose(id)", () => {
    const { props } = setup();
    fireEvent.click(screen.getByTitle("Fermer"));
    expect(props.onClose).toHaveBeenCalledWith("w1");
  });

  it("un mousedown sur le corps remonte le focus (onFocus(id))", () => {
    const { props } = setup();
    fireEvent.mouseDown(screen.getByText("contenu ici"));
    expect(props.onFocus).toHaveBeenCalledWith("w1");
  });

  it("glisser la barre de titre : focus + onMove avec clamp au bord (≥ 0)", () => {
    const { props, titleBar } = setup();
    fireEvent.mouseDown(titleBar, { button: 0, clientX: 200, clientY: 100 });
    expect(props.onFocus).toHaveBeenCalledWith("w1");
    // déplacement vers le haut-gauche au-delà du bord → x clampé à 0, y = 80 + (30-100) = 10
    fireEvent.mouseMove(document, { clientX: 50, clientY: 30 });
    expect(props.onMove).toHaveBeenCalledWith("w1", 0, 10);
    // après relâchement, plus aucun onMove (les listeners document sont retirés)
    fireEvent.mouseUp(document);
    props.onMove.mockClear();
    fireEvent.mouseMove(document, { clientX: 500, clientY: 500 });
    expect(props.onMove).not.toHaveBeenCalled();
  });

  it("redimensionner : onResize borné par MIN_W (400) / MIN_H (280)", () => {
    const { props } = setup();
    fireEvent.mouseDown(screen.getByTitle("Redimensionner"), { button: 0, clientX: 700, clientY: 480 });
    // forte réduction → en deçà des minimums → clampé à (400, 280)
    fireEvent.mouseMove(document, { clientX: 100, clientY: 100 });
    expect(props.onResize).toHaveBeenCalledWith("w1", 400, 280);
  });
});
