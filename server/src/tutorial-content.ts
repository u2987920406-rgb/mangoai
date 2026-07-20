// Contenu des 10 tutoriels — extrait de tutorial.ts (#190 tâche #6, découpage
// fichiers massifs : tutorial.ts était à 949 lignes, dont l'essentiel était ce
// contenu déclaratif). tutorial.ts garde la LOGIQUE (persistance, routes) et
// importe/réexporte ces types + `TUTORIALS` pour rester compatible avec les
// quelques fichiers qui l'importaient déjà.
// Tutos 1 & 2 entièrement définis (Chantier A). Tutos 3-10 = méta seulement
// (steps remplies au Chantier D). Le contenu reprend les tables de
// TUTORIAL-PLAN.md.

export type TutorialAction = "observe" | "click" | "type" | "send";

export interface TutorialStep {
  id: string;
  title: string;
  narration: string; // ce que MangoOS dit à cette étape
  target?: string; // clé data-tour du spotlight (Chantier B)
  // Écran à afficher pour cette étape quand la feature vit dans un panneau
  // plein écran sans cible data-tour (notes, metrics, superagent, multi…). Prime
  // sur le contexte dérivé de `target`. (Chantier "auto-contexte étendu".)
  context?: string;
  action: TutorialAction;
  prefilledPrompt?: string; // prompt pré-écrit proposé au composer
  freedomLevel: number; // 0-100, hérité du tuto sauf override
  checkpoint?: boolean; // → mini-review Haiku (Chantier C)
}

export interface TutorialDefinition {
  id: number;
  title: string;
  mode?: "mvp" | "elite" | "finition";
  freedomLevel: number; // 0-100 : niveau de liberté de l'UI pendant ce tuto
  durationLabel: string; // estimatif, jamais une minuterie
  steps: TutorialStep[];
}

function step(
  id: string,
  title: string,
  narration: string,
  action: TutorialAction,
  freedomLevel: number,
  extra: Partial<TutorialStep> = {},
): TutorialStep {
  return { id, title, narration, action, freedomLevel, ...extra };
}

const TUTORIAL_1: TutorialStep[] = [
  step("t1-welcome", "Bienvenue", "Bienvenue dans MangoOS 🥭 — ton atelier qui construit des apps web à partir d'une simple description. Ce premier tutoriel te fait visiter l'interface. Aucune pression : avance à ton rythme.", "observe", 0, { target: "hero" }),
  step("t1-prompt-card", "La carte de création", "Ici tu décris ton idée en français. MangoOS la transforme en application React qui s'affiche en direct. C'est le point de départ de tout projet.", "observe", 0, { target: "prompt-card" }),
  step("t1-write-idea", "Écris une idée", "Essaie : clique dans la zone de texte et écris une idée d'app, même vague. Tu n'as encore rien à lancer — on découvre l'interface.", "type", 0, { target: "prompt-card" }),
  step("t1-templates", "Les modèles de départ", "Ces boutons (Vitrine, E-commerce, Dashboard…) pré-orientent la structure. Optionnel : MangoOS sait aussi partir d'une page blanche.", "observe", 0, { target: "templates" }),
  step("t1-header", "Le bandeau de l'atelier", "Une fois un projet ouvert, ce bandeau contient l'essentiel : projet courant, mode, modèle, versions, publication. On le détaille juste après.", "observe", 0, { target: "header" }),
  step("t1-modes", "Mode MVP / Élite / Finition", "Trois régimes : ⚡ MVP (rapide, économe), 💎 Élite (cadrage + tout l'arsenal), 🛡️ Finition (durcissement après 80%). Tu choisis selon l'ambition du moment.", "observe", 0, { target: "mode" }),
  step("t1-model", "Le choix du cerveau", "Tu peux changer le moteur : Haiku (rapide), Sonnet (équilibré), Opus (qualité max), ou l'Élève local ($0). Chaque tâche son cerveau.", "observe", 0, { target: "model" }),
  step("t1-preview", "L'aperçu live", "À droite, ton app tourne pour de vrai et se recharge à chaque modification. C'est ton retour visuel immédiat.", "observe", 0, { target: "preview" }),
  step("t1-memory", "La mémoire", "MangoOS retient ton style, ton vocabulaire et tes préférences entre les projets. Ce panneau montre ce qu'il a appris de toi.", "observe", 0, { target: "memory" }),
  step("t1-versions", "Les versions & le rollback", "Chaque tour est versionné. Tu peux comparer et revenir en arrière en un clic — itère sans peur de casser.", "observe", 0, { target: "versions" }),
  step("t1-snap", "La barre d'aperçu", "En haut de l'aperçu : bascule desktop/mobile, recharge, et ouvre l'app dans un onglet. De quoi vérifier ton rendu sur tous les écrans.", "observe", 0, { target: "preview" }),
  step("t1-inspect", "Le clic → source", "En mode inspection (la cible ⌖ en haut de l'aperçu), cliquer un élément arme une édition chirurgicale du bon fichier:ligne. Du pixel au code, directement.", "observe", 0, { target: "inspect" }),
  step("t1-iterate", "Itérer en conversation", "Tout se fait par échanges : « change la couleur », « ajoute une page contact ». La session est gardée, même après redémarrage.", "observe", 0),
  step("t1-deliver", "Livrer", "Quand c'est prêt : publication en 1 clic (Cloudflare/Vercel/Netlify), push GitHub, ou export. On verra ça dans un tuto dédié.", "observe", 0),
  step("t1-done", "Visite terminée 🎉", "Tu connais maintenant les repères de l'atelier. Prochain tutoriel : créer ta première vraie page en mode MVP. Quand tu veux.", "observe", 0, { checkpoint: true }),
];

