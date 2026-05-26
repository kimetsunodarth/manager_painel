/**
 * Teste da conta ANANIMPRO: verifica permissões (lista projetos) e desliga a VM CLOUDHDB.
 * Uso (na raiz do projeto ou no backend):
 *   node backend/scripts/test-ananimpro-stop.js
 *   node scripts/test-ananimpro-stop.js
 * Requer no .env: ANANIMPRO_AK e ANANIMPRO_SK.
 * Opcional: ANANIMPRO_TEST_PROJECT_ID (default do projeto onde está CLOUDHDB).
 */
const path = require("path");
const { loadConfig } = require("../utils/config-loader");

const appDir = path.join(__dirname, "..", "..");
loadConfig(appDir);
require("dotenv").config({ path: path.join(appDir, ".env") });

const { getCredentials } = require("../config");
const { listProjects } = require("../huaweiClient");
const { stopServer } = require("../ecsClient");

const REGION = "sa-brazil-1";
const SERVER_ID = process.env.ANANIMPRO_TEST_SERVER_ID || "02e165f4-1b93-4817-8f32-1e0936b0845a";
const PROJECT_ID = process.env.ANANIMPRO_TEST_PROJECT_ID || "40733e2f2f1c4858bf4c62f2d505d7ef";

async function main() {
  const creds = getCredentials("ananimpro");
  if (!creds) {
    console.error("Defina ANANIMPRO_AK e ANANIMPRO_SK no .env (ou config.enc).");
    process.exit(1);
  }

  console.log("1. Testando permissões (listar projetos)...");
  try {
    const projects = await listProjects(creds.ak, creds.sk);
    const list = projects.projects || [];
    console.log("   OK. Projetos encontrados:", list.length);
    list.slice(0, 5).forEach((p) => console.log("   -", p.name || p.id));
  } catch (e) {
    console.error("   ERRO ao listar projetos:", e.message);
    process.exit(1);
  }

  console.log("\n2. Desligando VM (stop)...", SERVER_ID);
  try {
    await stopServer(creds.ak, creds.sk, REGION, PROJECT_ID, SERVER_ID);
    console.log("   OK. Comando stop enviado para", SERVER_ID);
  } catch (e) {
    console.error("   ERRO ao parar VM:", e.message);
    process.exit(1);
  }

  console.log("\nConcluído.");
}

main();
