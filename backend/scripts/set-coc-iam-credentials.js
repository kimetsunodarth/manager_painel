/**
 * Adiciona/atualiza as credenciais IAM de domínio (usuário dedicado, ex. "ananimreport") de um
 * perfil Huawei já existente — usadas pelo COC (Scheduled O&M) como fallback quando AK/SK
 * assinado não é aceito pela Huawei nesse endpoint. Ver backend/src/services/cocService.js.
 * Faz merge no config.enc já existente (não apaga AK/SK nem outros perfis, igual ao fluxo de
 * onboarding de cliente em routes/adminClients.js).
 *
 * Uso (rodar na pasta onde estão config.enc e .encryption_key — em produção, a pasta instalada,
 * ex.: "C:\Program Files\Ananim Manager Painel"):
 *   node <caminho-completo>\set-coc-iam-credentials.js <PERFIL> <IAM_USERNAME> <IAM_DOMAIN>
 * A senha é lida da variável de ambiente COC_IAM_PASSWORD (evita ficar no histórico do shell) ou,
 * se ausente, perguntada interativamente (aparece em texto — rode num terminal privado).
 *
 * Ex.: set COC_IAM_PASSWORD=... && node ...\set-coc-iam-credentials.js RAMO_SP_RAMOONE ananimreport Ramo_Sistemas
 */

import { existsSync } from 'fs';
import { join } from 'path';
import readline from 'readline';
import { mergeIntoConfigEnc, isConfigEncInCwd } from '../src/config/configLoader.js';

const [, , perfil, username, domain] = process.argv;

if (!perfil || !username || !domain) {
  console.error('Uso: node scripts/set-coc-iam-credentials.js <PERFIL> <IAM_USERNAME> <IAM_DOMAIN>');
  console.error('Ex.:  node scripts/set-coc-iam-credentials.js RAMO_SP_RAMOONE ananimreport Ramo_Sistemas');
  process.exit(1);
}

if (!isConfigEncInCwd()) {
  console.error('Erro: config.enc e/ou .encryption_key não encontrados na pasta atual:', process.cwd());
  console.error('Rode este script a partir da pasta do painel instalado (onde ficam config.enc e .encryption_key).');
  process.exit(1);
}

async function readPassword() {
  if (process.env.COC_IAM_PASSWORD) return process.env.COC_IAM_PASSWORD;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`Senha IAM de "${username}" (${domain}) — visível neste terminal: `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

const password = await readPassword();
if (!password) {
  console.error('Erro: senha vazia.');
  process.exit(1);
}

const snippet = [
  `${perfil}_IAM_USERNAME=${username}`,
  `${perfil}_IAM_PASSWORD=${password}`,
  `${perfil}_IAM_DOMAIN=${domain}`,
].join('\n');

const result = mergeIntoConfigEnc(snippet);
if (!result.ok) {
  console.error('Erro ao gravar em config.enc:', result.error);
  process.exit(1);
}

console.log(`\nOK: ${perfil}_IAM_USERNAME/_IAM_PASSWORD/_IAM_DOMAIN gravados em`, join(process.cwd(), 'config.enc'));
console.log('Reinicie o backend (App Pool no IIS, ou o processo dev) para carregar o novo config.enc.');
