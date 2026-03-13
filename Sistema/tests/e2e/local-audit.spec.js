import { test, expect } from '@playwright/test';

const COMPANY_CODE = process.env.E2E_COMPANY_CODE || 'OPAL2024';
const USERNAME = process.env.E2E_USERNAME || 'master_admin';
const PIN = process.env.E2E_PIN || '1234';
const LOCAL_API_URL = process.env.LOCAL_API_URL || 'http://127.0.0.1:3001';
const FORCE_LOCAL_LOGIN = process.env.E2E_FORCE_LOCAL_LOGIN !== 'false';

async function seedLocalAdmin(page) {
  await page.evaluate(async () => {
    if (!window.DB || typeof window.DB.init !== 'function') return;

    if (!window.DB.db) {
      await window.DB.init();
    }

    const employee = {
      id: '00000000-0000-0000-0000-000000000002',
      code: 'ADMIN',
      name: 'Administrador Maestro',
      role: 'master_admin',
      branch_id: null,
      active: true
    };

    const user = {
      id: '00000000-0000-0000-0000-000000000001',
      username: 'master_admin',
      pin_hash: null,
      employee_id: employee.id,
      role: 'master_admin',
      active: true
    };

    await window.DB.put('employees', employee);
    await window.DB.put('users', user);

    if (window.API) {
      window.API.baseURL = null;
      window.API.token = null;
    }

    localStorage.removeItem('api_token');
  });
}

