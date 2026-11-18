/**
 * Layer 1: User Signal Collection Module (Tripzy.travel Architecture)
 * 
 * Collects both explicit and implicit user interaction signals (views, dwell time,
 * searches, trade actions, archetype selections).
 * Buffers signals locally before batch-flushing asynchronously to the backend,
 * ensuring zero UI thread blocking or latency spikes.
 */

export interface UserSignalEvent {
  id?: string;
  eventType: 
    | 'page_view' 
    | 'asset_view' 
    | 'tab_switch' 
    | 'archetype_selected' 
    | 'onboarding_completed' 
    | 'trade_click' 
    | 'search_query' 
    | 'time_spent';
  symbol?: string;
  archetype?: string;
  payload?: Record<string, any>;
  timestamp: string;
}

const BUFFER_KEY = 'mp_signal_buffer_v1';
const SESSION_KEY = 'mp_session_id';
const FLUSH_INTERVAL_MS = 6000;
const MAX_BUFFER_SIZE = 10;

class UserSignalBuffer {
  private queue: UserSignalEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private isFlushing = false;
  private sessionId = '';

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        this.sessionId = this.getOrCreateSessionId();
        this.loadPersistedBuffer();
        this.startFlushTimer();
        this.setupUnloadHandler();
      } catch (e) {
        this.sessionId = `ses_mem_${Date.now()}`;
      }
    }
  }

  private getOrCreateSessionId(): string {
    if (typeof window === 'undefined') return 'server';
    try {
      let sid = sessionStorage.getItem(SESSION_KEY);
      if (!sid) {
        sid = `ses_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        sessionStorage.setItem(SESSION_KEY, sid);
      }
      return sid;
    } catch {
      return `ses_mem_${Date.now()}`;
    }
  }

  private loadPersistedBuffer() {
    try {
      if (typeof window === 'undefined') return;
      const saved = sessionStorage.getItem(BUFFER_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          this.queue = parsed;
        }
      }
    } catch {}
  }

  private persistBuffer() {
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(BUFFER_KEY, JSON.stringify(this.queue.slice(-50)));
      }
    } catch {}
  }

  private startFlushTimer() {
    try {
      if (this.flushTimer) clearInterval(this.flushTimer);
      this.flushTimer = setInterval(() => {
        if (this.queue.length > 0) {
          this.flush();
        }
      }, FLUSH_INTERVAL_MS);
    } catch {}
  }

  private setupUnloadHandler() {
    if (typeof window === 'undefined') return;
    try {
      window.addEventListener('visibilitychange', () => {
        try {
          if (document.visibilityState === 'hidden' && this.queue.length > 0) {
            this.flush(true);
          }
        } catch {}
      });
      window.addEventListener('beforeunload', () => {
        try {
          if (this.queue.length > 0) {
            this.flush(true);
          }
        } catch {}
      });
    } catch {}
  }

  public recordSignal(event: Omit<UserSignalEvent, 'timestamp'>) {
    const fullEvent: UserSignalEvent = {
      ...event,
      timestamp: new Date().toISOString()
    };

    this.queue.push(fullEvent);
    this.persistBuffer();

    if (this.queue.length >= MAX_BUFFER_SIZE) {
      this.flush();
    }
  }

  public recordAssetView(symbol: string, durationSec?: number, tab?: string) {
    this.recordSignal({
      eventType: 'asset_view',
      symbol: symbol.toUpperCase(),
      payload: {
        durationSec: durationSec || 0,
        tab: tab || 'overview'
      }
    });
  }

  public recordArchetypeSelection(archetype: string, profileDetails?: Record<string, any>) {
    this.recordSignal({
      eventType: 'archetype_selected',
      archetype,
      payload: {
        profileDetails: profileDetails || {},
        isColdStart: true
      }
    });
  }

  public recordTradeInteraction(symbol: string, action: string, signalId?: string) {
    this.recordSignal({
      eventType: 'trade_click',
      symbol: symbol.toUpperCase(),
      payload: {
        action,
        signalId
      }
    });
  }

  public async flush(isUnloading = false): Promise<void> {
    if (this.isFlushing || this.queue.length === 0) return;
    this.isFlushing = true;

    const batch = [...this.queue];
    this.queue = [];
    this.persistBuffer();

    const payload = {
      sessionId: this.sessionId,
      events: batch
    };

    try {
      if (isUnloading && typeof navigator !== 'undefined' && navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        navigator.sendBeacon('/api/signals/interactions', blob);
      } else {
        await fetch('/api/signals/interactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true
        });
      }
    } catch (err) {
      // Re-queue failed batch on failure (up to 30 max items to prevent memory bloat)
      this.queue = [...batch.slice(-15), ...this.queue].slice(0, 30);
      this.persistBuffer();
    } finally {
      this.isFlushing = false;
    }
  }
}

// Global Singleton Instance
export const userSignalBuffer = new UserSignalBuffer();
