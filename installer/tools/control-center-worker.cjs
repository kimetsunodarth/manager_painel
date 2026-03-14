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

      while (attempt < 3 && !companiesReady) {
        attempt++;
        console.error(`[worker] Tentativa ${attempt}: Selecionando servidor...`);

        // Checkbox do servidor (primeiro item da tabela de instâncias)
        const serverCb = page.locator('table').filter({ hasText: 'Server Name' }).locator('input[type="checkbox"]').nth(1);
        await serverCb.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
        
        if (await serverCb.isVisible().catch(() => false)) {
          await serverCb.check().catch(() => {});
          console.error(`[worker] Servidor marcado. Aguardando companies...`);
          await page.waitForTimeout(8000); // SLD é lento
        }

        const companiesTable = page.locator('table').filter({ hasText: 'Company Name' });
        const companyRows = await companiesTable.locator('tbody tr').count().catch(() => 0);

        if (companyRows > 0) {
          companiesReady = true;
          console.error(`[worker] ${companyRows} empresas encontradas.`);
        } else {
          console.error(`[worker] Empresas não carregaram. Retentando...`);
          if (await serverCb.isVisible().catch(() => false)) await serverCb.uncheck().catch(() => {});
          await page.reload({ waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(5000);
        }
      }

      if (!companiesReady) {
        await browser.close();
        process.stdout.write(JSON.stringify({ ok: false, error: 'As empresas não carregaram no Control Center após retries.' }));
        return;
      }

      // Selecionar todas as empresas
      const headerCb = page.locator('table').filter({ hasText: 'Company Name' }).locator('thead input[type="checkbox"]').first();
      await headerCb.check().catch(() => {});
      await page.waitForTimeout(2000);

      // Clicar no botão Activate Support User
      const mainBtn = page.locator('button').filter({ hasText: /^Activate Support User$/i }).first();
      if (await mainBtn.isVisible().catch(() => false)) {
        console.error(`[worker] Clicando no botão principal de ativação...`);
        await mainBtn.click();
        await page.waitForTimeout(3000);

        const modalBtn = page.locator('button').filter({ hasText: /^Activate$/i }).first();
        if (await modalBtn.isVisible().catch(() => false)) {
          console.error(`[worker] Confirmando no modal...`);
          await modalBtn.click();
          await page.waitForTimeout(5000);
          await browser.close();
          process.stdout.write(JSON.stringify({ ok: true, message: 'Sucesso: Support User ativado.' }));
          return;
        }
      }

      await browser.close();
      process.stdout.write(JSON.stringify({ ok: false, error: 'Botão de ativação ou modal final não encontrado.' }));

    } catch (err) {
      try { await browser.close(); } catch {}
      process.stdout.write(JSON.stringify({ ok: false, error: err.message || 'Erro durante automação' }));
    }
  } catch (e) {
    process.stdout.write(JSON.stringify({ ok: false, error: 'Falha crítica no worker' }));
  }
}

main();
