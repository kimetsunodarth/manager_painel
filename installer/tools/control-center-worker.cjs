/**
 * Worker Playwright para IIS/.exe (pkg).
 *
 * Motivação: Playwright não roda de forma confiável dentro do runtime do pkg.
 * Este worker é executado por um node.exe embarcado no instalador e retorna JSON via stdout.
 *
 * Entrada (stdin): JSON { baseUrl, username, password, headless }
 * Saída (stdout): JSON { ok: boolean, message?: string, error?: string }
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

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);

      const advanceLink = page.locator('text=Advanced, text=Avançado, a:has-text("Advanced"), a:has-text("Proceed")').first();
      if (await advanceLink.isVisible().catch(() => false)) {
        await advanceLink.click();
        await page.waitForTimeout(1000);
        const proceedLink = page.locator('a:has-text("Proceed"), a:has-text("Continuar"), button:has-text("Proceed")').first();
        if (await proceedLink.isVisible().catch(() => false)) await proceedLink.click();
        await page.waitForTimeout(2000);
      }

      const userInput = page.getByPlaceholder(/Username or email|user|login/i).or(page.locator('input[type="text"]')).first();
      const logInBtn = page.getByRole('button', { name: /Log In|Log in|Login/i }).or(page.locator('button:has-text("Log In")')).first();

      await userInput.waitFor({ state: 'visible', timeout: 10000 });
      await userInput.fill(username);
      await logInBtn.click();
      await page.waitForTimeout(3000);

      const passInput = page.getByPlaceholder(/Password|senha/i).or(page.locator('input[type="password"]')).first();
      await passInput.waitFor({ state: 'visible', timeout: 10000 });
      await passInput.fill(password);
      await logInBtn.click();
      await page.waitForTimeout(5000);

      await page.waitForTimeout(2000);
      const activateBtn = page.getByRole('button', { name: /Activate Support User/i }).or(page.locator('input[value*="Activate Support"]')).or(page.locator('button:has-text("Activate Support User")')).first();

      if (!(await activateBtn.isVisible().catch(() => false))) {
        await browser.close();
        process.stdout.write(JSON.stringify({ ok: false, error: 'Botão \"Activate Support User\" não encontrado após login' }));
        return;
      }

      const dbInstancesTable = page.locator('table').filter({ has: page.locator('text=Server Name') });
      const serverRowCheckbox = dbInstancesTable.locator('input[type=\"checkbox\"]').nth(1);
      if (await serverRowCheckbox.isVisible().catch(() => false)) {
        await serverRowCheckbox.check();
        await page.waitForTimeout(3000);
      }

      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5000);

      const dbTable2 = page.locator('table').filter({ has: page.locator('text=Server Name') });
      const serverRowCheckbox2 = dbTable2.locator('input[type=\"checkbox\"]').nth(1);
      const companiesLoadedText = page.getByText(/Companies \\([1-9]\\d*\\)/);
      const companyTable = page.locator('table').filter({ has: page.locator('text=Company Name') });

      if (await serverRowCheckbox2.isVisible().catch(() => false)) {
        await serverRowCheckbox2.check();
        await page.waitForTimeout(10000);
      }

      const maxWaitMs = 120000;
      const start = Date.now();
      let companiesVisible = await companiesLoadedText.isVisible().catch(() => false);
      if (!companiesVisible) {
        const rowCb = page.locator('table').filter({ has: page.locator('text=Server Name') }).locator('input[type=\"checkbox\"]').nth(1);
        while (Date.now() - start < maxWaitMs) {
          await rowCb.check();
          await page.waitForTimeout(8000);
          if (await companiesLoadedText.isVisible().catch(() => false)) {
            companiesVisible = true;
            break;
          }
          await rowCb.uncheck();
          await page.waitForTimeout(5000);
          if (await companiesLoadedText.isVisible().catch(() => false)) {
            companiesVisible = true;
            break;
          }
        }
        if (!companiesVisible && (await rowCb.isVisible().catch(() => false))) {
          await rowCb.check();
        }
      }
      await page.waitForTimeout(2000);

      const companyHeaderCheckbox = companyTable.locator('input[type=\"checkbox\"]').first();
      if (await companyHeaderCheckbox.isVisible().catch(() => false)) {
        await companyHeaderCheckbox.check();
      } else {
        const companyCheckboxes = companyTable.locator('tbody input[type=\"checkbox\"]');
        const count = await companyCheckboxes.count();
        for (let i = 0; i < count; i++) {
          await companyCheckboxes.nth(i).check().catch(() => {});
        }
      }
      await page.waitForTimeout(1000);

      const activateSupportBtn = page.getByRole('button', { name: /Activate Support User/i }).or(page.locator('button:has-text(\"Activate Support User\")')).first();
      if (await activateSupportBtn.isVisible().catch(() => false)) {
        await activateSupportBtn.click();
        await page.waitForTimeout(2000);
        const activeBtn = page.getByRole('button', { name: /^Activate$|^Active$/i }).or(page.locator('button:has-text(\"Activate\")')).or(page.locator('button:has-text(\"Active\")')).first();
        if (await activeBtn.isVisible().catch(() => false)) {
          await activeBtn.click();
        }
      }
      await page.waitForTimeout(3000);

      await browser.close();
      process.stdout.write(JSON.stringify({ ok: true, message: 'Activate Support User executado com sucesso.' }));
      return;
    } catch (err) {
      try { await browser.close(); } catch {}
      process.stdout.write(JSON.stringify({ ok: false, error: (err && err.message) ? err.message : 'Erro na automação do Control Center' }));
      return;
    }
  } catch (e) {
    process.stdout.write(JSON.stringify({ ok: false, error: (e && e.message) ? e.message : 'Erro ao executar worker' }));
  }
}

main();

