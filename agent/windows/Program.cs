using System;
using System.ServiceProcess;
using System.Windows.Forms;

namespace AnanimManagerAgent
{
    static class Program
    {
        [STAThread]
        static int Main(string[] args)
        {
            if (args.Length == 1 && args[0] == "--service") { ServiceBase.Run(new AgentService()); return 0; }
            // Atualização sem tela (ex.: Start-Process AnanimManagerAgent.exe --update -Verb RunAs -Wait): resultado no log; 0 = ok.
            // Instalação silenciosa do instalador baixado com ativação (ex.: Start-Process .\AnanimManagerAgent-ECOAWEB.exe --auto -Verb RunAs -Wait).
            // 0 = ativado e serviço instalado; 1 = sem administrador; 4 = sem ativação embutida ou já ativado; 5 = ativação recusada.
            if (args.Length == 1 && args[0] == "--auto")
            {
                if (!Security.IsAdministrator()) return 1;
                try
                {
                    string result = Agent.ActivateEmbedded();
                    if (result == null) { Log.Write("--auto: sem ativação embutida ou servidor já ativado."); return 4; }
                    Log.Write("--auto: " + result);
                    return string.IsNullOrEmpty(ConfigStore.Load().AgentId) ? 5 : 0;
                }
                catch (Exception ex) { Log.Write("--auto falhou: " + ex.Message); return 3; }
            }
            if (args.Length == 1 && args[0] == "--update")
            {
                if (!Security.IsAdministrator()) return 1;
                try
                {
                    string result = ServiceManager.Update();
                    if (!ServiceManager.Exists(Paths.ServiceName)) { Log.Write(result); return 2; }
                    return 0;
                }
                catch (Exception ex) { Log.Write("Atualização falhou: " + ex.Message); return 3; }
            }
            if (!Security.IsAdministrator())
            {
                MessageBox.Show("Execute como administrador.", "Ananim Manager Agent", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return 1;
            }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
            return 0;
        }
    }
}
