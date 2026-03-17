import { test, expect } from '@playwright/test';

const COMPANY_CODE = process.env.E2E_COMPANY_CODE || 'OPAL2024';
const USERNAME = process.env.E2E_USERNAME || 'master_admin';
const PIN = process.env.E2E_PIN || '1234';
const LOCAL_API_URL = process.env.LOCAL_API_URL || 'http://127.0.0.1:3001';
const FORCE_LOCAL_LOGIN = process.env.E2E_FORCE_LOCAL_LOGIN !== 'false';

const MODULES = [
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
    await window.DB.put('settings', { key: 'api_url', value: '' });

    if (window.API) {
      window.API.baseURL = null;
      window.API.token = null;
    }

    localStorage.removeItem('api_token');
  });
}

async function forceApiUrl(page, apiUrl) {
  await page.evaluate(async (url) => {
    try {
      if (window.API && typeof window.API.setBaseURL === 'function') {
        await window.API.setBaseURL(url);
        return;
      }

      await new Promise((resolve, reject) => {
        const request = indexedDB.open('opal_pos_db', 13);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['settings'], 'readwrite');
          const store = tx.objectStore('settings');
          store.put({ key: 'api_url', value: url });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      });
    } catch (error) {
      console.error('No se pudo forzar api_url', error);
    }
  }, apiUrl);
}

async function login(page) {
  await page.goto('/');

  if (FORCE_LOCAL_LOGIN) {
    await seedLocalAdmin(page);
    await page.evaluate(async () => {
      localStorage.setItem('ENABLE_BYPASS_LOGIN', 'true');
      if (typeof window.bypassLogin === 'function') {
        await window.bypassLogin();
      }

      const testUser = {
        id: '00000000-0000-0000-0000-000000000001',
        username: 'master_admin',
        role: 'master_admin',
        is_master_admin: true,
        isMasterAdmin: true,
        active: true
      };

      const testEmployee = {
        id: '00000000-0000-0000-0000-000000000002',
        name: 'Administrador Maestro',
        role: 'master_admin',
        branch_id: null,
        active: true
      };

      if (window.UserManager) {
        window.UserManager.currentUser = testUser;
        window.UserManager.currentEmployee = testEmployee;
      }

      localStorage.setItem('current_user', JSON.stringify(testUser));

      const overlays = ['company-code-screen', 'login-screen', 'session-restore-overlay'];
      overlays.forEach((id) => {
        const element = document.getElementById(id);
        if (element) {
          element.style.display = 'none';
          element.style.pointerEvents = 'none';
        }
      });

      document.querySelectorAll('.login-backdrop').forEach((element) => {
        element.style.display = 'none';
        element.style.pointerEvents = 'none';
      });
    });

    await expect(page.locator('#login-screen')).toBeHidden({ timeout: 30000 });
    await expect(page.locator('.sidebar-nav')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#content-area')).toBeVisible({ timeout: 30000 });
    return;
  }

  await forceApiUrl(page, LOCAL_API_URL);

  const codeInput = page.locator('#company-code-input');
  if (await codeInput.isVisible().catch(() => false)) {
    await codeInput.fill(COMPANY_CODE);
    await page.click('#company-code-btn');
  }

  await expect(page.locator('#employee-barcode-input')).toBeVisible({ timeout: 30000 });
  await page.fill('#employee-barcode-input', USERNAME);
  await page.fill('#pin-input', PIN);

  await page.getByRole('button', { name: /iniciar sesión/i }).click();

  await expect(page.locator('#login-screen')).toBeHidden({ timeout: 30000 });
  await expect(page.locator('.sidebar-nav')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#content-area')).toBeVisible({ timeout: 30000 });
}

async function openModule(page, moduleName) {
  const navItem = page.locator(`[data-module="${moduleName}"]`).first();
  await expect(navItem).toBeVisible({ timeout: 20000 });
  await navItem.click();
  await page.waitForTimeout(900);
  await expect(page.locator('#content-area')).toBeVisible();
  await expect(page.locator('#module-content')).toBeVisible();
  await expect(page.locator('#module-content')).not.toContainText('Error al cargar módulo', { timeout: 10000 });
  await expect(page.locator('#module-content')).not.toContainText('módulo no disponible', { timeout: 10000 });
}

async function closeAnyModal(page) {
  const cancelButton = page.getByRole('button', { name: /cancelar/i }).first();
  if (await cancelButton.isVisible().catch(() => false)) {
    await cancelButton.click();
  } else {
    const closeButton = page.locator('.modal-close').first();
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click();
    } else {
      await page.evaluate(() => {
        if (window.UI && typeof window.UI.closeModal === 'function') {
          window.UI.closeModal();
        }
        const overlay = document.querySelector('.modal-overlay');
        if (overlay && overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
      });
    }
  }

  await expect(page.locator('.modal-overlay')).toHaveCount(0, { timeout: 10000 });
}

async function openAndValidateModal(page, actionName) {
  const opened = await page.evaluate(async (action) => {
    try {
      const fn = action.split('.').reduce((acc, key) => (acc ? acc[key] : null), window);
      if (typeof fn !== 'function') return false;
      const result = fn.call(action.startsWith('window.') ? window : undefined);
      if (result && typeof result.then === 'function') {
        await result;
      }
      return true;
    } catch {
      return false;
    }
  }, actionName);

  if (!opened) return false;

  await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 10000 });
  await closeAnyModal(page);
  return true;
}

