// ─── Moteur de synthèse vocale (voix homme/femme) ────────────────────────────
// Centralise toute la logique SpeechSynthesis. Sélectionne une voix masculine ou
// féminine anglaise, et joue les conversations Part 3 ligne par ligne en
// alternant les voix selon le genre du locuteur. $0, hors-ligne, souverain.
//
// Robustesse navigateur :
//   • getVoices() est async sur Chrome → on attend l'événement 'voiceschanged'.
//   • onend est peu fiable sur longs textes → watchdog temporel de secours.
//   • Chrome met en pause la synthèse après ~15 s → resume() périodique.

const hasSpeech = typeof window !== "undefined" && "speechSynthesis" in window;

// Heuristiques de genre par nom de voix (couvre Windows/Edge, macOS, Chrome OS).
const FEMALE_HINTS = ["zira", "samantha", "susan", "hazel", "aria", "jenny", "michelle", "female", "linda", "heera", "catherine", "fiona", "moira", "tessa", "karen", "serena", "google uk english female"];
const MALE_HINTS = ["david", "mark", "george", "daniel", "alex", "guy", "james", "ryan", "fred", "male", "tom", "oliver", "arthur", "google uk english male"];

let voicesCache = null;

// Si le navigateur charge de nouvelles voix APRÈS coup, on invalide les caches
// (Chrome émet parfois voiceschanged tardivement avec une liste plus riche).
if (hasSpeech) {
  window.speechSynthesis.addEventListener?.("voiceschanged", () => {
    const v = window.speechSynthesis.getVoices();
    if (v && v.length && (!voicesCache || v.length !== voicesCache.length)) {
      voicesCache = v;
      voicePair = null;
    }
  });
}

// Charge les voix (résout dès qu'elles sont disponibles, timeout 1 s).
export function loadVoices() {
  if (!hasSpeech) return Promise.resolve([]);
  if (voicesCache && voicesCache.length) return Promise.resolve(voicesCache);
  return new Promise((resolve) => {
    const tryGet = () => {
      const v = window.speechSynthesis.getVoices();
      if (v && v.length) {
        voicesCache = v;
        resolve(v);
        return true;
      }
      return false;
    };
    if (tryGet()) return;
    let settled = false;
    const onChange = () => {
      if (settled) return;
      if (tryGet()) {
        settled = true;
        window.speechSynthesis.removeEventListener("voiceschanged", onChange);
      }
    };
    window.speechSynthesis.addEventListener("voiceschanged", onChange);
    setTimeout(() => {
      if (settled) return;
      settled = true;
      window.speechSynthesis.removeEventListener("voiceschanged", onChange);
      voicesCache = window.speechSynthesis.getVoices() || [];
      resolve(voicesCache);
    }, 1000);
  });
}

function scoreVoiceForGender(voice, gender) {
  const name = (voice.name || "").toLowerCase();
  const hints = gender === "male" ? MALE_HINTS : FEMALE_HINTS;
  const anti = gender === "male" ? FEMALE_HINTS : MALE_HINTS;
  if (hints.some((h) => name.includes(h))) return 2;
  if (anti.some((h) => name.includes(h))) return -1;
  return 0;
}

// Résout UNE FOIS la paire de voix {female, male} — GARANTIES DISTINCTES dès que
// le navigateur expose au moins 2 voix anglaises. L'ancienne heuristique choisissait
// chaque genre indépendamment : selon l'OS, homme et femme finissaient sur la MÊME
// voix (dialogue P3 inaudible). Ici on classe les voix pour chaque genre, on prend
// la meilleure femme, puis le meilleur homme PARMI LES VOIX RESTANTES.
let voicePair = null;
export function resolveVoicePair(voices, langPref = ["en-us", "en-gb", "en"]) {
  if (voicePair) return voicePair;
  if (!voices || !voices.length) return { female: null, male: null };

  const english = voices.filter((v) => (v.lang || "").toLowerCase().startsWith("en"));
  const pool = english.length ? english : voices;

  const langScore = (v) => {
    const lang = (v.lang || "").toLowerCase();
    for (let i = 0; i < langPref.length; i++) {
      if (lang === langPref[i] || lang.startsWith(langPref[i])) return langPref.length - i;
    }
    return 0;
  };
  const rankFor = (gender) =>
    pool
      .map((v) => ({ v, score: scoreVoiceForGender(v, gender) * 10 + langScore(v) }))
      .sort((a, b) => b.score - a.score);

  const female = rankFor("female")[0]?.v || null;
  // Meilleur candidat masculin EXCLUANT la voix féminine choisie → toujours distinct.
  const maleRanked = rankFor("male").filter((r) => r.v !== female);
  const male = maleRanked[0]?.v || female; // 1 seule voix dispo → on assume (fallback lisible : transcript).

  voicePair = { female, male };
  return voicePair;
}

