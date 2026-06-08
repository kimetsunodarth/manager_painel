(function () {
  // Usar mesma origem quando a página for servida pelo backend (ex: http://localhost:5000 ou 8088)
  const API_BASE = window.location.origin === "file://" ? "http://localhost:5000" : "";
  var apiUrlEl = document.getElementById("api-url-example");
  if (apiUrlEl) apiUrlEl.textContent = window.location.origin || "http://localhost:8088";

  function apiFetch(url, opts) {
    const o = Object.assign({ credentials: "include" }, opts || {});
    return fetch(url, o);
  }

  let currentUser = null;

  const loginScreen = document.getElementById("login-screen");
  const appEl = document.getElementById("app");
  const loginForm = document.getElementById("login-form");
  const loginError = document.getElementById("login-error");

  var bodyEl = document.getElementById("body");

  function showApp(user) {
    currentUser = user;
    if (bodyEl) { bodyEl.classList.remove("view-login"); bodyEl.classList.add("view-app"); }
    if (loginScreen) loginScreen.hidden = true;
    if (appEl) { appEl.hidden = false; appEl.setAttribute("aria-hidden", "false"); }
    var navUsuarios = document.getElementById("nav-usuarios");
    var navLog = document.getElementById("nav-log");
    if (navUsuarios) navUsuarios.style.display = (user && user.role === "admin") ? "" : "none";
    if (navLog) navLog.style.display = (user && user.role === "admin") ? "" : "none";
    loadAccounts();
  }

  function showLogin() {
    currentUser = null;
    if (bodyEl) { bodyEl.classList.remove("view-app"); bodyEl.classList.add("view-login"); }
    if (loginScreen) loginScreen.hidden = false;
    if (appEl) { appEl.hidden = true; appEl.setAttribute("aria-hidden", "true"); }
  }

  function checkAuth() {
    apiFetch(API_BASE + "/api/auth/me")
      .then(function (r) {
        if (r.ok) return r.json();
        showLogin();
        return null;
      })
      .then(function (user) {
        if (user) showApp(user);
      })
      .catch(function () { showLogin(); });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = document.getElementById("login-email").value.trim();
      var password = document.getElementById("login-password").value;
      var submitBtn = loginForm.querySelector('button[type="submit"]');
      if (loginError) { loginError.hidden = true; loginError.textContent = ""; }
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Entrando…"; }
      apiFetch(API_BASE + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email, password: password }),
      })
        .then(function (r) {
          return r.json().then(function (d) { return { ok: r.ok, data: d }; }).catch(function () {
            return { ok: r.ok, data: { error: r.ok ? "" : "E-mail ou senha incorretos" } };
          });
        })
        .then(function (x) {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Entrar"; }
          if (x.ok) showApp(x.data);
          else {
            if (loginError) { loginError.textContent = (x.data && x.data.error) || "E-mail ou senha incorretos"; loginError.hidden = false; }
          }
        })
        .catch(function () {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Entrar"; }
          if (loginError) {
            loginError.textContent = "Erro de conexão. Abra o painel em http://localhost:5000 e verifique se o backend está rodando.";
            loginError.hidden = false;
          }
        });
    });
  }

  (function initLoginMascot() {
    var mascotWrap = document.getElementById("login-mascot-wrap");
    var mascot = document.getElementById("login-mascot");
    var passwordInput = document.getElementById("login-password");
    var loginCard = document.querySelector(".login-card");
    if (!mascot || !loginCard) return;

    function updateCoveringEyes() {
      if (!mascot) return;
      var covering = passwordInput && (document.activeElement === passwordInput || (passwordInput.value && passwordInput.value.length > 0));
      mascot.classList.toggle("covering-eyes", !!covering);
    }
    if (passwordInput) {
      passwordInput.addEventListener("focus", updateCoveringEyes);
      passwordInput.addEventListener("blur", updateCoveringEyes);
      passwordInput.addEventListener("input", updateCoveringEyes);
    }

    function lookAtMouse(e) {
      if (!mascotWrap || !mascot) return;
      var rect = mascotWrap.getBoundingClientRect();
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;
      var dx = e.clientX - cx;
      var dy = e.clientY - cy;
      var angle = Math.atan2(dy, dx);
      var deg = (angle * 180 / Math.PI) - 90;
      var clamp = 14;
      deg = Math.max(-clamp, Math.min(clamp, deg));
      mascot.style.transform = "rotate(" + deg + "deg)";
    }
    loginCard.addEventListener("mousemove", lookAtMouse);
    loginCard.addEventListener("mouseleave", function () {
      if (mascot) mascot.style.transform = "rotate(0deg)";
    });
  })();

  if (document.getElementById("nav-logout")) {
    document.getElementById("nav-logout").addEventListener("click", function () {
      apiFetch(API_BASE + "/api/auth/logout", { method: "POST" }).then(function () { showLogin(); });
    });
  }

  const accountsSection = document.getElementById("accounts-section");
  const projectsSection = document.getElementById("projects-section");
  const ecsSection = document.getElementById("ecs-section");
  const accountCards = document.getElementById("account-cards");
  const accountsError = document.getElementById("accounts-error");
  const accountsErrorMsg = document.getElementById("accounts-error-msg");
  const errorHelp = document.getElementById("error-help");
  const retryBtn = document.getElementById("retry-btn");
  const currentAccountName = document.getElementById("current-account-name");
  const backBtn = document.getElementById("back-btn");
  const refreshProjectsBtn = document.getElementById("refresh-projects-btn");
  const regionBar = document.getElementById("region-bar");
  const regionSelect = document.getElementById("region-select");
  const projectsLoading = document.getElementById("projects-loading");
  const projectsError = document.getElementById("projects-error");
  const projectsList = document.getElementById("projects-list");
  const projectsSearchInput = document.getElementById("projects-search");
  var projectsCache = [];
  const ecsBackBtn = document.getElementById("ecs-back-btn");
  const ecsProjectName = document.getElementById("ecs-project-name");
  const ecsSearchInput = document.getElementById("ecs-search");
  const ecsLoading = document.getElementById("ecs-loading");
  const ecsError = document.getElementById("ecs-error");
  const ecsList = document.getElementById("ecs-list");

  var ecsServersCache = [];
  const schedulesSection = document.getElementById("schedules-section");
  const schedulesLoading = document.getElementById("schedules-loading");
  const schedulesError = document.getElementById("schedules-error");
  const schedulesList = document.getElementById("schedules-list");
  const schedulesSearchInput = document.getElementById("schedules-search");
  var schedulesCache = [];
  const scheduleFormBox = document.getElementById("schedule-form-box");
  const scheduleFormTitle = document.getElementById("schedule-form-title");
  const scheduleForm = document.getElementById("schedule-form");
  const scheduleNewBtn = document.getElementById("schedule-new-btn");
  const scheduleCancelBtn = document.getElementById("schedule-cancel-btn");
  const scheduleDaysAll = document.getElementById("schedule-days-all");
  const scheduleDaysContainer = document.getElementById("schedule-days");

  let currentAccount = null; // { id, name, regions }
  let ecsContext = null;     // { accountId, region, projectId, projectName }
  let accountsCache = null;  // para popular formulário de agendamento
  let scheduleAccountsSetupDone = false; // evita duplicar listener e permite recarregar projetos ao reabrir formulário

  // Regiões vêm somente da conta (backend config): ANANIMCLOUD=São Paulo, RAMO_SISTEMAS=São Paulo+Santiago, etc.

  const usersSection = document.getElementById("users-section");
  const actionLogSection = document.getElementById("action-log-section");
  const actionLogLoading = document.getElementById("action-log-loading");
  const actionLogList = document.getElementById("action-log-list");

  function showAccounts() {
    accountsSection.hidden = false;
    projectsSection.hidden = true;
    ecsSection.hidden = true;
    schedulesSection.hidden = true;
    if (usersSection) usersSection.hidden = true;
    if (actionLogSection) actionLogSection.hidden = true;
    document.querySelectorAll(".nav-link").forEach(function (el) {
      el.classList.toggle("active", el.id === "nav-contas");
    });
  }

  function showProjects(accountName) {
    accountsSection.hidden = true;
    projectsSection.hidden = false;
    ecsSection.hidden = true;
    schedulesSection.hidden = true;
    if (usersSection) usersSection.hidden = true;
    currentAccountName.textContent = accountName;
  }

  function showEcsView() {
    accountsSection.hidden = true;
    projectsSection.hidden = true;
    ecsSection.hidden = false;
    schedulesSection.hidden = true;
    if (usersSection) usersSection.hidden = true;
  }

  function showSchedulesView() {
    accountsSection.hidden = true;
    projectsSection.hidden = true;
    ecsSection.hidden = true;
    schedulesSection.hidden = false;
    if (usersSection) usersSection.hidden = true;
    if (actionLogSection) actionLogSection.hidden = true;
    document.querySelectorAll(".nav-link").forEach(function (el) {
      el.classList.toggle("active", el.id === "nav-agendamentos");
    });
    loadSchedules();
  }

  function showAccountsFromNav() {
    document.querySelectorAll(".nav-link").forEach(function (el) {
      el.classList.toggle("active", el.id === "nav-contas");
    });
    showAccounts();
  }

  function showUsersView() {
    accountsSection.hidden = true;
    projectsSection.hidden = true;
    ecsSection.hidden = true;
    schedulesSection.hidden = true;
    if (usersSection) usersSection.hidden = false;
    if (actionLogSection) actionLogSection.hidden = true;
    document.querySelectorAll(".nav-link").forEach(function (el) {
      el.classList.toggle("active", el.id === "nav-usuarios");
    });
    loadUsers();
  }

  function showActionLogView() {
    accountsSection.hidden = true;
    projectsSection.hidden = true;
    ecsSection.hidden = true;
    schedulesSection.hidden = true;
    if (usersSection) usersSection.hidden = true;
    if (actionLogSection) actionLogSection.hidden = false;
    document.querySelectorAll(".nav-link").forEach(function (el) {
      el.classList.toggle("active", el.id === "nav-log");
    });
    loadActionLog();
  }

  var actionLabels = {
    login: "Login",
    login_failed: "Login falhou",
    logout: "Logout",
    ecs_start: "ECS Start",
    ecs_stop: "ECS Stop",
    ecs_restart: "ECS Restart",
    schedule_create: "Agendamento criado",
    schedule_update: "Agendamento atualizado",
    schedule_delete: "Agendamento excluído",
    schedule_run: "Agendamento executado (cron)",
    schedule_cron_run: "Cron agendamentos (execução)",
    schedule_cron_check: "Cron agendamentos (verificação horária)",
    schedule_heartbeat: "Cron ativo (heartbeat)",
    user_create: "Usuário criado",
    user_reset_password: "Senha resetada",
    user_delete: "Usuário excluído"
  };

  var lastActionLogEntries = [];

  function formatLogDetails(details) {
    if (!details || !Object.keys(details).length) return "—";
    var parts = [];
    if (details.success === true) parts.push("sucesso");
    if (details.success === false && details.error) parts.push("erro: " + details.error);
    if (details.dueCount != null) {
      parts.push("devidos: " + details.dueCount + ", ok: " + (details.successCount || 0) + ", falhas: " + (details.failedCount || 0));
      if (details.results && details.results.length) {
        details.results.forEach(function (r) {
          parts.push("id " + r.scheduleId + " " + (r.serverName || "") + (r.ok ? " ✓" : " ✗ " + (r.error || "")));
        });
      }
    }
    if (details.serverTimeLocal || details.serverTime) {
      parts.push("hora servidor: " + (details.serverTimeLocal || details.serverTime));
    }
    if (details.totalSchedules != null) {
      parts.push("total agend.: " + details.totalSchedules + ", ativos: " + (details.enabledCount || 0));
    }
    if (details.message) parts.push(details.message);
    if (details.accountId) parts.push("conta: " + (details.accountName || details.accountId));
    if (details.region) parts.push("região: " + details.region);
    if (details.projectId) parts.push("projeto: " + details.projectId);
    if (details.serverId) parts.push("servidor: " + details.serverId);
    if (details.serverName) parts.push("nome: " + details.serverName);
    if (details.scheduleId) parts.push("agend. id: " + details.scheduleId);
    if (details.action) parts.push("ação: " + details.action);
    if (details.createdBy) parts.push("criado por: " + details.createdBy);
    if (details.modifiedBy) parts.push("alterado por: " + details.modifiedBy);
    if (details.targetEmail) parts.push("usuário: " + details.targetEmail);
    if (details.userId) parts.push("id usuário: " + details.userId);
    if (details.role) parts.push("perfil: " + details.role);
    return parts.length ? parts.join(" · ") : JSON.stringify(details).substring(0, 80);
  }

  function loadActionLog() {
    if (!actionLogList) return;
    actionLogList.innerHTML = "";
    if (actionLogLoading) actionLogLoading.hidden = false;
    apiFetch(API_BASE + "/api/action-log?limit=200")
      .then(function (r) {
        if (!r.ok) throw new Error("Acesso negado");
        return r.json();
      })
      .then(function (entries) {
        lastActionLogEntries = entries;
        if (actionLogLoading) actionLogLoading.hidden = true;
        if (entries.length === 0) {
          actionLogList.innerHTML = "<p class=\"empty-state\">Nenhuma ação registrada.</p>";
          return;
        }
        actionLogList.innerHTML =
          "<table class=\"action-log-table\"><thead><tr><th>Data/Hora</th><th>Usuário</th><th>Ação</th><th>Detalhes</th></tr></thead><tbody>" +
          entries.map(function (e) {
            var label = actionLabels[e.action] || e.action;
            var details = formatLogDetails(e.details);
            var at = e.at ? new Date(e.at).toLocaleString("pt-BR") : "—";
            return "<tr><td class=\"log-at\">" + escapeHtml(at) + "</td><td class=\"log-user\">" + escapeHtml(e.user) + "</td><td class=\"log-action\">" + escapeHtml(label) + "</td><td class=\"log-details\" title=\"" + escapeHtml(details) + "\">" + escapeHtml(details) + "</td></tr>";
          }).join("") + "</tbody></table>";
      })
      .catch(function () {
        if (actionLogLoading) actionLogLoading.hidden = true;
        actionLogList.innerHTML = "<p class=\"error\">Erro ao carregar o log.</p>";
      });
  }

  function exportActionLog() {
    if (lastActionLogEntries.length === 0) {
      alert("Carregue o log antes (clique em Atualizar).");
      return;
    }
    var label = actionLabels;
    var lines = ["Data/Hora\tUsuário\tAção\tDetalhes"];
    lastActionLogEntries.forEach(function (e) {
      var at = e.at ? new Date(e.at).toLocaleString("pt-BR") : "—";
      var details = formatLogDetails(e.details);
      lines.push(at + "\t" + (e.user || "—") + "\t" + (label[e.action] || e.action) + "\t" + details);
    });
    var blob = new Blob([lines.join("\r\n")], { type: "text/plain;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "log-acoes-" + new Date().toISOString().slice(0, 10) + ".txt";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (document.getElementById("nav-log")) {
    document.getElementById("nav-log").addEventListener("click", showActionLogView);
  }
  if (document.getElementById("action-log-refresh")) {
    document.getElementById("action-log-refresh").addEventListener("click", loadActionLog);
  }
  if (document.getElementById("action-log-export")) {
    document.getElementById("action-log-export").addEventListener("click", exportActionLog);
  }

  function setLoading(loading) {
    projectsLoading.hidden = !loading;
    if (loading) {
      projectsError.hidden = true;
      projectsList.innerHTML = "";
    }
  }

  function setError(message) {
    projectsLoading.hidden = true;
    projectsError.hidden = false;
    projectsError.textContent = message;
    projectsList.innerHTML = "";
  }

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function renderProjects(data) {
    projectsLoading.hidden = true;
    projectsError.hidden = true;
    const projects = (data && data.projects) || [];
    if (projects.length === 0) {
      projectsList.innerHTML = '<div class="empty-state">Nenhum projeto encontrado para esta conta.</div>';
      return;
    }
    // Usar somente as regiões da conta (ex.: ANANIMCLOUD só São Paulo)
    const regions = (currentAccount && currentAccount.regions && currentAccount.regions.length > 0)
      ? currentAccount.regions
      : [];
    regionBar.hidden = regions.length === 0 ? true : false;
    var previousRegion = regionSelect.value;
    regionSelect.innerHTML = regions.map(function (r) {
      return '<option value="' + escapeHtml(r.id) + '">' + escapeHtml(r.name) + '</option>';
    }).join("");
    if (regions.length >= 1) {
      if (previousRegion && regions.some(function (r) { return r.id === previousRegion; }))
        regionSelect.value = previousRegion;
      else
        regionSelect.value = regions[0].id;
    }
    if (!regionSelect.hasAttribute("data-ecs-listener")) {
      regionSelect.setAttribute("data-ecs-listener", "1");
      regionSelect.addEventListener("change", function () {
        if (currentAccount) loadProjects(currentAccount.id, currentAccount.name, currentAccount.regions);
      });
    }

    projectsList.innerHTML = projects
      .map(function (p) {
        const enabled = p.enabled !== false;
        return (
          '<div class="project-item">' +
          '<div><span class="name">' +
          escapeHtml(p.name || "(sem nome)") +
          "</span><br><span class=\"id\">" +
          escapeHtml(p.id || "") +
          "</span></div>" +
          '<span class="enabled ' +
          (enabled ? "" : "disabled") +
          '">' +
          (enabled ? "Ativo" : "Inativo") +
          "</span>" +
          (enabled
            ? '<span class="project-actions"><button type="button" class="btn btn-primary btn-small ver-ecs-btn" data-project-id="' +
              escapeHtml(p.id) +
              '" data-project-name="' +
              escapeHtml(p.name || "(sem nome)") +
              '">Ver ECS</button></span>'
            : "") +
          "</div>"
        );
      })
      .join("");

    projectsList.querySelectorAll(".ver-ecs-btn").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        const region = regionSelect.value;
        const projectId = btn.getAttribute("data-project-id");
        const projectName = btn.getAttribute("data-project-name");
        loadEcs(currentAccount.id, region, projectId, projectName);
      });
    });
  }

  if (projectsSearchInput) {
    projectsSearchInput.addEventListener("input", function () {
      var q = (projectsSearchInput.value || "").trim().toLowerCase();
      if (!q) {
        renderProjects({ projects: projectsCache });
        return;
      }
      var filtered = projectsCache.filter(function (p) {
        var name = (p.name || "").toLowerCase();
        var id = (p.id || "").toLowerCase();
        return name.indexOf(q) >= 0 || id.indexOf(q) >= 0;
      });
      if (filtered.length === 0) {
        projectsList.innerHTML = '<div class="empty-state">Nenhum projeto corresponde à pesquisa.</div>';
        return;
      }
      renderProjects({ projects: filtered });
    });
  }

  function loadProjects(accountId, accountName, regions) {
    currentAccount = { id: accountId, name: accountName, regions: regions || [] };
    showProjects(accountName);
    setLoading(true);
    var region = (regionSelect && regionSelect.value) || "";
    var validRegion = regions && regions.length && regions.some(function (r) { return r.id === region; });
    if (!validRegion && regions && regions.length) region = regions[0].id;
    if (!region && regions && regions[0]) region = regions[0].id;
    apiFetch(API_BASE + "/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: accountId, region: region }),
    })
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok) throw new Error(body.error || "Erro ao listar projetos");
          return body;
        });
      })
      .then(function (data) {
        projectsCache = (data && data.projects) || [];
        if (projectsSearchInput) projectsSearchInput.value = "";
        renderProjects(data);
      })
      .catch(function (err) {
        setError(err.message || "Falha ao carregar projetos.");
      });
  }

  function renderEcsTable(servers) {
    if (servers.length === 0) {
      ecsList.innerHTML = '<div class="empty-state">Nenhum ECS corresponde à pesquisa.</div>';
      return;
    }
    ecsList.innerHTML =
      '<table class="ecs-table">' +
      '<thead><tr><th>Nome</th><th>ID</th><th>Status</th><th>Ações</th></tr></thead><tbody>' +
      servers
        .map(function (s) {
          const status = (s.status || "").toUpperCase();
          const statusClass =
            status === "ACTIVE" ? "status-active" : status === "SHUTOFF" ? "status-shutoff" : "status-other";
          const canStart = status === "SHUTOFF";
          const canStop = status === "ACTIVE";
          const canRestart = status === "ACTIVE";
          const startDisabled = !canStart ? " disabled" : "";
          const stopDisabled = !canStop ? " disabled" : "";
          const restartDisabled = !canRestart ? " disabled" : "";
          return (
            "<tr>" +
            "<td>" + escapeHtml(s.name || "(sem nome)") + "</td>" +
            "<td><code>" + escapeHtml(s.id || "") + "</code></td>" +
            "<td class=\"" + statusClass + "\">" + escapeHtml(s.status || "—") + "</td>" +
            "<td class=\"actions\">" +
            '<button type="button" class="btn btn-small btn-start ecs-start" data-server-id="' + escapeHtml(s.id) + '"' + startDisabled + '>Start</button>' +
            '<button type="button" class="btn btn-small btn-stop ecs-stop" data-server-id="' + escapeHtml(s.id) + '"' + stopDisabled + '>Stop</button>' +
            '<button type="button" class="btn btn-small btn-restart ecs-restart" data-server-id="' + escapeHtml(s.id) + '"' + restartDisabled + '>Restart</button>' +
            '<button type="button" class="btn btn-small btn-agendar-ecs ecs-schedule-start" data-server-id="' + escapeHtml(s.id) + '" data-server-name="' + escapeHtml(s.name || "") + '">Agendar Start</button>' +
            '<button type="button" class="btn btn-small btn-agendar-ecs ecs-schedule-stop" data-server-id="' + escapeHtml(s.id) + '" data-server-name="' + escapeHtml(s.name || "") + '">Agendar Stop</button>' +
            '<button type="button" class="btn btn-small btn-agendar-ecs ecs-schedule-restart" data-server-id="' + escapeHtml(s.id) + '" data-server-name="' + escapeHtml(s.name || "") + '">Agendar Restart</button>' +
            "</td></tr>"
          );
        })
        .join("") +
      "</tbody></table>";

    ecsList.querySelectorAll(".ecs-start").forEach(function (btn) {
      btn.addEventListener("click", function () { if (this.disabled) return; doEcsAction("start", this.getAttribute("data-server-id")); });
    });
    ecsList.querySelectorAll(".ecs-stop").forEach(function (btn) {
      btn.addEventListener("click", function () { if (this.disabled) return; doEcsAction("stop", this.getAttribute("data-server-id")); });
    });
    ecsList.querySelectorAll(".ecs-restart").forEach(function (btn) {
      btn.addEventListener("click", function () { if (this.disabled) return; doEcsAction("restart", this.getAttribute("data-server-id")); });
    });
    ecsList.querySelectorAll(".ecs-schedule-start").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!ecsContext) return;
        showSchedulesView();
        openScheduleForm(null, {
          accountId: ecsContext.accountId,
          region: ecsContext.region,
          projectId: ecsContext.projectId,
          serverId: btn.getAttribute("data-server-id"),
          serverName: btn.getAttribute("data-server-name") || "(ECS)",
          action: "start",
        });
      });
    });
    ecsList.querySelectorAll(".ecs-schedule-stop").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!ecsContext) return;
        showSchedulesView();
        openScheduleForm(null, {
          accountId: ecsContext.accountId,
          region: ecsContext.region,
          projectId: ecsContext.projectId,
          serverId: btn.getAttribute("data-server-id"),
          serverName: btn.getAttribute("data-server-name") || "(ECS)",
          action: "stop",
        });
      });
    });
    ecsList.querySelectorAll(".ecs-schedule-restart").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!ecsContext) return;
        showSchedulesView();
        openScheduleForm(null, {
          accountId: ecsContext.accountId,
          region: ecsContext.region,
          projectId: ecsContext.projectId,
          serverId: btn.getAttribute("data-server-id"),
          serverName: btn.getAttribute("data-server-name") || "(ECS)",
          action: "restart",
        });
      });
    });
  }

  function loadEcs(accountId, region, projectId, projectName) {
    ecsContext = { accountId: accountId, region: region, projectId: projectId, projectName: projectName };
    ecsProjectName.textContent = projectName;
    showEcsView();
    ecsError.hidden = true;
    ecsLoading.hidden = false;
    ecsList.innerHTML = "";
    if (ecsSearchInput) { ecsSearchInput.value = ""; }
    apiFetch(API_BASE + "/api/ecs/servers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: accountId, region: region, projectId: projectId }),
    })
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok) throw new Error(body.error || "Erro ao listar ECS");
          return body;
        });
      })
      .then(function (data) {
        ecsLoading.hidden = true;
        ecsError.hidden = true;
        const rawList = (data && data.servers) || (data && data.server) || [];
        const servers = Array.isArray(rawList) ? rawList : [];
        const normalized = servers.map(function (s) {
          const r = s.server || s;
          return {
            id: r.id || r.uuid || "",
            name: r.name || "(sem nome)",
            status: (r.status || r["OS-EXT-STS:vm_state"] || "UNKNOWN").toUpperCase()
          };
        });
        ecsServersCache = normalized;
        if (normalized.length === 0) {
          ecsList.innerHTML = '<div class="empty-state">Nenhum servidor ECS neste projeto.</div>';
          return;
        }
        renderEcsTable(normalized);
      })
      .catch(function (err) {
        ecsLoading.hidden = true;
        ecsError.hidden = false;
        ecsError.textContent = err.message || "Falha ao carregar ECS.";
        ecsList.innerHTML = "";
      });
  }

  if (ecsSearchInput) {
    ecsSearchInput.addEventListener("input", function () {
      var q = (ecsSearchInput.value || "").trim().toLowerCase();
      if (!q) {
        renderEcsTable(ecsServersCache);
        return;
      }
      var filtered = ecsServersCache.filter(function (s) {
        var name = (s.name || "").toLowerCase();
        var id = (s.id || "").toLowerCase();
        return name.indexOf(q) >= 0 || id.indexOf(q) >= 0;
      });
      renderEcsTable(filtered);
    });
  }

  function doEcsAction(action, serverId) {
    if (!ecsContext) return;
    const urls = { start: API_BASE + "/api/ecs/start", stop: API_BASE + "/api/ecs/stop", restart: API_BASE + "/api/ecs/restart" };
    const url = urls[action] || urls.start;
    const body = {
      accountId: ecsContext.accountId,
      region: ecsContext.region,
      projectId: ecsContext.projectId,
      serverId: serverId,
    };
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "Erro na operação");
          return data;
        });
      })
      .then(function () {
        loadEcs(
          ecsContext.accountId,
          ecsContext.region,
          ecsContext.projectId,
          ecsContext.projectName
        );
      })
      .catch(function (err) {
        alert(err.message || "Falha ao executar " + action);
      });
  }

  function showAccountsError(msg) {
    accountCards.innerHTML = "";
    accountsError.hidden = false;
    accountsErrorMsg.textContent = msg || "Não foi possível carregar as contas.";
    if (errorHelp) errorHelp.hidden = false;
  }

  function hideAccountsError() {
    accountsError.hidden = true;
  }

  function loadAccounts() {
    hideAccountsError();
    apiFetch(API_BASE + "/api/accounts")
      .then(function (res) {
        if (res.status === 401) {
          showAccountsError("Sessão expirada ou não autenticado. Faça login novamente.");
          if (typeof showLogin === "function") showLogin();
          return Promise.reject(new Error("Unauthorized"));
        }
        if (!res.ok) throw new Error("Backend respondeu com erro");
        return res.json();
      })
      .then(function (accounts) {
        if (!accounts || accounts.length === 0) {
          showAccountsError("Nenhuma conta configurada.");
          return;
        }
        renderAccounts(accounts);
      })
      .catch(function (err) {
        if (err && err.message === "Unauthorized") return;
        var apiUrl = API_BASE || window.location.origin;
        showAccountsError(
          "Não foi possível carregar as contas. Verifique se o backend está rodando em " + apiUrl + "."
        );
      });
  }

  function renderAccounts(accounts) {
    hideAccountsError();
    accountCards.innerHTML = (accounts || [])
      .map(function (acc) {
        const regionsText = (acc.regions || []).map(function (r) { return r.name; }).join(", ");
        return (
          '<div class="card" data-account-id="' +
          escapeHtml(acc.id) +
          '" data-account-name="' +
          escapeHtml(acc.name) +
          '" data-account-regions=\'' +
          (JSON.stringify(acc.regions || []).replace(/'/g, "&#39;")) +
          '\'>' +
          "<h3>" +
          escapeHtml(acc.name) +
          "</h3>" +
          '<p class="regions">' +
          escapeHtml(regionsText || "—") +
          "</p>" +
          '<p class="action">Clique para listar projetos e ECS</p>' +
          "</div>"
        );
      })
      .join("");

    accountCards.querySelectorAll(".card").forEach(function (el) {
      el.addEventListener("click", function () {
        const id = el.getAttribute("data-account-id");
        const name = el.getAttribute("data-account-name");
        let regions = [];
        try {
          var raw = (el.getAttribute("data-account-regions") || "[]").replace(/&#39;/g, "'");
          regions = JSON.parse(raw);
        } catch (e) {}
        loadProjects(id, name, regions);
      });
    });
  }

  // ——— Agendamentos ———
  function loadSchedules() {
    schedulesError.hidden = true;
    schedulesLoading.hidden = false;
    schedulesList.innerHTML = "";
    Promise.all([
      apiFetch(API_BASE + "/api/schedules").then(function (res) { return res.ok ? res.json() : Promise.reject(new Error("Erro ao carregar agendamentos")); }),
      apiFetch(API_BASE + "/api/accounts").then(function (res) { return res.ok ? res.json() : []; }).catch(function () { return []; })
    ])
      .then(function (results) {
        var list = results[0] || [];
        var accounts = results[1] || [];
        if (accounts.length) accountsCache = accounts;
        schedulesLoading.hidden = true;
        schedulesCache = list;
        if (schedulesSearchInput) schedulesSearchInput.value = "";
        renderSchedulesList(schedulesCache);
      })
      .catch(function (err) {
        schedulesLoading.hidden = true;
        schedulesError.hidden = false;
        schedulesError.textContent = err.message || "Falha ao carregar agendamentos.";
        schedulesList.innerHTML = "";
      });
  }

  function formatDays(days) {
    if (!days || days.length === 0) return "Todos";
    const names = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    return days.map(function (d) { return names[d]; }).join(", ");
  }

  function getAccountDisplayName(accountId) {
    if (!accountId) return "?";
    if (accountsCache && Array.isArray(accountsCache)) {
      var acc = accountsCache.find(function (a) { return (a.id || "") === accountId; });
      if (acc) return (acc.name || acc.id || accountId).trim() || accountId;
    }
    return (accountId + "").trim() || "?";
  }

  function renderSchedulesList(list) {
    if (list.length === 0) {
      schedulesList.innerHTML = '<div class="empty-state">Nenhum agendamento. Clique em "Novo agendamento".</div>';
      return;
    }
    var byGroup = {};
    list.forEach(function (s) {
      var accountLabel = getAccountDisplayName(s.accountId);
      var projectLabel = (s.projectName || s.projectId || "(sem projeto)").trim() || "(sem projeto)";
      var key = accountLabel + "_" + projectLabel;
      if (!byGroup[key]) byGroup[key] = [];
      byGroup[key].push(s);
    });
    var keys = Object.keys(byGroup).sort();
    schedulesList.innerHTML = keys
      .map(function (folderName) {
        var items = byGroup[folderName];
        var header = '<div class="schedule-folder"><div class="schedule-folder-name">' + escapeHtml(folderName) + "</div><div class=\"schedule-folder-items\">";
        var itemsHtml = items
          .map(function (s) {
            var time = String(s.hour).padStart(2, "0") + ":" + String(s.minute).padStart(2, "0");
            var actionLabel = s.action === "stop" ? "Stop" : s.action === "restart" ? "Restart" : "Start";
            var byWho = (s.lastModifiedBy && "Alterado por: " + escapeHtml(s.lastModifiedBy)) || (s.createdBy && "Criado por: " + escapeHtml(s.createdBy)) || "";
            var enabledClass = s.enabled ? "" : " enabled-off";
            return (
              '<div class="schedule-item' + enabledClass + '" data-id="' + s.id + '">' +
              '<div><span class="name">' + escapeHtml(s.serverName || "(ECS)") + "</span> " +
              '<span class="time">' + escapeHtml(time) + "</span> " +
              '<span class="meta">' + escapeHtml(actionLabel) + " · " + formatDays(s.days) + (byWho ? " · " + byWho : "") + "</span></div>" +
              '<div class="actions">' +
              '<button type="button" class="btn btn-small btn-secondary schedule-edit" data-id="' + s.id + '">Editar</button>' +
              '<button type="button" class="btn btn-small btn-stop schedule-delete" data-id="' + s.id + '">Excluir</button>' +
              "</div></div>"
            );
          })
          .join("");
        return header + itemsHtml + "</div></div>";
      })
      .join("");

    schedulesList.querySelectorAll(".schedule-edit").forEach(function (btn) {
      btn.addEventListener("click", function () { openScheduleForm(parseInt(btn.getAttribute("data-id"), 10)); });
    });
    schedulesList.querySelectorAll(".schedule-delete").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!confirm("Excluir este agendamento?")) return;
        const id = parseInt(btn.getAttribute("data-id"), 10);
        apiFetch(API_BASE + "/api/schedules/" + id, { method: "DELETE" })
          .then(function (res) {
            if (!res.ok) throw new Error("Erro ao excluir");
            return res.json();
          })
          .then(function () { loadSchedules(); })
          .catch(function (err) { alert(err.message); });
      });
    });
  }

  if (schedulesSearchInput) {
    schedulesSearchInput.addEventListener("input", function () {
      var q = (schedulesSearchInput.value || "").trim().toLowerCase();
      if (!q) {
        renderSchedulesList(schedulesCache);
        return;
      }
      var filtered = schedulesCache.filter(function (s) {
        var serverName = (s.serverName || "").toLowerCase();
        var projectName = (s.projectName || "").toLowerCase();
        var projectId = (s.projectId || "").toLowerCase();
        var accountId = (s.accountId || "").toLowerCase();
        var action = (s.action || "").toLowerCase();
        var serverId = (s.serverId || "").toLowerCase();
        var time = String(s.hour || 0).padStart(2, "0") + ":" + String(s.minute || 0).padStart(2, "0");
        return (
          serverName.indexOf(q) >= 0 ||
          projectName.indexOf(q) >= 0 ||
          projectId.indexOf(q) >= 0 ||
          accountId.indexOf(q) >= 0 ||
          action.indexOf(q) >= 0 ||
          serverId.indexOf(q) >= 0 ||
          time.indexOf(q) >= 0
        );
      });
      if (filtered.length === 0) {
        schedulesList.innerHTML = '<div class="empty-state">Nenhum agendamento corresponde à pesquisa.</div>';
        return;
      }
      renderSchedulesList(filtered);
    });
  }

  function getScheduleDaysFromForm() {
    const dayInputs = scheduleDaysContainer.querySelectorAll('input[type="checkbox"]:not(#schedule-days-all)');
    const checked = [];
    dayInputs.forEach(function (cb) {
      if (cb.checked) checked.push(parseInt(cb.value, 10));
    });
    return scheduleDaysAll.checked ? null : checked;
  }

  function setScheduleDaysInForm(days) {
    scheduleDaysAll.checked = !days || days.length === 0;
    scheduleDaysContainer.querySelectorAll('input[type="checkbox"]:not(#schedule-days-all)').forEach(function (cb) {
      cb.checked = scheduleDaysAll.checked || (days && days.indexOf(parseInt(cb.value, 10)) >= 0);
    });
  }

  function setSchedulesListVisible(visible) {
    schedulesList.hidden = !visible;
    if (schedulesSearchInput && schedulesSearchInput.parentElement) schedulesSearchInput.parentElement.hidden = !visible;
    if (scheduleNewBtn) scheduleNewBtn.hidden = !visible;
    if (visible) {
      schedulesLoading.hidden = true;
      schedulesError.hidden = true;
    } else {
      schedulesLoading.hidden = true;
      schedulesError.hidden = true;
    }
  }

  function openScheduleForm(editId, prefill) {
    setSchedulesListVisible(false);
    scheduleFormBox.hidden = false;
    scheduleFormTitle.textContent = editId ? "Editar agendamento" : "Novo agendamento";
    document.getElementById("schedule-id").value = editId || "";
    if (prefill) {
      document.getElementById("schedule-accountId").value = prefill.accountId || "";
      document.getElementById("schedule-region").value = prefill.region || "";
      var projEl = document.getElementById("schedule-projectId");
      projEl.value = prefill.projectId || "";
      if (prefill.projectId) projEl.setAttribute("data-kept", prefill.projectId);
      var serverSel = document.getElementById("schedule-serverId");
      serverSel.value = prefill.serverId || "";
      var fallback = document.getElementById("schedule-serverId-fallback");
      if (fallback) fallback.value = prefill.serverId || "";
      document.getElementById("schedule-serverName").value = prefill.serverName || "";
      document.getElementById("schedule-action").value = prefill.action || "start";
    }
    if (!prefill || !editId) {
      document.getElementById("schedule-hour").value = prefill && prefill.hour !== undefined ? prefill.hour : 8;
      document.getElementById("schedule-minute").value = prefill && prefill.minute !== undefined ? prefill.minute : 0;
      setScheduleDaysInForm(prefill && prefill.days ? prefill.days : null);
      document.getElementById("schedule-enabled").checked = true;
    }
    if (editId) {
      apiFetch(API_BASE + "/api/schedules")
        .then(function (r) { return r.json(); })
        .then(function (list) {
          const s = list.find(function (x) { return x.id === editId; });
          if (s) {
            document.getElementById("schedule-accountId").value = s.accountId;
            document.getElementById("schedule-region").value = s.region;
            var projEl = document.getElementById("schedule-projectId");
            projEl.value = s.projectId;
            if (s.projectId) projEl.setAttribute("data-kept", s.projectId);
            var serverSel = document.getElementById("schedule-serverId");
            serverSel.value = s.serverId || "";
            var fallback = document.getElementById("schedule-serverId-fallback");
            if (fallback) fallback.value = s.serverId || "";
            document.getElementById("schedule-serverName").value = s.serverName || "";
            document.getElementById("schedule-action").value = s.action;
            document.getElementById("schedule-hour").value = s.hour;
            document.getElementById("schedule-minute").value = s.minute;
            document.getElementById("schedule-enabled").checked = s.enabled;
            setScheduleDaysInForm(s.days);
          }
        });
    }
    fillScheduleAccountsAndRegions();
  }

  function loadScheduleProjects(accountId, keptProjectId) {
    const projectSelect = document.getElementById("schedule-projectId");
    projectSelect.innerHTML = '<option value="">Carregando projetos…</option>';
    projectSelect.disabled = true;
    var region = document.getElementById("schedule-region").value.trim();
    apiFetch(API_BASE + "/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: accountId, region: region }),
    })
      .then(function (r) {
        return r.json().then(function (data) {
          if (!r.ok) throw new Error(data.error || data.message || "Erro " + r.status);
          return data;
        });
      })
      .then(function (data) {
        const raw = (data && data.projects) || (Array.isArray(data) ? data : []);
        const projects = Array.isArray(raw) ? raw : [];
        projectSelect.disabled = false;
        projectSelect.innerHTML = '<option value="">— Selecione o projeto —</option>' +
          projects
            .filter(function (p) { return p && (p.enabled !== false); })
            .map(function (p) {
              var id = p.id || p.project_id || "";
              var name = p.name || p.project_name || id || "(sem nome)";
              return '<option value="' + escapeHtml(id) + '">' + escapeHtml(name) + "</option>";
            })
            .join("");
        if (keptProjectId) projectSelect.value = keptProjectId;
        scheduleProjectSelectChange();
      })
      .catch(function (err) {
        projectSelect.disabled = false;
        projectSelect.innerHTML = '<option value="">Erro: ' + escapeHtml(String(err.message || "carregar projetos")) + "</option>";
      });
  }

  function loadScheduleServers() {
    var accountId = document.getElementById("schedule-accountId").value.trim();
    var region = document.getElementById("schedule-region").value.trim();
    var projectId = document.getElementById("schedule-projectId").value.trim();
    var serverSelect = document.getElementById("schedule-serverId");
    if (!accountId || !region || !projectId) {
      serverSelect.innerHTML = '<option value="">— Selecione conta, região e projeto —</option>';
      return;
    }
    serverSelect.innerHTML = '<option value="">Carregando servidores…</option>';
    serverSelect.disabled = true;
    apiFetch(API_BASE + "/api/ecs/servers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: accountId, region: region, projectId: projectId }),
    })
      .then(function (r) {
        return r.json().then(function (data) {
          if (!r.ok) throw new Error(data.error || data.badRequest || data.message || "Erro " + r.status);
          return data;
        });
      })
      .then(function (data) {
        var servers = (data && data.servers) || [];
        serverSelect.disabled = false;
        serverSelect.innerHTML = '<option value="">— Selecione o servidor —</option>' +
          (Array.isArray(servers) ? servers : []).map(function (s) {
            var id = s.id || "";
            var name = (s.name || "(sem nome)").replace(/"/g, "&quot;");
            return '<option value="' + escapeHtml(id) + '" data-server-name="' + escapeHtml(name) + '">' + escapeHtml(s.name || "(sem nome)") + " (ID: " + escapeHtml(id) + ")</option>";
          }).join("");
      })
      .catch(function (err) {
        serverSelect.disabled = false;
        serverSelect.innerHTML = '<option value="">Erro ao carregar servidores</option>';
      });
  }

  function scheduleProjectSelectChange() {
    loadScheduleServers();
  }

  function fillScheduleAccountsAndRegions() {
    const accountSelect = document.getElementById("schedule-accountId");
    const regionSelect = document.getElementById("schedule-region");
    const projectSelect = document.getElementById("schedule-projectId");
    if (scheduleAccountsSetupDone && accountSelect.options.length > 0) {
      if (accountSelect.value) {
        var kept = projectSelect.value || projectSelect.getAttribute("data-kept") || "";
        loadScheduleProjects(accountSelect.value, kept);
      }
      return;
    }
    apiFetch(API_BASE + "/api/accounts")
      .then(function (r) { return r.json(); })
      .then(function (accounts) {
        accountsCache = accounts;
        accountSelect.innerHTML = '<option value="">— Selecione —</option>' +
          (accounts || []).map(function (a) {
            return '<option value="' + escapeHtml(a.id) + '">' + escapeHtml(a.name) + "</option>";
          }).join("");
        regionSelect.innerHTML = '<option value="">— Selecione —</option>';
        if (!projectSelect.options.length || projectSelect.options[0].value === "") {
          projectSelect.innerHTML = '<option value="">— Selecione a conta e depois o projeto —</option>';
        }
        accountSelect.addEventListener("change", function () {
          const id = accountSelect.value;
          const acc = (accounts || []).find(function (a) { return a.id === id; });
          regionSelect.innerHTML = '<option value="">— Selecione —</option>' +
            ((acc && acc.regions) || []).map(function (r) {
              return '<option value="' + escapeHtml(r.id) + '">' + escapeHtml(r.name) + "</option>";
            }).join("");
          var keptRegion = document.getElementById("schedule-region").value;
          if (keptRegion) regionSelect.value = keptRegion;
          if (!id) { projectSelect.innerHTML = '<option value="">— Selecione a conta e depois o projeto —</option>'; return; }
          var keptProjectId = projectSelect.value || (projectSelect.getAttribute("data-kept") || "");
          if (projectSelect.getAttribute("data-kept")) projectSelect.removeAttribute("data-kept");
          loadScheduleProjects(id, keptProjectId);
        });
        scheduleAccountsSetupDone = true;
        if (accountSelect.value) {
          var keptProjectId = projectSelect.value || projectSelect.getAttribute("data-kept") || "";
          if (keptProjectId) projectSelect.setAttribute("data-kept", keptProjectId);
          accountSelect.dispatchEvent(new Event("change"));
        }
      })
      .catch(function () {
        projectSelect.innerHTML = '<option value="">— Selecione a conta e depois o projeto —</option>';
      });
  }

  scheduleDaysAll.addEventListener("change", function () {
    if (scheduleDaysAll.checked) {
      scheduleDaysContainer.querySelectorAll('input[type="checkbox"]:not(#schedule-days-all)').forEach(function (cb) { cb.checked = true; });
    }
  });
  scheduleDaysContainer.querySelectorAll('input[type="checkbox"]:not(#schedule-days-all)').forEach(function (cb) {
    cb.addEventListener("change", function () {
      if (!this.checked) scheduleDaysAll.checked = false;
    });
  });

  scheduleForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const id = document.getElementById("schedule-id").value;
    var serverIdEl = document.getElementById("schedule-serverId");
    var serverIdFallback = document.getElementById("schedule-serverId-fallback");
    var serverId = (serverIdEl.value || (serverIdFallback && serverIdFallback.value) || "").trim();
    var projectSelect = document.getElementById("schedule-projectId");
    var projectName = (projectSelect.options[projectSelect.selectedIndex] && projectSelect.options[projectSelect.selectedIndex].text) || "";
    const body = {
      accountId: document.getElementById("schedule-accountId").value.trim(),
      region: document.getElementById("schedule-region").value.trim(),
      projectId: document.getElementById("schedule-projectId").value.trim(),
      projectName: projectName,
      serverId: serverId,
      serverName: document.getElementById("schedule-serverName").value.trim(),
      action: document.getElementById("schedule-action").value,
      hour: parseInt(document.getElementById("schedule-hour").value, 10) || 0,
      minute: parseInt(document.getElementById("schedule-minute").value, 10) || 0,
      days: getScheduleDaysFromForm(),
      enabled: document.getElementById("schedule-enabled").checked,
    };
    if (!body.accountId || !body.region || !body.projectId || !body.serverId) {
      alert("Preencha conta, região, projeto e servidor.");
      return;
    }
    const url = id ? API_BASE + "/api/schedules/" + id : API_BASE + "/api/schedules";
    const method = id ? "PATCH" : "POST";
    fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "Erro ao salvar");
          return data;
        });
      })
      .then(function () {
        scheduleFormBox.hidden = true;
        setSchedulesListVisible(true);
        loadSchedules();
      })
      .catch(function (err) { alert(err.message); });
  });

  scheduleCancelBtn.addEventListener("click", function () {
    scheduleFormBox.hidden = true;
    setSchedulesListVisible(true);
  });

  document.getElementById("schedule-projectId").addEventListener("change", scheduleProjectSelectChange);
  document.getElementById("schedule-serverId").addEventListener("change", function () {
    var sel = document.getElementById("schedule-serverId");
    var opt = sel.options[sel.selectedIndex];
    if (opt && opt.value) {
      var name = opt.getAttribute("data-server-name") || opt.text.replace(/\s*\(ID:.*\)$/, "").trim();
      document.getElementById("schedule-serverName").value = name || "";
      var fallback = document.getElementById("schedule-serverId-fallback");
      if (fallback) fallback.value = opt.value || "";
    }
  });

  scheduleNewBtn.addEventListener("click", function () {
    openScheduleForm(null, null);
  });

  document.getElementById("nav-contas").addEventListener("click", showAccountsFromNav);
  document.getElementById("nav-agendamentos").addEventListener("click", showSchedulesView);
  if (document.getElementById("nav-usuarios")) {
    document.getElementById("nav-usuarios").addEventListener("click", showUsersView);
  }

  function loadUsers() {
    var listEl = document.getElementById("users-list");
    if (!listEl) return;
    listEl.innerHTML = "Carregando…";
    apiFetch(API_BASE + "/api/users")
      .then(function (r) {
        if (!r.ok) throw new Error("Acesso negado");
        return r.json();
      })
      .then(function (list) {
        if (list.length === 0) {
          listEl.innerHTML = "<p class=\"empty-state\">Nenhum usuário.</p>";
          return;
        }
        listEl.innerHTML =
          "<table class=\"ecs-table\"><thead><tr><th>E-mail / Usuário</th><th>Perfil</th><th>Ações</th></tr></thead><tbody>" +
          list.map(function (u) {
            return (
              "<tr><td>" + escapeHtml(u.email) + "</td><td>" + escapeHtml(u.role || "user") + "</td><td class=\"actions\">" +
              "<button type=\"button\" class=\"btn btn-small btn-secondary user-reset\" data-id=\"" + u.id + "\">Resetar senha</button> " +
              (u.role !== "admin" ? "<button type=\"button\" class=\"btn btn-small btn-stop user-delete\" data-id=\"" + u.id + "\">Excluir</button>" : "") +
              "</td></tr>"
            );
          }).join("") + "</tbody></table>";
        listEl.querySelectorAll(".user-reset").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var id = btn.getAttribute("data-id");
            var pwd = prompt("Nova senha para o usuário:");
            if (pwd == null || !pwd.trim()) return;
            apiFetch(API_BASE + "/api/users/" + id + "/reset-password", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ newPassword: pwd.trim() }),
            })
              .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
              .then(function (x) {
                if (x.ok) { loadUsers(); alert("Senha alterada."); } else alert(x.data.error || "Erro");
              });
          });
        });
        listEl.querySelectorAll(".user-delete").forEach(function (btn) {
          btn.addEventListener("click", function () {
            if (!confirm("Excluir este usuário?")) return;
            var id = btn.getAttribute("data-id");
            apiFetch(API_BASE + "/api/users/" + id, { method: "DELETE" })
              .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
              .then(function (x) {
                if (x.ok) loadUsers(); else alert(x.data.error || "Erro");
              });
          });
        });
      })
      .catch(function () { listEl.innerHTML = "<p class=\"error\">Erro ao carregar usuários.</p>"; });
  }

  var userFormBox = document.getElementById("user-form-box");
  var userForm = document.getElementById("user-form");
  if (userForm) {
    userForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var id = document.getElementById("user-id").value;
      var email = document.getElementById("user-email").value.trim();
      var password = document.getElementById("user-password").value;
      if (!email) { alert("E-mail é obrigatório."); return; }
      if (!id && !password) { alert("Senha é obrigatória para novo usuário."); return; }
      var body = { email: email };
      if (password) body.password = password;
      var url = API_BASE + "/api/users";
      var method = "POST";
      apiFetch(url, { method: method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
        .then(function (x) {
          if (x.ok) { if (userFormBox) userFormBox.hidden = true; document.getElementById("user-email").value = ""; document.getElementById("user-password").value = ""; document.getElementById("user-id").value = ""; loadUsers(); }
          else alert(x.data.error || "Erro");
        });
    });
  }
  if (document.getElementById("user-cancel-btn")) {
    document.getElementById("user-cancel-btn").addEventListener("click", function () {
      if (userFormBox) userFormBox.hidden = true;
    });
  }
  if (document.getElementById("user-new-btn")) {
    document.getElementById("user-new-btn").addEventListener("click", function () {
      document.getElementById("user-id").value = "";
      document.getElementById("user-email").value = "";
      document.getElementById("user-password").value = "";
      document.getElementById("user-form-title").textContent = "Novo usuário";
      if (userFormBox) userFormBox.hidden = false;
    });
  }

  retryBtn.addEventListener("click", loadAccounts);
  backBtn.addEventListener("click", showAccounts);
  if (refreshProjectsBtn) {
    refreshProjectsBtn.addEventListener("click", function () {
      if (currentAccount) loadProjects(currentAccount.id, currentAccount.name, currentAccount.regions);
    });
  }
  ecsBackBtn.addEventListener("click", function () {
    if (currentAccount) {
      showProjects(currentAccount.name);
      projectsList.innerHTML = "";
      setLoading(true);
      apiFetch(API_BASE + "/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: currentAccount.id }),
      })
        .then(function (res) { return res.json(); })
        .then(renderProjects)
        .catch(function () { setError("Erro ao recarregar projetos."); });
    } else {
      showAccounts();
    }
  });

  checkAuth();
})();
