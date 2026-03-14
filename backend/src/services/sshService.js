/**
 * Serviço SSH para execução de comandos na VM SUSE (conforme documento
 * Painel de Automação para SAP Business One).
 * Usa SSH_HOST, SSH_USER, SSH_PRIVATE_KEY_PATH (ou SUSE_* equivalente).
 */

import { Client } from 'ssh2';
import fs from 'fs';

const host = process.env.SSH_HOST || process.env.SUSE_HOST;
const user = process.env.SSH_USER || process.env.SUSE_USER;
const port = Number(process.env.SSH_PORT || process.env.SUSE_PORT || '22');
const privateKeyPath = process.env.SSH_PRIVATE_KEY_PATH || process.env.SUSE_PRIVATE_KEY_PATH;
const password = process.env.SSH_PASSWORD || process.env.SUSE_PASSWORD;

// Nomes dos serviços systemd (podem ser sobrescritos no .env se diferente no SUSE)
const svcSld = process.env.SSH_SERVICE_SLD || 'sapb1servertools.service';
const svcAuth = process.env.SSH_SERVICE_AUTHENTICATION || 'sapb1servertools-authentication.service';

/** Whitelist de comandos permitidos (conforme documento). Authentication usa nome configurável (alguns ambientes usam sapblservertools-authentication.service). */
export const COMMANDS = {
  hana: `sudo su - ndbadm -c "HDB restart"`,
  serviceLayer: `sudo systemctl restart b1s`,
  sld: `sudo systemctl restart ${svcSld}`,
  authentication: `sudo systemctl restart ${svcAuth}`,
  all: `sudo su - ndbadm -c "HDB restart" && sudo systemctl restart b1s ${svcSld} ${svcAuth}`,
};

/** Comandos de verificação de status (conforme documento). */
export const HEALTH_COMMANDS = {
  hana: `sudo su - ndbadm -c "HDB info"`,
  serviceLayer: `sudo systemctl is-active b1s`,
  sld: `sudo systemctl is-active ${svcSld}`,
  authentication: `sudo systemctl is-active ${svcAuth}`,
};

/** Caminho + instância do sapcontrol. Ou comando completo em SSH_HANA_GET_PROCESS_LIST_CMD. */
const hanaSapcontrol = (process.env.SSH_HANA_SAPCONTROL || '/usr/sap/NDB/HDB00/exe/sapcontrol -nr 00').trim();
const hanaProcessListCmd = process.env.SSH_HANA_GET_PROCESS_LIST_CMD || `sudo su - ndbadm -c "${hanaSapcontrol} -function GetProcessList"`;

/** Comando para listar processos HANA (GetProcessList). */
export const HANA_GET_PROCESS_LIST_CMD = hanaProcessListCmd;

// --- Conexão e comandos para ambientes SQL Server (Windows com OpenSSH) ---
const sqlHost = process.env.SSH_SQL_HOST;
const sqlUser = process.env.SSH_SQL_USER;
const sqlPort = Number(process.env.SSH_SQL_PORT || '22');
const sqlPrivateKeyPath = process.env.SSH_SQL_PRIVATE_KEY_PATH;
const sqlPassword = process.env.SSH_SQL_PASSWORD;

// Jump host (bastion): VM Web — conecta primeiro na Web, depois encaminha até a VM SQL
const sqlJumpHost = process.env.SSH_SQL_JUMP_HOST;
const sqlJumpPort = Number(process.env.SSH_SQL_JUMP_PORT || '22');
const sqlJumpUser = process.env.SSH_SQL_JUMP_USER;
const sqlJumpPrivateKeyPath = process.env.SSH_SQL_JUMP_PRIVATE_KEY_PATH;
const sqlJumpPassword = process.env.SSH_SQL_JUMP_PASSWORD;

const sqlRestartCmd = process.env.SSH_CMD_SQL_RESTART || 'powershell -Command "Restart-Service MSSQLSERVER -Force"';
const sqlStatusCmd = process.env.SSH_CMD_SQL_STATUS || 'powershell -Command "(Get-Service MSSQLSERVER).Status"';

