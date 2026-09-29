#!/usr/bin/env python3
"""Mesure les 5 lois du GATE VISUEL sur une page HTML servie en file://,
via le protocole CDP (Chrome DevTools Protocol) — donc sur le DOM RÉEL, pas
sur une lecture d'œil. Verdict binaire par loi.

Usage : python3 suivi/cdp_measure.py <fichier.html> --width 1280 [--height 2400]

Lois mesurées :
  1. docOverflow      — la page ne déborde pas horizontalement
  2. clipOverflow     — aucun enfant ne dépasse son conteneur (overflow hidden inclus)
  3. textTruncation   — aucun texte coupé (scrollWidth > clientWidth)
  4. blockOverlap     — aucun chevauchement de blocs
  5. fontSize         — tout texte ≥ 16px
  6. contrast         — contraste ≥ 4.5:1 (approximé sur la couleur calculée)

Sortie : un seul objet JSON sur la dernière ligne (contrat attendu par capture.sh).
"""
import argparse
import json
import os
import signal
import subprocess
import sys
import tempfile
import time
import urllib.request

MIN_FONT = 16.0
MIN_CONTRAST = 4.5


def port_libre() -> int:
    """Un port libre : deux runs consecutifs ne doivent pas se disputer le port
    (un Chrome zombie garde le sien et faisait echouer le suivant)."""
    import socket as _s
    with _s.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def chrome(port: int, width: int, height: int, url: str):
    # start_new_session : le process et ses enfants forment un groupe qu'on peut
    # tuer d'un bloc (sinon des Chrome headless s'accumulent et saturent les ports).
    return subprocess.Popen(
        [
            "google-chrome", "--headless=new", "--no-sandbox", "--disable-gpu",
            f"--remote-debugging-port={port}", "--remote-allow-origins=*",
            "--user-data-dir=" + tempfile.mkdtemp(prefix="cdp-measure-"),
            f"--window-size={width},{height}", url,
        ],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        start_new_session=True,
    )


def wait_target(port: int, timeout=25):
    end = time.time() + timeout
    while time.time() < end:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=2) as r:
                for t in json.load(r):
                    if t.get("type") == "page" and t.get("webSocketDebuggerUrl"):
                        return t["webSocketDebuggerUrl"]
        except Exception:
            pass
        time.sleep(0.3)
    return None


