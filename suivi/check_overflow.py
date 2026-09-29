"""Loi visuelle : une carte coupe-t-elle son contenu ? (scrollHeight > clientHeight = troncature reelle)"""
import base64, json, os, socket, struct, subprocess, sys, time

CHROME = "/usr/bin/google-chrome"
URL = "file:///home/raf/projets/mangoai/suivi/suivi.html"
PORT = 9441
SEL = sys.argv[1] if len(sys.argv) > 1 else '#chantiers-cartes .carte'


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
    ln = h[1] & 0x7F
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
    sock.sendall(head + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))


subprocess.run(["pkill", "-f", f"remote-debugging-port={PORT}"], capture_output=True)
proc = subprocess.Popen(
    [CHROME, "--headless=new", f"--remote-debugging-port={PORT}",
     "--user-data-dir=/home/raf/.hermes/cache/scratch/chrome-ovf",
     "--no-first-run", "--no-default-browser-check", "--hide-scrollbars",
     "--window-size=1280,1000", "about:blank"],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(80):
        try:
            socket.create_connection(("127.0.0.1", PORT), 1).close(); break
        except OSError:
            time.sleep(0.25)
    import urllib.request
    cibles = json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json"))
    tid = [t for t in cibles if t["type"] == "page"][0]["id"]
    s = socket.create_connection(("127.0.0.1", PORT), 5)
    key = base64.b64encode(os.urandom(16)).decode()
    s.sendall((f"GET /devtools/page/{tid} HTTP/1.1\r\nHost: 127.0.0.1:{PORT}\r\n"
               f"Upgrade: websocket\r\nConnection: Upgrade\r\n"
               f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
    buf = b""
    while b"\r\n\r\n" not in buf:
        buf += s.recv(4096)
    ws_send(s, {"id": 1, "method": "Page.enable"})
    ws_send(s, {"id": 2, "method": "Page.navigate", "params": {"url": URL}})
    time.sleep(3.0)
    expr = ("(()=>{const out=[];"
            "document.querySelectorAll(%s).forEach((e,i)=>{"
            "const cs=getComputedStyle(e);"
            "out.push({i,id:e.id||'',"
            "h:Math.round(e.clientHeight),sh:Math.round(e.scrollHeight),"
            "overflowY:cs.overflowY,overflow:cs.overflow,"
            "deborde:e.scrollHeight>e.clientHeight+1,"
            "haut:Math.round(e.getBoundingClientRect().top+window.scrollY),"
            "bas:Math.round(e.getBoundingClientRect().bottom+window.scrollY)});});"
            "return JSON.stringify(out)})()") % json.dumps(SEL)
    ws_send(s, {"id": 3, "method": "Runtime.evaluate",
                "params": {"expression": expr, "returnByValue": True}})
    for _ in range(50):
        m = ws_recv(s)
        if m.get("id") == 3:
            v = m["result"]["result"].get("value")
            if v == "[]":
                print("AUCUN element pour", SEL)
            for c in json.loads(v):
                etat = "DEBORDE (troncature reelle)" if c["deborde"] else "ok"
                print(f"  carte {c['i']} [{c['id']}] h={c['h']} scrollH={c['sh']} "
                      f"overflow={c['overflowY']}/{c['overflow']} y={c['haut']}->{c['bas']} {etat}")
            break
finally:
    proc.terminate()
    subprocess.run(["pkill", "-f", f"remote-debugging-port={PORT}"], capture_output=True)