const animonRestartCmd = process.env.SSH_CMD_ANIMON_RESTART || 'powershell -Command "Restart-Service -Name \'AnanimWindowsMonitorV6Final\' -Force -ErrorAction SilentlyContinue; exit 0"';
const animonStatusCmd = process.env.SSH_CMD_ANIMON_STATUS || 'powershell -Command "(Get-Service -Name \'AnanimWindowsMonitorV6Final\' -ErrorAction SilentlyContinue).Status"';

/** Comandos de restart para SQL Server e serviços Windows (Alfa Agro). */
export const COMMANDS_SQL = {
  'sql-server': sqlRestartCmd,
  AnanimWindowsMonitorV6Final: animonRestartCmd,
};

/** Comandos de validação de status para SQL Server e serviços Windows (Alfa Agro). */
export const HEALTH_COMMANDS_SQL = {
  'sql-server': sqlStatusCmd,
  AnanimWindowsMonitorV6Final: animonStatusCmd,
};

/** Escapa nome do serviço para uso em PowerShell (aspas simples). */
function escapePsName(name) {
  return (name || '').replace(/'/g, "''");
}

/**
 * Comando para reiniciar um serviço Windows por nome (uso em clientes SQL com lista dinâmica).
 * Se o id estiver em COMMANDS_SQL, usa o comando fixo; senão gera Restart-Service -Name '<id>'.
 */
export function getSqlRestartCommand(serviceId) {
  if (COMMANDS_SQL[serviceId]) return COMMANDS_SQL[serviceId];
  const safe = escapePsName(serviceId);
  return `powershell -Command "$svc = Get-Service -Name '${safe}' -ErrorAction SilentlyContinue; if ($null -ne $svc) { if ($svc.Status -eq 'Stopped') { Start-Service -Name '${safe}' -ErrorAction SilentlyContinue } else { Restart-Service -Name '${safe}' -Force -ErrorAction SilentlyContinue } }; exit 0"`;
}

/**
 * Comando para obter status de um serviço Windows por nome (uso em clientes SQL com lista dinâmica).
 */
export function getSqlHealthCommand(serviceId) {
  if (HEALTH_COMMANDS_SQL[serviceId]) return HEALTH_COMMANDS_SQL[serviceId];
  const safe = escapePsName(serviceId);
  return `powershell -Command "(Get-Service -Name '${safe}' -ErrorAction SilentlyContinue).Status"`;
}

/**
 * Comando para reiniciar vários serviços Windows de uma vez (um grupo).
 * Restart-Service aceita múltiplos nomes.
 */
export function getSqlRestartGroupCommand(serviceIds) {
  if (!Array.isArray(serviceIds) || serviceIds.length === 0) return null;
  const names = serviceIds.map((id) => "'" + escapePsName(id) + "'").join(',');
  return `powershell -Command "foreach ($name in @(${names})) { $svc = Get-Service -Name $name -ErrorAction SilentlyContinue; if ($null -ne $svc) { if ($svc.Status -eq 'Stopped') { Start-Service -Name $name -ErrorAction SilentlyContinue } else { Restart-Service -Name $name -Force -ErrorAction SilentlyContinue } } }; exit 0"`;
}

/**
 * Comando para obter status de vários serviços em uma única chamada.
 * Saída: uma linha por serviço com Status (Running/Stopped).
 */
export function getSqlHealthGroupCommand(serviceIds) {
  if (!Array.isArray(serviceIds) || serviceIds.length === 0) return null;
  const names = serviceIds.map((id) => "'" + escapePsName(id) + "'").join(',');
  return `powershell -Command "Get-Service -Name ${names} -ErrorAction SilentlyContinue | ForEach-Object { $_.Status }"`;
}

/** Tamanho do lote para health no servidor web (evita linha de comando longa via SSH). */
const HEALTH_GROUP_BATCH_SIZE = 8;

/** Retorna comandos em lotes para getSqlHealthGroupCommand. */
export function getSqlHealthGroupCommandBatches(serviceIds) {
  if (!Array.isArray(serviceIds) || serviceIds.length === 0) return [];
  const batches = [];
  for (let i = 0; i < serviceIds.length; i += HEALTH_GROUP_BATCH_SIZE) {
    const chunk = serviceIds.slice(i, i + HEALTH_GROUP_BATCH_SIZE);
    const cmd = getSqlHealthGroupCommand(chunk);
    if (cmd) batches.push(cmd);
  }
  return batches;
}

function getSqlConnectionConfig() {
  const config = {
    host: sqlHost,
    port: sqlPort,
    username: sqlUser,
    tryKeyboard: true,
    readyTimeout: 20000,
  };
  if (sqlPrivateKeyPath) {
    config.privateKey = fs.readFileSync(sqlPrivateKeyPath, 'utf8');
  } else if (sqlPassword) {
    config.password = sqlPassword;
  }
  return config;
}

export function isSqlConfigured() {
  const hasSqlCreds = sqlHost && sqlUser && (sqlPrivateKeyPath || sqlPassword);
  if (sqlJumpHost) {
    const hasJumpCreds = sqlJumpUser && (sqlJumpPrivateKeyPath || sqlJumpPassword);
    return !!(hasSqlCreds && hasJumpCreds);
  }
  return !!hasSqlCreds;
}

/** Indica se a conexão com a VM SQL usa jump host (VM Web). */
export function isSqlJumpHostConfigured() {
  return !!(sqlJumpHost && sqlJumpUser && (sqlJumpPrivateKeyPath || sqlJumpPassword));
}

function getSqlJumpConnectionConfig() {
  const config = {
    host: sqlJumpHost,
    port: sqlJumpPort,
    username: sqlJumpUser,
    tryKeyboard: true,
    readyTimeout: 20000,
  };
  if (sqlJumpPrivateKeyPath) {
    config.privateKey = fs.readFileSync(sqlJumpPrivateKeyPath, 'utf8');
  } else if (sqlJumpPassword) {
    config.password = sqlJumpPassword;
  }
  return config;
}

/** Monta config de conexão SQL a partir de objeto de credenciais (ex.: cliente credentials.enc). */
function getSqlConnectionConfigFromCredentials(creds) {
  const c = {
    host: creds.SSH_SQL_HOST,
    port: Number(creds.SSH_SQL_PORT || '22'),
    username: creds.SSH_SQL_USER,
    tryKeyboard: true,
    readyTimeout: 20000,
  };
  if (creds.SSH_SQL_PRIVATE_KEY_PATH && fs.existsSync(creds.SSH_SQL_PRIVATE_KEY_PATH)) {
    c.privateKey = fs.readFileSync(creds.SSH_SQL_PRIVATE_KEY_PATH, 'utf8');
  } else if (creds.SSH_SQL_PASSWORD) {
    c.password = creds.SSH_SQL_PASSWORD;
  }
  return c;
}

function getSqlJumpConnectionConfigFromCredentials(creds) {
  if (!creds.SSH_SQL_JUMP_HOST || !creds.SSH_SQL_JUMP_USER) return null;
  const c = {
    host: creds.SSH_SQL_JUMP_HOST,
    port: Number(creds.SSH_SQL_JUMP_PORT || '22'),
    username: creds.SSH_SQL_JUMP_USER,
    tryKeyboard: true,
    readyTimeout: 20000,
  };
  if (creds.SSH_SQL_JUMP_PRIVATE_KEY_PATH && fs.existsSync(creds.SSH_SQL_JUMP_PRIVATE_KEY_PATH)) {
    c.privateKey = fs.readFileSync(creds.SSH_SQL_JUMP_PRIVATE_KEY_PATH, 'utf8');
  } else if (creds.SSH_SQL_JUMP_PASSWORD) {
    c.password = creds.SSH_SQL_JUMP_PASSWORD;
  }
  return c;
}

/** Monta config de conexão SSH para servidor web (SSH_WEB_*) a partir de credenciais do cliente. */
export function getWebConnectionConfigFromCredentials(creds) {
  if (!creds || !creds.SSH_WEB_HOST || !creds.SSH_WEB_USER) return null;
  const c = {
    host: creds.SSH_WEB_HOST,
    port: Number(creds.SSH_WEB_PORT || '22'),
    username: creds.SSH_WEB_USER,
    tryKeyboard: true,
    readyTimeout: 20000,
  };
  if (creds.SSH_WEB_PRIVATE_KEY_PATH && fs.existsSync(creds.SSH_WEB_PRIVATE_KEY_PATH)) {
    c.privateKey = fs.readFileSync(creds.SSH_WEB_PRIVATE_KEY_PATH, 'utf8');
  } else if (creds.SSH_WEB_PASSWORD) {
    c.password = creds.SSH_WEB_PASSWORD;
  }
  return c;
}

/**
 * Executa comando na VM Windows (SQL) via SSH (OpenSSH no Windows).
 * Se SSH_SQL_JUMP_HOST estiver definido: conecta na VM Web (jump) e, por ela, na VM SQL.
 */
export function sshExecSql(command) {
  if (!sqlHost || !sqlUser) {
    return Promise.reject(new Error('SSH SQL não configurado: defina SSH_SQL_HOST e SSH_SQL_USER no .env'));
  }
  if (!sqlPrivateKeyPath && !sqlPassword) {
    return Promise.reject(new Error('Defina SSH_SQL_PRIVATE_KEY_PATH ou SSH_SQL_PASSWORD no .env'));
  }

  if (sqlJumpHost && sqlJumpUser && (sqlJumpPrivateKeyPath || sqlJumpPassword)) {
    return sshExecSqlViaJump(command);
  }

  return new Promise((resolve, reject) => {
    const conn = new Client();
    let stdout = '';
    let stderr = '';

    conn
      .on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            return reject(err);
          }
          stream
            .on('close', (code) => {
              conn.end();
              resolve({ code: code ?? -1, stdout: stdout.trim(), stderr: stderr.trim() });
            })
            .on('data', (data) => { stdout += data.toString(); })
            .stderr.on('data', (data) => { stderr += data.toString(); });
        });
      })
      .on('error', (err) => reject(err))
      .connect(getSqlConnectionConfig());
  });
}

