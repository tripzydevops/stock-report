export interface RegimeStatus {
  status: 'Bullish' | 'Neutral' | 'Bearish';
  close: number;
  trend: 'up' | 'down' | 'flat';
  changePct?: number;
  return5d?: number;
  descriptionTr?: string;
  descriptionEn?: string;
  isCorrection?: boolean;
  recommendedEquityPct?: number;
  recommendedCashPct?: number;
  strategyTiltTr?: string;
  strategyTiltEn?: string;
}
