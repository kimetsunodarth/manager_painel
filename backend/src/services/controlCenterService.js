/**
 * Automação SAP Control Center (SLD): login, seleção server/company, Activate Support User.
 * Usado pela rota POST /services/activate-support com config por cliente (control-center/*.json).
 * Playwright é carregado sob demanda para o servidor subir mesmo sem ele (ex.: npm install --omit=dev).
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

function runWorker({ baseUrl, username, password, headless }) {
  return new Promise((resolve) => {
    const cwd = process.cwd();
    const nodeExe = join(cwd, 'tools', 'node', 'node.exe');
    const workerScript = join(cwd, 'tools', 'control-center-worker.cjs');

    if (!existsSync(nodeExe)) {
      return resolve({ ok: false, error: `node.exe embarcado não encontrado em ${nodeExe}. Reinstale o aplicativo (instalador completo).` });
    }
    if (!existsSync(workerScript)) {
      return resolve({ ok: false, error: `Worker do Control Center não encontrado em ${workerScript}. Reinstale o aplicativo (instalador completo).` });
    }
    const browsersDir = join(cwd, 'browsers');
    if (!existsSync(browsersDir)) {
      return resolve({ ok: false, error: `Pasta de browsers do Playwright não encontrada em ${browsersDir}. Reinstale o aplicativo com o instalador completo (Ativar Support requer Chromium).` });
    }
    const child = spawn(nodeExe, [workerScript], {
      cwd,
      windowsHide: true,
      env: {
        ...process.env,
        // Chromium instalado na pasta browsers do pacote (instalador copia para {app}\browsers).
        PLAYWRIGHT_BROWSERS_PATH: browsersDir,
        NODE_PATH: join(cwd, 'node_modules'),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const timeoutMs = 3 * 60 * 1000;
    const timeout = setTimeout(() => {
      try { child.kill(); } catch {}
      resolve({ ok: false, error: 'Timeout na automação do Control Center (Playwright).' });
    }, timeoutMs);

    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });

    child.on('error', (e) => {
      clearTimeout(timeout);
      resolve({ ok: false, error: e?.message || 'Falha ao iniciar worker do Control Center' });
    });
    child.on('exit', () => {
      clearTimeout(timeout);
      try {
        const parsed = out ? JSON.parse(out) : null;
        if (parsed && typeof parsed === 'object') return resolve(parsed);
      } catch {}
      const msg = (err || out || '').trim() || 'Falha ao executar worker do Control Center';
      resolve({ ok: false, error: msg });
    });

    try {
      child.stdin.write(JSON.stringify({ baseUrl, username, password, headless: headless ?? true }));
      child.stdin.end();
    } catch (e) {
      clearTimeout(timeout);
      resolve({ ok: false, error: e?.message || 'Falha ao enviar dados ao worker do Control Center' });
    }
  });
}

/**
 * Executa o fluxo de Ativar Support User no Control Center.
 * @param {Object} options
 * @param {string} options.baseUrl - URL base do Control Center (ex: https://roland.ananim.com.br:40000/ControlCenter/)
 * @param {string} options.username
 * @param {string} options.password
 * @param {boolean} [options.headless=true]
 * @returns {Promise<{ ok: boolean, message?: string, error?: string }>}
 */
export async function runActivateSupport({ baseUrl, username, password, headless = true }) {
  if (!baseUrl || !username || !password) {
    return { ok: false, error: 'Configuração incompleta (baseUrl, usuário e senha obrigatórios)' };
  }

  // IIS/.exe (pkg): executar Playwright fora do snapshot do pkg (via node.exe embarcado).
  if (typeof process.pkg !== 'undefined') {
    const r = await runWorker({ baseUrl, username, password, headless });
    if (r && typeof r === 'object') return r;
    return { ok: false, error: 'Falha ao executar automação do Control Center (worker).' };
  }

  let chromium;
  try {
    const playwright = await import('playwright');
    chromium = playwright.chromium;
  } catch (e) {
    return { ok: false, error: 'Playwright não disponível. Reinstale o aplicativo (instalador completo) ou no backend execute: npm install playwright e npx playwright install chromium.' };
  }

  const url = baseUrl.replace(/\/$/, '') + '/';
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
      return { ok: false, error: 'Botão "Activate Support User" não encontrado após login' };
    }

    const dbInstancesTable = page.locator('table').filter({ has: page.locator('text=Server Name') });
    const serverRowCheckbox = dbInstancesTable.locator('input[type="checkbox"]').nth(1);
    if (await serverRowCheckbox.isVisible().catch(() => false)) {
      await serverRowCheckbox.check();
      await page.waitForTimeout(3000);
    }

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    const dbTable2 = page.locator('table').filter({ has: page.locator('text=Server Name') });
    const serverRowCheckbox2 = dbTable2.locator('input[type="checkbox"]').nth(1);
    const companiesLoadedText = page.getByText(/Companies \([1-9]\d*\)/);
    const companyTable = page.locator('table').filter({ has: page.locator('text=Company Name') });

    if (await serverRowCheckbox2.isVisible().catch(() => false)) {
      await serverRowCheckbox2.check();
      await page.waitForTimeout(10000);
    }

    const maxWaitMs = 120000;
    const start = Date.now();
    let companiesVisible = await companiesLoadedText.isVisible().catch(() => false);
    if (!companiesVisible) {
      const rowCb = page.locator('table').filter({ has: page.locator('text=Server Name') }).locator('input[type="checkbox"]').nth(1);
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

    const companyHeaderCheckbox = companyTable.locator('input[type="checkbox"]').first();
    if (await companyHeaderCheckbox.isVisible().catch(() => false)) {
      await companyHeaderCheckbox.check();
    } else {
      const companyCheckboxes = companyTable.locator('tbody input[type="checkbox"]');
      const count = await companyCheckboxes.count();
      for (let i = 0; i < count; i++) {
        await companyCheckboxes.nth(i).check().catch(() => {});
      }
    }
    await page.waitForTimeout(1000);

    const activateSupportBtn = page.getByRole('button', { name: /Activate Support User/i }).or(page.locator('button:has-text("Activate Support User")')).first();
    if (await activateSupportBtn.isVisible().catch(() => false)) {
      await activateSupportBtn.click();
      await page.waitForTimeout(2000);
      const activeBtn = page.getByRole('button', { name: /^Activate$|^Active$/i }).or(page.locator('button:has-text("Activate")')).or(page.locator('button:has-text("Active")')).first();
      if (await activeBtn.isVisible().catch(() => false)) {
        await activeBtn.click();
      }
    }
    await page.waitForTimeout(3000);

    await browser.close();
    return { ok: true, message: 'Activate Support User executado com sucesso.' };
  } catch (err) {
    try {
      await browser.close();
    } catch {}
    return { ok: false, error: err.message || 'Erro na automação do Control Center' };
  }
}
