/**
 * Teste de conexão SSH para o CONTROLLAHDB (via jump CONTROLLAWEB).
 * Usa .env: SSH_HANA_CONTROLLA_JUMP_* (jump) + SSH_HANA_CONTROLLA_HOST/USER/PASSWORD (destino).
 * Uso: npm run test-ssh-controlla-hdb   ou   node scripts/test-ssh-controlla-hdb.js
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const clientKey = 'controlla';

const { getHanaConnectionConfig, getHanaJumpConfig } = await import('../src/config/hanaClients.js');
const { sshExecWithConfigViaJump } = await import('../src/services/sshService.js');

async function main() {
  console.log('\nTeste de conexão SSH — CONTROLLAHDB (via jump CONTROLLAWEB)...\n');

  const jump = getHanaJumpConfig(clientKey);
  const conn = getHanaConnectionConfig(clientKey);

  if (!jump || !conn) {
    console.error('Config SSH não encontrada para controlla (CONTROLLAHDB).');
    console.error('  No .env defina JUMP (CONTROLLAWEB) e destino (CONTROLLAHDB):');
    console.error('    SSH_HANA_CONTROLLA_JUMP_HOST=124.81.4.4');
    console.error('    SSH_HANA_CONTROLLA_JUMP_USER=worker');
    console.error('    SSH_HANA_CONTROLLA_JUMP_PASSWORD=<senha>');
    console.error('    SSH_HANA_CONTROLLA_HOST=<IP ou hostname>');
    console.error('    SSH_HANA_CONTROLLA_USER=root');
    console.error('    SSH_HANA_CONTROLLA_PASSWORD=<senha>');
    process.exit(1);
  }

  console.log('Jump (CONTROLLAWEB):', jump.host + ':' + (jump.port || 22), '| usuário:', jump.username);
  console.log('Destino (CONTROLLAHDB):', conn.host + ':' + (conn.port || 22), '| usuário:', conn.username);
  console.log('Timeout jump (ms):', process.env.SSH_JUMP_HANDSHAKE_TIMEOUT || '45000');
  console.log('\nConectando (backend → CONTROLLAWEB → CONTROLLAHDB)...\n');

  try {
    const result = await sshExecWithConfigViaJump(jump, conn, 'echo OK');
    if (result.code === 0 && result.stdout.trim() === 'OK') {
      console.log('Conexão SSH estabelecida com sucesso (CONTROLLAHDB).');
      process.exit(0);
    }
    console.error('Comando retornou código', result.code);
    if (result.stderr) console.error('stderr:', result.stderr);
    if (result.stdout) console.error('stdout:', result.stdout);
    process.exit(1);
  } catch (err) {
    console.error('Falha na conexão:');
    console.error('  Mensagem:', err.message);
    if (err.code) console.error('  Código:', err.code);
    console.error('\nCausas comuns:');
    console.error('  - CONTROLLAWEB (124.81.4.4) deve estar acessível e conseguir SSH para CONTROLLAHDB');
    console.error('  - SSH_HANA_CONTROLLA_HOST: use IP se o hostname CONTROLLAHDB não resolver no jump');
    console.error('  - Senha com #: use aspas no .env (ex.: "Controlla@cloud#")');
    console.error('  - Timeout: SSH_JUMP_HANDSHAKE_TIMEOUT=60000');
    process.exit(1);
  }
}

main();
