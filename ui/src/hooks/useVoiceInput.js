import { useRef, useState } from "react";

// Dictée vocale du composer (bouton micro) — extrait de Chat.jsx sans changement
// de comportement : enregistre via MediaRecorder, envoie à /api/transcribe,
// insère le texte transcrit dans le composer.
export function useVoiceInput(setInput, onToast) {
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

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

  return { listening, transcribing, toggleMic };
}
