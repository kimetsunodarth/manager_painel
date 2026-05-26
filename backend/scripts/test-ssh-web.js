/**
 * Teste de conexão SSH para o servidor web (aguasweb).
 * Usa credentials.enc do cliente aguas-pratas-web (SSH_WEB_HOST, SSH_WEB_USER, SSH_WEB_PASSWORD).
 * Uso: npm run test-ssh-web   ou   node scripts/test-ssh-web.js
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

const clientKey = 'aguas-pratas-web';

const { getClientCredentials } = await import('../src/config/clientCredentials.js');
const { getWebConnectionConfigFromCredentials, sshExecWithConfig } = await import('../src/services/sshService.js');

async function main() {
  console.log('\nTeste de conexão SSH — Servidor Web (aguasweb)...\n');

  const creds = getClientCredentials(clientKey);
  if (!creds) {
    console.error('Credenciais não encontradas para', clientKey);
    console.error('  Verifique: backend/src/config/clients/aguas-pratas-web/credentials.enc');
    console.error('  E que .encryption_key existe na pasta backend.');
    console.error('  Gere com: npm run encrypt-client-credentials -- aguas-pratas-web');
    process.exit(1);
  }

  const conn = getWebConnectionConfigFromCredentials(creds);
  if (!conn) {
    console.error('Config SSH Web incompleta em credentials.enc.');
    console.error('  Necessário: SSH_WEB_HOST, SSH_WEB_USER e SSH_WEB_PASSWORD (ou SSH_WEB_PRIVATE_KEY_PATH)');
    process.exit(1);
  }

  console.log('Configuração:');
  console.log('  Host:', conn.host + ':' + (conn.port || 22));
  console.log('  Usuário:', conn.username);
  console.log('\nConectando...\n');

  try {
    const result = await sshExecWithConfig(conn, 'echo OK');
    if (result.code === 0 && result.stdout.trim() === 'OK') {
      console.log('Conexão SSH estabelecida com sucesso (aguasweb).');
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
    console.error('  - OpenSSH Server instalado e rodando no Windows (aguasweb)');
    console.error('  - Usuário e senha corretos em credentials.enc (SSH_WEB_USER, SSH_WEB_PASSWORD)');
    process.exit(1);
  }
}

main();
