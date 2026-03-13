import { describe, it, expect } from 'vitest';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === 'true';
const originBranchId = process.env.INTEGRATION_BRANCH_ID;
const username = process.env.INTEGRATION_USERNAME || 'integration_tester';
const explicitToBranchId = process.env.TEST_TO_BRANCH_ID;

const hasRequiredEnv = Boolean(originBranchId);
const describeIntegration = runIntegrationTests && hasRequiredEnv ? describe : describe.skip;

const buildHeaders = () => ({
  'Content-Type': 'application/json',
  'x-username': username,
  'x-branch-id': originBranchId
});

const requestJson = async (path, options = {}) => {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...buildHeaders(),
      ...(options.headers || {})
    }
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return { response, data };
};

const createInventoryFixture = async (suffix) => {
  const now = Date.now();
  const sku = `IT-${suffix}-${now}`;
  const payload = {
    branch_id: originBranchId,
    sku,
    name: `Fixture ${suffix}`,
    description: `Fixture ${suffix}`,
    category: 'integration',
    metal: 'oro',
    currency: 'MXN',
    price: 150,
    cost: 90,
    stock_actual: 3,
    status: 'disponible'
  };

  const { response, data } = await requestJson('/api/inventory', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  expect(response.status).toBe(201);
  expect(data?.id).toBeDefined();

  return data;
};

describeIntegration('Critical Business Flows', () => {
  it('creates and deletes quick capture report entries', async () => {
    const date = new Date().toISOString().slice(0, 10);
    const payload = {
      branch_id: originBranchId,
      product: `Producto test ${Date.now()}`,
      quantity: 1,
      currency: 'MXN',
      total: 123.45,
      date
    };

    const { response: createResponse, data: createdCapture } = await requestJson('/api/reports/quick-captures', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    expect(createResponse.status).toBe(201);
    expect(createdCapture?.id).toBeDefined();

    const { response: deleteResponse } = await requestJson(`/api/reports/quick-captures/${createdCapture.id}`, {
      method: 'DELETE'
    });

    expect(deleteResponse.status).toBe(200);
  });

  it('creates and reverses a sale with inventory fixture cleanup', async () => {
    let fixtureItemId = null;
    let createdSaleId = null;

    try {
      const fixtureItem = await createInventoryFixture('SALE');
      fixtureItemId = fixtureItem.id;

      const salePayload = {
        branch_id: originBranchId,
        items: [
          {
            item_id: fixtureItem.id,
            sku: fixtureItem.sku,
            name: fixtureItem.name,
            quantity: 1,
            unit_price: 150
          }
        ],
        payments: [
          {
            method: 'cash_mxn',
            amount: 150,
            currency: 'MXN'
          }
        ]
      };

      const { response: saleResponse, data: saleData } = await requestJson('/api/sales', {
        method: 'POST',
        body: JSON.stringify(salePayload)
      });

      expect(saleResponse.status).toBe(201);
      expect(saleData?.id).toBeDefined();
      createdSaleId = saleData.id;

      const { response: saleDeleteResponse } = await requestJson(`/api/sales/${createdSaleId}`, {
        method: 'DELETE'
      });
      expect(saleDeleteResponse.status).toBe(200);
      createdSaleId = null;
    } finally {
      if (createdSaleId) {
        await requestJson(`/api/sales/${createdSaleId}`, { method: 'DELETE' });
      }
      if (fixtureItemId) {
        await requestJson(`/api/inventory/${fixtureItemId}`, { method: 'DELETE' });
      }
    }
  }, 30000);

  it('creates and cancels a transfer when destination branch is available', async () => {
    let fixtureItemId = null;
    let createdTransferId = null;

    try {
      let toBranchId = explicitToBranchId;

      if (!toBranchId) {
        const { response: branchesResponse, data: branchesData } = await requestJson('/api/branches');
        expect(branchesResponse.status).toBe(200);
        const availableBranches = Array.isArray(branchesData) ? branchesData : [];
        const destination = availableBranches.find((branch) => branch?.id && branch.id !== originBranchId);
        toBranchId = destination?.id;
      }

      if (!toBranchId) {
        console.warn('No hay sucursal destino disponible para probar transferencias. Define TEST_TO_BRANCH_ID para habilitar esta prueba.');
        return;
      }

      const fixtureItem = await createInventoryFixture('TRF');
      fixtureItemId = fixtureItem.id;

      const transferPayload = {
        from_branch_id: originBranchId,
        to_branch_id: toBranchId,
        notes: 'Integration transfer test',
        items: [
          {
            item_id: fixtureItem.id,
            quantity: 1
          }
        ]
      };

      const { response: transferResponse, data: transferData } = await requestJson('/api/transfers', {
        method: 'POST',
        body: JSON.stringify(transferPayload)
      });

      expect(transferResponse.status).toBe(201);
      expect(transferData?.id).toBeDefined();
      createdTransferId = transferData.id;

      const { response: cancelResponse, data: cancelledData } = await requestJson(`/api/transfers/${createdTransferId}/cancel`, {
        method: 'PUT'
      });

      expect(cancelResponse.status).toBe(200);
      expect(cancelledData?.status).toBe('cancelled');
      createdTransferId = null;
    } finally {
      if (createdTransferId) {
        await requestJson(`/api/transfers/${createdTransferId}/cancel`, { method: 'PUT' });
      }
      if (fixtureItemId) {
        await requestJson(`/api/inventory/${fixtureItemId}`, { method: 'DELETE' });
      }
    }
  }, 30000);

  it('executes cash flow with open/movement/close when possible', async () => {
    let createdSessionId = null;
    let sessionIdForMovement = null;

    try {
      const { response: currentSessionResponse, data: currentSessionData } = await requestJson('/api/cash/sessions/current');

      if (currentSessionResponse.status === 200 && currentSessionData?.id) {
        sessionIdForMovement = currentSessionData.id;
      } else {
        const openPayload = {
          branch_id: originBranchId,
          initial_amount: 100,
          notes: 'Integration cash open'
        };

        const { response: openResponse, data: openedSession } = await requestJson('/api/cash/sessions', {
          method: 'POST',
          body: JSON.stringify(openPayload)
        });

        expect(openResponse.status).toBe(201);
        expect(openedSession?.id).toBeDefined();

        createdSessionId = openedSession.id;
        sessionIdForMovement = openedSession.id;
      }

      expect(sessionIdForMovement).toBeDefined();

      const movementPayload = {
        type: 'deposit',
        amount: 10,
        description: 'Integration cash movement'
      };

      const { response: movementResponse, data: movementData } = await requestJson(
        `/api/cash/sessions/${sessionIdForMovement}/movements`,
        {
          method: 'POST',
          body: JSON.stringify(movementPayload)
        }
      );

      expect(movementResponse.status).toBe(201);
      expect(movementData?.id).toBeDefined();

      if (createdSessionId) {
        const closePayload = {
          final_amount: 110,
          notes: 'Integration cash close'
        };

        const { response: closeResponse, data: closeData } = await requestJson(`/api/cash/sessions/${createdSessionId}/close`, {
          method: 'PUT',
          body: JSON.stringify(closePayload)
        });

        expect(closeResponse.status).toBe(200);
        expect(closeData?.status).toBe('closed');
      } else {
        console.warn('Sesión de caja ya abierta antes de la prueba: se validó movimiento, pero se omitió cierre para no interferir operación.');
      }
    } finally {
      if (createdSessionId) {
        await requestJson(`/api/cash/sessions/${createdSessionId}/close`, {
          method: 'PUT',
          body: JSON.stringify({ final_amount: 110, notes: 'Integration cash close (cleanup)' })
        });
      }
    }
  });
});
