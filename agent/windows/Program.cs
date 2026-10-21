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
