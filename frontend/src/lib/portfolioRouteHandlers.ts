import { NextRequest } from 'next/server';
import { SupabaseClient } from '@supabase/supabase-js';

export interface RouteHandlerOptions {
  authSupabase?: SupabaseClient;
}

// @ts-ignore
export { handlePortfolioTransfer, handleDeletePosition } from './portfolioRouteHandlers.mjs';
