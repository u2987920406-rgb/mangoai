// Vignette d'une pièce jointe du composer — extraite de Chat.jsx (Phase C).
import { useEffect, useState } from "react";
import { Paperclip } from "lucide-react";

export default function AttachmentThumb({ file }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!file.type?.startsWith("image/")) return undefined;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  if (!url) return <Paperclip size={10} className="shrink-0 text-accent-soft" />;
  return <img src={url} alt="" className="h-5 w-5 shrink-0 rounded object-cover" />;
}
