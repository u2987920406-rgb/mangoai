#!/usr/bin/env python3
"""Preuve PIXEL du rendu du tracker — capture et mesure dans le MÊME passage.

Pourquoi : la vision a inventé sur ce livrable (elle a décrit des temps de
chargement inexistants puis s'est contredite). La couleur d'un pixel, elle, ne
peut pas mentir. Mais échantillonner une capture prise avec une autre fenêtre
que celle de la mesure donne des couleurs fausses (décalage d'alignement) —
constaté : la même pastille « Fait » ressortait verte sur une carte et jaune sur
une autre. Donc : UNE session CDP qui (1) lit la géométrie réelle, (2) capture
la page entière, (3) échantillonne la couleur au centre de chaque pastille.

Usage: python3 sample-pixels.py <fichier.html> [--width 1280] [--out chemin.png]
Sortie : un PNG de preuve + une table état → couleur → verdict.
"""
import base64
import json
import subprocess
import sys
import time
import urllib.request

import websockets.sync.client as ws_client

CHROME = "/usr/bin/google-chrome"
PORT = 9334

JS = r"""
(() => {
  const out = [];
  const grab = (node, kind) => {
    const c = node.querySelector('.coche');
    if (!c) return;
    const r = c.getBoundingClientRect();
    out.push({
      id: node.id || (node.querySelector('.id')?.textContent || '?'),
      kind,
      label: c.getAttribute('aria-label'),
      cls: (c.getAttribute('class') || '').replace('coche ', ''),
      cx: Math.round(r.left + r.width / 2),
      cy: Math.round(r.top + r.height / 2),
      w: Math.round(r.width), h: Math.round(r.height),
    });
  };
  for (const a of document.querySelectorAll('article.carte')) grab(a, 'lot');
  for (const li of document.querySelectorAll('li.faiblesse, li.hors-audit')) grab(li, 'hors');
  return JSON.stringify({ items: out, docH: document.documentElement.scrollHeight });
})()
"""

# Couleurs attendues (source de vérité = le CSS du générateur).
ATTENDU = {
    "coche-vert": (26, 127, 55),
    "coche-orange": (255, 244, 229),
    "coche-gris": (255, 255, 255),
    "coche-barre": (236, 236, 232),
}


def main():
    args = sys.argv[1:]
    html = args[0]
    width = int(args[args.index("--width") + 1]) if "--width" in args else 1280
    out = args[args.index("--out") + 1] if "--out" in args else "/tmp/suivi-preuve.png"
    url = "file://" + (html if html.startswith("/") else "/" + html)

    proc = subprocess.Popen(
        [CHROME, "--headless=new", f"--remote-debugging-port={PORT}",
         "--no-first-run", "--no-default-browser-check", "--hide-scrollbars",
         f"--window-size={width},1000", "--force-device-scale-factor=1",
         "--disable-gpu", url],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        target = None
        for _ in range(80):
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json") as r:
                    for t in json.load(r):
                        if t.get("type") == "page" and t.get("webSocketDebuggerUrl"):
                            target = t
                            break
            except Exception:
                pass
            if target:
                break
            time.sleep(0.25)
        if not target:
            raise RuntimeError("Chrome n'a pas exposé de cible CDP")

        with ws_client.connect(target["webSocketDebuggerUrl"], max_size=64 * 1024 * 1024) as ws:
            def call(mid, method, params=None):
                ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
                while True:
                    m = json.loads(ws.recv())
                    if m.get("id") == mid:
                        return m

            geom = json.loads(
                call(1, "Runtime.evaluate", {"expression": JS, "returnByValue": True})
                ["result"]["result"]["value"]
            )
            shot = call(2, "Page.captureScreenshot",
                        {"format": "png", "captureBeyondViewport": True})
            with open(out, "wb") as f:
                f.write(base64.b64decode(shot["result"]["data"]))
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except Exception:
            proc.kill()

    from PIL import Image
    img = Image.open(out).convert("RGB")
    print(f"capture : {out} — {img.width}x{img.height} px (doc {geom['docH']} px)")
    print(f"pastilles mesurées : {len(geom['items'])}\n")
    print(f"{'id':6s} {'état':10s} {'classe CSS':16s} {'couleur px':18s} verdict")

    par_classe = {}
    pbs = []
    for it in geom["items"]:
        # Échantillonnage en COIN INTÉRIEUR (jamais au centre : c'est là que le
        # glyphe ✓/◐/✕ est dessiné, et sa couleur n'est pas celle du fond).
        # On reste à 8 px du bord : hors bordure (2 px) et hors glyphe.
        ox = it["cx"] - it["w"] // 2 + 8
        oy = it["cy"] - it["h"] // 2 + 8
        x = min(img.width - 1, max(0, ox))
        y = min(img.height - 1, max(0, oy))
        cols = [img.getpixel((min(img.width - 1, max(0, x + dx)), min(img.height - 1, max(0, y + dy))))
                for dx, dy in ((0, 0), (2, 0), (0, 2), (2, 2))]
        col = max(set(cols), key=cols.count)
        att = ATTENDU.get(it["cls"])
        # tolérance 12/255 par canal : JPEG n'existe pas ici, mais l'anti-aliasing du
        # glyphe peut mordre le centre ; les fonds sont bien séparés (>40 par canal).
        ok = att is not None and all(abs(a - b) <= 12 for a, b in zip(col, att))
        par_classe.setdefault(it["cls"], {"attendu": att, "n": 0, "ok": 0, "vus": set()})
        par_classe[it["cls"]]["n"] += 1
        par_classe[it["cls"]]["ok"] += 1 if ok else 0
        par_classe[it["cls"]]["vus"].add(col)
        if not ok:
            pbs.append(it["id"])
        print(f"{it['id']:6s} {str(it['label']):10s} {it['cls']:16s} rgb{str(col):18s} "
              f"{'OK' if ok else 'DIVERGENT (attendu rgb' + str(att) + ')'}  ({x},{y}) {it['w']}x{it['h']}")

    print("\n--- synthèse par état (source de vérité = couleur CSS du générateur)")
    total_ok = 0
    total = 0
    for cls, d in sorted(par_classe.items()):
        total_ok += d["ok"]
        total += d["n"]
        print(f"  {cls:16s} attendu rgb{str(d['attendu']):18s} {d['ok']}/{d['n']} conformes"
              f"  couleurs vues : {sorted(d['vus'])}")
    print(f"\n{'PASS' if total_ok == total else 'FAIL'} — {total_ok}/{total} pastilles "
          f"portent la couleur de leur état déclaré")
    if pbs:
        print(f"divergentes : {', '.join(pbs)}")
    return 0 if total_ok == total else 1


if __name__ == "__main__":
    sys.exit(main())