// API historique : voix pour un genre donné (s'appuie sur la paire distincte).
export function pickVoice(voices, gender) {
  const pair = resolveVoicePair(voices);
  return gender === "male" ? pair.male : pair.female;
}

export function cancelSpeech() {
  if (!hasSpeech) return;
  try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
}

// Maintient la synthèse active (contourne la pause auto de Chrome).
function keepAlive() {
  if (!hasSpeech) return () => {};
  const id = setInterval(() => {
    try {
      if (window.speechSynthesis.speaking) window.speechSynthesis.resume();
    } catch { /* ignore */ }
  }, 10000);
  return () => clearInterval(id);
}

// Lit UNE ligne (P1/P2/P4). Renvoie { cancel() }.
export function speakLine(text, { gender = "female", rate = 0.9, lang = "en-US", onEnd } = {}) {
  if (!hasSpeech || !text) { onEnd?.(); return { cancel() {} }; }
  cancelSpeech();
  let done = false;
  const stopKeep = keepAlive();
  const finish = () => {
    if (done) return;
    done = true;
    stopKeep();
    clearTimeout(watchdog);
    onEnd?.();
  };
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = rate;
  utter.lang = lang;
  utter.onend = finish;
  utter.onerror = finish;
  loadVoices().then((voices) => {
    if (done) return;
    const v = pickVoice(voices, gender);
    if (v) { utter.voice = v; utter.lang = v.lang || lang; }
    window.speechSynthesis.speak(utter);
  });
  // Watchdog : si onend ne se déclenche pas, force la fin.
  const watchdog = setTimeout(finish, Math.max(2500, text.length * 90 + 1500));
  return {
    cancel() { done = true; stopKeep(); clearTimeout(watchdog); cancelSpeech(); },
  };
}

// Lit une SÉQUENCE de répliques (P3), en alternant les voix par genre.
//   lines : [{ text, gender, speaker }]
//   callbacks : onLineStart(index), onLineEnd(index), onDone()
// Renvoie { cancel() }.
export function speakSequence(lines, { rate = 0.9, gap = 350, lang = "en-US", onLineStart, onLineEnd, onDone } = {}) {
  if (!hasSpeech || !Array.isArray(lines) || !lines.length) { onDone?.(); return { cancel() {} }; }
  cancelSpeech();
  let cancelled = false;
  let i = 0;
  const stopKeep = keepAlive();

  const playNext = () => {
    if (cancelled) return;
    if (i >= lines.length) { stopKeep(); onDone?.(); return; }
    const line = lines[i];
    onLineStart?.(i);
    let advanced = false;
    const advance = () => {
      if (advanced || cancelled) return;
      advanced = true;
      clearTimeout(watchdog);
      onLineEnd?.(i);
      i += 1;
      setTimeout(playNext, gap);
    };
    const utter = new SpeechSynthesisUtterance(line.text);
    utter.rate = rate;
    utter.lang = lang;
    utter.onend = advance;
    utter.onerror = advance;
    loadVoices().then((voices) => {
      if (cancelled) return;
      const v = pickVoice(voices, line.gender || "female");
      if (v) { utter.voice = v; utter.lang = v.lang || lang; }
      window.speechSynthesis.speak(utter);
    });
    const watchdog = setTimeout(advance, Math.max(2500, line.text.length * 90 + 1500));
  };

  playNext();
  return {
    cancel() { cancelled = true; stopKeep(); cancelSpeech(); },
  };
}

// Le navigateur supporte-t-il la synthèse vocale ?
export function speechSupported() {
  return hasSpeech;
}
