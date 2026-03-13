// Tests básicos de API
import { describe, it, expect, beforeAll } from 'vitest';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === 'true';
const describeIntegration = runIntegrationTests ? describe : describe.skip;

let authToken = null;

describeIntegration('API Endpoints', () => {
  beforeAll(async () => {
    // Login para obtener token (opcional; si no existe usuario de prueba se omite test autenticado)
    const response = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'test_user',
        password: 'test_password'
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      authToken = data.token;
    }
  });

  it('should require authentication', async () => {
    const response = await fetch(`${BASE_URL}/api/inventory`);
    expect([400, 401, 403]).toContain(response.status);
  });

  it('should return inventory items when authenticated', async () => {
    if (!authToken) {
      console.warn('No auth token, skipping test');
      return;
    }

    const response = await fetch(`${BASE_URL}/api/inventory`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toBeDefined();
    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.total).toBe('number');
  });
});
