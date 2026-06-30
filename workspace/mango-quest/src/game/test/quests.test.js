// Tests du système de quêtes (suivi par événements, complétion, récompenses).
import { createQuestLog, trackEvent, claimReward, activeQuests, completedUnclaimed, questLabel, allClaimed, QUEST, QUEST_INFO } from "../systems/quests.js";

test("createQuestLog — toutes les quêtes actives à 0", () => {
  const log = createQuestLog();
  expect(activeQuests(log).length).toBe(Object.keys(QUEST_INFO).length);
  expect(log.quests[QUEST.SLAY_ENEMIES].progress).toBe(0);
  expect(log.quests[QUEST.SLAY_ENEMIES].status).toBe("active");
});

test("trackEvent — avance la quête correspondante", () => {
  let log = createQuestLog();
  const r = trackEvent(log, "enemy_defeated");
  expect(r.log.quests[QUEST.SLAY_ENEMIES].progress).toBe(1);
  expect(r.completed.length).toBe(0);
});

test("trackEvent — événement inconnu : aucun effet", () => {
  const log = createQuestLog();
  const r = trackEvent(log, "rien_du_tout");
  expect(r.log).toBe(log);
  expect(r.completed.length).toBe(0);
});

test("trackEvent — complète la quête à l'atteinte de la cible", () => {
  let log = createQuestLog();
  log = trackEvent(log, "enemy_defeated").log;
  log = trackEvent(log, "enemy_defeated").log;
  const r = trackEvent(log, "enemy_defeated"); // 3/3
  expect(r.log.quests[QUEST.SLAY_ENEMIES].status).toBe("complete");
  expect(r.completed).toContain(QUEST.SLAY_ENEMIES);
});

test("trackEvent — progress plafonné à la cible", () => {
  let log = createQuestLog();
  for (let i = 0; i < 10; i++) log = trackEvent(log, "enemy_defeated").log;
  expect(log.quests[QUEST.SLAY_ENEMIES].progress).toBe(QUEST_INFO.slay_enemies.target);
});

test("trackEvent — ne re-complète pas une quête déjà complète", () => {
  let log = createQuestLog();
  log = trackEvent(log, "key_found").log; // 1/1 -> complete
  const r = trackEvent(log, "key_found"); // déjà complete
  expect(r.completed.length).toBe(0);
});

test("claimReward — donne la récompense d'une quête complète", () => {
  let log = createQuestLog();
  log = trackEvent(log, "key_found").log; // complete
  const r = claimReward(log, QUEST.FIND_KEY);
  expect(r.ok).toBeTruthy();
  expect(r.rewardXp).toBe(QUEST_INFO.find_key.rewardXp);
  expect(r.log.quests[QUEST.FIND_KEY].status).toBe("claimed");
});

test("claimReward — refuse une quête non complète", () => {
  const log = createQuestLog();
  const r = claimReward(log, QUEST.SLAY_ENEMIES);
  expect(r.ok).toBeFalsy();
  expect(r.rewardXp).toBe(0);
});

test("claimReward — récompense en objet (potions) pour slay_enemies", () => {
  let log = createQuestLog();
  for (let i = 0; i < 3; i++) log = trackEvent(log, "enemy_defeated").log;
  const r = claimReward(log, QUEST.SLAY_ENEMIES);
  expect(r.rewardItem).toBe("potion");
  expect(r.rewardQty).toBe(2);
});

test("questLabel — affiche la progression", () => {
  let log = createQuestLog();
  log = trackEvent(log, "enemy_defeated").log;
  expect(questLabel(QUEST.SLAY_ENEMIES, log)).toContain("1/3");
});

test("allClaimed — vrai seulement quand tout est réclamé", () => {
  let log = createQuestLog();
  expect(allClaimed(log)).toBeFalsy();
  // Complète + réclame chaque quête
  log = trackEvent(log, "key_found").log;
  log = trackEvent(log, "boss_defeated").log;
  for (let i = 0; i < 3; i++) log = trackEvent(log, "enemy_defeated").log;
  log = claimReward(log, QUEST.FIND_KEY).log;
  log = claimReward(log, QUEST.DEFEAT_BOSS).log;
  log = claimReward(log, QUEST.SLAY_ENEMIES).log;
  expect(completedUnclaimed(log).length).toBe(0);
  expect(allClaimed(log)).toBeTruthy();
});
