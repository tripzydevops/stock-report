/**
 * Types and storage models for the unified Portfolio Mutation state machine.
 */

export type PortfolioActionStatus =
  | 'IDLE'
  | 'PENDING'
  | 'OFFLINE'
  | 'RETRYABLE'
  | 'FAILED';

export type PortfolioMutationType = 'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAW' | 'DELETE_POSITION';

export interface PortfolioMutationPayload {
  symbol?: string;
  shares?: number;
  quantity?: number;
  price?: number;
  entryPrice?: number;
  side?: 'BUY' | 'SELL';
  market?: string;
  name?: string;
  currency?: string;
  notes?: string;
  orderType?: string;
  status?: string;
  amount?: number;
  assetId?: string;
  positionId?: string;
  client_order_id?: string;
  [key: string]: unknown;
}

export interface PortfolioMutation {
  id: string;
  clientOrderId: string;
  type: PortfolioMutationType;
  body: PortfolioMutationPayload;
  createdAt: string;
  retryCount?: number;
  lastError?: string;
  nextRetryAt?: number;
  status?: 'PENDING' | 'RETRYING' | 'FAILED' | 'RETRYABLE';
  rollbackApplied?: boolean;
}

export interface PortfolioMutationRequest {
  type: PortfolioMutationType;
  body: PortfolioMutationPayload;
  clientOrderId?: string;
  optimisticRollback?: () => void;
  rollbackOnDeterministicFailure?: boolean;
}

export interface PortfolioMutationResult {
  success: boolean;
  status: PortfolioActionStatus;
  clientOrderId: string;
  error?: string;
  data?: unknown;
}

export const PORTFOLIO_MUTATIONS_STORAGE_KEY = 'portfolio.mutations.v1';
export const PORTFOLIO_FAILED_STORAGE_KEY = 'portfolio.mutations.failed.v1';

// Legacy keys for seamless migration without dual-store hazards
export const LEGACY_OFFLINE_QUEUE_KEY = 'marketpulse_offline_mutation_queue';
export const LEGACY_FAILED_MUTATIONS_KEY = 'marketpulse_failed_mutations';

export const MAX_MUTATION_QUEUE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const MAX_MUTATION_QUEUE_SIZE = 50;
export const MAX_MUTATION_RETRIES = 4;
export const RETRY_BACKOFF_DELAYS_MS = [60_000, 300_000, 900_000, 3_600_000]; // 1m, 5m, 15m, 1h
