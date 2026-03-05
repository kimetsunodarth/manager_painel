/**
 * Teste de conexão SSH para o CONTROLLAWEB (124.81.4.4).
 * Usa as variáveis do .env: SSH_HANA_CONTROLLA_JUMP_*.
 * Uso: npm run test-ssh-controlla-web   ou   node scripts/test-ssh-controlla-web.js
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const clientKey = 'controlla-web';

const { getHanaConnectionConfig } = await import('../src/config/hanaClients.js');
const { sshExecWithConfig } = await import('../src/services/sshService.js');

async function main() {
  console.log('\nTeste de conexão SSH — CONTROLLAWEB...\n');

  const conn = getHanaConnectionConfig(clientKey);
  if (!conn) {
    console.error('Config SSH não encontrada para controlla-web.');
    console.error('  No .env do backend defina:');
    console.error('    SSH_HANA_CONTROLLA_JUMP_HOST=124.81.4.4');
    console.error('    SSH_HANA_CONTROLLA_JUMP_USER=worker');
    console.error('    SSH_HANA_CONTROLLA_JUMP_PASSWORD=<senha>');
    console.error('    SSH_HANA_CONTROLLA_JUMP_PORT=22  (opcional)');
    process.exit(1);
  }

  console.log('Configuração:');
  console.log('  Host:', conn.host + ':' + (conn.port || 22));
  console.log('  Usuário:', conn.username);
  console.log('  Timeout direto (ms):', process.env.SSH_DIRECT_HANDSHAKE_TIMEOUT || '20000');
  console.log('\nConectando...\n');

  try {
    const result = await sshExecWithConfig(conn, 'echo OK');
    if (result.code === 0 && result.stdout.trim() === 'OK') {
      console.log('Conexão SSH estabelecida com sucesso (CONTROLLAWEB).');
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
    console.error('  - Firewall/rede: a máquina do backend precisa acessar', conn.host, 'porta', conn.port || 22);
    console.error('  - OpenSSH Server instalado e rodando no Windows (CONTROLLAWEB)');
    console.error('  - Usuário e senha corretos no .env (SSH_HANA_CONTROLLA_JUMP_USER, SSH_HANA_CONTROLLA_JUMP_PASSWORD)');
    console.error('  - Se a senha tiver # use aspas no .env');
    console.error('  - Timeout: no .env defina SSH_DIRECT_HANDSHAKE_TIMEOUT=45000 e tente de novo');
    process.exit(1);
  }
}

main();
