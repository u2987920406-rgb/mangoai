// graph-actions.js — contexte partagé pour les actions déclenchées depuis un nœud.
import { createContext } from 'react';

export const GraphActions = createContext({
  commitLabel: () => {},
});