SONDE = r"""
const MIN_FONT = %MIN_FONT%;
const MIN_CONTRAST = %MIN_CONTRAST%;
(() => {
  const px = (v) => parseFloat(v) || 0;
  const rgb = (s) => { const m = (s.match(/\d+/g) || []).map(Number); return m.slice(0,3); };
  const lum = ([r,g,b]) => { const f = (c) => { c/=255; return c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); };
    return 0.2126*f(r) + 0.7152*f(g) + 0.0722*f(b); };
  const ratio = (a, b) => { const [l1,l2] = [lum(a), lum(b)].sort((x,y)=>y-x); return (l1+0.05)/(l2+0.05); };
  const fond = (el) => { let e = el; while (e) { const c = getComputedStyle(e).backgroundColor;
    if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return rgb(c); e = e.parentElement; } return [255,255,255]; };
  const texte = (el) => Array.from(el.childNodes).filter(n => n.nodeType === 3)
    .map(n => n.textContent.trim()).join(' ').trim();

  const laws = { docOverflow:{pass:true,offenders:[]}, clipOverflow:{pass:true,offenders:[]},
    textTruncation:{pass:true,offenders:[]}, blockOverlap:{pass:true,offenders:[]},
    fontSize:{pass:true,offenders:[]}, contrast:{pass:true,offenders:[]} };

  if (document.documentElement.scrollWidth > window.innerWidth + 1)
    laws.docOverflow = {pass:false, offenders:[{cls:'html', w:document.documentElement.scrollWidth}]};

  const tout = Array.from(document.querySelectorAll('*'));
  for (const el of tout) {
    if (!el.getClientRects().length) continue;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;

    if (el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== 'visible' && el.scrollWidth > 4)
      laws.clipOverflow.offenders.push({cls:el.className||el.tagName, sw:el.scrollWidth, cw:el.clientWidth});

    if (el.scrollHeight > el.clientHeight + 1 && cs.overflowY === 'hidden' && texte(el))
      laws.textTruncation.offenders.push({cls:el.className||el.tagName, sh:el.scrollHeight, ch:el.clientHeight});

    const t = texte(el);
    if (t) {
      const fs = px(cs.fontSize);
      if (fs < MIN_FONT) laws.fontSize.offenders.push({cls:el.className||el.tagName, fs, text:t.slice(0,40)});
      const cr = ratio(rgb(cs.color), fond(el));
      if (cr < MIN_CONTRAST) laws.contrast.offenders.push({cls:el.className||el.tagName, ratio:+cr.toFixed(2), text:t.slice(0,40)});
    }
    // chevauchement : un enfant qui sort du cadre de son parent
    const p = el.parentElement;
    if (p) { const pr = p.getBoundingClientRect();
      if (pr.width > 0 && (r.left < pr.left - 2 || r.right > pr.right + 2))
        laws.blockOverlap.offenders.push({cls:el.className||el.tagName, l:Math.round(r.left), pr:Math.round(pr.left), rr:Math.round(r.right), prr:Math.round(pr.right)});
    }
  }
  laws.clipOverflow.pass = laws.clipOverflow.offenders.length === 0;
  laws.textTruncation.pass = laws.textTruncation.offenders.length === 0;
  laws.blockOverlap.pass = laws.blockOverlap.offenders.length === 0;
  laws.fontSize.pass = laws.fontSize.offenders.length === 0;
  laws.contrast.pass = laws.contrast.offenders.length === 0;
  return JSON.stringify({laws});
})()
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("html")
    ap.add_argument("--width", type=int, default=1280)
    ap.add_argument("--height", type=int, default=2400)
    ap.add_argument("--port", type=int, default=0, help="0 = port libre automatique")
    a = ap.parse_args()

    # file:// par defaut ; une URL http(s) est utilisee TELLE QUELLE (page servie).
    url = a.html if (a.html.startswith("file://") or a.html.startswith("http://") or a.html.startswith("https://")) else "file://" + os.path.abspath(a.html)
    port = a.port or port_libre()
    proc = chrome(port, a.width, a.height, url)
    try:
        ws = wait_target(port)
        if not ws:
            print(json.dumps({"laws": {}, "error": "CDP injoignable"}))
            return 1
        # client WebSocket minimal via le module stdlib
        import base64, hashlib, socket, struct
        from urllib.parse import urlparse

        u = urlparse(ws)
        s = socket.create_connection((u.hostname, u.port), timeout=20)
        key = base64.b64encode(os.urandom(16)).decode()
        s.sendall((f"GET {u.path} HTTP/1.1\r\nHost: {u.hostname}:{u.port}\r\n"
                   f"Upgrade: websocket\r\nConnection: Upgrade\r\n"
                   f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n"
                   f"Origin: http://127.0.0.1:{u.port}\r\n\r\n").encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            buf += s.recv(4096)

        def envoyer(obj):
            data = json.dumps(obj).encode()
            hdr = bytearray([0x81])
            n = len(data)
            if n < 126:
                hdr.append(n)
            else:
                hdr.append(126)
                hdr += struct.pack(">H", n)
            hdr[1] |= 0x80
            masque = os.urandom(4)
            hdr += masque
            s.sendall(bytes(hdr) + bytes(b ^ masque[i % 4] for i, b in enumerate(data)))

        def recevoir():
            while True:
                entete = s.recv(2)
                if len(entete) < 2:
                    return None
                length = entete[1] & 0x7F
                if length == 126:
                    length = struct.unpack(">H", s.recv(2))[0]
                elif length == 127:
                    length = struct.unpack(">Q", s.recv(8))[0]
                data = b""
                while len(data) < length:
                    data += s.recv(length - len(data))
                return json.loads(data)

        envoyer({"id": 1, "method": "Runtime.evaluate",
                 "params": {"expression": SONDE.replace("%MIN_FONT%", str(MIN_FONT)).replace("%MIN_CONTRAST%", str(MIN_CONTRAST)), "returnByValue": True, "awaitPromise": False}})
        while True:
            msg = recevoir()
            if msg is None:
                print(json.dumps({"laws": {}, "error": "pas de reponse"}))
                return 1
            if msg.get("id") == 1:
                res = msg.get("result", {}).get("result", {})
                val = res.get("value")
                if val:
                    print(val)
                    return 0
                # diagnostic explicite plutot qu'un « vide » muet
                print(json.dumps({"laws": {}, "error": "evaluation vide",
                                  "detail": msg.get("result", {}).get("exceptionDetails", {}).get("text")
                                            or res.get("description") or str(res)[:200]}))
                return 1
    finally:
        # tuer tout le groupe : sinon les enfants Chrome survivent et gardent le port
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        except Exception:
            proc.terminate()


if __name__ == "__main__":
    sys.exit(main())
