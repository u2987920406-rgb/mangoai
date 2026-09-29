#!/usr/bin/env bash
# Régénère le tracker de suivi et produit les captures de contrôle.
# Usage: bash /home/raf/projets/mangoai/suivi/capture.sh
# Sortie: /home/raf/.hermes/cache/scratch/suivi-desk.png (desktop 1280)
#         /home/raf/.hermes/cache/scratch/suivi-mobile.png (Pixel 412)
#         /home/raf/.hermes/cache/scratch/suivi-planche.png (planche à envoyer)
set -eu
M=/home/raf/projets/mangoai
S=/home/raf/.hermes/cache/scratch

echo "### 1. régénération depuis plan.json"
cd "$M" && node suivi/build-suivi.mjs

echo "### 2. mesures DOM (lois du gate visuel)"
for W in 1280 1140 412; do
  printf 'W=%s ' "$W"
  python3 "$M/suivi/cdp_measure.py" "$M/suivi/suivi.html" --width "$W" --height 2400 2>&1 | tail -1 \
    | python3 -c "import json,sys; d=json.load(sys.stdin); L=d['laws']; print({k:v['pass'] for k,v in L.items()}); [print('   FAIL',k,[o.get('text') or o.get('cls') for o in v['offenders']][:3]) for k,v in L.items() if not v['pass']]"
done

echo "### 3. captures"
for spec in "desk 1280 1500" "mobile 412 2400" "paysage 1140 512"; do
  set -- $spec
  timeout 90 google-chrome --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
    --user-data-dir="/tmp/chrome-suivi-$1" --virtual-time-budget=6000 \
    --window-size="$2,$3" --screenshot="$S/suivi-$1.png" \
    "file://$M/suivi/suivi.html" >/dev/null 2>&1
done

echo "### 4. preuve pixel (couleur réelle de chaque pastille vs son état déclaré)"
python3 "$M/suivi/sample-pixels.py" "$M/suivi/suivi.html" --width 1280 --out "$S/suivi-preuve.png" 2>&1 | tail -8

echo "### 5. planche"
python3 - <<PYEOF
from PIL import Image
S = "$S"
d = Image.open(f"{S}/suivi-desk.png")
m = Image.open(f"{S}/suivi-mobile.png")
p = Image.open(f"{S}/suivi-paysage.png")
W = max(d.width, m.width + p.width + 20)
h2 = max(m.height, p.height)
sheet = Image.new("RGB", (W, d.height + h2 + 40), "white")
sheet.paste(d, (0, 0))
sheet.paste(p, (0, d.height + 20))
sheet.paste(m, (p.width + 20, d.height + 20))
sheet.save(f"{S}/suivi-planche.png")
print("planche:", sheet.size)
PYEOF

echo "### FIN — planche: $S/suivi-planche.png"
