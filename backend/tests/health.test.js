// Test básico de salud del servidor
import { describe, it, expect } from 'vitest';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === 'true';
const describeIntegration = runIntegrationTests ? describe : describe.skip;

describeIntegration('Health Check', () => {
  it('should return 200 OK', async () => {
    const response = await fetch(`${BASE_URL}/health`);
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.status).toBe('OK');
    expect(data.timestamp).toBeDefined();
  });
});
