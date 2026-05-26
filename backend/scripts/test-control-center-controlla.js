/**
 * Teste do Control Center Controlla: login e fluxo Ativar Support User.
 * Usa .env: CONTROL_CENTER_CONTROLLA_USER, CONTROL_CENTER_CONTROLLA_PASSWORD.
 * Uso: npm run test-control-center-controlla   ou   node scripts/test-control-center-controlla.js
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const clientKey = 'controlla';

async function main() {
  console.log('\nTeste Control Center — Controlla...\n');

  const { getControlCenterConfig } = await import('../src/config/controlCenterClients.js');
  const { runActivateSupport } = await import('../src/services/controlCenterService.js');

  const config = getControlCenterConfig(clientKey);
  if (!config) {
    console.error('Config Control Center não encontrada para controlla.');
    process.exit(1);
  }

  const username = process.env[config.envUserKey];
  const password = process.env[config.envPasswordKey];
  if (!username || !password) {
    console.error('Credenciais não configuradas. No .env defina:');
    console.error('  ', config.envUserKey);
    console.error('  ', config.envPasswordKey);
    process.exit(1);
  }

  console.log('URL:', config.baseUrl);
  console.log('Usuário:', username);
  console.log('Executando fluxo Ativar Support (headless)...\n');

  try {
    const result = await runActivateSupport({
      baseUrl: config.baseUrl,
      username,
      password,
      headless: true,
    });
    if (result.ok) {
      console.log('Control Center Controlla: sucesso.');
      console.log('Mensagem:', result.message || 'Ativar Support executado.');
      process.exit(0);
    }
    console.error('Control Center Controlla: falha.');
    console.error('Erro:', result.error);
    process.exit(1);
  } catch (err) {
    console.error('Erro ao executar teste:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

main();
