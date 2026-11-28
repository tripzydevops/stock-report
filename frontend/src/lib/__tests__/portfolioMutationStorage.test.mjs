import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PORTFOLIO_MUTATIONS_STORAGE_KEY,
  PORTFOLIO_FAILED_STORAGE_KEY,
  LEGACY_OFFLINE_QUEUE_KEY,
  LEGACY_FAILED_MUTATIONS_KEY,
  getOfflineMutationQueue,
  saveOfflineMutationQueue,
  getFailedMutationList,
  saveFailedMutationList,
  recordFailedMutationItem,
  enqueueOfflineMutationItem,
  removeOfflineMutationItem,
  removeFailedMutationItem,
  computeNextBackoffMs,
  generateClientOrderId,
} from '../portfolioMutationStorage.mjs';

// Mock localStorage for node:test environment
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

test('generateClientOrderId creates unique valid order ID tokens', () => {
  const id1 = generateClientOrderId();
  const id2 = generateClientOrderId();
  assert.ok(id1.length > 8);
  assert.notEqual(id1, id2);
});

test('computeNextBackoffMs returns bounded exponential delay sequence', () => {
  assert.equal(computeNextBackoffMs(0), 60_000);
  assert.equal(computeNextBackoffMs(1), 300_000);
  assert.equal(computeNextBackoffMs(2), 900_000);
  assert.equal(computeNextBackoffMs(3), 3_600_000);
  assert.equal(computeNextBackoffMs(10), 3_600_000, 'Cap at maximum backoff');
});

test('Legacy migration: reads legacy queue key and transparently moves to versioned key', () => {
  memoryStorage.clear();
  const legacyQueue = [
    {
      id: 'mut-old',
      clientOrderId: 'cl-old-123',
      type: 'BUY',
      body: { symbol: 'THYAO', shares: 50, price: 310 },
      createdAt: new Date().toISOString(),
    },
  ];
  memoryStorage.setItem(LEGACY_OFFLINE_QUEUE_KEY, JSON.stringify(legacyQueue));

  const loaded = getOfflineMutationQueue();
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].clientOrderId, 'cl-old-123');
  assert.ok(memoryStorage.getItem(PORTFOLIO_MUTATIONS_STORAGE_KEY), 'Must persist to versioned key');
  assert.equal(memoryStorage.getItem(LEGACY_OFFLINE_QUEUE_KEY), null, 'Must clear legacy key after migration');
});

test('enqueueOfflineMutationItem idempotency: ignores duplicate clientOrderId', () => {
  memoryStorage.clear();
  const item = {
    id: 'mut-1',
    clientOrderId: 'order-dup-check',
    type: 'BUY',
    body: { symbol: 'EREGL', shares: 100, price: 48 },
    createdAt: new Date().toISOString(),
  };

  enqueueOfflineMutationItem(item);
  enqueueOfflineMutationItem(item); // second call with same clientOrderId

  const queue = getOfflineMutationQueue();
  assert.equal(queue.length, 1, 'Duplicate clientOrderId must not be appended');
});

test('recordFailedMutationItem stores and updates failure reasons', () => {
  memoryStorage.clear();
  const item = {
    id: 'mut-fail-1',
    clientOrderId: 'cl-fail-999',
    type: 'SELL',
    body: { symbol: 'TUPRS', shares: 20, price: 140 },
    createdAt: new Date().toISOString(),
  };

  recordFailedMutationItem(item, 'Insufficient position quantity');
  let list = getFailedMutationList();
  assert.equal(list.length, 1);
  assert.equal(list[0].status, 'FAILED');
  assert.equal(list[0].lastError, 'Insufficient position quantity');

  // Updating same failed item
  recordFailedMutationItem(item, 'Market closed');
  list = getFailedMutationList();
  assert.equal(list.length, 1, 'Must update existing item, not duplicate');
  assert.equal(list[0].lastError, 'Market closed');
});

test('removeOfflineMutationItem and removeFailedMutationItem cleanly prune items', () => {
  memoryStorage.clear();
  const item = {
    id: 'mut-del',
    clientOrderId: 'cl-to-remove',
    type: 'BUY',
    body: { symbol: 'BIMAS', shares: 10, price: 500 },
    createdAt: new Date().toISOString(),
  };

  enqueueOfflineMutationItem(item);
  assert.equal(getOfflineMutationQueue().length, 1);
  removeOfflineMutationItem('cl-to-remove');
  assert.equal(getOfflineMutationQueue().length, 0);

  recordFailedMutationItem(item, 'Test error');
  assert.equal(getFailedMutationList().length, 1);
  removeFailedMutationItem('cl-to-remove');
  assert.equal(getFailedMutationList().length, 0);
});
