import { useEffect, useState } from 'react';

export default function RuntimeStatus() {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch('/api/runtime');
      if (!res.ok) throw new Error('Diagnostic indisponible');
      setState(await res.json()); setError('');
    } catch { setError('Connexion à Mango indisponible. Relance Mango, puis réessaie.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);
  if (!state?.standalone && !error) return null;
  const incomplete = !state?.qa || !state?.storageWritable;
  return <aside style={{position:'fixed', bottom:16, right:16, zIndex:60, maxWidth:'calc(100vw - 32px)', fontFamily:'system-ui', color:'#242424'}}>
    {open && <div style={{background:'#fff', border:'1px solid #ddd', borderRadius:16, padding:20, width:340, maxWidth:'calc(100vw - 32px)', boxShadow:'0 8px 32px #0002', marginBottom:8}}>
      <h2 style={{fontSize:18, margin:'0 0 12px'}}>État de Mango</h2>
      {error ? <p role="alert">{error}</p> : <>
        <p>{state.storageWritable ? '✓ Tes créations peuvent être enregistrées.' : '⚠ Le dossier de sauvegarde est inaccessible.'}</p>
        <p>{state.qa ? '✓ Le service de contrôle qualité est actif.' : '⚠ Le contrôle qualité est arrêté. Tes créations ne sont pas vérifiées.'}</p>
        <p>{state.ollama.available ? `✓ Ollama répond · ${state.ollama.models.length} modèle(s) disponible(s).` : 'Ollama est déconnecté. Démarre-le si tu utilises ses modèles.'}</p>
        <p style={{fontSize:13, color:'#555'}}>Choisis ton modèle dans Réglages → Intelligence. La connexion Claude se vérifie au premier échange.</p>
      </>}
      <button onClick={refresh} disabled={loading} style={{padding:'8px 12px', borderRadius:8, border:'1px solid #aaa', cursor:'pointer'}}>{loading ? 'Vérification…' : 'Vérifier à nouveau'}</button>
    </div>}
    <button onClick={() => setOpen(v => !v)} aria-expanded={open} style={{display:'block', marginLeft:'auto', padding:'8px 14px', borderRadius:20, background:'#fff', border:'1px solid #bbb', fontSize:13, cursor:'pointer'}}>
      {error || incomplete ? '●' : '✓'} État de Mango
    </button>
  </aside>;
}
