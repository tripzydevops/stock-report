import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPortfolioMutationController,
  resolveEndpointForMutation,
} from '../portfolioMutationCore.mjs';
import {
  getOfflineMutationQueue,
  saveOfflineMutationQueue,
  getFailedMutationList,
  saveFailedMutationList,
} from '../portfolioMutationStorage.mjs';

// Setup Mock in-memory localStorage
class MemoryStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.get(key) || null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

const memoryStorage = new MemoryStorage();
globalThis.localStorage = memoryStorage;
globalThis.window = { localStorage: memoryStorage };

test('resolveEndpointForMutation maps actions to correct endpoints and HTTP methods', () => {
  assert.deepEqual(resolveEndpointForMutation({ type: 'BUY', body: {} }), {
    url: '/api/portfolio/positions',
    method: 'POST',
  });
  assert.deepEqual(resolveEndpointForMutation({ type: 'SELL', body: {} }), {
    url: '/api/portfolio/positions',
    method: 'POST',
  });
  assert.deepEqual(resolveEndpointForMutation({ type: 'DEPOSIT', body: { amount: 5000 } }), {
    url: '/api/portfolio/transfers',
    method: 'POST',
  });
  assert.deepEqual(resolveEndpointForMutation({ type: 'WITHDRAW', body: { amount: 1000 } }), {
    url: '/api/portfolio/transfers',
    method: 'POST',
  });
  assert.deepEqual(resolveEndpointForMutation({ type: 'DELETE_POSITION', body: { positionId: 'pos-123-uuid' } }), {
    url: '/api/portfolio/positions?positionId=pos-123-uuid',
    method: 'DELETE',
  });
});

test('State Transition: Successful mutation transitions PENDING -> IDLE and clears rollback registry', async () => {
  memoryStorage.clear();
  let rollbackInvoked = false;
  const rollbackRegistry = new Map();

  const controller = createPortfolioMutationController({
    sendRequestToServer: async () => ({ ok: true, status: 201, data: { success: true } }),
    rollbackRegistry,
  });

  const res = await controller.executeMutation({
    type: 'BUY',
    body: { symbol: 'FROTO', shares: 10, price: 1100 },
    clientOrderId: 'cl-success-1',
    optimisticRollback: () => {
      rollbackInvoked = true;
    },
  });

  assert.equal(res.success, true);
  assert.equal(res.status, 'IDLE');
  assert.equal(controller.getStatus(), 'IDLE');
  assert.equal(rollbackRegistry.has('cl-success-1'), false, 'Rollback entry should be deleted on success');
  assert.equal(rollbackInvoked, false);
});

test('State Transition: Deterministic 4xx records FAILED and preserves payload for review', async () => {
  memoryStorage.clear();
  const controller = createPortfolioMutationController({
    sendRequestToServer: async () => ({ ok: false, status: 400, error: 'Insufficient balance' }),
  });

  const res = await controller.executeMutation({
    type: 'BUY',
    body: { symbol: 'KCHOL', shares: 50, price: 240 },
    clientOrderId: 'cl-fail-400',
  });

  assert.equal(res.success, false);
  assert.equal(res.status, 'FAILED');
  assert.equal(controller.getStatus(), 'FAILED');

  const failed = getFailedMutationList();
  assert.equal(failed.length, 1);
  assert.equal(failed[0].clientOrderId, 'cl-fail-400');
  assert.equal(failed[0].lastError, 'Insufficient balance');
});

test('State Transition: Network failure / timeout records RETRYABLE and enqueues offline', async () => {
  memoryStorage.clear();
  const controller = createPortfolioMutationController({
    sendRequestToServer: async () => ({ ok: false, status: 0, error: 'Network timed out' }),
  });

  const res = await controller.executeMutation({
    type: 'DEPOSIT',
    body: { amount: 10000, currency: 'TRY' },
    clientOrderId: 'cl-retryable-net',
  });

  assert.equal(res.success, false);
  assert.equal(res.status, 'RETRYABLE');
  assert.equal(controller.getStatus(), 'RETRYABLE');

  const queue = getOfflineMutationQueue();
  assert.equal(queue.length, 1);
  assert.equal(queue[0].clientOrderId, 'cl-retryable-net');
  assert.ok(queue[0].nextRetryAt > Date.now());
});

