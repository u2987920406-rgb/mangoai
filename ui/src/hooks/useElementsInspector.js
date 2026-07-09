import { useState, useEffect, useRef } from 'react'
import { getIframeDoc } from '../components/side-panel/domUtils.js'

// Onglet Éléments du SidePanel : survol de l'iframe d'aperçu pour inspecter les nœuds DOM.
export function useElementsInspector(isOpen) {
  const [inspectActive, setInspectActive] = useState(false)
  const [inspectError, setInspectError] = useState(null)
  const [recentElements, setRecentElements] = useState([])
  const [hoveredInfo, setHoveredInfo] = useState(null)
  const cleanupRef = useRef(null)

  function startInspect() {
    setInspectError(null)
    const doc = getIframeDoc()
    if (!doc) {
      setInspectError("L'aperçu est sur un port différent — inspection limitée en cross-origin")
      return
    }

    let lastEl = null

    function onMouseOver(e) {
      if (lastEl) lastEl.style.outline = ''
      lastEl = e.target
      lastEl.style.outline = '2px solid orange'
      const tag = lastEl.tagName.toLowerCase()
      const cls = lastEl.classList[0] ?? ''
      setHoveredInfo(`<${tag}> ${cls}`)
      setRecentElements(prev => {
        const entry = `<${tag}>${cls ? ' .' + cls : ''}`
        const next = [entry, ...prev.filter(x => x !== entry)].slice(0, 5)
        return next
      })
    }

    function onMouseOut(e) {
      if (e.target.style) e.target.style.outline = ''
    }

    doc.addEventListener('mouseover', onMouseOver)
    doc.addEventListener('mouseout', onMouseOut)

    cleanupRef.current = () => {
      doc.removeEventListener('mouseover', onMouseOver)
      doc.removeEventListener('mouseout', onMouseOut)
      if (lastEl) lastEl.style.outline = ''
      setHoveredInfo(null)
    }
  }

  function stopInspect() {
    if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null }
  }

  function toggleInspect() {
    if (inspectActive) {
      stopInspect()
      setInspectActive(false)
    } else {
      setInspectActive(true)
      startInspect()
    }
  }

  // Stop inspect when panel closes
  useEffect(() => {
    if (!isOpen) {
      stopInspect()
      setInspectActive(false)
    }
  }, [isOpen])

  return { inspectActive, inspectError, recentElements, hoveredInfo, toggleInspect }
}
