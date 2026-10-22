using System;
using System.Diagnostics;
using System.IO;
using System.ServiceProcess;
using System.Threading;

namespace AnanimManagerAgent
{
    public class AgentService : ServiceBase
    {
        Timer timer;
        int running;
        // Catálogo de serviços: logo ao iniciar (inclusive depois de uma atualização) e a cada 6 h; falha tenta de novo em 30 min.
        DateTime nextCatalog = DateTime.UtcNow;

        public AgentService() { ServiceName = Paths.ServiceName; CanStop = true; }

        protected override void OnStart(string[] args)
        {
            Log.Write("Serviço iniciado (" + Build.Self + ").");
            timer = new Timer(Tick, null, TimeSpan.FromSeconds(15), Timeout.InfiniteTimeSpan);
        }

        protected override void OnStop() { if (timer != null) timer.Dispose(); Log.Write("Serviço parado."); }

        void Tick(object state)
        {
            int seconds = 30;
            try
            {
                AgentConfig c = ConfigStore.Load();
                if (!string.IsNullOrEmpty(c.AgentId) && Interlocked.Exchange(ref running, 1) == 0)
                {
                    try
                    {
                        if (DateTime.UtcNow >= nextCatalog)
                            nextCatalog = DateTime.UtcNow + (Agent.PublishCatalog(c).StartsWith("Serviços publicados") ? TimeSpan.FromHours(6) : TimeSpan.FromMinutes(30));
                        // Até 10 tarefas por ciclo; com tarefa feita, consulta de novo em 5 s (o cliente acompanha pela tela).
                        bool worked = false;
                        for (int i = 0; i < 10; i++)
                        {
                            string done = Agent.PollOnce(c);
                            if (done == "uninstall") { timer.Dispose(); timer = null; return; }
                            if (done == null) break;
                            worked = true;
                        }
                        if (worked) { seconds = 5; nextCatalog = DateTime.UtcNow.AddMinutes(1); }
                    }
                    finally { Interlocked.Exchange(ref running, 0); }
                }
            }
            catch (Exception ex) { Log.Write("Falha inesperada: " + ex.GetType().Name); }
            finally { if (timer != null) timer.Change(TimeSpan.FromSeconds(seconds), Timeout.InfiniteTimeSpan); }
        }
    }

    /// <summary>Remove o agente do servidor: avisa o painel (que revoga), apaga chave e configuração; um cmd separado para e apaga o serviço e as pastas.</summary>
    public static class Uninstaller
    {
        public static string Run(string reason)
        {
            AgentConfig c = ConfigStore.Load();
            string painel = "";
            if (!string.IsNullOrEmpty(c.AgentId))
            {
                int status = Agent.NotifyUninstalled(c, reason);
                painel = status == 200 ? " O painel foi avisado e revogou o agente." : " O painel não confirmou (sem conexão?): revogue o agente no painel.";
                try { Agent.DeleteKeyOf(c); } catch (Exception ex) { Log.Write("Chave não apagada: " + ex.Message); }
            }
            Log.Write("Desinstalando (" + (reason == "portal" ? "pedido do painel" : "desinstalação local") + ")." + painel);
            if (File.Exists(Paths.ConfigFile)) File.Delete(Paths.ConfigFile);
            // Este processo pode ser o próprio serviço ou o programa instalado: o cmd espera ~5 s, para e apaga o serviço e as pastas.
            string script = "ping -n 6 127.0.0.1 >nul & sc.exe stop " + Paths.ServiceName + " >nul & ping -n 4 127.0.0.1 >nul & sc.exe delete " + Paths.ServiceName +
                " >nul & rmdir /s /q \"" + Paths.InstallDir + "\" & rmdir /s /q \"" + Paths.DataDir + "\"";
            Process.Start(new ProcessStartInfo(Path.Combine(Environment.SystemDirectory, "cmd.exe"), "/c " + script)
                { UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = Environment.SystemDirectory });
            return "Agente desinstalado: chave e configuração apagadas; serviço e arquivos são removidos em alguns segundos." + painel;
        }
    }

