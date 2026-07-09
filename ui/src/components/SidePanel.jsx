import { useState } from 'react'
import { X, Sliders } from 'lucide-react'
import { TABS } from './side-panel/constants.js'
import TypoTab from './side-panel/TypoTab.jsx'
import ColorsTab from './side-panel/ColorsTab.jsx'
import ElementsTab from './side-panel/ElementsTab.jsx'
import SkillsTab from './side-panel/SkillsTab.jsx'
import { useTypoEditor } from '../hooks/useTypoEditor.js'
import { useColorsEditor } from '../hooks/useColorsEditor.js'
import { useElementsInspector } from '../hooks/useElementsInspector.js'
import { useSkillsManager } from '../hooks/useSkillsManager.js'

export default function SidePanel({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('typo')

  const typo = useTypoEditor()
  const colors = useColorsEditor()
  const elements = useElementsInspector(isOpen)
  const skillsMgr = useSkillsManager(activeTab)

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        width: 288,
        top: '50%',
        transform: 'translateY(-50%)',
        right: 0,
        zIndex: 50,
      }}
      className="bg-panel shadow-2xl rounded-l-2xl border-l border-edge"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
        <span className="text-sm font-semibold text-ink flex items-center gap-2">
          <Sliders size={14} className="text-accent" />
          Éditeur visuel
        </span>
        <button
          onClick={onClose}
          className="text-dim hover:text-ink transition-colors"
          aria-label="Fermer"
        >
          <X size={16} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-3 pt-3">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-1 flex items-center justify-center gap-1 text-xs py-1.5 px-2 rounded-lg font-medium transition-colors ${
              activeTab === id
                ? 'bg-accent/15 text-accent'
                : 'text-dim hover:text-ink'
            }`}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-4 space-y-4">

        {/* ─── Typo ─── */}
        {activeTab === 'typo' && (
          <TypoTab
            fontSize={typo.fontSize}
            setFontSize={typo.setFontSize}
            fontFamily={typo.fontFamily}
            setFontFamily={typo.setFontFamily}
            resetTypo={typo.resetTypo}
          />
        )}

        {/* ─── Couleurs ─── */}
        {activeTab === 'couleurs' && (
          <ColorsTab
            colorPrimary={colors.colorPrimary}
            setColorPrimary={colors.setColorPrimary}
            colorBg={colors.colorBg}
            setColorBg={colors.setColorBg}
            colorText={colors.colorText}
            setColorText={colors.setColorText}
            applyPalette={colors.applyPalette}
            resetColors={colors.resetColors}
          />
        )}

        {/* ─── Éléments ─── */}
        {activeTab === 'elements' && (
          <ElementsTab
            inspectActive={elements.inspectActive}
            inspectError={elements.inspectError}
            recentElements={elements.recentElements}
            hoveredInfo={elements.hoveredInfo}
            toggleInspect={elements.toggleInspect}
          />
        )}

        {/* ─── Skills ─── */}
        {activeTab === 'skills' && (
          <SkillsTab
            skills={skillsMgr.skills}
            skillsLoading={skillsMgr.skillsLoading}
            skillsError={skillsMgr.skillsError}
            skillName={skillsMgr.skillName}
            setSkillName={skillsMgr.setSkillName}
            skillDescription={skillsMgr.skillDescription}
            setSkillDescription={skillsMgr.setSkillDescription}
            skillContent={skillsMgr.skillContent}
            setSkillContent={skillsMgr.setSkillContent}
            skillCreateError={skillsMgr.skillCreateError}
            skillCreating={skillsMgr.skillCreating}
            createSkill={skillsMgr.createSkill}
            deleteSkill={skillsMgr.deleteSkill}
          />
        )}

      </div>
    </div>
  )
}
