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


if __name__ == '__main__':
    unittest.main()
