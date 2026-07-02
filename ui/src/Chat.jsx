import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// Phase C (audit-mango-2.0 §5) — le monolithe s'est découpé : helpers purs et blocs
// autonomes vivent dans components/chat/, Chat.jsx reste l'orchestrateur (état + réseau).
import {
  parseQuestion,
  CHAT_ACTIONS, ACTION_MODELS_KEY, loadActionModels, groupMessages,
} from "./components/chat/helpers.js";
import ChatMessages from "./components/chat/ChatMessages.jsx";
import ChatComposer from "./components/chat/ChatComposer.jsx";

let nextId = 1;
const uid = () => nextId++;

export default function Chat({
  projectName,
  model,
  mode,
  template,
  onPreviewUrl,
  onCost,
  onContext,
  onAgentDone,
  autoPrompt,
  onAutoPromptConsumed,
  seedInput,
  onSeedConsumed,
  editTarget,
  onEditTargetConsumed,
  onChatMode = () => {},
  onToast = () => {},
  showThinking = true,
  tutorialId = null,
  clientMode = false,
  styleStrength = 100,
  seedHistory = null,
  nocturnalEntry = null,
  onReviewed = () => {},
  buildRequest = null,
  onBuildConsumed = () => {},
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // L'agent est-il occupé AILLEURS (autre acteur : session automatique, run nocturne) ?
  // Sondé périodiquement → l'indicateur de réflexion s'affiche même hors de notre tour,
  // pour qu'on sache d'attendre AVANT d'envoyer (fini le 409 rouge par surprise).
  const [externalBusy, setExternalBusy] = useState(false);
  const working = busy || externalBusy; // occupé, peu importe la source
  const [attachments, setAttachments] = useState([]); // File[] — images/PDF joints
  const sessionRef = useRef(null); // Agent SDK session_id, kept across turns
  const abortRef = useRef(null); // AbortController du tour en cours (clic « Stop »)
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  // Live mirrors of the current project + busy state, read by the post-turn
  // history poll (#73): a setTimeout closure captures stale values otherwise.
  const projectNameRef = useRef(projectName);
  const busyRef = useRef(busy);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [contextFile, setContextFile] = useState(null);   // string | null
  const [filePicker, setFilePicker] = useState(false);    // popover ouvert ?
  const [awaitingPlanConfirm, setAwaitingPlanConfirm] = useState(false);
  // Après un tour Discuter, l'Élève (lecture seule) a pu diagnostiquer un correctif :
  // on propose de l'APPLIQUER en un clic via le mode Construire (qui a l'écriture).
  const [awaitingApply, setAwaitingApply] = useState(false);
  const [fileList, setFileList] = useState([]);            // fichiers du projet
  const [fileSearch, setFileSearch] = useState("");
  const pickerRef = useRef(null);
  // Modèle par action (Construire/Planifier/Discuter), configurable + mémorisé.
  const [actionModels, setActionModels] = useState(loadActionModels);
  const [activeAction, setActiveAction] = useState("construire"); // bouton actif (highlight + planificateur)
  const [modelMenuFor, setModelMenuFor] = useState(null);         // id de l'action dont le menu modèle est ouvert
  // #174 — Skills à invocation directe : « /slug args » tapé au composer est
  // remplacé par le corps de la skill (substitution côté back). `skills` = liste
  // légère (slug + description) pour l'autocomplétion et la validation du slug.
  const [skills, setSkills] = useState([]);
  const [menuActive, setMenuActive] = useState(0);            // item surligné de l'autocomplete /slug
  const [menuDismissed, setMenuDismissed] = useState(false);  // Échap ferme jusqu'à la frappe suivante
  const expandingRef = useRef(false);                        // évite deux expansions concurrentes (double-Entrée)
  useEffect(() => {
    try { localStorage.setItem(ACTION_MODELS_KEY, JSON.stringify(actionModels)); } catch { /* localStorage indispo */ }
  }, [actionModels]);
  // Clic sur un bouton d'action → active l'action et applique SON modèle + mode.
  const pickAction = (a) => {
    setActiveAction(a.id);
    setAwaitingApply(false);
    onChatMode({ model: actionModels[a.id], mode: a.mode });
  };
  // Choix du modèle d'une action (menu déroulant) → mémorise et, si l'action est
  // active, applique aussitôt le nouveau modèle.
  const setActionModel = (actionId, modelId) => {
    setActionModels((prev) => ({ ...prev, [actionId]: modelId }));
    setModelMenuFor(null);
    if (activeAction === actionId) {
      const a = CHAT_ACTIONS.find((x) => x.id === actionId);
      onChatMode({ model: modelId, mode: a.mode });
    }
  };

  // #174 — Charge la bibliothèque de skills (slug + description) pour l'autocomplete
  // et la validation du slug. Rechargée quand l'input (re)devient une commande « / »
  // pour capter une skill créée en cours de session, sans spammer le réseau.
  const refetchSkills = useCallback(() => {
    fetch("/api/skills")
      .then((r) => (r.ok ? r.json() : { skills: [] }))
      .then((d) => setSkills((d.skills ?? []).filter((s) => s && s.slug)))
      .catch(() => {});
  }, []);
  useEffect(() => { refetchSkills(); }, [refetchSkills]);
  const startsSlash = input.startsWith("/");
  useEffect(() => { if (startsSlash) refetchSkills(); }, [startsSlash, refetchSkills]);

  // Autocomplete : ouvert uniquement tant que le slug est en cours de frappe
  // (slash + slug SANS espace) ; dès qu'un espace est tapé, on passe aux arguments
  // et le menu se ferme. Un slug inconnu tapé en entier n'ouvre rien de spécial.
  const slugTyping = /^\/(\S*)$/.exec(input);
  const slugQuery = slugTyping ? slugTyping[1].toLowerCase() : null;
  const skillSuggestions = useMemo(() => {
    if (slugQuery === null) return [];
    return skills.filter((s) => s.slug.toLowerCase().includes(slugQuery)).slice(0, 6);
  }, [slugQuery, skills]);
  const skillMenuOpen = skillSuggestions.length > 0 && !menuDismissed && !busy;
  // Reset de la sélection + réouverture (après Échap) à chaque frappe de l'input.
  useEffect(() => { setMenuActive(0); setMenuDismissed(false); }, [input]);

  // Complète le composer avec « /slug » + un espace (prêt pour les arguments).
  const completeSkill = (s) => {
    if (!s) return;
    setInput(`/${s.slug} `);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  };

  // Résout « /slug [args] » → corps expansé (substitution $ARGUMENTS côté back),
  // ou null si le slug est inconnu / l'endpoint échoue → l'appelant envoie alors
  // le texte brut tel quel (garde-fou : un slash + slug inconnu ne casse rien).
  const skillSlugs = useMemo(() => new Set(skills.map((s) => s.slug)), [skills]);
  async function maybeExpandSkill(raw) {
    const m = /^\/([^\s]+)([\s\S]*)$/.exec(raw);
    if (!m || !skillSlugs.has(m[1])) return null;
    const args = m[2].trim();
    try {
      const r = await fetch(`/api/skills/${encodeURIComponent(m[1])}?args=${encodeURIComponent(args)}`);
      if (!r.ok) return null;
      const d = await r.json();
      return typeof d.expanded === "string" ? d.expanded : null;
    } catch {
      return null;
    }
  }

  // Au MONTAGE : synchronise le mode parent sur le bouton actif (Construire→elite).
  // Sans ça, après un remontage (F5, bascule de projet) le highlight revient sur
  // "construire" tandis que le mode parent reste collé sur un ancien "discuss"
  // (issu d'un tour Planifier/Discuter) → un envoi « Construire » partait à tort en
  // conversation. Désormais highlight et mode ne peuvent plus diverger.
  useEffect(() => {
    const a = CHAT_ACTIONS.find((x) => x.id === activeAction);
    if (a) onChatMode({ model: actionModels[a.id], mode: a.mode });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!filePicker) return;
    fetch(`/api/files/${encodeURIComponent(projectName)}`)
      .then((r) => r.ok ? r.json() : { files: [] })
      .then((d) => setFileList(d.files ?? []))
      .catch(() => {});
  }, [filePicker, projectName]);

  useEffect(() => {
    if (!filePicker) return;
    function onOutside(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setFilePicker(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [filePicker]);

  // Aligné sur ce que Mango sait lire + le backend (server/src/uploads.ts) :
  // images · PDF/Office/texte (lire_document) · archives .zip/.rar (lire_archive).
  const ACCEPTED = /\.(png|jpe?g|webp|gif|pdf|docx|xlsx|pptx|txt|md|csv|json|zip|rar)$/i;
  const addFiles = (files) => {
    const valid = [...files].filter((f) => f && ACCEPTED.test(f.name || ".png"));
    if (valid.length === 0) return;
    setAttachments((prev) => [...prev, ...valid].slice(0, 6));
  };

  // Snap mode: the user draws a rectangle over the preview; the backend
  // re-renders the preview at the iframe's exact size and crops that zone.
  const [snapMode, setSnapMode] = useState(false);
  const [snapBusy, setSnapBusy] = useState(false);
  const [snapRect, setSnapRect] = useState(null); // {x, y, w, h} viewport coords
  const snapStart = useRef(null);

  useEffect(() => {
    if (!snapMode) return;
    const onKey = (e) => e.key === "Escape" && cancelSnap();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [snapMode]);

  const cancelSnap = () => {
    setSnapMode(false);
    setSnapRect(null);
    snapStart.current = null;
  };

  async function finishSnap() {
    const rect = snapRect;
    cancelSnap();
    if (!rect || rect.w < 8 || rect.h < 8) return;
    const iframe = document.querySelector("iframe");
    if (!iframe) {
      push({ role: "status", text: "Aucun aperçu à capturer — lance d'abord l'app." });
      return;
    }
    // Intersect the drawn rectangle with the preview iframe
    const r = iframe.getBoundingClientRect();
    const x1 = Math.max(rect.x, r.left);
    const y1 = Math.max(rect.y, r.top);
    const x2 = Math.min(rect.x + rect.w, r.right);
    const y2 = Math.min(rect.y + rect.h, r.bottom);
    if (x2 - x1 < 8 || y2 - y1 < 8) {
      push({ role: "status", text: "La zone capturée doit recouvrir l'aperçu (panneau de droite)." });
      return;
    }
    setSnapBusy(true);
    try {
      const res = await fetch("/api/snap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName,
          viewport: { width: Math.round(r.width), height: Math.round(r.height) },
          box: {
            x: Math.round(x1 - r.left),
            y: Math.round(y1 - r.top),
            width: Math.round(x2 - x1),
            height: Math.round(y2 - y1),
          },
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `Erreur HTTP ${res.status}`);
      const bytes = Uint8Array.from(atob(d.data), (c) => c.charCodeAt(0));
      addFiles([new File([bytes], "capture-zone.png", { type: "image/png" })]);
    } catch (err) {
      push({ role: "error", text: `Capture impossible : ${err.message ?? err}` });
    } finally {
      setSnapBusy(false);
    }
  }

  // Switching projects = different conversation; the backend will resume
  // the project's stored session on the next message. The persisted chat
  // history of the project replaces whatever is on screen.
  useEffect(() => {
    sessionRef.current = null;
    setAwaitingPlanConfirm(false);
    let cancelled = false;
    if (!projectName.trim()) {
      setMessages([]);
      return;
    }
    fetch(`/api/history/${encodeURIComponent(projectName)}`)
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d) => {
        if (cancelled) return;
        const loaded = (d.messages ?? []).map((m) => ({ id: uid(), role: m.role, text: m.text }));
        // Repli : un projet sans historique (ex. généré la nuit avant le fix
        // backend) affiche au moins sa tâche initiale au lieu d'un écran vide.
        if (loaded.length === 0 && seedHistory) {
          setMessages([{ id: uid(), role: "user", text: seedHistory }]);
        } else {
          setMessages(loaded);
        }
        requestAnimationFrame(() => {
          listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectName, seedHistory]);

  const push = (msg) => {
    setMessages((prev) => [...prev, { id: uid(), ...msg }]);
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    });
  };

  // Callback STABLE (useCallback) : indispensable pour que <Message> mémoïsé ne
  // re-rende pas à chaque frappe dans la chatbox. Sans ça, une prop onFeedback
  // recréée à chaque render casserait la mémoïsation et tout l'historique
  // (ReactMarkdown) re-rendrait à chaque touche → lag sur les longues sessions.
  // « Relancer » sous un message utilisateur : recopie SON texte dans la barre de
  // saisie (pour le modifier puis le renvoyer SOI-MÊME — pas d'envoi automatique).
  // Stable (useCallback) pour ne pas casser la mémoïsation de <Message>.
  const handleReuse = useCallback((text) => {
    setInput(text);
    // Le textarea se met à jour au prochain render → on (re)focus, redimensionne et
    // place le curseur en fin de texte une fois la valeur appliquée.
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }, []);

  const handleFeedback = useCallback((rating, text) => {
    fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `model` : en mode Élève (GLM), le serveur fait traiter le pouce PAR GLM
      // — souveraineté, la boucle d'apprentissage reste GLM + Mango.
      body: JSON.stringify({ projectName, rating, text, model }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.escalate) {
          setMessages((prev) => [...prev, { id: uid(), role: "escalation", projectName }]);
        }
      })
      .catch(() => {});
  }, [projectName, model]);

  // Groupes stables tant que `messages` ne change pas : sans ça, groupMessages
  // recrée des objets à chaque frappe et casse la mémoïsation de ToolGroup.
  const grouped = useMemo(() => groupMessages(messages), [messages]);

  // Réponse guidée : si le dernier message de l'agent pose une question structurée
  // (oui/non ou choix multiple) et que l'agent ne travaille plus, on affiche une
  // box de réponses cliquables + raccourcis clavier. L'utilisateur peut toujours
  // taper une réponse libre dans la zone de saisie (les raccourcis sont ignorés
  // quand le focus est dans un champ de saisie).
  const lastMsg = messages[messages.length - 1];
  const question = !busy && lastMsg?.role === "agent" ? parseQuestion(lastMsg.text) : { kind: null, options: [] };
  const answerConfirm = (ans) => { if (!busy) send(ans); };
  useEffect(() => {
    if (!question.kind) return;
    const onKey = (e) => {
      const el = document.activeElement;
      const typing = el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return; // ne pas voler la frappe
      if (question.kind === "yesno") {
        const k = e.key.toLowerCase();
        if (k === "y" || k === "o") { e.preventDefault(); answerConfirm("Oui"); }
        else if (k === "n") { e.preventDefault(); answerConfirm("Non"); }
      } else {
        const idx = parseInt(e.key, 10);
        if (idx >= 1 && idx <= question.options.length) {
          e.preventDefault();
          answerConfirm(question.options[idx - 1].label);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lastMsg?.id, question.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the refs in sync so the post-turn poll sees current values.
  useEffect(() => { projectNameRef.current = projectName; }, [projectName]);
  useEffect(() => { busyRef.current = busy; }, [busy]);

  // Sonde légère de l'état serveur (toutes les 3 s) : tant qu'on ne fait pas NOTRE
  // propre tour (busy), on demande si l'agent est occupé ailleurs (session auto de
  // Raf, run nocturne) → `externalBusy`. Ainsi l'indicateur de réflexion s'affiche
  // AVANT qu'on envoie une requête vouée au 409. Pendant notre tour, c'est `busy`
  // qui fait foi (pas besoin de sonder). Best-effort : un échec réseau ne casse rien.
  useEffect(() => {
    if (busy) { setExternalBusy(false); return; }
    let alive = true;
    const tick = () => {
      fetch("/api/agent-status")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (alive) setExternalBusy(Boolean(d?.busy)); })
        .catch(() => {});
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => { alive = false; clearInterval(id); };
  }, [busy]);

  // After a turn, background agents (review 🧠, patrol 🛡️ — idea #73) append
  // status lines to the persisted history AFTER the SSE stream has closed, so
  // they aren't in our in-memory messages. Re-fetch the history a couple of
  // times to surface them. Guards: only if still on the same project and idle
  // (a new turn in flight owns the messages); never wipe to empty on a hiccup.
  const refetchHistory = (pName) => {
    if (pName !== projectNameRef.current || busyRef.current) return;
    fetch(`/api/history/${encodeURIComponent(pName)}`)
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d) => {
        if (pName !== projectNameRef.current || busyRef.current) return;
        const loaded = (d.messages ?? []).map((m) => ({ id: uid(), role: m.role, text: m.text }));
        if (loaded.length > 0) setMessages(loaded);
      })
      .catch(() => {});
  };

  // Sends the auto-prompt (fix request or Home's initial idea) once idle
  useEffect(() => {
    if (!autoPrompt || busy) return;
    onAutoPromptConsumed?.();
    send(autoPrompt);
  }, [autoPrompt, busy]); // eslint-disable-line react-hooks/exhaustive-deps

  // Précharge le composer depuis la sélection clic→source (#5) — SANS envoyer :
  // l'utilisateur complète par le changement voulu, puis envoie lui-même.
  useEffect(() => {
    if (!seedInput) return;
    onSeedConsumed?.();
    setInput(seedInput);
    const el = inputRef.current;
    if (el) {
      el.focus();
      requestAnimationFrame(() => {
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
        el.setSelectionRange(el.value.length, el.value.length);
      });
    }
  }, [seedInput]); // eslint-disable-line react-hooks/exhaustive-deps

  // #139 Gros Projet — un clic « Construire » sur le Kanban envoie un tour borné
  // (mode projet + id d'incrément). On attend que le chat soit libre avant de
  // consommer la requête (sinon send() avorterait sur busy et on la perdrait).
  useEffect(() => {
    if (!buildRequest || busy) return;
    onBuildConsumed?.();
    send(buildRequest.prompt, { incrementId: buildRequest.incrementId, modeOverride: "projet" });
  }, [buildRequest, busy]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(textArg, opts) {
    // #174 — Expansion de skill : un envoi UTILISATEUR « /slug [args] » dont le
    // slug est connu est remplacé par le corps de la skill (le « /slug » brut
    // n'atteint jamais /api/chat). Fait AVANT tout le reste ; on relance send()
    // avec le texte expansé (traité comme un tour normal). Slug inconnu → on passe.
    const isUserSend = typeof textArg !== "string";
    if (isUserSend && !opts?.skillExpanded && !busy && !expandingRef.current) {
      const raw = input.trim();
      if (raw.startsWith("/")) {
        expandingRef.current = true;
        let expanded = null;
        try { expanded = await maybeExpandSkill(raw); }
        finally { expandingRef.current = false; }
        if (expanded !== null) {
          setInput("");
          setMenuDismissed(true);
          if (inputRef.current) inputRef.current.style.height = "auto";
          return send(expanded, { ...(opts || {}), skillExpanded: true });
        }
      }
    }
    const typed = (typeof textArg === "string" ? textArg : input).trim();
    // Auto-prompts (fix requests) never carry attachments
    const files = typeof textArg === "string" ? [] : attachments;
    if ((!typed && files.length === 0) || busy) return;
    // #139 Gros Projet : un build d'incrément force mode "projet" et joint l'id
    // de l'incrément (réconcilié côté serveur après commit).
    const turnMode = opts?.modeOverride ?? mode;
    const turnIncrementId = opts?.incrementId;
    // Planifier : piloté par l'ACTION active (plus par le modèle) → marche quel que
    // soit le modèle choisi pour le bouton, GLM compris.
    const isPlanner = activeAction === "planifier";
    const wasPlanPhase = isPlanner && !awaitingPlanConfirm;
    if (awaitingPlanConfirm) setAwaitingPlanConfirm(false);
    // Tour Discuter (lecture seule) lancé par l'utilisateur → on pourra proposer
    // « Appliquer ». Tout autre envoi (build, auto-prompt) efface la proposition.
    const wasDiscuter = activeAction === "discuter" && !opts?.modeOverride && typeof textArg !== "string";
    if (awaitingApply) setAwaitingApply(false);
    // Cible d'édition visuelle (#6) : seulement pour un envoi utilisateur (pas un
    // auto-prompt), capturée puis consommée pour ce message.
    const useEdit = typeof textArg !== "string" ? editTarget : null;
    if (typeof textArg !== "string") {
      setInput("");
      setAttachments([]);
      if (inputRef.current) inputRef.current.style.height = "auto";
      if (useEdit) onEditTargetConsumed?.();
    }
    setBusy(true);

    try {
      // Upload attachments first; their paths are prepended to the prompt so
      // the agent opens them: Read for PNG/JPEG/PDF, lire_document for Office/text,
      // lire_archive for .zip/.rar.
      let prompt = typed || "Analyse les fichiers joints et dis-moi ce que tu en comprends.";
      if (contextFile) {
        prompt = `[Contexte fichier : ${contextFile}]\n\n${prompt}`;
        setContextFile(null);
      }
      if (files.length > 0) {
        const paths = [];
        for (const f of files) {
          const r = await fetch(
            `/api/upload/${encodeURIComponent(projectName)}?filename=${encodeURIComponent(f.name || "collage.png")}`,
            { method: "POST", body: f },
          );
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d.error ?? `Échec de l'envoi de ${f.name}`);
          paths.push(d.path);
        }
        prompt = `[Fichiers joints : ${paths.join(", ")}]\n\n${prompt}`;
      }
      push({ role: "user", text: prompt });
      const apiPrompt = wasPlanPhase
        ? `${prompt}\n\n---\n**MODE PLANIFICATION** : Ne génère pas de code maintenant. Présente uniquement le plan d'implémentation : architecture des composants, pages/routes, étapes de build, choix techniques clés. J'enverrai une confirmation avant que tu commences à coder.`
        : prompt;

      // AbortController : le clic « Stop » avorte ce fetch → la lecture du flux SSE
      // s'arrête NET et la main revient à l'utilisateur tout de suite, sans attendre
      // la fin de la requête. Le POST /api/stop (bouton) arrête en parallèle le
      // travail côté serveur (Claude ET Élève).
      const controller = new AbortController();
      abortRef.current = controller;
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          prompt: apiPrompt,
          projectName,
          model,
          mode: turnMode,
          intention: activeAction, // Phase E2 — routage multi-cerveaux (construire|planifier|discuter)
          template: template || undefined,
          sessionId: sessionRef.current ?? undefined,
          editTarget: useEdit ?? undefined,
          tutorialId: tutorialId ?? undefined,
          clientMode: clientMode || undefined,
          styleStrength: styleStrength !== 100 ? styleStrength : undefined,
          incrementId: turnIncrementId ?? undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        // 409 = l'agent est DÉJÀ au travail (notre tour, ou un autre acteur : session
        // automatique, run nocturne…). Ce n'est pas une erreur : message DOUX (pas de
        // rouge), on RESTAURE le texte tapé (ne pas le perdre) et on reflète l'état
        // « occupé » → l'indicateur de réflexion s'affiche, l'utilisateur sait d'attendre.
        if (res.status === 409) {
          setExternalBusy(true);
          if (typeof textArg !== "string") setInput(typed);
          push({ role: "status", text: "⏳ L'agent travaille encore — ta demande n'a pas été envoyée. Attends la fin de la réflexion (indicateur ci-dessus) puis renvoie." });
        } else {
          push({ role: "error", text: err.error ?? `Erreur HTTP ${res.status}` });
        }
        return;
      }

      // Parse the SSE stream manually
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop();
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;
          handleEvent(JSON.parse(line.slice(6)));
        }
      }
    } catch (err) {
      // Arrêt volontaire (clic « Stop » → controller.abort()) : ce n'est pas une
      // erreur, on ne pollue pas le fil. Le serveur a reçu /api/stop en parallèle.
      if (err?.name === "AbortError") {
        push({ role: "status", text: "⏹ Arrêté — ce qui était fait est conservé, relance-moi pour continuer." });
      } else {
        push({ role: "error", text: String(err) });
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      if (wasPlanPhase) setAwaitingPlanConfirm(true);
      if (wasDiscuter) setAwaitingApply(true);
      onAgentDone();
      // Surface the background agents' status lines (review + patrol #73 +
      // Mango QA verdict) once they've had time to finish, without keeping the
      // stream open. The later delays cover slow QA audits (~143s on big
      // projects) that the 6s/14s window would miss. refetchHistory is guarded
      // (same project + idle), so the late re-fetches are no-ops if irrelevant.
      const pName = projectName;
      [6000, 14000, 30000, 60000, 90000, 130000, 180000, 240000].forEach((d) =>
        setTimeout(() => refetchHistory(pName), d),
      );
    }
  }

  function handleEvent(ev) {
    switch (ev.type) {
      case "status":
        push({ role: "status", text: ev.text });
        break;
      case "diff":
        push({ role: "diff", before: ev.before, after: ev.after });
        break;
      case "preview":
        onPreviewUrl(ev.url);
        break;
      case "text":
        push({ role: "agent", text: ev.text });
        break;
      case "thinking":
        push({ role: "thinking", text: ev.text });
        break;
      case "tool":
        push({ role: "tool", name: ev.name, detail: ev.detail });
        break;
      case "version":
        push({ role: "version", text: `Version sauvegardée (${ev.hash})` });
        break;
      case "result":
        sessionRef.current = ev.sessionId;
        onCost(ev.costUsd);
        if (ev.contextTokens && ev.contextWindow) {
          onContext?.({ tokens: ev.contextTokens, window: ev.contextWindow });
        }
        if (!ev.ok) push({ role: "error", text: `L'agent s'est arrêté : ${ev.error}` });
        break;
      case "error":
        push({ role: "error", text: ev.message ?? ev.error });
        break;
      // Œil-Coach (#152) — events de la boucle critique → corrige → re-regarde.
      case "start":
        if (ev.threshold) push({ role: "status", text: `👁 Coach design — seuil ${ev.threshold}, jusqu'à ${ev.maxRounds} tour(s)` });
        break;
      case "critique":
        push({ role: "critique", round: ev.round, critique: ev.critique });
        break;
      case "fixes":
        push({ role: "status", text: `🛠 ${ev.fixes.length} correctif(s) prioritaire(s)` });
        break;
      case "done":
        push({ role: "coach-done", before: ev.before, after: ev.after, rounds: ev.rounds, reason: ev.reason });
        break;
      default:
        break;
    }
  }

  // Œil-Coach (#152) — lance la boucle critique→corrige→re-regarde sur le projet ouvert.
  async function coachSend() {
    if (!projectName.trim() || busy) return;
    setBusy(true);
    push({ role: "user", text: "👁 Coach design — critique → corrige → re-regarde" });
    try {
      const res = await fetch(`/api/design-coach/${encodeURIComponent(projectName)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        push({ role: "error", text: e.error ?? `Erreur HTTP ${res.status}` });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop();
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;
          handleEvent(JSON.parse(line.slice(6)));
        }
      }
    } catch (err) {
      push({ role: "error", text: String(err) });
    } finally {
      setBusy(false);
    }
  }

  function autoGrow(e) {
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  async function toggleMic() {
    if (listening) {
      mediaRecorderRef.current?.stop();
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onToast("error", "Micro indisponible — autorisation refusée ou aucun micro détecté.");
      return;
    }
    audioChunksRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setListening(false);
      setTranscribing(true);
      try {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const form = new FormData();
        form.append("audio", blob, "record.webm");
        const res = await fetch("/api/transcribe", { method: "POST", body: form });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          onToast("error", err.error ? `Transcription échouée : ${err.error}` : `Transcription échouée (HTTP ${res.status}).`);
        } else {
          const data = await res.json().catch(() => ({}));
          if (data.text?.trim()) setInput((prev) => (prev ? prev + " " + data.text : data.text));
          else onToast("error", "Rien n'a été transcrit — réessaie en parlant plus distinctement.");
        }
      } catch {
        onToast("error", "Transcription échouée — serveur injoignable ?");
      }
      setTranscribing(false);
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
    setListening(true);
  }

  // Phase C2 — callbacks passés aux blocs extraits (ChatMessages / ChatComposer).
  // « Confirmer et construire » après un plan validé.
  const confirmPlan = () => {
    setAwaitingPlanConfirm(false);
    setActiveAction("construire");
    onChatMode({ model: actionModels.construire, mode: "elite" });
    setInput("Confirmé — construis maintenant selon ce plan.");
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  // Applique le correctif diagnostiqué en mode Discuter : on embarque le diagnostic
  // (dernier message de l'agent) pour que le chemin Construire soit auto-suffisant.
  const applyDiagnosedFix = () => {
    setAwaitingApply(false);
    setActiveAction("construire");
    onChatMode({ model: actionModels.construire, mode: "elite" });
    const diagnosis = [...messages].reverse().find((mm) => mm.role === "agent")?.text ?? "";
    send(
      `Applique RÉELLEMENT dans le code le correctif diagnostiqué ci-dessous (write_file / edit_file), puis vérifie le build (check_build). Ne te contente pas de le re-décrire — fais la modification, puis finish.\n\n--- Correctif à appliquer ---\n${diagnosis}`,
      { modeOverride: "elite" },
    );
  };
  // 1) avorte le flux côté client → la main revient tout de suite ;
  // 2) prévient le serveur d'arrêter le travail (Claude + Élève).
  const stopAgent = () => {
    abortRef.current?.abort();
    fetch("/api/stop", { method: "POST" }).catch(() => {});
  };

  return (
    <section className="flex w-2/5 min-w-[360px] flex-col border-r border-edge bg-panel">
      {snapMode && (
        <div
          className="fixed inset-0 z-50 cursor-crosshair bg-black/30"
          onMouseDown={(e) => {
            snapStart.current = { x: e.clientX, y: e.clientY };
            setSnapRect({ x: e.clientX, y: e.clientY, w: 0, h: 0 });
          }}
          onMouseMove={(e) => {
            const s = snapStart.current;
            if (!s) return;
            setSnapRect({
              x: Math.min(s.x, e.clientX),
              y: Math.min(s.y, e.clientY),
              w: Math.abs(e.clientX - s.x),
              h: Math.abs(e.clientY - s.y),
            });
          }}
          onMouseUp={finishSnap}
        >
          <div className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-xl border border-edge bg-panel px-4 py-2 text-sm text-dim shadow-lg">
            Glisse pour capturer une zone de l'aperçu — Échap pour annuler
          </div>
          {snapRect && snapRect.w > 0 && (
            <div
              className="pointer-events-none absolute border-2 border-accent bg-accent/10"
              style={{ left: snapRect.x, top: snapRect.y, width: snapRect.w, height: snapRect.h }}
            />
          )}
        </div>
      )}
      <ChatMessages
        listRef={listRef}
        grouped={grouped}
        empty={messages.length === 0 && !busy}
        busy={busy}
        working={working}
        showThinking={showThinking}
        onFeedback={handleFeedback}
        onReuse={handleReuse}
        nocturnalEntry={nocturnalEntry}
        onToast={onToast}
        onReviewed={onReviewed}
        question={question}
        onAnswer={answerConfirm}
        awaitingPlanConfirm={awaitingPlanConfirm}
        onConfirmPlan={confirmPlan}
        awaitingApply={awaitingApply}
        onApplyFix={applyDiagnosedFix}
      />

      <ChatComposer
        input={input}
        setInput={setInput}
        inputRef={inputRef}
        autoGrow={autoGrow}
        placeholder={working ? "⏳ L'agent travaille — patiente la fin de la réflexion…" : "Décris ton app ou demande une modification…"}
        busy={busy}
        working={working}
        externalBusy={externalBusy}
        canSend={!!input.trim() || attachments.length > 0}
        onSend={send}
        onStop={stopAgent}
        skill={{
          menuOpen: skillMenuOpen,
          suggestions: skillSuggestions,
          activeIndex: menuActive,
          setActiveIndex: setMenuActive,
          complete: completeSkill,
          dismiss: () => setMenuDismissed(true),
        }}
        files={{
          attachments,
          removeAttachment: (i) => setAttachments((prev) => prev.filter((_, j) => j !== i)),
          addFiles,
          fileRef,
          contextFile,
          clearContextFile: () => setContextFile(null),
          picker: filePicker,
          setPicker: setFilePicker,
          pickerRef,
          list: fileList,
          search: fileSearch,
          setSearch: setFileSearch,
          pickContextFile: (f) => { setContextFile(f); setFilePicker(false); },
        }}
        actions={{ activeAction, actionModels, modelMenuFor, pickAction, setModelMenuFor, setActionModel }}
        snap={{ start: () => setSnapMode(true), busy: snapBusy }}
        onCoach={coachSend}
        coachDisabled={!projectName.trim()}
        mic={{ toggle: toggleMic, listening, transcribing }}
      />
    </section>
  );
}


// Phase C2 — `Message` vit désormais dans components/chat/Message.jsx ;
// ré-exporté ici pour ne casser aucun consommateur (tests).
export { Message } from "./components/chat/Message.jsx";