test('Retry preserves clientOrderId and increments retry count on transient failure', async () => {
  memoryStorage.clear();
  let attempts = 0;
  const controller = createPortfolioMutationController({
    sendRequestToServer: async (mutation) => {
      attempts++;
      assert.equal(mutation.clientOrderId, 'cl-retry-test');
      return { ok: false, status: 503, error: 'Service Unavailable' };
    },
  });

  // Seed into offline queue
  saveOfflineMutationQueue([
    {
      id: 'mut-ret',
      clientOrderId: 'cl-retry-test',
      type: 'BUY',
      body: { symbol: 'SISE', shares: 100, price: 46 },
      createdAt: new Date().toISOString(),
      retryCount: 0,
      status: 'RETRYABLE',
    },
  ]);

  await controller.retryAction('cl-retry-test');
  assert.equal(attempts, 1);
  assert.equal(controller.getStatus(), 'RETRYABLE');

  const queue = getOfflineMutationQueue();
  assert.equal(queue.length, 1);
  assert.equal(queue[0].retryCount, 1);
  assert.ok(queue[0].nextRetryAt > Date.now());
});

test('Discard removes action and triggers registered rollback callback exactly once', async () => {
  memoryStorage.clear();
  let rollbackCount = 0;
  const rollbackRegistry = new Map();
  rollbackRegistry.set('cl-discard-test', () => {
    rollbackCount++;
  });

  saveFailedMutationList([
    {
      id: 'mut-f',
      clientOrderId: 'cl-discard-test',
      type: 'SELL',
      body: { symbol: 'THYAO', shares: 20, price: 320 },
      createdAt: new Date().toISOString(),
      status: 'FAILED',
    },
  ]);

  const controller = createPortfolioMutationController({
    sendRequestToServer: async () => ({ ok: true, status: 200 }),
    rollbackRegistry,
  });

  await controller.discardAction('cl-discard-test');
  assert.equal(rollbackCount, 1, 'Rollback callback must be invoked on discard');
  assert.equal(rollbackRegistry.has('cl-discard-test'), false);
  assert.equal(getFailedMutationList().length, 0);
});

test('drainQueue respects nextRetryAt backoff and leaves status in RETRYABLE if items remain', async () => {
  memoryStorage.clear();
  const futureTimestamp = Date.now() + 60000;
  let sentCount = 0;

  // Queue with one due item and one deferred item
  saveOfflineMutationQueue([
    {
      id: 'mut-due',
      clientOrderId: 'cl-due',
      type: 'DEPOSIT',
      body: { amount: 500 },
      createdAt: new Date().toISOString(),
      nextRetryAt: Date.now() - 1000, // Due now
      status: 'RETRYABLE',
    },
    {
      id: 'mut-deferred',
      clientOrderId: 'cl-deferred',
      type: 'DEPOSIT',
      body: { amount: 1500 },
      createdAt: new Date().toISOString(),
      nextRetryAt: futureTimestamp, // Not due yet
      status: 'RETRYABLE',
    },
  ]);

  const controller = createPortfolioMutationController({
    sendRequestToServer: async (mutation) => {
      sentCount++;
      assert.equal(mutation.clientOrderId, 'cl-due');
      return { ok: true, status: 201 };
    },
  });

  await controller.drainQueue();
  assert.equal(sentCount, 1, 'Only due item should be dispatched');
  assert.equal(controller.getStatus(), 'RETRYABLE', 'Status must stay RETRYABLE because deferred item remains');

  const remaining = getOfflineMutationQueue();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].clientOrderId, 'cl-deferred');
});