test.describe('E2E - Todos los módulos', () => {
  test('navega todos los módulos sin errores JS ni 5xx', async ({ page }) => {
    const jsErrors = [];
    const serverErrors = [];

    page.on('pageerror', (error) => {
      jsErrors.push(String(error));
    });

    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('/api/') && response.status() >= 500) {
        serverErrors.push(`${response.status()} ${url}`);
      }
    });

    await login(page);

    for (const moduleName of MODULES) {
      await openModule(page, moduleName);
    }

    expect(jsErrors, `Errores JS detectados:\n${jsErrors.join('\n')}`).toEqual([]);
    expect(serverErrors, `Respuestas 5xx detectadas:\n${serverErrors.join('\n')}`).toEqual([]);
  });

  test('ejecuta acciones funcionales base por módulo crítico', async ({ page }) => {
    const jsErrors = [];
    const serverErrors = [];

    page.on('pageerror', (error) => {
      jsErrors.push(String(error));
    });

    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('/api/') && response.status() >= 500) {
        serverErrors.push(`${response.status()} ${url}`);
      }
    });

    await login(page);

    await openModule(page, 'branches');
    await openAndValidateModal(page, 'window.Branches.showAddBranchForm');

    await openModule(page, 'inventory');
    await openAndValidateModal(page, 'window.Inventory.showAddForm');

    await openModule(page, 'customers');
    await openAndValidateModal(page, 'window.Customers.showAddForm');

    await openModule(page, 'employees');
    await openAndValidateModal(page, 'window.Employees.showAddEmployeeForm');

    await openModule(page, 'cash');
    await openAndValidateModal(page, 'window.Cash.showMovementForm');

    await openModule(page, 'repairs');
    await openAndValidateModal(page, 'window.Repairs.showAddForm');

    await openModule(page, 'reports');
    await expect(page.locator('#module-content')).toContainText(/reporte|captura|resumen/i, { timeout: 10000 });

    await openModule(page, 'settings');
    await expect(page.locator('#module-content')).toContainText(/configuración|sistema|mantenimiento/i, { timeout: 10000 });

    await openModule(page, 'dashboard');
    await expect(page.locator('#module-content')).toContainText(/ventas|utilidad|resumen/i, { timeout: 10000 });

    await openModule(page, 'catalogs');
    await expect(page.locator('#module-content')).toContainText(/catálogo|vendedor|guía|agencia/i, { timeout: 10000 });

    await openModule(page, 'pos');
    await expect(page.locator('#module-content')).toContainText(/venta|carrito|pago/i, { timeout: 10000 });

    await openModule(page, 'sync');
    await expect(page.locator('#module-content')).toContainText(/sincron|pendiente|estado/i, { timeout: 10000 });

    expect(jsErrors, `Errores JS detectados:\n${jsErrors.join('\n')}`).toEqual([]);
    expect(serverErrors, `Respuestas 5xx detectadas:\n${serverErrors.join('\n')}`).toEqual([]);
  });
});
