import { useState, useRef } from "react";
import { ArrowLeft, Wand2, Loader2, GitMerge, Trash2, ShieldCheck, FlaskConical, FileCode } from "lucide-react";

// Atelier de Mango — lancer un chantier d'auto-amélioration depuis l'UI (barreaux 1-4).
// Mango travaille sur SON propre code dans une COPIE ISOLÉE (git worktree), s'auto-vérifie
// (tsc + tests en bac à sable), puis on relit le DIFF et on Fusionne / Jette. Rien n'est
// poussé : « Fusionner » écrit les fichiers dans le repo (à committer ensuite à la main).

function DiffView({ patch }) {
  const lines = patch.split("\n");
  return (
    <pre className="max-h-[420px] overflow-auto nice-scroll rounded-lg border border-edge bg-panel/60 p-3 text-[11.5px] leading-relaxed">
      {lines.map((l, i) => {
        const cls = l.startsWith("+") && !l.startsWith("+++") ? "text-emerald-400"
          : l.startsWith("-") && !l.startsWith("---") ? "text-rose-400"
          : l.startsWith("@@") ? "text-accent"
          : l.startsWith("diff ") || l.startsWith("index ") ? "text-faint" : "text-dim";
        return <div key={i} className={cls}>{l || " "}</div>;
      })}
    </pre>
  );
}

