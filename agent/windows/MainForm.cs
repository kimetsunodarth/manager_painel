using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace AnanimManagerAgent
{
    // Mesma paleta do conector do Cofre (AnanimCloud): fundo #070b14, ciano #00e5ff, verde-água #14b8a6.
    static class Theme
    {
        public static readonly Color Bg = Color.FromArgb(7, 11, 20), Card = Color.FromArgb(20, 27, 40), Field = Color.FromArgb(12, 17, 27),
            Line = Color.FromArgb(44, 54, 72), Text = Color.FromArgb(248, 250, 252), Muted = Color.FromArgb(148, 163, 184),
            Accent = Color.FromArgb(0, 229, 255), OnAccent = Color.FromArgb(4, 20, 27), Teal = Color.FromArgb(20, 184, 166), Warn = Color.FromArgb(245, 158, 11);
        public static readonly Font Body = new Font("Segoe UI", 9.75f), Title = new Font("Segoe UI Semibold", 15f), Section = new Font("Segoe UI Semibold", 10.5f),
            Mono = new Font("Consolas", 9.5f);
    }

    public class MainForm : Form
    {
        readonly TextBox url = Box(), code = Box(), patterns = Box(), output = Box();
        readonly Label agentStatus = Value(), serviceStatus = Value(), discovered = Value();
        readonly CheckBox restrict = new CheckBox { Text = "Restringir localmente (avançado)", AutoSize = true, ForeColor = Theme.Muted, Margin = new Padding(0, 8, 0, 0) };
        readonly TableLayoutPanel restrictPanel = new TableLayoutPanel { Dock = DockStyle.Top, AutoSize = true, ColumnCount = 3, BackColor = Theme.Card };
        readonly Button activate = Btn("Ativar", true), save = Btn("Salvar"), publish = Btn("Publicar serviços agora"),
            install = Btn("Instalar / atualizar serviço", true), start = Btn("Iniciar"), stop = Btn("Parar"), remove = Btn("Remover"), openLog = Btn("Abrir log");
        readonly Timer refresh = new Timer { Interval = 3000 };
        AgentConfig current;

        static TextBox Box() { return new TextBox { BackColor = Theme.Field, ForeColor = Theme.Text, BorderStyle = BorderStyle.FixedSingle, Font = Theme.Body }; }
        static Label Value() { return new Label { AutoSize = true, ForeColor = Theme.Text, MaximumSize = new Size(620, 0), Margin = new Padding(0, 8, 0, 0) }; }
        static Button Btn(string text, bool primary = false)
        {
            Button b = new Button { Text = text, AutoSize = true, MinimumSize = new Size(110, 34), FlatStyle = FlatStyle.Flat, Cursor = Cursors.Hand, Margin = new Padding(0, 4, 8, 4),
                BackColor = primary ? Theme.Accent : Theme.Field, ForeColor = primary ? Theme.OnAccent : Theme.Text, Font = primary ? new Font("Segoe UI Semibold", 9.75f) : Theme.Body };
            b.FlatAppearance.BorderColor = primary ? Theme.Accent : Theme.Line;
            return b;
        }

        Button[] Buttons { get { return new[] { activate, save, publish, install, start, stop, remove }; } }

        public MainForm()
        {
            Text = "Ananim Manager Agent — serviços deste servidor";
            Font = Theme.Body; BackColor = Theme.Bg; ForeColor = Theme.Text;
            MinimumSize = new Size(880, 680); Size = new Size(1000, 800); StartPosition = FormStartPosition.CenterScreen;

            TableLayoutPanel root = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, Padding = new Padding(20, 16, 20, 16), AutoScroll = true, BackColor = Theme.Bg };
            Controls.Add(root);
            root.Controls.Add(new Label { Text = "ananim  ·  Manager Agent", Font = Theme.Title, ForeColor = Theme.Text, AutoSize = true });
            root.Controls.Add(new Label { AutoSize = true, MaximumSize = new Size(900, 0), ForeColor = Theme.Muted, Margin = new Padding(0, 2, 0, 12),
                Text = "Liga este servidor ao Ananim Manager Painel. Publica a lista de serviços do Windows e executa iniciar/parar/reiniciar só dos serviços que o administrador liberou no painel. Serviços do sistema (WinRM, RDP, RPC, EventLog e o próprio agente) nunca são alterados." });

            TableLayoutPanel c1 = Card(root, "1. Conexão com o painel");
            Row(c1, "Endereço do painel", url, null);
            code.CharacterCasing = CharacterCasing.Upper; code.Font = Theme.Mono;
            Row(c1, "Código de ativação", code, activate);
            Row(c1, "Situação", agentStatus, null);
            Hint(c1, "Gere o código no painel: Servidores (conector) → projeto → servidor → Conectar. O código vale 1 hora e serve uma única vez.");

            TableLayoutPanel c2 = Card(root, "2. Serviços deste servidor (descoberta automática)");
            Row(c2, "Encontrados", discovered, null);
            Hint(c2, "Nada a cadastrar aqui: o agente envia a lista de serviços ao painel sozinho (ao iniciar, a cada 6 h e depois de cada tarefa). No painel, em Servidores (conector) → Serviços e acesso, o administrador escolhe o que aparece e para quem.");
            c2.SetColumnSpan(restrict, 3); c2.Controls.Add(restrict, 0, c2.RowCount); c2.RowCount++;
            Columns(restrictPanel);
            patterns.Multiline = true; patterns.Height = 80; patterns.ScrollBars = ScrollBars.Vertical; patterns.Font = Theme.Mono;
            Row(restrictPanel, "Só estes serviços", patterns, save);
            Hint(restrictPanel, "Opcional. Um padrão por linha, * vale qualquer trecho (ex.: SAPB1*, MSSQL$*). Preenchido = este servidor recusa o que não casar, mesmo que o painel libere.");
            c2.SetColumnSpan(restrictPanel, 3); c2.Controls.Add(restrictPanel, 0, c2.RowCount); c2.RowCount++;

            TableLayoutPanel c3 = Card(root, "3. Serviço do Windows");
            FlowLayoutPanel f3 = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, BackColor = Theme.Card };
            serviceStatus.Font = Theme.Section; serviceStatus.Margin = new Padding(0, 10, 16, 0);
            foreach (Control ctl in new Control[] { serviceStatus, install, start, stop, remove, publish, openLog }) f3.Controls.Add(ctl);
            c3.SetColumnSpan(f3, 3); c3.Controls.Add(f3, 0, c3.RowCount); c3.RowCount++;

            output.Multiline = true; output.ReadOnly = true; output.ScrollBars = ScrollBars.Vertical; output.Font = Theme.Mono;
            output.Dock = DockStyle.Fill; output.MinimumSize = new Size(0, 170); output.Margin = new Padding(0, 8, 0, 0);
            root.Controls.Add(output);

            activate.Click += delegate { DoActivate(); };
            save.Click += delegate { if (SaveAll()) Append("Configuração salva (criptografada)."); };
            publish.Click += delegate { Work("Publicando serviços...", delegate { if (!SaveAll()) return "Corrija os campos."; return Agent.PublishCatalog(ConfigStore.Load()); }); };
            install.Click += delegate { Work("Instalando serviço...", delegate { if (!SaveAll()) return "Corrija os campos antes de instalar."; return ServiceManager.Install(); }); };
            start.Click += delegate { Work("Iniciando...", delegate { ServiceManager.Start(); return "Serviço iniciado."; }); };
            stop.Click += delegate { Work("Parando...", delegate { ServiceManager.Stop(); return "Serviço parado."; }); };
            remove.Click += delegate { if (MessageBox.Show("Remover o serviço? A ativação e a configuração são mantidas.", Text, MessageBoxButtons.YesNo) == DialogResult.Yes) Work("Removendo...", delegate { ServiceManager.Remove(); return "Serviço removido."; }); };
            openLog.Click += delegate { ShowLog(); };
            restrict.CheckedChanged += delegate
            {
                restrictPanel.Visible = restrict.Checked;
                if (!restrict.Checked && patterns.Text.Trim().Length > 0) { patterns.Text = ""; if (SaveAll()) Append("Restrição local removida: vale o que o painel liberar."); }
            };

            LoadConfig();
            FillDiscovered();
            refresh.Tick += delegate { serviceStatus.Text = "Serviço: " + ServiceManager.Status(); }; refresh.Start();
            serviceStatus.Text = "Serviço: " + ServiceManager.Status();

            Append("Versão deste programa: " + Build.Self + (ServiceManager.Exists(Paths.ServiceName) ? " · instalada no serviço: " + Build.Of(Paths.InstalledExe) : ""));
            // Abrir uma versão nova com o serviço já instalado basta para atualizar: sem revogar, sem novo código.
            // No Shown, e não no construtor: Work usa BeginInvoke, que exige a janela criada.
            Shown += delegate { if (ServiceManager.Outdated()) Work("Serviço instalado com outra versão; atualizando...", ServiceManager.Update); };
        }

        static void Columns(TableLayoutPanel t)
        {
            t.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 190)); t.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100)); t.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        }

        static TableLayoutPanel Card(TableLayoutPanel root, string title)
        {
            Panel card = new Panel { Dock = DockStyle.Top, AutoSize = true, BackColor = Theme.Card, Padding = new Padding(16, 12, 16, 12), Margin = new Padding(0, 0, 0, 12) };
            TableLayoutPanel t = new TableLayoutPanel { Dock = DockStyle.Top, AutoSize = true, ColumnCount = 3, BackColor = Theme.Card };
            Columns(t);
            Label head = new Label { Text = title, Font = Theme.Section, ForeColor = Theme.Text, AutoSize = true, Margin = new Padding(0, 0, 0, 8) };
            t.Controls.Add(head, 0, 0); t.SetColumnSpan(head, 3); t.RowCount = 1;
            card.Controls.Add(t); root.Controls.Add(card);
            return t;
        }

        static void Row(TableLayoutPanel t, string label, Control input, Button action)
        {
            int row = t.RowCount; t.RowCount = row + 1; t.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            t.Controls.Add(new Label { Text = label, AutoSize = true, ForeColor = Theme.Muted, Margin = new Padding(0, 9, 8, 0) }, 0, row);
            input.Margin = new Padding(0, 4, 8, 4); if (input is TextBox) input.Dock = DockStyle.Fill;
            t.Controls.Add(input, 1, row);
            if (action != null) t.Controls.Add(action, 2, row);
        }

        static void Hint(TableLayoutPanel t, string text)
        {
            Label l = new Label { Text = text, AutoSize = true, ForeColor = Theme.Muted, MaximumSize = new Size(800, 0), Margin = new Padding(0, 6, 0, 0) };
            int row = t.RowCount; t.RowCount = row + 1; t.Controls.Add(l, 0, row); t.SetColumnSpan(l, 3);
        }

        void LoadConfig()
        {
            current = ConfigStore.Load();
            url.Text = current.ApiBaseUrl;
            patterns.Text = string.Join(Environment.NewLine, current.AllowPatterns);
            restrict.Checked = current.AllowPatterns.Count > 0; restrictPanel.Visible = restrict.Checked;
            bool active = !string.IsNullOrEmpty(current.AgentId);
            agentStatus.ForeColor = active ? Theme.Teal : Theme.Warn;
            agentStatus.Text = active ? "Conectado a " + current.ProjectName + " · " + current.EcsName + "  (ID " + current.AgentId.Substring(0, 8) + "…)" : "Não ativado";
        }

        /// <summary>Resumo do que o agente envia ao painel (Agent.Discover); a lista completa e a seleção ficam no painel.</summary>
        void FillDiscovered()
        {
            List<Dictionary<string, object>> list = Agent.Discover();
            int running = list.Count(s => Convert.ToString(s["status"]) == "Running");
            discovered.Text = list.Count + " serviços (" + running + " em execução)" + (string.IsNullOrEmpty(current.AgentId) ? " · serão enviados ao painel depois da ativação" : " · enviados ao painel automaticamente");
        }

        AgentConfig Collect()
        {
            AgentConfig c = current;
            c.ApiBaseUrl = url.Text.Trim().TrimEnd('/') + "/";
            c.AllowPatterns = patterns.Lines.Select(l => l.Trim()).Where(l => l.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            return c;
        }

        bool SaveAll()
        {
            AgentConfig c = Collect();
            string error = ConfigStore.ValidateUrl(c.ApiBaseUrl);
            if (error == null) foreach (string p in c.AllowPatterns) if (!Regex.IsMatch(p, @"^[A-Za-z0-9_.@$*-]{1,256}$")) { error = "Padrão inválido: " + p; break; }
            if (error != null) { Append("Corrija: " + error); return false; }
            c.ApiBaseUrl = c.ApiBaseUrl.TrimEnd('/');
            ConfigStore.Save(c);
            return true;
        }

        void DoActivate()
        {
            string normalized = Regex.Replace(code.Text.ToUpperInvariant(), @"[\s-]", "");
            if (!Regex.IsMatch(normalized, "^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$")) { Append("Código inválido. Use o código de 12 caracteres gerado no painel."); return; }
            if (!string.IsNullOrEmpty(current.AgentId) &&
                MessageBox.Show("Este servidor já está conectado a " + current.EcsName + ". Ativar de novo troca a chave e a conexão anterior deixa de valer. Continuar?", Text, MessageBoxButtons.YesNo) != DialogResult.Yes) return;
            if (!SaveAll()) return;
            AgentConfig c = ConfigStore.Load();
            Work("Ativando no painel...", delegate
            {
                string result = Agent.Activate(c, normalized);
                Invoke((Action)delegate { code.Text = ""; LoadConfig(); FillDiscovered(); });
                if (string.IsNullOrEmpty(c.AgentId) || !result.StartsWith("Conectado")) return result;
                return result + Environment.NewLine + Agent.PublishCatalog(c) + Environment.NewLine +
                    (ServiceManager.Exists(Paths.ServiceName) ? "Serviço já instalado; ele passa a usar a nova ativação no próximo ciclo." : "Próximo passo: Instalar / atualizar serviço.");
            });
        }

        void Work(string message, Func<string> job)
        {
            foreach (Button b in Buttons) b.Enabled = false;
            Append(message);
            Task.Factory.StartNew(job).ContinueWith(delegate(Task<string> t)
            {
                BeginInvoke((Action)delegate
                {
                    Append(t.IsFaulted ? "Erro: " + t.Exception.GetBaseException().Message : t.Result);
                    foreach (Button b in Buttons) b.Enabled = true;
                    serviceStatus.Text = "Serviço: " + ServiceManager.Status();
                });
            });
        }

        void ShowLog()
        {
            if (!File.Exists(Paths.LogFile)) { Append("Ainda não há log."); return; }
            string[] lines = File.ReadAllLines(Paths.LogFile, Encoding.UTF8);
            Form viewer = new Form { Text = "Log — " + Paths.LogFile, Size = new Size(1000, 600), StartPosition = FormStartPosition.CenterParent, BackColor = Theme.Bg };
            viewer.Controls.Add(new TextBox { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Both, WordWrap = false, Dock = DockStyle.Fill,
                BackColor = Theme.Field, ForeColor = Theme.Text, Font = Theme.Mono, Text = string.Join(Environment.NewLine, lines.Skip(Math.Max(0, lines.Length - 500))) });
            viewer.Show(this);
        }

        void Append(string text) { output.AppendText(DateTime.Now.ToString("HH:mm:ss") + "  " + text + Environment.NewLine); }
    }
}
