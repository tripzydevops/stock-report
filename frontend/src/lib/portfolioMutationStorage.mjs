/**
 * Single source of truth for portfolio mutation constants & pure storage functions.
 * Compatible with pure Node (.mjs) execution without transpilation.
 */

export const PORTFOLIO_MUTATIONS_STORAGE_KEY = 'portfolio.mutations.v1';
export const PORTFOLIO_FAILED_STORAGE_KEY = 'portfolio.mutations.failed.v1';

// Legacy keys for seamless migration without dual-store hazards
export const LEGACY_OFFLINE_QUEUE_KEY = 'marketpulse_offline_mutation_queue';
export const LEGACY_FAILED_MUTATIONS_KEY = 'marketpulse_failed_mutations';

export const MAX_MUTATION_QUEUE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const MAX_MUTATION_QUEUE_SIZE = 50;
export const MAX_MUTATION_RETRIES = 4;
export const RETRY_BACKOFF_DELAYS_MS = [60_000, 300_000, 900_000, 3_600_000]; // 1m, 5m, 15m, 1h

export function getOfflineMutationQueue() {
  if (typeof window === 'undefined' && typeof localStorage === 'undefined') return [];
  try {
    let raw = localStorage.getItem(PORTFOLIO_MUTATIONS_STORAGE_KEY);
    if (!raw) {
      // Migrate from legacy key if present
      raw = localStorage.getItem(LEGACY_OFFLINE_QUEUE_KEY);
      if (raw) {
        localStorage.setItem(PORTFOLIO_MUTATIONS_STORAGE_KEY, raw);
        localStorage.removeItem(LEGACY_OFFLINE_QUEUE_KEY);
      }
    }
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    // Validate entry shape and filter expired items
    return parsed.filter((item) => {
      if (!item || typeof item !== 'object' || !item.clientOrderId || !item.type) {
        return false;
      }
      const createdTime = new Date(item.createdAt).getTime();
      return Number.isFinite(createdTime) && now - createdTime < MAX_MUTATION_QUEUE_AGE_MS;
    });
  } catch {
    return [];
  }
}

export function saveOfflineMutationQueue(queue) {
  if (typeof window === 'undefined' && typeof localStorage === 'undefined') return;
  try {
    if (!queue || queue.length === 0) {
      localStorage.removeItem(PORTFOLIO_MUTATIONS_STORAGE_KEY);
    } else {
      // Bounded capacity cap
      const bounded = queue.slice(-MAX_MUTATION_QUEUE_SIZE);
      localStorage.setItem(PORTFOLIO_MUTATIONS_STORAGE_KEY, JSON.stringify(bounded));
    }
  } catch {}
}

export function getFailedMutationList() {
  if (typeof window === 'undefined' && typeof localStorage === 'undefined') return [];
  try {
    let raw = localStorage.getItem(PORTFOLIO_FAILED_STORAGE_KEY);
    if (!raw) {
      raw = localStorage.getItem(LEGACY_FAILED_MUTATIONS_KEY);
      if (raw) {
        localStorage.setItem(PORTFOLIO_FAILED_STORAGE_KEY, raw);
        localStorage.removeItem(LEGACY_FAILED_MUTATIONS_KEY);
      }
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item === 'object' && item.clientOrderId && item.type);
  } catch {
    return [];
  }
}

export function saveFailedMutationList(list) {
  if (typeof window === 'undefined' && typeof localStorage === 'undefined') return;
  try {
    if (!list || list.length === 0) {
      localStorage.removeItem(PORTFOLIO_FAILED_STORAGE_KEY);
    } else {
      const bounded = list.slice(0, MAX_MUTATION_QUEUE_SIZE);
      localStorage.setItem(PORTFOLIO_FAILED_STORAGE_KEY, JSON.stringify(bounded));
    }
  } catch {}
}

export function recordFailedMutationItem(mutation, reason) {
  const current = getFailedMutationList();
  const existingIdx = current.findIndex((m) => m.clientOrderId === mutation.clientOrderId);
  const updatedItem = {
    ...mutation,
    status: 'FAILED',
    lastError: reason,
  };

  if (existingIdx >= 0) {
    current[existingIdx] = updatedItem;
    saveFailedMutationList(current);
  } else {
    saveFailedMutationList([updatedItem, ...current]);
  }
}

export function enqueueOfflineMutationItem(mutation) {
  const current = getOfflineMutationQueue();
  if (current.some((m) => m.clientOrderId === mutation.clientOrderId)) return;
  const itemWithRetry = {
    ...mutation,
    retryCount: mutation.retryCount || 0,
    status: mutation.status || 'PENDING',
  };
  saveOfflineMutationQueue([...current, itemWithRetry]);
}

export function removeOfflineMutationItem(clientOrderId) {
  const current = getOfflineMutationQueue();
  saveOfflineMutationQueue(current.filter((m) => m.clientOrderId !== clientOrderId));
}

export function removeFailedMutationItem(clientOrderId) {
  const current = getFailedMutationList();
  saveFailedMutationList(current.filter((m) => m.clientOrderId !== clientOrderId));
}

export function computeNextBackoffMs(retryCount) {
  const idx = Math.min(Math.max(0, retryCount), RETRY_BACKOFF_DELAYS_MS.length - 1);
  return RETRY_BACKOFF_DELAYS_MS[idx];
}

export function generateClientOrderId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `cl-ord-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
