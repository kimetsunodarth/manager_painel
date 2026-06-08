/**
 * Configuração das contas Huawei Cloud (AK/SK e regiões).
 * Usa process.env já preenchido por server.js (config.enc ou .env).
 */

const REGION_SAO_PAULO = "sa-brazil-1";
const REGION_SANTIAGO = "la-south-2";

const ACCOUNTS = [
  { id: "ramo_sistemas", name: "RAMO_SISTEMAS", regions: [{ id: REGION_SAO_PAULO, name: "São Paulo" }, { id: REGION_SANTIAGO, name: "Santiago" }], ak_env: "RAMO_AK", sk_env: "RAMO_SK" },
  { id: "ananimcloud", name: "ANANIMCLOUD", regions: [{ id: REGION_SAO_PAULO, name: "São Paulo" }], ak_env: "ANANIM_AK", sk_env: "ANANIM_SK" },
  { id: "rsdone", name: "RSDONE", regions: [{ id: REGION_SANTIAGO, name: "Santiago" }], ak_env: "RSDONE_AK", sk_env: "RSDONE_SK" },
  { id: "moove_ramosistemas", name: "MOOVE_RAMOSISTEMAS", regions: [{ id: REGION_SAO_PAULO, name: "São Paulo" }], ak_env: "MOOVE_AK", sk_env: "MOOVE_SK" },
];

function getCredentials(accountId) {
  const acc = ACCOUNTS.find((a) => a.id === accountId);
  if (!acc) return null;
  const ak = process.env[acc.ak_env];
  const sk = process.env[acc.sk_env];
  return ak && sk ? { ak, sk } : null;
}

function getAccountsForApi() {
  return ACCOUNTS.map((a) => ({ id: a.id, name: a.name, regions: a.regions }));
}

function getAccountName(accountId) {
  const acc = ACCOUNTS.find((a) => a.id === accountId);
  return acc ? acc.name : null;
}

module.exports = { getCredentials, getAccountsForApi, getAccountName };
