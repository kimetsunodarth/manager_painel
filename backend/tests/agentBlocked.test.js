import test from 'node:test';
import assert from 'node:assert/strict';
import { isBlocked, validServiceName } from '../src/agent/agentCrypto.js';

test('serviços críticos do Linux são bloqueados (nome e prefixo)', () => {
  for (const name of ['sshd', 'ssh', 'dbus', 'NetworkManager', 'wicked', 'auditd', 'polkit', 'firewalld', 'ananim-manager-agent',
    'systemd-journald', 'systemd-logind', 'dbus-org.freedesktop.login1', 'getty@tty1', 'serial-getty@ttyS0', 'user@1000']) {
    assert.equal(isBlocked(name), true, name);
  }
});

test('serviços de aplicação no Linux seguem liberáveis', () => {
  for (const name of ['sapb1servertools', 'b1s', 'HANA_NDB_HDB00', 'nginx', 'sapinit']) {
    assert.equal(isBlocked(name), false, name);
    assert.equal(validServiceName(name), true, name);
  }
});
