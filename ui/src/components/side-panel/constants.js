import { Type, Palette, MousePointer2, BookOpen } from 'lucide-react'

export const TABS = [
  { id: 'typo', label: 'Typo', icon: Type },
  { id: 'couleurs', label: 'Couleurs', icon: Palette },
  { id: 'elements', label: 'Éléments', icon: MousePointer2 },
  { id: 'skills', label: 'Skills', icon: BookOpen },
]

export const FONT_FAMILIES = [
  { label: 'Inter', value: '"Inter", sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'JetBrains Mono', value: '"JetBrains Mono", monospace' },
  { label: 'Playfair Display', value: '"Playfair Display", serif' },
]

export const PALETTES = [
  { label: 'Mango', primary: '#FF6B2B', bg: '#1a0a00', text: '#fff8f3' },
  { label: 'Ocean', primary: '#0066cc', bg: '#001a33', text: '#e6f0ff' },
  { label: 'Forest', primary: '#2d8a4e', bg: '#0a1a0e', text: '#e8f5ed' },
  { label: 'Midnight', primary: '#7c3aed', bg: '#0c0a1a', text: '#ede9f8' },
]
