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
        PLAYWRIGHT_BROWSERS_PATH: browsersDir,
        NODE_PATH: join(cwd, 'node_modules'),
      },
    });

    const timeoutMs = 5 * 60 * 1000;
    const timeout = setTimeout(() => {
      try { child.kill(); } catch {}
      resolve({ ok: false, error: 'Timeout na automação do Control Center (Playwright).' });
    }, timeoutMs);

    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => { 
      out += d; 
      console.log(`[control-center-worker] STDOUT: ${d.trim()}`);
    });
    child.stderr.on('data', (d) => { 
      err += d; 
      console.warn(`[control-center-worker] STDERR: ${d.trim()}`);
    });

    child.on('error', (e) => {
      clearTimeout(timeout);
      console.error('[control-center] Failed to start worker:', e);
      resolve({ ok: false, error: e?.message || 'Falha ao iniciar worker do Control Center' });
    });

    child.on('exit', (code) => {
      clearTimeout(timeout);
      console.log(`[control-center] Worker finished with code ${code}`);
      try {
        const parsed = out ? JSON.parse(out) : null;
        if (parsed && typeof parsed === 'object') {
          return resolve(parsed);
        }
      } catch (parseError) {
        console.warn('[control-center] Failed to parse worker output as JSON:', parseError.message);
      }
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

  // Sempre executar o Playwright através do worker (processo filho isolado) no ambiente empacotado (pkg) 
  // ou quando hospedado no IIS (onde a lib nativa pode lidar mal com o carregamento do perfil de usuário).
  const isPkg = typeof process.pkg !== 'undefined';
  const isIisNode = typeof process.env.IISNODE_VERSION !== 'undefined';
  
  if (isPkg || isIisNode) {
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
      console.log('[control-center] Certificate warning detected, clicking Advanced...');
      await advanceLink.click();
      await page.waitForTimeout(1000);
      const proceedLink = page.locator('a:has-text("Proceed"), a:has-text("Continuar"), button:has-text("Proceed"), #proceed-link').first();
      if (await proceedLink.isVisible().catch(() => false)) {
        console.log('[control-center] Clicking Proceed...');
        await proceedLink.click();
      }
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
      await page.waitForTimeout(3000);
      const loadOk = await companiesLoadedText.isVisible().catch(() => false) || await companyTable.isVisible().catch(() => false);
      if (!loadOk) {
        await serverRowCheckbox2.uncheck();
        await page.waitForTimeout(1000);
        await serverRowCheckbox2.check();
        await page.waitForTimeout(5000);
      }
    }

    const companyCheck = companyTable.locator('input[type="checkbox"]').first();
    if (await companyCheck.isVisible().catch(() => false)) {
      await companyCheck.check();
      await page.waitForTimeout(1000);
    }

    const activateSupportBtn = page.getByRole('button', { name: /Activate Support User|Activate Support|Ativar Suporte|Suporte/i })
      .or(page.locator('input[value*="Activate Support"]'))
      .or(page.locator('button:has-text("Activate Support User")'))
      .or(page.locator('button:has-text("Activate Support")'))
      .or(page.locator('button:has-text("Suporte")'))
      .or(page.locator('[type="submit"]')).filter({ hasText: /Activate|Support|Suporte/i })
      .first();
    
    let btnVisible = await activateSupportBtn.isVisible().catch(() => false);
    if (!btnVisible) {
      console.log('[control-center] Primary activate button not visible, checking for input value...');
      const altBtn = page.locator('input[value*="Activate"]').first();
      if (await altBtn.isVisible().catch(() => false)) {
        await altBtn.click();
        btnVisible = true;
      }
    } else {
      await activateSupportBtn.click();
    }

    if (btnVisible) {
      console.log('[control-center] Activate button clicked, waiting for confirmation...');
      await page.waitForTimeout(2000);
      const activeBtn = page.getByRole('button', { name: /^Activate$|^Active$|^Ativar$/i })
        .or(page.locator('button:has-text("Activate")'))
        .or(page.locator('button:has-text("Active")'))
        .or(page.locator('button:has-text("OK")'))
        .first();
      if (await activeBtn.isVisible().catch(() => false)) {
        await activeBtn.click();
      }
      await page.waitForTimeout(3000);
      return { ok: true, message: 'Suporte ativado com sucesso.' };
    }

    return { ok: false, error: 'Botão "Activate Support User" não encontrado após login.' };
  } catch (err) {
    console.error('[control-center] Erro na automação:', err);
    return { ok: false, error: err.message || 'Erro inesperado na automação do Control Center' };
  } finally {
    if (browser) await browser.close();
  }
}