const TUTORIAL_2: TutorialStep[] = [
  step("t2-intro", "Ton premier projet", "On passe à la pratique : une vraie landing page en mode ⚡ MVP (rapide). Tu vas voir MangoOS construire, puis tu l'affineras.", "observe", 10),
  step("t2-name", "Nomme le projet", "Donne un nom à ton projet — par exemple « landing-cafe ». Le nom devient le dossier de travail.", "type", 10, { target: "project-name" }),
  step("t2-first-prompt", "Le premier prompt", "Décris la page. Tu peux utiliser celui-ci tel quel ou l'adapter, puis lancer.", "send", 10, {
    target: "prompt-card",
    prefilledPrompt: "Crée une landing page pour un café parisien. Hero avec titre accrocheur, section menu en 3 colonnes, et un footer avec les horaires.",
  }),
  step("t2-watch", "Regarde construire", "MangoOS réfléchit puis écrit le code. L'aperçu se met à jour tout seul. Laisse-le finir le tour.", "observe", 10, { target: "preview" }),
  step("t2-feedback", "Donne ton avis", "Le résultat te plaît ? Utilise 👍 / 👎 (avec un mot). Chaque retour affine ce que MangoOS retient de ton goût — c'est ainsi qu'il te connaît mieux.", "observe", 10, { checkpoint: true }),
  step("t2-tweak-color", "Change une couleur", "Demande une retouche simple, par exemple : « passe l'ambiance en tons chauds, plus chaleureux ». Observe l'aperçu changer.", "send", 10, { prefilledPrompt: "Passe l'ambiance de la page en tons chauds (terracotta, crème), plus chaleureuse." }),
  step("t2-snap", "Cible un élément", "Active l'inspecteur (la cible ⌖ en haut de l'aperçu) puis clique un élément : MangoOS saura exactement quel bout de code retoucher.", "observe", 10, { target: "inspect" }),
  step("t2-rollback", "Reviens en arrière", "Ouvre les versions et reviens à un état précédent en un clic. Itérer sans risque, c'est le cœur du flux.", "observe", 10, { target: "versions" }),
  step("t2-deliver", "Garde ton travail", "Ta page existe pour de vrai dans l'atelier. Tu pourras la publier ou la reprendre quand tu veux.", "observe", 10),
  step("t2-done", "Première app livrée 🎉", "Tu as créé, itéré et sécurisé un vrai projet. Prochaine étape : le mode Finition pour durcir une app existante.", "observe", 10, { checkpoint: true }),
];

// ── Tutoriel 3 — Itérer et finir — mode Finition (freedomLevel 20) ──────────

