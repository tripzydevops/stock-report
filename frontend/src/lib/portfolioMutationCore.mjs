/**
 * Pure transition logic for portfolio mutations.
 * Independent of React DOM lifecycle, enabling direct testing under node:test.
 */

import {
  MAX_MUTATION_RETRIES,
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
} from './portfolioMutationStorage.mjs';

export function resolveEndpointForMutation(mutation) {
  switch (mutation.type) {
    case 'BUY':
    case 'SELL':
      return { url: '/api/portfolio/positions', method: 'POST' };
    case 'DELETE_POSITION': {
      const sym = mutation.body?.symbol;
      const url = sym ? `/api/portfolio/positions?symbol=${encodeURIComponent(sym)}` : '/api/portfolio/positions';
      return { url, method: 'DELETE' };
    }
    case 'DEPOSIT':
    case 'WITHDRAW':
      return { url: '/api/portfolio/transfers', method: 'POST' };
    default:
      return { url: '/api/portfolio/positions', method: 'POST' };
  }
}

/**
 * Creates an instance of the portfolio mutation state machine backed by pure storage and sender function.
 */
export function createPortfolioMutationController({
  sendRequestToServer,
  onReconciliationSuccess,
  isOffline = false,
  rollbackRegistry = new Map(),
}) {
  let status = 'IDLE';
  let activeAction = null;

  async function executeMutation(request) {
    const clientOrderId = request.clientOrderId || generateClientOrderId();
    const mutation = {
      id: `mut-${Date.now()}`,
      clientOrderId,
      type: request.type,
      body: request.body,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      status: 'PENDING',
    };

    if (request.optimisticRollback) {
      rollbackRegistry.set(clientOrderId, request.optimisticRollback);
    }

    status = 'PENDING';
    activeAction = mutation;

    // Fast-path: Offline
    if (isOffline) {
      const offlineItem = {
        ...mutation,
        status: 'PENDING',
        lastError: 'Saved offline — client offline',
      };
      enqueueOfflineMutationItem(offlineItem);
      status = 'OFFLINE';
      activeAction = null;
      return {
        success: true,
        status: 'OFFLINE',
        clientOrderId,
        error: 'Action queued offline',
      };
    }

    const response = await sendRequestToServer(mutation);

    if (response.ok) {
      status = 'IDLE';
      activeAction = null;
      rollbackRegistry.delete(clientOrderId);
      if (onReconciliationSuccess) {
        onReconciliationSuccess(response.data);
      }
      return {
        success: true,
        status: 'IDLE',
        clientOrderId,
        data: response.data,
      };
    }

    // Deterministic 4xx: FAILED
    if (response.status >= 400 && response.status < 500 && response.status !== 429) {
      const failReason = response.error || `Validation error (${response.status})`;
      recordFailedMutationItem(mutation, failReason);
      status = 'FAILED';
      activeAction = null;
      return {
        success: false,
        status: 'FAILED',
        clientOrderId,
        error: failReason,
      };
    }

    // Transient failure: RETRYABLE
    const backoffMs = response.retryAfterMs ?? computeNextBackoffMs(0);
    const retryableItem = {
      ...mutation,
      status: 'RETRYABLE',
      lastError: response.error,
      nextRetryAt: Date.now() + backoffMs,
    };
    enqueueOfflineMutationItem(retryableItem);
    status = 'RETRYABLE';
    activeAction = null;

    return {
      success: false,
      status: 'RETRYABLE',
      clientOrderId,
      error: response.error,
    };
  }

  async function retryAction(clientOrderId) {
    const failed = getFailedMutationList();
    const queue = getOfflineMutationQueue();
    const target = failed.find((m) => m.clientOrderId === clientOrderId) ||
                   queue.find((m) => m.clientOrderId === clientOrderId);
    if (!target) return;

    removeFailedMutationItem(clientOrderId);
    removeOfflineMutationItem(clientOrderId);

    status = 'PENDING';
    activeAction = target;

    const response = await sendRequestToServer(target);

    if (response.ok) {
      rollbackRegistry.delete(clientOrderId);
      status = 'IDLE';
      activeAction = null;
      if (onReconciliationSuccess) {
        onReconciliationSuccess(response.data);
      }
    } else if (response.status >= 400 && response.status < 500 && response.status !== 429) {
      recordFailedMutationItem(target, response.error || 'Server rejected retry');
      status = 'FAILED';
      activeAction = null;
    } else {
      const nextCount = (target.retryCount || 0) + 1;
      const backoffMs = response.retryAfterMs ?? computeNextBackoffMs(nextCount);
      const retryableItem = {
        ...target,
        retryCount: nextCount,
        status: 'RETRYABLE',
        lastError: response.error,
        nextRetryAt: Date.now() + backoffMs,
      };
      if (nextCount >= MAX_MUTATION_RETRIES) {
        recordFailedMutationItem(
          target,
          `Exceeded maximum retries (${MAX_MUTATION_RETRIES}): ${response.error || 'Connection error'}`
        );
        status = 'FAILED';
      } else {
        enqueueOfflineMutationItem(retryableItem);
        status = 'RETRYABLE';
      }
      activeAction = null;
    }
  }

  async function discardAction(clientOrderId) {
    removeFailedMutationItem(clientOrderId);
    removeOfflineMutationItem(clientOrderId);

    const rollback = rollbackRegistry.get(clientOrderId);
    if (rollback) {
      try {
        rollback();
      } catch (err) {
        console.warn('Rollback exception:', err);
      }
      rollbackRegistry.delete(clientOrderId);
    }

    if (activeAction?.clientOrderId === clientOrderId) {
      activeAction = null;
      status = 'IDLE';
    }
  }

  async function discardAllFailedActions() {
    const failed = getFailedMutationList();
    for (const item of failed) {
      const rollback = rollbackRegistry.get(item.clientOrderId);
      if (rollback) {
        try {
          rollback();
        } catch {}
        rollbackRegistry.delete(item.clientOrderId);
      }
    }
    saveFailedMutationList([]);
    status = 'IDLE';
  }

  async function drainQueue() {
    const queue = getOfflineMutationQueue();
    if (queue.length === 0) return;

    const now = Date.now();
    const dueQueue = queue.filter((item) => !item.nextRetryAt || item.nextRetryAt <= now);
    const deferredQueue = queue.filter((item) => item.nextRetryAt && item.nextRetryAt > now);

    if (dueQueue.length === 0) {
      status = 'RETRYABLE';
      return;
    }

    status = 'PENDING';
    const remaining = [...deferredQueue];

    for (const item of dueQueue) {
      const response = await sendRequestToServer(item);
      if (response.ok) {
        rollbackRegistry.delete(item.clientOrderId);
        continue;
      }

      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        recordFailedMutationItem(item, response.error || 'Validation error during sync drain');
        continue;
      }

      const currentRetries = (item.retryCount || 0) + 1;
      if (currentRetries >= MAX_MUTATION_RETRIES) {
        recordFailedMutationItem(
          item,
          `Exceeded maximum retries (${MAX_MUTATION_RETRIES}): ${response.error || 'Server unavailable'}`
        );
      } else {
        const backoffMs = response.retryAfterMs ?? computeNextBackoffMs(currentRetries);
        remaining.push({
          ...item,
          retryCount: currentRetries,
          status: 'RETRYABLE',
          lastError: response.error,
          nextRetryAt: Date.now() + backoffMs,
        });
      }
    }

    saveOfflineMutationQueue(remaining);
    status = remaining.length > 0 ? 'RETRYABLE' : 'IDLE';
  }

  return {
    getStatus: () => status,
    getActiveAction: () => activeAction,
    executeMutation,
    retryAction,
    discardAction,
    discardAllFailedActions,
    drainQueue,
  };
}
