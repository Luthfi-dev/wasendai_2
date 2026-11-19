import { DEFAULT_CONNECTION_CONFIG, jidDecode } from '@whiskeysockets/baileys';

const LIBSIGNAL_GUARD_SYMBOL = Symbol.for('japriin.libsignalConsoleGuardState');
const DEFAULT_RESET_COOLDOWN_MS = 15_000;
const DEFAULT_WARN_COOLDOWN_MS = 30_000;
const MAX_TRACKED_PEERS = 500;

interface LibsignalGuardState {
  installed: boolean;
  activeDecryptDepth: number;
  suppressedLogsCount: number;
  originalConsoleError: (...args: any[]) => void;
}

function getGuardState(): LibsignalGuardState {
  const g = globalThis as any;
  if (!g[LIBSIGNAL_GUARD_SYMBOL]) {
    g[LIBSIGNAL_GUARD_SYMBOL] = {
      installed: false,
      activeDecryptDepth: 0,
      suppressedLogsCount: 0,
      originalConsoleError: console.error.bind(console)
    } satisfies LibsignalGuardState;
  }
  return g[LIBSIGNAL_GUARD_SYMBOL];
}

export function isLibsignalNoiseMessage(args: any[]): boolean {
  if (!Array.isArray(args) || args.length === 0) return false;
  const first = typeof args[0] === 'string' ? args[0] : '';
  if (!first) return false;

  if (first === 'Failed to decrypt message with any known session...') {
    return true;
  }

  if (first.startsWith('Session error:')) {
    return true;
  }

  return false;
}

/**
 * Installs an idempotent guard around global `console.error` that ONLY intercepts
 * libsignal's raw `console.error("Failed to decrypt message...")` and
 * `console.error("Session error:Error: Bad MAC...")` spam while a guarded Signal
 * decrypt call is actively running. All other `console.error` calls pass untouched.
 */
export function installLibsignalConsoleGuard(): void {
  const state = getGuardState();
  if (state.installed) return;
  state.originalConsoleError = console.error.bind(console);
  console.error = (...args: any[]) => {
    if (state.activeDecryptDepth > 0 && isLibsignalNoiseMessage(args)) {
      state.suppressedLogsCount += 1;
      return;
    }
    state.originalConsoleError(...args);
  };
  state.installed = true;
}

export function getLibsignalGuardStats(): { installed: boolean; activeDecryptDepth: number; suppressedLogsCount: number } {
  const state = getGuardState();
  return {
    installed: state.installed,
    activeDecryptDepth: state.activeDecryptDepth,
    suppressedLogsCount: state.suppressedLogsCount
  };
}

export async function withSignalDecryptScope<T>(fn: () => Promise<T>): Promise<T> {
  installLibsignalConsoleGuard();
  const state = getGuardState();
  state.activeDecryptDepth += 1;
  try {
    return await fn();
  } finally {
    state.activeDecryptDepth = Math.max(0, state.activeDecryptDepth - 1);
  }
}

export function getSignalErrorMessage(err: unknown): string {
  if (!err) return '';
  if (typeof err === 'string') return err;
  if (typeof (err as any)?.message === 'string') return (err as any).message;
  try {
    return String(err);
  } catch {
    return '';
  }
}

export function isRecoverableSignalMacError(err: unknown): boolean {
  const msg = getSignalErrorMessage(err);
  if (!msg) return false;
  return /Bad MAC|No matching sessions found|No matching sessions|No session record|No sessions available|MessageCounterError|Key used already or never filled|Chain closed|Invalid PreKey ID|Over 2000 messages/i.test(
    msg
  );
}

/**
 * Returns true when an error indicates the stored Signal ratchet state itself
 * is desynchronized/corrupted and deleting it will allow clean retry/prekey
 * re-establishment. Duplicate replay (`MessageCounterError` / `Key used already`)
 * returns false so a healthy active session is not needlessly torn down.
 */
export function shouldResetCorruptedSignalSession(err: unknown): boolean {
  const msg = getSignalErrorMessage(err);
  if (!msg) return false;
  if (/MessageCounterError|Key used already or never filled|No session record|No sessions available/i.test(msg)) {
    return false;
  }
  return /Bad MAC|No matching sessions found|No matching sessions|Chain closed|Invalid PreKey ID|Over 2000 messages/i.test(
    msg
  );
}

function setBoundedMap<K, V>(map: Map<K, V>, key: K, value: V, maxSize = MAX_TRACKED_PEERS): void {
  if (map.has(key)) {
    map.delete(key);
  } else if (map.size >= maxSize) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) {
      map.delete(oldest);
    }
  }
  map.set(key, value);
}