const TUTORIAL_3: TutorialStep[] = [
  step(
    "t3-intro",
    "On reprend le café",
    "Ton landing page du tutoriel 2 est là, prête à être durcie. Mode Finition, c'est le passage de la construction brute à l'app soignée. Moins de nouvelles features, plus de solidité.",
    "observe",
    20,
  ),
  step(
    "t3-switch-mode",
    "Passe en mode Finition",
    "Clique sur le sélecteur de mode et choisis 🛡️ Finition. MangoOS adapte son comportement : il passe en pôle QA — il cherche les fragilités plutôt que d'ajouter.",
    "click",
    20,
    { target: "mode" },
  ),
  step(
    "t3-qa-prompt",
    "Lance un audit QA",
    "Envoie cette demande d'audit — MangoOS passe en revue l'accessibilité, le responsive et les micro-détails.",
    "send",
    20,
    {
      target: "composer",
      prefilledPrompt: "Fais un audit QA complet de cette landing page : accessibilité (contrastes, alt, aria), responsive mobile, micro-détails (espacements, polices, boutons). Liste les problèmes et corrige-les.",
    },
  ),
  step(
    "t3-observe-fixes",
    "Observe les corrections",
    "MangoOS corrige directement dans le code. L'aperçu se met à jour. Regarde les améliorations — souvent des dizaines de petits détails que l'œil ne capte pas du premier coup.",
    "observe",
    20,
    { target: "preview" },
  ),
  step(
    "t3-checkpoint-qa",
    "Le rendu durci — ton verdict",
    "Compare le rendu actuel avec celui du tuto 2. La page est-elle plus solide, plus professionnelle ? Donne ton 👍 ou 👎 — c'est ce retour qui calibre ce que MangoOS retient du niveau de qualité que tu exiges.",
    "observe",
    20,
    { checkpoint: true },
  ),
  step(
    "t3-inspect-target",
    "Vise un détail précis",
    "Active l'inspecteur (l'icône cible ⌖ en haut de l'aperçu) puis clique un élément dont tu n'es pas satisfait — un titre, un bouton, un espacement. MangoOS identifie exactement le fichier et la ligne.",
    "click",
    20,
    { target: "inspect" },
  ),
  step(
    "t3-surgical-fix",
    "Correction chirurgicale",
    "Décris ta retouche. Le contexte (élément ciblé) est déjà transmis — ta description peut être courte.",
    "send",
    20,
    {
      target: "composer",
      prefilledPrompt: "Le titre du hero manque d'impact. Augmente sa taille, passe-le en gras, et ajoute une légère ombre pour le faire ressortir.",
    },
  ),
  step(
    "t3-rollback",
    "Rollback en 1 clic",
    "Ouvre le panneau des versions. Tu vois l'historique de chaque tour. Clique sur une version antérieure pour revenir en arrière. Maintenant reviens à la dernière version — itère sans peur.",
    "click",
    20,
    { target: "versions" },
  ),
  step(
    "t3-memory-check",
    "Ce que MangoOS a retenu",
    "Ouvre la mémoire. MangoOS a noté ton niveau d'exigence sur la qualité visuelle à partir de tes feedbacks. Ce profil s'affine à chaque session.",
    "observe",
    20,
    { target: "memory" },
  ),
  step(
    "t3-done",
    "App durcie 🎉",
    "Tu maîtrises maintenant le cycle complet : construire (MVP) puis durcir (Finition). Prochain tutoriel : le mode Élite — cadrage en profondeur, Mango Plan, Le Miroir. Une autre dimension.",
    "observe",
    20,
    { checkpoint: true },
  ),
];

// ── Tutoriel 4 — Premier projet Élite — webapp (freedomLevel 35) ─────────────