    public static class ServiceManager
    {
        static int Sc(string arguments)
        {
            var info = new ProcessStartInfo(Path.Combine(Environment.SystemDirectory, "sc.exe"), arguments) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true };
            using (Process p = Process.Start(info)) { p.StandardOutput.ReadToEnd(); p.WaitForExit(); return p.ExitCode; }
        }

        public static bool Exists(string name)
        {
            foreach (ServiceController s in ServiceController.GetServices()) using (s) if (s.ServiceName == name) return true;
            return false;
        }

        public static string Status()
        {
            if (!Exists(Paths.ServiceName)) return "Não instalado";
            using (var s = new ServiceController(Paths.ServiceName)) return s.Status.ToString();
        }

        static void StopService(string name)
        {
            using (var s = new ServiceController(name))
                if (s.Status != ServiceControllerStatus.Stopped) { s.Stop(); s.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(30)); }
        }

        static string Self { get { return Path.GetFullPath(Process.GetCurrentProcess().MainModule.FileName); } }

        static bool RunningInstalled { get { return string.Equals(Self, Paths.InstalledExe, StringComparison.OrdinalIgnoreCase); } }

        /// <summary>Serviço instalado com um programa diferente deste (outra versão).</summary>
        public static bool Outdated()
        {
            return Exists(Paths.ServiceName) && !RunningInstalled && Build.Hash(Paths.InstalledExe) != Build.Hash(Self);
        }

        static void CopySelf()
        {
            Directory.CreateDirectory(Paths.InstallDir);
            Security.Lock(Paths.InstallDir);
            File.Copy(Self, Paths.InstalledExe, true);
        }

        /// <summary>Troca o programa do serviço instalado e o reinicia. Ativação, chave e configuração ficam intactas.</summary>
        public static string Update()
        {
            if (!Exists(Paths.ServiceName)) return "Serviço não instalado; use Instalar / atualizar serviço.";
            string before = Build.Of(Paths.InstalledExe), after = Build.Of(Self);
            if (!RunningInstalled) { StopService(Paths.ServiceName); CopySelf(); }
            Start();
            Log.Write("Serviço atualizado: " + before + " -> " + after + ".");
            return "Serviço atualizado (" + before + " → " + after + "). Ativação e configuração mantidas.";
        }

        public static string Install()
        {
            if (!RunningInstalled)
            {
                if (Exists(Paths.ServiceName)) StopService(Paths.ServiceName);
                CopySelf();
            }
            string bin = "\\\"" + Paths.InstalledExe + "\\\" --service";
            int code = Exists(Paths.ServiceName)
                ? Sc("config " + Paths.ServiceName + " binPath= \"" + bin + "\" start= delayed-auto obj= LocalSystem")
                : Sc("create " + Paths.ServiceName + " binPath= \"" + bin + "\" start= delayed-auto obj= LocalSystem DisplayName= \"Ananim Manager Agent\"");
            if (code != 0) throw new InvalidOperationException("sc.exe falhou (código " + code + ").");
            Sc("description " + Paths.ServiceName + " \"Publica os servicos deste servidor no Ananim Manager Painel e executa iniciar/parar/reiniciar dos servicos liberados.\"");
            Sc("failure " + Paths.ServiceName + " reset= 86400 actions= restart/60000/restart/60000//0");
            Log.Write("Serviço instalado.");
            Start();
            return "Serviço instalado e iniciado.";
        }

        public static void Start()
        {
            using (var s = new ServiceController(Paths.ServiceName))
                if (s.Status != ServiceControllerStatus.Running) { s.Start(); s.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(30)); }
        }

        public static void Stop() { if (Exists(Paths.ServiceName)) StopService(Paths.ServiceName); }

        public static void Remove()
        {
            if (!Exists(Paths.ServiceName)) return;
            Stop();
            if (Sc("delete " + Paths.ServiceName) != 0) throw new InvalidOperationException("sc.exe delete falhou.");
            Log.Write("Serviço removido.");
        }
    }
}
