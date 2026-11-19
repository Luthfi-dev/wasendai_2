import React, { ComponentType, lazy } from 'react';

const RELOAD_STORAGE_KEY = 'japriin_chunk_reload_at';
const RELOAD_COOLDOWN_MS = 15_000;

function isChunkLoadFailure(err: unknown): boolean {
  const msg = String((err as any)?.message || err || '').toLowerCase();
  return (
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('loading chunk') ||
    msg.includes('chunkloaderror') ||
    msg.includes('failed to fetch')
  );
}

/**
 * Wraps React.lazy with automatic transient retries and a guarded single-shot
 * page reload when Vite / CDN module hashes change between edits or deploys.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
  retries = 2
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const mod = await importer();
        try {
          sessionStorage.removeItem(RELOAD_STORAGE_KEY);
        } catch {
          // Ignore storage restrictions
        }
        return mod;
      } catch (err) {
        lastError = err;
        if (!isChunkLoadFailure(err) || attempt >= retries) {
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 350 * (attempt + 1)));
      }
    }

    if (typeof window !== 'undefined' && isChunkLoadFailure(lastError)) {
      try {
        const now = Date.now();
        const prevReloadAt = Number(sessionStorage.getItem(RELOAD_STORAGE_KEY) || '0');
        if (!Number.isFinite(prevReloadAt) || now - prevReloadAt > RELOAD_COOLDOWN_MS) {
          sessionStorage.setItem(RELOAD_STORAGE_KEY, String(now));
          window.location.reload();
          // Keep Suspense fallback mounted while the browser reloads
          return new Promise<{ default: T }>(() => {});
        }
      } catch {
        // Fall through to ErrorBoundary
      }
    }

    throw lastError;
  });
}
