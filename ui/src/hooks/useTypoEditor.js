import { useState, useEffect } from 'react'
import { injectStyle, removeStyle } from '../components/side-panel/domUtils.js'
import { FONT_FAMILIES } from '../components/side-panel/constants.js'

// Onglet Typo du SidePanel : taille + famille de police injectées dans l'iframe d'aperçu.
export function useTypoEditor() {
  const [fontSize, setFontSize] = useState(16)
  const [fontFamily, setFontFamily] = useState(FONT_FAMILIES[0].value)

  useEffect(() => {
    injectStyle('font-size', `html { font-size: ${fontSize}px }`)
  }, [fontSize])

  useEffect(() => {
    injectStyle('font-family', `body { font-family: ${fontFamily} }`)
  }, [fontFamily])

  function resetTypo() {
    removeStyle('font-size')
    removeStyle('font-family')
    setFontSize(16)
    setFontFamily(FONT_FAMILIES[0].value)
  }

  return { fontSize, setFontSize, fontFamily, setFontFamily, resetTypo }
}