export default function AtelierMango({ onBack }) {
  const [task, setTask] = useState("");
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busyAction, setBusyAction] = useState(false);
  const [flash, setFlash] = useState(null);
  const logRef = useRef(null);

  function pushLog(text) {
    setLog((l) => [...l, text]);
    requestAnimationFrame(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; });
  }

  async function lancer() {
    if (!task.trim() || running) return;
    setRunning(true); setLog([]); setResult(null); setError(null); setFlash(null);
    try {
      const res = await fetch("/api/self/run", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: task.trim() }),
      });
      if (!res.ok && res.status === 409) { setError("Un chantier est déjà en cours."); setRunning(false); return; }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.replace(/^data:\s*/, "");
          if (!line) continue;
          try {
            const evt = JSON.parse(line);
            if (evt.type === "log") pushLog(evt.text);
            else if (evt.type === "done") setResult(evt);
            else if (evt.type === "error") setError(evt.error);
          } catch { /* event partiel */ }
        }
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  async function fusionner() {
    if (!result || busyAction) return;
    setBusyAction(true);
    try {
      const res = await fetch("/api/self/merge", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worktree: result.worktree, branch: result.branch, files: result.files }),
      });
      const d = await res.json();
      if (d.ok) { setFlash(`✅ Fusionné dans le repo : ${d.merged.join(", ")}. À committer quand tu veux.`); setResult(null); setTask(""); }
      else setError(d.error || "fusion échouée");
    } catch (e) { setError(e.message); } finally { setBusyAction(false); }
  }

  async function jeter() {
    if (!result || busyAction) return;
    setBusyAction(true);
    try {
      await fetch("/api/self/discard", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worktree: result.worktree, branch: result.branch }),
      });
      setFlash("🗑️ Copie isolée jetée. Le repo vivant n'a pas bougé.");
      setResult(null);
    } catch (e) { setError(e.message); } finally { setBusyAction(false); }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-edge px-6 py-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-dim hover:text-ink transition-colors">
          <ArrowLeft size={16} /> Accueil
        </button>
        <Wand2 size={16} className="text-accent" />
        <span className="text-sm font-semibold text-ink">Atelier de Mango — auto-amélioration</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto nice-scroll px-6 py-5">
        {/* Explication / garde-fous */}
        <div className="mb-5 rounded-xl border border-edge bg-panel/40 p-4 text-[13px] leading-relaxed text-dim">
          <p className="mb-1.5 font-semibold text-ink">Mango améliore son PROPRE code — en sécurité.</p>
          Il travaille dans une <strong className="text-ink">copie isolée</strong> (jamais le code qui tourne), s'auto-vérifie
          (<span className="text-ink">type-check</span> + <span className="text-ink">tests en bac à sable</span>), puis tu relis le
          <strong className="text-ink"> diff</strong> et tu décides : <strong className="text-ink">Fusionner</strong> ou <strong className="text-ink">Jeter</strong>.
          « Fusionner » écrit les fichiers dans le repo (à committer ensuite). Idéal : un chantier <strong className="text-ink">borné</strong>
          (une fonction utilitaire, un test manquant…). Coût : jetons cloud GLM.
        </div>

        {flash && <div className="mb-4 rounded-lg border border-edge bg-emerald-500/10 px-3 py-2 text-[13px] text-emerald-300">{flash}</div>}

        {/* Saisie + lancer */}
        <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-faint">Décris le chantier</label>
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          disabled={running}
          rows={4}
          placeholder="ex. Ajoute une fonction pure `clamp(n, min, max)` à server/src/… avec son test, sur le modèle des fonctions voisines."
          className="w-full resize-y rounded-lg border border-edge bg-panel/60 px-3 py-2.5 text-[13px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={lancer}
            disabled={running || !task.trim()}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white transition-opacity disabled:opacity-40"
          >
            {running ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
            {running ? "Mango travaille…" : "Lancer le chantier"}
          </button>
          {running && <span className="text-[12px] text-faint">copie isolée · le repo vivant n'est pas touché</span>}
        </div>

        {/* Log live */}
        {(running || log.length > 0) && (
          <div ref={logRef} className="mt-4 max-h-56 overflow-auto nice-scroll rounded-lg border border-edge bg-panel/40 p-3 font-mono text-[11.5px] text-dim">
            {log.map((l, i) => <div key={i} className="whitespace-pre-wrap">{l}</div>)}
          </div>
        )}

        {error && <div className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[13px] text-rose-300">⚠ {error}</div>}

        {/* Résultat + diff + actions */}
        {result && (
          <div className="mt-5">
            {(() => {
              // Badges HONNÊTES (#atelier) : le verify de clôture reflète l'état FINAL réel.
              // 3 états — vert ✓ (vérifié OK) · rouge ✗ (vérifié ÉCHOUÉ) · gris — (non vérifié).
              const v = result.verify;
              const typeState = v?.ran ? (v.typesOk ? "ok" : "ko") : (result.usedChecks ? "ok" : "none");
              const testState = v?.ran ? (v.testsOk ? "ok" : "ko") : (result.usedTests ? "ok" : "none");
              const cls = (s) => (s === "ok" ? "bg-emerald-500/15 text-emerald-300" : s === "ko" ? "bg-red-500/15 text-red-300" : "bg-edge-soft text-faint");
              const mark = (s) => (s === "ok" ? "✓" : s === "ko" ? "✗" : "—");
              return (
                <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px]">
                  <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${cls(typeState)}`}>
                    <ShieldCheck size={12} /> type-check {mark(typeState)}
                  </span>
                  <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${cls(testState)}`}>
                    <FlaskConical size={12} /> tests (bac à sable) {mark(testState)}
                  </span>
                  {result.files?.map((f) => (
                    <span key={f} className="flex items-center gap-1 rounded-full bg-edge-soft px-2 py-0.5 text-dim"><FileCode size={12} /> {f}</span>
                  ))}
                </div>
              );
            })()}

            {/* Clôture ROUGE : prévient AVANT de fusionner (le badge honnête reflète l'état final réel). */}
            {result.verify?.ran && (!result.verify.typesOk || !result.verify.testsOk) && (
              <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/[0.07] px-3 py-2 text-[12.5px] text-red-300">
                <p className="mb-1 font-semibold">⚠ Ce chantier n'est PAS vert sur l'état final — le fusionner cassera le repo.</p>
                {!result.verify.typesOk && result.verify.typesOutput && (
                  <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-black/30 p-2 text-[11px] text-red-200">{result.verify.typesOutput}</pre>
                )}
                {result.verify.tests?.filter((t) => !t.ok).map((t) => (
                  <div key={t.file} className="mt-1">
                    <span className="font-mono text-[11px]">✗ {t.file}</span>
                    <pre className="mt-0.5 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-black/30 p-2 text-[11px] text-red-200">{t.output}</pre>
                  </div>
                ))}
                <p className="mt-1.5 text-[11.5px] text-red-300/80">Renvoie Mango corriger, ou fusionne puis corrige à la main (le repo doit rester vert).</p>
              </div>
            )}

            {result.summary && (
              <p className="mb-3 whitespace-pre-wrap rounded-lg border border-edge bg-panel/40 px-3 py-2 text-[13px] text-dim">{result.summary}</p>
            )}

            {result.patch ? <DiffView patch={result.patch} /> : <p className="text-[13px] text-faint">Diff vide (Mango n'a rien changé).</p>}

            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={fusionner}
                disabled={busyAction || !result.files?.length}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-[13px] font-semibold text-white transition-opacity disabled:opacity-40"
              >
                <GitMerge size={15} /> Fusionner dans le repo
              </button>
              <button
                onClick={jeter}
                disabled={busyAction}
                className="flex items-center gap-2 rounded-lg border border-edge px-4 py-2 text-[13px] font-medium text-dim transition-colors hover:bg-edge-soft hover:text-ink disabled:opacity-40"
              >
                <Trash2 size={15} /> Jeter
              </button>
              <span className="text-[12px] text-faint">branche : {result.branch}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
