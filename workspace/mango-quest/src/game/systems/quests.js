// Mango Quest — système de quêtes (pur). Chaque quête suit un compteur d'objectif
// et récompense en XP/objet. Pilotée par des ÉVÉNEMENTS de jeu (ennemi vaincu,
// clé trouvée, boss terrassé) → avance les quêtes correspondantes.

import { ITEM } from "../constants.js";

export const QUEST = {
  SLAY_ENEMIES: "slay_enemies",
  FIND_KEY: "find_key",
  DEFEAT_BOSS: "defeat_boss",
};

export const QUEST_INFO = {
  slay_enemies: { name: "Nettoyer la prairie", desc: "Vaincs 3 ennemis.", target: 3, rewardXp: 15, rewardItem: ITEM.POTION, rewardQty: 2 },
  find_key: { name: "La clé perdue", desc: "Trouve la clé du donjon.", target: 1, rewardXp: 10, rewardItem: null, rewardQty: 0 },
  defeat_boss: { name: "Le Golem des Profondeurs", desc: "Terrasse le boss du donjon.", target: 1, rewardXp: 50, rewardItem: null, rewardQty: 0 },
};

// Quel événement fait avancer quelle quête.
const EVENT_TO_QUEST = {
  enemy_defeated: QUEST.SLAY_ENEMIES,
  key_found: QUEST.FIND_KEY,
  boss_defeated: QUEST.DEFEAT_BOSS,
};

export function createQuestLog() {
  const quests = {};
  for (const id of Object.keys(QUEST_INFO)) {
    quests[id] = { id, progress: 0, status: "active" }; // active | complete | claimed
  }
  return { quests };
}

// Enregistre un événement ; avance la quête correspondante. PUR.
// Renvoie { log, completed: [ids fraîchement complétés] }.
export function trackEvent(log, eventType, amount = 1) {
  const id = EVENT_TO_QUEST[eventType];
  if (!id || !log.quests[id]) return { log, completed: [] };
  const q = log.quests[id];
  if (q.status !== "active") return { log, completed: [] };
  const info = QUEST_INFO[id];
  const progress = Math.min(info.target, q.progress + amount);
  const status = progress >= info.target ? "complete" : "active";
  const newLog = { quests: { ...log.quests, [id]: { ...q, progress, status } } };
  return { log: newLog, completed: status === "complete" ? [id] : [] };
}

// Réclame la récompense d'une quête complétée. PUR.
// Renvoie { log, rewardXp, rewardItem, rewardQty, ok }.
export function claimReward(log, id) {
  const q = log.quests[id];
  if (!q || q.status !== "complete") return { log, rewardXp: 0, rewardItem: null, rewardQty: 0, ok: false };
  const info = QUEST_INFO[id];
  const newLog = { quests: { ...log.quests, [id]: { ...q, status: "claimed" } } };
  return { log: newLog, rewardXp: info.rewardXp, rewardItem: info.rewardItem, rewardQty: info.rewardQty, ok: true };
}

export function activeQuests(log) {
  return Object.values(log.quests).filter((q) => q.status === "active");
}

export function completedUnclaimed(log) {
  return Object.values(log.quests).filter((q) => q.status === "complete");
}

export function questLabel(id, log) {
  const info = QUEST_INFO[id];
  const q = log.quests[id];
  return `${info.name} (${q.progress}/${info.target})`;
}

export function allClaimed(log) {
  return Object.values(log.quests).every((q) => q.status === "claimed");
}
