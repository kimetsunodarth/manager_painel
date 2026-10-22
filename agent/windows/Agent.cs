using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.ServiceProcess;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

namespace AnanimManagerAgent
{
    public static class Agent
    {
        static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 4 * 1024 * 1024 };
        static readonly TimeSpan ServiceTimeout = TimeSpan.FromSeconds(120);

        static HttpClient Client()
        {
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
            // O WAF do portais recusa (403) POST com "Expect: 100-continue", que o .NET Framework envia por padrão.
            ServicePointManager.Expect100Continue = false;
            return new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(30), DefaultRequestHeaders = { ExpectContinue = false } };
        }

        // ---- Chave RSA da máquina (CNG, não exportável) ------------------------------------------------

        static readonly CngProvider Provider = CngProvider.MicrosoftSoftwareKeyStorageProvider;

        static string KeyOf(AgentConfig c) { return string.IsNullOrEmpty(c.KeyName) ? Paths.KeyName : c.KeyName; }

        static void DeleteKey(string name)
        {
            if (CngKey.Exists(name, Provider, CngKeyOpenOptions.MachineKey))
                CngKey.Open(name, Provider, CngKeyOpenOptions.MachineKey).Delete();
        }

        static CngKey NewKey(string name)
        {
            DeleteKey(name);
            CngKeyCreationParameters p = new CngKeyCreationParameters { KeyCreationOptions = CngKeyCreationOptions.MachineKey, ExportPolicy = CngExportPolicies.None, Provider = Provider };
            p.Parameters.Add(new CngProperty("Length", BitConverter.GetBytes(2048), CngPropertyOptions.None));
            return CngKey.Create(CngAlgorithm.Rsa, name, p);
        }

        static RSACng Rsa(AgentConfig c) { return new RSACng(CngKey.Open(KeyOf(c), Provider, CngKeyOpenOptions.MachineKey)); }

        static string B64Url(byte[] b) { return Convert.ToBase64String(b).TrimEnd('=').Replace('+', '-').Replace('/', '_'); }

        // ---- HTTP ---------------------------------------------------------------------------------------

        public class Reply { public int Status; public string Text; public Dictionary<string, object> Body; }

        static Reply Send(string url, byte[] body, Dictionary<string, string> headers)
        {
            using (HttpClient client = Client())
            using (HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Post, url))
            {
                request.Content = new ByteArrayContent(body);
                request.Content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/json");
                if (headers != null) foreach (var h in headers) request.Headers.Add(h.Key, h.Value);
                using (HttpResponseMessage response = client.SendAsync(request).GetAwaiter().GetResult())
                {
                    Reply r = new Reply { Status = (int)response.StatusCode, Text = response.Content.ReadAsStringAsync().GetAwaiter().GetResult() };
                    try { r.Body = Json.Deserialize<Dictionary<string, object>>(r.Text); } catch (ArgumentException) { } catch (InvalidOperationException) { }
                    return r;
                }
            }
        }

        /// <summary>403 sem JSON do painel = barrado antes dele (WAF/proxy); mostra o Request ID para quem administra o WAF.</summary>
        public static string Explain(Reply r)
        {
            if (r.Status == 403 && (r.Body == null || !r.Body.ContainsKey("error")))
            {
                Match id = Regex.Match(r.Text ?? "", @"Request ID:\s*([0-9a-fA-F]+)");
                return "Bloqueado antes do painel (HTTP 403 do WAF/proxy)." + (id.Success ? " WAF Request ID: " + id.Groups[1].Value : "");
            }
            string code = r.Body != null && r.Body.ContainsKey("error") ? Convert.ToString(r.Body["error"]) : "";
            return "HTTP " + r.Status + (code.Length > 0 ? " (" + code + ")" : "");
        }

        static Reply Signed(AgentConfig c, string path, byte[] body)
        {
            string stamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(), nonce = Guid.NewGuid().ToString("D"), hash;
            using (SHA256 sha = SHA256.Create()) hash = BitConverter.ToString(sha.ComputeHash(body)).Replace("-", "").ToLowerInvariant();
            byte[] message = Encoding.UTF8.GetBytes(string.Join("\n", new[] { "POST", path, c.AgentId, stamp, nonce, hash }));
            string signature;
            using (RSACng rsa = Rsa(c)) signature = Convert.ToBase64String(rsa.SignData(message, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1));
            return Send(c.ApiBaseUrl.TrimEnd('/') + path, body, new Dictionary<string, string> {
                { "X-Agent-Id", c.AgentId }, { "X-Timestamp", stamp }, { "X-Nonce", nonce }, { "X-Signature", signature } });
        }

        static byte[] JsonBytes(object o) { return Encoding.UTF8.GetBytes(Json.Serialize(o)); }

        // ---- Ativação -----------------------------------------------------------------------------------

        /// <summary>
        /// Instalador baixado do painel com ativação embutida: ativa e instala/atualiza o serviço sem digitar código.
        /// Devolve null quando não há o que fazer (sem ativação embutida ou este servidor já está ativado).
        /// </summary>
        public static string ActivateEmbedded()
        {
            Embedded e = Embedded.Read(Build.SelfPath);
            AgentConfig c = ConfigStore.Load();
            if (e == null || !string.IsNullOrEmpty(c.AgentId)) return null;
            c.ApiBaseUrl = e.url.TrimEnd('/');
            ConfigStore.Save(c);
            Log.Write("Instalador com ativação embutida: " + (string.IsNullOrEmpty(e.code) ? "projeto " + e.projectName : e.ecsName) + ".");
            string result = string.IsNullOrEmpty(e.code) ? Enroll(c, e.enroll) : Activate(c, Regex.Replace(e.code.ToUpperInvariant(), @"[\s-]", ""));
            if (string.IsNullOrEmpty(c.AgentId)) return result;
            string service = ServiceManager.Exists(Paths.ServiceName) ? ServiceManager.Update() : ServiceManager.Install();
            return result + Environment.NewLine + service + Environment.NewLine + "Os serviços deste servidor aparecem no painel em cerca de 1 minuto.";
        }

        public static string Activate(AgentConfig c, string code) { return Register(c, "/api/agent/activate", "code", code); }

        /// <summary>Cadastro pela chave do projeto (instalador baixado pelo projeto): o painel liga à VM com o mesmo nome deste servidor.</summary>
        public static string Enroll(AgentConfig c, string token) { return Register(c, "/api/agent/enroll", "enrollToken", token); }

        static string Register(AgentConfig c, string path, string campo, string valor)
        {
            string id = Guid.NewGuid().ToString("D"), keyName = Paths.KeyName + "-" + id.Substring(0, 8);
            Dictionary<string, object> jwk;
            // Chave nova com nome próprio: código errado ou painel fora do ar não derruba a ativação que já funciona.
            using (CngKey key = NewKey(keyName))
            using (RSACng rsa = new RSACng(key))
            {
                RSAParameters p = rsa.ExportParameters(false);
                jwk = new Dictionary<string, object> { { "kty", "RSA" }, { "n", B64Url(p.Modulus) }, { "e", B64Url(p.Exponent) } };
            }
            Reply r;
            try
            {
                r = Send(c.ApiBaseUrl.TrimEnd('/') + path, JsonBytes(new Dictionary<string, object> {
                    { campo, valor }, { "agentId", id }, { "publicKey", jwk }, { "hostname", Environment.MachineName }, { "os", "windows" }, { "agentVersion", Build.Self } }), null);
            }
            catch (Exception) { DeleteKey(keyName); return "Sem conexão com o painel. Confira endereço, DNS, firewall e o certificado HTTPS."; }
            Log.Write("Ativação: HTTP " + r.Status + ".");
            if (r.Status != 201 || r.Body == null)
            {
                DeleteKey(keyName);
                if (r.Status == 403 && r.Body != null)
                    return campo == "code" ? "Código inválido, expirado ou já usado. Gere outro no painel (Servidores → Conectar)."
                                           : "Este instalador do projeto venceu ou foi invalidado. Baixe outro no painel (Servidores → projeto → Baixar instalador do projeto).";
                if (r.Status == 429) return "Muitas tentativas inválidas; aguarde 10 minutos.";
                return "O painel recusou a ativação: " + Explain(r);
            }
            c.AgentId = id;
            c.ProjectName = Convert.ToString(r.Body["projectName"]);
            c.EcsName = Convert.ToString(r.Body["ecsName"]);
            string oldKey = KeyOf(c);
            c.KeyName = keyName;
            ConfigStore.Save(c);
            if (oldKey != keyName) DeleteKey(oldKey);
            bool pendente = r.Body.ContainsKey("pending") && Convert.ToBoolean(r.Body["pending"]);
            if (pendente && string.IsNullOrEmpty(c.ProjectName))
                return "Cadastrado no painel como " + Environment.MachineName + ". Falta só o administrador escolher o projeto e o servidor em Servidores (conector) → Aguardando vínculo; depois disso nada mais é preciso aqui.";
            return pendente
                ? "Cadastrado no projeto " + c.ProjectName + ". Nenhum servidor do projeto tem o nome " + Environment.MachineName + " (ou ele já tem conector): escolha o servidor no painel, em Servidores → Aguardando vínculo."
                : "Conectado a " + c.ProjectName + " · " + c.EcsName + ".";
        }

        // ---- Catálogo de serviços -----------------------------------------------------------------------

        static string StartTypeOf(ServiceController s)
        {
            try { return s.StartType.ToString(); } catch (InvalidOperationException) { return "Unknown"; }
        }

        public static List<Dictionary<string, object>> Discover()
        {
            List<Dictionary<string, object>> list = new List<Dictionary<string, object>>();
            foreach (ServiceController s in ServiceController.GetServices())
                using (s)
                {
                    if (!Policy.ValidName(s.ServiceName) || Policy.IsBlocked(s.ServiceName, null)) continue;
                    list.Add(new Dictionary<string, object> { { "name", s.ServiceName }, { "displayName", s.DisplayName }, { "status", s.Status.ToString() }, { "startType", StartTypeOf(s) } });
                }
            return list.OrderBy(d => Convert.ToString(d["displayName"])).Take(2000).ToList();
        }

        /// <summary>Envia o catálogo comprimido num campo só (o WAF recusa JSON com milhares de campos).</summary>
        public static string PublishCatalog(AgentConfig c)
        {
            if (string.IsNullOrEmpty(c.AgentId)) return "Agente não ativado.";
            List<Dictionary<string, object>> services = Discover();
            byte[] inner = JsonBytes(new Dictionary<string, object> { { "agentVersion", Build.Self }, { "services", services } });
            byte[] packed;
            using (MemoryStream ms = new MemoryStream())
            {
                using (GZipStream gz = new GZipStream(ms, CompressionMode.Compress, true)) gz.Write(inner, 0, inner.Length);
                packed = ms.ToArray();
            }
            Reply r = Signed(c, "/api/agent/catalog", JsonBytes(new Dictionary<string, object> { { "format", "gzip-base64-json" }, { "data", Convert.ToBase64String(packed) } }));
            string result = r.Status == 200 ? "Serviços publicados no painel: " + Convert.ToString(r.Body["services"]) + "." : "Catálogo recusado: " + Explain(r);
            Log.Write(result);
            return result;
        }

        // ---- Tarefas ------------------------------------------------------------------------------------

        public class Outcome { public string Status = "failed"; public string Code = "agent_error"; public string Message = ""; public string ServiceStatus = ""; }

        public static Outcome Execute(string name, string action, IEnumerable<string> blocked, List<string> allow)
        {
            Outcome o = new Outcome();
            if (!Policy.ValidName(name) || Policy.IsBlocked(name, blocked)) { o.Code = "blocked"; o.Message = "Serviço protegido; recusado pelo agente."; return o; }
            if (!Policy.AllowedLocally(name, allow)) { o.Code = "not_allowed_locally"; o.Message = "Fora da política local deste servidor."; return o; }
            try
            {
                using (ServiceController s = new ServiceController(name))
                {
                    ServiceControllerStatus before = s.Status;
                    if ((action == "stop" || action == "restart") && before != ServiceControllerStatus.Stopped)
                    {
                        s.Stop(); s.WaitForStatus(ServiceControllerStatus.Stopped, ServiceTimeout);
                    }
                    if (action == "start" || action == "restart")
                    {
                        s.Refresh();
                        if (s.Status != ServiceControllerStatus.Running) { s.Start(); s.WaitForStatus(ServiceControllerStatus.Running, ServiceTimeout); }
                    }
                    s.Refresh();
                    o.ServiceStatus = s.Status.ToString();
                    o.Status = "done";
                    o.Code = action == "stop" ? (before == ServiceControllerStatus.Stopped ? "already_stopped" : "stopped")
                        : action == "start" ? (before == ServiceControllerStatus.Running ? "already_running" : "started") : "restarted";
                    o.Message = "Status: " + o.ServiceStatus;
                }
            }
            catch (System.ServiceProcess.TimeoutException) { o.Code = "timeout"; o.Message = "O serviço não mudou de estado em 120 s."; }
            catch (InvalidOperationException e) { o.Code = "service_error"; o.Message = e.GetBaseException().Message; }
            catch (System.ComponentModel.Win32Exception e) { o.Code = "access_denied"; o.Message = e.Message; }
            return o;
        }

        /// <summary>Busca e executa no máximo uma tarefa. Devolve o resumo, ou null quando não há tarefa.</summary>
        public static string PollOnce(AgentConfig c)
        {
            if (string.IsNullOrEmpty(c.AgentId)) return null;
            Reply claim = Signed(c, "/api/agent/claim", JsonBytes(new Dictionary<string, object>()));
            if (claim.Status != 200 || claim.Body == null)
            {
                if (claim.Status == 401) Log.Write("Painel recusou o agente (revogado?).");
                else if (claim.Status == 403) Log.Write(Explain(claim));
                return null;
            }
            object jobObject;
            if (!claim.Body.TryGetValue("job", out jobObject) || jobObject == null) return null;
            var job = (Dictionary<string, object>)jobObject;
            List<string> blocked = claim.Body.ContainsKey("blocked") ? ((IEnumerable)claim.Body["blocked"]).Cast<object>().Select(Convert.ToString).ToList() : new List<string>();
            string name = Convert.ToString(job["serviceName"]), action = Convert.ToString(job["action"]);
            Outcome o = Execute(name, action, blocked, c.AllowPatterns);
            Reply result = Signed(c, "/api/agent/result", JsonBytes(new Dictionary<string, object> {
                { "jobId", job["jobId"] }, { "status", o.Status }, { "code", o.Code }, { "message", o.Message }, { "serviceStatus", o.ServiceStatus } }));
            string summary = action + " " + name + ": " + o.Status + " (" + o.Code + ")" + (result.Status == 200 ? "" : " [resultado não registrado: " + Explain(result) + "]");
            Log.Write(summary);
            return summary;
        }
    }
}
