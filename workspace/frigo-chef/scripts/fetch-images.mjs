// Script de téléchargement d'images réelles via l'API Pexels.
// Usage : PEXELS_API_KEY=xxx node scripts/fetch-images.mjs
import fs from "node:fs";
import path from "node:path";

const API_KEY = process.env.PEXELS_API_KEY;
if (!API_KEY) {
  console.error("PEXELS_API_KEY manquant");
  process.exit(1);
}

const OUT_ROOT = path.resolve("public/assets");

// { file: "ingredients/tomate.jpg", query: "fresh tomato close up" }
const items = [
  // ── Légumes ──
  { file: "ingredients/tomate.jpg", query: "fresh red tomato close up" },
  { file: "ingredients/oignon.jpg", query: "yellow onion close up" },
  { file: "ingredients/ail.jpg", query: "garlic bulb close up" },
  { file: "ingredients/carotte.jpg", query: "fresh carrots close up" },
  { file: "ingredients/poivron.jpg", query: "red bell pepper close up" },
  { file: "ingredients/courgette.jpg", query: "fresh zucchini close up" },
  { file: "ingredients/champignon.jpg", query: "fresh mushrooms close up" },
  { file: "ingredients/pomme-de-terre.jpg", query: "fresh potatoes close up" },
  { file: "ingredients/epinard.jpg", query: "fresh spinach leaves close up" },
  { file: "ingredients/brocoli.jpg", query: "fresh broccoli close up" },
  { file: "ingredients/citron.jpg", query: "fresh lemon close up" },
  { file: "ingredients/salade.jpg", query: "fresh lettuce leaves close up" },

  // ── Protéines ──
  { file: "ingredients/poulet.jpg", query: "raw chicken breast close up" },
  { file: "ingredients/boeuf-hache.jpg", query: "ground beef raw close up" },
  { file: "ingredients/oeuf.jpg", query: "fresh eggs close up" },
  { file: "ingredients/saumon.jpg", query: "raw salmon fillet close up" },
  { file: "ingredients/crevette.jpg", query: "fresh shrimp close up" },
  { file: "ingredients/thon.jpg", query: "canned tuna close up" },
  { file: "ingredients/tofu.jpg", query: "tofu cubes close up" },
  { file: "ingredients/lardons.jpg", query: "bacon lardons close up" },

  // ── Féculents ──
  { file: "ingredients/riz.jpg", query: "white rice grain close up" },
  { file: "ingredients/pates.jpg", query: "dried pasta close up" },
  { file: "ingredients/pain.jpg", query: "fresh bread loaf close up" },
  { file: "ingredients/farine.jpg", query: "wheat flour close up" },
  { file: "ingredients/quinoa.jpg", query: "quinoa grain close up" },
  { file: "ingredients/semoule.jpg", query: "couscous semolina close up" },

  // ── Laitages ──
  { file: "ingredients/lait.jpg", query: "milk glass pouring close up" },
  { file: "ingredients/beurre.jpg", query: "butter block close up" },
  { file: "ingredients/creme-fraiche.jpg", query: "fresh cream bowl close up" },
  { file: "ingredients/fromage-rape.jpg", query: "grated cheese close up" },
  { file: "ingredients/parmesan.jpg", query: "parmesan cheese wedge close up" },
  { file: "ingredients/mozzarella.jpg", query: "mozzarella cheese ball close up" },

  // ── Épices & aromates ──
  { file: "ingredients/sel.jpg", query: "sea salt close up" },
  { file: "ingredients/poivre.jpg", query: "black pepper close up" },
  { file: "ingredients/basilic.jpg", query: "fresh basil leaves close up" },
  { file: "ingredients/persil.jpg", query: "fresh parsley close up" },
  { file: "ingredients/cumin.jpg", query: "cumin spice close up" },
  { file: "ingredients/paprika.jpg", query: "paprika spice powder close up" },
  { file: "ingredients/curry.jpg", query: "curry powder spice close up" },
  { file: "ingredients/thym.jpg", query: "fresh thyme herb close up" },

  // ── Photos de plats (types réutilisés par tag dans les recettes) ──
  { file: "dishes/salade.jpg", query: "fresh garden salad bowl overhead" },
  { file: "dishes/pates.jpg", query: "italian pasta dish plate" },
  { file: "dishes/riz.jpg", query: "rice bowl dish plate" },
  { file: "dishes/viande-grillee.jpg", query: "grilled meat plate close up" },
  { file: "dishes/poisson-grille.jpg", query: "grilled salmon plate" },
  { file: "dishes/saute.jpg", query: "vegetable stir fry pan" },
  { file: "dishes/sandwich.jpg", query: "gourmet sandwich plate" },
  { file: "dishes/omelette.jpg", query: "omelette plate breakfast" },
  { file: "dishes/curry.jpg", query: "curry dish bowl" },
  { file: "dishes/roti.jpg", query: "roast chicken plate" },
  { file: "dishes/soupe.jpg", query: "vegetable soup bowl" },
  { file: "dishes/tacos.jpg", query: "tacos plate mexican food" },
  { file: "dishes/pizza.jpg", query: "homemade pizza close up" },
  { file: "dishes/bowl.jpg", query: "healthy grain bowl overhead" },
  { file: "dishes/gratin.jpg", query: "cheese gratin dish oven" },
  { file: "dishes/soupe-froide.jpg", query: "gazpacho soup bowl" },
  { file: "dishes/quiche.jpg", query: "quiche slice plate" },
  { file: "dishes/dessert.jpg", query: "fruit dessert plate" },

  // ── Hero / onboarding ──
  { file: "hero/frigo-ouvert.jpg", query: "open refrigerator fresh vegetables" },
  { file: "hero/table-cuisine.jpg", query: "warm kitchen table cooking ingredients" },
  { file: "hero/mains-cuisine.jpg", query: "hands chopping vegetables kitchen" },
  { file: "hero/plat-final.jpg", query: "appetizing home cooked meal table" },
];

async function searchPexels(query) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=square`;
  const res = await fetch(url, { headers: { Authorization: API_KEY } });
  if (!res.ok) throw new Error(`Pexels ${res.status} pour "${query}"`);
  const data = await res.json();
  const photo = data.photos?.[0];
  if (!photo) throw new Error(`Aucun résultat pour "${query}"`);
  return photo.src.large;
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Téléchargement échoué ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
}

async function main() {
  let ok = 0;
  let fail = 0;
  for (const item of items) {
    const dest = path.join(OUT_ROOT, item.file);
    if (fs.existsSync(dest)) {
      console.log(`skip (déjà présent) ${item.file}`);
      ok++;
      continue;
    }
    try {
      const imgUrl = await searchPexels(item.query);
      await download(imgUrl, dest);
      console.log(`OK  ${item.file}  <-  "${item.query}"`);
      ok++;
    } catch (e) {
      console.error(`FAIL ${item.file} : ${e.message}`);
      fail++;
    }
    // léger throttle pour rester sous la limite de rate Pexels
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log(`\nTerminé : ${ok} OK, ${fail} échecs sur ${items.length}`);
  if (fail > 0) process.exit(1);
}

main();
