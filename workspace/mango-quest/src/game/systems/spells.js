// Mango Quest — spell/skill system (pure). 3 sorts : soin, boule de feu, bouclier.
// Mana + cooldowns par sort. État GARDÉ SÉPARÉ du joueur (createPlayer reste intact,
// les tests d'entités ne bougent pas). Math HP inlinée → module 100 % autonome/testable.

export const SPELL = { HEAL: "heal", FIREBALL: "fireball", SHIELD: "shield" };

export const SPELL_INFO = {
  heal: { name: "Soin", manaCost: 6, cooldown: 180, heal: 18, icon: "✚" },
  fireball: { name: "Boule de feu", manaCost: 10, cooldown: 120, damage: 22, icon: "🔥" },
  shield: { name: "Bouclier", manaCost: 8, cooldown: 300, shield: 10, duration: 300, icon: "🛡" },
};

export const MANA_BASE = { maxMana: 20, mana: 20, regenPerTick: 0.02 };

export function createSpellState() {
  return {
    mana: MANA_BASE.mana,
    maxMana: MANA_BASE.maxMana,
    cooldowns: { heal: 0, fireball: 0, shield: 0 },
    shieldTicks: 0,
  };
}

// Le sort peut-il être lancé (assez de mana ET hors recharge) ? PUR.
export function canCast(state, spellId) {
  const info = SPELL_INFO[spellId];
  if (!info) return false;
  return state.mana >= info.manaCost && (state.cooldowns[spellId] || 0) <= 0;
}

// Lance un sort. Renvoie { state, player, target, ok, message, effect }. PUR (ne mute rien).
export function castSpell(state, spellId, player, target = null) {
  const info = SPELL_INFO[spellId];
  if (!info) return { state, player, target, ok: false, message: "Sort inconnu.", effect: "none" };
  if (!canCast(state, spellId)) {
    return {
      state,
      player,
      target,
      ok: false,
      message: state.mana < info.manaCost ? "Pas assez de mana." : "Sort en recharge.",
      effect: "none",
    };
  }
  let newState = { ...state, mana: state.mana - info.manaCost, cooldowns: { ...state.cooldowns, [spellId]: info.cooldown } };
  let newPlayer = player;
  let newTarget = target;
  let message = "";

  if (spellId === SPELL.HEAL) {
    const hp = Math.min(player.maxHp, player.hp + info.heal);
    newPlayer = { ...player, hp };
    message = `Soin : +${hp - player.hp} HP.`;
  } else if (spellId === SPELL.FIREBALL) {
    if (target) {
      const hp = Math.max(0, target.hp - info.damage);
      newTarget = { ...target, hp };
      message = `Boule de feu : ${target.hp - hp} dégâts.`;
    } else {
      message = "Boule de feu lancée !";
    }
  } else if (spellId === SPELL.SHIELD) {
    newState = { ...newState, shieldTicks: info.duration };
    message = `Bouclier actif (${info.shield} absorption).`;
  }
  return { state: newState, player: newPlayer, target: newTarget, ok: true, message, effect: spellId };
}

// Avance d'un tick : décrémente cooldowns + régénère la mana + décrémente le bouclier. PUR.
export function tickSpells(state) {
  const cooldowns = {};
  for (const k of Object.keys(state.cooldowns)) cooldowns[k] = Math.max(0, (state.cooldowns[k] || 0) - 1);
  return {
    ...state,
    cooldowns,
    mana: Math.min(state.maxMana, state.mana + MANA_BASE.regenPerTick),
    shieldTicks: Math.max(0, (state.shieldTicks || 0) - 1),
  };
}

export function shieldActive(state) {
  return (state.shieldTicks || 0) > 0;
}

// Atténue des dégâts entrants si le bouclier est actif (absorbe jusqu'à SPELL_INFO.shield.shield). PUR.
export function absorbWithShield(state, incomingDmg) {
  if (!shieldActive(state)) return { dmg: incomingDmg, absorbed: 0 };
  const absorbed = Math.min(SPELL_INFO.shield.shield, incomingDmg);
  return { dmg: Math.max(0, incomingDmg - absorbed), absorbed };
}
