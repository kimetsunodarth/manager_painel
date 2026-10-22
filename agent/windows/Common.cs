using System;
using System.Collections.Generic;
using System.IO;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

namespace AnanimManagerAgent
{
    /// <summary>Configuração do agente (criptografada com DPAPI da máquina). A chave privada fica no repositório CNG da máquina.</summary>
    public class AgentConfig
    {
        public string ApiBaseUrl = "https://ananim-manager.ananim.com.br";
        public string AgentId = "";
        public string ProjectName = "";
        public string EcsName = "";
        /// <summary>Nome da chave CNG desta ativação (vazio = nome padrão). Cada ativação cria uma chave nova; a antiga só sai depois do aceite.</summary>
        public string KeyName = "";
        /// <summary>Política local: só serviços que casam com algum padrão (* = qualquer trecho). Vazia = o painel decide.</summary>
        public List<string> AllowPatterns = new List<string>();
    }

    public static class Paths
    {
        public const string ServiceName = "AnanimManagerAgent";
        public const string KeyName = "AnanimManagerAgent";
        public static readonly string DataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "AnanimManagerAgent");
        public static readonly string InstallDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "AnanimManagerAgent");
        public static string ConfigFile { get { return Path.Combine(DataDir, "config.dat"); } }
        public static string LogFile { get { return Path.Combine(DataDir, "agente.log"); } }
        public static string InstalledExe { get { return Path.Combine(InstallDir, "AnanimManagerAgent.exe"); } }
    }

    /// <summary>Versão pelo conteúdo do programa (data + início do SHA-256), sem a ativação embutida no fim do arquivo.</summary>
    public static class Build
    {
        /// <summary>8 hex do SHA-256 do programa; o mesmo para o exe genérico e para o baixado com ativação.</summary>
        public static string Hash(string exe)
        {
            if (!File.Exists(exe)) return "ausente";
            byte[] bytes = File.ReadAllBytes(exe);
            int length = Embedded.ProgramLength(bytes);
            using (SHA256 sha = SHA256.Create())
                return BitConverter.ToString(sha.ComputeHash(bytes, 0, length), 0, 4).Replace("-", "").ToLowerInvariant();
        }

        public static string Of(string exe)
        {
            if (!File.Exists(exe)) return "ausente";
            return File.GetLastWriteTime(exe).ToString("yyyy-MM-dd HH:mm") + " #" + Hash(exe);
        }

        public static string SelfPath { get { return System.Diagnostics.Process.GetCurrentProcess().MainModule.FileName; } }
        public static string Self { get { return Of(SelfPath); } }
    }

    /// <summary>Ativação gravada pelo painel no fim do exe baixado (Servidores → Conectar → Baixar instalador). Código de uso único.</summary>
    public class Embedded
    {
        const string Start = "\n#ANANIM-ATIVACAO#", End = "#FIM-ATIVACAO#";
        /// <summary>code: ativação de um servidor; enroll: chave do projeto (o painel liga à VM com o mesmo nome).</summary>
        public string url = "", code = "", enroll = "", projectName = "", ecsName = "";

        /// <summary>Tamanho do programa sem a ativação (o arquivo inteiro quando não há).</summary>
        public static int ProgramLength(byte[] bytes)
        {
            int from = Math.Max(0, bytes.Length - 4096);
            string tail = Encoding.GetEncoding(28591).GetString(bytes, from, bytes.Length - from);
            int i = tail.LastIndexOf(Start, StringComparison.Ordinal);
            return i < 0 ? bytes.Length : from + i;
        }

        public static Embedded Read(string exe)
        {
            try
            {
                byte[] bytes = File.ReadAllBytes(exe);
                int from = Math.Max(0, bytes.Length - 4096);
                string tail = Encoding.GetEncoding(28591).GetString(bytes, from, bytes.Length - from);
                int i = tail.LastIndexOf(Start, StringComparison.Ordinal), j = tail.LastIndexOf(End, StringComparison.Ordinal);
                if (i < 0 || j < i) return null;
                string json = Encoding.UTF8.GetString(Convert.FromBase64String(tail.Substring(i + Start.Length, j - i - Start.Length)));
                Embedded e = new JavaScriptSerializer().Deserialize<Embedded>(json);
                return e != null && (!string.IsNullOrEmpty(e.code) || !string.IsNullOrEmpty(e.enroll)) && ConfigStore.ValidateUrl(e.url) == null ? e : null;
            }
            catch (Exception) { return null; }
        }
    }

    public static class Security
    {
        public static void Lock(string dir)
        {
            Directory.CreateDirectory(dir);
            DirectorySecurity acl = new DirectorySecurity();
            acl.SetAccessRuleProtection(true, false);
            foreach (WellKnownSidType type in new[] { WellKnownSidType.LocalSystemSid, WellKnownSidType.BuiltinAdministratorsSid })
                acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(type, null), FileSystemRights.FullControl,
                    InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
            new DirectoryInfo(dir).SetAccessControl(acl);
        }

        public static bool IsAdministrator() { return new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator); }
    }

    public static class Log
    {
        static readonly object sync = new object();

        // Só estado, nomes de serviço e códigos de resultado; nunca respostas completas do painel.
        public static void Write(string message)
        {
            try
            {
                lock (sync)
                {
                    Security.Lock(Paths.DataDir);
                    FileInfo file = new FileInfo(Paths.LogFile);
                    if (file.Exists && file.Length > 2 * 1024 * 1024) { File.Copy(Paths.LogFile, Paths.LogFile + ".1", true); file.Delete(); }
                    string clean = Regex.Replace(message ?? "", @"[\r\n]+", " ");
                    if (clean.Length > 500) clean = clean.Substring(0, 500);
                    File.AppendAllText(Paths.LogFile, DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss") + "Z " + clean + Environment.NewLine, Encoding.UTF8);
                }
            }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }
    }

    public static class ConfigStore
    {
        const string Entropy = "AnanimManagerAgent/config/v1";

        public static AgentConfig Load()
        {
            if (!File.Exists(Paths.ConfigFile)) return new AgentConfig();
            byte[] plain = ProtectedData.Unprotect(File.ReadAllBytes(Paths.ConfigFile), Encoding.UTF8.GetBytes(Entropy), DataProtectionScope.LocalMachine);
            AgentConfig c = new JavaScriptSerializer().Deserialize<AgentConfig>(Encoding.UTF8.GetString(plain)) ?? new AgentConfig();
            if (c.AllowPatterns == null) c.AllowPatterns = new List<string>();
            return c;
        }

        public static void Save(AgentConfig c)
        {
            Security.Lock(Paths.DataDir);
            byte[] blob = ProtectedData.Protect(Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(c)), Encoding.UTF8.GetBytes(Entropy), DataProtectionScope.LocalMachine);
            string temp = Paths.ConfigFile + ".tmp";
            File.WriteAllBytes(temp, blob);
            if (File.Exists(Paths.ConfigFile)) File.Delete(Paths.ConfigFile);
            File.Move(temp, Paths.ConfigFile);
        }

        public static string ValidateUrl(string url)
        {
            Uri uri;
            if (!Uri.TryCreate(url ?? "", UriKind.Absolute, out uri) || uri.Scheme != Uri.UriSchemeHttps || uri.AbsolutePath != "/" ||
                !string.IsNullOrEmpty(uri.UserInfo) || !string.IsNullOrEmpty(uri.Query))
                return "Endereço do painel: somente a origem HTTPS, ex.: https://ananim-manager.ananim.com.br";
            return null;
        }
    }

    /// <summary>Regras que o agente aplica mesmo que o painel peça: bloqueados e política local.</summary>
    public static class Policy
    {
        static readonly HashSet<string> Blocked = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
            "AnanimManagerAgent", "WinRM", "sshd", "TermService", "EventLog", "RpcSs", "RpcEptMapper", "DcomLaunch", "LSM", "SamSs", "Schedule", "CryptSvc" };

        public static bool IsBlocked(string name, IEnumerable<string> fromServer)
        {
            if (Blocked.Contains(name ?? "")) return true;
            if (fromServer != null) foreach (string s in fromServer) if (string.Equals(s, name, StringComparison.OrdinalIgnoreCase)) return true;
            return false;
        }

        public static bool ValidName(string name) { return !string.IsNullOrEmpty(name) && Regex.IsMatch(name, @"^[A-Za-z0-9_.@-]{1,256}$"); }

        public static bool AllowedLocally(string name, List<string> patterns)
        {
            if (patterns == null || patterns.Count == 0) return true;
            foreach (string p in patterns)
            {
                if (string.IsNullOrWhiteSpace(p)) continue;
                string rx = "^" + Regex.Escape(p.Trim()).Replace("\\*", ".*") + "$";
                if (Regex.IsMatch(name, rx, RegexOptions.IgnoreCase)) return true;
            }
            return false;
        }
    }
}
