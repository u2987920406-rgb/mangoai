// Utilitaires DOM partagés du SidePanel — injection de styles dans l'iframe d'aperçu.

export function getIframeDoc() {
  try { return document.querySelector('iframe')?.contentDocument ?? null }
  catch { return null }
}

export function injectStyle(id, css) {
  const doc = getIframeDoc()
  if (!doc) return
  let el = doc.getElementById('mango-panel-' + id)
  if (!el) { el = doc.createElement('style'); el.id = 'mango-panel-' + id; doc.head.appendChild(el) }
  el.textContent = css
}

export function removeStyle(id) {
  const doc = getIframeDoc()
  if (!doc) return
  const el = doc.getElementById('mango-panel-' + id)
  if (el) el.remove()
}
