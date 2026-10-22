"""Testes do agente Linux que não precisam de root nem de HANA: python test_agente.py"""
import importlib.machinery
import importlib.util
import os
import unittest

_loader = importlib.machinery.SourceFileLoader('agente', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ananim-manager-agent'))
_spec = importlib.util.spec_from_loader('agente', _loader)
agente = importlib.util.module_from_spec(_spec)
_loader.exec_module(agente)

SAIDA = """22.10.2026 15:05:01
GetProcessList
OK
name, description, dispstatus, textstatus, starttime, elapsedtime, pid
hdbdaemon, HDB Daemon, GREEN, Running, 2026 10 21 01:11:27, 38:00:00, 7293
hdbnameserver, HDB Nameserver, GREEN, Running, 2026 10 21 01:11:30, 37:59:57, 7330
hdbindexserver, HDB Indexserver-NDB, GREEN, Running, 2026 10 21 01:11:35, 37:59:52, 8139
hdbxsengine, HDB XSEngine-NDB, YELLOW, Initializing, 2026 10 21 01:11:35, 37:59:52, 8145
hdbwebdispatcher, HDB Web Dispatcher, GRAY, Stopped, , , -1
"""


class ProcessosHana(unittest.TestCase):
    def test_le_o_getprocesslist(self):
        procs = agente.parse_process_list(SAIDA)
        self.assertEqual([p['name'] for p in procs], ['hdbdaemon', 'hdbnameserver', 'hdbindexserver', 'hdbxsengine', 'hdbwebdispatcher'])
        self.assertEqual(procs[2]['pid'], '8139')
        self.assertEqual(procs[3]['disp'], 'YELLOW')
        self.assertEqual(procs[4]['pid'], '', 'processo parado não tem PID')

    def test_nome_do_processo_no_painel(self):
        m = agente.PROC_RE.match('HANA_NDB_HDB00__hdbxsengine')
        self.assertEqual(m.groups(), ('NDB', '00', 'hdbxsengine'))
        self.assertTrue(agente.NAME_RE.match('HANA_NDB_HDB00__hdbxsengine'))

    def test_recusas_sem_tocar_no_hana(self):
        desligado = agente.restart_hana_process(('NDB', '00', 'hdbxsengine'), 'restart', False)
        self.assertEqual(desligado['code'], 'blocked')
        self.assertEqual(agente.restart_hana_process(('NDB', '00', 'hdbxsengine'), 'stop', True)['code'], 'not_supported')
        self.assertEqual(agente.restart_hana_process(('NDB', '00', 'hdbxsengine'), 'start', True)['code'], 'not_supported')
        for critico in ('hdbindexserver', 'hdbnameserver', 'hdbdaemon'):
            self.assertEqual(agente.restart_hana_process(('NDB', '00', critico), 'restart', True)['code'], 'blocked', critico)


class Desinstalar(unittest.TestCase):
    def setUp(self):
        import tempfile
        self.pasta = tempfile.mkdtemp()
        self.orig = (agente.CONF_DIR, agente.CONF_FILE, agente.signed, agente.run_cleanup)
        agente.CONF_DIR, agente.CONF_FILE = self.pasta, os.path.join(self.pasta, 'config.json')
        self.chave = os.path.join(self.pasta, 'agent-1234.key')
        open(self.chave, 'w').write('chave')
        self.conf = {'agentId': '11111111-1111-4111-8111-111111111111', 'keyFile': self.chave, 'apiBaseUrl': 'https://x'}
        agente.save_config(self.conf)
        self.avisos, self.limpezas = [], []

        class R:
            def __init__(self, body): self.status, self.body = 200, body
            def explain(self): return ''

        def falso_signed(conf, path, payload):
            self.avisos.append((path, payload))
            return R({'job': None, 'uninstall': True} if path == '/api/agent/claim' else {'status': 'removed'})
        agente.signed = falso_signed
        agente.run_cleanup = lambda detached: self.limpezas.append(detached)

    def tearDown(self):
        import shutil
        agente.CONF_DIR, agente.CONF_FILE, agente.signed, agente.run_cleanup = self.orig
        shutil.rmtree(self.pasta, ignore_errors=True)

    def test_pedido_do_painel_no_claim_remove_o_agente(self):
        self.assertEqual(agente.poll_once(self.conf), 'uninstall')
        self.assertIn(('/api/agent/uninstalled', {'reason': 'portal'}), self.avisos)
        self.assertFalse(os.path.exists(self.chave), 'a chave privada é apagada')
        self.assertFalse(os.path.exists(agente.CONF_FILE), 'a configuração é apagada')
        self.assertEqual(self.limpezas, [True], 'dentro do serviço a remoção do systemd roda destacada')

    def test_desinstalacao_local_avisa_o_painel_e_limpa(self):
        agente.uninstall(self.conf, 'local', detached=False)
        self.assertEqual(self.avisos, [('/api/agent/uninstalled', {'reason': 'local'})])
        self.assertFalse(os.path.exists(self.chave))
        self.assertEqual(self.limpezas, [False])

    def test_painel_fora_do_ar_nao_impede_a_remocao_local(self):
        def sem_rede(conf, path, payload):
            raise OSError('sem rede')
        agente.signed = sem_rede
        agente.uninstall(self.conf, 'local', detached=False)
        self.assertFalse(os.path.exists(self.chave))
        self.assertEqual(self.limpezas, [False])

    def test_comandos_de_limpeza_do_systemd(self):
        cmds = ' ; '.join(agente.cleanup_commands())
        for parte in ('systemctl disable --now ananim-manager-agent', agente.UNIT_FILE, agente.BIN_FILE, 'daemon-reload'):
            self.assertIn(parte, cmds)


if __name__ == '__main__':
    unittest.main()