const TUTORIAL_4: TutorialStep[] = [
  step(
    "t4-intro",
    "Mode Élite : une autre approche",
    "En mode 💎 Élite, MangoOS ne code pas tout de suite. Il commence par te poser des questions — le Mango Plan. L'idée : comprendre avant de produire. Résultat : un code plus juste dès le premier tour.",
    "observe",
    35,
  ),
  step(
    "t4-new-project",
    "Crée un nouveau projet",
    "Nomme ton projet — par exemple « tableau-de-bord » ou le nom de ton choix.",
    "type",
    35,
    { target: "project-name" },
  ),
  step(
    "t4-switch-elite",
    "Passe en mode Élite",
    "Sélectionne 💎 Élite dans le menu de mode. Observe que l'interface change légèrement — les questions de cadrage arrivent avant le premier code.",
    "click",
    35,
    { target: "mode" },
  ),
  step(
    "t4-first-prompt",
    "Lance avec une idée large",
    "Envoie une idée volontairement large — MangoOS va la structurer via le Mango Plan.",
    "send",
    35,
    {
      target: "composer",
      prefilledPrompt: "Je veux créer un tableau de bord pour suivre mes projets freelance : clients, missions en cours, revenus du mois.",
    },
  ),
  step(
    "t4-mango-plan",
    "Le Mango Plan — les questions",
    "MangoOS pose une série de questions de cadrage (15 environ) : utilisateurs, flux de données, priorités visuelles, contraintes. Réponds naturellement — pas besoin d'être exhaustif.",
    "observe",
    35,
  ),
  step(
    "t4-miroir",
    "Le Miroir — ton verdict",
    "Après tes réponses, MangoOS formule ce qu'il a compris de toi et de ton projet. C'est le Miroir. Lis attentivement : est-ce fidèle à ton intention ? Donne ton 👍 si oui, 👎 avec une correction si non.",
    "observe",
    35,
    { checkpoint: true },
  ),
  step(
    "t4-lexique",
    "Le contrat de langage",
    "MangoOS génère un lexique partagé : les mots que tu utilises, leur sens dans ce projet. Tu peux l'enrichir. Ce vocabulaire sera réinjecté dans chaque prompt de la session.",
    "observe",
    35,
  ),
  step(
    "t4-memory-artefacts",
    "Le panneau Mémoire — les artefacts",
    "Ouvre la mémoire. Tu y trouves le Mango Plan, le Miroir validé et le lexique. Ces artefacts persistent entre les sessions — tu n'auras pas à tout réexpliquer la prochaine fois.",
    "observe",
    35,
    { target: "memory" },
  ),
  step(
    "t4-first-build",
    "Premier code Élite",
    "Maintenant que le cadrage est posé, MangoOS construit. Observe la différence : l'architecture est plus réfléchie, les noms de composants correspondent à ton lexique.",
    "observe",
    35,
    { target: "preview" },
  ),
  step(
    "t4-checkpoint-build",
    "Le résultat — ton avis",
    "La première version Élite est là. Est-elle plus proche de ta vision que ce qu'un MVP aurait produit ? Ton feedback ici est particulièrement précieux — il calibre l'investissement du cadrage.",
    "observe",
    35,
    { checkpoint: true },
  ),
  step(
    "t4-done",
    "Premier projet Élite 🎉",
    "Tu as vécu le mode Élite de bout en bout : Mango Plan, Miroir, lexique, premier code cadré. Prochain tutoriel : extraire une identité visuelle depuis une URL avec Sharingan — et bâtir un design system.",
    "observe",
    35,
  ),
];

// ── Tutoriel 5 — Design system + cohérence visuelle (freedomLevel 45) ────────

const TUTORIAL_5: TutorialStep[] = [
  step(
    "t5-intro",
    "L'identité visuelle d'abord",
    "Avant d'écrire du code, une app mémorable a une identité claire : palette, typographie, ton. MangoOS a un outil pour ça — Sharingan. Tu fournis une URL d'inspiration, il extrait l'ADN visuel.",
    "observe",
    45,
    { context: "workspace" },
  ),
  step(
    "t5-sharingan-url",
    "Sharingan — une URL d'inspiration",
    "Demande à MangoOS d'analyser un site qui t'inspire visuellement. Il va en extraire palette, typographie, espacements et règles de composition.",
    "send",
    45,
    {
      prefilledPrompt: "Analyse l'identité visuelle de https://linear.app avec Sharingan : palette de couleurs, typographies, espacements, ton général. Résume les règles qui font son caractère.",
    },
  ),
  step(
    "t5-sharingan-result",
    "La palette extraite",
    "Sharingan a scrapé le site et en a extrait les données de design réelles (CSS calculé, variables, fonts). Lis le résumé — tu vas voir les décisions visuelles du site explicitées.",
    "observe",
    45,
  ),
  step(
    "t5-moodboard",
    "Le moodboard automatique",
    "MangoOS génère un moodboard à partir des données extraites : couleurs dominantes, accents, typographies, ambiance générale. C'est la base de ton design system.",
    "send",
    45,
    {
      prefilledPrompt: "À partir de l'analyse Sharingan, génère un moodboard pour mon projet : 5 couleurs nommées, 2 typographies (titre/corps), 3 règles d'espacement. Format JSON + aperçu HTML.",
    },
  ),
  step(
    "t5-checkpoint-moodboard",
    "La cohérence visuelle — ton jugement",
    "Regarde l'aperçu du moodboard. Est-il cohérent avec l'ambiance que tu veux pour ton projet ? Un 👍 valide cette direction — MangoOS s'en souvient pour tous tes prochains projets.",
    "observe",
    45,
    { checkpoint: true },
  ),
  step(
    "t5-design-system",
    "Bâtir le design system",
    "On transforme le moodboard en design system réutilisable : tokens CSS, composants de base (Button, Card, Input) avec la palette intégrée.",
    "send",
    45,
    {
      prefilledPrompt: "Transforme ce moodboard en design system React : tokens CSS (couleurs, typo, spacing), composants Button, Card et Input stylisés. Sauvegarde-le sous design-system.ts pour qu'il soit réutilisable cross-projet.",
    },
  ),
  step(
    "t5-cross-project-save",
    "Sauvegarde cross-projet",
    "Le design system est maintenant dans ta bibliothèque MangoOS. Il sera proposé automatiquement quand tu créeras un nouveau projet — tes apps garderont une cohérence visuelle sans effort.",
    "observe",
    45,
  ),
  step(
    "t5-apply-to-project",
    "Applique sur un vrai projet",
    "Applique ce design system au projet du tuto 4 (tableau de bord). La cohérence visuelle s'installe en un prompt.",
    "send",
    45,
    {
      prefilledPrompt: "Applique le design system sauvegardé à ce tableau de bord freelance : remplace les couleurs, typographies et composants par ceux du design system.",
    },
  ),
  step(
    "t5-checkpoint-cohesion",
    "Cohérence avant/après",
    "Compare le tableau de bord avant et après l'application du design system. La différence est-elle visible ? Ce feedback calibre l'importance que MangoOS accorde à la cohérence visuelle dans tes projets.",
    "observe",
    45,
    { checkpoint: true },
  ),
  step(
    "t5-done",
    "Design system actif 🎉",
    "Tu as extrait une identité visuelle réelle, construit un design system et l'as appliqué cross-projet. Prochain tutoriel : ajouter un backend Express à ta webapp — données réelles, routes API, super-agent métier.",
    "observe",
    45,
  ),
];

