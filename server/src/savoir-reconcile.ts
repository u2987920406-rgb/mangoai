// #177 É4 — savoir-reconcile.ts (D3) : regroupement DÉTERMINISTE puis arbitrage
// par le JUGE souverain. La hiérarchie « déterministe d'abord » de tout le repo.
//
// Étage 1 (PUR, testable sans LLM) — `clusterClaims` : les claims `candidat` sont
// regroupés par même `sujet` normalisé (via entites + alias) ET similarité
// d'embedding au-dessus d'un seuil (SAVOIR_CLUSTER_MIN, défaut 0.78). Sortie : des
// groupes de claims « qui parlent du même point ». Aucune écriture.
//
// Étage 2 — arbitrage (pattern EXACT eleve-judge.ts) : le cerveau `juge` (souverain,
// DISTINCT de l'exécutant GLM), JSON/prose bornée, fail-open → verdict `isole` si le
// juge est muet. Pour chaque groupe multi-claims le juge classe : consensus |
// conditionnel | desaccord | isole. L'arbitrage POND ÈRE, il ne DÉCRÈTE jamais le
// vrai (D3) : un `desaccord` conserve LES DEUX positions (statut `conteste`), rien
// n'est jamais supprimé. Toute mutation passe par savoir_journal (audit + undo).
//
// Gate SAVOIR_RECONCILE (flags.ts), défaut OFF — le module reste pur/appelable par
// runners/tests (deps injectées). Le contenu des claims/extraits reste de la DONNÉE.

import { cosine, type SavoirStore, type ClaimRow, type EntiteRow, type GroupeVerdict } from "./savoir-store.js";

// ── Le seuil de clustering (D3 : SAVOIR_CLUSTER_MIN, défaut 0.78) ────────────

export function clusterSeuil(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.SAVOIR_CLUSTER_MIN;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : 0.78;
}

/**
 * Fix L78-3 : seuil de recouvrement FORT (défaut 0.85, SAVOIR_CLUSTER_STRONG) qui
 * relie deux claims MÊME de sujets différents. Le clustering ne fait plus du `sujet`
 * une PORTE bloquante (AND strict) : deux phrases quasi-identiques (cosinus ≥ 0.85)
 * taggées de sujets différents par GLM — le cas terminal `c257/c258`, cosinus 1.000,
 * sujets « harnais » vs « agents IA » — sont désormais regroupées. Le sujet reste un
 * signal (regroupe au seuil normal 0.78 quand il concorde), pas un veto. 0.85 choisi
 * pour rattraper les quasi-doublons cross-sujet sans fusionner des thèmes voisins
 * mais distincts (les paires inter-thèmes mesurées plafonnaient à 0.80-0.84). */
export function clusterSeuilFort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.SAVOIR_CLUSTER_STRONG;
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0 && n <= 1) return n;
  return Math.max(0.85, clusterSeuil(env));
}

// ── Étage 1 — clustering déterministe (PUR) ─────────────────────────────────

/** Forme minimale d'un claim pour le clustering (sous-ensemble de ClaimRow). */
export interface ClaimLike {
  id: number;
  sujet: string;
  enonce: string;
  conditions?: string;
  extrait?: string;
  videoId: number;
  tStartS: number;
  embedding?: number[] | null;
}

export interface ClaimCluster {
  /** Sujet canonique du groupe (nom d'entité résolu). */
  sujet: string;
  claims: ClaimLike[];
}

/** Normalise une clé de sujet (casse/accents/espaces) — la comparaison brute. PUR. */
export function normalizeSujetKey(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Résout un sujet vers son nom d'entité CANONIQUE via la liste `entites` (match
 * exact `nom` OU présence dans `alias`, tolérant casse/espaces). Sinon renvoie le
 * sujet trimmé tel quel. PUR (même esprit que SavoirStore.resolveEntite, sans I/O). */
export function canonicalSujet(sujet: string, entites: EntiteRow[]): string {
  const key = normalizeSujetKey(sujet);
  if (!key) return (sujet ?? "").trim();
  for (const e of entites) {
    if (normalizeSujetKey(e.nom) === key) return e.nom;
    if (e.alias?.some((a) => normalizeSujetKey(a) === key)) return e.nom;
  }
  return sujet.trim();
}

