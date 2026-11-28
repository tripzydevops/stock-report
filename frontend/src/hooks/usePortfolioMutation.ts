'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  PortfolioActionStatus,
  PortfolioMutation,
  PortfolioMutationRequest,
  PortfolioMutationResult,
  MAX_MUTATION_RETRIES,
} from '../types/portfolioMutation';
import {
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
} from '../lib/portfolioMutationStorage';

export interface UsePortfolioMutationOptions {
  onReconciliationSuccess?: (result: unknown) => void;
  getAuthToken?: () => Promise<string | null>;
  isOffline?: boolean;
}

export interface UsePortfolioMutationReturn {
  status: PortfolioActionStatus;
  activeAction: PortfolioMutation | null;
  failedActions: PortfolioMutation[];
  offlineQueueCount: number;
  executeMutation: (request: PortfolioMutationRequest) => Promise<PortfolioMutationResult>;
  retryAction: (clientOrderId: string) => Promise<void>;
  discardAction: (clientOrderId: string) => Promise<void>;
  discardAllFailedActions: () => Promise<void>;
  drainQueue: () => Promise<void>;
}

/**
 * Resolves endpoint and HTTP method based on mutation type
 */
export function resolveEndpointForMutation(mutation: PortfolioMutation): { url: string; method: string } {
  switch (mutation.type) {
    case 'BUY':
    case 'SELL':
      return { url: '/api/portfolio/positions', method: 'POST' };
    case 'DELETE_POSITION': {
      const posId = mutation.body?.positionId || (typeof mutation.body?.id === 'string' ? mutation.body.id : undefined);
      const url = posId ? `/api/portfolio/positions?positionId=${encodeURIComponent(posId)}` : '/api/portfolio/positions';
      return { url, method: 'DELETE' };
    }
    case 'DEPOSIT':
    case 'WITHDRAW':
      return { url: '/api/portfolio/transfers', method: 'POST' };
    default:
      return { url: '/api/portfolio/positions', method: 'POST' };
  }
}