// ── Tutoriel 6 — Projet full-stack avec backend (freedomLevel 55) ─────────────

const TUTORIAL_6: TutorialStep[] = [
  step(
    "t6-intro",
    "Full-stack : le backend arrive",
    "Jusqu'ici, tes apps tournaient en frontend pur. MangoOS peut aussi générer un backend Express complet — routes API, gestion des données, middleware. On va en créer un pour le tableau de bord.",
    "observe",
    55,
    { context: "workspace" },
  ),
  step(
    "t6-backend-scaffold",
    "Génère le backend",
    "Demande le scaffold Express. MangoOS crée la structure, les routes et les modèles de données adaptés à ton projet.",
    "send",
    55,
    {
      prefilledPrompt: "Génère un backend Express pour le tableau de bord freelance : routes CRUD pour clients et missions (/api/clients, /api/missions), données en JSON local pour commencer, serveur démarrable avec npm start.",
    },
  ),
  step(
    "t6-observe-backend",
    "Le backend généré",
    "MangoOS a créé la structure serveur complète. Il te montre comment le démarrer et les routes disponibles. Observe l'architecture — elle suit les conventions que tu utilises d'habitude.",
    "observe",
    55,
  ),
  step(
    "t6-test-route",
    "Teste une route API",
    "Demande à MangoOS de tester une route et d'afficher le résultat dans l'aperçu — connexion frontend ↔ backend validée.",
    "send",
    55,
    {
      prefilledPrompt: "Connecte le frontend au backend : la liste des clients dans le tableau de bord doit venir de GET /api/clients. Teste avec quelques clients fictifs et affiche le résultat.",
    },
  ),
  step(
    "t6-checkpoint-fullstack",
    "La feature full-stack — ton verdict",
    "Les données viennent maintenant du backend. Est-ce que ça répond à ce que tu imaginais ? Ce checkpoint calibre ta tolérance entre la simplicité (JSON local) et la robustesse (vraie base de données).",
    "observe",
    55,
    { checkpoint: true },
  ),
  step(
    "t6-super-agent",
    "Le super-agent métier",
    "Pour une question spécialisée (sécurité API, optimisation, architecture), MangoOS peut invoquer un super-agent expert. Essaie : demande un audit de sécurité de tes routes.",
    "send",
    55,
    {
      prefilledPrompt: "Invoque le super-agent expert API REST pour auditer la sécurité de mes routes : validation des entrées, gestion des erreurs, headers de sécurité manquants. Liste les corrections prioritaires.",
    },
  ),
  step(
    "t6-expert-council",
    "Le conseil d'experts",
    "Si tu bloques sur une décision d'architecture, MangoOS peut convoquer 5 experts virtuels (architecte, sécurité, UX, perf, maintenabilité) qui donnent chacun leur angle. Essaie sur un choix ouvert.",
    "send",
    55,
    {
      prefilledPrompt: "Pour stocker les données de mes missions freelance, j'hésite entre SQLite, PostgreSQL et MongoDB. Convoque le conseil d'experts pour m'aider à choisir selon mon contexte (usage solo, pas de DevOps).",
    },
  ),
  step(
    "t6-checkpoint-decision",
    "La décision prise",
    "Le conseil d'experts t'a donné 5 angles. La décision est plus claire ? Ton 👍 ou 👎 sur cette approche aide MangoOS à savoir si tu préfères des recommandations courtes et directes ou des analyses comparatives.",
    "observe",
    55,
    { checkpoint: true },
  ),
  step(
    "t6-done",
    "App full-stack opérationnelle 🎉",
    "Frontend + backend + super-agent + conseil d'experts : tu as couvert la totalité de la stack. Prochain tutoriel : réutiliser des composants entre projets et faire des recherches sémantiques cross-projets.",
    "observe",
    55,
  ),
];