/**
 * Conexão em dois saltos: Backend → VM Web (jump) → VM SQL.
 * Usa forwardOut no jump para abrir canal TCP até sqlHost:sqlPort e conecta SSH sobre esse canal.
 */
function sshExecSqlViaJump(command) {
  return new Promise((resolve, reject) => {
    const jumpConn = new Client();
    let stdout = '';
    let stderr = '';

    jumpConn
      .on('ready', () => {
        jumpConn.forwardOut('127.0.0.1', 0, sqlHost, sqlPort, (err, stream) => {
          if (err) {
            jumpConn.end();
            return reject(err);
          }
          const sqlConn = new Client();
          const sqlConfig = {
            sock: stream,
            username: sqlUser,
            tryKeyboard: true,
            readyTimeout: 20000,
          };
          if (sqlPrivateKeyPath) {
            sqlConfig.privateKey = fs.readFileSync(sqlPrivateKeyPath, 'utf8');
          } else {
            sqlConfig.password = sqlPassword;
          }
          sqlConn
            .on('ready', () => {
              sqlConn.exec(command, (execErr, execStream) => {
                if (execErr) {
                  sqlConn.end();
                  jumpConn.end();
                  return reject(execErr);
                }
                execStream
                  .on('close', (code) => {
                    sqlConn.end();
                    jumpConn.end();
                    resolve({ code: code ?? -1, stdout: stdout.trim(), stderr: stderr.trim() });
                  })
                  .on('data', (data) => { stdout += data.toString(); })
                  .stderr.on('data', (data) => { stderr += data.toString(); });
              });
            })
            .on('error', (err) => {
              jumpConn.end();
              reject(err);
            })
            .connect(sqlConfig);
        });
      })
      .on('error', (err) => reject(err))
      .connect(getSqlJumpConnectionConfig());
  });
}