async function login(page) {
  await page.goto('/');

  if (FORCE_LOCAL_LOGIN) {
    await seedLocalAdmin(page);
    await page.evaluate(() => {
      if (!window.UserManager || !window.UI) return;

      const user = {
        id: '00000000-0000-0000-0000-000000000001',
        username: 'master_admin',
        role: 'master_admin',
        is_master_admin: true,
        isMasterAdmin: true,
        active: true
      };

      const employee = {
        id: '00000000-0000-0000-0000-000000000002',
        name: 'Administrador Maestro',
        role: 'master_admin',
        branch_id: null,
        active: true
      };

      window.UserManager.currentUser = user;
      window.UserManager.currentEmployee = employee;
      localStorage.setItem('current_user', JSON.stringify(user));

      const companyCode = document.getElementById('company-code-screen');
      const loginScreen = document.getElementById('login-screen');
      if (companyCode) companyCode.style.display = 'none';
      if (loginScreen) loginScreen.style.display = 'none';

      window.UI.showModule('dashboard');
    });

    await expect(page.locator('.sidebar-nav')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#content-area')).toBeVisible({ timeout: 30000 });
    return;
  } else {
    await forceLocalApi(page);
  }

  const codeInput = page.locator('#company-code-input');
  if (await codeInput.isVisible().catch(() => false)) {
    await codeInput.fill(COMPANY_CODE);
    await page.click('#company-code-btn');
  }

  await expect(page.locator('#employee-barcode-input')).toBeVisible();
  await page.fill('#employee-barcode-input', USERNAME);
  await page.fill('#pin-input', PIN);

  const loginButton = page.getByRole('button', { name: /iniciar sesión/i });
  await loginButton.click();

  await expect(page.locator('#login-screen')).toBeHidden({ timeout: 30000 });
  await expect(page.locator('.sidebar-nav')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#module-dashboard')).toBeVisible({ timeout: 30000 });
}

async function forceLocalApi(page) {
  await page.evaluate(async (apiUrl) => {
    try {
      if (window.API && typeof window.API.setBaseURL === 'function') {
        await window.API.setBaseURL(apiUrl);
        return;
      }

      await new Promise((resolve, reject) => {
        const request = indexedDB.open('opal_pos_db', 13);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['settings'], 'readwrite');
          const store = tx.objectStore('settings');
          store.put({ key: 'api_url', value: apiUrl });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      });
    } catch (e) {
      console.error('No se pudo forzar api_url local', e);
    }
  }, LOCAL_API_URL);
}

async function openModule(page, moduleName) {
  const navItem = page.locator(`[data-module="${moduleName}"]`).first();
  await expect(navItem).toBeVisible();
  await navItem.click();
  await page.waitForTimeout(800);
  await expect(page.locator('#login-screen')).toBeHidden();
  await expect(page.locator('#content-area')).toBeVisible();
}

test.describe('Auditoría local de módulos y acciones', () => {
  test('navega módulos críticos sin errores visibles', async ({ page }) => {
    const jsErrors = [];
    const serverErrors = [];

    page.on('pageerror', (error) => {
      jsErrors.push(String(error));
    });

    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/api/') && response.status() >= 500) {
        serverErrors.push(`${response.status()} ${url}`);
      }
    });

    await login(page);

    const modules = [
      'dashboard',
      'branches',
      'inventory',
      'customers',
      'employees',
      'catalogs',
      'pos',
      'cash',
      'reports',
      'repairs',
      'settings',
      'sync'
    ];

    for (const moduleName of modules) {
      await openModule(page, moduleName);
      await expect(page.locator('#module-content')).not.toContainText('Error al cargar módulo', { timeout: 12000 });
      await expect(page.locator('#module-content')).not.toContainText('módulo no disponible', { timeout: 12000 });
    }

    expect(jsErrors, `Errores JS detectados: ${jsErrors.join('\n')}`).toEqual([]);
    expect(serverErrors, `Respuestas 5xx detectadas: ${serverErrors.join('\n')}`).toEqual([]);
  });

  test('sucursales no entra en bucle de recarga', async ({ page }) => {
    const branchesCalls = [];

    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('/api/branches')) {
        branchesCalls.push({ t: Date.now(), status: response.status(), url });
      }
    });

    await login(page);
    await openModule(page, 'branches');

    await page.waitForTimeout(8000);

    const recent = branchesCalls.filter((c) => Date.now() - c.t <= 8000);

    expect(
      recent.length,
      `Demasiadas llamadas a /api/branches en 8s: ${recent.length}. Posible bucle.`
    ).toBeLessThanOrEqual(10);

    const withServerErrors = recent.filter((r) => r.status >= 500);
    expect(withServerErrors, 'Hay errores 5xx en flujo de sucursales').toEqual([]);
  });

  test('botón Nueva Sucursal abre y cierra modal correctamente', async ({ page }) => {
    await login(page);
    await openModule(page, 'branches');

    const addButton = page.locator('#add-branch-btn');
    await expect(addButton).toBeVisible();
    await addButton.click();

    const modal = page.locator('.modal-overlay');
    await expect(modal).toBeVisible();

    const cancelButton = page.getByRole('button', { name: /cancelar/i }).first();
    if (await cancelButton.isVisible().catch(() => false)) {
      await cancelButton.click();
    } else {
      await page.keyboard.press('Escape');
    }

    await expect(modal).toBeHidden();
  });

  test('acciones no destructivas abren ventanas en módulos críticos', async ({ page }) => {
    await login(page);

    const modules = ['inventory', 'customers', 'employees', 'catalogs', 'repairs', 'costs', 'transfers', 'arrival-rules'];

    for (const moduleName of modules) {
      const nav = page.locator(`[data-module="${moduleName}"]`).first();
      if (!(await nav.isVisible().catch(() => false))) continue;

      await nav.click();
      await page.waitForTimeout(1000);

      const actionButton = page.locator('button').filter({
        hasText: /nueva|nuevo|crear|agregar|registrar/i
      }).first();

      if (await actionButton.isVisible().catch(() => false)) {
        await actionButton.click();
        await page.waitForTimeout(500);

        const modal = page.locator('.modal-overlay, .modal, [role="dialog"]').first();
        if (await modal.isVisible().catch(() => false)) {
          const cancel = page.getByRole('button', { name: /cancelar|cerrar|close/i }).first();
          if (await cancel.isVisible().catch(() => false)) {
            await cancel.click();
          } else {
            await page.keyboard.press('Escape');
          }
          await page.waitForTimeout(300);
        }
      }

      await expect(page.locator('#module-content')).not.toContainText('Error al cargar módulo', { timeout: 5000 });
    }
  });
});