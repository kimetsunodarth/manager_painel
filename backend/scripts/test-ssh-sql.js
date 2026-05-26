/**
 * Teste de conexão SSH para a VM SQL (com ou sem jump host).
 * Carrega .env do backend e executa "echo OK" na VM SQL.
 * Uso: npm run test-ssh-sql   ou   node scripts/test-ssh-sql.js
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

const { sshExecSql, isSqlConfigured, isSqlJumpHostConfigured } = await import('../src/services/sshService.js');

async function main() {
  console.log('\nTeste de conexão SSH (VM SQL)...\n');

  if (!isSqlConfigured()) {
    console.error('SSH SQL não configurado. No .env defina:');
    console.error('  SSH_SQL_HOST, SSH_SQL_USER e SSH_SQL_PASSWORD (ou SSH_SQL_PRIVATE_KEY_PATH)');
    if (process.env.SSH_SQL_JUMP_HOST) {
      console.error('  E para jump: SSH_SQL_JUMP_USER e SSH_SQL_JUMP_PASSWORD (ou SSH_SQL_JUMP_PRIVATE_KEY_PATH)');
    }
    process.exit(1);
  }

  console.log('Configuração:');
  console.log('  VM SQL:', process.env.SSH_SQL_HOST + ':' + (process.env.SSH_SQL_PORT || '22'), process.env.SSH_SQL_USER);
  if (isSqlJumpHostConfigured()) {
    console.log('  Jump (VM Web):', process.env.SSH_SQL_JUMP_HOST + ':' + (process.env.SSH_SQL_JUMP_PORT || '22'), process.env.SSH_SQL_JUMP_USER);
  }
  console.log('\nConectando...\n');

  try {
    const result = await sshExecSql('echo OK');
    if (result.code === 0 && result.stdout.trim() === 'OK') {
      console.log('Conexão SSH estabelecida com sucesso (VM SQL).');
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
    console.error('  - Jump: host/porta/usuário/senha da VM Web incorretos; firewall na porta 22');
    console.error('  - VM SQL: SSH_SQL_HOST (ex: 127.0.0.1 se for o mesmo host que o jump)');
    console.error('  - OpenSSH Server rodando na VM de destino');
    process.exit(1);
  }
}

main();
