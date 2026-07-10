// Banque d'ingrédients catégorisée — vraies vignettes Pexels dans /assets/ingredients/
export const CATEGORIES = [
  { id: "legumes", label: "Légumes", emoji: "🥕" },
  { id: "proteines", label: "Protéines", emoji: "🍗" },
  { id: "feculents", label: "Féculents", emoji: "🍞" },
  { id: "laitages", label: "Laitages", emoji: "🧀" },
  { id: "epices", label: "Épices & aromates", emoji: "🌿" },
];

export const INGREDIENTS = [
  // Légumes
  { id: "tomate", label: "Tomate", category: "legumes", image: "/assets/ingredients/tomate.jpg" },
  { id: "oignon", label: "Oignon", category: "legumes", image: "/assets/ingredients/oignon.jpg" },
  { id: "ail", label: "Ail", category: "legumes", image: "/assets/ingredients/ail.jpg" },
  { id: "carotte", label: "Carotte", category: "legumes", image: "/assets/ingredients/carotte.jpg" },
  { id: "poivron", label: "Poivron", category: "legumes", image: "/assets/ingredients/poivron.jpg" },
  { id: "courgette", label: "Courgette", category: "legumes", image: "/assets/ingredients/courgette.jpg" },
  { id: "champignon", label: "Champignon", category: "legumes", image: "/assets/ingredients/champignon.jpg" },
  { id: "pomme-de-terre", label: "Pomme de terre", category: "legumes", image: "/assets/ingredients/pomme-de-terre.jpg" },
  { id: "epinard", label: "Épinard", category: "legumes", image: "/assets/ingredients/epinard.jpg" },
  { id: "brocoli", label: "Brocoli", category: "legumes", image: "/assets/ingredients/brocoli.jpg" },
  { id: "citron", label: "Citron", category: "legumes", image: "/assets/ingredients/citron.jpg" },
  { id: "salade", label: "Salade verte", category: "legumes", image: "/assets/ingredients/salade.jpg" },

  // Protéines
  { id: "poulet", label: "Poulet", category: "proteines", image: "/assets/ingredients/poulet.jpg" },
  { id: "boeuf-hache", label: "Bœuf haché", category: "proteines", image: "/assets/ingredients/boeuf-hache.jpg" },
  { id: "oeuf", label: "Œuf", category: "proteines", image: "/assets/ingredients/oeuf.jpg" },
  { id: "saumon", label: "Saumon", category: "proteines", image: "/assets/ingredients/saumon.jpg" },
  { id: "crevette", label: "Crevette", category: "proteines", image: "/assets/ingredients/crevette.jpg" },
  { id: "thon", label: "Thon", category: "proteines", image: "/assets/ingredients/thon.jpg" },
  { id: "tofu", label: "Tofu", category: "proteines", image: "/assets/ingredients/tofu.jpg" },
  { id: "lardons", label: "Lardons", category: "proteines", image: "/assets/ingredients/lardons.jpg" },

  // Féculents
  { id: "riz", label: "Riz", category: "feculents", image: "/assets/ingredients/riz.jpg", gluten: false },
  { id: "pates", label: "Pâtes", category: "feculents", image: "/assets/ingredients/pates.jpg", gluten: true },
  { id: "pain", label: "Pain", category: "feculents", image: "/assets/ingredients/pain.jpg", gluten: true },
  { id: "farine", label: "Farine", category: "feculents", image: "/assets/ingredients/farine.jpg", gluten: true },
  { id: "quinoa", label: "Quinoa", category: "feculents", image: "/assets/ingredients/quinoa.jpg", gluten: false },
  { id: "semoule", label: "Semoule", category: "feculents", image: "/assets/ingredients/semoule.jpg", gluten: true },

  // Laitages
  { id: "lait", label: "Lait", category: "laitages", image: "/assets/ingredients/lait.jpg" },
  { id: "beurre", label: "Beurre", category: "laitages", image: "/assets/ingredients/beurre.jpg" },
  { id: "creme-fraiche", label: "Crème fraîche", category: "laitages", image: "/assets/ingredients/creme-fraiche.jpg" },
  { id: "fromage-rape", label: "Fromage râpé", category: "laitages", image: "/assets/ingredients/fromage-rape.jpg" },
  { id: "parmesan", label: "Parmesan", category: "laitages", image: "/assets/ingredients/parmesan.jpg" },
  { id: "mozzarella", label: "Mozzarella", category: "laitages", image: "/assets/ingredients/mozzarella.jpg" },

  // Épices & aromates
  { id: "sel", label: "Sel", category: "epices", image: "/assets/ingredients/sel.jpg" },
  { id: "poivre", label: "Poivre", category: "epices", image: "/assets/ingredients/poivre.jpg" },
  { id: "basilic", label: "Basilic", category: "epices", image: "/assets/ingredients/basilic.jpg" },
  { id: "persil", label: "Persil", category: "epices", image: "/assets/ingredients/persil.jpg" },
  { id: "cumin", label: "Cumin", category: "epices", image: "/assets/ingredients/cumin.jpg" },
  { id: "paprika", label: "Paprika", category: "epices", image: "/assets/ingredients/paprika.jpg" },
  { id: "curry", label: "Curry", category: "epices", image: "/assets/ingredients/curry.jpg" },
  { id: "thym", label: "Thym", category: "epices", image: "/assets/ingredients/thym.jpg" },
];

export const INGREDIENT_BY_ID = Object.fromEntries(INGREDIENTS.map((i) => [i.id, i]));

export function findIngredient(id) {
  return INGREDIENT_BY_ID[id];
}
