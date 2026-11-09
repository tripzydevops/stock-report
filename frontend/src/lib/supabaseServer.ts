import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://erzxltcalghadzfevfjx.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyenhsdGNhbGdoYWR6ZmV2Zmp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwODQxMzEsImV4cCI6MjEwNTY2MDEzMX0.dEQ91ShlS9PBWUwF9U6hDuTqZBwlF3_nZNsjqfIifrI';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Singleton cached server instances
let serverClient: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;

/**
 * Standard server-side Supabase client.
 * Uses public anon key and is subject to PostgreSQL Row Level Security (RLS).
 */
export function getServerSupabase(): SupabaseClient {
  if (!serverClient) {
    serverClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return serverClient;
}

/**
 * Request-scoped authenticated Supabase client.
 * Extracts the user's JWT access token from the incoming request Authorization header
 * or Supabase auth session cookie, attaching it to request headers so PostgreSQL RLS
 * policies can evaluate `auth.uid() = user_id`.
 */
export function getAuthenticatedSupabase(request: Request): SupabaseClient {
  const authHeader = request.headers.get('authorization') || '';
  let token: string | null = null;
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }

  // Also check standard Supabase auth cookie headers if present
  if (!token) {
    const cookieHeader = request.headers.get('cookie') || '';
    const match = cookieHeader.match(/sb-[a-zA-Z0-9_-]+-auth-token=([^;]+)/);
    if (match) {
      try {
        const decoded = decodeURIComponent(match[1]);
        const parsed = JSON.parse(decoded);
        if (Array.isArray(parsed) && parsed[0]) {
          token = parsed[0];
        } else if (parsed?.access_token) {
          token = parsed.access_token;
        }
      } catch {
        // Invalid cookie encoding
      }
    }
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  });
}

/**
 * Privileged administrative Supabase client.
 * Uses SUPABASE_SERVICE_ROLE_KEY to bypass RLS for administrative operations
 * (e.g., generating signed storage download URLs, internal sync routines).
 * If service role key is absent, safely falls back to standard server client.
 */
export function getAdminSupabase(): SupabaseClient {
  if (!adminClient) {
    const key = serviceRoleKey || supabaseAnonKey;
    if (!serviceRoleKey && process.env.NODE_ENV === 'production') {
      console.warn('⚠️ SUPABASE_SERVICE_ROLE_KEY is not set in production; falling back to anon key.');
    }
    adminClient = createClient(supabaseUrl, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return adminClient;
}

/**
 * Validates request authorization for internal / cron webhook endpoints.
 * Checks Authorization Bearer header or x-cron-secret against CRON_SECRET env var.
 */
export function verifyCronAuthorization(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  
  // If no CRON_SECRET is configured, allow in development but block in production
  if (!cronSecret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('CRON_SECRET environment variable is missing in production.');
      return false;
    }
    return true; // Allow local dev without secret
  }

  // Check Bearer token
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token === cronSecret) return true;
  }

  // Check custom header
  const customHeader = request.headers.get('x-cron-secret');
  if (customHeader && customHeader === cronSecret) return true;

  return false;
}