/**
 * Regroupe les claims par lien-simple, en OR pondéré (fix L78-3) plutôt qu'en AND
 * strict `sujet ET cosinus`. Un claim rejoint un cluster existant SI :
 *   (a) MÊME sujet canonique ET (cosinus ≥ `seuil` avec un membre, OU l'un des deux
 *       n'a pas d'embedding — fail-open vers le regroupement, pour que les
 *       contradictions intra-sujet remontent) ; OU
 *   (b) cosinus ≥ `seuilFort` avec un membre, MÊME si le sujet diffère (rattrape les
 *       quasi-doublons mal étiquetés par GLM — le cas `c257/c258`).
 * Sinon il ouvre un nouveau cluster. Déterministe (ordre d'entrée), PUR, aucune
 * écriture. Le `sujet` d'un cluster est celui de son PREMIER claim (le fondateur). */
export function clusterClaims(
  claims: ClaimLike[],
  entites: EntiteRow[],
  seuil: number,
  seuilFort: number = clusterSeuilFort(),
): ClaimCluster[] {
  interface Bucket {
    sujet: string;
    sujetKey: string;
    items: ClaimLike[];
  }
  const clusters: Bucket[] = [];

  const hasEmb = (c: ClaimLike): c is ClaimLike & { embedding: number[] } => !!c.embedding && c.embedding.length > 0;

  for (const c of claims) {
    const sujet = canonicalSujet(c.sujet, entites);
    const key = normalizeSujetKey(sujet);
    const emb = hasEmb(c) ? c.embedding : null;

    let target = -1;
    // (a) même sujet : cosinus ≥ seuil, ou fail-open si un embedding manque.
    for (let i = 0; i < clusters.length && target === -1; i++) {
      if (clusters[i].sujetKey !== key) continue;
      const cl = clusters[i];
      if (!emb) {
        target = i; // claim nu → rejoint le 1er cluster de même sujet (ne pas fragmenter)
      } else if (cl.items.some((m) => !hasEmb(m) || cosine(m.embedding!, emb) >= seuil)) {
        target = i;
      }
    }
    // (b) sujet différent mais recouvrement FORT : rattrape les quasi-doublons.
    if (target === -1 && emb) {
      for (let i = 0; i < clusters.length && target === -1; i++) {
        if (clusters[i].items.some((m) => hasEmb(m) && cosine(m.embedding!, emb) >= seuilFort)) target = i;
      }
    }

    if (target === -1) clusters.push({ sujet, sujetKey: key, items: [c] });
    else clusters[target].items.push(c);
  }

  return clusters.map((b) => ({ sujet: b.sujet, claims: b.items }));
}

// ── Étage 2 — le JUGE souverain (pattern eleve-judge.ts) ────────────────────

export interface JugeVerdict {
  verdict: GroupeVerdict;
  resume: string;
  arbitrage: string;
  /** false = aucune ligne VERDICT: lisible dans la prose (hors-format) — le
   *  `verdict` retourné (repli "isole") est alors un défaut d'AFFICHAGE, jamais
   *  un vrai classement du juge. Même famille de bug que neon-drift/taste-judge
   *  et l'incident intent-judge (2026-07-07) : une réponse illisible ne doit
   *  jamais se compter comme un jugement réel. */
  parsed: boolean;
}

const VERDICTS: readonly GroupeVerdict[] = ["consensus", "conditionnel", "desaccord", "isole"];

export const JUGE_SYSTEM =
  "Tu es le JUGE de réconciliation d'une base de connaissance vidéo. On te donne un GROUPE " +
  "d'affirmations (claims) extraites de plusieurs vidéos qui parlent DU MÊME point, avec leurs " +
  "conditions de validité, leur citation verbatim, la vidéo source et sa date. Tu ne DÉCRÈTES " +
  "JAMAIS qui a raison — tu CLASSES la nature de leur rapport et tu l'exposes. Choisis EXACTEMENT " +
  "un verdict :\n" +
  "- consensus : les affirmations concordent (même position).\n" +
  "- conditionnel : elles semblent se contredire mais tiennent à des CONDITIONS différentes " +
  "(contextes d'application distincts) — nomme la condition discriminante.\n" +
  "- desaccord : vraies écoles opposées sur le même contexte — expose les DEUX positions, ne " +
  "tranche pas.\n" +
  "- isole : une seule position réelle, rien à réconcilier.\n" +
  "Réponds EXACTEMENT dans ce format, rien d'autre :\n" +
  "VERDICT: <consensus|conditionnel|desaccord|isole>\n" +
  "RESUME: <une à deux phrases : l'énoncé consolidé, OU l'exposé des deux écoles>\n" +
  "ARBITRAGE: <la condition discriminante / ce qui les départage factuellement, ou « rien »>\n" +
  "Réponds en français.";

