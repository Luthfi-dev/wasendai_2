// Provides apiFetch() and safely attempts to wrap window.fetch so same-origin /api
// requests automatically send cookies and attach the double-submit X-CSRF-Token header.

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function readCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const pairs = document.cookie ? document.cookie.split(';') : [];
  for (const part of pairs) {
    const eqIdx = part.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = part.slice(0, eqIdx).trim();
    if (key === name) {
      const raw = part.slice(eqIdx + 1).trim();
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return '';
}

function isSameOriginUrl(input: RequestInfo | URL): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const rawUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.href
        : input.url;
    if (!rawUrl || rawUrl.startsWith('/')) return true;
    const parsed = new URL(rawUrl, window.location.origin);
    return parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}

const nativeFetch: typeof fetch =
  typeof window !== 'undefined' && typeof window.fetch === 'function'
    ? window.fetch.bind(window)
    : fetch;

export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!isSameOriginUrl(input)) {
    return nativeFetch(input, init);
  }

  const method = (
    init?.method ||
    (input instanceof Request ? input.method : 'GET') ||
    'GET'
  ).toUpperCase();

  const nextInit: RequestInit = {
    ...init,
    credentials: init?.credentials || 'same-origin'
  };

  if (MUTATING_METHODS.has(method)) {
    const csrfToken = readCookie('japriin_csrf');
    if (csrfToken) {
      const headers = new Headers(
        init?.headers || (input instanceof Request ? input.headers : undefined)
      );
      if (!headers.has('X-CSRF-Token')) {
        headers.set('X-CSRF-Token', csrfToken);
      }
      nextInit.headers = headers;
    }
  }

  return nativeFetch(input, nextInit);
}

// Best-effort global patch only when window.fetch is configurable (never throws on getter-only Window.fetch)
if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
  const patchedKey = '__japriinCsrfFetchPatched__';
  if (!(window as any)[patchedKey]) {
    try {
      const ownDesc = Object.getOwnPropertyDescriptor(window, 'fetch');
      const protoDesc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window), 'fetch');
      const canRedefine =
        (!ownDesc && (!protoDesc || protoDesc.configurable !== false)) ||
        Boolean(ownDesc && (ownDesc.writable || ownDesc.configurable));

      if (canRedefine) {
        Object.defineProperty(window, 'fetch', {
          value: apiFetch,
          configurable: true,
          writable: true
        });
        (window as any)[patchedKey] = true;
      }
    } catch {
      // Ignore environments where window.fetch is read-only / getter-only;
      // components import and use apiFetch directly.
    }
  }
}
