// ── ABYSS : Données des zones de profondeur et créatures abyssales ───────────

export const ZONES = [
  {
    id: "epipelagic",
    name: "Zone Épipélagique",
    subtitle: "La zone ensoleillée",
    depthMin: 0,
    depthMax: 200,
    temperature: "12 à 25°C",
    pressure: "1 à 20 atm",
    luminosity: "100 % — lumière directe du soleil",
    color: "#0a4a7a",
    description:
      "La couche superficielle de l'océan, baignée de lumière. C'est ici que la photosynthèse est possible, soutenant l'essentiel de la vie marine. La chaleur du soleil réchauffe les eaux et les courants y sont les plus forts.",
    image:
      "https://images.pexels.com/photos/7502481/pexels-photo-7502481.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  },
  {
    id: "mesopelagic",
    name: "Zone Mésopélagique",
    subtitle: "La zone crépusculaire",
    depthMin: 200,
    depthMax: 1000,
    temperature: "5 à 12°C",
    pressure: "20 à 100 atm",
    luminosity: "1 % — pénombre bleutée",
    color: "#062a4a",
    description:
      "La lumière s'efface progressivement. Beaucoup d'espèces migrent verticalement chaque jour entre cette zone et la surface pour se nourrir. C'est le royaume de la bioluminescence naissante.",
    image:
      "https://images.pexels.com/photos/2017089/pexels-photo-2017089.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  },
  {
    id: "bathyal",
    name: "Zone Bathyale",
    subtitle: "La zone de minuit",
    depthMin: 1000,
    depthMax: 4000,
    temperature: "2 à 5°C",
    pressure: "100 à 400 atm",
    luminosity: "0 % — obscurité totale",
    color: "#031528",
    description:
      "L'obscurité est complète. La pression écrasante. Les créatures ici dépendent de la matière organique qui descend de la surface — la « neige marine » — ou de la bioluminescence pour chasser et communiquer.",
    image:
      "https://images.pexels.com/photos/17795203/pexels-photo-17795203.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  },
  {
    id: "abyssal",
    name: "Zone Abyssale",
    subtitle: "Les grands fonds",
    depthMin: 4000,
    depthMax: 6000,
    temperature: "1 à 2°C",
    pressure: "400 à 600 atm",
    luminosity: "0 % — noir absolu",
    color: "#010812",
    description:
      "Un monde glacé et pressurisé au-delà de l'imaginable. Les plaines abyssales couvrent la majorité du fond océanique. La vie y est rare, étrange, et adaptée à des conditions extrêmes. Sources hydrothermales et oasis chimiques.",
    image:
      "https://images.pexels.com/photos/656/sea-water-ocean-dark.jpg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  },
  {
    id: "hadal",
    name: "Zone Hadale",
    subtitle: "Les tranchées ultimes",
    depthMin: 6000,
    depthMax: 11000,
    temperature: "1 à 4°C",
    pressure: "600 à 1100 atm",
    luminosity: "0 % — néant lumineux",
    color: "#000206",
    description:
      "Les fosses les plus profondes de la planète, dont la fosse des Mariannes (10 994 m). La pression y est mille fois supérieure à celle de la surface. Moins d'êtres humains sont allés ici que sur la Lune.",
    image:
      "https://images.pexels.com/photos/15865792/pexels-photo-15865792.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  },
];

export const CREATURES = [
  {
    id: "comb-jelly",
    name: "Méduse peigne",
    latin: "Ctenophora",
    zone: "epipelagic",
    zoneLabel: "Épipélagique",
    depth: 50,
    depthLabel: "0 – 200 m",
    size: "10 cm",
    bioluminescence: true,
    image:
      "https://images.pexels.com/photos/28905124/pexels-photo-28905124.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    description:
      "Les cténophores produisent des arcs-en-ciel scintillants le long de leurs rangées de cils, tout en émettant une lumière bleu-vert dans le noir. Elles sont parmi les organismes bioluminescents les plus anciens.",
    facts: [
      "Pas de cerveau, mais un réseau nerveux diffus",
      "99 % de son corps est constitué d'eau",
      "Émet des flashes lumineux pour effrayer les prédateurs",
    ],
  },
  {
    id: "green-sea-turtle",
    name: "Tortue verte",
    latin: "Chelonia mydas",
    zone: "epipelagic",
    zoneLabel: "Épipélagique",
    depth: 20,
    depthLabel: "0 – 50 m",
    size: "1,5 m",
    bioluminescence: false,
    image:
      "https://images.pexels.com/photos/68744/loggerhead-turtle-sea-ocean-water-68744.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    description:
      "Reptile marin migrateur parcourant des milliers de kilomètres entre ses zones de nourrissage et ses plages de ponte. Sa carapace lisse et ses nageoires puissantes en font une nageuse infatigable.",
    facts: [
      "Peut rester sous l'eau plus de 5 heures",
      "Vie moyenne de 60 à 80 ans",
      "Navigateuse utilisant le champ magnétique terrestre",
    ],
  },
  {
    id: "common-dolphin",
    name: "Dauphin commun",
    latin: "Delphinus delphis",
    zone: "epipelagic",
    zoneLabel: "Épipélagique",
    depth: 100,
    depthLabel: "0 – 200 m",
    size: "2,5 m",
    bioluminescence: false,
    image:
      "https://images.pexels.com/photos/27768664/pexels-photo-27768664.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    description:
      "Mammifère marin extrêmement social et intelligent. Vit en groupes pouvant compter des centaines d'individus. Utilise l'écholocation pour chasser et communiquer dans les eaux de surface.",
    facts: [
      "Écholocation comparable à celle des chauves-souris",
      "Dors en moitié de cerveau à la fois",
      "Peut plonger jusqu'à 300 m en apnée",
    ],
  },
  {
    id: "blue-shark",
    name: "Requin bleu",
    latin: "Prionace glauca",
    zone: "epipelagic",
    zoneLabel: "Épipélagique",
    depth: 350,
    depthLabel: "0 – 400 m",
    size: "3,8 m",
    bioluminescence: false,
    image:
      "https://images.pexels.com/photos/26736702/pexels-photo-26736702.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    description:
      "Prédateur pélagique élancé au dos bleu-nuit, capable de migrations transocéaniques. Il descend parfois dans la zone mésopélagique pour chasser calmars et poissons-lanternes.",
    facts: [
      "Migrations de plus de 9 000 km documentées",
      "Coloration contre-illumination : dos sombre, ventre clair",
      "L'un des requins les plus pêchés au monde",
    ],
  },
  {
    id: "manta-ray",
    name: "Raie manta",
    latin: "Mobula birostris",
    zone: "epipelagic",
    zoneLabel: "Épipélagique",
    depth: 200,
    depthLabel: "0 – 200 m",
    size: "7 m (envergure)",
    bioluminescence: false,
    image:
      "https://images.pexels.com/photos/5167615/pexels-photo-5167615.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    description:
      "Géant planctonique au vol sous-marin majestueux. La plus grande raie de l'océan filtre l'eau avec ses branchies pour capturer le plancton. Son cerveau est proportionnellement le plus grand des poissons.",
    facts: [
      "Envergure pouvant atteindre 9 m",
      "Reconnaît son reflet dans un miroir (conscience de soi)",
      "Voyage seule ou en groupes de dizaines",
    ],
  },
  {
    id: "seahorse",
    name: "Hippocampe",
    latin: "Hippocampus",
    zone: "epipelagic",
    zoneLabel: "Épipélagique",
    depth: 15,
    depthLabel: "1 – 20 m",
    size: "15 cm",
    bioluminescence: false,
    image:
      "https://images.pexels.com/photos/9004364/pexels-photo-9004364.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    description:
      "Petit poisson côtier aux mœurs singulières. Le mâle porte les œufs dans une poche incubatrice. Sa nage dorsale rapide (jusqu'à 70 battements/s) compense un corps peu hydrodynamique.",
    facts: [
      "Le mâle porte et met bas les petits",
      "Chasse par aspiration ultra-rapide",
      "Chaque œil bouge indépendamment",
    ],
  },
  {
    id: "lions-mane-jellyfish",
    name: "Méduse à crinière de lion",
    latin: "Cyanea capillata",
    zone: "mesopelagic",
    zoneLabel: "Mésopélagique",
    depth: 600,
    depthLabel: "200 – 1000 m",
    size: "2,5 m (tentacules 30 m)",
    bioluminescence: true,
    image:
      "https://images.pexels.com/photos/17188077/pexels-photo-17188077.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    description:
      "L'une des plus grandes méduses du monde, avec des tentacules pouvant dépasser 30 m. Elle dérive entre deux eaux et émet des flashes bioluminescents pour se défendre.",
    facts: [
      "Tentacules pouvant atteindre 37 m",
      "Piqûre douloureuse mais rarement mortelle",
      "Vie d'environ 12 mois",
    ],
  },
  {
    id: "lanternfish",
    name: "Poisson-lanterne",
    latin: "Myctophidae",
    zone: "mesopelagic",
    zoneLabel: "Mésopélagique",
    depth: 500,
    depthLabel: "200 – 1000 m",
    size: "30 cm",
    bioluminescence: true,
    image:
      "https://images.pexels.com/photos/24185320/pexels-photo-24185320.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    description:
      "Poisson mésopélagique doté de photophores — organes producteurs de lumière — alignés le long de son ventre. Effectue la plus grande migration animale quotidienne de la planète en remontant la nuit vers la surface.",
    facts: [
      "Migration verticale quotidienne de 400 m",
      "Photophores contrôlés individuellement",
      "Biomasse océanique la plus abondante (milliards de tonnes)",
    ],
  },
  {
    id: "giant-squid",
    name: "Calmar géant",
    latin: "Architeuthis dux",
    zone: "bathyal",
    zoneLabel: "Bathyale",
    depth: 800,
    depthLabel: "300 – 1000 m",
    size: "13 m",
    bioluminescence: true,
    image:
      "https://images.pexels.com/photos/15559902/pexels-photo-15559902.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    description:
      "Le plus grand invertébré connu. Ses yeux, de la taille d'un ballon de plage, sont les plus grands du règne animal. Il vit dans les profondeurs et n'a été filmé vivant dans son habitat naturel qu'en 2012.",
    facts: [
      "Yeux de 27 cm de diamètre",
      "Combats documentés avec les cachalots",
      "Longévité estimée à 3 à 5 ans",
    ],
  },
  {
    id: "moray-eel",
    name: "Murène géante",
    latin: "Gymnothorax javanicus",
    zone: "bathyal",
    zoneLabel: "Bathyale",
    depth: 500,
    depthLabel: "200 – 1000 m",
    size: "3 m",
    bioluminescence: false,
    image:
      "https://images.pexels.com/photos/13085964/pexels-photo-13085964.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    description:
      "Anguille prédatrice aux mâchoires puissantes. Se cache dans les anfractuosités des récifs et épaves, surgissant pour saisir ses proies. Sa deuxième mâchoire (pharyngienne) avance pour tirer la nourriture.",
    facts: [
      "Deuxième mâchoire interne (pharyngienne)",
      "Peut rester immobile des heures en embuscade",
      "Mucus toxique sur la peau",
    ],
  },
  {
    id: "anglerfish",
    name: "Poisson-pêcheur abyssal",
    latin: "Melanocetus",
    zone: "abyssal",
    zoneLabel: "Abyssale",
    depth: 2000,
    depthLabel: "1000 – 4000 m",
    size: "1,2 m",
    bioluminescence: true,
    image:
      "https://images.pexels.com/photos/15865792/pexels-photo-15865792.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    description:
      "Emblème des abysses. La femelle porte un leurre lumineux (illicium) sur la tête, alimenté par des bactéries bioluminescentes symbiotiques. Le mâle, minuscule, fusionne avec la femelle pour devenir un appendice reproducteur.",
    facts: [
      "Leurre lumineux par symbiose bactérienne",
      "Le mâle se fusionne à la femelle (parasitisme sexuel)",
      "Mâchoire capable d'avaler des proies de sa taille",
    ],
  },
  {
    id: "viperfish",
    name: "Poislet-vipère",
    latin: "Chauliodus",
    zone: "bathyal",
    zoneLabel: "Bathyale",
    depth: 2500,
    depthLabel: "1000 – 4000 m",
    size: "60 cm",
    bioluminescence: true,
    image:
      "https://images.pexels.com/photos/8065517/pexels-photo-8065517.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    description:
      "Prédateur des profondeurs aux crocs disproportionnés, si longs qu'ils dépassent de sa mâchoire fermée. Utilise des photophores ventraux pour se camoufler par contre-illumination contre la faible lumière d'en haut.",
    facts: [
      "Dents si longues qu'elles ne tiennent pas dans la gueule",
      "Crâne articulé pour avaler de grosses proies",
      "Photophores sur le ventre pour contre-illumination",
    ],
  },
  {
    id: "dumbo-octopus",
    name: "Pieuvre Dumbo",
    latin: "Grimpoteuthis",
    zone: "abyssal",
    zoneLabel: "Abyssale",
    depth: 5000,
    depthLabel: "3000 – 7000 m",
    size: "30 cm",
    bioluminescence: false,
    image:
      "https://images.pexels.com/photos/4812195/pexels-photo-4812195.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    description:
      "Octopode des grandes profondeurs, nommé d'après ses nageoires en forme d'oreilles d'éléphant. Vit à des profondeurs record pour un octopode. Nage lentement en battant ses nageoires, sans encre ni chromatophores.",
    facts: [
      "Profondeur record : 7 000 m pour un octopode",
      "Pas d'encre (inutile dans le noir)",
      "Avale ses proies entières",
    ],
  },
  {
    id: "humpback-whale",
    name: "Baleine à bosse",
    latin: "Megaptera novaeangliae",
    zone: "epipelagic",
    zoneLabel: "Épipélagique",
    depth: 200,
    depthLabel: "0 – 200 m",
    size: "16 m",
    bioluminescence: false,
    image:
      "https://images.pexels.com/photos/4696771/pexels-photo-4696771.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    description:
      "Mysticète migrateur parcourant les océans du monde. Ses chants complexes peuvent voyager sur des centaines de kilomètres sous l'eau. Plonge parfois profondément pour se nourrir de krill.",
    facts: [
      "Chants pouvant durer 20 minutes",
      "Migrations de 25 000 km par an",
      "Poids de 30 à 40 tonnes",
    ],
  },
];

export const QUIZ_QUESTIONS = [
  {
    question: "À quelle profondeur commence la zone abyssale ?",
    options: ["1 000 m", "4 000 m", "6 000 m", "10 000 m"],
    correct: 1,
    explanation: "La zone abyssale s'étend de 4 000 à 6 000 m de profondeur.",
  },
  {
    question: "Quel organe lumineux le poisson-pêcheur abyssal utilise-t-il pour attirer ses proies ?",
    options: ["Photophores ventraux", "Illicium (leurre)", "Chromatophores", "Nageoires lumineuses"],
    correct: 1,
    explanation: "L'illicium est un rayon modifié sur la tête, terminé par un leurre bioluminescent alimenté par des bactéries symbiotiques.",
  },
  {
    question: "Quelle créature effectue la plus grande migration verticale quotidienne de la planète ?",
    options: ["Le calmar géant", "La baleine à bosse", "Le poisson-lanterne", "La pieuvre Dumbo"],
    correct: 2,
    explanation: "Le poisson-lanterne remonte chaque nuit de centaines de mètres vers la surface pour se nourrir, puis redescend le jour.",
  },
  {
    question: "Quelle est la profondeur maximale de la fosse des Mariannes ?",
    options: ["6 000 m", "8 000 m", "10 994 m", "15 000 m"],
    correct: 2,
    explanation: "La fosse des Mariannes atteint 10 994 m dans la dépression Challenger, le point le plus profond connu des océans.",
  },
  {
    question: "Quel animal possède les plus grands yeux du règne animal ?",
    options: ["La baleine bleue", "Le calmar géant", "Le requin bleu", "L'anguille murène"],
    correct: 1,
    explanation: "Le calmar géant a des yeux de 27 cm de diamètre, les plus grands du règne animal, pour capter le maximum de lumière dans les profondeurs.",
  },
];