// ── Tutoriel 7 — Multi-projets + réutilisation (freedomLevel 65) ──────────────

const TUTORIAL_7: TutorialStep[] = [
  step(
    "t7-intro",
    "Tes projets se connaissent",
    "MangoOS voit tous tes projets ensemble. Il peut trouver un composant créé il y a 3 semaines, le réutiliser, ou chercher « ce bout de code qui gérait les dates » sans que tu te souviennes du nom du projet.",
    "observe",
    65,
    { context: "workspace" },
  ),
  step(
    "t7-component-library",
    "La bibliothèque de composants",
    "MangoOS a enregistré les composants clés de tes projets précédents. Demande-lui d'en lister les plus réutilisables — tu vas en importer un dans ce projet.",
    "send",
    65,
    {
      prefilledPrompt: "Liste les composants réutilisables de mes projets précédents (landing page café, tableau de bord freelance). Montre-moi lesquels pourraient s'intégrer directement ici.",
    },
  ),
  step(
    "t7-reuse-component",
    "Réutilise un composant",
    "Importe le composant le plus pertinent — par exemple le Card du design system du tuto 5 — et adapte-le au contexte actuel.",
    "send",
    65,
    {
      prefilledPrompt: "Importe le composant Card du design system sauvegardé au tuto 5 et utilise-le pour afficher les missions freelance dans le tableau de bord. Adapte juste les champs.",
    },
  ),
  step(
    "t7-semantic-search",
    "Recherche sémantique cross-projets",
    "Essaie une recherche en langage naturel sur l'ensemble de tes projets. MangoOS fouille le code et les descriptions pour trouver ce que tu cherches.",
    "send",
    65,
    {
      prefilledPrompt: "Cherche dans tous mes projets : où est-ce que j'ai géré un formatage de dates ou de montants en euros ? Montre-moi le code correspondant.",
    },
  ),
  step(
    "t7-checkpoint-reuse",
    "Le gain de réutilisation",
    "Le composant importé tourne dans ton nouveau projet. Est-ce que ce mécanisme de bibliothèque change quelque chose à ta façon d'envisager tes projets futurs ? Ton retour calibre à quel point MangoOS doit proposer de la réutilisation spontanément.",
    "observe",
    65,
    { checkpoint: true },
  ),
  step(
    "t7-notes-rag",
    "Tes notes réinjectées",
    "MangoOS peut ingérer tes notes (Markdown, texte libre) et les réinjecter automatiquement quand c'est pertinent. Essaie : envoie une note de contexte et observe comment elle influence la réponse suivante.",
    "send",
    65,
    {
      prefilledPrompt: "Note : mes clients freelance sont principalement des startups tech B2B, les missions durent 3-6 mois, je facture en TJM. Garde ça en mémoire pour orienter les prochaines suggestions.",
    },
  ),
  step(
    "t7-rag-in-action",
    "La note en action",
    "Pose maintenant une question ouverte sur ton projet — MangoOS va réinjecter automatiquement le contexte de ta note pour personnaliser sa réponse.",
    "send",
    65,
    {
      prefilledPrompt: "Quelle fonctionnalité manquante serait la plus utile dans mon tableau de bord selon mon profil d'usage ?",
    },
  ),
  step(
    "t7-done",
    "Projets connectés 🎉",
    "Tu as réutilisé des composants, cherché dans ton historique de code et activé les notes RAG. MangoOS agit maintenant vraiment comme un partenaire qui connaît ton travail passé. Prochain tutoriel : déployer et pousser sur GitHub.",
    "observe",
    65,
  ),
];

// ── Tutoriel 8 — Déploiement + GitHub (freedomLevel 75) ──────────────────────

