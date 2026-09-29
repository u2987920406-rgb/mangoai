"""Capture pleine page du tracker via CDP (mesure d'abord la hauteur REELLE du document)."""
import json, os, socket, struct, subprocess, sys, time, base64

CHROME = "/usr/bin/google-chrome"
URL = "file:///home/raf/projets/mangoai/suivi/suivi.html"
OUT = sys.argv[1] if len(sys.argv) > 1 else "/home/raf/.hermes/cache/scratch/suivi-full.png"
WIDTH = 1280


def port_libre() -> int:
    subprocess.run(["pkill", "-f", "remote-debugging-port=9422"], capture_output=True)
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


def wait(port, timeout=30):
    end = time.time() + timeout
    while time.time() < end:
        try:
            s = socket.create_connection(("127.0.0.1", port), 1)
            s.close()
            return True
        except OSError:
            time.sleep(0.25)
    return False


def ws_recv(sock):
    def rd(n):
        buf = b""
        while len(buf) < n:
            c = sock.recv(n - len(buf))
            if not c:
                raise ConnectionError("fermé")
            buf += c
        return buf
    h = rd(2)
    b1, b2 = h[0], h[1]
    ln = b2 & 0x7F
    if ln == 126:
        ln = struct.unpack(">H", rd(2))[0]
    elif ln == 127:
        ln = struct.unpack(">Q", rd(8))[0]
    return json.loads(rd(ln).decode())


def ws_send(sock, obj):
    data = json.dumps(obj).encode()
    n = len(data)
    head = bytes([0x81])
    if n < 126:
        head += bytes([0x80 | n])
    elif n < 65536:
        head += bytes([0x80 | 126]) + struct.pack(">H", n)
    else:
        head += bytes([0x80 | 127]) + struct.pack(">Q", n)
    mask = os.urandom(4)
    masked = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
    sock.sendall(head + mask + masked)


def main():
    port = port_libre()
    proc = subprocess.Popen(
        [CHROME, "--headless=new", f"--remote-debugging-port={port}",
         "--user-data-dir=/home/raf/.hermes/cache/scratch/chrome-fullpage",
         "--no-first-run", "--no-default-browser-check", "--hide-scrollbars",
         f"--window-size={WIDTH},1000", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        if not wait(port):
            raise SystemExit("chrome n'a pas ouvert le port")
        import urllib.request
        cibles = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json"))
        tid = [t for t in cibles if t["type"] == "page"][0]["id"]
        s = socket.create_connection(("127.0.0.1", port), 5)
        key = base64.b64encode(os.urandom(16)).decode()
        s.sendall((f"GET /devtools/page/{tid} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n"
                   f"Upgrade: websocket\r\nConnection: Upgrade\r\n"
                   f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            buf += s.recv(4096)
        ws_send(s, {"id": 1, "method": "Page.enable"})
        ws_send(s, {"id": 2, "method": "Page.navigate", "params": {"url": URL}})
        time.sleep(3.0)
        # hauteur REELLE + controle de debordement horizontal
        ws_send(s, {"id": 3, "method": "Runtime.evaluate", "params": {
            "expression": "JSON.stringify({h: Math.ceil(document.documentElement.scrollHeight), w: document.documentElement.scrollWidth, vw: window.innerWidth})",
            "returnByValue": True}})
        mesure = None
        for _ in range(40):
            m = ws_recv(s)
            if m.get("id") == 3:
                mesure = json.loads(m["result"]["result"]["value"])
                break
        print("mesure:", mesure)
        assert mesure, "pas de mesure"
        assert mesure["w"] <= mesure["vw"] + 1, f"debordement horizontal {mesure['w']} > {mesure['vw']}"
        ws_send(s, {"id": 4, "method": "Emulation.setDeviceMetricsOverride", "params": {
            "width": WIDTH, "height": mesure["h"], "deviceScaleFactor": 1, "mobile": False}})
        time.sleep(0.5)
        ws_send(s, {"id": 5, "method": "Page.captureScreenshot", "params": {
            "format": "png", "captureBeyondViewport": True,
            "clip": {"x": 0, "y": 0, "width": WIDTH, "height": mesure["h"], "scale": 1}}})
        for _ in range(60):
            m = ws_recv(s)
            if m.get("id") == 5:
                open(OUT, "wb").write(base64.b64decode(m["result"]["data"]))
                from PIL import Image
                im = Image.open(OUT)
                print(f"capture: {OUT} {im.size}")
                return
        raise SystemExit("pas de screenshot")
    finally:
        proc.terminate()
        subprocess.run(["pkill", "-f", f"remote-debugging-port={port}"], capture_output=True)


main()
