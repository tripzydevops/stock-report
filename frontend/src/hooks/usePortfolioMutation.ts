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
   * Internal sender that handles fetch to /api/portfolio/positions with idempotency key
   */
  const sendRequestToServer = useCallback(
    async (mutation: PortfolioMutation): Promise<{ ok: boolean; status: number; data?: any; error?: string }> => {
      let token: string | null = null;
      if (getAuthToken) {
        try {
          token = await getAuthToken();
        } catch {}
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Idempotency-Key': mutation.clientOrderId,
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      try {
        const res = await fetch('/api/portfolio/positions', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ...mutation.body,
            client_order_id: mutation.clientOrderId,
          }),
        });

        const json = await res.json().catch(() => ({}));
        if (res.ok) {
          return { ok: true, status: res.status, data: json };
        }
        return { ok: false, status: res.status, error: json.error || `HTTP ${res.status}` };
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
        recordFailedMutationItem(mutation, failReason);
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
      const retryableItem: PortfolioMutation = {
        ...mutation,
        status: 'RETRYABLE',
        lastError: response.error,
        nextRetryAt: Date.now() + computeNextBackoffMs(0),
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
   * Retries a specific failed or queued action using its existing clientOrderId
   */
  const retryAction = useCallback(
    async (clientOrderId: string): Promise<void> => {
      const failed = getFailedMutationList();
      const target = failed.find((m) => m.clientOrderId === clientOrderId);
      if (!target) return;

      setStatus('PENDING');
      setActiveAction(target);

      const response = await sendRequestToServer(target);

      if (response.ok) {
        removeFailedMutationItem(clientOrderId);
        rollbackRegistry.current.delete(clientOrderId);
        syncStateFromStorage();
        setStatus('IDLE');
        setActiveAction(null);
        if (onReconciliationSuccess) {
          onReconciliationSuccess(response.data);
        }
      } else if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        recordFailedMutationItem(target, response.error || 'Server rejected retry');
        syncStateFromStorage();
        setStatus('FAILED');
        setActiveAction(null);
      } else {
        const nextCount = (target.retryCount || 0) + 1;
        recordFailedMutationItem(target, `${response.error || 'Connection error'} (Retry ${nextCount})`);
        syncStateFromStorage();
        setStatus('RETRYABLE');
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
      removeFailedMutationItem(clientOrderId);
      removeOfflineMutationItem(clientOrderId);

      const rollback = rollbackRegistry.current.get(clientOrderId);
      if (rollback) {
        try {
          rollback();
        } catch (err) {
          console.warn('[usePortfolioMutation] Rollback exception:', err);
        }
        rollbackRegistry.current.delete(clientOrderId);
      }

      syncStateFromStorage();
      if (activeAction?.clientOrderId === clientOrderId) {
        setActiveAction(null);
        setStatus('IDLE');
      }
    },
    [activeAction, syncStateFromStorage]
  );

  /**
   * Discards all failed actions in one operation
   */
  const discardAllFailedActions = useCallback(async (): Promise<void> => {
    const failed = getFailedMutationList();
    for (const item of failed) {
      const rollback = rollbackRegistry.current.get(item.clientOrderId);
      if (rollback) {
        try {
          rollback();
        } catch {}
        rollbackRegistry.current.delete(item.clientOrderId);
      }
    }
    saveFailedMutationList([]);
    syncStateFromStorage();
    setStatus('IDLE');
  }, [syncStateFromStorage]);

  /**
   * Drains the offline/retryable queue in strict FIFO order with idempotency protection
   */
  const drainQueue = useCallback(async (): Promise<void> => {
    const queue = getOfflineMutationQueue();
    if (queue.length === 0) return;

    setStatus('PENDING');
    const remaining: PortfolioMutation[] = [];

    for (const item of queue) {
      const response = await sendRequestToServer(item);
      if (response.ok) {
        rollbackRegistry.current.delete(item.clientOrderId);
        continue;
      }

      // If deterministic 4xx error on drain, move to failed list
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        recordFailedMutationItem(item, response.error || 'Validation error during sync drain');
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
        remaining.push({
          ...item,
          retryCount: currentRetries,
          status: 'RETRYABLE',
          lastError: response.error,
          nextRetryAt: Date.now() + computeNextBackoffMs(currentRetries),
        });
      }
    }

    saveOfflineMutationQueue(remaining);
    syncStateFromStorage();
    setStatus('IDLE');
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
