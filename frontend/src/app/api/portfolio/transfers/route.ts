import { NextRequest } from 'next/server';
import { handlePortfolioTransfer } from '@/lib/portfolioRouteHandlers';

export const dynamic = 'force-dynamic';

/**
 * Server-side validated cash transfers (deposit/withdraw) endpoint with idempotency support.
 */
export async function POST(request: NextRequest) {
  return handlePortfolioTransfer(request);
}