const TUTORIAL_8: TutorialStep[] = [
  step(
    "t8-intro",
    "De l'atelier au monde réel",
    "Ton app tourne dans l'aperçu — mais elle n'est accessible qu'ici. MangoOS peut la publier en ligne (Cloudflare Pages) et la pousser sur GitHub en quelques secondes. On le fait maintenant.",
    "observe",
    75,
    { context: "workspace" },
  ),
  step(
    "t8-build-check",
    "Vérifie l'état avant de déployer",
    "Avant de publier, MangoOS passe une dernière vérification : build propre, pas d'erreur console, responsive validé. C'est automatique en mode Élite ou Finition.",
    "send",
    75,
    {
      prefilledPrompt: "Fais un check pré-déploiement : build sans erreur, console propre, mobile responsive, images optimisées. Corrige ce qui bloque.",
    },
  ),
  step(
    "t8-deploy-cloudflare",
    "Déploiement Cloudflare — 1 clic",
    "Le bandeau de l'atelier contient les boutons de publication. Clique sur « Publier » — MangoOS build et pousse sur Cloudflare Pages. Dans 30 secondes, une URL publique.",
    "click",
    75,
    { target: "deploy" },
  ),
  step(
    "t8-deploy-wait",
    "Déploiement en cours",
    "Le build tourne. L'URL sera disponible dès que Cloudflare aura terminé. Pas besoin de rester sur la page — MangoOS te notifiera quand c'est en ligne.",
    "observe",
    75,
  ),
  step(
    "t8-checkpoint-live",
    "Le site en ligne — ton verdict",
    "Ouvre l'URL publique dans un nouvel onglet. Ton app tourne sur le vrai internet. Ce moment a-t-il la fluidité que tu attendais ? Ce feedback calibre l'importance du déploiement dans ton flux habituel.",
    "observe",
    75,
    { checkpoint: true },
  ),
  step(
    "t8-github-push",
    "Push GitHub — dépôt privé auto-créé",
    "Dans le même bandeau, clique sur « GitHub ». MangoOS crée un dépôt privé à ton nom, initialise git et pousse le code. Aucune configuration manuelle.",
    "click",
    75,
    { target: "github" },
  ),
  step(
    "t8-github-result",
    "Le dépôt créé",
    "Le dépôt est en ligne sur ton compte GitHub. Chaque tour généré par MangoOS peut être committé automatiquement — tu gardes un historique git propre sans effort.",
    "observe",
    75,
  ),
  step(
    "t8-checkpoint-github",
    "GitHub + déploiement — bilan",
    "Tu as une app déployée ET versionnée. Est-ce que l'automatisation complète te convient, ou préfères-tu garder le contrôle sur certaines étapes (commit message, branche) ? Ce retour personnalise le comportement du déploiement.",
    "observe",
    75,
    { checkpoint: true },
  ),
  step(
    "t8-done",
    "App en production 🎉",
    "De l'idée à l'URL publique + dépôt GitHub en un tutoriel. Prochain tutoriel : guidage léger, dictée vocale, et lecture des métriques — tu prends presque les rênes.",
    "observe",
    75,
  ),
];

// ── Tutoriel 9 — Projet semi-libre avec guidage léger (freedomLevel 88) ──────

const TUTORIAL_9: TutorialStep[] = [
  step(
    "t9-intro",
    "Guidage léger — tu mènes",
    "À 88% de liberté, MangoOS ne te donne plus d'instructions. Il observe, et intervient seulement si tu sembles bloqué ou si une meilleure approche existe. Le guidage est une suggestion, jamais un ordre.",
    "observe",
    88,
  ),
  step(
    "t9-choose-project",
    "Ton projet, ton idée",
    "Choisis un projet que tu veux vraiment construire — pas un exercice. Lance-toi. MangoOS suit.",
    "type",
    88,
    { target: "project-name" },
  ),
  step(
    "t9-voice-intro",
    "La dictée vocale",
    "Au lieu d'écrire, tu peux dicter. Clique sur l'icône micro dans la zone de saisie et parle naturellement — Whisper transcrit et MangoOS répond. Essaie pour ton premier prompt de ce projet.",
    "click",
    88,
    { target: "mic" },
  ),
  step(
    "t9-voice-prompt",
    "Dicte ton idée",
    "Décris ton projet à voix haute. Parle comme tu le ferais à un collègue — tu n'as pas besoin de formuler techniquement.",
    "send",
    88,
  ),
  step(
    "t9-light-nudge",
    "Le guidage léger en action",
    "Si MangoOS détecte une piste que tu n'as pas explorée, il posera une question douce du type « As-tu pensé à… ? ». Tu peux l'ignorer ou la suivre — c'est toi qui décides.",
    "observe",
    88,
  ),
  step(
    "t9-checkpoint-autonomy",
    "Ton niveau d'autonomie",
    "Comment ça se passe ? Est-ce que le guidage léger est au bon niveau — ni trop intrusif ni trop silencieux ? Ce feedback est particulièrement important : il règle directement la fréquence des interventions de MangoOS.",
    "observe",
    88,
    { checkpoint: true },
  ),
  step(
    "t9-metrics",
    "Les métriques de tes 8 tutoriels",
    "MangoOS affiche le bilan de ton parcours : tokens consommés, coût estimé, projets créés, composants réutilisés, feedback donnés. C'est ton tableau de bord de la relation avec MangoOS.",
    "observe",
    88,
    { context: "metrics" },
  ),
  step(
    "t9-profile-update",
    "Ton profil, mis à jour",
    "Le profil Hermes a intégré tous tes feedbacks des 8 tutoriels. Lis ce que MangoOS a appris de toi : ton style, tes préférences, tes domaines de prédilection. Est-ce fidèle ?",
    "observe",
    88,
    { target: "memory" },
  ),
  step(
    "t9-done",
    "Presque autonome 🎉",
    "Tu as dicté, guidé ton projet, et vu le bilan du parcours. Dernier tutoriel : monde ouvert total — MangoOS connaît ton style et te laisse entièrement aux commandes.",
    "observe",
    88,
  ),
];