/** Construit le prompt utilisateur d'un groupe. PUR. */
export function buildJugePrompt(
  cluster: ClaimCluster,
  ctx: (videoId: number) => { titre: string; date?: string },
): string {
  const lignes = cluster.claims.map((c, i) => {
    const meta = ctx(c.videoId);
    const cond = c.conditions?.trim() ? ` | conditions: ${c.conditions.trim()}` : "";
    const ex = c.extrait?.trim() ? `\n   verbatim: « ${c.extrait.trim()} »` : "";
    const date = meta.date ? `, ${meta.date}` : "";
    return `[${i + 1}] (${meta.titre}${date}) ${c.enonce}${cond}${ex}`;
  });
  return (
    `Sujet du groupe : ${cluster.sujet}\n\n` +
    `Affirmations (${cluster.claims.length}) :\n${lignes.join("\n")}\n\n` +
    "Classe ce groupe. Donne VERDICT, RESUME, ARBITRAGE."
  );
}

const NEGATIF = /^(rien|aucun|n\/?a|néant|aucune|ras)\b/i;

/** Parse la prose étiquetée du juge → verdict. PUR, tolérant. Fail-open : verdict
 *  par défaut `isole` (source unique, prudent) si aucun verdict lisible. */
export function parseJugeVerdict(prose: string, fallback: GroupeVerdict = "isole"): JugeVerdict {
  const text = (prose ?? "").trim();
  let verdict: GroupeVerdict = fallback;
  const vm = text.match(/verdict\s*[:：]?\s*(consensus|conditionnel|d[ée]saccord|isol[ée])/i);
  const parsed = !!vm;
  if (vm) {
    const v = normalizeSujetKey(vm[1]);
    if (v.startsWith("consensus")) verdict = "consensus";
    else if (v.startsWith("conditionnel")) verdict = "conditionnel";
    else if (v.startsWith("desaccord")) verdict = "desaccord";
    else verdict = "isole";
  }
  const grab = (label: RegExp): string => {
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(label);
      if (m) {
        let val = m[1].trim();
        // continuation multi-lignes jusqu'à la prochaine étiquette
        for (let j = i + 1; j < lines.length; j++) {
          if (/^\s*(verdict|resume|résumé|arbitrage)\s*[:：]/i.test(lines[j])) break;
          if (lines[j].trim()) val += " " + lines[j].trim();
        }
        return val.trim();
      }
    }
    return "";
  };
  const resume = grab(/^\s*r[ée]sum[ée]\s*[:：]\s*(.*)$/i);
  let arbitrage = grab(/^\s*arbitrage\s*[:：]\s*(.*)$/i);
  if (NEGATIF.test(arbitrage)) arbitrage = "";
  return { verdict, resume: resume.slice(0, 1000), arbitrage: arbitrage.slice(0, 1000), parsed };
}

// ── Application journalisée des verdicts (écrit dans la base via É2) ─────────

export interface ReconcileDeps {
  /** Cerveau `juge` souverain (pattern eleve-judge.ts). freeform + trustExternal. */
  dispatch: (
    agentId: "juge",
    system: string,
    user: string,
    opts: { trustExternal?: boolean; freeform?: boolean },
  ) => Promise<{ status: string; summary?: string }>;
  /** Embedding best-effort du résumé de groupe (safeEmbed en prod). */
  embed?: (text: string) => Promise<number[] | null>;
  /** Horloge injectable. */
  now?: () => number;
}

export interface ReconcileOptions {
  seuil?: number;
  /** Seuil de recouvrement FORT (cross-sujet, fix L78-3). Défaut clusterSeuilFort(). */
  seuilFort?: number;
  /** Poids d'un claim isolé (source unique — affiché comme tel). Défaut 0.5. */
  isolePoids?: number;
}

export interface ReconcileResult {
  claims: number; // claims candidats considérés
  clusters: number; // groupes formés par le clustering
  judged: number; // groupes multi-claims soumis au juge
  judgeSilent: number; // groupes où le juge a été muet APRÈS retry (fail-open → isole)
  judgeRetried: number; // fix L78-4 : groupes muets au 1er essai récupérés au retry
  /** (2026-07-07) groupes où le juge A RÉPONDU (non muet) mais sans ligne VERDICT:
   *  lisible — fail-open → isole, mais PAS compté dans `verdicts` (ce n'est pas un
   *  vrai classement) ni confondu avec `judgeSilent` (le juge n'était pas muet). */
  judgeUnparsed: number;
  verdicts: Record<GroupeVerdict, number>;
  groupes: number; // groupes écrits en base
}

