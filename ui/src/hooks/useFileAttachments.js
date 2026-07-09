import { useEffect, useRef, useState } from "react";

// Pièces jointes du composer (drag&drop / collage / bouton trombone) + popover
// « fichier du projet comme contexte ». Extrait de Chat.jsx sans changement de
// comportement.
// Aligné sur ce que Mango sait lire + le backend (server/src/uploads.ts) :
// images · PDF/Office/texte (lire_document) · archives .zip/.rar (lire_archive).
const ACCEPTED = /\.(png|jpe?g|webp|gif|pdf|docx|xlsx|pptx|txt|md|csv|json|zip|rar)$/i;

export function useFileAttachments(projectName) {
  const [attachments, setAttachments] = useState([]); // File[] — images/PDF joints
  const fileRef = useRef(null);
  const [contextFile, setContextFile] = useState(null);   // string | null
  const [filePicker, setFilePicker] = useState(false);    // popover ouvert ?
  const [fileList, setFileList] = useState([]);            // fichiers du projet
  const [fileSearch, setFileSearch] = useState("");
  const pickerRef = useRef(null);

  const addFiles = (files) => {
    const valid = [...files].filter((f) => f && ACCEPTED.test(f.name || ".png"));
    if (valid.length === 0) return;
    setAttachments((prev) => [...prev, ...valid].slice(0, 6));
  };

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

  return {
    attachments, setAttachments,
    fileRef,
    contextFile, setContextFile,
    filePicker, setFilePicker,
    fileList,
    fileSearch, setFileSearch,
    pickerRef,
    addFiles,
  };
}
