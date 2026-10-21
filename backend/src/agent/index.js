import { getDb } from '../db/database.js';
import { createAgentStore } from './agentStore.js';

let store = null;

/** Store do agente no banco do painel (ananim.db), criado na primeira chamada. */
export function getAgentStore() {
  if (!store) store = createAgentStore(getDb());
  return store;
}