// ── Tutoriel 10 — Ton premier projet 100% personnel (freedomLevel 100) ────────

const TUTORIAL_10: TutorialStep[] = [
  step(
    "t10-intro",
    "Monde ouvert",
    "C'est ton atelier maintenant, Raf. Plus de couloir, plus de jalons. MangoOS connaît ton style, tes préférences, tes mots. Il observe et apprend en silence — sauf si tu l'interpelles.",
    "observe",
    100,
  ),
  step(
    "t10-identity",
    "Ce que MangoOS sait de toi",
    "Avant de partir, jette un œil à ce que MangoOS a retenu du parcours : ton identité en 3 couches (profil, préférences, axiomes). C'est la base de tout ce qu'il fera ensuite.",
    "observe",
    100,
    { target: "memory" },
  ),
  step(
    "t10-launch",
    "Lance ton projet personnel",
    "Le projet que tu n'as pas encore osé démarrer. Ou celui qui te démange depuis le début. Vas-y.",
    "send",
    100,
    { target: "prompt-card" },
  ),
  step(
    "t10-flywheel",
    "Le flywheel en marche",
    "À partir de maintenant, chaque 👍/👎 continue d'affiner MangoOS. Plus tu l'utilises, plus il te connaît. Le double apprentissage ne s'arrête pas à la fin des tutoriels — il commence vraiment ici.",
    "observe",
    100,
  ),
  step(
    "t10-done",
    "Parcours accompli 🎉",
    "10 tutoriels. Des dizaines de projets possibles. Un outil calibré sur toi. MangoOS est prêt. Toi aussi.",
    "observe",
    100,
  ),
];

export const TUTORIALS: TutorialDefinition[] = [
  { id: 1, title: "L'interface MangoOS", freedomLevel: 0, durationLabel: "~15 min", steps: TUTORIAL_1 },
  { id: 2, title: "Premier projet MVP — landing page", mode: "mvp", freedomLevel: 10, durationLabel: "~20 min", steps: TUTORIAL_2 },
  { id: 3, title: "Itérer et finir — mode Finition", mode: "finition", freedomLevel: 20, durationLabel: "~20 min", steps: TUTORIAL_3 },
  { id: 4, title: "Premier projet Élite — webapp", mode: "elite", freedomLevel: 35, durationLabel: "~25 min", steps: TUTORIAL_4 },
  { id: 5, title: "Design system + cohérence visuelle", mode: "elite", freedomLevel: 45, durationLabel: "~25 min", steps: TUTORIAL_5 },
  { id: 6, title: "Projet full-stack avec backend", mode: "elite", freedomLevel: 55, durationLabel: "~30 min", steps: TUTORIAL_6 },
  { id: 7, title: "Multi-projets + réutilisation", freedomLevel: 65, durationLabel: "~25 min", steps: TUTORIAL_7 },
  { id: 8, title: "Déploiement + GitHub", freedomLevel: 75, durationLabel: "~20 min", steps: TUTORIAL_8 },
  { id: 9, title: "Projet semi-libre avec guidage léger", freedomLevel: 88, durationLabel: "~30 min", steps: TUTORIAL_9 },
  { id: 10, title: "Ton premier projet 100% personnel", freedomLevel: 100, durationLabel: "libre", steps: TUTORIAL_10 },
];
