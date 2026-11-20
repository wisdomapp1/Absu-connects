/**
 * Safe Storage Adapter for ABSU Connect
 *
 * Provides safe access to localStorage with seamless in-memory fallback.
 * Prevents fatal SecurityErrors and DOMExceptions when running inside
 * sandboxed iframes, cross-origin embedded previews, or browsers with
 * third-party storage restrictions enabled.
 */

interface SafeStorageApi {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
  key: (index: number) => string | null;
  readonly length: number;
}

// In-memory fallback map for restricted environments
const memoryStore: Record<string, string> = {};

const memoryStorageAdapter: SafeStorageApi = {
  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null;
  },
  setItem(key: string, value: string): void {
    memoryStore[key] = String(value);
  },
  removeItem(key: string): void {
    delete memoryStore[key];
  },
  clear(): void {
    Object.keys(memoryStore).forEach((k) => delete memoryStore[k]);
  },
  key(index: number): string | null {
    const keys = Object.keys(memoryStore);
    return keys[index] || null;
  },
  get length(): number {
    return Object.keys(memoryStore).length;
  },
};

function wrapWebStorage(storage: Storage): SafeStorageApi {
  return {
    getItem(key: string): string | null {
      try {
        const val = storage.getItem(key);
        if (val !== null) {
          return val;
        }
        return memoryStorageAdapter.getItem(key);
      } catch {
        return memoryStorageAdapter.getItem(key);
      }
    },
    setItem(key: string, value: string): void {
      memoryStorageAdapter.setItem(key, value);
      try {
        storage.setItem(key, value);
      } catch {
        // Already preserved in memoryStorageAdapter
      }
    },
    removeItem(key: string): void {
      memoryStorageAdapter.removeItem(key);
      try {
        storage.removeItem(key);
      } catch {
        // Removed from memoryStorageAdapter
      }
    },
    clear(): void {
      memoryStorageAdapter.clear();
      try {
        storage.clear();
      } catch {
        // Cleared from memoryStorageAdapter
      }
    },
    key(index: number): string | null {
      try {
        return storage.key(index);
      } catch {
        return memoryStorageAdapter.key(index);
      }
    },
    get length(): number {
      try {
        return storage.length;
      } catch {
        return memoryStorageAdapter.length;
      }
    },
  };
}

function probeWebStorage(storage: Storage | undefined): boolean {
  if (!storage) return false;
  try {
    const testKey = '__absu_probe__';
    storage.setItem(testKey, '1');
    const readVal = storage.getItem(testKey);
    storage.removeItem(testKey);
    return readVal === '1';
  } catch {
    return false;
  }
}

let resolvedStorage: SafeStorageApi | null = null;

export function getSafeStorage(): SafeStorageApi {
  if (resolvedStorage) {
    return resolvedStorage;
  }

  if (typeof window !== 'undefined') {
    try {
      if ('localStorage' in window && probeWebStorage(window.localStorage)) {
        resolvedStorage = wrapWebStorage(window.localStorage);
        return resolvedStorage;
      }
    } catch {
      // Restricted localStorage
    }

    try {
      if ('sessionStorage' in window && probeWebStorage(window.sessionStorage)) {
        resolvedStorage = wrapWebStorage(window.sessionStorage);
        return resolvedStorage;
      }
    } catch {
      // Restricted sessionStorage
    }
  }

  resolvedStorage = memoryStorageAdapter;
  return resolvedStorage;
}

export const safeStorage = getSafeStorage();

/**
 * Safely push or replace browser history state without throwing SecurityError in iframes
 */
export function safePushState(data: any, unused: string, url?: string | URL | null): void {
  try {
    if (typeof window !== 'undefined' && window.history && window.history.pushState) {
      window.history.pushState(data, unused, url);
    }
  } catch {
    // Graceful no-op in restricted iframes
  }
}

export function safeReplaceState(data: any, unused: string, url?: string | URL | null): void {
  try {
    if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
      window.history.replaceState(data, unused, url);
    }
  } catch {
    // Graceful no-op in restricted iframes
  }
}
