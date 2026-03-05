/**
 * Teste de conexão e automação: acessa o SAP Control Center (SLD),
 * faz login, seleciona server/company e clica em "Activate Support User".
 *
 * Uso: node scripts/test-control-center.js
 * URL: https://roland.ananim.com.br:40000/ControlCenter/
 */

import { chromium } from 'playwright';

const URL = 'https://roland.ananim.com.br:40000/ControlCenter/';
const USERNAME = 'ananimcloud';
const PASSWORD = 'Tedex@@007';

async function main() {
  console.log('\nTeste Control Center (SLD)...');
  console.log('URL:', URL);
  console.log('Usuário:', USERNAME);
  console.log('');

  const browser = await chromium.launch({ headless: false }); // headless: false para ver o browser
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 800 },
  });

  try {
    const page = await context.newPage();

    // 1) Acessar a página
    console.log('1. Navegando para a página...');
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    // Se aparecer aviso de certificado (conexão não segura), tentar prosseguir
    const advanceLink = page.locator('text=Advanced, text=Avançado, a:has-text("Advanced"), a:has-text("Proceed")').first();
    if (await advanceLink.isVisible().catch(() => false)) {
      await advanceLink.click();
      await page.waitForTimeout(1000);
      const proceedLink = page.locator('a:has-text("Proceed"), a:has-text("Continuar"), button:has-text("Proceed")').first();
      if (await proceedLink.isVisible().catch(() => false)) await proceedLink.click();
      await page.waitForTimeout(2000);
    }
    await page.screenshot({ path: 'control-center-01-loaded.png' });
    console.log('   Screenshot: control-center-01-loaded.png');

    // 2) Login em duas etapas: usuário → Log In → senha → Log In
    console.log('2. Login (duas etapas: usuário, depois senha)...');
    const userInput = page.getByPlaceholder(/Username or email|user|login/i).or(page.locator('input[type="text"]')).first();
    const logInBtn = page.getByRole('button', { name: /Log In|Log in|Login/i }).or(page.locator('button:has-text("Log In")')).first();

    try {
      await userInput.waitFor({ state: 'visible', timeout: 10000 });
      await userInput.fill(USERNAME);
      console.log('   Usuário preenchido.');
      await logInBtn.click();
      console.log('   Clique em Log In (1ª vez).');
      await page.waitForTimeout(3000);

      const passInput = page.getByPlaceholder(/Password|senha/i).or(page.locator('input[type="password"]')).first();
      await passInput.waitFor({ state: 'visible', timeout: 10000 });
      await passInput.fill(PASSWORD);
      console.log('   Senha preenchida.');
      await logInBtn.click();
      console.log('   Clique em Log In (2ª vez).');
      await page.waitForTimeout(5000);
    } catch (err) {
      console.log('   Erro no login:', err.message);
      console.log('   Abra control-center-01-loaded.png para inspecionar.');
    }

    // 3) Página DB Instances and Companies: selecionar server → reiniciar página → seguir processo
    console.log('3. Verificando página (DB Instances and Companies)...');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'control-center-02-after-login.png' }).catch(() => {});
    const activateBtn = page.getByRole('button', { name: /Activate Support User/i }).or(page.locator('input[value*="Activate Support"]')).or(page.locator('button:has-text("Activate Support User")')).first();

    if (await activateBtn.isVisible().catch(() => false)) {
      console.log('4. Botão "Activate Support User" encontrado.');
      const dbInstancesTable = page.locator('table').filter({ has: page.locator('text=Server Name') });
      // 2º checkbox = linha do server (1º é o do cabeçalho "select all")
      const serverRowCheckbox = dbInstancesTable.locator('input[type="checkbox"]').nth(1);
      if (await serverRowCheckbox.isVisible().catch(() => false)) {
        await serverRowCheckbox.check();
        console.log('   Server name selecionado (linha da tabela).');
        await page.waitForTimeout(3000);
      }
      // Reiniciar a página (reload) e seguir com o processo
      console.log('   Reiniciando a página (F5)...');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5000);
      await page.screenshot({ path: 'control-center-03-after-reload.png' }).catch(() => {});
      const dbTable2 = page.locator('table').filter({ has: page.locator('text=Server Name') });
      const serverRowCheckbox2 = dbTable2.locator('input[type="checkbox"]').nth(1);
      const companiesLoadedText = page.getByText(/Companies \([1-9]\d*\)/);
      const companyTable = page.locator('table').filter({ has: page.locator('text=Company Name') });
      if (await serverRowCheckbox2.isVisible().catch(() => false)) {
        await serverRowCheckbox2.check();
        console.log('   Server name selecionado novamente (linha, após reload).');
        await page.waitForTimeout(10000);
      }
      const maxWaitMs = 120000;
      const start = Date.now();
      let companiesVisible = await companiesLoadedText.isVisible().catch(() => false);
      if (!companiesVisible) {
        console.log('   Companies ainda (0); repetindo selecionar/desmarcar na LINHA do server (até 2 min)...');
        const rowCb = page.locator('table').filter({ has: page.locator('text=Server Name') }).locator('input[type="checkbox"]').nth(1);
        while (Date.now() - start < maxWaitMs) {
          await rowCb.check();
          await page.waitForTimeout(8000);
          if (await companiesLoadedText.isVisible().catch(() => false)) {
            companiesVisible = true;
            console.log('   Bases em Company carregadas.');
            break;
          }
          await rowCb.uncheck();
          await page.waitForTimeout(5000);
          if (await companiesLoadedText.isVisible().catch(() => false)) {
            companiesVisible = true;
            console.log('   Bases em Company carregadas.');
            break;
          }
        }
        if (!companiesVisible && await rowCb.isVisible().catch(() => false)) {
          await rowCb.check();
        }
      }
      await page.waitForTimeout(2000);
      // Selecionar TODAS as companies: checkbox do cabeçalho "select all" ou cada linha
      const companyHeaderCheckbox = companyTable.locator('input[type="checkbox"]').first();
      if (await companyHeaderCheckbox.isVisible().catch(() => false)) {
        await companyHeaderCheckbox.check();
        console.log('   Todas as companies selecionadas (select all).');
      } else {
        const companyCheckboxes = companyTable.locator('tbody input[type="checkbox"]');
        const count = await companyCheckboxes.count();
        for (let i = 0; i < count; i++) {
          await companyCheckboxes.nth(i).check().catch(() => {});
        }
        console.log('   Companies selecionadas:', count);
      }
      await page.waitForTimeout(1000);
      const activateSupportBtn = page.getByRole('button', { name: /Activate Support User/i }).or(page.locator('button:has-text("Activate Support User")')).first();
      if (await activateSupportBtn.isVisible().catch(() => false)) {
        await activateSupportBtn.click();
        console.log('   Clique em "Activate Support User" executado.');
        await page.waitForTimeout(2000);
        const activeBtn = page.getByRole('button', { name: /^Activate$|^Active$/i }).or(page.locator('button:has-text("Activate")')).or(page.locator('button:has-text("Active")')).first();
        if (await activeBtn.isVisible().catch(() => false)) {
          await activeBtn.click();
          console.log('   Clique no botão Activate/Active executado.');
        }
      }
      await page.waitForTimeout(3000);
    } else {
      console.log('   Botão "Activate Support User" não encontrado na página atual.');
    }

    await page.screenshot({ path: 'control-center-result.png' });
    console.log('\nScreenshot final salvo: control-center-result.png');
    console.log('Mantendo o browser aberto por 10s para inspeção...');
    await page.waitForTimeout(10000);
  } catch (err) {
    console.error('Erro:', err.message);
    console.error(err.stack);
  } finally {
    await browser.close();
  }
}

main();