function normalizePeerRecoveryKey(repo: any, jid: string): string {
  try {
    if (typeof repo?.jidToSignalProtocolAddress === 'function') {
      return String(repo.jidToSignalProtocolAddress(jid));
    }
  } catch {
    // Fallback to raw trimmed JID
  }
  return String(jid || '').trim();
}

/**
 * Expands PN <-> LID session aliases using purely local `authKeys.get('lid-mapping', ...)`
 * so deleting a corrupted session removes the actual stored `wireJid` entry (zero USync network wait).
 */
export async function expandSignalAliasJids(authKeys: any, jids: string[]): Promise<string[]> {
  const uniqueInput = Array.from(new Set((jids || []).map(j => String(j || '').trim()).filter(Boolean)));
  if (uniqueInput.length === 0) return [];

  const expanded = new Set<string>(uniqueInput);
  if (!authKeys || typeof authKeys.get !== 'function') {
    return Array.from(expanded);
  }

  const pnLookupUsers = new Set<string>();
  const lidLookupKeys = new Set<string>();
  const parsedList: Array<{ raw: string; user: string; device: number; server: string }> = [];

  for (const jid of uniqueInput) {
    try {
      const dec = jidDecode(jid);
      if (!dec?.user) continue;
      const device = dec.device || 0;
      const server = dec.server || '';
      parsedList.push({ raw: jid, user: dec.user, device, server });
      if (server === 's.whatsapp.net' || server === 'hosted') {
        pnLookupUsers.add(dec.user);
      } else if (server === 'lid' || server === 'hosted.lid') {
        lidLookupKeys.add(`${dec.user}_reverse`);
      }
    } catch {
      // Ignore unparseable JID
    }
  }

  const lookupKeys = [...pnLookupUsers, ...lidLookupKeys];
  if (lookupKeys.length === 0) {
    return Array.from(expanded);
  }

  let mappingData: Record<string, any> = {};
  try {
    mappingData = (await authKeys.get('lid-mapping', lookupKeys)) || {};
  } catch {
    return Array.from(expanded);
  }

  for (const item of parsedList) {
    const devSuffix = item.device ? `:${item.device}` : '';
    if (item.server === 's.whatsapp.net' || item.server === 'hosted') {
      const lidUser = mappingData[item.user];
      if (typeof lidUser === 'string' && lidUser.trim()) {
        const lidServer = item.server === 'hosted' ? 'hosted.lid' : 'lid';
        expanded.add(`${lidUser.trim()}${devSuffix}@${lidServer}`);
      }
    } else if (item.server === 'lid' || item.server === 'hosted.lid') {
      const pnUser = mappingData[`${item.user}_reverse`];
      if (typeof pnUser === 'string' && pnUser.trim()) {
        const pnServer = item.server === 'hosted.lid' ? 'hosted' : 's.whatsapp.net';
        expanded.add(`${pnUser.trim()}${devSuffix}@${pnServer}`);
      }
    }
  }

  return Array.from(expanded);
}

export interface SignalRecoveryHookInfo {
  jid: string;
  type: string;
  error: string;
  sessionReset: boolean;
}

export interface SignalRepositoryRecoveryOptions {
  resetCooldownMs?: number;
  warnCooldownMs?: number;
  onRecovery?: (info: SignalRecoveryHookInfo) => void;
  warnLogger?: (message: string) => void;
}

/**
 * Wraps a Baileys SignalRepository so that:
 * 1. `decryptMessage` and `decryptGroupMessage` run under the scoped libsignal console guard
 *    (preventing raw `Failed to decrypt message...` / `Session error:Error: Bad MAC` stderr spam).
 * 2. When `Bad MAC` / `No matching sessions` indicates a desynced ratchet, the corrupted session
 *    (across both PN & mapped LID aliases) is cleanly reset on a per-peer cooldown, allowing
 *    Baileys `sendRetryRequest` + prekey negotiation to self-heal automatically.
 * 3. Original errors are always rethrown cleanly so Baileys' own retry receipt protocol executes.
 */
