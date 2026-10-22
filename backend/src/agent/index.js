import { getDb } from '../db/database.js';
import { createAgentStore } from './agentStore.js';

import { createManualProjects } from './manualProjects.js';

let store = null;
let manual = null;

/** Store do agente no banco do painel (ananim.db), criado na primeira chamada. */
export function getAgentStore() {
  if (!store) store = createAgentStore(getDb());
  return store;
}

/** Projetos/servidores fora da Huawei, no mesmo banco. */
export function getManualProjects() {
  if (!manual) manual = createManualProjects(getDb());
  return manual;
}
