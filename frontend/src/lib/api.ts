const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface AssetCreate {
  symbol: string;
  name: string;
  asset_class: string;
  market: string;
}

export interface RiskCalc {
  account_size: number;
  risk_percentage: number;
  entry_price: number;
  stop_loss: number;
}

async function fetchWithHandle(endpoint: string, options?: RequestInit) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function fetchAssets(filters?: { market?: string; asset_class?: string }) {
  const query = new URLSearchParams(filters as any).toString();
  return fetchWithHandle(`/api/assets${query ? `?${query}` : ''}`);
}

export async function addAsset(data: AssetCreate) {
  return fetchWithHandle('/api/assets', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function fetchLatestPrices() {
  return fetchWithHandle('/api/prices/latest');
}

export async function fetchPriceHistory(assetId: string, days?: number) {
  const query = days ? `?days=${days}` : '';
  return fetchWithHandle(`/api/prices/${assetId}/history${query}`);
}

export async function runScan() {
  return fetchWithHandle('/api/scan/run', { method: 'POST' });
}

export async function fetchScanResults(filters?: { market?: string; strategy?: string }) {
  const query = new URLSearchParams(filters as any).toString();
  return fetchWithHandle(`/api/scan/results${query ? `?${query}` : ''}`);
}

export async function fetchMarketRegime() {
  return fetchWithHandle('/api/market/regime');
}

export async function fetchWatchlist() {
  return fetchWithHandle('/api/watchlist');
}

export async function addToWatchlist(assetId: string) {
  return fetchWithHandle('/api/watchlist', {
    method: 'POST',
    body: JSON.stringify({ asset_id: assetId }),
  });
}

export async function removeFromWatchlist(id: string) {
  return fetchWithHandle(`/api/watchlist/${id}`, { method: 'DELETE' });
}

export async function fetchPortfolio() {
  return fetchWithHandle('/api/portfolio');
}

export async function calculatePositionSize(data: RiskCalc) {
  return fetchWithHandle('/api/risk/calculate', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
