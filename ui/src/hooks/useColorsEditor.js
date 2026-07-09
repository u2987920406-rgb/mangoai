import { useState, useEffect } from 'react'
import { injectStyle, removeStyle } from '../components/side-panel/domUtils.js'

// Onglet Couleurs du SidePanel : palette CSS custom-properties injectée dans l'iframe d'aperçu.
export function useColorsEditor() {
  const [colorPrimary, setColorPrimary] = useState('#6c47ff')
  const [colorBg, setColorBg] = useState('#0e0e11')
  const [colorText, setColorText] = useState('#f0f0f4')

  useEffect(() => {
    injectStyle('colors', `:root { --color-primary: ${colorPrimary}; --bg: ${colorBg}; --ink: ${colorText} }`)
  }, [colorPrimary, colorBg, colorText])

  function applyPalette(p) {
    setColorPrimary(p.primary)
    setColorBg(p.bg)
    setColorText(p.text)
  }

  function resetColors() {
    removeStyle('colors')
    setColorPrimary('#6c47ff')
    setColorBg('#0e0e11')
    setColorText('#f0f0f4')
  }

  return { colorPrimary, setColorPrimary, colorBg, setColorBg, colorText, setColorText, applyPalette, resetColors }
}
