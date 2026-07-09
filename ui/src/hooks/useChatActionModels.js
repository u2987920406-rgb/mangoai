import { useEffect, useState } from "react";
import { ACTION_MODELS_KEY, CHAT_ACTIONS, loadActionModels } from "../components/chat/helpers.js";

// Modèle par action (Construire/Planifier/Discuter), configurable + mémorisé.
// Extrait de Chat.jsx sans changement de comportement. `clearAwaitingApply` est
// appelé au clic d'action pour effacer la proposition « Appliquer » d'un tour
// Discuter précédent (état porté par Chat.jsx, hors de ce hook).
export function useChatActionModels(onChatMode, clearAwaitingApply) {
  const [actionModels, setActionModels] = useState(loadActionModels);
  const [activeAction, setActiveAction] = useState("construire"); // bouton actif (highlight + planificateur)
  const [modelMenuFor, setModelMenuFor] = useState(null);         // id de l'action dont le menu modèle est ouvert

  useEffect(() => {
    try { localStorage.setItem(ACTION_MODELS_KEY, JSON.stringify(actionModels)); } catch { /* localStorage indispo */ }
  }, [actionModels]);

  // Clic sur un bouton d'action → active l'action et applique SON modèle + mode.
  const pickAction = (a) => {
    setActiveAction(a.id);
    clearAwaitingApply();
    onChatMode({ model: actionModels[a.id], mode: a.mode });
  };
  // Choix du modèle d'une action (menu déroulant) → mémorise et, si l'action est
  // active, applique aussitôt le nouveau modèle.
  const setActionModel = (actionId, modelId) => {
    setActionModels((prev) => ({ ...prev, [actionId]: modelId }));
    setModelMenuFor(null);
    if (activeAction === actionId) {
      const a = CHAT_ACTIONS.find((x) => x.id === actionId);
      onChatMode({ model: modelId, mode: a.mode });
    }
  };

  // Au MONTAGE : synchronise le mode parent sur le bouton actif (Construire→elite).
  // Sans ça, après un remontage (F5, bascule de projet) le highlight revient sur
  // "construire" tandis que le mode parent reste collé sur un ancien "discuss"
  // (issu d'un tour Planifier/Discuter) → un envoi « Construire » partait à tort en
  // conversation. Désormais highlight et mode ne peuvent plus diverger.
  useEffect(() => {
    const a = CHAT_ACTIONS.find((x) => x.id === activeAction);
    if (a) onChatMode({ model: actionModels[a.id], mode: a.mode });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { actionModels, activeAction, setActiveAction, modelMenuFor, setModelMenuFor, pickAction, setActionModel };
}
