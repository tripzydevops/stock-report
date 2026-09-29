import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://erzxltcalghadzfevfjx.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyenhsdGNhbGdoYWR6ZmV2Zmp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwODQxMzEsImV4cCI6MjEwNTY2MDEzMX0.dEQ91ShlS9PBWUwF9U6hDuTqZBwlF3_nZNsjqfIifrI';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface LiveAsset {
  id: string;
  symbol: string;
  name: string;
  market: 'US' | 'BIST' | 'TEFAS';
  price: number;
  changePercent: number;
  rsi: number;
  emaStatus: string;
  volumeRatio: number;
  high52w?: number;
  low52w?: number;
}

export interface LiveSignal {
  symbol: string;
  name: string;
  strategy: string;
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  confidence: number;
  rationale: string;
  market: string;
  date: string;
  currency: string;
  riskReward?: number;
}

export interface ScannedTradeSignal {
  id: string;
  symbol: string;
  name: string;
  market: 'BIST' | 'US' | string;
  strategy: string;
  signalDate: string;
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  riskReward: number;
  confidence: number;
  status: 'open' | 'target_hit' | 'stopped_out' | 'expired' | 'invalidated';
  outcomePnlPct?: number | null;
  closedAt?: string | null;
  aiRationale: string;
  currency: 'TRY' | 'USD';
}

export interface PortfolioItem {
  symbol: string;
  name: string;
  market: string;
  shares: number;
  entryPrice: number;
  currentPrice: number;
  currency: string;
  totalCost: number;
  currentValue: number;
  pnlAmount: number;
  pnlPercent: number;
  stopLoss: number;
  targetPrice?: number;
  distanceToStop: number;
  isDividend: boolean;
  dcaZone: 'BUY' | 'PAUSE' | 'HOLD';
  dcaRationale: string;
  entryDate?: string;
  strategyType?: string;
}

export interface DividendAsset {
  symbol: string;
  name: string;
  shares: number;
  currentPrice: number;
  entryPrice: number;
  currency: string;
  dividendYield: number;
  yieldOnCost: number;
  annualPayout: number;
  monthlyPayout: number;
  payoutRatio: number;
  safetyRating: 'A' | 'B' | 'C';
  frequency: string;
  nextExDate?: string;
  nextPaymentDate?: string;
  estimatedNextDPS?: number;
  estimatedNextPayout?: number;
  payoutMonth?: string;
  paymentStatus?: 'Estimated' | 'Confirmed';
}

export interface StrategyStat {
  strategy: string;
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  avgGain: number;
  avgLoss: number;
  expectancy: number;
}

export interface OpeningDirectionItem {
  symbol: string;
  market: string;
  gapPercent: number;
  gapType: 'Gap Up & Go' | 'Gap & Fade' | 'Flat Open' | 'Gap Down';
  orbStatus: 'Broke High' | 'Broke Low' | 'Inside Range';
  bias: 'Strong Bullish' | 'Bullish' | 'Neutral' | 'Bearish';
  volumeSpike: boolean;
}

export interface RealizedTrade {
  id: string;
  symbol: string;
  name: string;
  market: string;
  currency: string;
  sharesSold: number;
  entryPrice: number;
  exitPrice: number;
  realizedPnl: number;
  realizedPnlPercent: number;
  closeDate: string;
}

export interface ExecutedOrder {
  id: string;
  ref: string;
  symbol: string;
  name: string;
  market: string;
  side: 'BUY' | 'SELL';
  orderType: string;
  quantity: number;
  price: number;
  totalValue: number;
  currency: string;
  dateTime: string;
  status: 'Filled';
  dcaNote?: string;
}

export interface CapitalTransfer {
  id: string;
  transferType: 'DEPOSIT' | 'WITHDRAWAL';
  amount: number;
  currency: string;
  transferDate: string;
  notes?: string;
}

