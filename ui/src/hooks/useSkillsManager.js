import { useState, useEffect } from 'react'

// Onglet Skills du SidePanel : CRUD des skills exposés via l'API backend.
export function useSkillsManager(activeTab) {
  const [skills, setSkills] = useState([])
  const [skillsLoading, setSkillsLoading] = useState(false)
  const [skillsError, setSkillsError] = useState(null)
  const [skillName, setSkillName] = useState('')
  const [skillDescription, setSkillDescription] = useState('')
  const [skillContent, setSkillContent] = useState('')
  const [skillCreateError, setSkillCreateError] = useState(null)
  const [skillCreating, setSkillCreating] = useState(false)

  function loadSkills() {
    setSkillsLoading(true)
    setSkillsError(null)
    fetch('http://localhost:3000/api/skills')
      .then(r => r.json())
      .then(data => {
        setSkills(data.skills ?? [])
        setSkillsLoading(false)
      })
      .catch(err => {
        setSkillsError(err.message)
        setSkillsLoading(false)
      })
  }

  useEffect(() => {
    if (activeTab === 'skills') loadSkills()
  }, [activeTab])

  async function createSkill() {
    setSkillCreateError(null)
    if (!skillName.trim() || !skillContent.trim()) {
      setSkillCreateError('Le nom et le contenu sont obligatoires.')
      return
    }
    setSkillCreating(true)
    try {
      const res = await fetch('http://localhost:3000/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: skillName.trim(), description: skillDescription.trim(), content: skillContent.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSkillCreateError(data.error ?? 'Erreur inconnue')
      } else {
        setSkillName('')
        setSkillDescription('')
        setSkillContent('')
        loadSkills()
      }
    } catch (err) {
      setSkillCreateError(err.message)
    } finally {
      setSkillCreating(false)
    }
  }

  async function deleteSkill(name) {
    try {
      await fetch(`http://localhost:3000/api/skills/${encodeURIComponent(name)}`, { method: 'DELETE' })
      loadSkills()
    } catch {
      // silently ignore
    }
  }

  return {
    skills, skillsLoading, skillsError,
    skillName, setSkillName,
    skillDescription, setSkillDescription,
    skillContent, setSkillContent,
    skillCreateError, skillCreating,
    createSkill, deleteSkill,
  }
}