export function wrapSignalRepositoryWithRecovery<T extends Record<string, any>>(
  baseRepo: T,
  authKeys?: any,
  options?: SignalRepositoryRecoveryOptions
): T {
  if (!baseRepo || (baseRepo as any).__signalRecoveryWrapped) {
    return baseRepo;
  }

  installLibsignalConsoleGuard();

  const resetCooldownMs = options?.resetCooldownMs ?? DEFAULT_RESET_COOLDOWN_MS;
  const warnCooldownMs = options?.warnCooldownMs ?? DEFAULT_WARN_COOLDOWN_MS;
  const warnLogger = options?.warnLogger ?? ((msg: string) => console.warn(msg));
  const recentResetAt = new Map<string, number>();
  const recentWarnAt = new Map<string, number>();

  const origDecryptMessage =
    typeof baseRepo.decryptMessage === 'function' ? baseRepo.decryptMessage.bind(baseRepo) : null;
  const origDecryptGroupMessage =
    typeof baseRepo.decryptGroupMessage === 'function' ? baseRepo.decryptGroupMessage.bind(baseRepo) : null;
  const origDeleteSession =
    typeof baseRepo.deleteSession === 'function' ? baseRepo.deleteSession.bind(baseRepo) : null;

  const deleteExpandedSessions = async (jids: string[]): Promise<void> => {
    const cleanJids = (jids || []).map(j => String(j || '').trim()).filter(Boolean);
    if (cleanJids.length === 0) return;

    const expanded = await expandSignalAliasJids(authKeys, cleanJids);
    const targetJids = expanded.length > 0 ? expanded : cleanJids;

    if (origDeleteSession) {
      await origDeleteSession(targetJids);
      return;
    }

    if (authKeys && typeof authKeys.set === 'function' && typeof baseRepo.jidToSignalProtocolAddress === 'function') {
      const updates: Record<string, null> = {};
      for (const j of targetJids) {
        try {
          updates[String(baseRepo.jidToSignalProtocolAddress(j))] = null;
        } catch {
          // Ignore invalid JID
        }
      }
      if (Object.keys(updates).length > 0) {
        await authKeys.set({ session: updates });
      }
    }
  };

  const wrapped: any = {
    ...baseRepo,
    __signalRecoveryWrapped: true,
    deleteSession: deleteExpandedSessions,
    decryptGroupMessage: origDecryptGroupMessage
      ? async (params: any) => withSignalDecryptScope(() => origDecryptGroupMessage(params))
      : baseRepo.decryptGroupMessage,
    decryptMessage: origDecryptMessage
      ? async (params: { jid: string; type: 'pkmsg' | 'msg' | string; ciphertext: Uint8Array }) => {
          const jid = String(params?.jid || '');
          const peerKey = normalizePeerRecoveryKey(baseRepo, jid);
          try {
            const plain = await withSignalDecryptScope(() => origDecryptMessage(params));
            recentResetAt.delete(peerKey);
            return plain;
          } catch (err: any) {
            const errMsg = getSignalErrorMessage(err) || 'Unknown Signal decrypt error';
            const now = Date.now();
            let sessionReset = false;

            if (shouldResetCorruptedSignalSession(err)) {
              const lastReset = recentResetAt.get(peerKey) || 0;
              if (now - lastReset >= resetCooldownMs) {
                setBoundedMap(recentResetAt, peerKey, now);
                try {
                  await deleteExpandedSessions([jid]);
                  sessionReset = true;
                } catch {
                  // Best-effort purge; do not mask original error
                }
              }
            }

            if (isRecoverableSignalMacError(err)) {
              const lastWarn = recentWarnAt.get(peerKey) || 0;
              if (now - lastWarn >= warnCooldownMs) {
                setBoundedMap(recentWarnAt, peerKey, now);
                warnLogger(
                  sessionReset
                    ? `[Signal Recovery] Dekripsi ${params?.type || 'msg'} dari ${jid} gagal (${errMsg}); sesi Signal lama di-reset otomatis untuk sinkronisasi retry prekey.`
                    : `[Signal Recovery] Dekripsi ${params?.type || 'msg'} dari ${jid} gagal sementara (${errMsg}); menunggu retry/resync Baileys.`
                );
              }
              try {
                options?.onRecovery?.({
                  jid,
                  type: String(params?.type || 'msg'),
                  error: errMsg,
                  sessionReset
                });
              } catch {
                // Never fail on hook error
              }
            }

            throw err;
          }
        }
      : baseRepo.decryptMessage
  };

  // Preserve getters/prototype properties such as lidMapping or bound methods
  Object.setPrototypeOf(wrapped, Object.getPrototypeOf(baseRepo));
  return wrapped as T;
}

export function createResilientSignalRepository(
  auth: any,
  logger: any,
  pnToLIDFunc?: any,
  options?: SignalRepositoryRecoveryOptions & {
    baseFactory?: (auth: any, logger: any, pnToLIDFunc?: any) => any;
  }
) {
  const factory = options?.baseFactory || DEFAULT_CONNECTION_CONFIG.makeSignalRepository;
  const baseRepo = factory(auth, logger, pnToLIDFunc);
  return wrapSignalRepositoryWithRecovery(baseRepo, auth?.keys, options);
}
