/**
 * Programação de VMs por cliente (projeto) e marcador "horas a mais".
 * - schedule: horário em que as VMs ficam ligadas (ex.: 08:00–18:00).
 * - extraHours: total de horas a mais (fora do horário programado) por ECS; quando as VMs
 *   forem desligadas pela programação e forem ligadas depois, este marcador acumula.
 */

import fs from 'fs';
import path from 'path';
import { getConfigDir } from '../appRoot.js';

const CONFIG_DIR = getConfigDir();
const SCHEDULE_FILE = path.join(CONFIG_DIR, 'vm-schedule.json');
const EXTRA_HOURS_FILE = path.join(CONFIG_DIR, 'ecs-extra-hours.json');
const SKIP_STOP_FILE = path.join(CONFIG_DIR, 'skip-next-stop.json');

function readJson(filePath, defaultVal) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('[vmSchedule]', filePath, e.message);
  }
  return defaultVal;
}

function writeJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn('[vmSchedule] write', filePath, e.message);
    throw e;
  }
}

/**
 * Estrutura schedule: { [projectKey]: { start: "08:00", end: "18:00" } }
 * start/end em HH:mm (24h). Fora desse intervalo as VMs podem ser desligadas pela programação.
 */
export function getSchedule(projectKey) {
  const data = readJson(SCHEDULE_FILE, {});
  return data[projectKey] || null;
}

export function setSchedule(projectKey, schedule) {
  const data = readJson(SCHEDULE_FILE, {});
  if (schedule == null || (typeof schedule === 'object' && !schedule.start && !schedule.end)) {
    delete data[projectKey];
  } else {
    data[projectKey] = {
      start: schedule.start || null,
      end: schedule.end || null,
    };
  }
  writeJson(SCHEDULE_FILE, data);
  return data[projectKey] || null;
}

export function getAllSchedules() {
  return readJson(SCHEDULE_FILE, {});
}

/**
 * Estrutura extraHours: { [projectKey]: { [serverId]: number } }
 * number = total de horas a mais (fora do horário programado).
 */
export function getExtraHours(projectKey) {
  const data = readJson(EXTRA_HOURS_FILE, {});
  return data[projectKey] || {};
}

export function getExtraHoursForServer(projectKey, serverId) {
  const byProject = getExtraHours(projectKey);
  const val = byProject[serverId];
  return typeof val === 'number' && val >= 0 ? val : 0;
}

export function setExtraHoursForServer(projectKey, serverId, hours) {
  const data = readJson(EXTRA_HOURS_FILE, {});
  if (!data[projectKey]) data[projectKey] = {};
  const num = Number(hours);
  data[projectKey][serverId] = Number.isFinite(num) && num >= 0 ? num : 0;
  writeJson(EXTRA_HOURS_FILE, data);
  return data[projectKey][serverId];
}

export function addExtraHours(projectKey, serverId, hoursToAdd) {
  const current = getExtraHoursForServer(projectKey, serverId);
  const added = Number(hoursToAdd);
  const next = Number.isFinite(added) ? current + added : current;
  const value = next >= 0 ? next : 0;
  const data = readJson(EXTRA_HOURS_FILE, {});
  if (!data[projectKey]) data[projectKey] = {};
  data[projectKey][serverId] = value;
  writeJson(EXTRA_HOURS_FILE, data);
  return value;
}

/**
 * skipNextStop: cancela o próximo stop programado para o projeto (extensão de horário).
 * Estrutura: { [projectKey]: true | { at: "2025-02-12T18:00:00", by: "user@email" } }
 */
export function getSkipNextStop(projectKey) {
  const data = readJson(SKIP_STOP_FILE, {});
  return data[projectKey] || false;
}

export function getAllSkipNextStop() {
  return readJson(SKIP_STOP_FILE, {});
}

export function setSkipNextStop(projectKey, value) {
  const data = readJson(SKIP_STOP_FILE, {});
  if (value) {
    data[projectKey] = typeof value === 'object' ? value : true;
  } else {
    delete data[projectKey];
  }
  writeJson(SKIP_STOP_FILE, data);
  return data[projectKey] || false;
}

export function clearSkipNextStop(projectKey) {
  return setSkipNextStop(projectKey, false);
}
