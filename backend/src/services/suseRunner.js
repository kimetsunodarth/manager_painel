/**
 * Execução de comandos no servidor SUSE (onde rodam SAP/HANA).
 * A API comunica com o SUSE via SSH: ao clicar em "Executar" no painel,
 * o backend conecta no host configurado e roda o comando correspondente ao serviço.
 *
 * Configuração no .env:
 *   SUSE_HOST=ip-ou-hostname-do-servidor
 *   SUSE_USER=usuario_ssh
 *   SUSE_PRIVATE_KEY_PATH=caminho/para/chave_privada   OU  SUSE_PASSWORD=senha
 *   SUSE_PORT=22   (opcional)
 *   Comandos por serviço (opcional; se não definir, apenas registra execução):
 *   SUSE_CMD_reiniciar_banco_hana=systemctl restart saphanatimer
 *   SUSE_CMD_reiniciar_eds_hana=systemctl restart sapedstimer
 *   SUSE_CMD_reiniciar_service_layer_hana=systemctl restart saplser
 *   SUSE_CMD_reiniciar_sld_hana=systemctl restart saplsld
 *
 * Nomes das variáveis: SUSE_CMD_ + id do serviço em maiúsculas com underscores (ex.: reiniciar-banco-hana → reiniciar_banco_hana).
 */

import fs from 'fs';

const host = process.env.SUSE_HOST;
const user = process.env.SUSE_USER;
const port = parseInt(process.env.SUSE_PORT || '22', 10);
const privateKeyPath = process.env.SUSE_PRIVATE_KEY_PATH;
const password = process.env.SUSE_PASSWORD;

const defaultCommands = {
  'reiniciar-banco-hana': 'echo "Configure SUSE_CMD_reiniciar_banco_hana no .env"',
  'reiniciar-eds-hana': 'echo "Configure SUSE_CMD_reiniciar_eds_hana no .env"',
  'reiniciar-service-layer-hana': 'echo "Configure SUSE_CMD_reiniciar_service_layer_hana no .env"',
  'reiniciar-sld-hana': 'echo "Configure SUSE_CMD_reiniciar_sld_hana no .env"',
};

function getCommandForService(serviceId) {
  const key = `SUSE_CMD_${serviceId.replace(/-/g, '_').toUpperCase()}`;
  const cmd = process.env[key];
  if (cmd && typeof cmd === 'string') return cmd.trim();
  return defaultCommands[serviceId] || null;
}

export function isSuseConfigured() {
  return !!(host && user && (privateKeyPath || password));
}

/**
 * Executa no SUSE o comando associado ao serviceId.
 * Se SUSE não estiver configurado, resolve sem erro (comportamento atual: só registra no painel).
 * Se estiver configurado, usa SSH (requer dependência opcional 'ssh2').
 */
export async function runServiceOnSuse(serviceId) {
  const command = getCommandForService(serviceId);
  if (!host || !user) {
    return { ok: true, message: 'SUSE não configurado; execução apenas registrada no painel.' };
  }

  if (!privateKeyPath && !password) {
    return { ok: false, message: 'Configure SUSE_PRIVATE_KEY_PATH ou SUSE_PASSWORD no .env' };
  }

  let Client;
  try {
    const ssh2 = await import('ssh2');
    Client = ssh2.Client;
  } catch (e) {
    if (e.code === 'ERR_MODULE_NOT_FOUND' && e.message.includes('ssh2')) {
      return {
        ok: false,
        message: 'Pacote ssh2 não instalado. Rode: npm install ssh2 (para executar comandos no SUSE)',
      };
    }
    throw e;
  }

  const config = {
    host,
    port,
    username: user,
    tryKeyboard: true,
  };
  if (privateKeyPath) {
    config.privateKey = fs.readFileSync(privateKeyPath, 'utf8');
  } else {
    config.password = password;
  }

  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn
      .on('ready', () => {
        conn.exec(command || 'echo ok', (err, stream) => {
          if (err) {
            conn.end();
            return reject(err);
          }
          let stderr = '';
          let stdout = '';
          stream
            .on('close', (code) => {
              conn.end();
              if (code !== 0) {
                return resolve({ ok: false, message: `Comando no SUSE retornou código ${code}`, stderr: stderr || undefined });
              }
              resolve({ ok: true, message: 'Comando executado no SUSE', stdout: stdout || undefined });
            })
            .on('data', (data) => { stdout += data.toString(); })
            .stderr.on('data', (data) => { stderr += data.toString(); });
        });
      })
      .on('error', (err) => reject(err))
      .connect(config);
  });
}
