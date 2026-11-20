import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_PROJECT_URL = 'https://aqzolewmhpmrcvkrvchn.supabase.co';
const DEFAULT_PUBLISHABLE_KEY = 'sb_publishable_baaiGcHIsSAThnBLScTG6g_9M_stHmk';

const envUrl = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env.VITE_SUPABASE_URL : undefined;
const envKey =
  (typeof import.meta !== 'undefined' && import.meta.env)
    ? (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY)
    : undefined;

export const supabaseUrl: string =
  typeof envUrl === 'string' && envUrl.trim().length > 0
    ? envUrl.trim()
    : SUPABASE_PROJECT_URL;

const rawKey = typeof envKey === 'string' && envKey.trim().length > 0
  ? envKey.trim()
  : DEFAULT_PUBLISHABLE_KEY;

// Valid Supabase anon or publishable key
export const isConfiguredKey =
  rawKey.length > 0 &&
  !rawKey.includes('YOUR_EXISTING_') &&
  !rawKey.includes('MY_') &&
  rawKey !== 'placeholder-anon-key';

export const supabaseAnonKey: string = isConfiguredKey
  ? rawKey
  : DEFAULT_PUBLISHABLE_KEY;

export function isSupabaseConfigured(): boolean {
  return isConfiguredKey;
}

export function getSupabaseConfigError(): string | null {
  if (!isConfiguredKey) {
    return 'VITE_SUPABASE_PUBLISHABLE_KEY is not configured. Please provide your Supabase publishable key in environment variables.';
  }
  return null;
}

import { getSafeStorage } from '../utils/safeStorage.ts';

// Single shared Supabase client instance with session persistence & automatic token refresh
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: getSafeStorage() as any,
  },
});