export function usePortfolioMutation(
  options: UsePortfolioMutationOptions = {}
): UsePortfolioMutationReturn {
  const { onReconciliationSuccess, getAuthToken, isOffline: propIsOffline } = options;

  const [status, setStatus] = useState<PortfolioActionStatus>('IDLE');
  const [activeAction, setActiveAction] = useState<PortfolioMutation | null>(null);
  const [failedActions, setFailedActions] = useState<PortfolioMutation[]>(() => getFailedMutationList());
  const [offlineQueueCount, setOfflineQueueCount] = useState<number>(() => getOfflineMutationQueue().length);

  // Store registered rollback functions keyed by clientOrderId
  const rollbackRegistry = useRef<Map<string, () => void>>(new Map());

  // Ref to track current activeAction without stale closures
  const activeActionRef = useRef<PortfolioMutation | null>(null);
  activeActionRef.current = activeAction;

  // Keep state synced with localStorage across tabs/events
  const syncStateFromStorage = useCallback(() => {
    setFailedActions(getFailedMutationList());
    setOfflineQueueCount(getOfflineMutationQueue().length);
  }, []);

  useEffect(() => {
    syncStateFromStorage();
    const handleStorage = (e: StorageEvent) => {
      if (
        e.key?.includes('portfolio.mutations') ||
        e.key?.includes('marketpulse_offline') ||
        e.key?.includes('marketpulse_failed')
      ) {
        syncStateFromStorage();
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [syncStateFromStorage]);

  /**
   * Internal sender that routes each mutation type to its appropriate endpoint
   * and respects Idempotency-Key & Retry-After
   */
  const sendRequestToServer = useCallback(
    async (
      mutation: PortfolioMutation
    ): Promise<{ ok: boolean; status: number; data?: any; error?: string; retryAfterMs?: number }> => {
      let token: string | null = null;
      if (getAuthToken) {
        try {
          token = await getAuthToken();
        } catch {}
      }

      const { url, method } = resolveEndpointForMutation(mutation);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Idempotency-Key': mutation.clientOrderId,
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      try {
        const bodyPayload = method === 'DELETE' ? undefined : JSON.stringify({
          ...mutation.body,
          client_order_id: mutation.clientOrderId,
          type: mutation.type === 'DEPOSIT' || mutation.type === 'WITHDRAW' ? mutation.type : undefined,
          transferType: mutation.type === 'DEPOSIT' || mutation.type === 'WITHDRAW' ? (mutation.type === 'WITHDRAW' ? 'WITHDRAWAL' : 'DEPOSIT') : undefined,
        });

        const res = await fetch(url, {
          method,
          headers,
          body: bodyPayload,
        });

        // Parse optional Retry-After header
        let retryAfterMs: number | undefined;
        const retryAfterHeader = res.headers.get('Retry-After');
        if (retryAfterHeader) {
          const parsedSec = parseInt(retryAfterHeader, 10);
          if (Number.isFinite(parsedSec) && parsedSec > 0) {
            retryAfterMs = parsedSec * 1000;
          }
        }

        const json = await res.json().catch(() => ({}));
        if (res.ok) {
          return { ok: true, status: res.status, data: json };
        }
        return {
          ok: false,
          status: res.status,
          error: json.error || `HTTP ${res.status}`,
          retryAfterMs,
        };
      } catch (networkErr: any) {
        return {
          ok: false,
          status: 0,
          error: networkErr?.message || 'Network unreachable or connection timed out',
        };
      }
    },
    [getAuthToken]
  );

  /**
   * Executes a mutating portfolio action with optimistic reservation and deterministic branching
   */
  const executeMutation = useCallback(
    async (request: PortfolioMutationRequest): Promise<PortfolioMutationResult> => {
      const clientOrderId = request.clientOrderId || generateClientOrderId();
      const mutation: PortfolioMutation = {
        id: `mut-${Date.now()}`,
        clientOrderId,
        type: request.type,
        body: request.body,
        createdAt: new Date().toISOString(),
        retryCount: 0,
        status: 'PENDING',
      };

      if (request.optimisticRollback) {
        rollbackRegistry.current.set(clientOrderId, request.optimisticRollback);
      }

      setStatus('PENDING');
      setActiveAction(mutation);

      const isClientOffline = propIsOffline || (typeof navigator !== 'undefined' && !navigator.onLine);

      // Fast-path: Offline connectivity
      if (isClientOffline) {
        const offlineItem: PortfolioMutation = {
          ...mutation,
          status: 'PENDING',
          lastError: 'Saved offline — client offline',
        };
        enqueueOfflineMutationItem(offlineItem);
        syncStateFromStorage();
        setStatus('OFFLINE');
        setActiveAction(null);
        return {
          success: true,
          status: 'OFFLINE',
          clientOrderId,
          error: 'Action queued offline',
        };
      }

      // Online dispatch
      const response = await sendRequestToServer(mutation);

      if (response.ok) {
        setStatus('IDLE');
        setActiveAction(null);
        rollbackRegistry.current.delete(clientOrderId);
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

      // Branch 1: Deterministic 4xx (Validation error, Insufficient cash, etc.) -> FAILED
      // Do NOT retry automatically. Retain payload for user choice: Retry or Discard.
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        const failReason = response.error || `Validation error (${response.status})`;
        const shouldRollback = typeof request.rollbackOnDeterministicFailure === 'boolean'
          ? request.rollbackOnDeterministicFailure
          : mutation.type !== 'DEPOSIT';

        let rollbackApplied = false;
        if (shouldRollback) {
          const rollback = rollbackRegistry.current.get(clientOrderId);
          if (rollback) {
            try {
              rollback();
            } catch (err) {
              console.warn('[usePortfolioMutation] Rollback exception:', err);
            }
            rollbackRegistry.current.delete(clientOrderId);
          }
          rollbackApplied = true;
        }

        const failedMutation: PortfolioMutation = {
          ...mutation,
          rollbackApplied,
        };

        recordFailedMutationItem(failedMutation, failReason);
        syncStateFromStorage();
        setStatus('FAILED');
        setActiveAction(null);
        return {
          success: false,
          status: 'FAILED',
          clientOrderId,
          error: failReason,
        };
      }

      // Branch 2: Network error (status 0), Rate limit (429), or Server error (5xx) -> RETRYABLE / OFFLINE
      const backoffMs = response.retryAfterMs ?? computeNextBackoffMs(0);
      const retryableItem: PortfolioMutation = {
        ...mutation,
        status: 'RETRYABLE',
        lastError: response.error,
        nextRetryAt: Date.now() + backoffMs,
      };
      enqueueOfflineMutationItem(retryableItem);
      syncStateFromStorage();
      setStatus('RETRYABLE');
      setActiveAction(null);

      return {
        success: false,
        status: 'RETRYABLE',
        clientOrderId,
        error: response.error,
      };
    },
    [propIsOffline, sendRequestToServer, syncStateFromStorage, onReconciliationSuccess]
  );

  /**
   * Retries an action (searches both failed list and offline/retryable queue)
   * using the preserved clientOrderId and payload.
   */
  const retryAction = useCallback(
    async (clientOrderId: string): Promise<void> => {
      const failed = getFailedMutationList();
      const queue = getOfflineMutationQueue();

      const target = failed.find((m) => m.clientOrderId === clientOrderId) ||
                     queue.find((m) => m.clientOrderId === clientOrderId);
      if (!target) return;

      // Remove from queues before retrying to prevent duplicate processing
      removeFailedMutationItem(clientOrderId);
      removeOfflineMutationItem(clientOrderId);

      setStatus('PENDING');
      setActiveAction(target);

      const response = await sendRequestToServer(target);

      if (response.ok) {
        rollbackRegistry.current.delete(clientOrderId);
        syncStateFromStorage();
        setStatus('IDLE');
        setActiveAction(null);
        if (onReconciliationSuccess) {
          onReconciliationSuccess(response.data);
        }
      } else if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        // Deterministic failure on retry: moves back to failed list
        const shouldRollback = target.type !== 'DEPOSIT';
        let rollbackApplied = Boolean(target.rollbackApplied);
        if (shouldRollback && !rollbackApplied) {
          const rollback = rollbackRegistry.current.get(clientOrderId);
          if (rollback) {
            try {
              rollback();
            } catch {}
            rollbackRegistry.current.delete(clientOrderId);
          }
          rollbackApplied = true;
        }
        recordFailedMutationItem({ ...target, rollbackApplied }, response.error || 'Server rejected retry');
        syncStateFromStorage();
        setStatus('FAILED');
        setActiveAction(null);
      } else {
        // Transient error on retry: increment retry count and schedule backoff
        const nextCount = (target.retryCount || 0) + 1;
        const backoffMs = response.retryAfterMs ?? computeNextBackoffMs(nextCount);
        const retryableItem: PortfolioMutation = {
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
          setStatus('FAILED');
        } else {
          enqueueOfflineMutationItem(retryableItem);
          setStatus('RETRYABLE');
        }
        syncStateFromStorage();
        setActiveAction(null);
      }
    },
    [sendRequestToServer, syncStateFromStorage, onReconciliationSuccess]
  );

  /**
   * Discards a failed or queued action and triggers optimistic rollback if registered
   */
  const discardAction = useCallback(
    async (clientOrderId: string): Promise<void> => {
      const failed = getFailedMutationList();
      const queue = getOfflineMutationQueue();
      const target = failed.find((m) => m.clientOrderId === clientOrderId) ||
                     queue.find((m) => m.clientOrderId === clientOrderId);

      if (!target?.rollbackApplied) {
        const rollback = rollbackRegistry.current.get(clientOrderId);
        if (rollback) {
          try {
            rollback();
          } catch (err) {
            console.warn('[usePortfolioMutation] Rollback exception:', err);
          }
        }
      }
      rollbackRegistry.current.delete(clientOrderId);

      removeFailedMutationItem(clientOrderId);
      removeOfflineMutationItem(clientOrderId);

      syncStateFromStorage();
      if (activeActionRef.current?.clientOrderId === clientOrderId) {
        setActiveAction(null);
        setStatus('IDLE');
      }
    },
    [syncStateFromStorage]
  );

  /**
   * Discards all failed actions in one operation and triggers their respective rollbacks
   */
  const discardAllFailedActions = useCallback(async (): Promise<void> => {
    const failed = getFailedMutationList();
    for (const item of failed) {
      if (!item.rollbackApplied) {
        const rollback = rollbackRegistry.current.get(item.clientOrderId);
        if (rollback) {
          try {
            rollback();
          } catch {}
        }
      }
      rollbackRegistry.current.delete(item.clientOrderId);
    }
    saveFailedMutationList([]);
    syncStateFromStorage();
    setStatus('IDLE');
  }, [syncStateFromStorage]);

  /**
   * Drains the offline/retryable queue in strict FIFO order, respecting nextRetryAt timestamps.
   * If items remain due to backoff or transient errors, leaves status in 'RETRYABLE'.
   */
  const drainQueue = useCallback(async (): Promise<void> => {
    const queue = getOfflineMutationQueue();
    if (queue.length === 0) return;

    const now = Date.now();
    // Filter items that are due now
    const dueQueue = queue.filter((item) => !item.nextRetryAt || item.nextRetryAt <= now);
    const deferredQueue = queue.filter((item) => item.nextRetryAt && item.nextRetryAt > now);

    if (dueQueue.length === 0) {
      // All remaining items are deferred in backoff
      setStatus('RETRYABLE');
      return;
    }

    setStatus('PENDING');
    const remaining: PortfolioMutation[] = [...deferredQueue];

    for (const item of dueQueue) {
      const response = await sendRequestToServer(item);
      if (response.ok) {
        rollbackRegistry.current.delete(item.clientOrderId);
        continue;
      }

      // If deterministic 4xx error on drain, move to failed list
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        const shouldRollback = item.type !== 'DEPOSIT';
        let rollbackApplied = Boolean(item.rollbackApplied);
        if (shouldRollback && !rollbackApplied) {
          const rollback = rollbackRegistry.current.get(item.clientOrderId);
          if (rollback) {
            try {
              rollback();
            } catch {}
            rollbackRegistry.current.delete(item.clientOrderId);
          }
          rollbackApplied = true;
        }
        recordFailedMutationItem({ ...item, rollbackApplied }, response.error || 'Validation error during sync drain');
        continue;
      }

      // Transient failure: increment retry count up to max
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
    syncStateFromStorage();
    setStatus(remaining.length > 0 ? 'RETRYABLE' : 'IDLE');
  }, [sendRequestToServer, syncStateFromStorage]);

  return {
    status,
    activeAction,
    failedActions,
    offlineQueueCount,
    executeMutation,
    retryAction,
    discardAction,
    discardAllFailedActions,
    drainQueue,
  };
}