/**
 * Executa comando na VM SQL usando credenciais do cliente (credentials.enc).
 * Suporta jump host quando SSH_SQL_JUMP_* estiver nas credenciais.
 */
function sshExecSqlViaJumpWithCredentials(jumpConfig, sqlConfig, command) {
  const sqlHost = sqlConfig.host;
  const sqlPort = sqlConfig.port || 22;
  return new Promise((resolve, reject) => {
    const jumpConn = new Client();
    let stdout = '';
    let stderr = '';

    jumpConn
      .on('ready', () => {
        jumpConn.forwardOut('127.0.0.1', 0, sqlHost, sqlPort, (err, stream) => {
          if (err) {
            jumpConn.end();
            return reject(err);
          }
          const sqlConn = new Client();
          const cfg = {
            sock: stream,
            username: sqlConfig.username,
            tryKeyboard: true,
            readyTimeout: 20000,
          };
          if (sqlConfig.privateKey) cfg.privateKey = sqlConfig.privateKey;
          else cfg.password = sqlConfig.password;
          sqlConn
            .on('ready', () => {
              sqlConn.exec(command, (execErr, execStream) => {
                if (execErr) {
                  sqlConn.end();
                  jumpConn.end();
                  return reject(execErr);
                }
                execStream
                  .on('close', (code) => {
                    sqlConn.end();
                    jumpConn.end();
                    resolve({ code: code ?? -1, stdout: stdout.trim(), stderr: stderr.trim() });
                  })
                  .on('data', (data) => { stdout += data.toString(); })
                  .stderr.on('data', (data) => { stderr += data.toString(); });
              });
            })
            .on('error', (err) => {
              jumpConn.end();
              reject(err);
            })
            .connect(cfg);
        });
      })
      .on('error', (err) => reject(err))
      .connect(jumpConfig);
  });
}

