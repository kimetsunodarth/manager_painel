/**
 * Worker Playwright para IIS/.exe (pkg).
 * Final v1.1.1 - Baseado em simulação real bem-sucedida.
 */

const fs = require('fs');

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
  });
}

async function main() {
  try {
    const raw = await readStdin();
    const input = raw ? JSON.parse(raw) : {};
    const { baseUrl, username, password, headless = true } = input || {};
    if (!baseUrl || !username || !password) {
      process.stdout.write(JSON.stringify({ ok: false, error: 'Configuração incompleta (baseUrl, usuário e senha obrigatórios)' }));
      return;
    }

    const playwright = require('playwright');
    const chromium = playwright.chromium;

    const url = String(baseUrl).replace(/\/$/, '') + '/';
    const browser = await chromium.launch({ headless: headless ?? true });
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1280, height: 800 },
    });

    try {
      const page = await context.newPage();
      console.error(`[worker] Navegando para ${url}`);

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(5000);

      // --- LOGIN ---
      const userInput = page.locator('input[type="text"], input[name="username"], input[placeholder*="user" i]').first();
      const passInput = page.locator('input[type="password"], input[name="password"], input[placeholder*="pass" i]').first();
      const loginBtn = page.locator('button:has-text("Log In"), input[type="submit"], button#login-btn').first();

      if (await userInput.isVisible().catch(() => false)) {
        await userInput.fill(username);
        await loginBtn.click();
        await page.waitForTimeout(2000);
        await passInput.fill(password);
        await loginBtn.click();
        await page.waitForTimeout(8000);
      } else {
        // Tenta fluxo alternativo se já cair na senha (raro)
        const possibleUser = page.getByPlaceholder(/Username/i).first();
        if (await possibleUser.isVisible().catch(() => false)) {
             await possibleUser.fill(username);
             await page.keyboard.press('Enter');
             await page.waitForTimeout(3000);
             await page.getByPlaceholder(/Password/i).fill(password);
             await page.keyboard.press('Enter');
             await page.waitForTimeout(8000);
        }
      }

      // --- WORKFLOW SLD ---
      let attempt = 0;
      let companiesReady = false;

      while (attempt < 5 && !companiesReady) {
        attempt++;
        if (attempt > 1) {
          console.error(`[worker] Tentativa ${attempt}: Recarregando página para tentar visualizar empresas...`);
          await page.reload({ waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(10000);
        }

        console.error(`[worker] Selecionando servidor/instância (Tentativa ${attempt})...`);
        // Procura por tabela que contenha "Server Name" ou "Database Instance" (SLD 10.0+)
        const serverTable = page.locator('table').filter({ hasText: /Server Name|Database Instance/i });
        const serverCb = serverTable.locator('input[type="checkbox"]').nth(1);
        
        await serverCb.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
        
        if (await serverCb.isVisible().catch(() => false)) {
          console.error(`[worker] Servidor encontrado. Marcando/Desmarcando...`);
          await serverCb.uncheck().catch(() => {});
          await page.waitForTimeout(2000);
          await serverCb.check().catch(() => {});
          console.error(`[worker] Aguardando carregamento das empresas (15s)...`);
          await page.waitForTimeout(15000);
        } else {
          console.error(`[worker] Checkbox do servidor não encontrado. Verifique a URL ou permissões.`);
        }

        const companiesTable = page.locator('table').filter({ hasText: /Company Name|Empresa/i });
        const companyRows = await companiesTable.locator('tbody tr').count().catch(() => 0);

        if (companyRows > 0) {
          companiesReady = true;
          console.error(`[worker] ${companyRows} empresas carregadas com sucesso.`);
        } else {
          console.error(`[worker] As empresas ainda não apareceram na tentativa ${attempt}.`);
        }
      }

      if (!companiesReady) {
        console.error(`[worker] Falha após 5 tentativas.`);
        await browser.close();
        process.stdout.write(JSON.stringify({ ok: false, error: 'As empresas não carregaram no Control Center após retries. Verifique se o servidor de licenças está respondendo.' }));
        return;
      }

      // Selecionar a primeira empresa ou todas
      console.error(`[worker] Selecionando empresa...`);
      const companyTableMain = page.locator('table').filter({ hasText: /Company Name|Empresa/i });
      const firstCompanyCb = companyTableMain.locator('tbody input[type="checkbox"]').first();
      
      if (await firstCompanyCb.isVisible().catch(() => false)) {
        await firstCompanyCb.check().catch(() => {});
        await page.waitForTimeout(2000);
      } else {
        console.error(`[worker] Checkbox da empresa não encontrado.`);
      }

      // Clicar no botão Activate Support User
      const mainBtn = page.locator('button, input[type="button"]').filter({ hasText: /Activate Support User|Activate Support|Ativar Suporte|Ativar Usuário Suporte/i }).first();
      
      if (await mainBtn.isVisible().catch(() => false)) {
        console.error(`[worker] Clicando em "Activate Support User"...`);
        await mainBtn.click();
        await page.waitForTimeout(4000);

        // Modal de confirmação (pode ter botões Yes/Sim ou Activate/Ativar)
        const modalBtn = page.locator('button').filter({ hasText: /^Activate$|^Active$|^Ativar$|^Yes$|^Sim$/i }).first();
        if (await modalBtn.isVisible().catch(() => false)) {
          console.error(`[worker] Confirmando ativação no modal...`);
          await modalBtn.click();
          await page.waitForTimeout(8000);
          console.error(`[worker] Processo concluído.`);
          await browser.close();
          process.stdout.write(JSON.stringify({ ok: true, message: 'Sucesso: Support User ativado no Control Center.' }));
          return;
        } else {
          console.error(`[worker] Modal de confirmação não apareceu.`);
        }
      }

      await browser.close();
      process.stdout.write(JSON.stringify({ ok: false, error: 'O botão de ativação ou o diálogo final não foram encontrados após o carregamento.' }));

    } catch (err) {
      console.error(`[worker] ERRO FATAL: ${err.message}`);
      try { await browser.close(); } catch {}
      process.stdout.write(JSON.stringify({ ok: false, error: err.message || 'Erro durante a execução do worker' }));
    }
  } catch (e) {
    process.stdout.write(JSON.stringify({ ok: false, error: 'Falha crítica de inicialização do worker' }));
  }
}

main();