/** Recency ∈ [0, 0.5] : la vidéo la plus récente du corpus vaut +0.5, la plus
 *  ancienne +0. Sans dates exploitables → 0 pour toutes (neutre). PUR. */
function recencyScorer(dates: (string | null | undefined)[]): (d?: string | null) => number {
  const valid = dates.filter((d): d is string => !!d && /^\d{4}/.test(d)).sort();
  if (valid.length < 2) return () => 0;
  const min = valid[0];
  const max = valid[valid.length - 1];
  return (d) => {
    if (!d || d < min) return 0;
    if (d >= max) return 0.5;
    // interpolation lexicographique grossière suffisante (dates ISO)
    const span = max.localeCompare(min) || 1;
    return Math.max(0, Math.min(0.5, (d.localeCompare(min) / span) * 0.5));
  };
}

/**
 * Passe de réconciliation GLOBALE au corpus (D3/D4) : charge tous les claims
 * `candidat`, les cluster (étage 1), fait arbitrer chaque groupe multi-claims par
 * le juge (étage 2, fail-open), écrit un `groupe` par cluster et applique les
 * verdicts de façon JOURNALISÉE. NE LÈVE JAMAIS (fail-open partout). */
export async function reconcileCorpus(
  store: SavoirStore,
  deps: ReconcileDeps,
  opts: ReconcileOptions = {},
): Promise<ReconcileResult> {
  const seuil = opts.seuil ?? clusterSeuil();
  const isolePoids = opts.isolePoids ?? 0.5;
  const res: ReconcileResult = {
    claims: 0,
    clusters: 0,
    judged: 0,
    judgeSilent: 0,
    judgeRetried: 0,
    judgeUnparsed: 0,
    verdicts: { consensus: 0, conditionnel: 0, desaccord: 0, isole: 0 },
    groupes: 0,
  };

  let claims: ClaimRow[] = [];
  let entites: EntiteRow[] = [];
  try {
    claims = store.listClaims("candidat");
    entites = store.listEntites();
  } catch {
    return res;
  }
  res.claims = claims.length;
  if (claims.length === 0) return res;

  // Contexte vidéo (titre + date) pour le juge et la récence.
  const vmeta = new Map<number, { titre: string; date?: string }>();
  const dates: (string | null | undefined)[] = [];
  for (const c of claims) {
    if (vmeta.has(c.video_id)) continue;
    try {
      const v = store.getVideo(c.video_id);
      vmeta.set(c.video_id, { titre: v?.titre ?? `vidéo ${c.video_id}`, date: v?.publiee_le ?? undefined });
      dates.push(v?.publiee_le ?? undefined);
    } catch {
      vmeta.set(c.video_id, { titre: `vidéo ${c.video_id}` });
    }
  }
  const recency = recencyScorer(dates);
  const ctx = (vid: number) => vmeta.get(vid) ?? { titre: `vidéo ${vid}` };

  const likes: ClaimLike[] = claims.map((c) => ({
    id: c.id,
    sujet: c.sujet,
    enonce: c.enonce,
    conditions: c.conditions,
    extrait: c.extrait,
    videoId: c.video_id,
    tStartS: c.t_start_s,
    embedding: c.embedding,
  }));

  const clusters = clusterClaims(likes, entites, seuil, opts.seuilFort ?? clusterSeuilFort());
  res.clusters = clusters.length;

  for (const cluster of clusters) {
    const claimIds = cluster.claims.map((c) => c.id);
    const distinctVideos = new Set(cluster.claims.map((c) => c.videoId)).size;

    // ── Étage 2 : verdict ────────────────────────────────────────────────
    let verdict: JugeVerdict;
    let genuine = true; // faux seulement si le verdict "isole" est un repli, pas un vrai jugement
    if (cluster.claims.length === 1) {
      // Un seul claim → isole direct (aucun appel juge nécessaire — un vrai classement).
      verdict = { verdict: "isole", resume: cluster.claims[0].enonce, arbitrage: "", parsed: true };
    } else {
      res.judged++;
      const user = buildJugePrompt(cluster, ctx);
      // Fix L78-4 : UN retry avant le fail-open. 36 % des groupes tombaient en
      // `isole` faute de réponse du juge (silence infra, pas prompt) — sous-pondérés
      // silencieusement. On retente UNE fois (pas de boucle infinie) puis on accepte
      // le fail-open. On mesure les récupérations (judgeRetried) et le silence résiduel.
      let prose = "";
      let firstSilent = false;
      for (let attempt = 0; attempt < 2 && !prose.trim(); attempt++) {
        try {
          const r = await deps.dispatch("juge", JUGE_SYSTEM, user, { trustExternal: true, freeform: true });
          if (r.status === "ok" && r.summary?.trim()) prose = r.summary;
        } catch {
          /* prose reste vide → retry si attempt 0, sinon fail-open */
        }
        if (attempt === 0 && !prose.trim()) firstSilent = true;
      }
      if (firstSilent && prose.trim()) res.judgeRetried++; // muet au 1er essai, récupéré au retry
      if (!prose.trim()) {
        res.judgeSilent++;
        // Fail-open : juge muet même après retry → isole (rien perdu, résumé = concat).
        // (comportement pré-existant conservé : ce cas tallie déjà verdicts.isole,
        // testé explicitement — seul le cas NEUF "répond mais hors-format" ci-dessous
        // est exclu du tally, voir judgeUnparsed.)
        verdict = { verdict: "isole", resume: cluster.claims.map((c) => c.enonce).join(" / ").slice(0, 1000), arbitrage: "", parsed: false };
      } else {
        verdict = parseJugeVerdict(prose, "isole");
        if (!verdict.resume) verdict.resume = cluster.claims.map((c) => c.enonce).join(" / ").slice(0, 1000);
        if (!verdict.parsed) {
          // (2026-07-07) le juge a RÉPONDU mais hors-format — un vrai desaccord/consensus
          // raté ne doit jamais s'enregistrer silencieusement comme "isole" décidé.
          res.judgeUnparsed++;
          genuine = false;
          verdict.arbitrage = verdict.arbitrage || "(juge illisible : verdict hors-format, isole par défaut — non fiable)";
        }
      }
    }
    if (genuine) res.verdicts[verdict.verdict]++;

    // ── Écriture du groupe (embedding best-effort) ───────────────────────
    let gEmb: number[] | undefined;
    if (deps.embed) {
      try {
        const v = await deps.embed(verdict.resume || cluster.sujet);
        if (Array.isArray(v) && v.length > 0) gEmb = v;
      } catch {
        /* best-effort */
      }
    }
    let groupeId: number;
    try {
      groupeId = store.insertGroupe({
        sujet: cluster.sujet,
        resume: verdict.resume || cluster.sujet,
        verdict: verdict.verdict,
        arbitrage: verdict.arbitrage,
        embedding: gEmb,
      });
      res.groupes++;
    } catch {
      continue; // groupe non écrit → on passe (les claims restent candidat)
    }

    // ── Application journalisée sur chaque claim (jamais de suppression) ──
    for (const c of cluster.claims) {
      const rec = recency(ctx(c.videoId).date);
      try {
        if (verdict.verdict === "desaccord") {
          // LES DEUX positions conservées → `conteste`, chacune pondérée. Rien supprimé.
          store.promoteClaim(c.id, { statut: "conteste", poids: 1 + rec, groupeId });
        } else if (verdict.verdict === "consensus" || verdict.verdict === "conditionnel") {
          const poids = Math.min(3, distinctVideos) + rec;
          const changes: { statut: "canon"; poids: number; groupeId: number; conditions?: string } = {
            statut: "canon",
            poids,
            groupeId,
          };
          // conditionnel : enrichit les conditions du claim avec la condition discriminante nommée.
          if (verdict.verdict === "conditionnel" && verdict.arbitrage) {
            changes.conditions = c.conditions?.trim() ? `${c.conditions.trim()} — ${verdict.arbitrage}` : verdict.arbitrage;
          }
          store.promoteClaim(c.id, changes);
        } else {
          // isole → canon à poids faible (source unique, affiché comme tel).
          store.promoteClaim(c.id, { statut: "canon", poids: isolePoids, groupeId });
        }
      } catch {
        /* fail-open : un claim non promu reste candidat, la passe est re-jouable */
      }
    }
    void claimIds;
  }

  try {
    store.journal("reconcile_pass", {
      claims: res.claims,
      clusters: res.clusters,
      judged: res.judged,
      judgeSilent: res.judgeSilent,
      judgeRetried: res.judgeRetried,
      verdicts: res.verdicts,
      seuil,
      ts: (deps.now ?? Date.now)(),
    });
  } catch {
    /* journal best-effort */
  }
  return res;
}
