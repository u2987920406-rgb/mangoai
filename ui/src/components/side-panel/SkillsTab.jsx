export default function SkillsTab({
  skills, skillsLoading, skillsError,
  skillName, setSkillName,
  skillDescription, setSkillDescription,
  skillContent, setSkillContent,
  skillCreateError, skillCreating,
  createSkill, deleteSkill,
}) {
  return (
    <>
      {/* Liste des skills */}
      {skillsLoading && (
        <p className="text-xs text-faint text-center py-2">Chargement…</p>
      )}
      {skillsError && (
        <p className="text-xs text-err bg-err/10 border border-err/30 rounded-lg px-3 py-2 leading-relaxed">
          {skillsError}
        </p>
      )}
      {!skillsLoading && !skillsError && skills.length === 0 && (
        <p className="text-xs text-faint text-center py-2">
          Aucun skill — crée le premier ci-dessous
        </p>
      )}
      {!skillsLoading && skills.length > 0 && (
        <ul className="space-y-1.5">
          {skills.map(skill => (
            <li
              key={skill.name}
              className="flex items-start justify-between gap-2 bg-bg border border-edge rounded-lg px-2.5 py-2"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium text-ink truncate">{skill.name}</p>
                {skill.description && (
                  <p className="text-xs text-dim truncate">{skill.description}</p>
                )}
              </div>
              <button
                onClick={() => deleteSkill(skill.name)}
                className="shrink-0 text-dim hover:text-err transition-colors text-xs leading-none mt-0.5"
                aria-label={`Supprimer ${skill.name}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Séparateur */}
      <div className="border-t border-edge" />

      {/* Formulaire de création */}
      <div className="space-y-2">
        <label className="text-xs text-dim block font-medium">Nouveau skill</label>
        <input
          type="text"
          placeholder="Nom (ex: formatage-json)"
          value={skillName}
          onChange={e => setSkillName(e.target.value)}
          className="w-full text-xs bg-bg border border-edge rounded-lg px-2 py-1.5 text-ink placeholder:text-faint focus:outline-none focus:border-accent"
        />
        <input
          type="text"
          placeholder="Description courte"
          value={skillDescription}
          onChange={e => setSkillDescription(e.target.value)}
          className="w-full text-xs bg-bg border border-edge rounded-lg px-2 py-1.5 text-ink placeholder:text-faint focus:outline-none focus:border-accent"
        />
        <textarea
          placeholder="Contenu du skill (ex: Quand l'utilisateur demande X, fais Y…)"
          value={skillContent}
          onChange={e => setSkillContent(e.target.value)}
          rows={4}
          className="w-full text-xs bg-bg border border-edge rounded-lg px-2 py-1.5 text-ink placeholder:text-faint focus:outline-none focus:border-accent resize-none"
        />
        {skillCreateError && (
          <p className="text-xs text-err bg-err/10 border border-err/30 rounded-lg px-3 py-2 leading-relaxed">
            {skillCreateError}
          </p>
        )}
        <button
          onClick={createSkill}
          disabled={skillCreating}
          className="w-full text-xs py-1.5 rounded-lg bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 transition-colors font-medium disabled:opacity-50"
        >
          {skillCreating ? 'Création…' : 'Créer'}
        </button>
      </div>
    </>
  )
}
