/**
 * Teste conta ANANIMPROG: valida listagem de projetos e desliga a VM RACSES01.
 * Uso: node backend/scripts/test-ananimprog-stop.js
 * Opcional: ANANIMPROG_TEST_SERVER_ID (default RACSES01), ANANIMPROG_TEST_PROJECT_ID e REGION para pular busca.
 */
const path = require("path");
const { loadConfig } = require("../utils/config-loader");

const appDir = path.join(__dirname, "..", "..");
loadConfig(appDir);
require("dotenv").config({ path: path.join(appDir, ".env") });

const { getCredentials } = require("../config");
const { listProjects } = require("../huaweiClient");
const { listServers, stopServer } = require("../ecsClient");

const SERVER_ID = process.env.ANANIMPROG_TEST_SERVER_ID || "44b06da8-1f87-405b-ae0a-0dcac31f92a4";
const REGIONS = ["sa-brazil-1", "la-south-2"];
const MAX_PROJECTS_TO_SCAN = 25;

async function main() {
  const creds = getCredentials("ananimprog");
  if (!creds) {
    console.error("Defina ANANIMPROG_AK e ANANIMPROG_SK no .env");
    process.exit(1);
  }

  console.log("1. Validando: listar projetos (ANANIMPROG)...");
  let projectsRes;
  try {
    projectsRes = await listProjects(creds.ak, creds.sk);
  } catch (e) {
    console.error("   ERRO ao listar projetos:", e.message);
    process.exit(1);
  }
  const projects = projectsRes.projects || [];
  console.log("   OK. Projetos encontrados:", projects.length);
  projects.slice(0, 8).forEach((p) => console.log("   -", p.name || p.id));

  const projectIdOverride = process.env.ANANIMPROG_TEST_PROJECT_ID;
  const regionOverride = process.env.ANANIMPROG_TEST_REGION;

  let projectId = projectIdOverride;
  let region = regionOverride;

  if (!projectId || !region) {
    console.log("\n2. Procurando VM", SERVER_ID, "nos projetos...");
    const list = projects.slice(0, MAX_PROJECTS_TO_SCAN);
    for (const proj of list) {
      const pid = proj.id || proj.project_id;
      if (!pid) continue;
      for (const reg of REGIONS) {
        try {
          const r = await listServers(creds.ak, creds.sk, reg, pid);
          const servers = r.servers || [];
          const found = servers.some((s) => (s.id || (s.server && s.server.id)) === SERVER_ID);
          if (found) {
            projectId = pid;
            region = reg;
            console.log("   Encontrada no projeto", proj.name || pid, "região", reg);
            break;
          }
        } catch (_) {}
        if (projectId) break;
      }
      if (projectId) break;
    }
    if (!projectId) {
      console.error("   VM", SERVER_ID, "não encontrada nos primeiros", MAX_PROJECTS_TO_SCAN, "projetos.");
      process.exit(1);
    }
  } else {
    console.log("\n2. Usando projeto/região informados:", projectId, region);
  }

  console.log("\n3. Desligando VM (stop)...", SERVER_ID);
  try {
    await stopServer(creds.ak, creds.sk, region, projectId, SERVER_ID);
    console.log("   OK. Comando stop enviado.");
  } catch (e) {
    console.error("   ERRO ao parar VM:", e.message);
    process.exit(1);
  }

  console.log("\nConcluído.");
}

main();
