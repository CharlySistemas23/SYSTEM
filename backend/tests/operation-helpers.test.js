import { describe, expect, it, vi } from 'vitest';
import { createOperationLogger, safeRollback } from '../utils/operation-helpers.js';

describe('operation helpers', () => {
  it('creates structured log payloads with scope and event', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logOperation = createOperationLogger('test-scope');

    logOperation('started', { requestId: 'abc123' });

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(payload.scope).toBe('test-scope');
    expect(payload.event).toBe('started');
    expect(payload.requestId).toBe('abc123');
    expect(payload.timestamp).toBeDefined();

    consoleSpy.mockRestore();
  });

  it('swallows rollback errors and warns once', async () => {
    const client = {
      query: vi.fn().mockRejectedValue(new Error('rollback failed'))
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(safeRollback(client, 'unit-test')).resolves.toBeUndefined();

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('unit-test');

    warnSpy.mockRestore();
  });
});