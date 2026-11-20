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

const inProcessQueues = new Map<string, Promise<unknown>>();

async function runInProcessLock<R>(name: string, fn: () => Promise<R>): Promise<R> {
  const previous = inProcessQueues.get(name) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(() => fn());
  inProcessQueues.set(
    name,
    next.catch(() => undefined)
  );
  return next;
}

/**
 * Serializes auth storage/refresh operations across open browser tabs using the
 * Navigator LockManager API when available, with orphan-lock recovery and a
 * safe in-process mutex fallback for restricted WebViews or iframes.
 */
async function safeCrossTabAuthLock<R>(
  name: string,
  acquireTimeout: number,
  fn: () => Promise<R>
): Promise<R> {
  const lockManager =
    typeof navigator !== 'undefined' && navigator?.locks && typeof navigator.locks.request === 'function'
      ? navigator.locks
      : null;

  if (!lockManager) {
    return runInProcessLock(name, fn);
  }

  const effectiveTimeout = acquireTimeout > 0 ? acquireTimeout : 8000;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  if (controller) {
    timer = setTimeout(() => {
      try {
        controller.abort();
      } catch {
        // Ignore abort failures
      }
    }, effectiveTimeout);
  }

  try {
    return await lockManager.request(
      name,
      controller ? { mode: 'exclusive', signal: controller.signal } : { mode: 'exclusive' },
      async (lock) => {
        if (timer) clearTimeout(timer);
        if (!lock) {
          return runInProcessLock(name, fn);
        }
        return await fn();
      }
    );
  } catch (err: any) {
    if (timer) clearTimeout(timer);

    // Our own timeout fired (an orphaned background tab held the lock): steal cleanly once
    if (err?.name === 'AbortError' && controller?.signal.aborted) {
      try {
        return await lockManager.request(
          name,
          { mode: 'exclusive', steal: true },
          async () => await fn()
        );
      } catch {
        return runInProcessLock(name, fn);
      }
    }

    // SecurityError / unsupported LockManager inside sandboxed iframes or WebViews
    return runInProcessLock(name, fn);
  }
}

const globalScope = globalThis as typeof globalThis & {
  __absuSupabaseClient?: SupabaseClient;
};

// Single shared Supabase client instance with session persistence, cross-tab lock & automatic token refresh
export const supabase: SupabaseClient =
  globalScope.__absuSupabaseClient ??
  (globalScope.__absuSupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: getSafeStorage() as any,
      lock: safeCrossTabAuthLock,
    },
  }));