/**
 * Executa comando na VM SQL (Windows) usando objeto de credenciais (ex.: do credentials.enc do cliente).
 * @param {Record<string, string>} credentials - chaves SSH_SQL_HOST, SSH_SQL_USER, SSH_SQL_PASSWORD, opcionalmente SSH_SQL_JUMP_*
 * @param {string} command
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
export function sshExecSqlWithCredentials(credentials, command) {
  const sqlConfig = getSqlConnectionConfigFromCredentials(credentials);
  if (!sqlConfig.host || !sqlConfig.username || (!sqlConfig.privateKey && !sqlConfig.password)) {
    return Promise.reject(new Error('Credenciais SQL do cliente incompletas (SSH_SQL_HOST, SSH_SQL_USER e senha ou chave)'));
  }

  const jumpConfig = getSqlJumpConnectionConfigFromCredentials(credentials);
  if (jumpConfig) {
    return sshExecSqlViaJumpWithCredentials(jumpConfig, sqlConfig, command);
  }

  return new Promise((resolve, reject) => {
    const conn = new Client();
    let stdout = '';
    let stderr = '';
    conn
      .on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            return reject(err);
          }
          stream
            .on('close', (code) => {
              conn.end();
              resolve({ code: code ?? -1, stdout: stdout.trim(), stderr: stderr.trim() });
            })
            .on('data', (data) => { stdout += data.toString(); })
            .stderr.on('data', (data) => { stderr += data.toString(); });
        });
      })
      .on('error', (err) => reject(err))
      .connect(sqlConfig);
  });
}

function getConnectionConfig() {
  const config = {
    host,
    port,
    username: user,
    tryKeyboard: true,
    readyTimeout: 20000,
  };
  if (privateKeyPath) {
    config.privateKey = fs.readFileSync(privateKeyPath, 'utf8');
  } else if (password) {
    config.password = password;
  }
  return config;
}

export function isSshConfigured() {
  return !!(host && user && (privateKeyPath || password));
}

/**
 * Executa um comando na VM SUSE via SSH.
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
export function sshExec(command) {
  return new Promise((resolve, reject) => {
    if (!host || !user) {
      return reject(new Error('SSH não configurado: defina SSH_HOST e SSH_USER no .env'));
    }
    if (!privateKeyPath && !password) {
      return reject(new Error('Defina SSH_PRIVATE_KEY_PATH ou SSH_PASSWORD no .env'));
    }

    const conn = new Client();
    let stdout = '';
    let stderr = '';

    conn
      .on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            return reject(err);
          }
          stream
            .on('close', (code) => {
              conn.end();
              resolve({ code: code ?? -1, stdout: stdout.trim(), stderr: stderr.trim() });
            })
            .on('data', (data) => { stdout += data.toString(); })
            .stderr.on('data', (data) => { stderr += data.toString(); });
        });
      })
      .on('error', (err) => reject(err))
      .connect(getConnectionConfig());
  });
}

/**
 * Executa um comando na VM SUSE via SSH usando configuração fornecida (ex.: cliente HANA de hana-clients).
 * @param {{ host: string, port: number, username: string, password?: string, privateKey?: string }} connectionConfig
 * @param {string} command
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
export function sshExecWithConfig(connectionConfig, command) {
  if (!connectionConfig || !connectionConfig.host || !connectionConfig.username) {
    return Promise.reject(new Error('Configuração SSH incompleta (host e username obrigatórios)'));
  }
  if (!connectionConfig.privateKey && !connectionConfig.password) {
    return Promise.reject(new Error('Defina privateKey ou password na configuração SSH'));
  }

  const directTimeout = Number(process.env.SSH_DIRECT_HANDSHAKE_TIMEOUT || '45000');
  const config = {
    host: connectionConfig.host,
    port: connectionConfig.port || 22,
    username: connectionConfig.username,
    tryKeyboard: true,
    readyTimeout: directTimeout,
  };
  if (connectionConfig.privateKey) {
    config.privateKey = connectionConfig.privateKey;
  } else {
    config.password = connectionConfig.password;
  }

  return new Promise((resolve, reject) => {
    const conn = new Client();
    let stdout = '';
    let stderr = '';

    conn
      .on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            return reject(err);
          }
          stream
            .on('close', (code) => {
              conn.end();
              resolve({ code: code ?? -1, stdout: stdout.trim(), stderr: stderr.trim() });
            })
            .on('data', (data) => { stdout += data.toString(); })
            .stderr.on('data', (data) => { stderr += data.toString(); });
        });
      })
      .on('error', (err) => reject(err))
      .connect(config);
  });
}

/**
 * Executa comando na VM alvo (ex.: ROLANDHDB) via jump host (ex.: ROLANDWEB).
 * Backend → Jump → Target; usa forwardOut no jump para abrir canal até target e conecta SSH sobre o canal.
 * @param {{ host: string, port: number, username: string, password: string }} jumpConfig
 * @param {{ host: string, port: number, username: string, password?: string, privateKey?: string }} connectionConfig
 * @param {string} command
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
export function sshExecWithConfigViaJump(jumpConfig, connectionConfig, command) {
  if (!jumpConfig?.host || !jumpConfig?.username || !jumpConfig?.password) {
    return Promise.reject(new Error('Configuração do jump host incompleta (host, username e password)'));
  }
  if (!connectionConfig?.host || !connectionConfig?.username) {
    return Promise.reject(new Error('Configuração do destino incompleta (host e username)'));
  }
  if (!connectionConfig.privateKey && !connectionConfig.password) {
    return Promise.reject(new Error('Defina privateKey ou password na configuração do destino'));
  }
  const targetHost = connectionConfig.host;
  const targetPort = connectionConfig.port || 22;
  const handshakeTimeout = Number(process.env.SSH_JUMP_HANDSHAKE_TIMEOUT || '45000');
  const targetConfig = {
    sock: null,
    username: connectionConfig.username,
    tryKeyboard: true,
    readyTimeout: handshakeTimeout,
  };
  if (connectionConfig.privateKey) targetConfig.privateKey = connectionConfig.privateKey;
  else targetConfig.password = connectionConfig.password;

  return new Promise((resolve, reject) => {
    const jumpConn = new Client();
    let stdout = '';
    let stderr = '';

    jumpConn
      .on('ready', () => {
        jumpConn.forwardOut('127.0.0.1', 0, targetHost, targetPort, (err, stream) => {
          if (err) {
            jumpConn.end();
            return reject(err);
          }
          targetConfig.sock = stream;
          const targetConn = new Client();
          targetConn
            .on('ready', () => {
              targetConn.exec(command, (execErr, execStream) => {
                if (execErr) {
                  targetConn.end();
                  jumpConn.end();
                  return reject(execErr);
                }
                execStream
                  .on('close', (code) => {
                    targetConn.end();
                    jumpConn.end();
                    resolve({ code: code ?? -1, stdout: stdout.trim(), stderr: stderr.trim() });
                  })
                  .on('data', (data) => { stdout += data.toString(); })
                  .stderr.on('data', (data) => { stderr += data.toString(); });
              });
            })
            .on('error', (err) => {
              jumpConn.end();
              reject(err);
            })
            .connect(targetConfig);
        });
      })
      .on('error', (err) => reject(err))
      .connect({
        host: jumpConfig.host,
        port: jumpConfig.port || 22,
        username: jumpConfig.username,
        password: jumpConfig.password,
        tryKeyboard: true,
        readyTimeout: handshakeTimeout,
      });
  });
}
