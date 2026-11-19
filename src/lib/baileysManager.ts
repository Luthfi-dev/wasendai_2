import makeWASocketImport, {
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  generateMessageIDV2,
  DisconnectReason,
  fetchLatestBaileysVersion,
  delay
} from '@whiskeysockets/baileys';
import crypto from 'crypto';
import net from 'net';
import os from 'os';
import dns from 'dns/promises';
import pino from 'pino';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import WebSocket from 'ws';
import {
  updateSession,
  addSession,
  deleteSession,
  getSessionById,
  getSessionsByUserId,
  getWhatsAppSessions,
  addMessageLog,
  addBroadcastHistory,
  getAntiBanSettings,
  getSystemConfig,
  getUserById,
  canUseAiQuota,
  canUseDailyQuota,
  deductUserAiQuota,
  deductUserDailyQuota,
  initDbFile,
  extractUserIdFromSessionId,
  isSessionOwnedByUserId,
  getActiveCatalogForAi,
  resolveOrderNotificationRecipientPhone,
  getSuperadminWaQueue,
  enqueueSuperadminWaMessage,
  updateSuperadminWaQueueItem,
  removeSuperadminWaQueueItem,
  isPhoneMetaAiVerifiedForUser,
  markUserMetaAiVerified,
  updateUser,
  resolveEffectiveSessionAiSettings,
  getWhitelabelConfig,
  resolvePublicAppBaseUrl,
  hasSessionExpiryAlertSent,
  markSessionExpiryAlertSent,
  clearSessionExpiryAlertSent,
  getPendingSessionExpiryAlerts,
  upsertPendingSessionExpiryAlert,
  removePendingSessionExpiryAlert,
  clearPendingSessionExpiryAlertsByKeys,
  getUserAutoReplyStatus,
  recordSessionMessageActivity,
  SESSION_INACTIVITY_PURGE_MS,
  hasIncomingMessageBeenHandled,
  markIncomingMessagesHandled,
  getChatReplyWatermark,
  recordChatReplyWatermark,
  getPendingMissedMessages,
  upsertPendingMissedMessage,
  updatePendingMissedMessage,
  removePendingMissedMessage,
  clearPendingMissedMessagesForSession,
  getAppNodesConfig,
  getKillTargetIpsConfig,
  resolveClusterNotifyPhone,
  applyLiveClusterSnapshotToDb,
  normalizeAppIdValue,
  normalizeServerIpValue,
  getMaxGlobalSessions,
  getSubscriptionPlans,
  updateSystemConfig,
  normalizeKillTargetIps
} from './db.js';
import {
  askMetaAiViaBaileys,
  attachMetaAiRawSocketHandlers,
  clearMetaAiSession,
  handleMetaAiIncomingUpdate,
  handleMetaAiIncomingUpsert,
  isInternalPromptLeakText,
  isMetaAiJid,
  registerConnectedSocketProvider,
  warmMetaAiSession,
  type ConnectedSocketEntry
} from './metaAiService.js';
import { recordAiAuditEvent } from './aiAuditLogger.js';
import { createResilientSignalRepository, installLibsignalConsoleGuard } from './signalRecovery.js';
import {
  isMysqlConfigured,
  saveBaileysAuthToMysql,
  loadBaileysAuthFromMysql,
  loadAllBaileysAuthSessionIdsFromMysql,
  deleteBaileysAuthFromMysql,
  saveWaSessionLeaseToMysql,
  loadWaSessionLeaseFromMysql,
  deleteWaSessionLeaseFromMysql,
  getCurrentAppId,
  getDisplayAppId,
  isAppIdEnvConfigured,
  normalizeAppId,
  upsertAppNodeHeartbeatToMysql,
  upsertActiveSocketToMysql,
  markActiveSocketKilledInMysql,
  unkillSocketsByIpInMysql,
  claimDeadAppFailoverInMysql,
  clearDeadAppFailoverClaimInMysql,
  fetchAllActiveSocketsFromMysql,
  saveWaSessionConflictToMysql,
  deleteWaSessionConflictFromMysql,
  fetchAllWaSessionConflictsFromMysql,
  fetchAllWaSessionLeasesFromMysql,
  updateSessionAssignmentInMysql,
  fetchLiveClusterSnapshotFromMysql,
  fetchAllAppNodesFromMysql,
  pushUserAssignedAppToMysql,
  type WaSessionRuntimeLease
} from './mysqlService.js';
import { sendTelegramAlert, escapeTelegramHtml } from './telegramService.js';
import { signToken, verifySignedToken } from './security.js';
import type {
  WhatsAppSessionConflictDetail,
  WhatsAppSession,
  AppNodeRuntimeStatus,
  ActiveSocketRecord,
  KillTargetIpRule,
  SystemConfig,
  UserAccount
} from '../types/whatsapp.js';
import {
  buildDeterministicOrderFallbackReply,
  completeAndConsumeVerifiedPaidOrder,
  formatOwnerOrderNotificationMessage,
  parseAndHandleAiPaymentDirectives,
  prepareOrderFlowForIncomingMessage,
  recordCustomerTurn
} from './orderAssistant.js';

// Consistent Browser & Version across ALL Baileys sockets (prevents "Periksa nomor dengan benar" on pairing restart)
export const BAILEYS_BROWSER: [string, string, string] = ['Ubuntu', 'Chrome', '22.04.4'];
export const DEFAULT_BAILEYS_VERSION: [number, number, number] = [2, 3000, 1043857760];
const BAILEYS_SILENT_LOGGER = pino({ level: 'silent' });

let cachedBaileysVersion: [number, number, number] | null = null;
let versionFetchPromise: Promise<[number, number, number]> | null = null;

async function resolveBaileysVersion(): Promise<[number, number, number]> {
  if (cachedBaileysVersion) return cachedBaileysVersion;
  if (versionFetchPromise) return versionFetchPromise;

  versionFetchPromise = Promise.race([
    fetchLatestBaileysVersion().then(res => res.version as [number, number, number]),
    new Promise<[number, number, number]>(resolve =>
      setTimeout(() => resolve(DEFAULT_BAILEYS_VERSION), 3500)
    )
  ])
    .catch(() => DEFAULT_BAILEYS_VERSION)
    .then(ver => {
      cachedBaileysVersion = ver || DEFAULT_BAILEYS_VERSION;
      versionFetchPromise = null;
      return cachedBaileysVersion;
    });

  return versionFetchPromise;
}

function isSocketTrulyOpen(sock: any): boolean {
  if (!sock) return false;
  if (sock.ws) {
    if (sock.ws.isClosed === true) return false;
    if (typeof sock.ws.readyState === 'number' && sock.ws.readyState !== 1) return false;
    if (typeof sock.ws.socket?.readyState === 'number' && sock.ws.socket.readyState !== 1) return false;
    if (typeof sock.ws.isOpen === 'boolean') return sock.ws.isOpen;
    if (typeof sock.ws.readyState === 'number') return sock.ws.readyState === 1;
    if (typeof sock.ws.socket?.readyState === 'number') return sock.ws.socket.readyState === 1;
  }
  return true;
}

function isSocketConnecting(sock: any): boolean {
  if (!sock?.ws) return false;
  if (typeof sock.ws.isConnecting === 'boolean') return sock.ws.isConnecting;
  if (typeof sock.ws.readyState === 'number') return sock.ws.readyState === 0;
  if (typeof sock.ws.socket?.readyState === 'number') return sock.ws.socket.readyState === 0;
  return false;
}

// Normalize phone number to international WhatsApp format (e.g. 0812..., 812..., +62812... -> 62812...)
export function normalizePhoneNumber(phone: string): string {
  if (!phone) return '';
  let clean = phone.replace(/\D/g, '');
  if (clean.startsWith('00')) {
    clean = clean.slice(2);
  }
  if (clean.startsWith('620')) {
    clean = '62' + clean.slice(3);
  } else if (clean.startsWith('0')) {
    clean = '62' + clean.slice(1);
  } else if (clean.startsWith('8')) {
    clean = '62' + clean;
  }
  return clean;
}

// Handle ESM/CJS default export compatibility for Baileys
const makeWASocket = (makeWASocketImport as any).default || makeWASocketImport;

interface SessionState {
  sessionId: string;
  userId?: string;
  socket: any;
  qrCodeUrl: string | null;
  pairingCode: string | null;
  status: 'connecting' | 'connected' | 'disconnected';
  phoneNumber: string | null;
  lastUpdated: number;
  lastOutgoingAt?: number;
  handshakeStartedAt: number;
  openedAt?: number;
  retryCount: number;
  consecutiveConflicts?: number;
  conflictCooldownUntil?: number;
  disconnectedSince?: number;
  is_primary?: boolean;
  superseded?: boolean;
  closedByApp?: boolean;
  stabilityTimer?: NodeJS.Timeout;
  detachRawHandlers?: () => void;
}

const activeSessions = new Map<string, SessionState>();
const sessionStartLocks = new Map<string, Promise<SessionState>>();
const authBackupTimers = new Map<string, NodeJS.Timeout>();
const lastAuthBackupAt = new Map<string, number>();
const lastAuthBackupHashes = new Map<string, string>();
const reconnectTimers = new Map<string, NodeJS.Timeout>();
const transient440Timers = new Map<string, NodeJS.Timeout>();
const sessionConflictStates = new Map<
  string,
  { count: number; cooldownUntil: number; lastConflictAt: number; reason?: 'transient' | 'external_conflict' }
>();
const inFlightExpiryAlerts = new Set<string>();
const recentMessageProtoCache = new Map<string, any>();
const sessionDisconnectDiagnostics = new Map<string, { code?: number; reason: string; at: number }>();
const sessionConflictDetails = new Map<string, WhatsAppSessionConflictDetail>();
const remoteSessionConflictCache = new Map<string, { detail: WhatsAppSessionConflictDetail; fetchedAt: number }>();
const sessionSendVerifiedAt = new Map<string, number>();
const lastLeaseRefreshAt = new Map<string, number>();
const remoteSessionLeaseCache = new Map<string, { lease: WaSessionRuntimeLease | null; fetchedAt: number }>();
const REMOTE_LEASE_CACHE_TTL_MS = 15 * 1000;
const REMOTE_LEASE_FRESH_MS = 90 * 1000;
const RUNTIME_INSTANCE_ID = crypto.randomBytes(6).toString('hex');
const RUNTIME_HOSTNAME = os.hostname();
let lastResolvedIdentity: { domain: string; serverIp: string; hostname: string } | null = null;
let resolvedDomainIpCache: { host: string; ip: string; at: number } | null = null;
const AUTH_DIR = path.resolve(process.cwd(), 'baileys_auth_sessions');
const UNSCANNED_HANDSHAKE_TTL_MS = 3 * 60 * 1000;
const AUTH_BACKUP_DEBOUNCE_MS = 4000;
const AUTH_BACKUP_COOLDOWN_MS = 15000;
const PRUNE_COOLDOWN_MS = 120000;
const MYSQL_AUTH_PRUNE_INTERVAL_MS = 10 * 60 * 1000;
const SESSION_EXPIRY_ALERT_GRACE_MS = 60 * 60 * 1000; // Tunggu 1 jam sebelum kirim WA pengingat kedaluwarsa
const STABLE_OPEN_THRESHOLD_MS = 25 * 1000;
const MAX_AUTO_CONFLICT_RETRIES = 3;
const CONFLICT_COOLDOWN_MS = 24 * 60 * 60 * 1000; // Sticky pause only for confirmed external competing server
const TRANSIENT_440_RECOVERY_DELAYS_MS = [35_000, 75_000, 150_000];
const LOCAL_LEASE_FILENAME = '.runtime_lease.json';
const LOCAL_CLOSE_MARKER_FILENAME = '.last_close_at';
const LOCAL_LEASE_STALE_MS = 75 * 1000;
const HANDOFF_CLOSE_GRACE_MS = 3200;

function recordSessionSendVerified(sessionId?: string, phoneNumber?: string, atMs = Date.now()): void {
  if (sessionId) {
    sessionSendVerifiedAt.set(sessionId, atMs);
  }
  const cleanPhone = normalizePhoneNumber(phoneNumber || '');
  if (cleanPhone.length >= 8) {
    sessionSendVerifiedAt.set(`phone:${cleanPhone}`, atMs);
  }
}

function getLatestSessionSendVerifiedAt(sessionId?: string, phoneNumber?: string): number {
  const bySid = sessionId ? sessionSendVerifiedAt.get(sessionId) || 0 : 0;
  const cleanPhone = normalizePhoneNumber(phoneNumber || '');
  const byPhone = cleanPhone.length >= 8 ? sessionSendVerifiedAt.get(`phone:${cleanPhone}`) || 0 : 0;
  return Math.max(bySid, byPhone);
}

let initialStartupPending = false;
let initialStartupPendingAt = 0;

export function setBaileysStartupPending(pending: boolean): void {
  initialStartupPending = pending;
  initialStartupPendingAt = pending ? Date.now() : 0;
}

export function isBaileysStartupPending(): boolean {
  if (!initialStartupPending) return false;
  if (Date.now() - initialStartupPendingAt > 15_000) {
    initialStartupPending = false;
    return false;
  }
  return true;
}

function createTtlCacheStore(ttlMs: number, maxEntries: number = 1500) {
  const store = new Map<string, { val: unknown; exp: number }>();
  const purgeIfNeeded = () => {
    if (store.size <= maxEntries) return;
    const now = Date.now();
    for (const [k, entry] of store.entries()) {
      if (entry.exp <= now) store.delete(k);
    }
    while (store.size > maxEntries) {
      const oldestKey = store.keys().next().value;
      if (!oldestKey) break;
      store.delete(oldestKey);
    }
  };
  return {
    get<T>(key: string): T | undefined {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (entry.exp <= Date.now()) {
        store.delete(key);
        return undefined;
      }
      return entry.val as T;
    },
    set<T>(key: string, value: T): boolean {
      store.delete(key);
      store.set(key, { val: value, exp: Date.now() + ttlMs });
      purgeIfNeeded();
      return true;
    },
    del(key: string): number {
      return store.delete(key) ? 1 : 0;
    },
    flushAll(): void {
      store.clear();
    },
    mget<T>(keys: string[]): Promise<Record<string, T | undefined>> {
      const out: Record<string, T | undefined> = {};
      const now = Date.now();
      for (const key of keys) {
        const entry = store.get(key);
        if (entry && entry.exp > now) {
          out[key] = entry.val as T;
        } else if (entry) {
          store.delete(key);
        }
      }
      return Promise.resolve(out);
    },
    mset<T>(entries: Array<{ key: string; value: T }>): boolean {
      const exp = Date.now() + ttlMs;
      for (const { key, value } of entries) {
        store.delete(key);
        store.set(key, { val: value, exp });
      }
      purgeIfNeeded();
      return true;
    },
    close(): void {
      // Keep warm across brief reconnects; explicit cleanup clears session caches
    }
  };
}

const sessionUserDevicesCaches = new Map<string, ReturnType<typeof createTtlCacheStore>>();
const sessionMsgRetryCaches = new Map<string, ReturnType<typeof createTtlCacheStore>>();
const sessionSignalKeyStores = new Map<string, any>();

function getSessionCacheStores(sessionId: string) {
  let userDevicesCache = sessionUserDevicesCaches.get(sessionId);
  if (!userDevicesCache) {
    userDevicesCache = createTtlCacheStore(5 * 60 * 1000, 1500);
    sessionUserDevicesCaches.set(sessionId, userDevicesCache);
  }
  let msgRetryCounterCache = sessionMsgRetryCaches.get(sessionId);
  if (!msgRetryCounterCache) {
    msgRetryCounterCache = createTtlCacheStore(10 * 60 * 1000, 800);
    sessionMsgRetryCaches.set(sessionId, msgRetryCounterCache);
  }
  return { userDevicesCache, msgRetryCounterCache };
}

function clearSessionCacheStores(sessionId: string) {
  sessionUserDevicesCaches.get(sessionId)?.flushAll();
  sessionUserDevicesCaches.delete(sessionId);
  sessionMsgRetryCaches.get(sessionId)?.flushAll();
  sessionMsgRetryCaches.delete(sessionId);
  sessionSignalKeyStores.delete(sessionId);
}

function persistCredsAtomicSync(sessionFolder: string, creds: any): void {
  if (!sessionFolder || !creds) return;
  fs.mkdirSync(sessionFolder, { recursive: true, mode: 0o700 });
  const target = path.join(sessionFolder, 'creds.json');
  const tmp = path.join(sessionFolder, `.creds.${process.pid}.${Date.now()}.tmp`);
  const serialized = JSON.stringify(creds, (k, v) => {
    if (v instanceof Uint8Array || Buffer.isBuffer(v)) {
      return { type: 'Buffer', data: Array.from(v) };
    }
    if (v && typeof v === 'object' && v.type === 'Buffer' && Array.isArray(v.data)) {
      return v;
    }
    return v;
  });
  fs.writeFileSync(tmp, serialized, { encoding: 'utf-8', mode: 0o600 });
  fs.renameSync(tmp, target);
}

export async function createResilientMultiFileAuthState(sessionId: string, sessionFolder: string) {
  fs.mkdirSync(sessionFolder, { recursive: true, mode: 0o700 });
  const { state, saveCreds: rawSaveCreds } = await useMultiFileAuthState(sessionFolder);

  const ensureFolderAndHydrate = async () => {
    if (!fs.existsSync(sessionFolder)) {
      fs.mkdirSync(sessionFolder, { recursive: true, mode: 0o700 });
    }
    const credsPath = path.join(sessionFolder, 'creds.json');
    if (!fs.existsSync(credsPath)) {
      await hydrateSessionAuthFolderFromMysql(sessionId).catch(() => false);
      if (!fs.existsSync(credsPath) && state?.creds) {
        try {
          persistCredsAtomicSync(sessionFolder, state.creds);
        } catch {
          await rawSaveCreds();
        }
      }
    }
  };

  const resilientRawKeys = {
    async get(type: string, ids: string[]) {
      try {
        if (!fs.existsSync(sessionFolder)) {
          await ensureFolderAndHydrate();
        }
        return await state.keys.get(type as any, ids);
      } catch (err: any) {
        if (err?.code === 'ENOENT') {
          await ensureFolderAndHydrate();
          return await state.keys.get(type as any, ids);
        }
        throw err;
      }
    },
    async set(data: any) {
      try {
        if (!fs.existsSync(sessionFolder)) {
          await ensureFolderAndHydrate();
        }
        await state.keys.set(data);
      } catch (err: any) {
        if (err?.code === 'ENOENT') {
          await ensureFolderAndHydrate();
          await state.keys.set(data);
        } else {
          throw err;
        }
      }
    },
    async clear() {
      if (typeof (state.keys as any).clear === 'function') {
        await (state.keys as any).clear();
      }
    }
  };

  const saveCreds = async () => {
    try {
      await ensureFolderAndHydrate();
      await rawSaveCreds();
    } catch (err: any) {
      if (err?.code === 'ENOENT') {
        await ensureFolderAndHydrate();
        await rawSaveCreds();
      } else {
        throw err;
      }
    }
  };

  return {
    state: {
      creds: state.creds,
      keys: resilientRawKeys
    },
    saveCreds
  };
}

export function buildCachedAuthState(sessionId: string, state: any) {
  const cachedKeys = makeCacheableSignalKeyStore(state.keys, BAILEYS_SILENT_LOGGER);
  sessionSignalKeyStores.set(sessionId, cachedKeys);
  return {
    creds: state.creds,
    keys: cachedKeys
  };
}

function rememberProtoMessage(key: { remoteJid?: string | null; id?: string | null }, message: any) {
  const id = key?.id ? String(key.id) : '';
  if (!id || !message) return;
  const cacheKey = `${key?.remoteJid || ''}:${id}`;
  if (recentMessageProtoCache.has(cacheKey)) {
    recentMessageProtoCache.delete(cacheKey);
  }
  recentMessageProtoCache.set(cacheKey, message);
  if (recentMessageProtoCache.size > 250) {
    const oldest = recentMessageProtoCache.keys().next().value;
    if (oldest) recentMessageProtoCache.delete(oldest);
  }
}

function getLocalNonInternalIpv4(): string {
  try {
    const ifaces = os.networkInterfaces();
    const privateIps: string[] = [];
    for (const entries of Object.values(ifaces)) {
      if (!entries) continue;
      for (const info of entries) {
        if (!info || info.internal || info.family !== 'IPv4' || !info.address) continue;
        const addr = info.address;
        const isPrivate =
          addr.startsWith('10.') ||
          addr.startsWith('192.168.') ||
          addr.startsWith('169.254.') ||
          /^172\.(1[6-9]|2\d|3[01])\./.test(addr);
        if (!isPrivate) return addr;
        privateIps.push(addr);
      }
    }
    return privateIps[0] || '';
  } catch {
    return '';
  }
}

export function normalizeComparableDomain(raw?: string): string {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return '';
  try {
    const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
    const parsed = new URL(withProto);
    const host = parsed.hostname.toLowerCase();
    const port = parsed.port && parsed.port !== '80' && parsed.port !== '443' ? `:${parsed.port}` : '';
    return `${host}${port}`;
  } catch {
    return s.replace(/^https?:\/\//i, '').split('/')[0].replace(/:(80|443)$/, '').trim().toLowerCase();
  }
}

export function extractPrimaryIp(raw?: string): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  const beforeParen = s.split('(')[0].trim();
  return beforeParen.split(/\s+/)[0].trim().toLowerCase();
}

export function isSameDomainAndIpIdentity(
  local: { domain?: string; serverIp?: string },
  remote: { domain?: string; server_ip?: string }
): boolean {
  const localDom = normalizeComparableDomain(local.domain);
  const remoteDom = normalizeComparableDomain(remote.domain);
  if (!localDom || !remoteDom || localDom !== remoteDom) {
    return false;
  }
  const localIp = extractPrimaryIp(local.serverIp);
  const remoteIp = extractPrimaryIp(remote.server_ip);
  if (!localIp || !remoteIp) {
    return false;
  }
  return localIp === remoteIp;
}

function getCachedOrFallbackIdentity(): { domain: string; serverIp: string; hostname: string } {
  if (lastResolvedIdentity) return lastResolvedIdentity;
  const baseUrl = resolvePublicAppBaseUrl();
  const domain = normalizeComparableDomain(baseUrl) || RUNTIME_HOSTNAME;
  const serverIp = (process.env.SERVER_PUBLIC_IP || '').trim() || getLocalNonInternalIpv4() || '127.0.0.1';
  return { domain, serverIp, hostname: RUNTIME_HOSTNAME };
}

async function resolveCurrentServerIdentity(): Promise<{
  domain: string;
  serverIp: string;
  hostname: string;
}> {
  const baseUrl = resolvePublicAppBaseUrl();
  let domain = '';
  let hostnameOnly = '';
  if (baseUrl) {
    try {
      const parsed = new URL(baseUrl);
      domain = parsed.host || parsed.hostname || '';
      hostnameOnly = parsed.hostname || '';
    } catch {
      domain = baseUrl.replace(/^https?:\/\//i, '').split('/')[0] || '';
      hostnameOnly = domain.split(':')[0] || '';
    }
  }
  if (!domain) {
    domain = RUNTIME_HOSTNAME;
  }

  const envPublicIp = (process.env.SERVER_PUBLIC_IP || '').trim();
  const localNicIp = getLocalNonInternalIpv4();
  let publicDnsIp = envPublicIp;

  const isPublicDomain =
    Boolean(hostnameOnly) &&
    hostnameOnly !== 'localhost' &&
    hostnameOnly !== '127.0.0.1' &&
    hostnameOnly !== '::1' &&
    !/^\d{1,3}(\.\d{1,3}){3}$/.test(hostnameOnly);

  if (!publicDnsIp && isPublicDomain) {
    if (resolvedDomainIpCache && resolvedDomainIpCache.host === hostnameOnly && Date.now() - resolvedDomainIpCache.at < 10 * 60 * 1000) {
      publicDnsIp = resolvedDomainIpCache.ip;
    } else {
      try {
        const res = await Promise.race([
          dns.lookup(hostnameOnly, { family: 4 }),
          new Promise<null>(resolve => setTimeout(() => resolve(null), 1200))
        ]);
        if (res && typeof (res as any).address === 'string' && (res as any).address) {
          publicDnsIp = (res as any).address;
          resolvedDomainIpCache = { host: hostnameOnly, ip: publicDnsIp, at: Date.now() };
        }
      } catch {
        // Ignore DNS resolution failure in offline/restricted environments
      }
    }
  } else if (!publicDnsIp && /^\d{1,3}(\.\d{1,3}){3}$/.test(hostnameOnly)) {
    publicDnsIp = hostnameOnly;
  }

  let serverIp = publicDnsIp || localNicIp || '127.0.0.1';
  if (publicDnsIp && localNicIp && publicDnsIp !== localNicIp) {
    serverIp = `${publicDnsIp} (NIC: ${localNicIp})`;
  }

  lastResolvedIdentity = { domain, serverIp, hostname: RUNTIME_HOSTNAME };
  return lastResolvedIdentity;
}
void resolveCurrentServerIdentity().catch(() => {});

const SOCKET_STARTED_AT = new Date().toISOString();
const IP_KILL_CHECK_INTERVAL_MS = 3 * 60 * 1000; // Cek daftar IP kill mandiri setiap 3 menit
let isSelfKilledByIpRule = false;
let selfKilledReason = '';
let selfKilledAt: string | undefined;
let lastSocketPublishAt = 0;

export function isSocketSelfKilled(): boolean {
  return isSelfKilledByIpRule;
}

export function collectAllLocalIpAddresses(): string[] {
  const ipSet = new Set<string>();
  const addIfValidIp = (candidate?: string) => {
    const clean = normalizeServerIpValue(candidate);
    if (clean && net.isIP(clean) !== 0) {
      ipSet.add(clean);
    }
  };

  const identity = getCachedOrFallbackIdentity();
  addIfValidIp(extractPrimaryIp(identity.serverIp));
  const nicMatch = identity.serverIp?.match(/NIC:\s*([^)]+)/i);
  if (nicMatch?.[1]) addIfValidIp(nicMatch[1]);

  addIfValidIp(process.env.SERVER_PUBLIC_IP);
  addIfValidIp(resolvedDomainIpCache?.ip);

  try {
    const ifaces = os.networkInterfaces();
    for (const entries of Object.values(ifaces)) {
      if (!entries) continue;
      for (const info of entries) {
        if (!info || info.internal || !info.address) continue;
        addIfValidIp(info.address);
      }
    }
  } catch {
    // Ignore NIC enumeration errors
  }

  return Array.from(ipSet);
}

export function isTargetServerIpLocal(targetIp?: string): boolean {
  const cleanTarget = normalizeServerIpValue(extractPrimaryIp(targetIp));
  if (!cleanTarget) return false;
  const localIps = collectAllLocalIpAddresses();
  return localIps.includes(cleanTarget);
}

export function buildCurrentSocketRecord(statusOverride?: ActiveSocketRecord['status']): ActiveSocketRecord {
  const idNow = getCachedOrFallbackIdentity();
  const allIps = collectAllLocalIpAddresses();
  const primaryIp = normalizeServerIpValue(extractPrimaryIp(idNow.serverIp)) || allIps[0] || '127.0.0.1';
  const now = Date.now();
  const activeSessionIds: string[] = [];
  const activePhonesSet = new Set<string>();
  let connectingCount = 0;

  for (const [sid, mem] of activeSessions.entries()) {
    if (mem.superseded) continue;
    const isConnected = mem.status === 'connected' && (!mem.socket || isSocketTrulyOpen(mem.socket));
    const isConnecting = mem.status === 'connecting' && now - mem.lastUpdated < 120_000;
    if (isConnected) {
      activeSessionIds.push(sid);
      const p = normalizePhoneNumber(mem.phoneNumber || getSessionById(sid)?.phone_number || '');
      if (p.length >= 8) activePhonesSet.add(p);
    } else if (isConnecting) {
      connectingCount++;
      activeSessionIds.push(sid);
      const p = normalizePhoneNumber(mem.phoneNumber || getSessionById(sid)?.phone_number || '');
      if (p.length >= 8) activePhonesSet.add(p);
    }
  }

  const effectiveStatus: ActiveSocketRecord['status'] =
    statusOverride || (isSelfKilledByIpRule ? 'killed' : 'active');

  return {
    instance_id: RUNTIME_INSTANCE_ID,
    app_id: getDisplayAppId(), // Eksplisit 'undefined' jika env APP_ID tidak disetel
    server_ip: idNow.serverIp,
    primary_ip: primaryIp,
    all_ips: allIps.length > 0 ? allIps : [primaryIp],
    domain: idNow.domain,
    hostname: idNow.hostname,
    pid: process.pid,
    status: effectiveStatus,
    active_connections: activeSessionIds.length,
    connecting_connections: connectingCount,
    active_session_ids: activeSessionIds,
    active_phones: Array.from(activePhonesSet),
    started_at: SOCKET_STARTED_AT,
    last_heartbeat_at: new Date().toISOString(),
    kill_reason: isSelfKilledByIpRule ? selfKilledReason : undefined,
    killed_at: isSelfKilledByIpRule ? selfKilledAt : undefined,
    online: effectiveStatus === 'active',
    is_self: true
  };
}

export async function publishCurrentSocketRecord(options?: {
  force?: boolean;
  statusOverride?: ActiveSocketRecord['status'];
}): Promise<ActiveSocketRecord> {
  if (!lastResolvedIdentity) {
    await resolveCurrentServerIdentity().catch(() => {});
  }
  const now = Date.now();
  const record = buildCurrentSocketRecord(options?.statusOverride);
  if (!options?.force && now - lastSocketPublishAt < 25_000) {
    return record;
  }
  lastSocketPublishAt = now;
  if (isMysqlConfigured()) {
    await upsertActiveSocketToMysql(record).catch(() => {});
  }
  return record;
}

export async function isIpCurrentlyActiveInCluster(targetIp: string): Promise<{
  active: boolean;
  reason?: string;
  appId?: string;
}> {
  const cleanIp = normalizeServerIpValue(extractPrimaryIp(targetIp));
  if (!cleanIp) return { active: false };

  if (!isSelfKilledByIpRule && isTargetServerIpLocal(cleanIp)) {
    return {
      active: true,
      appId: getDisplayAppId(),
      reason: `IP ${cleanIp} adalah host yang sedang AKTIF/ONLINE (APP_ID: ${getDisplayAppId()}) sehingga dilindungi dan tidak dapat di-kill.`
    };
  }

  if (isMysqlConfigured()) {
    const dbSockets = await fetchAllActiveSocketsFromMysql().catch(() => []);
    const now = Date.now();
    const activeMatch = dbSockets.find(s => {
      if (!s || s.status !== 'active') return false;
      const hbMs = s.last_heartbeat_at ? Date.parse(s.last_heartbeat_at) : 0;
      const isOnline = s.online || Boolean(hbMs && now - hbMs <= 120_000);
      if (!isOnline) return false;
      return (
        normalizeServerIpValue(s.primary_ip) === cleanIp ||
        normalizeServerIpValue(extractPrimaryIp(s.server_ip)) === cleanIp ||
        (Array.isArray(s.all_ips) && s.all_ips.some(x => normalizeServerIpValue(x) === cleanIp))
      );
    });
    if (activeMatch) {
      return {
        active: true,
        appId: activeMatch.app_id || 'undefined',
        reason: `IP ${cleanIp} sedang AKTIF/ONLINE pada socket APP_ID "${activeMatch.app_id || 'undefined'}" dan tidak boleh di-kill.`
      };
    }
  }

  return { active: false };
}

export async function recoverFromIpKillSwitch(source = 'unkill'): Promise<void> {
  const wasKilled = isSelfKilledByIpRule;
  isSelfKilledByIpRule = false;
  selfKilledReason = '';
  selfKilledAt = undefined;

  startBaileysBackgroundLoops();
  await publishCurrentSocketRecord({ force: true, statusOverride: 'active' }).catch(() => {});

  if (wasKilled) {
    console.log(`[Socket Unkill Recovery] IP host ini dipulihkan (${source}). Mengaktifkan kembali socket WhatsApp...`);
    void sendTelegramAlert({
      title: 'Socket Server Dipulihkan (Unkill)',
      severity: 'success',
      dedupKey: `unkill_recover_${RUNTIME_INSTANCE_ID}`,
      cooldownMs: 30_000,
      lines: [
        `• APP_ID: <code>${escapeTelegramHtml(getDisplayAppId())}</code>`,
        `• Host: <code>${escapeTelegramHtml(getCachedOrFallbackIdentity().domain || RUNTIME_HOSTNAME)}</code>`,
        `• IP: <code>${escapeTelegramHtml(extractPrimaryIp(getCachedOrFallbackIdentity().serverIp) || '-')}</code>`,
        `• Sumber: ${escapeTelegramHtml(source)}`,
        `Status socket kembali AKTIF dan sesi WhatsApp sedang dipulihkan.`
      ]
    }).catch(() => {});
  }

  void restoreSavedBaileysSessions()
    .then(() => runAppNodeAssignmentTick('unkill_recovery'))
    .catch(() => {});
}

export async function unkillTargetIp(
  targetIp: string,
  requestedBy = 'superadmin'
): Promise<{
  success: boolean;
  ip: string;
  recovered_locally: boolean;
  mysql_updated_rows: number;
  message: string;
}> {
  const cleanIp = normalizeServerIpValue(extractPrimaryIp(targetIp));
  if (!cleanIp || net.isIP(cleanIp) === 0) {
    throw new Error('Alamat IP tidak valid.');
  }

  const currentList = getKillTargetIpsConfig();
  const nextList = normalizeKillTargetIps(currentList.filter(item => item.ip !== cleanIp));
  updateSystemConfig({ kill_target_ips: nextList });

  const mysqlUpdatedRows = await unkillSocketsByIpInMysql(cleanIp).catch(() => 0);

  const localIps = collectAllLocalIpAddresses();
  const matchesLocal = localIps.includes(cleanIp);
  const stillMatchedByAnotherRule = nextList.some(r => localIps.includes(r.ip));
  let recoveredLocally = false;

  if ((matchesLocal || isSelfKilledByIpRule) && !stillMatchedByAnotherRule && isSelfKilledByIpRule) {
    recoveredLocally = true;
    await recoverFromIpKillSwitch(`unkill_by_${requestedBy}`);
  } else {
    void sendTelegramAlert({
      title: 'IP Berhasil Di-Unkill',
      severity: 'info',
      dedupKey: `unkill_ip_${cleanIp}`,
      cooldownMs: 15_000,
      lines: [
        `• IP: <code>${escapeTelegramHtml(cleanIp)}</code>`,
        `• Oleh: ${escapeTelegramHtml(requestedBy)}`,
        `• Socket MySQL direset: ${mysqlUpdatedRows}`,
        `Server dengan IP tersebut kini diizinkan aktif kembali.`
      ]
    }).catch(() => {});
  }

  return {
    success: true,
    ip: cleanIp,
    recovered_locally: recoveredLocally,
    mysql_updated_rows: mysqlUpdatedRows,
    message: recoveredLocally
      ? `IP ${cleanIp} berhasil di-unkill dan socket server ini langsung diaktifkan kembali.`
      : `IP ${cleanIp} berhasil di-unkill dan aturan shutdown dicabut.`
  };
}

export async function checkAndEnforceIpKillSwitch(source = 'interval_3m'): Promise<{
  killed: boolean;
  recovered?: boolean;
  matchedIp?: string;
  reason?: string;
}> {
  try {
    if (!lastResolvedIdentity) {
      await resolveCurrentServerIdentity().catch(() => {});
    }
    if (isMysqlConfigured()) {
      const snap = await fetchLiveClusterSnapshotFromMysql().catch(() => null);
      if (snap) {
        applyLiveClusterSnapshotToDb(snap);
      }
    }
    const rules = getKillTargetIpsConfig();
    const localIps = collectAllLocalIpAddresses();
    const matched = rules.length > 0 ? rules.find(r => localIps.includes(r.ip)) : undefined;

    if (!matched) {
      if (isSelfKilledByIpRule) {
        await recoverFromIpKillSwitch(`rule_removed_${source}`);
        return { killed: false, recovered: true };
      }
      return { killed: false };
    }

    if (!isSelfKilledByIpRule) {
      isSelfKilledByIpRule = true;
      selfKilledReason =
        matched.reason || `Dimatikan otomatis oleh daftar Kill IP Admin (${matched.ip})`;
      selfKilledAt = new Date().toISOString();
      console.warn(
        `[Socket Kill-Switch] IP server (${matched.ip}) ditemukan di daftar target shutdown [${source}]. Mematikan seluruh socket WhatsApp lokal...`
      );
      if (isMysqlConfigured()) {
        await markActiveSocketKilledInMysql(RUNTIME_INSTANCE_ID, selfKilledReason).catch(() => {});
      }
      await publishCurrentSocketRecord({ force: true, statusOverride: 'killed' }).catch(() => {});
      await shutdownBaileysManager({ selfKilled: true, reason: selfKilledReason }).catch(() => {});
      void sendTelegramAlert({
        title: 'Socket Server Dimatikan (Kill-Switch IP)',
        severity: 'warn',
        dedupKey: `self_kill_${RUNTIME_INSTANCE_ID}`,
        cooldownMs: 60_000,
        lines: [
          `• APP_ID: <code>${escapeTelegramHtml(getDisplayAppId())}</code>`,
          `• IP Cocok: <code>${escapeTelegramHtml(matched.ip)}</code>`,
          `• Alasan: ${escapeTelegramHtml(selfKilledReason)}`,
          `• Sumber: ${escapeTelegramHtml(source)}`
        ]
      }).catch(() => {});
    } else {
      await publishCurrentSocketRecord({ force: true, statusOverride: 'killed' }).catch(() => {});
    }

    return { killed: true, matchedIp: matched.ip, reason: selfKilledReason };
  } catch {
    return { killed: isSelfKilledByIpRule };
  }
}

const ipKillCheckTimer = setInterval(() => {
  checkAndEnforceIpKillSwitch('interval_3m').catch(() => {});
}, IP_KILL_CHECK_INTERVAL_MS);
ipKillCheckTimer.unref?.();

setTimeout(() => {
  publishCurrentSocketRecord({ force: true }).catch(() => {});
}, 2500).unref?.();

interface LocalRuntimeLease {
  instance_id: string;
  pid: number;
  hostname: string;
  domain?: string;
  server_ip?: string;
  session_id: string;
  user_id?: string;
  phone_number?: string;
  status: 'connecting' | 'connected';
  started_at: number;
  heartbeat_at: number;
}

function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    return err?.code === 'EPERM';
  }
}

function writeLocalRuntimeLease(
  sessionId: string,
  params: { userId?: string; phoneNumber?: string; status: 'connecting' | 'connected'; startedAt?: number }
): void {
  const folder = safeSessionFolderPath(sessionId);
  if (!folder) return;
  try {
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
    }
    const now = Date.now();
    const idNow = getCachedOrFallbackIdentity();
    const payload: LocalRuntimeLease = {
      instance_id: RUNTIME_INSTANCE_ID,
      pid: process.pid,
      hostname: RUNTIME_HOSTNAME,
      domain: idNow.domain,
      server_ip: idNow.serverIp,
      session_id: sessionId,
      user_id: params.userId,
      phone_number: params.phoneNumber ? normalizePhoneNumber(params.phoneNumber) : undefined,
      status: params.status,
      started_at: params.startedAt || now,
      heartbeat_at: now
    };
    const target = path.join(folder, LOCAL_LEASE_FILENAME);
    const tmp = path.join(folder, `.runtime_lease.${process.pid}.${now}.tmp`);
    fs.writeFileSync(tmp, JSON.stringify(payload), { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(tmp, target);
  } catch {
    // Non-fatal local runtime lease write
  }
}

function readLocalRuntimeLease(sessionId: string): LocalRuntimeLease | null {
  const folder = safeSessionFolderPath(sessionId);
  if (!folder) return null;
  try {
    const target = path.join(folder, LOCAL_LEASE_FILENAME);
    if (!fs.existsSync(target)) return null;
    const parsed = JSON.parse(fs.readFileSync(target, 'utf-8')) as LocalRuntimeLease;
    if (!parsed || typeof parsed.pid !== 'number' || !parsed.instance_id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function removeLocalRuntimeLease(sessionId: string, expectedInstanceId?: string): void {
  const folder = safeSessionFolderPath(sessionId);
  if (!folder) return;
  try {
    const target = path.join(folder, LOCAL_LEASE_FILENAME);
    if (!fs.existsSync(target)) return;
    if (expectedInstanceId) {
      const existing = readLocalRuntimeLease(sessionId);
      if (existing && existing.instance_id !== expectedInstanceId && existing.pid !== process.pid && isPidAlive(existing.pid)) {
        return;
      }
    }
    fs.rmSync(target, { force: true });
  } catch {
    // Non-fatal local lease removal
  }
}

export function recordLastCloseTimestamp(sessionId: string, closedAt = Date.now()): void {
  const folder = safeSessionFolderPath(sessionId);
  if (!folder || !fs.existsSync(folder)) return;
  try {
    const target = path.join(folder, LOCAL_CLOSE_MARKER_FILENAME);
    const tmp = path.join(folder, `.last_close.${process.pid}.${closedAt}.tmp`);
    fs.writeFileSync(
      tmp,
      JSON.stringify({
        closed_at: closedAt,
        instance_id: RUNTIME_INSTANCE_ID,
        pid: process.pid
      }),
      { encoding: 'utf-8', mode: 0o600 }
    );
    fs.renameSync(tmp, target);
  } catch {
    // Non-fatal local close marker write
  }
}

export function readLastCloseTimestamp(sessionId: string): number {
  const folder = safeSessionFolderPath(sessionId);
  if (!folder) return 0;
  try {
    const target = path.join(folder, LOCAL_CLOSE_MARKER_FILENAME);
    if (!fs.existsSync(target)) return 0;
    const parsed = JSON.parse(fs.readFileSync(target, 'utf-8'));
    const ts = Number(parsed?.closed_at || 0);
    return Number.isFinite(ts) && ts > 0 ? ts : 0;
  } catch {
    return 0;
  }
}

export async function waitForHandoffCloseGraceIfNeeded(
  sessionId: string,
  graceMs = HANDOFF_CLOSE_GRACE_MS
): Promise<number> {
  const now = Date.now();
  const lastCloseAt = readLastCloseTimestamp(sessionId);
  const prevDiskLease = readLocalRuntimeLease(sessionId);

  let recentDeadCloseAt = lastCloseAt;
  if (
    prevDiskLease &&
    prevDiskLease.hostname === RUNTIME_HOSTNAME &&
    prevDiskLease.pid !== process.pid &&
    !isPidAlive(prevDiskLease.pid)
  ) {
    const leaseActivityAt = Number(prevDiskLease.heartbeat_at || prevDiskLease.started_at || 0);
    if (leaseActivityAt > recentDeadCloseAt) {
      recentDeadCloseAt = leaseActivityAt;
    }
    removeLocalRuntimeLease(sessionId);
  }

  if (!recentDeadCloseAt) return 0;
  const elapsed = now - recentDeadCloseAt;
  if (elapsed >= 0 && elapsed < graceMs) {
    const waitTime = Math.min(graceMs, graceMs - elapsed);
    await delay(waitTime);
    return waitTime;
  }
  return 0;
}

function findLiveLocalSiblingLease(params: {
  sessionId?: string;
  userId?: string;
  cleanPhone?: string;
}): LocalRuntimeLease | null {
  const now = Date.now();
  const cleanPhone = normalizePhoneNumber(params.cleanPhone || '');
  const localIdentity = getCachedOrFallbackIdentity();

  const isFreshLiveSibling = (lease: LocalRuntimeLease | null): lease is LocalRuntimeLease => {
    if (!lease) return false;
    if (lease.instance_id === RUNTIME_INSTANCE_ID) return false;
    if (lease.hostname === RUNTIME_HOSTNAME && lease.pid === process.pid) return false;
    if (now - (Number(lease.heartbeat_at) || 0) > LOCAL_LEASE_STALE_MS) return false;
    if (lease.hostname === RUNTIME_HOSTNAME) {
      if (!isPidAlive(lease.pid)) return false;
    } else if (lease.domain || lease.server_ip) {
      if (!isSameDomainAndIpIdentity(localIdentity, lease)) return false;
    } else {
      return false;
    }
    if (params.userId && lease.user_id && lease.user_id !== params.userId) return false;
    return true;
  };

  if (params.sessionId) {
    const direct = readLocalRuntimeLease(params.sessionId);
    if (isFreshLiveSibling(direct)) return direct;
  }

  if (cleanPhone.length >= 8 && fs.existsSync(AUTH_DIR)) {
    try {
      for (const folder of fs.readdirSync(AUTH_DIR)) {
        const lease = readLocalRuntimeLease(folder);
        if (!isFreshLiveSibling(lease)) continue;
        const leasePhone = normalizePhoneNumber(lease.phone_number || getCredsPhoneOnDisk(folder) || '');
        if (leasePhone === cleanPhone) {
          return lease;
        }
      }
    } catch {
      // Ignore scan error
    }
  }

  return null;
}

export type RemoteLeaseClassification = 'none' | 'same_domain_ip' | 'remote_cluster_node' | 'different_ip';

function isAuthorizedClusterLease(
  lease: WaSessionRuntimeLease,
  assignedAppId?: string
): boolean {
  const leaseAppId = normalizeAppId(lease.app_id);
  if (!leaseAppId || leaseAppId === 'default') return false;
  const currentAppId = getCurrentAppId();
  if (leaseAppId === currentAppId) return false;
  const normalizedAssigned = normalizeAppId(assignedAppId);
  if (normalizedAssigned) {
    return leaseAppId === normalizedAssigned;
  }
  const configuredNodes = getAppNodesConfig();
  return configuredNodes.some(n => n.app_id === leaseAppId && n.is_active !== false);
}

function classifyLeaseObject(
  lease: WaSessionRuntimeLease | null | undefined,
  params: {
    userId?: string;
    assignedAppId?: string;
    identity: { domain: string; serverIp: string; hostname: string };
  }
): { status: RemoteLeaseClassification; lease?: WaSessionRuntimeLease } {
  if (!lease || !lease.instance_id || lease.instance_id === RUNTIME_INSTANCE_ID) {
    return { status: 'none' };
  }
  const now = Date.now();
  if (now - (Number(lease.heartbeat_at) || 0) > REMOTE_LEASE_FRESH_MS) {
    return { status: 'none' };
  }
  if (params.userId && lease.user_id && lease.user_id !== params.userId) {
    return { status: 'none' };
  }
  if (isAuthorizedClusterLease(lease, params.assignedAppId)) {
    return { status: 'remote_cluster_node', lease };
  }
  if (isSameDomainAndIpIdentity(params.identity, lease)) {
    return { status: 'same_domain_ip', lease };
  }
  return { status: 'different_ip', lease };
}

function getCachedRemoteLeaseClassification(params: {
  sessionId?: string;
  userId?: string;
  cleanPhone?: string;
  assignedAppId?: string;
}): { status: RemoteLeaseClassification; lease?: WaSessionRuntimeLease } {
  const now = Date.now();
  const identity = getCachedOrFallbackIdentity();
  const keys = [
    params.sessionId ? `sid:${params.sessionId}` : '',
    params.cleanPhone && params.cleanPhone.length >= 8 ? `phone:${params.cleanPhone}` : ''
  ].filter(Boolean);

  for (const k of keys) {
    const cached = remoteSessionLeaseCache.get(k);
    if (!cached || now - cached.fetchedAt > REMOTE_LEASE_CACHE_TTL_MS * 2) continue;
    const res = classifyLeaseObject(cached.lease, {
      userId: params.userId,
      assignedAppId: params.assignedAppId,
      identity
    });
    if (res.status !== 'none') return res;
  }
  return { status: 'none' };
}

async function evaluateRemoteLeaseForSession(params: {
  sessionId?: string;
  userId?: string;
  cleanPhone?: string;
  assignedAppId?: string;
  forceRefresh?: boolean;
}): Promise<{
  status: RemoteLeaseClassification;
  lease?: WaSessionRuntimeLease;
  identity: { domain: string; serverIp: string; hostname: string };
}> {
  const identity = await resolveCurrentServerIdentity();
  const cleanPhone = normalizePhoneNumber(params.cleanPhone || '');
  const resolvedAssignedAppId =
    params.assignedAppId ||
    (params.sessionId ? getSessionById(params.sessionId)?.assigned_app_id : undefined);
  const cacheKeys = [
    params.sessionId ? `sid:${params.sessionId}` : '',
    cleanPhone.length >= 8 ? `phone:${cleanPhone}` : ''
  ].filter(Boolean);

  const now = Date.now();
  if (!params.forceRefresh && cacheKeys.length > 0) {
    for (const k of cacheKeys) {
      const cached = remoteSessionLeaseCache.get(k);
      if (cached && now - cached.fetchedAt <= REMOTE_LEASE_CACHE_TTL_MS) {
        const res = classifyLeaseObject(cached.lease, {
          userId: params.userId,
          assignedAppId: resolvedAssignedAppId,
          identity
        });
        if (res.status !== 'none' || !cached.lease) {
          return { ...res, identity };
        }
      }
    }
  }

  if (!isMysqlConfigured() || (!params.sessionId && cleanPhone.length < 8)) {
    return { status: 'none', identity };
  }

  try {
    const lease = await Promise.race([
      loadWaSessionLeaseFromMysql({
        sessionId: params.sessionId,
        phoneNumber: cleanPhone || undefined
      }),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 1200))
    ]);

    const fetchedAt = Date.now();
    for (const k of cacheKeys) {
      remoteSessionLeaseCache.set(k, { lease, fetchedAt });
    }
    const res = classifyLeaseObject(lease, {
      userId: params.userId,
      assignedAppId: resolvedAssignedAppId,
      identity
    });
    return { ...res, identity };
  } catch {
    return { status: 'none', identity };
  }
}

export async function refreshRemoteSessionLeasesIfNeeded(
  sessions: Array<{ id: string; user_id?: string; phone_number?: string }>
): Promise<void> {
  if (!isMysqlConfigured() || !Array.isArray(sessions) || sessions.length === 0) return;
  const now = Date.now();
  const staleSessions = sessions.filter(s => {
    if (!s?.id) return false;
    const mem = activeSessions.get(s.id);
    if (mem && !mem.superseded && mem.status === 'connected' && isSocketTrulyOpen(mem.socket)) {
      return false;
    }
    const cached = remoteSessionLeaseCache.get(`sid:${s.id}`);
    return !cached || now - cached.fetchedAt > REMOTE_LEASE_CACHE_TTL_MS;
  });

  if (staleSessions.length === 0) return;
  await Promise.allSettled(
    staleSessions.map(s =>
      evaluateRemoteLeaseForSession({
        sessionId: s.id,
        userId: s.user_id,
        cleanPhone: s.phone_number
      })
    )
  );
}

async function publishActiveSessionLease(sessionData: SessionState, force = false): Promise<void> {
  if (!sessionData?.sessionId || sessionData.superseded) return;
  const now = Date.now();
  const prevAt = lastLeaseRefreshAt.get(sessionData.sessionId) || 0;
  if (!force && now - prevAt < 25_000) return;
  lastLeaseRefreshAt.set(sessionData.sessionId, now);

  const dbSess = getSessionById(sessionData.sessionId);
  const cleanPhone = normalizePhoneNumber(
    sessionData.phoneNumber || dbSess?.phone_number || getCredsPhoneOnDisk(sessionData.sessionId) || ''
  );

  writeLocalRuntimeLease(sessionData.sessionId, {
    userId: sessionData.userId,
    phoneNumber: cleanPhone || undefined,
    status: sessionData.status === 'connected' ? 'connected' : 'connecting',
    startedAt: sessionData.openedAt || sessionData.handshakeStartedAt || now
  });

  if (!sessionData.userId || !isMysqlConfigured()) return;

  try {
    const identity = await resolveCurrentServerIdentity();
    const lease: WaSessionRuntimeLease = {
      instance_id: RUNTIME_INSTANCE_ID,
      app_id: getCurrentAppId(),
      session_id: sessionData.sessionId,
      session_name: dbSess?.session_name || (cleanPhone ? `WA - ${cleanPhone}` : sessionData.sessionId),
      phone_number: cleanPhone,
      user_id: sessionData.userId,
      domain: identity.domain,
      server_ip: identity.serverIp,
      hostname: identity.hostname,
      connected_at: sessionData.openedAt || now,
      heartbeat_at: now
    };
    const fetchedAt = Date.now();
    remoteSessionLeaseCache.set(`sid:${sessionData.sessionId}`, { lease, fetchedAt });
    if (cleanPhone.length >= 8) {
      remoteSessionLeaseCache.set(`phone:${cleanPhone}`, { lease, fetchedAt });
    }
    await saveWaSessionLeaseToMysql(lease);
  } catch {
    // Non-fatal lease telemetry
  }
}

export function setRemoteSessionLeaseCacheForTest(
  sessionId: string,
  lease: WaSessionRuntimeLease | null,
  phoneNumber?: string
): void {
  const fetchedAt = Date.now();
  remoteSessionLeaseCache.set(`sid:${sessionId}`, { lease, fetchedAt });
  const cleanPhone = normalizePhoneNumber(phoneNumber || lease?.phone_number || '');
  if (cleanPhone.length >= 8) {
    remoteSessionLeaseCache.set(`phone:${cleanPhone}`, { lease, fetchedAt });
  }
}

function buildRemoteConflictDetailSync(
  lease: WaSessionRuntimeLease,
  sessionId: string,
  sessionName?: string
): WhatsAppSessionConflictDetail {
  const identity = getCachedOrFallbackIdentity();
  const cleanPhone = normalizePhoneNumber(lease.phone_number || '');
  return {
    source_type: 'remote_instance',
    source_label: 'Server Lain dengan IP Berbeda (Koneksi Ganda)',
    competing_session_id: lease.session_id,
    competing_session_name: lease.session_name || sessionName || lease.session_id,
    competing_phone: cleanPhone || undefined,
    competing_domain: lease.domain || '-',
    competing_ip: lease.server_ip || '-',
    competing_hostname: lease.hostname,
    competing_instance_id: lease.instance_id.slice(0, 8),
    competing_last_active_at: new Date(lease.heartbeat_at || Date.now()).toISOString(),
    local_session_id: sessionId,
    local_session_name: sessionName || sessionId,
    local_domain: identity.domain,
    local_ip: identity.serverIp,
    raw_reason: 'Stream active on remote server with different IP',
    detected_at: new Date().toISOString(),
    detail_note: `Sesi WhatsApp ini sedang aktif di server dengan IP berbeda (${lease.server_ip || '-'}, domain "${lease.domain || '-'}"). Tutup koneksi WhatsApp di server lain tersebut terlebih dahulu, baru klik "Sambungkan Ulang".`
  };
}

async function captureAndStoreConflictDiagnostic(params: {
  sessionId: string;
  ownerId: string;
  cleanPhone?: string;
  sessionName?: string;
  disconnectErr?: any;
  disconnectErrMsg?: string;
  cooldownUntil?: number;
}): Promise<WhatsAppSessionConflictDetail> {
  const { sessionId, ownerId, cleanPhone, sessionName, disconnectErr, disconnectErrMsg, cooldownUntil } = params;
  const identity = await resolveCurrentServerIdentity();
  const detectedIso = new Date().toISOString();
  const cooldownIso = cooldownUntil ? new Date(cooldownUntil).toISOString() : undefined;
  const errLocation = disconnectErr?.data?.attrs?.location ? String(disconnectErr.data.attrs.location).trim() : '';
  const rawReasonParts = [disconnectErrMsg, errLocation ? `location=${errLocation}` : ''].filter(Boolean);
  const rawReason = rawReasonParts.join(' | ').slice(0, 180) || 'Stream Errored (conflict)';

  // 1. Check for another socket on this same server process holding the same WA phone
  if (cleanPhone && cleanPhone.length >= 8) {
    for (const s of activeSessions.values()) {
      if (s.sessionId === sessionId) continue;
      if (s.userId && ownerId && s.userId !== ownerId) continue;
      const otherPhone = normalizePhoneNumber(s.phoneNumber || getCredsPhoneOnDisk(s.sessionId) || '');
      if (
        otherPhone &&
        otherPhone === cleanPhone &&
        ((s.status === 'connected' && isSocketTrulyOpen(s.socket)) || s.status === 'connecting')
      ) {
        const otherDb = getSessionById(s.sessionId);
        const otherName = otherDb?.session_name || s.sessionId;
        sessionConflictDetails.delete(sessionId);
        return {
          source_type: 'same_server',
          source_label: 'Sesi Duplikat di Aplikasi Ini',
          competing_session_id: s.sessionId,
          competing_session_name: otherName,
          competing_phone: otherPhone,
          competing_domain: identity.domain,
          competing_ip: identity.serverIp,
          competing_hostname: identity.hostname,
          competing_instance_id: RUNTIME_INSTANCE_ID.slice(0, 8),
          competing_last_active_at: new Date(s.lastUpdated || Date.now()).toISOString(),
          local_session_id: sessionId,
          local_session_name: sessionName || sessionId,
          local_domain: identity.domain,
          local_ip: identity.serverIp,
          raw_reason: rawReason,
          detected_at: detectedIso,
          cooldown_until: cooldownIso,
          detail_note: `Nomor +${cleanPhone} sudah aktif pada sesi "${otherName}" (${s.sessionId}) di server aplikasi ini (${identity.domain}).`
        };
      }
    }
  }

  // 1b. Check live sibling worker process of this same app on this host
  const localSibling = findLiveLocalSiblingLease({ sessionId, userId: ownerId, cleanPhone });
  if (localSibling) {
    sessionConflictDetails.delete(sessionId);
    return {
      source_type: 'same_server',
      source_label: 'Worker / Proses Lain pada Server Ini',
      competing_session_id: localSibling.session_id,
      competing_session_name: sessionName || localSibling.session_id,
      competing_phone: localSibling.phone_number || cleanPhone,
      competing_domain: identity.domain,
      competing_ip: identity.serverIp,
      competing_hostname: localSibling.hostname || identity.hostname,
      competing_instance_id: localSibling.instance_id.slice(0, 8),
      competing_last_active_at: new Date(localSibling.heartbeat_at).toISOString(),
      local_session_id: sessionId,
      local_session_name: sessionName || sessionId,
      local_domain: identity.domain,
      local_ip: identity.serverIp,
      raw_reason: rawReason,
      detected_at: detectedIso,
      cooldown_until: cooldownIso,
      detail_note: `Sesi sudah aktif pada proses worker lain (PID ${localSibling.pid}) di server aplikasi ini (${identity.domain}).`
    };
  }

  // 2. Check encrypted shared MySQL runtime lease for another Japriin instance / different IP
  if (isMysqlConfigured()) {
    try {
      const lease = await Promise.race([
        loadWaSessionLeaseFromMysql({ sessionId, phoneNumber: cleanPhone }),
        new Promise<null>(resolve => setTimeout(() => resolve(null), 1500))
      ]);
      if (
        lease &&
        (!ownerId || lease.user_id === ownerId) &&
        Date.now() - (Number(lease.heartbeat_at) || 0) < 30 * 60 * 1000
      ) {
        const isSameInstance = lease.instance_id === RUNTIME_INSTANCE_ID;
        const isSameApp = isSameInstance || isSameDomainAndIpIdentity(identity, lease);
        if (isSameApp) {
          const detail: WhatsAppSessionConflictDetail = {
            source_type: 'same_server',
            source_label: 'Koneksi Aktif pada Domain & IP Aplikasi Ini',
            competing_session_id: lease.session_id,
            competing_session_name: lease.session_name || lease.session_id,
            competing_phone: lease.phone_number || cleanPhone,
            competing_domain: lease.domain || identity.domain,
            competing_ip: lease.server_ip || identity.serverIp,
            competing_hostname: lease.hostname,
            competing_instance_id: lease.instance_id.slice(0, 8),
            competing_last_active_at: new Date(lease.heartbeat_at).toISOString(),
            local_session_id: sessionId,
            local_session_name: sessionName || sessionId,
            local_domain: identity.domain,
            local_ip: identity.serverIp,
            raw_reason: rawReason,
            detected_at: detectedIso,
            cooldown_until: cooldownIso,
            detail_note: `Sesi sudah aktif di domain dan IP yang sama (${lease.domain || identity.domain}, IP ${lease.server_ip || identity.serverIp}).`
          };
          return detail;
        }
        const detail: WhatsAppSessionConflictDetail = {
          source_type: 'remote_instance',
          source_label: 'Server / IP Berbeda (Koneksi Ganda Terdeteksi)',
          competing_session_id: lease.session_id,
          competing_session_name: lease.session_name || lease.session_id,
          competing_phone: lease.phone_number || cleanPhone,
          competing_domain: lease.domain || '-',
          competing_ip: lease.server_ip || '-',
          competing_hostname: lease.hostname,
          competing_instance_id: lease.instance_id.slice(0, 8),
          competing_last_active_at: new Date(lease.heartbeat_at).toISOString(),
          local_session_id: sessionId,
          local_session_name: sessionName || sessionId,
          local_domain: identity.domain,
          local_ip: identity.serverIp,
          raw_reason: rawReason,
          detected_at: detectedIso,
          cooldown_until: cooldownIso,
          detail_note: `WhatsApp nomor ini sedang aktif di server dengan IP berbeda (${lease.server_ip || '-'}, domain "${lease.domain || '-'}"). Tutup/hentikan koneksi pada server tersebut terlebih dahulu, lalu klik "Sambungkan Ulang".`
        };
        sessionConflictDetails.set(sessionId, detail);
        remoteSessionConflictCache.set(sessionId, { detail, fetchedAt: Date.now() });
        void saveWaSessionConflictToMysql(sessionId, detail).catch(() => {});
        return detail;
      }
    } catch {
      // Fall back to external/unknown detail
    }
  }

  // 3. External source (other server with different IP without shared MySQL, WhatsApp Web, or external bot)
  const detail: WhatsAppSessionConflictDetail = {
    source_type: 'external_or_unknown',
    source_label: 'Server Lain (IP Berbeda) / Aplikasi Eksternal',
    competing_session_id: sessionId,
    competing_session_name: sessionName || sessionId,
    competing_phone: cleanPhone,
    local_session_id: sessionId,
    local_session_name: sessionName || sessionId,
    local_domain: identity.domain,
    local_ip: identity.serverIp,
    raw_reason: rawReason,
    detected_at: detectedIso,
    cooldown_until: cooldownIso,
    detail_note: `Sesi WhatsApp ini sedang terhubung di server/perangkat lain dengan IP berbeda di luar ${identity.domain} (IP ${identity.serverIp}). Tutup koneksi WhatsApp pada server/aplikasi lain tersebut terlebih dahulu, lalu klik "Sambungkan Ulang".`
  };
  sessionConflictDetails.set(sessionId, detail);
  remoteSessionConflictCache.set(sessionId, { detail, fetchedAt: Date.now() });
  void saveWaSessionConflictToMysql(sessionId, detail).catch(() => {});
  return detail;
}

function recordDisconnectDiagnostic(sessionId: string, statusCode?: number, errMessage?: string) {
  let reason = `status_${statusCode ?? 'unknown'}`;
  if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
    reason = '401_logged_out_dari_hp_atau_server_wa';
  } else if (statusCode === DisconnectReason.connectionReplaced || statusCode === 440) {
    reason = '440_konflik_koneksi_ganda';
  } else if (statusCode === DisconnectReason.badSession || statusCode === 500) {
    reason = '500_bad_session_key_desync';
  } else if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
    reason = '515_restart_required';
  } else if (statusCode === DisconnectReason.timedOut || statusCode === 408) {
    reason = '408_websocket_timeout';
  } else if (statusCode === DisconnectReason.connectionClosed || statusCode === 428) {
    reason = '428_connection_closed';
  } else if (errMessage) {
    reason = `${statusCode ?? 'err'}: ${errMessage.slice(0, 100)}`;
  }
  sessionDisconnectDiagnostics.set(sessionId, {
    code: statusCode,
    reason,
    at: Date.now()
  });
}

export function clearSessionExpiryNotificationCooldown(sessionId: string, ownerUserId?: string, phone?: string) {
  const cleanPhone = normalizePhoneNumber(phone || '');
  const keysToClear: string[] = [];
  if (sessionId) keysToClear.push(sessionId);
  if (ownerUserId) {
    if (sessionId) keysToClear.push(`${ownerUserId}:${sessionId}`);
    if (cleanPhone) keysToClear.push(`${ownerUserId}:${cleanPhone}`);
  }
  clearSessionExpiryAlertSent(keysToClear);
  clearPendingSessionExpiryAlertsByKeys({
    userId: ownerUserId,
    sessionId,
    phone: cleanPhone
  });
}

function verifyExpiredAlertState(params: {
  userId: string;
  sessionId: string;
  expiredPhone?: string;
}): 'expired' | 'recovered' | 'wait' {
  const owner = getUserById(params.userId);
  if (!isOwnerActiveAndRegistered(owner)) {
    return 'recovered';
  }

  const now = Date.now();
  const cleanPhone = normalizePhoneNumber(params.expiredPhone || '');

  // 1. Check live in-memory sockets for this user
  for (const s of activeSessions.values()) {
    const ownerMatch =
      s.userId === owner!.id ||
      isSessionOwnedByUserId(s.sessionId, owner!.id) ||
      Boolean(getSessionById(s.sessionId)?.user_id === owner!.id);
    if (!ownerMatch) continue;

    const memPhone = normalizePhoneNumber(s.phoneNumber || '');
    const sameDevice =
      s.sessionId === params.sessionId ||
      (cleanPhone.length >= 8 && memPhone === cleanPhone);
    if (!sameDevice) continue;

    if (s.status === 'connected' && isSocketTrulyOpen(s.socket)) {
      return 'recovered';
    }
    if (s.status === 'connecting' && now - s.lastUpdated < 45000) {
      return 'wait';
    }
  }

  // 2. Check persisted DB sessions for this user (covers connected & valid standby devices)
  const userDbSessions = getSessionsByUserId(owner!.id);
  for (const s of userDbSessions) {
    const dbPhone = normalizePhoneNumber(s.phone_number || '');
    const sameDevice =
      s.id === params.sessionId ||
      (cleanPhone.length >= 8 && dbPhone === cleanPhone);
    if (!sameDevice) continue;

    const notExpiredByDate = !s.expires_at || Date.parse(s.expires_at) > now;
    if (s.status === 'connected' && notExpiredByDate && hasRegisteredCredsOnDisk(s.id)) {
      return 'recovered';
    }
  }

  return 'expired';
}

function buildProfessionalExpiredSessionMessage(params: {
  ownerName: string;
  expiredPhone?: string;
  sessionName?: string;
}): string {
  const wl = getWhitelabelConfig();
  const appName = (wl?.app_name || 'Japriin').trim();
  const publicUrl = resolvePublicAppBaseUrl();
  const cleanPhone = normalizePhoneNumber(params.expiredPhone || '');
  const deviceLabel = cleanPhone
    ? `+${cleanPhone}`
    : params.sessionName && !params.sessionName.startsWith('session_')
      ? params.sessionName
      : 'Perangkat WhatsApp Anda';
  const urlBlock = publicUrl ? `\nTautan login: ${publicUrl}\n` : '\n';

  return (
    `Halo *${params.ownerName}*,\n\n` +
    `Kami informasikan bahwa tautan perangkat WhatsApp Anda (*${deviceLabel}*) di *${appName}* saat ini sudah kedaluwarsa atau terputus selama lebih dari 1 jam.\n\n` +
    `Silakan login ke akun *${appName}* Anda dan tautkan kembali perangkat pada menu *Koneksi WA* agar sesi dan layanan pengiriman pesan Anda kembali berjalan lancar.${urlBlock}\n` +
    `Terima kasih.\n` +
    `_Pesan pengingat ini hanya dikirim satu kali sampai perangkat Anda ditautkan kembali._`
  );
}

export async function notifyUserSessionExpired(params: {
  sessionId: string;
  sessionName?: string;
  expiredPhone?: string;
  userId?: string;
  reason?: string;
  graceMs?: number;
}): Promise<{ notified: boolean; skipped?: string; queued?: boolean; scheduled?: boolean }> {
  const dbSess = getSessionById(params.sessionId);
  const resolvedPhone = normalizePhoneNumber(
    params.expiredPhone || dbSess?.phone_number || getCredsPhoneOnDisk(params.sessionId) || ''
  );
  const owner = resolveActiveVerifiedOwner(params.sessionId, params.userId || dbSess?.user_id, resolvedPhone);
  if (!isOwnerActiveAndRegistered(owner)) {
    return { notified: false, skipped: 'owner_inactive' };
  }

  const recipientPhone = normalizePhoneNumber(owner!.phone || '');
  if (!recipientPhone || recipientPhone.length < 8) {
    return { notified: false, skipped: 'missing_owner_phone' };
  }

  const dedupeKeys = Array.from(
    new Set(
      [
        resolvedPhone ? `${owner!.id}:${resolvedPhone}` : `${owner!.id}:${params.sessionId}`,
        `${owner!.id}:${params.sessionId}`
      ].filter(Boolean)
    )
  );

  if (dedupeKeys.some(k => inFlightExpiryAlerts.has(k)) || hasSessionExpiryAlertSent(dedupeKeys)) {
    return { notified: false, skipped: 'already_notified_until_relogin' };
  }

  const alertKey = resolvedPhone ? `${owner!.id}:${resolvedPhone}` : `${owner!.id}:${params.sessionId}`;
  const graceMs = typeof params.graceMs === 'number' && params.graceMs >= 0 ? params.graceMs : SESSION_EXPIRY_ALERT_GRACE_MS;

  const { item, created } = upsertPendingSessionExpiryAlert({
    key: alertKey,
    user_id: owner!.id,
    session_id: params.sessionId,
    session_name: params.sessionName || dbSess?.session_name,
    expired_phone: resolvedPhone || undefined,
    reason: params.reason,
    grace_ms: graceMs
  });

  if (created) {
    console.log(
      `[Baileys Expiry Alert Scheduled] User=${owner!.username} Session=${params.sessionId} (+${resolvedPhone || '-'}) ditunda 1 jam (kirim setelah ${item.notify_after}).`
    );
  }

  return { notified: false, scheduled: true, queued: false };
}

let isProcessingPendingExpiryAlerts = false;
export async function processPendingSessionExpiryAlerts(reason = 'watchdog'): Promise<{
  checked: number;
  sent: number;
  cancelled: number;
  waiting: number;
}> {
  if (isProcessingPendingExpiryAlerts) {
    return { checked: 0, sent: 0, cancelled: 0, waiting: 0 };
  }

  const pending = getPendingSessionExpiryAlerts();
  if (pending.length === 0) {
    return { checked: 0, sent: 0, cancelled: 0, waiting: 0 };
  }

  isProcessingPendingExpiryAlerts = true;
  let checked = 0;
  let sent = 0;
  let cancelled = 0;
  let waiting = 0;

  try {
    const now = Date.now();
    for (const alert of pending) {
      checked++;

      // Selalu cek ulang status sesi user (bahkan sebelum 1 jam) agar jika sudah pulih langsung dibatalkan
      const preCheck = verifyExpiredAlertState({
        userId: alert.user_id,
        sessionId: alert.session_id,
        expiredPhone: alert.expired_phone
      });
      if (preCheck === 'recovered') {
        removePendingSessionExpiryAlert(alert.id);
        cancelled++;
        continue;
      }

      const notifyAfterMs = Date.parse(alert.notify_after || '');
      if (Number.isFinite(notifyAfterMs) && now < notifyAfterMs) {
        waiting++;
        continue;
      }

      if (preCheck === 'wait') {
        waiting++;
        continue;
      }

      const owner = getUserById(alert.user_id);
      if (!isOwnerActiveAndRegistered(owner)) {
        removePendingSessionExpiryAlert(alert.id);
        cancelled++;
        continue;
      }

      const recipientPhone = normalizePhoneNumber(owner!.phone || '');
      if (!recipientPhone || recipientPhone.length < 8) {
        removePendingSessionExpiryAlert(alert.id);
        cancelled++;
        continue;
      }

      const cleanExpiredPhone = normalizePhoneNumber(alert.expired_phone || '');
      const dedupeKeys = Array.from(
        new Set(
          [
            cleanExpiredPhone ? `${owner!.id}:${cleanExpiredPhone}` : `${owner!.id}:${alert.session_id}`,
            `${owner!.id}:${alert.session_id}`
          ].filter(Boolean)
        )
      );

      if (hasSessionExpiryAlertSent(dedupeKeys)) {
        removePendingSessionExpiryAlert(alert.id);
        cancelled++;
        continue;
      }

      // Tunggu sampai WA Superadmin benar-benar terhubung
      const saSession = resolveConnectedSuperadminSession();
      if (!saSession) {
        waiting++;
        continue;
      }

      // Hindari self-notif jika satu-satunya admin WA yang terhubung justru nomor yg sama & tidak punya sesi lain
      if (owner!.role === 'admin' && saSession.sessionId === alert.session_id) {
        waiting++;
        continue;
      }

      // Verifikasi ulang TERAKHIR tepat sebelum mengirim agar tidak salah kirim info ke user
      const finalCheck = verifyExpiredAlertState({
        userId: alert.user_id,
        sessionId: alert.session_id,
        expiredPhone: alert.expired_phone
      });
      if (finalCheck === 'recovered') {
        removePendingSessionExpiryAlert(alert.id);
        cancelled++;
        continue;
      }
      if (finalCheck === 'wait') {
        waiting++;
        continue;
      }

      if (dedupeKeys.some(k => inFlightExpiryAlerts.has(k))) {
        waiting++;
        continue;
      }

      const message = buildProfessionalExpiredSessionMessage({
        ownerName: owner!.name || owner!.username,
        expiredPhone: alert.expired_phone,
        sessionName: alert.session_name
      });

      for (const k of dedupeKeys) inFlightExpiryAlerts.add(k);
      try {
        await sendDirectlyViaSuperadminSocket(saSession, recipientPhone, message);
        markSessionExpiryAlertSent(dedupeKeys);
        removePendingSessionExpiryAlert(alert.id);
        sent++;
        console.log(
          `[Baileys Expiry Alert Sent:${reason}] User=${owner!.username} (${recipientPhone}) ExpiredPhone=+${cleanExpiredPhone || '-'} Session=${alert.session_id}`
        );
        if (pending.length > 1) {
          await delay(3500 + crypto.randomInt(0, 1500));
        }
      } catch (err: any) {
        waiting++;
        console.warn(
          `[Baileys Expiry Alert Retry] Gagal kirim notifikasi expired ke ${recipientPhone}, ditahan untuk percobaan berikutnya:`,
          err?.message || err
        );
      } finally {
        for (const k of dedupeKeys) inFlightExpiryAlerts.delete(k);
      }
    }
  } finally {
    isProcessingPendingExpiryAlerts = false;
  }

  return { checked, sent, cancelled, waiting };
}

export function buildBaileysSocketConfig(
  version: [number, number, number],
  logger: any,
  authState: any,
  extraCaches?: { userDevicesCache?: any; msgRetryCounterCache?: any }
) {
  installLibsignalConsoleGuard();
  return {
    version,
    logger,
    printQRInTerminal: false,
    auth: authState,
    browser: BAILEYS_BROWSER,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    generateHighQualityLinkPreview: false,
    linkPreviewImageThumbnailWidth: 0,
    markOnlineOnConnect: false,
    shouldIgnoreJid: (jid: string) => {
      if (!jid) return false;
      if (isMetaAiJid(jid)) return false;
      return (
        jid.endsWith('@g.us') ||
        jid === 'status@broadcast' ||
        jid.endsWith('@broadcast') ||
        jid.endsWith('@newsletter')
      );
    },
    connectTimeoutMs: 30000,
    defaultQueryTimeoutMs: 20000,
    keepAliveIntervalMs: 15000,
    qrTimeout: 60000,
    retryRequestDelayMs: 1000,
    maxMsgRetryCount: 4,
    enableAutoSessionRecreation: true,
    makeSignalRepository: (auth: any, sockLogger: any, pnToLIDFunc?: any) =>
      createResilientSignalRepository(auth, sockLogger, pnToLIDFunc),
    ...(extraCaches?.userDevicesCache ? { userDevicesCache: extraCaches.userDevicesCache } : {}),
    ...(extraCaches?.msgRetryCounterCache ? { msgRetryCounterCache: extraCaches.msgRetryCounterCache } : {}),
    getMessage: async (key: { remoteJid?: string | null; id?: string | null }) => {
      if (!key?.id) return undefined;
      return (
        recentMessageProtoCache.get(`${key.remoteJid || ''}:${key.id}`) ||
        undefined
      );
    },
    transactionOpts: {
      maxCommitRetries: 5,
      delayBetweenTriesMs: 500
    }
  };
}

const ensureSessionLocks = new Map<string, Promise<ConnectedSocketEntry | null>>();

function socketMatchesUser(
  s: SessionState,
  userId: string,
  userDbSessions?: Array<{ id: string; user_id?: string; phone_number?: string }>
): boolean {
  if (!userId) return true;
  if (s.userId && s.userId !== userId) return false;
  if (s.userId === userId || isSessionOwnedByUserId(s.sessionId, userId)) {
    if (!s.userId) s.userId = userId;
    return true;
  }
  const dbSess = getSessionById(s.sessionId);
  if (dbSess?.user_id) {
    if (dbSess.user_id !== userId) return false;
    if (!s.userId) s.userId = userId;
    return true;
  }
  const ownedSessions = userDbSessions ?? getSessionsByUserId(userId);
  const memPhone = normalizePhoneNumber(s.phoneNumber || '');
  const matched = ownedSessions.some(
    dbS =>
      dbS.id === s.sessionId ||
      (memPhone.length >= 8 &&
        dbS.phone_number &&
        normalizePhoneNumber(dbS.phone_number) === memPhone)
  );
  if (matched && !s.userId) {
    s.userId = userId;
  }
  return matched;
}

function findLiveSocketEntry(
  userId?: string,
  preferredSessionId?: string
): ConnectedSocketEntry | null {
  const userDbSessions = userId ? getSessionsByUserId(userId) : undefined;
  if (preferredSessionId) {
    const pref = activeSessions.get(preferredSessionId);
    if (
      pref &&
      pref.status === 'connected' &&
      pref.socket &&
      isSocketTrulyOpen(pref.socket) &&
      (!userId || socketMatchesUser(pref, userId, userDbSessions))
    ) {
      return {
        sessionId: pref.sessionId,
        userId: pref.userId,
        phoneNumber: pref.phoneNumber || undefined,
        socket: pref.socket
      };
    }
  }

  const candidates = Array.from(activeSessions.values()).filter((s) => {
    if (s.status !== 'connected' || !s.socket || !isSocketTrulyOpen(s.socket)) return false;
    return !userId || socketMatchesUser(s, userId, userDbSessions);
  });

  const picked = candidates.find((s) => s.is_primary) || candidates[0];
  if (!picked) return null;
  return {
    sessionId: picked.sessionId,
    userId: picked.userId,
    phoneNumber: picked.phoneNumber || undefined,
    socket: picked.socket
  };
}

export async function ensureConnectedSessionForUser(
  userId?: string,
  preferredSessionId?: string,
  options?: { forceReconnect?: boolean }
): Promise<ConnectedSocketEntry | null> {
  const immediate = findLiveSocketEntry(userId, preferredSessionId);
  if (immediate) return immediate;
  if (!userId && !preferredSessionId) return null;

  const forceReconnect = Boolean(options?.forceReconnect);
  const lockKey = `${userId || ''}::${preferredSessionId || ''}::${forceReconnect ? 'force' : 'normal'}`;
  const inFlight = ensureSessionLocks.get(lockKey);
  if (inFlight) return inFlight;

  const promise = (async (): Promise<ConnectedSocketEntry | null> => {
    try {
      const userDbSessions = userId ? getSessionsByUserId(userId) : [];

      // 1. Wait briefly if an owned session is currently mid-handshake / reconnecting
      const connectingMatch = Array.from(activeSessions.values()).find((s) => {
        if (s.status !== 'connecting') return false;
        if (preferredSessionId && s.sessionId === preferredSessionId) {
          return !userId || socketMatchesUser(s, userId, userDbSessions);
        }
        return userId ? socketMatchesUser(s, userId, userDbSessions) : false;
      });

      if (connectingMatch) {
        let tries = 0;
        while (tries < 16 && connectingMatch.status === 'connecting') {
          await delay(400);
          const ready = findLiveSocketEntry(userId, preferredSessionId);
          if (ready) return ready;
          tries++;
        }
        const afterWait = findLiveSocketEntry(userId, preferredSessionId);
        if (afterWait) return afterWait;
        if (
          connectingMatch.status === 'connecting' &&
          (reconnectTimers.has(connectingMatch.sessionId) ||
            sessionStartLocks.has(connectingMatch.sessionId) ||
            (connectingMatch.socket &&
              (isSocketTrulyOpen(connectingMatch.socket) ||
                isSocketConnecting(connectingMatch.socket))))
        ) {
          return null;
        }
      }

      // 2. Collect candidate DB sessions owned by this user
      const candidates: Array<{ id: string; phone?: string; userId?: string }> = [];
      const addCandidate = (id?: string, phone?: string, uid?: string) => {
        if (!id) return;
        if (!candidates.some(c => c.id === id)) {
          candidates.push({ id, phone, userId: uid });
        }
      };

      if (preferredSessionId) {
        const prefDb = getSessionById(preferredSessionId);
        if (
          !userId ||
          (prefDb
            ? prefDb.user_id === userId || isSessionOwnedByUserId(prefDb.id, userId)
            : isSessionOwnedByUserId(preferredSessionId, userId))
        ) {
          addCandidate(preferredSessionId, prefDb?.phone_number, prefDb?.user_id || userId);
        }
      }

      const sortedDb = [...userDbSessions]
        .filter(s => !s.expires_at || new Date(s.expires_at).getTime() >= Date.now())
        .sort((a, b) => {
          const scoreStatus = (st?: string) => (st === 'connected' ? 2 : st === 'connecting' ? 1 : 0);
          const statusDiff = scoreStatus(b.status) - scoreStatus(a.status);
          if (statusDiff !== 0) return statusDiff;
          return Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary));
        });

      for (const s of sortedDb) {
        addCandidate(s.id, s.phone_number, s.user_id || userId);
      }

      // 3. Also inspect registered disk auth folders matching user's DB session phone
      if (userId && fs.existsSync(AUTH_DIR) && sortedDb.length > 0) {
        const targetPhones = new Set(
          sortedDb.map(s => normalizePhoneNumber(s.phone_number || '')).filter(p => p.length >= 8)
        );
        for (const folder of fs.readdirSync(AUTH_DIR)) {
          const summary = readCredsSummary(folder);
          if (!summary.registered) continue;
          if (
            isSessionOwnedByUserId(folder, userId) ||
            (summary.phone && targetPhones.has(summary.phone))
          ) {
            const owner = resolveActiveVerifiedOwner(folder, undefined, summary.phone);
            if (!owner || owner.id === userId) {
              addCandidate(folder, summary.phone, userId);
            }
          }
        }
      }

      if (isRestoringSessions) {
        let restoreWait = 0;
        while (restoreWait < 10 && isRestoringSessions) {
          await delay(300);
          const ready = findLiveSocketEntry(userId, preferredSessionId);
          if (ready) return ready;
          restoreWait++;
        }
      }

      // 4. Hydrate from MySQL if needed and wake the session socket on demand (for Blast / API / AI)
      for (const cand of candidates) {
        const candDb = getSessionById(cand.id);
        if (candDb && !isSessionOwnedByCurrentAppNode(candDb)) {
          continue;
        }
        const conflictEntry = sessionConflictStates.get(cand.id);
        const allowBypassTransientConflict =
          forceReconnect && conflictEntry?.reason !== 'external_conflict';
        if (isSessionInConflictCooldown(cand.id) && !allowBypassTransientConflict) {
          continue;
        }
        const candMem = activeSessions.get(cand.id);
        if (
          !forceReconnect &&
          (reconnectTimers.has(cand.id) ||
            sessionStartLocks.has(cand.id) ||
            (candMem &&
              candMem.status === 'connecting' &&
              candMem.socket &&
              (isSocketTrulyOpen(candMem.socket) || isSocketConnecting(candMem.socket))))
        ) {
          continue;
        }

        const candPhone = normalizePhoneNumber(cand.phone || getCredsPhoneOnDisk(cand.id) || '');
        if (!forceReconnect && candPhone && hasOtherActiveOrConnectingSocketForPhone(cand.id, candPhone, cand.userId || userId)) {
          continue;
        }
        if (
          findLiveLocalSiblingLease({
            sessionId: cand.id,
            userId: cand.userId || userId,
            cleanPhone: candPhone
          })
        ) {
          continue;
        }
        const remoteLease = await evaluateRemoteLeaseForSession({
          sessionId: cand.id,
          userId: cand.userId || userId,
          cleanPhone: candPhone,
          assignedAppId: candDb?.assigned_app_id
        });
        if (
          remoteLease.status === 'same_domain_ip' ||
          remoteLease.status === 'remote_cluster_node' ||
          remoteLease.status === 'different_ip'
        ) {
          continue;
        }

        if (allowBypassTransientConflict || !isSessionInConflictCooldown(cand.id)) {
          clearSessionConflictState(cand.id);
        }

        let hasCreds = hasRegisteredCredsOnDisk(cand.id);
        if (!hasCreds) {
          hasCreds = await hydrateSessionAuthFolderFromMysql(cand.id).catch(() => false);
        }
        if (!hasCreds) continue;

        const state = await getOrStartBaileysSession(
          cand.id,
          cand.phone,
          cand.userId || userId,
          forceReconnect ? { forceReconnect: true } : undefined
        );
        let tries = 0;
        while (tries < 14 && state.status === 'connecting') {
          await delay(400);
          const ready = findLiveSocketEntry(userId, preferredSessionId || cand.id);
          if (ready) {
            const activeMem = activeSessions.get(ready.sessionId);
            if (activeMem) activeMem.lastOutgoingAt = Date.now();
            return ready;
          }
          tries++;
        }
        const finalCheck = findLiveSocketEntry(userId, preferredSessionId || cand.id);
        if (finalCheck) {
          const activeMem = activeSessions.get(finalCheck.sessionId);
          if (activeMem) activeMem.lastOutgoingAt = Date.now();
          return finalCheck;
        }
      }

      return null;
    } finally {
      ensureSessionLocks.delete(lockKey);
    }
  })();

  ensureSessionLocks.set(lockKey, promise);
  return promise;
}

registerConnectedSocketProvider(
  (userId?: string, preferredSessionId?: string) => findLiveSocketEntry(userId, preferredSessionId),
  () =>
    Array.from(activeSessions.values())
      .filter((s) => s.status === 'connected' && s.socket && isSocketTrulyOpen(s.socket))
      .map((s) => ({
        sessionId: s.sessionId,
        userId: s.userId,
        phoneNumber: s.phoneNumber || undefined,
        socket: s.socket
      })),
  ensureConnectedSessionForUser
);

if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true, mode: 0o700 });
}

export function sanitizeSessionId(rawId: string): string {
  const cleaned = String(rawId || '').trim();
  if (!cleaned || !/^[a-zA-Z0-9_.-]{1,128}$/.test(cleaned) || cleaned.includes('..')) {
    throw new Error('ID sesi WhatsApp tidak valid.');
  }
  return cleaned;
}

const CATALOG_UPLOAD_DIR = path.resolve(process.cwd(), 'uploads', 'catalog');
const SAFE_LOCAL_CATALOG_FILE_RE = /^(?:prod|qris)_[a-f0-9-]+\.(png|jpg|webp|gif)$/i;

function resolveLocalCatalogImageBuffer(url?: string): Buffer | null {
  if (!url) return null;
  let relPath = String(url).trim();
  if (/^https?:\/\//i.test(relPath)) {
    try {
      relPath = new URL(relPath).pathname;
    } catch {
      return null;
    }
  }
  if (!relPath.startsWith('/api/catalog/images/')) return null;
  const filename = path.basename(relPath);
  if (!SAFE_LOCAL_CATALOG_FILE_RE.test(filename)) return null;
  const resolved = path.resolve(CATALOG_UPLOAD_DIR, filename);
  if (!resolved.startsWith(CATALOG_UPLOAD_DIR + path.sep)) return null;
  try {
    if (!fs.existsSync(resolved)) return null;
    const stat = fs.statSync(resolved);
    if (!stat.isFile() || stat.size < 50 || stat.size > 5 * 1024 * 1024) return null;
    return fs.readFileSync(resolved);
  } catch {
    return null;
  }
}

function safeSessionFolderPath(sessionId: string): string | null {
  try {
    const safeId = sanitizeSessionId(sessionId);
    const resolved = path.resolve(AUTH_DIR, safeId);
    if (!resolved.startsWith(AUTH_DIR + path.sep)) return null;
    return resolved;
  } catch {
    return null;
  }
}

function clearSessionTimers(sessionId: string) {
  const b = authBackupTimers.get(sessionId);
  if (b) {
    clearTimeout(b);
    authBackupTimers.delete(sessionId);
  }
  const r = reconnectTimers.get(sessionId);
  if (r) {
    clearTimeout(r);
    reconnectTimers.delete(sessionId);
  }
  const mem = activeSessions.get(sessionId);
  if (mem?.stabilityTimer) {
    clearTimeout(mem.stabilityTimer);
    mem.stabilityTimer = undefined;
  }
}

export function isPermanentLogoutCode(statusCode?: number): boolean {
  return statusCode === DisconnectReason.loggedOut || statusCode === 401;
}

export function isRestartRequiredCode(statusCode?: number): boolean {
  return statusCode === DisconnectReason.restartRequired || statusCode === 515;
}

export function isConnectionReplacedCode(statusCode?: number): boolean {
  return statusCode === DisconnectReason.connectionReplaced || statusCode === 440;
}

export function computeConflictCooldownMs(
  attemptCount: number,
  hasExternalCompetitor: boolean
): { cooldownMs: number; reason: 'transient' | 'external_conflict' } {
  if (hasExternalCompetitor || attemptCount > TRANSIENT_440_RECOVERY_DELAYS_MS.length) {
    return { cooldownMs: CONFLICT_COOLDOWN_MS, reason: 'external_conflict' };
  }
  const idx = Math.min(
    TRANSIENT_440_RECOVERY_DELAYS_MS.length - 1,
    Math.max(0, attemptCount - 1)
  );
  return {
    cooldownMs: TRANSIENT_440_RECOVERY_DELAYS_MS[idx],
    reason: 'transient'
  };
}

export function canAutoRecoverFromConflictCooldown(sessionId: string): boolean {
  if (!sessionId) return true;
  const entry = sessionConflictStates.get(sessionId);
  if (!entry) return true;
  if (Date.now() >= entry.cooldownUntil) {
    sessionConflictStates.delete(sessionId);
    return true;
  }
  return false;
}

export function isSessionInConflictCooldown(sessionId: string): boolean {
  if (!sessionId) return false;
  const entry = sessionConflictStates.get(sessionId);
  if (!entry) return false;
  if (entry.cooldownUntil > Date.now()) {
    return true;
  }
  if (entry.cooldownUntil > 0 && entry.cooldownUntil <= Date.now()) {
    sessionConflictStates.delete(sessionId);
  }
  return false;
}

export function clearSessionConflictState(sessionId: string): void {
  if (!sessionId) return;
  const t440 = transient440Timers.get(sessionId);
  if (t440) {
    clearTimeout(t440);
    transient440Timers.delete(sessionId);
  }
  sessionConflictStates.delete(sessionId);
  sessionConflictDetails.delete(sessionId);
  remoteSessionConflictCache.delete(sessionId);
  const mem = activeSessions.get(sessionId);
  if (mem) {
    mem.consecutiveConflicts = 0;
    mem.conflictCooldownUntil = undefined;
  }
}

function scheduleTransient440Recovery(params: {
  sessionId: string;
  sessionData: SessionState;
  ownerId: string;
  cleanPhone?: string;
  delayMs: number;
}): void {
  const { sessionId, sessionData, ownerId, cleanPhone, delayMs } = params;
  const prevTimer = transient440Timers.get(sessionId);
  if (prevTimer) {
    clearTimeout(prevTimer);
    transient440Timers.delete(sessionId);
  }

  const timer = setTimeout(async () => {
    transient440Timers.delete(sessionId);
    if (isSelfKilledByIpRule || sessionData.superseded) return;
    if (reconnectTimers.has(sessionId) || sessionStartLocks.has(sessionId)) return;

    const existingMem = activeSessions.get(sessionId);
    if (existingMem && existingMem !== sessionData && !existingMem.superseded) {
      if (existingMem.status === 'connected' && isSocketTrulyOpen(existingMem.socket)) {
        return;
      }
      if (existingMem.status === 'connecting') {
        return;
      }
    }

    const dbMeta = getSessionById(sessionId);
    if (dbMeta && !isSessionOwnedByCurrentAppNode(dbMeta)) {
      clearSessionConflictState(sessionId);
      return;
    }

    const verifiedOwner = resolveActiveVerifiedOwner(sessionId, ownerId || dbMeta?.user_id, cleanPhone || dbMeta?.phone_number);
    if (!isOwnerActiveAndRegistered(verifiedOwner)) {
      return;
    }

    const sibling = findLiveLocalSiblingLease({ sessionId, userId: verifiedOwner!.id, cleanPhone });
    if (sibling) {
      clearSessionConflictState(sessionId);
      return;
    }

    const remoteLease = await evaluateRemoteLeaseForSession({
      sessionId,
      userId: verifiedOwner!.id,
      cleanPhone,
      assignedAppId: dbMeta?.assigned_app_id,
      forceRefresh: true
    });
    if (remoteLease.status === 'same_domain_ip' || remoteLease.status === 'remote_cluster_node') {
      clearSessionConflictState(sessionId);
      return;
    }
    if (remoteLease.status === 'different_ip') {
      const lockedUntil = Date.now() + CONFLICT_COOLDOWN_MS;
      sessionConflictStates.set(sessionId, {
        count: MAX_AUTO_CONFLICT_RETRIES + 1,
        cooldownUntil: lockedUntil,
        lastConflictAt: Date.now(),
        reason: 'external_conflict'
      });
      return;
    }

    console.log(
      `[Baileys Transient 440 Recovery] Tidak ada lease server lain yang aktif untuk ${sessionId}; mencoba menyambung ulang dengan aman...`
    );
    clearSessionConflictState(sessionId);
    getOrStartBaileysSession(sessionId, cleanPhone || dbMeta?.phone_number, verifiedOwner!.id, {
      isAutoReconnect: true
    }).catch(() => {});
  }, Math.max(5_000, delayMs + 500));

  timer.unref?.();
  transient440Timers.set(sessionId, timer);
}

export function isBaileysRestoreInFlight(): boolean {
  return isRestoringSessions;
}

export function computePersistentReconnectDelay(retryCount: number, statusCode?: number): number {
  if (isRestartRequiredCode(statusCode)) {
    return 350;
  }
  if (isConnectionReplacedCode(statusCode)) {
    if (retryCount <= 1) return 5000 + crypto.randomInt(0, 2000);
    if (retryCount === 2) return 11000 + crypto.randomInt(0, 3000);
    return 20000 + crypto.randomInt(0, 5000);
  }
  const exp = Math.min(5, Math.max(0, retryCount - 1));
  return Math.min(15000, Math.round(2000 * Math.pow(1.45, exp)));
}

function isRecoverableProtocolCode(statusCode?: number): boolean {
  return (
    statusCode === DisconnectReason.badSession ||
    statusCode === DisconnectReason.multideviceMismatch ||
    statusCode === 405 ||
    statusCode === 411 ||
    statusCode === 500
  );
}

function extractBareJidUserDigits(jid?: string | null): string {
  if (!jid) return '';
  return String(jid).trim().replace(/@.*/, '').split(':')[0].replace(/\D/g, '');
}

function readCredsSummary(sessionId: string): { registered: boolean; phone: string; lid: string } {
  const mem = activeSessions.get(sessionId);
  const memPhone = normalizePhoneNumber(
    mem?.phoneNumber ||
      (mem?.socket?.user?.id ? String(mem.socket.user.id).split('@')[0].split(':')[0] : '') ||
      (mem?.socket?.authState?.creds?.me?.id ? String(mem.socket.authState.creds.me.id).split('@')[0].split(':')[0] : '') ||
      ''
  );
  const memLid = extractBareJidUserDigits(
    mem?.socket?.user?.lid || mem?.socket?.authState?.creds?.me?.lid || ''
  );
  const memRegistered = Boolean(
    mem &&
      (mem.status === 'connected' ||
        mem.socket?.authState?.creds?.registered ||
        mem.socket?.user?.id)
  );

  try {
    const folder = safeSessionFolderPath(sessionId);
    if (!folder) return { registered: memRegistered, phone: memPhone, lid: memLid };
    const credsPath = path.join(folder, 'creds.json');
    if (!fs.existsSync(credsPath)) return { registered: memRegistered, phone: memPhone, lid: memLid };
    const raw = fs.readFileSync(credsPath, 'utf-8');
    if (!raw || !raw.trim()) {
      return { registered: memRegistered, phone: memPhone, lid: memLid };
    }
    const parsed = JSON.parse(raw);
    const meId = parsed?.me?.id ? String(parsed.me.id) : '';
    const meLid = parsed?.me?.lid ? extractBareJidUserDigits(String(parsed.me.lid)) : '';
    return {
      registered: Boolean(parsed && (parsed.registered || meId)) || memRegistered,
      phone: (meId ? normalizePhoneNumber(meId.split('@')[0].split(':')[0]) : '') || memPhone,
      lid: meLid || memLid
    };
  } catch {
    return { registered: memRegistered, phone: memPhone, lid: memLid };
  }
}

function getCredsPhoneOnDisk(sessionId: string): string {
  return readCredsSummary(sessionId).phone;
}

function resolveActiveVerifiedOwner(sessionId: string, candidateUserId?: string, candidatePhone?: string) {
  const db = initDbFile();
  const cleanPhone = normalizePhoneNumber(candidatePhone || '');

  if (candidateUserId) {
    const u = getUserById(candidateUserId);
    if (u) return u;
  }

  const dbSess = getSessionById(sessionId);
  if (dbSess?.user_id) {
    const u = getUserById(dbSess.user_id);
    if (u) return u;
  }

  const extractedId = extractUserIdFromSessionId(sessionId, db.users);
  if (extractedId) {
    const u = getUserById(extractedId);
    if (u) return u;
  }

  if (cleanPhone && cleanPhone.length >= 8) {
    const matchedSessionOwner = db.sessions.find(
      s => s.user_id && s.phone_number && normalizePhoneNumber(s.phone_number) === cleanPhone
    );
    if (matchedSessionOwner?.user_id) {
      const u = getUserById(matchedSessionOwner.user_id);
      if (u) return u;
    }

    const matchedU = db.users.find(
      u => u.phone && normalizePhoneNumber(u.phone) === cleanPhone
    );
    if (matchedU) return matchedU;
  }

  return null;
}

function isOwnerActiveAndRegistered(owner: ReturnType<typeof getUserById>): boolean {
  return Boolean(owner && owner.is_active && owner.email_verified);
}

async function flushAuthFolderBackupNow(sessionId: string): Promise<void> {
  if (!sessionId || !isMysqlConfigured()) return;
  const folder = safeSessionFolderPath(sessionId);
  if (!folder) return;
  try {
    if (!hasRegisteredCredsOnDisk(sessionId)) return;
    const dirEntries = await fs.promises.readdir(folder, { withFileTypes: true }).catch(() => null);
    if (!dirEntries) return;
    const files = dirEntries
      .filter(d => d.isFile() && !d.name.startsWith('.') && d.name.endsWith('.json'))
      .map(d => d.name)
      .sort();
    const filesMap: Record<string, string> = {};
    const hash = crypto.createHash('sha256');
    for (const file of files) {
      const fp = path.join(folder, file);
      const content = await fs.promises.readFile(fp, 'utf-8');
      filesMap[file] = content;
      hash.update(file).update('\0').update(content).update('\0');
    }
    if (!filesMap['creds.json']) return;
    const digest = hash.digest('hex');
    if (lastAuthBackupHashes.get(sessionId) === digest) {
      return;
    }
    await saveBaileysAuthToMysql(sessionId, filesMap);
    lastAuthBackupHashes.set(sessionId, digest);
    lastAuthBackupAt.set(sessionId, Date.now());
  } catch {
    // Non-blocking backup
  }
}

function scheduleAuthFolderBackup(sessionId: string, immediate = false) {
  if (!sessionId || !isMysqlConfigured()) return;
  const folder = safeSessionFolderPath(sessionId);
  if (!folder) return;

  const prev = authBackupTimers.get(sessionId);
  if (prev) clearTimeout(prev);

  if (immediate) {
    void flushAuthFolderBackupNow(sessionId);
    return;
  }

  const lastAt = lastAuthBackupAt.get(sessionId) || 0;
  const waitMs = Math.max(AUTH_BACKUP_DEBOUNCE_MS, lastAt + AUTH_BACKUP_COOLDOWN_MS - Date.now());

  const timer = setTimeout(() => {
    authBackupTimers.delete(sessionId);
    void flushAuthFolderBackupNow(sessionId);
  }, waitMs);
  timer.unref?.();

  authBackupTimers.set(sessionId, timer);
}

async function hydrateSessionAuthFolderFromMysql(sessionId: string): Promise<boolean> {
  const folder = safeSessionFolderPath(sessionId);
  if (!folder) return false;
  if (hasRegisteredCredsOnDisk(sessionId)) return true;

  try {
    const filesMap = await loadBaileysAuthFromMysql(sessionId);
    if (!filesMap || !filesMap['creds.json']) return false;

    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
    }
    for (const [filename, content] of Object.entries(filesMap)) {
      const base = path.basename(filename);
      if (base === filename && base.endsWith('.json') && typeof content === 'string') {
        fs.writeFileSync(path.join(folder, base), content, { encoding: 'utf-8', mode: 0o600 });
      }
    }
    return hasRegisteredCredsOnDisk(sessionId);
  } catch {
    return false;
  }
}

// Clean session auth directory safely (with path traversal guard)
export function cleanSessionFolder(folderName: string) {
  const targetFolder = safeSessionFolderPath(folderName);
  if (!targetFolder) return;
  try {
    if (fs.existsSync(targetFolder)) {
      fs.rmSync(targetFolder, { recursive: true, force: true });
      console.log(`[Baileys] Auth folder deleted: ${targetFolder}`);
    }
  } catch (err) {
    console.error(`[Baileys] Error cleaning session folder ${folderName}:`, err);
  }
}

// Helper to attach Auto-Reply, Anti-Ban, Centang Biru, and Quota Deductions to Baileys socket
const commandState = new Map<string, { step: string; data?: any; updatedAt: number }>();
const COMMAND_STATE_TTL_MS = 15 * 60 * 1000;
const processedMessageIds = new Set<string>();
const incomingChatQueues = new Map<string, Promise<void>>();

function enqueueIncomingChatTask(chatKey: string, task: () => Promise<void>): void {
  const prev = incomingChatQueues.get(chatKey) || Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(task)
    .catch(err => {
      console.error(`[Baileys Incoming Queue Error:${chatKey}]`, err);
    })
    .finally(() => {
      if (incomingChatQueues.get(chatKey) === next) {
        incomingChatQueues.delete(chatKey);
      }
    });
  incomingChatQueues.set(chatKey, next);
}

function cleanupExpiredCommandStates(now = Date.now()) {
  if (commandState.size === 0) return;
  for (const [key, entry] of commandState.entries()) {
    if (!entry.updatedAt || now - entry.updatedAt > COMMAND_STATE_TTL_MS) {
      commandState.delete(key);
    }
  }
}

function rememberProcessedMsgId(id?: string | null) {
  if (!id) return;
  processedMessageIds.add(id);
  if (processedMessageIds.size > 500) {
    const first = processedMessageIds.values().next().value;
    if (first) processedMessageIds.delete(first);
  }
}

export function resolveIncomingSenderIdentity(
  sock: any,
  msg: any,
  remoteJid: string
): {
  senderPhone: string;
  cleanSender: string;
  rawRemoteDigits: string;
  isLidThread: boolean;
  fallbackPnJid: string | null;
} {
  const isLidThread = remoteJid.endsWith('@lid') || remoteJid.endsWith('@hosted.lid');
  const rawRemoteDigits = extractBareJidUserDigits(remoteJid);

  let pnJid: string | null = null;
  if (
    !isLidThread &&
    (remoteJid.endsWith('@s.whatsapp.net') || remoteJid.endsWith('@c.us') || remoteJid.endsWith('@hosted'))
  ) {
    // When thread JID is already a PN JID, always keep it as chat peer identity so sender-side remoteJidAlt/participant never overwrites it
    pnJid = remoteJid;
  } else {
    const altCandidates = [
      msg?.key?.remoteJidAlt,
      msg?.key?.participantAlt,
      msg?.key?.participant
    ].filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
    pnJid =
      altCandidates.find(
        j => j.endsWith('@s.whatsapp.net') || j.endsWith('@c.us') || j.endsWith('@hosted')
      ) || null;
  }

  // Fallback synchronous cache / lidMapping lookup if Baileys exposes it synchronously or as value
  if (!pnJid && isLidThread && sock?.signalRepository?.lidMapping?.getPNForLID) {
    // Resolved asynchronously when available in caller
  }

  const resolvedPhoneRaw = pnJid
    ? pnJid.replace(/@.*/, '').split(':')[0]
    : remoteJid.replace(/@.*/, '').split(':')[0];
  const senderPhone = normalizePhoneNumber(resolvedPhoneRaw) || resolvedPhoneRaw.replace(/\D/g, '') || resolvedPhoneRaw;
  const cleanSender = senderPhone.replace(/\D/g, '');
  const fallbackPnJid =
    cleanSender.length >= 8 && (!isLidThread || Boolean(pnJid))
      ? `${cleanSender}@s.whatsapp.net`
      : pnJid && pnJid.endsWith('@s.whatsapp.net')
        ? pnJid
        : null;

  return {
    senderPhone,
    cleanSender,
    rawRemoteDigits,
    isLidThread,
    fallbackPnJid
  };
}

/**
 * Reliable, non-duplicating send wrapper that watches WhatsApp server message ACK (`CB:ack`).
 * If WhatsApp server already acknowledged `msgId` while Baileys is still finishing background
 * key-store commit / privacy-token IQs, resolves immediately instead of falsely throwing a timeout
 * or re-sending a duplicate message.
 */
export async function sendSocketMessageWithAckGuard(
  sock: any,
  jid: string,
  content: any,
  options?: {
    timeoutMs?: number;
    fallbackJid?: string | null;
    sessionData?: SessionState | null;
    sendOptions?: Record<string, any>;
  }
): Promise<any> {
  if (!sock || !isSocketTrulyOpen(sock)) {
    throw new Error('Koneksi WebSocket WhatsApp sedang tertutup atau terputus.');
  }

  const cleanTargetJidGuard = String(jid || '').trim();
  const inspectOutgoingText = String(
    content?.text || content?.caption || content?.extendedTextMessage?.text || ''
  ).trim();
  if (
    inspectOutgoingText &&
    !isMetaAiJid(cleanTargetJidGuard) &&
    !cleanTargetJidGuard.endsWith('@bot') &&
    isInternalPromptLeakText(inspectOutgoingText)
  ) {
    recordAiAuditEvent({
      level: 'ERROR',
      stage: 'prompt_leak_firewall',
      session_id: options?.sessionData?.sessionId,
      senderPhone: cleanTargetJidGuard,
      error_code: 'OUTGOING_PROMPT_LEAK_BLOCKED',
      reason: 'Memblokir pengiriman prompt/konteks internal AI keluar ke WhatsApp pelanggan.'
    });
    throw new Error('Diblokir oleh Prompt Leak Firewall: teks mengandung prompt internal AI.');
  }

  const timeoutMs = Math.max(8000, options?.timeoutMs ?? 24000);
  const myJid = sock?.authState?.creds?.me?.id || sock?.user?.id || '';
  const msgId =
    (options?.sendOptions?.messageId as string | undefined) ||
    generateMessageIDV2(myJid);

  const attemptSendToJid = async (targetJid: string, useMsgId: string) => {
    const ws = sock?.ws;
    let ackSuccess = false;
    let ackError: string | null = null;
    let resolveAckEarly!: () => void;
    const ackEarlyPromise = new Promise<void>(resolve => {
      resolveAckEarly = resolve;
    });

    const onAck = (ackNode: any) => {
      try {
        const id = String(ackNode?.attrs?.id || '').trim();
        if (!id || id !== useMsgId) return;
        const errCode = ackNode?.attrs?.error ? String(ackNode.attrs.error).trim() : '';
        if (errCode) {
          ackError = errCode;
        } else {
          ackSuccess = true;
          if (options?.sessionData) {
            options.sessionData.lastUpdated = Date.now();
          }
        }
        resolveAckEarly();
      } catch {
        // Ignore ACK parser errors
      }
    };

    if (ws && typeof ws.on === 'function') {
      ws.on('CB:ack,class:message', onAck);
      ws.on('CB:ack', onAck);
    }

    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    try {
      recordBotSentMessageId(useMsgId);
      const sendPromise = sock.sendMessage(targetJid, content, {
        ...(options?.sendOptions || {}),
        messageId: useMsgId
      });

      // Avoid unhandled rejection if ackEarlyPromise wins first
      sendPromise.catch(() => {});

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutTimer = setTimeout(() => {
          reject(
            new Error(
              `Batas waktu pengiriman ke nomor tujuan habis (Timeout ${Math.round(timeoutMs / 1000)}d)`
            )
          );
        }, timeoutMs);
      });

      const ackWinPromise = ackEarlyPromise.then(async () => {
        if (ackError) {
          throw new Error(`Server WhatsApp menolak pesan (ACK error ${ackError}).`);
        }
        // Give Baileys up to 350ms to finish local commitWithRetry cleanly before returning early
        const finished = await Promise.race([
          sendPromise.then((res: any) => ({ done: true, res })).catch(() => ({ done: false, res: null })),
          delay(350).then(() => ({ done: false, res: null }))
        ]);
        return (
          finished.res || {
            key: { id: useMsgId, remoteJid: targetJid, fromMe: true },
            messageTimestamp: Math.floor(Date.now() / 1000),
            ackConfirmedEarly: true
          }
        );
      });

      const res = await Promise.race([sendPromise, ackWinPromise, timeoutPromise]);
      if (options?.sessionData) {
        options.sessionData.lastUpdated = Date.now();
      }
      return res;
    } catch (err: any) {
      if (ackSuccess && !ackError) {
        return {
          key: { id: useMsgId, remoteJid: targetJid, fromMe: true },
          messageTimestamp: Math.floor(Date.now() / 1000),
          ackConfirmedEarly: true
        };
      }
      throw err;
    } finally {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (ws && typeof ws.off === 'function') {
        ws.off('CB:ack,class:message', onAck);
        ws.off('CB:ack', onAck);
      } else if (ws && typeof ws.removeListener === 'function') {
        ws.removeListener('CB:ack,class:message', onAck);
        ws.removeListener('CB:ack', onAck);
      }
    }
  };

  try {
    return await attemptSendToJid(jid, msgId);
  } catch (err: any) {
    const altJid = options?.fallbackJid;
    if (altJid && altJid !== jid && isSocketTrulyOpen(sock)) {
      const retryId = generateMessageIDV2(myJid);
      return await attemptSendToJid(altJid, retryId);
    }
    throw err;
  }
}

// Parse /send and /broadcast arguments in flexible single or multi-recipient formats:
// 1) /send 08123456789 Halo kak
// 2) /broadcast 08123456789, 08198765432, 08571234567 Halo kak promo spesial!
// 3) Multiline phone list followed by shared message
// 4) Multiline where each line has <nomor> <pesan>
export function parseSendOrBroadcastTasks(rawArgs: string): Array<{ targetPhone: string; messageToSend: string }> {
  const cleanedInput = rawArgs.replace(/^\/(?:send|broadcast|kirim|kirimpesan)\b\s*/i, '').trim();
  if (!cleanedInput) return [];

  // Check if input has multiple lines where EACH line is a distinct "<phone> <message>" task
  const nonEmptyLines = cleanedInput
    .split(/\r?\n/)
    .map(l => l.replace(/^\/(?:send|broadcast|kirim|kirimpesan)\b\s*/i, '').trim())
    .filter(Boolean);

  if (nonEmptyLines.length > 1) {
    const perLineTasks: Array<{ targetPhone: string; messageToSend: string }> = [];
    let allLinesHaveOwnMsg = true;

    for (const line of nonEmptyLines) {
      const m = line.match(/^(\+?[0-9][0-9\-()]{7,15})\s*[:|\-]?\s+(.+)$/);
      if (m) {
        const digits = m[1].replace(/\D/g, '');
        const msg = m[2].trim();
        // Make sure the message part is not just another bare phone number
        const msgDigitsOnly = msg.replace(/[\s,;+\-()]/g, '');
        const looksLikePhoneList = /^[0-9]+$/.test(msgDigitsOnly) && msgDigitsOnly.length >= 8;
        if (digits.length >= 8 && digits.length <= 16 && msg && !looksLikePhoneList) {
          perLineTasks.push({ targetPhone: digits, messageToSend: msg });
        } else {
          allLinesHaveOwnMsg = false;
          break;
        }
      } else {
        allLinesHaveOwnMsg = false;
        break;
      }
    }

    if (allLinesHaveOwnMsg && perLineTasks.length > 1) {
      return perLineTasks;
    }
  }

  // 1. Key-value format: to=0812xxx,0819xxx text=Halo or to=0812xxx msg=Halo
  const kvMatch = cleanedInput.match(/^to=([^\s&]+)[,\s&]+(?:text|msg|pesan)=([\s\S]+)$/i);
  if (kvMatch) {
    const phones = kvMatch[1]
      .split(/[,;]+/)
      .map(p => p.replace(/\D/g, ''))
      .filter(p => p.length >= 8 && p.length <= 16);
    const msg = kvMatch[2].trim();
    if (phones.length > 0 && msg) {
      return Array.from(new Set(phones)).map(targetPhone => ({ targetPhone, messageToSend: msg }));
    }
  }

  // 2. Pipe format: 0812xxx, 0819xxx | Halo kak
  if (cleanedInput.includes('|')) {
    const pipeIdx = cleanedInput.indexOf('|');
    const phoneSection = cleanedInput.substring(0, pipeIdx);
    const msgPart = cleanedInput.substring(pipeIdx + 1).trim();
    const phones = phoneSection
      .split(/[\s,;]+/)
      .map(p => p.replace(/\D/g, ''))
      .filter(p => p.length >= 8 && p.length <= 16);
    if (phones.length > 0 && msgPart) {
      return Array.from(new Set(phones)).map(targetPhone => ({ targetPhone, messageToSend: msgPart }));
    }
  }

  // 3. Scan 1 or many leading phone numbers (separated by comma, semicolon, space, or newline) followed by shared message
  const phones: string[] = [];
  let pos = 0;
  while (pos < cleanedInput.length) {
    const wsMatch = cleanedInput.slice(pos).match(/^[\s,;]+/);
    if (wsMatch) pos += wsMatch[0].length;
    const tokMatch = cleanedInput.slice(pos).match(/^([^\s]+)/);
    if (!tokMatch) break;
    const token = tokMatch[1];
    const subParts = token.split(/[,;]+/).filter(Boolean);
    const isAllPhones =
      subParts.length > 0 &&
      subParts.every(sp => {
        const digits = sp.replace(/\D/g, '');
        return /^[\d+\-()]+$/.test(sp) && digits.length >= 8 && digits.length <= 16;
      });
    if (isAllPhones) {
      subParts.forEach(sp => phones.push(sp.replace(/\D/g, '')));
      pos += token.length;
    } else {
      break;
    }
  }

  if (phones.length > 0) {
    const msgPart = cleanedInput.slice(pos).replace(/^[\s:,\-|]+/, '').trim();
    if (msgPart) {
      return Array.from(new Set(phones)).map(targetPhone => ({ targetPhone, messageToSend: msgPart }));
    }
  }

  // 4. Phone number with spaces/dashes e.g. +62 812-3456-7890 Halo kak
  const flexMatch = cleanedInput.match(/^(\+?[0-9][0-9\-\s]{7,17}?)\s+([\s\S]+)$/);
  if (flexMatch) {
    const digits = flexMatch[1].replace(/\D/g, '');
    if (digits.length >= 8 && digits.length <= 16 && flexMatch[2].trim()) {
      return [{ targetPhone: digits, messageToSend: flexMatch[2].trim() }];
    }
  }

  return [];
}

function parseSendCommandArgs(rawArgs: string): { targetPhone: string; messageToSend: string } {
  const tasks = parseSendOrBroadcastTasks(rawArgs);
  if (tasks.length > 0) {
    return tasks[0];
  }
  return { targetPhone: '', messageToSend: '' };
}

// Anti-Echo Loop Breaker: tracks texts AND message IDs sent recently by the bot to prevent self-reflection loops
const recentBotOutgoingTexts = new Map<string, number>();
const recentBotSentMsgIds = new Map<string, number>();
const BOT_MSG_ID_TTL_MS = 15 * 60 * 1000;
const ownerManualReplyWatermarks = new Map<string, number>();
const sessionPeerLidPnMap = new Map<string, string>();
const sessionUpsertQueues = new Map<string, Promise<void>>();
const MAX_OWNER_MANUAL_WATERMARKS = 2000;
const MAX_SESSION_PEER_LID_PN_ENTRIES = 3000;

export function rememberSessionPeerLidPn(
  sessionId: string,
  params: { lidJidOrDigits?: string | null; pnOrJid?: string | null }
): void {
  if (!sessionId) return;
  const lidDigits = extractBareJidUserDigits(params.lidJidOrDigits);
  const pnDigits = extractBareJidUserDigits(params.pnOrJid);
  const normPn = pnDigits ? normalizePhoneNumber(pnDigits) || pnDigits : '';
  if (!lidDigits || lidDigits.length < 6 || !normPn || normPn.length < 8) return;

  sessionPeerLidPnMap.set(`${sessionId}::lid2pn:${lidDigits}`, normPn);
  sessionPeerLidPnMap.set(`${sessionId}::pn2lid:${normPn}`, `${lidDigits}@lid`);

  while (sessionPeerLidPnMap.size > MAX_SESSION_PEER_LID_PN_ENTRIES) {
    const first = sessionPeerLidPnMap.keys().next().value;
    if (!first) break;
    sessionPeerLidPnMap.delete(first);
  }
}

export function resolveLinkedPeerIdentities(
  sessionId: string,
  params: { cleanPhone?: string; remoteJid?: string }
): { normPhone: string; cleanJid: string; linkedPhone: string; linkedLidJid: string } {
  const cleanJid = String(params.remoteJid || '').trim();
  const lidDigits = cleanJid && isLidStyleJid(cleanJid) ? extractBareJidUserDigits(cleanJid) : '';
  const mappedPhoneFromLid = lidDigits
    ? sessionPeerLidPnMap.get(`${sessionId}::lid2pn:${lidDigits}`) || ''
    : '';
  const rawPhone = params.cleanPhone ? normalizePhoneNumber(params.cleanPhone) : '';
  const normPhone = (rawPhone.length >= 8 ? rawPhone : '') || mappedPhoneFromLid;
  const linkedLidJid = normPhone
    ? sessionPeerLidPnMap.get(`${sessionId}::pn2lid:${normPhone}`) || ''
    : '';
  return {
    normPhone,
    cleanJid,
    linkedPhone: mappedPhoneFromLid,
    linkedLidJid
  };
}

export function cancelPendingCustomerAutoReplies(
  sessionId: string,
  params: { cleanPhone?: string; remoteJid?: string }
): { cancelledBuffers: number; cancelledMissed: number } {
  if (!sessionId) return { cancelledBuffers: 0, cancelledMissed: 0 };
  const resolved = resolveLinkedPeerIdentities(sessionId, params);
  let cancelledBuffers = 0;
  let cancelledMissed = 0;

  const targetJids = new Set<string>(
    [resolved.cleanJid, resolved.linkedLidJid, resolved.normPhone ? `${resolved.normPhone}@s.whatsapp.net` : ''].filter(Boolean)
  );
  const targetPhones = new Set<string>(
    [resolved.normPhone, resolved.linkedPhone].filter(p => p && p.length >= 8)
  );

  for (const [bufKey, buf] of Array.from(offlineCatchupBuffers.entries())) {
    if (!bufKey.startsWith(`${sessionId}:`)) continue;
    const bufPhone = normalizePhoneNumber(buf.cleanSender || buf.senderPhone || '');
    if (
      targetJids.has(buf.remoteJid) ||
      (buf.fallbackPnJid && targetJids.has(buf.fallbackPnJid)) ||
      (bufPhone && targetPhones.has(bufPhone))
    ) {
      clearTimeout(buf.timer);
      offlineCatchupBuffers.delete(bufKey);
      cancelledBuffers++;
    }
  }

  const missedQueue = getPendingMissedMessages(sessionId);
  for (const item of missedQueue) {
    const itemPhone = normalizePhoneNumber(item.sender_phone || '');
    if (
      targetJids.has(item.remote_jid) ||
      (item.fallback_pn_jid && targetJids.has(item.fallback_pn_jid)) ||
      (itemPhone && targetPhones.has(itemPhone))
    ) {
      if (removePendingMissedMessage(item.id)) {
        cancelledMissed++;
      }
    }
  }

  return { cancelledBuffers, cancelledMissed };
}

export function recordBotSentMessageId(msgId?: string | null): void {
  const cleanId = typeof msgId === 'string' ? msgId.trim() : '';
  if (!cleanId) return;
  const now = Date.now();
  recentBotSentMsgIds.set(cleanId, now);
  if (recentBotSentMsgIds.size > 1000) {
    for (const [k, t] of recentBotSentMsgIds.entries()) {
      if (now - t > BOT_MSG_ID_TTL_MS) recentBotSentMsgIds.delete(k);
    }
    while (recentBotSentMsgIds.size > 1000) {
      const first = recentBotSentMsgIds.keys().next().value;
      if (!first) break;
      recentBotSentMsgIds.delete(first);
    }
  }
}

export function isRecentBotSentMessageId(msgId?: string | null): boolean {
  const cleanId = typeof msgId === 'string' ? msgId.trim() : '';
  if (!cleanId) return false;
  const at = recentBotSentMsgIds.get(cleanId);
  if (!at) return false;
  if (Date.now() - at > BOT_MSG_ID_TTL_MS) {
    recentBotSentMsgIds.delete(cleanId);
    return false;
  }
  return true;
}

export function recordOwnerManualReplyWatermark(
  sessionId: string,
  params: { cleanPhone?: string; remoteJid?: string; timestampMs?: number }
): void {
  if (!sessionId) return;
  const tsMs =
    typeof params.timestampMs === 'number' && Number.isFinite(params.timestampMs) && params.timestampMs > 0
      ? params.timestampMs
      : Date.now();

  const resolved = resolveLinkedPeerIdentities(sessionId, params);
  if (resolved.cleanJid && isLidStyleJid(resolved.cleanJid) && resolved.normPhone) {
    rememberSessionPeerLidPn(sessionId, {
      lidJidOrDigits: resolved.cleanJid,
      pnOrJid: resolved.normPhone
    });
  }

  if (resolved.normPhone && resolved.normPhone.length >= 8) {
    const pnKey = `${sessionId}::pn:${resolved.normPhone}`;
    if (tsMs > (ownerManualReplyWatermarks.get(pnKey) || 0)) {
      ownerManualReplyWatermarks.set(pnKey, tsMs);
    }
  }
  if (resolved.cleanJid) {
    const jidKey = `${sessionId}::jid:${resolved.cleanJid}`;
    if (tsMs > (ownerManualReplyWatermarks.get(jidKey) || 0)) {
      ownerManualReplyWatermarks.set(jidKey, tsMs);
    }
  }
  if (resolved.linkedLidJid) {
    const linkedLidKey = `${sessionId}::jid:${resolved.linkedLidJid}`;
    if (tsMs > (ownerManualReplyWatermarks.get(linkedLidKey) || 0)) {
      ownerManualReplyWatermarks.set(linkedLidKey, tsMs);
    }
  }

  cancelPendingCustomerAutoReplies(sessionId, {
    cleanPhone: resolved.normPhone || params.cleanPhone,
    remoteJid: resolved.cleanJid || params.remoteJid
  });

  if (ownerManualReplyWatermarks.size > MAX_OWNER_MANUAL_WATERMARKS) {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [k, t] of ownerManualReplyWatermarks.entries()) {
      if (t < cutoff) ownerManualReplyWatermarks.delete(k);
    }
    while (ownerManualReplyWatermarks.size > MAX_OWNER_MANUAL_WATERMARKS) {
      const first = ownerManualReplyWatermarks.keys().next().value;
      if (!first) break;
      ownerManualReplyWatermarks.delete(first);
    }
  }
}

export function hasNewerOwnerManualReply(
  sessionId: string,
  cleanPhone?: string,
  remoteJid?: string,
  incomingMsgTsMs?: number
): boolean {
  if (!sessionId || !incomingMsgTsMs || incomingMsgTsMs <= 0) return false;
  let maxOwnerTs = 0;
  const resolved = resolveLinkedPeerIdentities(sessionId, { cleanPhone, remoteJid });

  if (resolved.normPhone && resolved.normPhone.length >= 8) {
    const ts = ownerManualReplyWatermarks.get(`${sessionId}::pn:${resolved.normPhone}`) || 0;
    if (ts > maxOwnerTs) maxOwnerTs = ts;
    const dbWm = getChatReplyWatermark(sessionId, resolved.normPhone, resolved.cleanJid);
    if (dbWm > maxOwnerTs) maxOwnerTs = dbWm;
  }
  if (resolved.cleanJid) {
    const ts = ownerManualReplyWatermarks.get(`${sessionId}::jid:${resolved.cleanJid}`) || 0;
    if (ts > maxOwnerTs) maxOwnerTs = ts;
  }
  if (resolved.linkedLidJid) {
    const ts = ownerManualReplyWatermarks.get(`${sessionId}::jid:${resolved.linkedLidJid}`) || 0;
    if (ts > maxOwnerTs) maxOwnerTs = ts;
  }
  return maxOwnerTs > 0 && maxOwnerTs >= incomingMsgTsMs;
}

function recordBotOutgoing(text: string) {
  if (!text) return;
  const key = text.trim();
  recentBotOutgoingTexts.set(key, Date.now());
  if (recentBotOutgoingTexts.size > 300) {
    const now = Date.now();
    for (const [k, time] of recentBotOutgoingTexts.entries()) {
      if (now - time > 45000) recentBotOutgoingTexts.delete(k);
    }
  }
}

function isRecentBotOutgoing(text: string): boolean {
  if (!text) return false;
  const key = text.trim();
  const time = recentBotOutgoingTexts.get(key);
  if (time && (Date.now() - time < 45000)) {
    return true;
  }
  return false;
}

export function isDeviceSentEnvelope(msg: any): boolean {
  let cursor = msg?.message;
  for (let depth = 0; depth < 6 && cursor && typeof cursor === 'object'; depth++) {
    if (cursor.deviceSentMessage) return true;
    cursor =
      cursor.ephemeralMessage?.message ||
      cursor.viewOnceMessage?.message ||
      cursor.viewOnceMessageV2?.message ||
      cursor.viewOnceMessageV2Extension?.message ||
      cursor.documentWithCaptionMessage?.message ||
      cursor.editedMessage?.message ||
      cursor.protocolMessage?.editedMessage ||
      null;
  }
  return false;
}

function isLidStyleJid(jid?: string | null): boolean {
  if (!jid) return false;
  return /@(?:hosted\.)?lid$/i.test(String(jid).trim());
}

function collectSessionSelfIdentifiers(params: {
  sock?: any;
  sessionId: string;
  sessionData?: any;
  dbSession?: WhatsAppSession | null;
}): { selfPhones: Set<string>; selfLids: Set<string> } {
  const { sock, sessionId, sessionData, dbSession } = params;
  const selfPhones = new Set<string>();
  const selfLids = new Set<string>();

  const addPhoneCandidate = (raw?: string | null) => {
    const digits = extractBareJidUserDigits(raw);
    if (!digits) return;
    const norm = normalizePhoneNumber(digits) || digits;
    if (norm.length >= 8) selfPhones.add(norm);
  };

  const addLidCandidate = (raw?: string | null) => {
    const digits = extractBareJidUserDigits(raw);
    if (digits && digits.length >= 6) selfLids.add(digits);
  };

  addPhoneCandidate(sessionData?.phoneNumber);
  addPhoneCandidate(dbSession?.phone_number);
  addPhoneCandidate(sock?.user?.id);
  addPhoneCandidate(sock?.authState?.creds?.me?.id);
  addLidCandidate(sock?.user?.lid);
  addLidCandidate(sock?.authState?.creds?.me?.lid);

  const diskSummary = readCredsSummary(sessionId);
  addPhoneCandidate(diskSummary.phone);
  addLidCandidate(diskSummary.lid);

  return { selfPhones, selfLids };
}

function matchesAnySelfIdentifier(
  rawJidOrPhone: string | null | undefined,
  selfPhones: Set<string>,
  selfLids: Set<string>
): boolean {
  if (!rawJidOrPhone || typeof rawJidOrPhone !== 'string') return false;
  const trimmed = rawJidOrPhone.trim();
  if (!trimmed) return false;

  const digits = extractBareJidUserDigits(trimmed);
  if (!digits) return false;

  if (isLidStyleJid(trimmed)) {
    return selfLids.has(digits);
  }
  if (/@(?:s\.whatsapp\.net|c\.us|hosted)$/i.test(trimmed)) {
    const norm = normalizePhoneNumber(digits) || digits;
    return norm.length >= 8 && selfPhones.has(norm);
  }

  const norm = normalizePhoneNumber(digits) || digits;
  return (norm.length >= 8 && selfPhones.has(norm)) || selfLids.has(digits);
}

export function evaluateSelfOrBotMessage(params: {
  sock?: any;
  sessionId: string;
  sessionData?: any;
  dbSession?: WhatsAppSession | null;
  msg: any;
  resolvedTargetPhone?: string;
  lidMappedPeerPhone?: string;
  rawMessageText?: string;
}): {
  isFromSelfOrBot: boolean;
  isSelfChatTarget: boolean;
  isBotEcho: boolean;
  reason: string;
} {
  const {
    sock,
    sessionId,
    sessionData,
    dbSession,
    msg,
    resolvedTargetPhone,
    lidMappedPeerPhone,
    rawMessageText
  } = params;
  const msgKey = msg?.key;
  const msgId = typeof msgKey?.id === 'string' ? msgKey.id.trim() : '';

  const isBotMsgId = Boolean(msgId && isRecentBotSentMessageId(msgId));
  const isBotText = Boolean(rawMessageText && isRecentBotOutgoing(rawMessageText));
  const isBotEcho = isBotMsgId || isBotText;

  const { selfPhones, selfLids } = collectSessionSelfIdentifiers({
    sock,
    sessionId,
    sessionData,
    dbSession
  });

  const remoteJid = String(
    msgKey?.remoteJid || msg?.message?.deviceSentMessage?.destinationJid || ''
  ).trim();
  const isPeerLidThread = isLidStyleJid(remoteJid);

  // On @lid threads, msg.key.remoteJidAlt can carry sender_pn (which is owner's own PN on self-sent replies).
  // Therefore on @lid threads only trust remoteJid itself or lidMapping.getPNForLID(remoteJid) to decide if target is Note-to-Self.
  const isSelfChatTarget = Boolean(
    (remoteJid && matchesAnySelfIdentifier(remoteJid, selfPhones, selfLids)) ||
      (!isPeerLidThread &&
        resolvedTargetPhone &&
        matchesAnySelfIdentifier(resolvedTargetPhone, selfPhones, selfLids)) ||
      (lidMappedPeerPhone && matchesAnySelfIdentifier(lidMappedPeerPhone, selfPhones, selfLids))
  );

  if (isBotEcho) {
    return {
      isFromSelfOrBot: true,
      isSelfChatTarget,
      isBotEcho: true,
      reason: isBotMsgId ? 'botMsgId' : 'botTextEcho'
    };
  }

  if (msgKey?.fromMe) {
    return {
      isFromSelfOrBot: true,
      isSelfChatTarget,
      isBotEcho: false,
      reason: 'fromMe'
    };
  }

  if (isDeviceSentEnvelope(msg)) {
    return {
      isFromSelfOrBot: true,
      isSelfChatTarget,
      isBotEcho: false,
      reason: 'deviceSentMessage'
    };
  }

  const authorOrAltCandidates = [
    msgKey?.participant,
    msgKey?.participantAlt,
    msg?.participant,
    msgKey?.senderPn,
    msgKey?.senderLid,
    msgKey?.remoteJidAlt
  ];

  for (const candidate of authorOrAltCandidates) {
    if (matchesAnySelfIdentifier(candidate, selfPhones, selfLids)) {
      return {
        isFromSelfOrBot: true,
        isSelfChatTarget,
        isBotEcho: false,
        reason: 'selfAuthorOrAlt'
      };
    }
  }

  if (isSelfChatTarget) {
    return {
      isFromSelfOrBot: true,
      isSelfChatTarget: true,
      isBotEcho: false,
      reason: 'selfTarget'
    };
  }

  return {
    isFromSelfOrBot: false,
    isSelfChatTarget: false,
    isBotEcho: false,
    reason: 'external'
  };
}

const OFFLINE_CATCHUP_COALESCE_MS = 1600;
const OFFLINE_CATCHUP_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MISSED_RETRY_BACKOFF_MS = [20_000, 60_000, 180_000] as const;
const MAX_MISSED_RETRY_ATTEMPTS = 4;

interface OfflineCatchupBuffer {
  timer: ReturnType<typeof setTimeout>;
  sessionId: string;
  sock: any;
  sessionData: any;
  remoteJid: string;
  fallbackPnJid: string | null;
  senderPhone: string;
  cleanSender: string;
  senderName: string;
  msgKey: any;
  texts: string[];
  wamIds: string[];
  hasMedia: boolean;
  latestTsMs: number;
}

const offlineCatchupBuffers = new Map<string, OfflineCatchupBuffer>();
const missedCatchupLocks = new Set<string>();
const socketPingFailures = new Map<string, number>();

function extractMessageTimestampMs(msg: any): number {
  const tsVal = msg?.messageTimestamp;
  let num = 0;
  if (typeof tsVal === 'number') {
    num = tsVal;
  } else if (tsVal && typeof tsVal === 'object') {
    if (typeof tsVal.toNumber === 'function') {
      try {
        num = Number(tsVal.toNumber());
      } catch {
        num = Number(tsVal.low || 0);
      }
    } else {
      num = Number(tsVal.low || tsVal || 0);
    }
  } else if (typeof tsVal === 'string') {
    num = Number(tsVal);
  }
  if (!Number.isFinite(num) || num <= 0) {
    return Date.now();
  }
  return num > 1_000_000_000_000 ? num : num * 1000;
}

function unwrapIncomingMessageText(msg: any): {
  innerMsg: any;
  rawMessageText: string;
  hasMediaAttachment: boolean;
} {
  let innerMsg = msg?.message;
  for (let depth = 0; depth < 6 && innerMsg && typeof innerMsg === 'object'; depth++) {
    const nextLayer =
      innerMsg.deviceSentMessage?.message ||
      innerMsg.ephemeralMessage?.message ||
      innerMsg.viewOnceMessage?.message ||
      innerMsg.viewOnceMessageV2?.message ||
      innerMsg.viewOnceMessageV2Extension?.message ||
      innerMsg.documentWithCaptionMessage?.message ||
      null;
    if (!nextLayer) break;
    innerMsg = nextLayer;
  }

  const hasMediaAttachment = Boolean(
    innerMsg?.imageMessage ||
    innerMsg?.documentMessage ||
    msg?.message?.imageMessage ||
    msg?.message?.documentMessage
  );

  const rawMessageText = String(
    innerMsg?.conversation ||
    innerMsg?.extendedTextMessage?.text ||
    innerMsg?.imageMessage?.caption ||
    innerMsg?.videoMessage?.caption ||
    innerMsg?.documentMessage?.caption ||
    msg?.message?.conversation ||
    msg?.message?.extendedTextMessage?.text ||
    ''
  ).trim();

  return { innerMsg, rawMessageText, hasMediaAttachment };
}

function clearOfflineCatchupBuffersForSession(sessionId: string): void {
  const prefix = `${sessionId}:`;
  for (const [k, buf] of offlineCatchupBuffers.entries()) {
    if (k.startsWith(prefix)) {
      clearTimeout(buf.timer);
      offlineCatchupBuffers.delete(k);
    }
  }
}

export async function processIncomingCustomerMessage(params: {
  sock: any;
  sessionId: string;
  sessionData: any;
  msgKey: any;
  remoteJid: string;
  fallbackPnJid: string | null;
  senderPhone: string;
  cleanSender: string;
  senderName: string;
  messageText: string;
  rawMessageText: string;
  hasMediaAttachment: boolean;
  msgTsMs: number;
  extraWamIds?: string[];
  isCatchup?: boolean;
  isRetryFromQueue?: boolean;
}): Promise<{
  outcome: 'sent' | 'received_no_reply' | 'retryable_fail' | 'permanent_skip';
  error?: string;
}> {
  const {
    sock,
    sessionId,
    sessionData,
    msgKey,
    remoteJid,
    fallbackPnJid,
    senderPhone,
    cleanSender,
    senderName,
    messageText,
    rawMessageText,
    hasMediaAttachment,
    msgTsMs
  } = params;

  const db = initDbFile();
  const primaryWamId = String(msgKey?.id || `baileys_in_${Date.now()}`);
  const allWamIds = Array.from(
    new Set([primaryWamId, ...(params.extraWamIds || [])].filter(Boolean))
  );

  let dbSession = getSessionById(sessionId);
  if (!dbSession && sessionData?.phoneNumber) {
    const cleanSessionPhone = normalizePhoneNumber(sessionData.phoneNumber);
    dbSession =
      db.sessions.find(
        s => s.phone_number && normalizePhoneNumber(s.phone_number) === cleanSessionPhone
      ) || null;
  }

  // Defense-in-depth self/bot firewall: NEVER forward self-sent messages or bot echoes to Meta AI or auto-reply
  const pipelineSelfCheck = evaluateSelfOrBotMessage({
    sock,
    sessionId,
    sessionData,
    dbSession,
    msg: { key: { ...(msgKey || {}), id: primaryWamId, remoteJid } },
    resolvedTargetPhone: cleanSender || senderPhone,
    rawMessageText
  });
  if (pipelineSelfCheck.isFromSelfOrBot) {
    console.log(
      `[Baileys Self-Guard Blocked Pipeline] Session=${sessionId} reason=${pipelineSelfCheck.reason} target=${remoteJid}`
    );
    markIncomingMessagesHandled(allWamIds, sessionId, msgTsMs);
    return { outcome: 'permanent_skip' };
  }

  // Skip immediately if owner answered manually during queueing/coalescing
  if (hasNewerOwnerManualReply(sessionId, cleanSender, remoteJid, msgTsMs)) {
    markIncomingMessagesHandled(allWamIds, sessionId, msgTsMs);
    return { outcome: 'permanent_skip' };
  }

  // Skip immediately if owner already answered this chat manually from HP or bot replied newer
  if (params.isCatchup || params.isRetryFromQueue) {
    const watermarkTs = getChatReplyWatermark(sessionId, cleanSender, remoteJid);
    if (watermarkTs > 0 && msgTsMs <= watermarkTs) {
      markIncomingMessagesHandled(allWamIds, sessionId, msgTsMs);
      return { outcome: 'permanent_skip' };
    }
  }

  let sessionUserId = dbSession?.user_id || sessionData?.userId;
  if (!sessionUserId && sessionData?.phoneNumber) {
    const cleanPhone = normalizePhoneNumber(sessionData.phoneNumber);
    const matchedUser = db.users.find(
      u => u.phone && normalizePhoneNumber(u.phone) === cleanPhone
    );
    if (matchedUser) sessionUserId = matchedUser.id;
  }
  if (!sessionUserId) {
    sessionUserId = extractUserIdFromSessionId(sessionId, db.users);
  }

  if (dbSession && sessionUserId && !dbSession.user_id) {
    dbSession.user_id = sessionUserId;
    updateSession(dbSession.id, { user_id: sessionUserId });
  }

  const sessionUser = sessionUserId ? getUserById(sessionUserId) : null;
  if (!isOwnerActiveAndRegistered(sessionUser)) {
    console.warn(
      `[Baileys Security] Session ${sessionId} has no active registered user. Purging session.`
    );
    if (!params.isRetryFromQueue) {
      purgeBaileysSessionCompletely(sessionId, sessionData?.phoneNumber || undefined).catch(() => {});
    }
    return { outcome: 'permanent_skip' };
  }

  const autoReplyStatus = getUserAutoReplyStatus(sessionUser);
  if (!autoReplyStatus.allowed) {
    const gateReason = autoReplyStatus.reason || 'Respon pesan otomatis sedang nonaktif.';
    recordAiAuditEvent({
      level: 'WARN',
      stage: 'auto_reply_gate',
      session_id: sessionId,
      user_id: sessionUser!.id,
      senderPhone,
      error_code: autoReplyStatus.expired ? 'FREE_TRIAL_EXPIRED' : 'AUTO_REPLY_DISABLED',
      reason: gateReason
    });
    if (!params.isRetryFromQueue) {
      addMessageLog({
        wam_id: primaryWamId,
        user_id: sessionUser!.id,
        session_id: sessionId,
        sender_phone: senderPhone,
        sender_name: senderName,
        message_body: messageText,
        direction: 'incoming',
        status: 'Diterima',
        reply_body: gateReason,
        error_detail: `[Auto-Reply Nonaktif] ${gateReason}`,
        ai_generated: false
      });
    }
    markIncomingMessagesHandled(allWamIds, sessionId, msgTsMs);
    return { outcome: 'permanent_skip' };
  }

  if (sessionUser) {
    const dailyGate = canUseDailyQuota(sessionUser.id);
    if (!dailyGate.allowed) {
      const quotaMsg = dailyGate.message || 'Kuota chat harian/bulanan Anda telah habis.';
      recordAiAuditEvent({
        level: 'WARN',
        stage: 'quota_gate',
        session_id: sessionId,
        user_id: sessionUser.id,
        senderPhone,
        error_code: 'DAILY_CHAT_QUOTA_EXCEEDED',
        reason: quotaMsg
      });
      if (!params.isRetryFromQueue) {
        addMessageLog({
          wam_id: primaryWamId,
          user_id: sessionUser.id,
          session_id: sessionId,
          sender_phone: senderPhone,
          sender_name: senderName,
          message_body: messageText,
          direction: 'incoming',
          status: 'Diterima',
          reply_body: quotaMsg,
          error_detail: `[Batas Chat Harian Habis] ${quotaMsg}`,
          ai_generated: false
        });
      }
      markIncomingMessagesHandled(allWamIds, sessionId, msgTsMs);
      return { outcome: 'permanent_skip' };
    }
  }

  const antiBan = getAntiBanSettings();
  let replyText = '';
  let isAi = false;
  let aiDiagnosticReason: string | undefined;
  let aiRetryableFail = false;
  let sendQrisImage = false;
  let qrisImageUrl: string | undefined;
  let qrisPublicUrl: string | undefined;
  let orderPaidVerified = false;
  let currentOrderFlow: ReturnType<typeof prepareOrderFlowForIncomingMessage> | null = null;
  let currentActiveCatalog: ReturnType<typeof getActiveCatalogForAi> | null = null;

  const resolvedOwnerId = sessionUser?.id || sessionUserId;
  const scopeId = resolvedOwnerId || sessionId;

  const sysConfig = getSystemConfig();
  const effectiveAi = resolveEffectiveSessionAiSettings({
    user: sessionUser,
    session: dbSession,
    sysConfig
  });
  const userPersonalPrompt = effectiveAi.systemPrompt;
  const canUseAi = effectiveAi.aiEnabled;

  const activeCatalog = getActiveCatalogForAi(resolvedOwnerId);
  currentActiveCatalog = activeCatalog;
  const orderFlow = prepareOrderFlowForIncomingMessage({
    scopeId,
    senderPhone,
    messageText,
    catalog: activeCatalog,
    hasMediaAttachment
  });
  currentOrderFlow = orderFlow;
  const priorHistory = orderFlow.context.history.slice(-6).map(h => ({ role: h.role, text: h.text }));
  if (!params.isRetryFromQueue) {
    recordCustomerTurn(scopeId, senderPhone, 'customer', messageText);
  }

  const isCsEnabled = sessionUser
    ? sessionUser.role === 'admin'
      ? sessionUser.default_cs_reply_enabled !== false
      : sessionUser.default_cs_reply_enabled === true
    : true;

  if (orderFlow.directReply) {
    replyText = orderFlow.directReply.text;
    sendQrisImage = orderFlow.directReply.sendQrisImage;
    qrisImageUrl = orderFlow.directReply.qrisImageUrl;
    qrisPublicUrl = orderFlow.directReply.qrisPublicUrl;
    isAi = false;
    console.log(
      `[Baileys Order System] Fast-path "${orderFlow.directReply.reason}" untuk ${orderFlow.context.customerCode} (QRIS=${sendQrisImage})`
    );
  } else {
    const aiQuotaCheck: ReturnType<typeof canUseAiQuota> = sessionUser
      ? canUseAiQuota(sessionUser.id)
      : {
          allowed: true,
          remainingDaily: 999999,
          dailyLimit: 999999,
          remainingMonthly: 999999,
          monthlyLimit: 999999
        };

    if (canUseAi && aiQuotaCheck.allowed) {
      try {
        console.log(
          `[Baileys Meta AI${params.isCatchup ? ' Catch-Up' : ''}] Forwarding ${orderFlow.context.customerCode} via session ${sessionId} (catalog=${activeCatalog.enabled ? `${activeCatalog.products.length} produk` : 'off'})...`
        );
        const aiRes = await askMetaAiViaBaileys({
          userId: resolvedOwnerId,
          sessionId,
          senderPhone,
          senderName,
          messageBody: messageText,
          customSystemPrompt: userPersonalPrompt,
          catalogShopName: activeCatalog.shopName,
          catalogProducts: activeCatalog.enabled ? activeCatalog.products : undefined,
          customerCode: orderFlow.context.customerCode,
          customerHistory: priorHistory,
          orderSummary: orderFlow.orderSummaryForPrompt || undefined,
          paymentSummary: orderFlow.paymentSummaryForPrompt || undefined
        });
        if (aiRes.usedAi && aiRes.replyText) {
          const directive = parseAndHandleAiPaymentDirectives(aiRes.replyText, activeCatalog, {
            customerContext: orderFlow.context,
            isPaymentSubmission: orderFlow.isPaymentSubmission
          });
          replyText = directive.cleanText;
          sendQrisImage = directive.sendQrisImage;
          qrisImageUrl = directive.qrisImageUrl;
          qrisPublicUrl = directive.qrisPublicUrl;
          orderPaidVerified = directive.orderPaidVerified;
          isAi = true;
          if (
            sessionUser &&
            sessionData?.phoneNumber &&
            !isPhoneMetaAiVerifiedForUser(sessionUser, sessionData.phoneNumber)
          ) {
            markUserMetaAiVerified(sessionUser.id, sessionData.phoneNumber);
          }
        } else if (aiRes.errorReason) {
          aiDiagnosticReason = `[Meta AI] ${aiRes.errorReason}`;
          aiRetryableFail = aiRes.retryable !== false;
          console.log(`[Baileys Meta AI Fallback] ${aiRes.errorReason}`);
        }
      } catch (aiErr: any) {
        const msgErr = aiErr?.message || 'Error internal saat memanggil Meta AI.';
        aiDiagnosticReason = `[Meta AI Exception] ${msgErr}`;
        aiRetryableFail = true;
        recordAiAuditEvent({
          level: 'ERROR',
          stage: 'meta_ai_reply',
          session_id: sessionId,
          user_id: resolvedOwnerId,
          customer_code: orderFlow.context.customerCode,
          senderPhone,
          error_code: 'BAILEYS_AI_EXCEPTION',
          reason: msgErr
        });
        console.error('[Baileys Meta AI Reply Error]', aiErr);
      }
    } else if (!canUseAi) {
      const disabledReason =
        dbSession?.ai_enabled === false
          ? 'Sakelar Meta AI pada perangkat WhatsApp ini sedang nonaktif.'
          : sessionUser?.role === 'admin'
            ? 'Sakelar Meta AI pada pengaturan sistem sedang nonaktif.'
            : 'Sakelar Meta AI pada akun pengguna sedang nonaktif.';
      aiDiagnosticReason = `[Meta AI Nonaktif] ${disabledReason}`;
      recordAiAuditEvent({
        level: 'WARN',
        stage: 'ai_gate',
        session_id: sessionId,
        user_id: resolvedOwnerId,
        customer_code: orderFlow.context.customerCode,
        senderPhone,
        error_code: 'AI_DISABLED',
        reason: disabledReason
      });
    } else if (canUseAi && !aiQuotaCheck.allowed) {
      const quotaReason = aiQuotaCheck.message || 'Kuota balasan Meta AI harian/bulanan habis.';
      aiDiagnosticReason = `[Kuota AI Habis] ${quotaReason}`;
      recordAiAuditEvent({
        level: 'WARN',
        stage: 'quota_gate',
        session_id: sessionId,
        user_id: resolvedOwnerId,
        customer_code: orderFlow.context.customerCode,
        senderPhone,
        error_code: 'AI_QUOTA_EXCEEDED',
        reason: quotaReason
      });
      console.log(
        `[Baileys Meta AI Quota] User ${sessionUser?.username} kuota AI habis (${aiQuotaCheck.message}). Beralih ke pesan offline.`
      );
    }

    if (!replyText && orderFlow.context.cart.length > 0) {
      const deterministicOrderReply = buildDeterministicOrderFallbackReply({
        context: orderFlow.context,
        catalog: activeCatalog,
        messageText,
        isPaymentSubmission: orderFlow.isPaymentSubmission
      });
      if (deterministicOrderReply) {
        replyText = deterministicOrderReply;
      }
    }

    // Requeue for persistent Meta AI recovery instead of dropping/substituting offline CS reply
    // when socket dropped or catch-up retry failed transiently
    const shouldQueueMetaRetry =
      !replyText &&
      aiRetryableFail &&
      (!isSocketTrulyOpen(sock) || params.isCatchup || params.isRetryFromQueue || !isCsEnabled);

    if (shouldQueueMetaRetry) {
      if (!params.isRetryFromQueue) {
        upsertPendingMissedMessage({
          wam_id: primaryWamId,
          extra_wam_ids: params.extraWamIds,
          session_id: sessionId,
          user_id: resolvedOwnerId,
          sender_phone: senderPhone,
          sender_name: senderName,
          remote_jid: remoteJid,
          fallback_pn_jid: fallbackPnJid || undefined,
          message_body: messageText,
          has_media: hasMediaAttachment,
          message_ts_ms: msgTsMs,
          last_error: aiDiagnosticReason,
          nextRetryDelayMs: MISSED_RETRY_BACKOFF_MS[0]
        });
        addMessageLog({
          wam_id: primaryWamId,
          session_id: dbSession?.id || sessionId,
          user_id: sessionUserId,
          sender_phone: senderPhone,
          sender_name: senderName,
          message_body: messageText,
          direction: 'incoming',
          status: 'Gagal',
          error_detail: aiDiagnosticReason,
          ai_generated: false
        });
      }
      return {
        outcome: 'retryable_fail',
        error: aiDiagnosticReason || 'Meta AI gagal merespons sementara'
      };
    }

    // Send user's default CS reply fallback only when explicitly enabled
    if (!replyText && isCsEnabled) {
      const customOfflineMsg =
        sessionUser?.default_cs_reply_text ||
        sessionUser?.custom_offline_message ||
        sysConfig.ai_config.offline_fallback_message ||
        'Halo *{nama}*, terima kasih telah menghubungi kami. Tim Customer Service kami akan segera membalas pesan Anda sesegera mungkin.';
      replyText = customOfflineMsg
        .replace(/\{nama\}/gi, senderName)
        .replace(/\{pesan\}/gi, messageText);
    }
  }

  // Zero-Tolerance Prompt Leak Firewall: NEVER allow internal AI context/prompts to reach customer WhatsApp chats
  if (replyText && isInternalPromptLeakText(replyText)) {
    recordAiAuditEvent({
      level: 'ERROR',
      stage: 'prompt_leak_firewall',
      session_id: sessionId,
      user_id: resolvedOwnerId,
      customer_code: currentOrderFlow?.context.customerCode,
      senderPhone,
      error_code: 'PIPELINE_PROMPT_LEAK_BLOCKED',
      reason: 'Terdeteksi teks prompt/konteks internal AI pada balasan keluar; diblokir sebelum dikirim ke pelanggan.'
    });
    console.warn(`[Prompt Leak Firewall] Memblokir pengiriman balasan terindikasi prompt internal ke ${senderPhone}.`);
    replyText = '';
    isAi = false;
    aiRetryableFail = true;
    aiDiagnosticReason =
      '[Prompt Leak Firewall] Balasan AI terdeteksi sebagai echo prompt internal dan diblokir sebelum dikirim.';
  }

  let sendSucceeded = false;
  let sendErrorDetail: string | undefined;
  let sendDroppedSocket = false;
  const replyTargetJid = remoteJid;

  const resolveLiveSessionSocketForReply = async (
    waitForReconnect = true
  ): Promise<{ sock: any | null; sessionData: SessionState | null }> => {
    if (sessionData?.superseded) {
      return { sock: null, sessionData: null };
    }
    const current = activeSessions.get(sessionId);
    if (current?.socket && isSocketTrulyOpen(current.socket)) {
      return { sock: current.socket, sessionData: current };
    }
    if (sock && isSocketTrulyOpen(sock) && (!current || current.socket === sock)) {
      return { sock, sessionData: current || sessionData };
    }

    if (waitForReconnect && !isSessionInConflictCooldown(sessionId)) {
      const isReconnecting = () =>
        reconnectTimers.has(sessionId) ||
        sessionStartLocks.has(sessionId) ||
        activeSessions.get(sessionId)?.status === 'connecting';

      if (!isReconnecting() && !params.isRetryFromQueue) {
        const dbSessNow = getSessionById(sessionId);
        const cleanSessPhone = normalizePhoneNumber(
          dbSessNow?.phone_number || getCredsPhoneOnDisk(sessionId) || ''
        );
        const hasSiblingSocket = Boolean(
          cleanSessPhone &&
            hasOtherActiveOrConnectingSocketForPhone(sessionId, cleanSessPhone, resolvedOwnerId)
        );
        if (dbSessNow?.status === 'connected' && hasRegisteredCredsOnDisk(sessionId) && !hasSiblingSocket) {
          void getOrStartBaileysSession(sessionId, dbSessNow.phone_number, resolvedOwnerId).catch(() => {});
        }
      }

      const deadline = Date.now() + 3500;
      while (Date.now() < deadline && !isSessionInConflictCooldown(sessionId)) {
        const refreshed = activeSessions.get(sessionId);
        if (refreshed?.socket && isSocketTrulyOpen(refreshed.socket)) {
          return { sock: refreshed.socket, sessionData: refreshed };
        }
        if (!isReconnecting()) break;
        await delay(300);
      }
    }

    const finalCheck = activeSessions.get(sessionId);
    if (finalCheck?.socket && isSocketTrulyOpen(finalCheck.socket)) {
      return { sock: finalCheck.socket, sessionData: finalCheck };
    }
    return { sock: null, sessionData: finalCheck || sessionData };
  };

  if (replyText) {
    // Re-check owner manual reply BEFORE sending read receipts or composing presence (if owner replied while AI was processing)
    if (hasNewerOwnerManualReply(sessionId, cleanSender, remoteJid, msgTsMs)) {
      console.log(
        `[Baileys Manual-Override Suppress Pre-Presence] Pemilik sudah membalas manual ke ${senderPhone}; membatalkan read receipt, typing, dan balasan AI.`
      );
      markIncomingMessagesHandled(allWamIds, sessionId, msgTsMs);
      return { outcome: 'permanent_skip' };
    }

    const preTarget = await resolveLiveSessionSocketForReply(false);
    const preSock = preTarget.sock;
    if (
      preSock &&
      !msgKey?.fromMe &&
      antiBan.read_receipt_simulation &&
      typeof preSock?.readMessages === 'function' &&
      isSocketTrulyOpen(preSock)
    ) {
      try {
        await delay(100 + crypto.randomInt(0, 180));
        await Promise.race([
          Promise.resolve().then(() => preSock.readMessages([msgKey])),
          delay(2500)
        ]);
      } catch {
        // Non-blocking read receipt
      }
    }

    let presenceSock = preSock;
    try {
      if (antiBan.enabled) {
        const minS = Math.max(1, Math.min(3, antiBan.min_delay_seconds || 1));
        const maxS = Math.max(minS, Math.min(5, antiBan.max_delay_seconds || 3));
        const baseMs = minS * 1000;
        const spanMs = Math.max(300, (maxS - minS) * 1000);
        const lengthFactor = Math.min(1, replyText.length / 180);
        const jitterMs = crypto.randomInt(0, Math.max(200, Math.floor(spanMs * 0.4)));
        const randomDelayMs = Math.min(
          maxS * 1000,
          Math.round(baseMs + spanMs * 0.5 * lengthFactor + jitterMs)
        );

        console.log(
          `[Baileys Anti-Ban] Typing simulation & random delay (${(randomDelayMs / 1000).toFixed(1)}s) for ${senderPhone}...`
        );

        if (
          presenceSock &&
          isSocketTrulyOpen(presenceSock) &&
          antiBan.typing_simulation &&
          typeof presenceSock?.sendPresenceUpdate === 'function'
        ) {
          void Promise.race([
            Promise.resolve().then(() => presenceSock.sendPresenceUpdate('composing', replyTargetJid)),
            delay(1200)
          ]).catch(() => {});
        }

        await delay(randomDelayMs);

        const midTarget = await resolveLiveSessionSocketForReply(false);
        if (midTarget.sock) presenceSock = midTarget.sock;
        if (
          presenceSock &&
          isSocketTrulyOpen(presenceSock) &&
          antiBan.typing_simulation &&
          typeof presenceSock?.sendPresenceUpdate === 'function'
        ) {
          void Promise.race([
            Promise.resolve().then(() => presenceSock.sendPresenceUpdate('paused', replyTargetJid)),
            delay(800)
          ]).catch(() => {});
        }
      }

      const liveTarget = await resolveLiveSessionSocketForReply(true);
      let activeSock = liveTarget.sock;
      let activeSessionData = liveTarget.sessionData;
      if (activeSock) presenceSock = activeSock;

      if (!activeSock || !isSocketTrulyOpen(activeSock)) {
        sendDroppedSocket = true;
        sendErrorDetail = isSessionInConflictCooldown(sessionId)
          ? 'Koneksi WhatsApp sedang dijeda sementara karena konflik sesi ganda (440); balasan diantrekan.'
          : 'Koneksi WebSocket WhatsApp sedang tertutup atau terputus.';
        recordAiAuditEvent({
          level: 'WARN',
          stage: 'reply_send',
          session_id: sessionId,
          user_id: resolvedOwnerId,
          customer_code: currentOrderFlow?.context.customerCode,
          senderPhone,
          error_code: 'REPLY_SOCKET_UNAVAILABLE_QUEUED',
          reason: sendErrorDetail
        });
        console.warn(`[Baileys Auto-Reply Queued] To ${senderPhone}: ${sendErrorDetail}`);
      } else if (hasNewerOwnerManualReply(sessionId, cleanSender, remoteJid, msgTsMs)) {
        console.log(
          `[Baileys Manual-Override Suppress] Pemilik membalas manual ke ${senderPhone}; membatalkan pengiriman balasan AI otomatis.`
        );
        markIncomingMessagesHandled(allWamIds, sessionId, msgTsMs);
        return { outcome: 'permanent_skip' };
      } else {
        recordBotOutgoing(replyText);
        let sentQrisSuccessfully = false;
        if (sendQrisImage && (qrisImageUrl || qrisPublicUrl)) {
          const localQrisBuf = resolveLocalCatalogImageBuffer(qrisImageUrl || qrisPublicUrl);
          const imageSource: any = localQrisBuf
            ? localQrisBuf
            : qrisPublicUrl && /^https?:\/\//i.test(qrisPublicUrl)
              ? { url: qrisPublicUrl }
              : null;
          if (imageSource) {
            try {
              await sendSocketMessageWithAckGuard(
                activeSock,
                replyTargetJid,
                {
                  image: imageSource,
                  caption: replyText
                },
                { timeoutMs: 30000, fallbackJid: fallbackPnJid, sessionData: activeSessionData }
              );
              sentQrisSuccessfully = true;
              sendSucceeded = true;
              console.log(`[Baileys System QRIS Sent] To ${senderPhone} (${qrisImageUrl})`);
            } catch (qrisErr: any) {
              const qrisErrText = String(qrisErr?.message || 'Koneksi WebSocket WhatsApp sedang tertutup atau terputus.');
              const socketDroppedOnQris =
                !isSocketTrulyOpen(activeSock) || /closed|terputus|connection/i.test(qrisErrText);
              if (socketDroppedOnQris) {
                const recoveredTarget = await resolveLiveSessionSocketForReply(true);
                if (recoveredTarget.sock && isSocketTrulyOpen(recoveredTarget.sock)) {
                  activeSock = recoveredTarget.sock;
                  activeSessionData = recoveredTarget.sessionData;
                  presenceSock = activeSock;
                  console.warn('[Baileys QRIS Send Fallback to Text] Koneksi sempat pulih; melanjutkan fallback teks.', qrisErrText);
                } else {
                  sendDroppedSocket = true;
                  sendErrorDetail = qrisErrText;
                  recordAiAuditEvent({
                    level: 'WARN',
                    stage: 'reply_send',
                    session_id: sessionId,
                    user_id: resolvedOwnerId,
                    customer_code: currentOrderFlow?.context.customerCode,
                    senderPhone,
                    error_code: 'REPLY_QRIS_SOCKET_DROPPED_QUEUED',
                    reason: qrisErrText
                  });
                  console.warn(`[Baileys Auto-Reply Queued] Pengiriman QRIS ke ${senderPhone} ditunda karena koneksi WA terputus.`);
                }
              } else {
                console.warn('[Baileys QRIS Send Fallback to Text]', qrisErr);
              }
            }
          }
        }

        if (!sentQrisSuccessfully && !sendDroppedSocket) {
          if (!isSocketTrulyOpen(activeSock)) {
            const refreshedTarget = await resolveLiveSessionSocketForReply(true);
            activeSock = refreshedTarget.sock;
            activeSessionData = refreshedTarget.sessionData;
          }

          if (!activeSock || !isSocketTrulyOpen(activeSock)) {
            sendDroppedSocket = true;
            sendErrorDetail = 'Koneksi WebSocket WhatsApp sedang tertutup atau terputus.';
            recordAiAuditEvent({
              level: 'WARN',
              stage: 'reply_send',
              session_id: sessionId,
              user_id: resolvedOwnerId,
              customer_code: currentOrderFlow?.context.customerCode,
              senderPhone,
              error_code: 'REPLY_SOCKET_UNAVAILABLE_QUEUED',
              reason: sendErrorDetail
            });
            console.warn(`[Baileys Auto-Reply Queued] To ${senderPhone}: ${sendErrorDetail}`);
          } else {
            try {
              await sendSocketMessageWithAckGuard(
                activeSock,
                replyTargetJid,
                { text: replyText },
                { timeoutMs: 22000, fallbackJid: fallbackPnJid, sessionData: activeSessionData }
              );
              sendSucceeded = true;
              console.log(
                `[Baileys Auto-Reply Sent ${isAi ? '(AI)' : ''}${params.isCatchup ? ' [Catch-Up]' : ''}] To ${senderPhone}: "${replyText}"`
              );
            } catch (replySendErr: any) {
              const replyErrText = String(
                replySendErr?.message || 'Gagal mengirim balasan otomatis ke WhatsApp'
              );
              sendErrorDetail = replyErrText;
              const currentLiveMem = activeSessions.get(sessionId);
              sendDroppedSocket =
                !isSocketTrulyOpen(activeSock) ||
                !isSocketTrulyOpen(currentLiveMem?.socket) ||
                /closed|terputus|connection|timeout/i.test(replyErrText);
              const queuedOnDrop = sendDroppedSocket && !params.isRetryFromQueue;
              recordAiAuditEvent({
                level: queuedOnDrop ? 'WARN' : 'ERROR',
                stage: 'reply_send',
                session_id: sessionId,
                user_id: resolvedOwnerId,
                customer_code: currentOrderFlow?.context.customerCode,
                senderPhone,
                error_code: queuedOnDrop ? 'REPLY_SEND_QUEUED' : 'REPLY_SEND_FAILED',
                reason: replyErrText
              });
              if (queuedOnDrop) {
                console.warn(`[Baileys Auto-Reply Queued] To ${senderPhone}:`, sendErrorDetail);
              } else {
                console.error(`[Baileys Auto-Reply Send Error] To ${senderPhone}:`, sendErrorDetail);
              }
            }
          }
        }
      }
    } finally {
      if (
        !sendSucceeded &&
        presenceSock &&
        isSocketTrulyOpen(presenceSock) &&
        antiBan.enabled &&
        antiBan.typing_simulation &&
        typeof presenceSock?.sendPresenceUpdate === 'function'
      ) {
        void Promise.race([
          Promise.resolve().then(() => presenceSock.sendPresenceUpdate('paused', replyTargetJid)),
          delay(600)
        ]).catch(() => {});
      }
    }

    if (sendSucceeded) {
      recordCustomerTurn(scopeId, senderPhone, 'assistant', replyText);
      recordSessionMessageActivity(dbSession?.id || sessionId);
      markIncomingMessagesHandled(allWamIds, sessionId, msgTsMs);
      recordChatReplyWatermark(sessionId, {
        cleanPhone: cleanSender,
        remoteJid,
        timestampMs: Math.max(Date.now(), msgTsMs)
      });

      if (sessionUser) {
        const msgDeduct = deductUserDailyQuota(sessionUser.id);
        if (isAi) {
          const aiDeduct = deductUserAiQuota(sessionUser.id);
          console.log(
            `[Baileys Quota Deducted] AI User ${sessionUser.username}: Daily AI=${aiDeduct.remainingDaily}/${aiDeduct.dailyLimit}, Monthly AI=${aiDeduct.remainingMonthly}/${aiDeduct.monthlyLimit}`
          );
        } else {
          console.log(
            `[Baileys Quota Deducted] Msg User ${sessionUser.username}: Daily Msg=${msgDeduct.remaining}/${msgDeduct.dailyLimit}`
          );
        }
      }
    } else if (sendDroppedSocket) {
      if (!params.isRetryFromQueue) {
        upsertPendingMissedMessage({
          wam_id: primaryWamId,
          extra_wam_ids: params.extraWamIds,
          session_id: sessionId,
          user_id: resolvedOwnerId,
          sender_phone: senderPhone,
          sender_name: senderName,
          remote_jid: remoteJid,
          fallback_pn_jid: fallbackPnJid || undefined,
          message_body: messageText,
          has_media: hasMediaAttachment,
          message_ts_ms: msgTsMs,
          last_error: sendErrorDetail,
          nextRetryDelayMs: MISSED_RETRY_BACKOFF_MS[0]
        });
        addMessageLog({
          wam_id: primaryWamId,
          session_id: dbSession?.id || sessionId,
          user_id: sessionUserId,
          sender_phone: senderPhone,
          sender_name: senderName,
          message_body: messageText,
          direction: 'incoming',
          status: 'Gagal',
          error_detail: sendErrorDetail,
          ai_generated: isAi
        });
      }
      return { outcome: 'retryable_fail', error: sendErrorDetail };
    }
  } else if (!aiRetryableFail) {
    markIncomingMessagesHandled(allWamIds, sessionId, msgTsMs);
  }

  if (orderPaidVerified && currentOrderFlow) {
    const paidSnapshot = completeAndConsumeVerifiedPaidOrder(scopeId, senderPhone);
    if (paidSnapshot) {
      const ownerTargetPhone =
        resolveOrderNotificationRecipientPhone(resolvedOwnerId) ||
        currentActiveCatalog?.orderNotifyPhone ||
        '';
      if (ownerTargetPhone) {
        const ownerNotifyMsg = formatOwnerOrderNotificationMessage({
          snapshot: paidSnapshot,
          shopName: currentActiveCatalog?.shopName,
          customerPhone: senderPhone,
          customerName: senderName,
          customerNote: rawMessageText,
          hasMediaAttachment
        });
        await sendOrQueueViaSuperadminWa({
          recipientPhone: ownerTargetPhone,
          message: ownerNotifyMsg,
          category: 'order_notification',
          ownerUserId: resolvedOwnerId,
          invoiceNumber: paidSnapshot.invoiceNumber
        }).catch(err => console.warn('[Order Owner Notify Error]', err?.message || err));
      } else {
        console.warn(
          `[Order Owner Notify] Nomor tujuan pemilik usaha belum tersedia untuk user ${resolvedOwnerId} (Invoice ${paidSnapshot.invoiceNumber}).`
        );
      }
    }
  }

  const combinedErrorDetail =
    [aiDiagnosticReason, sendErrorDetail].filter(Boolean).join(' | ') || undefined;

  if (!params.isRetryFromQueue || sendSucceeded || !aiRetryableFail) {
    addMessageLog({
      wam_id: primaryWamId,
      session_id: dbSession?.id || sessionId,
      user_id: sessionUserId,
      sender_phone: senderPhone,
      sender_name: senderName,
      message_body: messageText,
      direction: 'incoming',
      status: replyText ? (sendSucceeded ? 'Sukses' : 'Gagal') : aiDiagnosticReason ? 'Gagal' : 'Diterima',
      reply_body: replyText || undefined,
      error_detail: combinedErrorDetail,
      ai_generated: isAi
    });
  }

  if (replyText && sendSucceeded) {
    return { outcome: 'sent' };
  }
  if (!replyText && aiRetryableFail) {
    return { outcome: 'retryable_fail', error: combinedErrorDetail };
  }
  return { outcome: 'received_no_reply', error: combinedErrorDetail };
}

export async function processPendingMissedMessagesForSession(
  sessionId: string,
  reason = 'watchdog'
): Promise<number> {
  if (!sessionId || missedCatchupLocks.has(sessionId)) return 0;
  const mem = activeSessions.get(sessionId);
  if (!mem || mem.status !== 'connected' || !isSocketTrulyOpen(mem.socket)) {
    return 0;
  }

  const owner = resolveActiveVerifiedOwner(sessionId, mem.userId, mem.phoneNumber || undefined);
  if (!isOwnerActiveAndRegistered(owner)) {
    return 0;
  }

  const queue = getPendingMissedMessages(sessionId);
  if (queue.length === 0) return 0;

  missedCatchupLocks.add(sessionId);
  let recoveredCount = 0;
  try {
    const now = Date.now();
    const batch = queue.filter(item => (item.next_retry_at || 0) <= now).slice(0, 8);
    if (batch.length > 0) {
      console.log(
        `[Baileys Missed Catch-Up:${reason}] Memeriksa ${batch.length} pesan tertunda untuk sesi ${sessionId}...`
      );
    }

    for (const item of batch) {
      const latestMem = activeSessions.get(sessionId);
      if (!latestMem || latestMem.status !== 'connected' || !isSocketTrulyOpen(latestMem.socket)) {
        break;
      }

      // Multi-tenant isolation guard
      if (item.user_id !== owner!.id) {
        removePendingMissedMessage(item.id);
        continue;
      }

      const watermarkTs = getChatReplyWatermark(sessionId, item.sender_phone, item.remote_jid);
      if (
        hasIncomingMessageBeenHandled(item.wam_id, sessionId) ||
        (watermarkTs > 0 && item.message_ts_ms <= watermarkTs)
      ) {
        markIncomingMessagesHandled([item.wam_id, ...(item.extra_wam_ids || [])], sessionId, item.message_ts_ms);
        removePendingMissedMessage(item.id);
        continue;
      }

      const res = await new Promise<{
        outcome: 'sent' | 'received_no_reply' | 'retryable_fail' | 'permanent_skip';
        error?: string;
      }>(resolve => {
        enqueueIncomingChatTask(`${sessionId}:${item.remote_jid}`, async () => {
          const outcome = await processIncomingCustomerMessage({
            sock: latestMem.socket,
            sessionId,
            sessionData: latestMem,
            msgKey: {
              id: item.wam_id,
              remoteJid: item.remote_jid,
              fromMe: false
            },
            remoteJid: item.remote_jid,
            fallbackPnJid: item.fallback_pn_jid || null,
            senderPhone: item.sender_phone,
            cleanSender: item.sender_phone.replace(/\D/g, ''),
            senderName: item.sender_name || 'Pengguna WhatsApp',
            messageText: item.message_body,
            rawMessageText: item.message_body,
            hasMediaAttachment: Boolean(item.has_media),
            msgTsMs: item.message_ts_ms,
            extraWamIds: item.extra_wam_ids,
            isCatchup: true,
            isRetryFromQueue: true
          });
          resolve(outcome);
        });
      });

      if (res.outcome === 'sent') {
        recoveredCount++;
        removePendingMissedMessage(item.id);
      } else if (res.outcome === 'permanent_skip' || res.outcome === 'received_no_reply') {
        removePendingMissedMessage(item.id);
      } else {
        const nextAttempts = (item.attempts || 0) + 1;
        if (nextAttempts >= MAX_MISSED_RETRY_ATTEMPTS) {
          removePendingMissedMessage(item.id);
          markIncomingMessagesHandled([item.wam_id, ...(item.extra_wam_ids || [])], sessionId, item.message_ts_ms);
          addMessageLog({
            wam_id: item.wam_id,
            session_id: sessionId,
            user_id: item.user_id,
            sender_phone: item.sender_phone,
            sender_name: item.sender_name,
            message_body: item.message_body,
            direction: 'incoming',
            status: 'Gagal',
            error_detail: res.error || 'Batas percobaan ulang catch-up Meta AI tercapai',
            ai_generated: false
          });
        } else {
          const backoffMs =
            MISSED_RETRY_BACKOFF_MS[Math.min(nextAttempts - 1, MISSED_RETRY_BACKOFF_MS.length - 1)];
          updatePendingMissedMessage(item.id, {
            attempts: nextAttempts,
            next_retry_at: Date.now() + backoffMs,
            last_error: res.error
          });
        }
      }

      if (batch.length > 1) {
        await delay(500);
      }
    }
  } finally {
    missedCatchupLocks.delete(sessionId);
  }

  return recoveredCount;
}

export function attachSocketMessageListener(sock: any, sessionId: string, sessionData: any) {
  sessionData.detachRawHandlers?.();
  sessionData.detachRawHandlers = attachMetaAiRawSocketHandlers(sock, sessionId);

  sock.ev.on('messages.update', (updates: any[]) => {
    if (sessionData.superseded) return;
    sessionData.lastUpdated = Date.now();
    try {
      handleMetaAiIncomingUpdate(sessionId, updates);
    } catch (err) {
      console.warn('[Baileys Meta AI Update Error]', err);
    }
  });

  const handleSingleIncomingMessage = async (mType: string, msg: any) => {
    if (sessionData.superseded || !msg?.message) return;
    sessionData.lastUpdated = Date.now();
    if (msg.key?.id) {
      rememberProtoMessage(msg.key, msg.message);
    }

    const remoteJid = msg.key?.remoteJid || msg.message?.deviceSentMessage?.destinationJid;
    if (!remoteJid) return;

    // Intercept Meta AI contact messages/replies BEFORE other filters
    if (handleMetaAiIncomingUpsert(sessionId, msg)) {
      return;
    }

    if (
      remoteJid.endsWith('@g.us') ||
      remoteJid === 'status@broadcast' ||
      remoteJid.endsWith('@broadcast') ||
      remoteJid.endsWith('@newsletter') ||
      remoteJid.endsWith('@bot')
    ) {
      return; // 1-on-1 chats only
    }

    const msgId = msg.key?.id;
    if (msgId && (processedMessageIds.has(msgId) || hasIncomingMessageBeenHandled(msgId, sessionId))) {
      return;
    }

    const msgTsMs = extractMessageTimestampMs(msg);
    const nowMs = Date.now();
    const isOldAppendCatchup = mType === 'append' && nowMs - msgTsMs > 45_000;

    if (isOldAppendCatchup) {
      const dbSess = getSessionById(sessionId);
      const baselineMs = dbSess?.connected_at
        ? Date.parse(dbSess.connected_at)
        : sessionData.openedAt || nowMs;
      const floorMs = Math.max(
        (Number.isFinite(baselineMs) && baselineMs > 0 ? baselineMs : nowMs) - 120_000,
        nowMs - OFFLINE_CATCHUP_MAX_AGE_MS
      );
      if (msgTsMs < floorMs || msgTsMs > nowMs + 120_000) {
        if (msgId) markIncomingMessagesHandled([msgId], sessionId, msgTsMs);
        return;
      }
    }

    const { rawMessageText, hasMediaAttachment } = unwrapIncomingMessageText(msg);

    cleanupExpiredCommandStates();

    let identity = resolveIncomingSenderIdentity(sock, msg, remoteJid);
    let lidMappedPeerPhone = '';
    if (identity.isLidThread && identity.cleanSender.length >= 8 && identity.fallbackPnJid) {
      lidMappedPeerPhone = identity.cleanSender;
      rememberSessionPeerLidPn(sessionId, {
        lidJidOrDigits: remoteJid,
        pnOrJid: identity.cleanSender
      });
    } else if (identity.isLidThread) {
      const cachedLinked = resolveLinkedPeerIdentities(sessionId, { remoteJid });
      if (cachedLinked.linkedPhone) {
        lidMappedPeerPhone = cachedLinked.linkedPhone;
        identity = {
          senderPhone: cachedLinked.linkedPhone,
          cleanSender: cachedLinked.linkedPhone,
          rawRemoteDigits: identity.rawRemoteDigits,
          isLidThread: true,
          fallbackPnJid: `${cachedLinked.linkedPhone}@s.whatsapp.net`
        };
      } else if (typeof sock?.signalRepository?.lidMapping?.getPNForLID === 'function') {
        // In Baileys v7, incoming DMs may use @lid without remoteJidAlt populated in key — look up real PN via Signal LID map
        try {
          const mappedPn = await Promise.race([
            sock.signalRepository.lidMapping.getPNForLID(remoteJid),
            new Promise<null>(resolve => setTimeout(() => resolve(null), 1500))
          ]);
          if (typeof mappedPn === 'string' && mappedPn.trim()) {
            const cleanMapped = mappedPn.trim().replace(/@.*/, '').split(':')[0];
            const normMapped = normalizePhoneNumber(cleanMapped) || cleanMapped.replace(/\D/g, '');
            if (normMapped.length >= 8) {
              lidMappedPeerPhone = normMapped;
              rememberSessionPeerLidPn(sessionId, {
                lidJidOrDigits: remoteJid,
                pnOrJid: normMapped
              });
              if (!identity.fallbackPnJid) {
                identity = {
                  senderPhone: normMapped,
                  cleanSender: normMapped,
                  rawRemoteDigits: identity.rawRemoteDigits,
                  isLidThread: true,
                  fallbackPnJid: `${normMapped}@s.whatsapp.net`
                };
              }
            }
          }
        } catch {
          // Keep fallback identity
        }
      }
    }

    const { senderPhone, cleanSender, isLidThread, fallbackPnJid } = identity;
    const db = initDbFile();
    const dbSession = getSessionById(sessionId);
    const selfCheck = evaluateSelfOrBotMessage({
      sock,
      sessionId,
      sessionData,
      dbSession,
      msg,
      resolvedTargetPhone: cleanSender || senderPhone,
      lidMappedPeerPhone: lidMappedPeerPhone || undefined,
      rawMessageText
    });

    // Strict Anti-Echo barrier for bot's own sent message IDs or recent outgoing text
    if (selfCheck.isBotEcho) {
      if (msgId) {
        markIncomingMessagesHandled([msgId], sessionId, msgTsMs);
        rememberProcessedMsgId(msgId);
      }
      console.log(
        `[Baileys Anti-Echo] Discarding reflected message (${selfCheck.reason}) from bot output: "${(rawMessageText || msgId || '').substring(0, 30)}..."`
      );
      return;
    }

    // Strict Self-Reply Firewall: when own paired device replies manually to a customer chat,
    // record watermarks (so pending/coalesced customer messages aren't overwritten) and exit IMMEDIATELY.
    if (selfCheck.isFromSelfOrBot && !selfCheck.isSelfChatTarget) {
      if (msgId) {
        markIncomingMessagesHandled([msgId], sessionId, msgTsMs);
        rememberProcessedMsgId(msgId);
      }
      const { selfPhones } = collectSessionSelfIdentifiers({
        sock,
        sessionId,
        sessionData,
        dbSession
      });
      const safeWatermarkPhone =
        lidMappedPeerPhone ||
        (cleanSender && (!isLidThread || !selfPhones.has(cleanSender)) ? cleanSender : '');
      const ownerEffectiveTs = isOldAppendCatchup ? msgTsMs : Math.max(msgTsMs, Date.now());
      recordChatReplyWatermark(sessionId, {
        cleanPhone: safeWatermarkPhone,
        remoteJid,
        timestampMs: ownerEffectiveTs
      });
      recordOwnerManualReplyWatermark(sessionId, {
        cleanPhone: safeWatermarkPhone,
        remoteJid,
        timestampMs: ownerEffectiveTs
      });
      if (!isOldAppendCatchup) {
        console.log(
          `[Baileys Self-Reply Guard] Abaikan balasan manual perangkat sendiri (${selfCheck.reason}) ke ${safeWatermarkPhone || remoteJid}; tidak diteruskan ke Meta AI.`
        );
      }
      return;
    }

    if (!rawMessageText && (!hasMediaAttachment || selfCheck.isFromSelfOrBot)) {
      return;
    }

    const messageText = rawMessageText || '[Pelanggan mengirim lampiran gambar/dokumen bukti pembayaran]';
    const replyTargetJid = remoteJid;
    const senderName = msg.pushName || 'Pengguna WhatsApp';
    const trimmedMsg = messageText.trim();
    const stateKey = `${sessionId}:${remoteJid}`;
    const hasActiveDialog =
      commandState.has(stateKey) || commandState.has(senderPhone) || commandState.has(remoteJid);
    const isSlashCommand = trimmedMsg.startsWith('/');

    if (selfCheck.isFromSelfOrBot && selfCheck.isSelfChatTarget && (!isSlashCommand && !hasActiveDialog)) {
      if (msgId) {
        markIncomingMessagesHandled([msgId], sessionId, msgTsMs);
        rememberProcessedMsgId(msgId);
      }
      return;
    }

    const sockPhone = normalizePhoneNumber(
      sock.user?.id ? sock.user.id.split('@')[0].split(':')[0] : ''
    );
    const isSelf = selfCheck.isFromSelfOrBot;

    // Offline catch-up path ('append' > 45s old, still within valid connected/24h window):
    // Coalesce multi-bubble messages per chat and skip anything already replied manually or by bot
    if (isOldAppendCatchup) {
      if (isSelf || isSlashCommand || hasActiveDialog) {
        if (msgId) markIncomingMessagesHandled([msgId], sessionId, msgTsMs);
        return;
      }

      const watermarkTs = getChatReplyWatermark(sessionId, cleanSender, remoteJid);
      if (watermarkTs > 0 && msgTsMs <= watermarkTs) {
        if (msgId) markIncomingMessagesHandled([msgId], sessionId, msgTsMs);
        return;
      }

      if (msgId) rememberProcessedMsgId(msgId);
      const bufKey = `${sessionId}:${remoteJid}`;
      const existingBuf = offlineCatchupBuffers.get(bufKey);
      if (existingBuf) {
        clearTimeout(existingBuf.timer);
        if (existingBuf.texts.length < 6) {
          existingBuf.texts.push(messageText);
        }
        if (msgId && existingBuf.wamIds.length < 12 && !existingBuf.wamIds.includes(msgId)) {
          existingBuf.wamIds.push(msgId);
        }
        existingBuf.hasMedia = existingBuf.hasMedia || hasMediaAttachment;
        existingBuf.latestTsMs = Math.max(existingBuf.latestTsMs, msgTsMs);
        existingBuf.msgKey = msg.key;
        existingBuf.timer = setTimeout(() => {
          const flushed = offlineCatchupBuffers.get(bufKey);
          offlineCatchupBuffers.delete(bufKey);
          if (!flushed) return;
          const combinedText = flushed.texts.join('\n').slice(0, 1400);
          const primaryId = flushed.wamIds[0] || flushed.msgKey?.id || `catchup_${Date.now()}`;
          const extraIds = flushed.wamIds.slice(1);
          enqueueIncomingChatTask(bufKey, async () => {
            await processIncomingCustomerMessage({
              sock: flushed.sock,
              sessionId: flushed.sessionId,
              sessionData: flushed.sessionData,
              msgKey: { ...flushed.msgKey, id: primaryId },
              remoteJid: flushed.remoteJid,
              fallbackPnJid: flushed.fallbackPnJid,
              senderPhone: flushed.senderPhone,
              cleanSender: flushed.cleanSender,
              senderName: flushed.senderName,
              messageText: combinedText,
              rawMessageText: combinedText,
              hasMediaAttachment: flushed.hasMedia,
              msgTsMs: flushed.latestTsMs,
              extraWamIds: extraIds,
              isCatchup: true,
              isRetryFromQueue: false
            });
          });
        }, OFFLINE_CATCHUP_COALESCE_MS);
        existingBuf.timer.unref?.();
        return;
      }

      const timer = setTimeout(() => {
        const flushed = offlineCatchupBuffers.get(bufKey);
        offlineCatchupBuffers.delete(bufKey);
        if (!flushed) return;
        const combinedText = flushed.texts.join('\n').slice(0, 1400);
        const primaryId = flushed.wamIds[0] || flushed.msgKey?.id || `catchup_${Date.now()}`;
        const extraIds = flushed.wamIds.slice(1);
        enqueueIncomingChatTask(bufKey, async () => {
          await processIncomingCustomerMessage({
            sock: flushed.sock,
            sessionId: flushed.sessionId,
            sessionData: flushed.sessionData,
            msgKey: { ...flushed.msgKey, id: primaryId },
            remoteJid: flushed.remoteJid,
            fallbackPnJid: flushed.fallbackPnJid,
            senderPhone: flushed.senderPhone,
            cleanSender: flushed.cleanSender,
            senderName: flushed.senderName,
            messageText: combinedText,
            rawMessageText: combinedText,
            hasMediaAttachment: flushed.hasMedia,
            msgTsMs: flushed.latestTsMs,
            extraWamIds: extraIds,
            isCatchup: true,
            isRetryFromQueue: false
          });
        });
      }, OFFLINE_CATCHUP_COALESCE_MS);
      timer.unref?.();

      offlineCatchupBuffers.set(bufKey, {
        timer,
        sessionId,
        sock,
        sessionData,
        remoteJid,
        fallbackPnJid,
        senderPhone,
        cleanSender,
        senderName,
        msgKey: msg.key,
        texts: [messageText],
        wamIds: msgId ? [msgId] : [],
        hasMedia: hasMediaAttachment,
        latestTsMs: msgTsMs
      });
      return;
    }

    rememberProcessedMsgId(msgId);
    console.log(
      `[Baileys Incoming] Session=${sessionId} From=${senderPhone} (${senderName}) jid=${remoteJid} fromMe=${Boolean(msg.key.fromMe)} media=${hasMediaAttachment}: "${messageText}"`
    );

    const matchedSessionBySender = db.sessions.find(s => {
      if (!s.phone_number || !cleanSender) return false;
      const sp = normalizePhoneNumber(s.phone_number);
      return sp.length >= 8 && sp === cleanSender;
    });

    const user =
      db.users.find(u => {
        if (!u.phone || !cleanSender) return false;
        const p = normalizePhoneNumber(u.phone);
        return p.length >= 8 && p === cleanSender;
      }) ||
      (matchedSessionBySender?.user_id ? getUserById(matchedSessionBySender.user_id) : null) ||
      (sessionData.userId ? getUserById(sessionData.userId) : null);

    const isOwner = Boolean(
      user?.phone && cleanSender && normalizePhoneNumber(user.phone) === cleanSender
    );
    const isAllowed = Boolean(
      user?.allowed_numbers &&
        cleanSender &&
        user.allowed_numbers.some(n => {
          const norm = normalizePhoneNumber(n);
          return norm.length >= 8 && norm === cleanSender;
        })
    );

    // =========================================================================
    // REMOTE COMMAND BRIDGE & SELF-CHAT LOOP PREVENTION GUARD
    // Self commands are strictly limited to Note-to-Self or inbound authorized owner/allowed DMs
    // =========================================================================
    if ((isSlashCommand || hasActiveDialog) && (selfCheck.isSelfChatTarget || (!isSelf && (isOwner || isAllowed)))) {
      const clearSenderDialogState = () => {
        commandState.delete(stateKey);
        commandState.delete(senderPhone);
        commandState.delete(remoteJid);
      };

      const sendCommandReply = async (replyBody: string) => {
        recordBotOutgoing(replyBody);
        await sendSocketMessageWithAckGuard(
          sock,
          replyTargetJid,
          { text: replyBody },
          { timeoutMs: 18000, fallbackJid: fallbackPnJid, sessionData }
        );
      };

      const resolveOutboundSocket = () => {
        if (user) {
          const userSessions = Array.from(activeSessions.values()).filter(
            s => s.userId === user.id && s.status === 'connected' && s.socket && isSocketTrulyOpen(s.socket)
          );
          const primaryUserSession = userSessions.find(s => s.is_primary) || userSessions[0];
          if (primaryUserSession?.socket) return primaryUserSession.socket;
        }
        return sock;
      };

      const executeSendOrBroadcastTasks = async (tasks: Array<{ targetPhone: string; messageToSend: string }>) => {
        const sockToUse = resolveOutboundSocket();

        if (tasks.length === 1) {
          const { targetPhone, messageToSend } = tasks[0];
          if (user) {
            const quota = deductUserDailyQuota(user.id);
            if (!quota.allowed) {
              const quotaMsg = `❌ *Gagal Kirim:* ${quota.message || 'Batas kuota harian Anda telah habis.'}`;
              await sendCommandReply(quotaMsg);
              return;
            }
          }

          const cleanTarget = normalizePhoneNumber(targetPhone);
          const targetJid = `${cleanTarget}@s.whatsapp.net`;
          try {
            recordBotOutgoing(messageToSend);
            await sendSocketMessageWithAckGuard(
              sockToUse,
              targetJid,
              { text: messageToSend },
              { timeoutMs: 22000, sessionData }
            );

            addMessageLog({
              wam_id: `cmd_out_${Date.now()}`,
              session_id: sessionId,
              user_id: user?.id || sessionData.userId,
              sender_phone: cleanTarget,
              sender_name: `Tujuan (${cleanTarget})`,
              message_body: messageToSend,
              direction: 'outgoing',
              status: 'Sukses',
              reply_body: 'Dikirim via Remote WhatsApp Command (/send)'
            });

            const successReply =
              `✅ *Pesan Berhasil Terkirim!*\n\n` +
              `• Nomor Tujuan: *${cleanTarget}*\n` +
              `• Isi Pesan: "${messageToSend}"\n` +
              `• Via Gateway: *${sessionData.phoneNumber || sockPhone || 'Japriin'}*`;
            await sendCommandReply(successReply);
          } catch (sendErr: any) {
            const errMsg = `❌ *Gagal mengirim pesan ke ${cleanTarget}:* ${sendErr?.message || 'Error koneksi gateway'}`;
            await sendCommandReply(errMsg);
          }
          return;
        }

        const startNotice =
          `⏳ *Memproses Broadcast ke ${tasks.length} Nomor...*\n` +
          `Mohon tunggu, pesan sedang dikirim bertahap dengan proteksi Anti-Ban Guard.`;
        await sendCommandReply(startNotice);

        let successCount = 0;
        let failedCount = 0;
        const successPhones: string[] = [];

        for (let i = 0; i < tasks.length; i++) {
          const { targetPhone, messageToSend } = tasks[i];
          const cleanTarget = normalizePhoneNumber(targetPhone);
          if (!cleanTarget || cleanTarget.length < 8) {
            failedCount++;
            continue;
          }

          if (user) {
            const quota = deductUserDailyQuota(user.id);
            if (!quota.allowed) {
              failedCount++;
              continue;
            }
          }

          const targetJid = `${cleanTarget}@s.whatsapp.net`;
          try {
            recordBotOutgoing(messageToSend);
            await sendSocketMessageWithAckGuard(
              sockToUse,
              targetJid,
              { text: messageToSend },
              { timeoutMs: 22000, sessionData }
            );

            successCount++;
            successPhones.push(cleanTarget);
            addMessageLog({
              wam_id: `bc_cmd_${Date.now()}_${i}`,
              session_id: sessionId,
              user_id: user?.id || sessionData.userId,
              sender_phone: cleanTarget,
              sender_name: `Broadcast (${cleanTarget})`,
              message_body: messageToSend,
              direction: 'outgoing',
              status: 'Sukses',
              reply_body: 'Dikirim via Broadcast WhatsApp (/broadcast)'
            });
          } catch (err: any) {
            failedCount++;
            addMessageLog({
              wam_id: `bc_fail_${Date.now()}_${i}`,
              session_id: sessionId,
              user_id: user?.id || sessionData.userId,
              sender_phone: cleanTarget,
              sender_name: `Broadcast (${cleanTarget})`,
              message_body: messageToSend,
              direction: 'outgoing',
              status: 'Gagal',
              error_detail: err?.message || 'Gagal kirim broadcast'
            });
          }

          if (i < tasks.length - 1) {
            await delay(1000 + Math.floor(Math.random() * 800));
          }
        }

        addBroadcastHistory({
          user_id: user?.id || sessionData.userId,
          session_id: sessionId,
          recipients_count: tasks.length,
          message: tasks[0]?.messageToSend || 'Broadcast Multi-Pesan',
          status: failedCount === tasks.length ? 'failed' : 'completed',
          success_count: successCount,
          failed_count: failedCount
        });

        const summaryReply =
          `✅ *Broadcast Selesai Diproses!*\n\n` +
          `• Total Tujuan: *${tasks.length} Nomor*\n` +
          `• Berhasil Terkirim: *${successCount} Nomor*\n` +
          `• Gagal: *${failedCount} Nomor*\n` +
          (successPhones.length > 0
            ? `• Penerima: *${successPhones.slice(0, 6).join(', ')}${successPhones.length > 6 ? ` (+${successPhones.length - 6} lainnya)` : ''}*\n`
            : '') +
          `• Via Gateway: *${sessionData.phoneNumber || sockPhone || 'Japriin'}*\n` +
          `• Log Retensi: *Otomatis dihapus setelah 7 hari*`;
        await sendCommandReply(summaryReply);
      };

      if (isSlashCommand) {
        const parts = trimmedMsg.split(/\s+/);
        const cmd = parts[0].toLowerCase();

        if (cmd === '/batal' || cmd === '/cancel') {
          clearSenderDialogState();
          await sendCommandReply(`✓ *Perintah interaktif telah dibatalkan.*`);
          return;
        }

        if (cmd === '/status' || cmd === '/saldo' || cmd === '/kuota' || cmd === '/cekkuota' || cmd === '/statusbot') {
          const u = user || (sessionData.userId ? getUserById(sessionData.userId) : null);
          const plan = db.plans.find(p => p.id === u?.plan_id) || db.plans[0];
          const usedToday = u?.daily_messages_sent || 0;
          const remainingToday = Math.max(0, (plan?.daily_msg_limit || 100) - usedToday);
          const statusReply =
            `📊 *Status Japriin Gateway*\n\n` +
            `• Akun: *${u?.name || 'Operator'}* (@${u?.username || 'user'})\n` +
            `• Paket: *${plan?.name || 'Pro'}*\n` +
            `• Nomor Gateway: *${sessionData.phoneNumber || sockPhone || 'Terhubung'}*\n` +
            `• Sisa Kuota Hari Ini: *${remainingToday} / ${plan?.daily_msg_limit || 100} pesan*\n` +
            `• Status Gateway: *TERHUBUNG (Anti-Ban Guard Aktif)*\n\n` +
            `_Ketik */send* untuk mengirim pesan ke nomor tujuan._`;
          await sendCommandReply(statusReply);
          return;
        }

        if (cmd === '/help' || cmd === '/bantuan' || cmd === '/menu') {
          const helpReply =
            `🤖 *Panduan Japriin Remote Command Bridge*\n\n` +
            `Anda dapat mengirim pesan dari Nomor Sistem maupun Nomor Sendiri dengan perintah berikut:\n\n` +
            `1️⃣ */send*\n` +
            `   Membuka template interaktif kirim pesan.\n\n` +
            `2️⃣ */send <nomor_tujuan> <isi_pesan>*\n` +
            `   Kirim pesan langsung dalam 1 langkah.\n` +
            `   _Contoh: /send 08123456789 Halo kak, pesanan sudah dikirim._\n\n` +
            `3️⃣ */status* atau */kuota*\n` +
            `   Cek sisa kuota harian & status koneksi bot.\n\n` +
            `4️⃣ */batal*\n` +
            `   Batalkan dialog kirim pesan yang sedang aktif.\n\n` +
            `💡 _Standar Anti-Loop: Chat biasa tanpa awalan / ke nomor sendiri otomatis diabaikan agar tidak memicu balasan berulang (looping)._`;
          await sendCommandReply(helpReply);
          return;
        }

        if (cmd === '/send' || cmd === '/broadcast' || cmd === '/kirim' || cmd === '/kirimpesan') {
          const fullArgs = trimmedMsg.substring(cmd.length).trim();
          const tasks = parseSendOrBroadcastTasks(fullArgs);

          if (tasks.length > 0) {
            clearSenderDialogState();
            await executeSendOrBroadcastTasks(tasks);
            return;
          }

          const nowTs = Date.now();
          commandState.set(stateKey, { step: 'awaiting_direct_target', updatedAt: nowTs });
          commandState.set(senderPhone, { step: 'awaiting_direct_target', updatedAt: nowTs });
          const promptMsg =
            `📱 *Template Kirim Pesan & Broadcast (Japriin Bridge)*\n\n` +
            `Silakan balas pesan ini dengan salah satu format berikut:\n\n` +
            `1️⃣ *Kirim ke 1 Nomor:*\n` +
            `*08123456789 Halo kak, pesanan Anda sudah siap dikirim.*\n\n` +
            `2️⃣ *Broadcast ke Banyak Nomor (1 Pesan Sama):*\n` +
            `*08123456789, 08198765432, 08571234567 Halo kak, promo spesial hari ini!*\n` +
            `_(Nomor juga bisa disusun per baris baru lalu diikuti isi pesan di bawahnya)_\n\n` +
            `3️⃣ *Broadcast Banyak Pesan Berbeda (Per Baris):*\n` +
            `*08123456789 Halo kak Budi, pesanan siap*\n` +
            `*08198765432 Halo kak Ani, pesanan dikirim*\n\n` +
            `_Ketik */batal* untuk membatalkan pengiriman._`;
          await sendCommandReply(promptMsg);
          return;
        }

        const unknownCmdReply =
          `ℹ️ Perintah *${cmd}* tidak dikenali.\n\n` +
          `Gunakan perintah standar berikut:\n` +
          `• */send* — Template kirim pesan / broadcast\n` +
          `• */send <nomor> <pesan>* — Kirim pesan langsung\n` +
          `• */broadcast <nomor1>,<nomor2> <pesan>* — Broadcast banyak nomor\n` +
          `• */status* — Cek kuota & status gateway\n` +
          `• */help* — Panduan lengkap`;
        await sendCommandReply(unknownCmdReply);
        return;
      }

      const activeState = commandState.get(stateKey) || commandState.get(senderPhone) || commandState.get(remoteJid);
      if (activeState && activeState.step === 'awaiting_direct_target') {
        const tasks = parseSendOrBroadcastTasks(trimmedMsg);
        if (tasks.length > 0) {
          clearSenderDialogState();
          await executeSendOrBroadcastTasks(tasks);
          return;
        }
        const helpFormat =
          `⚠️ *Format Pengiriman Belum Sesuai*\n\n` +
          `Silakan kirim dengan format:\n` +
          `👉 *<nomor_tujuan> <isi_pesan>*\n` +
          `👉 *<nomor1>, <nomor2>, <nomor3> <isi_pesan>*\n\n` +
          `Contoh:\n` +
          `*08123456789 Halo Kak, pesanan sudah dikirim*\n\n` +
          `_Atau ketik */batal* untuk keluar dari mode kirim pesan._`;
        await sendCommandReply(helpFormat);
        return;
      }
    }

    if (isSelf) {
      console.log(
        `[Baileys Self-Chat Ignored] Pesan dari perangkat sendiri (${senderPhone}) bukan perintah '/'. Dilewati.`
      );
      return;
    }

    await processIncomingCustomerMessage({
      sock,
      sessionId,
      sessionData,
      msgKey: msg.key,
      remoteJid,
      fallbackPnJid,
      senderPhone,
      cleanSender,
      senderName,
      messageText,
      rawMessageText,
      hasMediaAttachment,
      msgTsMs,
      isCatchup: false,
      isRetryFromQueue: false
    });
  };

  sock.ev.on('messages.upsert', (m: any) => {
    if (sessionData.superseded) return;
    if (m?.type !== 'notify' && m?.type !== 'append') return;
    const incomingList = Array.isArray(m?.messages) ? m.messages : [];
    if (incomingList.length === 0) return;

    const prevBatch = sessionUpsertQueues.get(sessionId) || Promise.resolve();
    const nextBatch = prevBatch
      .catch(() => {})
      .then(async () => {
        if (sessionData.superseded) return;
        const dbSessionMeta = getSessionById(sessionId);
        const nowBatchMs = Date.now();

        // Async pre-scan: resolve @lid -> PN first for any owner manual reply so cross-JID watermarks & queue cancellations trigger BEFORE customer tasks run
        for (const msg of incomingList) {
          if (!msg?.message) continue;
          const jid = msg.key?.remoteJid || msg.message?.deviceSentMessage?.destinationJid;
          if (
            !jid ||
            jid.endsWith('@g.us') ||
            jid === 'status@broadcast' ||
            jid.endsWith('@broadcast') ||
            jid.endsWith('@newsletter') ||
            jid.endsWith('@bot') ||
            isMetaAiJid(jid)
          ) {
            continue;
          }
          const id = resolveIncomingSenderIdentity(sock, msg, jid);
          let resolvedPn = id.cleanSender && (!id.isLidThread || Boolean(id.fallbackPnJid)) ? id.cleanSender : '';
          if (id.isLidThread && !resolvedPn && typeof sock?.signalRepository?.lidMapping?.getPNForLID === 'function') {
            const cachedLinked = resolveLinkedPeerIdentities(sessionId, { remoteJid: jid });
            if (cachedLinked.linkedPhone) {
              resolvedPn = cachedLinked.linkedPhone;
            } else {
              try {
                const mappedPn = await Promise.race([
                  sock.signalRepository.lidMapping.getPNForLID(jid),
                  new Promise<null>(resolve => setTimeout(() => resolve(null), 600))
                ]);
                if (typeof mappedPn === 'string' && mappedPn.trim()) {
                  const cleanMapped = mappedPn.trim().replace(/@.*/, '').split(':')[0];
                  const normMapped = normalizePhoneNumber(cleanMapped) || cleanMapped.replace(/\D/g, '');
                  if (normMapped.length >= 8) {
                    resolvedPn = normMapped;
                  }
                }
              } catch {
                // Ignore LID lookup failure
              }
            }
          }
          if (id.isLidThread && resolvedPn) {
            rememberSessionPeerLidPn(sessionId, { lidJidOrDigits: jid, pnOrJid: resolvedPn });
          }

          const { rawMessageText } = unwrapIncomingMessageText(msg);
          const preSelfCheck = evaluateSelfOrBotMessage({
            sock,
            sessionId,
            sessionData,
            dbSession: dbSessionMeta,
            msg,
            resolvedTargetPhone: resolvedPn || id.cleanSender || id.senderPhone,
            lidMappedPeerPhone: resolvedPn || undefined,
            rawMessageText
          });
          if (!preSelfCheck.isFromSelfOrBot || preSelfCheck.isSelfChatTarget || preSelfCheck.isBotEcho) {
            continue;
          }
          const msgTs = extractMessageTimestampMs(msg);
          const isOldAppend = m.type === 'append' && nowBatchMs - msgTs > 45_000;
          const ownerTs = isOldAppend ? msgTs : Math.max(msgTs, Date.now());
          const safePhoneForWatermark = resolvedPn || (!id.isLidThread ? id.cleanSender : '');
          recordChatReplyWatermark(sessionId, {
            cleanPhone: safePhoneForWatermark,
            remoteJid: jid,
            timestampMs: ownerTs
          });
          recordOwnerManualReplyWatermark(sessionId, {
            cleanPhone: safePhoneForWatermark,
            remoteJid: jid,
            timestampMs: ownerTs
          });
        }

        for (const msg of incomingList) {
          const rawJid = msg?.key?.remoteJid || msg?.message?.deviceSentMessage?.destinationJid || 'default';
          const linked = resolveLinkedPeerIdentities(sessionId, { remoteJid: rawJid });
          const chatKey = linked.normPhone ? `${sessionId}:pn:${linked.normPhone}` : `${sessionId}:${rawJid}`;
          enqueueIncomingChatTask(chatKey, () => handleSingleIncomingMessage(m.type, msg));
        }
      })
      .catch(err => {
        console.error('[Baileys Message Listener Error]', err);
      })
      .finally(() => {
        if (sessionUpsertQueues.get(sessionId) === nextBatch) {
          sessionUpsertQueues.delete(sessionId);
        }
      });
    sessionUpsertQueues.set(sessionId, nextBatch);
  });
}

function closeSocketSafelyWithoutLogout(
  sock: any,
  sessionData?: SessionState | null,
  sessionId?: string,
  options?: { deferWsListenerRemoval?: boolean; recordCloseMarker?: boolean }
) {
  if (sessionData) {
    sessionData.superseded = true;
    sessionData.closedByApp = true;
  }
  if (sessionData?.stabilityTimer) {
    clearTimeout(sessionData.stabilityTimer);
    sessionData.stabilityTimer = undefined;
  }
  if (sessionId) {
    if (options?.recordCloseMarker !== false) {
      recordLastCloseTimestamp(sessionId);
    }
    removeLocalRuntimeLease(sessionId, RUNTIME_INSTANCE_ID);
  }
  if (sock) {
    try {
      sock.ev?.removeAllListeners?.('connection.update');
      sock.ev?.removeAllListeners?.('creds.update');
      sock.ev?.removeAllListeners?.('messages.upsert');
      sock.ev?.removeAllListeners?.('messages.update');
      sock.end?.(undefined);
      try {
        sock.ws?.close?.();
      } catch {}
      if (!options?.deferWsListenerRemoval) {
        sock.ws?.removeAllListeners?.();
        try {
          sock.ws?.on?.('error', () => {});
        } catch {}
      }
    } catch {
      // Ignore cleanup errors
    }
  }
  sessionData?.detachRawHandlers?.();
  if (sessionId) {
    clearMetaAiSession(sessionId);
  }
}

async function closeSocketAndWait(
  sock: any,
  sessionData?: SessionState | null,
  sessionId?: string,
  waitMs = 2000
): Promise<void> {
  if (sessionData) {
    sessionData.superseded = true;
    sessionData.closedByApp = true;
  }
  const ws = sock?.ws;
  const rawSocket = ws?.socket;
  const needsWsWait = Boolean(
    ws &&
      ws.isClosed !== true &&
      (sessionData?.status === 'connected' || isSocketTrulyOpen(sock) || isSocketConnecting(sock))
  );

  let wsClosePromise: Promise<void> | null = null;
  if (needsWsWait && (typeof ws.once === 'function' || typeof rawSocket?.once === 'function')) {
    wsClosePromise = new Promise<void>(resolve => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      try {
        rawSocket?.once?.('close', finish);
        ws.once?.('close', finish);
      } catch {
        finish();
      }
      setTimeout(finish, waitMs);
    });
  }

  closeSocketSafelyWithoutLogout(sock, sessionData, sessionId, {
    deferWsListenerRemoval: Boolean(wsClosePromise)
  });

  if (wsClosePromise) {
    await wsClosePromise;
    try {
      ws?.removeAllListeners?.();
      ws?.on?.('error', () => {});
    } catch {}
    await delay(350);
  } else if (needsWsWait) {
    await delay(750);
  }
}

/**
 * Mencegah dua folder/socket berbeda milik akun & nomor WA yang sama saling menendang (440 connectionReplaced).
 */
function cleanupDuplicateSessionsForOwnerPhone(keepSessionId: string, ownerUserId: string, cleanPhone: string) {
  if (!keepSessionId || !cleanPhone || cleanPhone.length < 8) return;

  for (const [sid, mem] of Array.from(activeSessions.entries())) {
    if (sid === keepSessionId) continue;
    const memPhone = normalizePhoneNumber(mem.phoneNumber || getCredsPhoneOnDisk(sid) || '');
    const sameUser = !mem.userId || !ownerUserId || mem.userId === ownerUserId || isSessionOwnedByUserId(sid, ownerUserId);
    if (sameUser && memPhone === cleanPhone) {
      console.log(`[Baileys Dedup] Menutup socket duplikat "${sid}" untuk +${cleanPhone} (mempertahankan "${keepSessionId}").`);
      mem.superseded = true;
      mem.closedByApp = true;
      clearSessionTimers(sid);
      closeSocketSafelyWithoutLogout(mem.socket, mem, sid);
      activeSessions.delete(sid);
      sessionDisconnectDiagnostics.delete(sid);
      clearSessionConflictState(sid);
      cleanSessionFolder(sid);
      deleteBaileysAuthFromMysql(sid).catch(() => {});
    }
  }

  if (fs.existsSync(AUTH_DIR)) {
    try {
      for (const folder of fs.readdirSync(AUTH_DIR)) {
        if (folder === keepSessionId) continue;
        const folderPhone = getCredsPhoneOnDisk(folder);
        if (folderPhone !== cleanPhone) continue;
        const dbMeta = getSessionById(folder);
        const sameOwner =
          (dbMeta?.user_id && dbMeta.user_id === ownerUserId) ||
          isSessionOwnedByUserId(folder, ownerUserId);
        if (sameOwner) {
          console.log(`[Baileys Dedup] Menghapus folder auth duplikat "${folder}" untuk +${cleanPhone}.`);
          clearSessionTimers(folder);
          sessionDisconnectDiagnostics.delete(folder);
          clearSessionConflictState(folder);
          cleanSessionFolder(folder);
          deleteBaileysAuthFromMysql(folder).catch(() => {});
        }
      }
    } catch {
      // Ignore readdir errors
    }
  }
}

function hasOtherConnectedSocketForPhone(excludeSessionId: string, cleanPhone: string, ownerUserId?: string): boolean {
  if (!cleanPhone || cleanPhone.length < 8) return false;
  for (const [sid, mem] of activeSessions.entries()) {
    if (sid === excludeSessionId || mem.superseded) continue;
    if (mem.status !== 'connected' || !isSocketTrulyOpen(mem.socket)) continue;
    const memPhone = normalizePhoneNumber(mem.phoneNumber || getCredsPhoneOnDisk(sid) || '');
    if (memPhone !== cleanPhone) continue;
    if (!ownerUserId || !mem.userId || mem.userId === ownerUserId || isSessionOwnedByUserId(sid, ownerUserId)) {
      return true;
    }
  }
  return false;
}

function hasOtherActiveOrConnectingSocketForPhone(
  excludeSessionId: string,
  cleanPhone: string,
  ownerUserId?: string
): SessionState | null {
  if (!cleanPhone || cleanPhone.length < 8) return null;
  const now = Date.now();
  for (const [sid, mem] of activeSessions.entries()) {
    if (sid === excludeSessionId || mem.superseded) continue;
    const memPhone = normalizePhoneNumber(mem.phoneNumber || getCredsPhoneOnDisk(sid) || '');
    if (memPhone !== cleanPhone) continue;
    if (ownerUserId && mem.userId && mem.userId !== ownerUserId && !isSessionOwnedByUserId(sid, ownerUserId)) {
      continue;
    }
    const isConnected = mem.status === 'connected' && isSocketTrulyOpen(mem.socket);
    const isConnecting =
      mem.status === 'connecting' &&
      (reconnectTimers.has(sid) ||
        sessionStartLocks.has(sid) ||
        (mem.socket && (isSocketTrulyOpen(mem.socket) || isSocketConnecting(mem.socket)) && now - mem.lastUpdated < 60000));
    if (isConnected || isConnecting) {
      return mem;
    }
  }
  return null;
}

async function closeCompetingSocketsForOwnerPhone(
  keepSessionId: string,
  cleanPhone: string,
  ownerUserId?: string
): Promise<void> {
  if (!cleanPhone || cleanPhone.length < 8) return;
  for (const [sid, mem] of Array.from(activeSessions.entries())) {
    if (sid === keepSessionId) continue;
    const memPhone = normalizePhoneNumber(mem.phoneNumber || getCredsPhoneOnDisk(sid) || '');
    if (memPhone !== cleanPhone) continue;
    const sameUser =
      !ownerUserId || !mem.userId || mem.userId === ownerUserId || isSessionOwnedByUserId(sid, ownerUserId);
    if (!sameUser) continue;

    clearSessionTimers(sid);
    await closeSocketAndWait(mem.socket, mem, sid, 2000);
    if (activeSessions.get(sid) === mem) {
      activeSessions.delete(sid);
    }
    sessionDisconnectDiagnostics.delete(sid);
    clearSessionConflictState(sid);
  }
}

// Start or get active Baileys socket for QR Code or persistent session
export async function getOrStartBaileysSession(
  rawSessionId: string = 'session_primary_default',
  phoneNumber?: string,
  userId?: string,
  options?: {
    forceReconnect?: boolean;
    isAutoReconnect?: boolean;
    bypassNodeGuard?: boolean;
    assignedAppId?: string;
  }
): Promise<SessionState> {
  const sessionId = sanitizeSessionId(rawSessionId);
  if (isSelfKilledByIpRule) {
    if (options?.isAutoReconnect) {
      return {
        sessionId,
        userId,
        socket: null,
        qrCodeUrl: null,
        pairingCode: null,
        status: 'disconnected',
        phoneNumber: phoneNumber || null,
        lastUpdated: Date.now(),
        handshakeStartedAt: Date.now(),
        retryCount: 0
      };
    }
    throw new Error(`Socket WhatsApp pada server ini telah dimatikan oleh aturan Admin (${selfKilledReason || 'Kill IP'}).`);
  }

  const candidateUserForGuard = userId || getSessionById(sessionId)?.user_id;
  const ownerForGuard = candidateUserForGuard ? getUserById(candidateUserForGuard) : undefined;

  if (options?.assignedAppId) {
    const cleanTargetApp = normalizeAppId(options.assignedAppId);
    const existingMeta = getSessionById(sessionId);
    if (existingMeta && cleanTargetApp) {
      updateSession(sessionId, {
        assigned_app_id: cleanTargetApp,
        assigned_server_ip: undefined,
        assignment_status: existingMeta.assignment_status === 'released' ? 'pending' : existingMeta.assignment_status
      });
    }
  }

  const existing = activeSessions.get(sessionId);
  const dbSessForGuard = getSessionById(sessionId);
  if (existing && !existing.superseded && existing.status === 'connected' && isSocketTrulyOpen(existing.socket)) {
    if (
      !options?.bypassNodeGuard &&
      dbSessForGuard &&
      !isSessionOwnedByCurrentAppNode(dbSessForGuard, undefined, ownerForGuard)
    ) {
      await releaseLocalSocketForDelegation(sessionId).catch(() => {});
    } else {
      if (userId && !existing.userId) existing.userId = userId;
      return existing;
    }
  }

  const guardTarget: Pick<WhatsAppSession, 'id' | 'user_id' | 'assigned_app_id' | 'assignment_status'> =
    dbSessForGuard || {
      id: sessionId,
      user_id: candidateUserForGuard,
      assigned_app_id: options?.assignedAppId ? normalizeAppId(options.assignedAppId) || undefined : undefined
    };

  if (
    !options?.bypassNodeGuard &&
    !isSessionOwnedByCurrentAppNode(guardTarget, undefined, ownerForGuard)
  ) {
    if (existing) {
      await releaseLocalSocketForDelegation(sessionId).catch(() => {});
    }
    return {
      sessionId,
      userId: candidateUserForGuard,
      socket: null,
      qrCodeUrl: null,
      pairingCode: null,
      status: dbSessForGuard?.status === 'connected' ? 'connected' : 'disconnected',
      phoneNumber: phoneNumber || dbSessForGuard?.phone_number || null,
      lastUpdated: Date.now(),
      handshakeStartedAt: Date.now(),
      retryCount: 0
    };
  }

  if (options?.forceReconnect) {
    clearSessionConflictState(sessionId);
    sessionDisconnectDiagnostics.delete(sessionId);
  } else if (isSessionInConflictCooldown(sessionId)) {
    if (existing) {
      return existing;
    }
    const cooldownState = sessionConflictStates.get(sessionId);
    const pausedSnapshot: SessionState = {
      sessionId,
      userId,
      socket: null,
      qrCodeUrl: null,
      pairingCode: null,
      status: 'disconnected',
      phoneNumber: phoneNumber || getCredsPhoneOnDisk(sessionId) || null,
      lastUpdated: Date.now(),
      handshakeStartedAt: Date.now(),
      retryCount: cooldownState?.count || 0,
      consecutiveConflicts: cooldownState?.count || 0,
      conflictCooldownUntil: cooldownState?.cooldownUntil,
      disconnectedSince: cooldownState?.lastConflictAt || Date.now()
    };
    activeSessions.set(sessionId, pausedSnapshot);
    return pausedSnapshot;
  }

  const candidatePhone = normalizePhoneNumber(
    phoneNumber || existing?.phoneNumber || dbSessForGuard?.phone_number || getCredsPhoneOnDisk(sessionId) || ''
  );
  const candidateUserId = userId || existing?.userId || dbSessForGuard?.user_id;

  // Do not spin up a competing socket if another session ID for the same owner & phone is already open/connecting
  if (candidatePhone && !options?.forceReconnect) {
    const competing = hasOtherActiveOrConnectingSocketForPhone(sessionId, candidatePhone, candidateUserId);
    if (competing) {
      return competing;
    }
  }

  // Defer if another live worker/container on the same domain & IP or authorized cluster node already holds this session
  if (!options?.forceReconnect) {
    const siblingLease = findLiveLocalSiblingLease({
      sessionId,
      userId: candidateUserId,
      cleanPhone: candidatePhone
    });
    if (siblingLease) {
      sessionDisconnectDiagnostics.delete(sessionId);
      clearSessionConflictState(sessionId);
      const delegatedSnapshot: SessionState = existing || {
        sessionId,
        userId: candidateUserId,
        socket: null,
        qrCodeUrl: null,
        pairingCode: null,
        status: siblingLease.status,
        phoneNumber: candidatePhone || siblingLease.phone_number || null,
        lastUpdated: Date.now(),
        handshakeStartedAt: siblingLease.started_at || Date.now(),
        retryCount: 0
      };
      return delegatedSnapshot;
    }

    const remoteLeaseCheck = await evaluateRemoteLeaseForSession({
      sessionId,
      userId: candidateUserId,
      cleanPhone: candidatePhone,
      assignedAppId: dbSessForGuard?.assigned_app_id
    });
    if (
      (remoteLeaseCheck.status === 'same_domain_ip' || remoteLeaseCheck.status === 'remote_cluster_node') &&
      remoteLeaseCheck.lease
    ) {
      sessionDisconnectDiagnostics.delete(sessionId);
      clearSessionConflictState(sessionId);
      const delegatedSnapshot: SessionState = existing || {
        sessionId,
        userId: candidateUserId,
        socket: null,
        qrCodeUrl: null,
        pairingCode: null,
        status: 'connected',
        phoneNumber: candidatePhone || remoteLeaseCheck.lease.phone_number || null,
        lastUpdated: Date.now(),
        handshakeStartedAt: remoteLeaseCheck.lease.connected_at || Date.now(),
        openedAt: remoteLeaseCheck.lease.connected_at || Date.now(),
        retryCount: 0
      };
      return delegatedSnapshot;
    }
    if (remoteLeaseCheck.status === 'different_ip' && remoteLeaseCheck.lease) {
      const cooldownUntil = Date.now() + CONFLICT_COOLDOWN_MS;
      const detail = buildRemoteConflictDetailSync(
        remoteLeaseCheck.lease,
        sessionId,
        getSessionById(sessionId)?.session_name
      );
      detail.cooldown_until = new Date(cooldownUntil).toISOString();
      sessionConflictStates.set(sessionId, {
        count: MAX_AUTO_CONFLICT_RETRIES + 1,
        cooldownUntil,
        lastConflictAt: Date.now()
      });
      sessionConflictDetails.set(sessionId, detail);
      const pausedSnapshot: SessionState = {
        sessionId,
        userId: candidateUserId,
        socket: null,
        qrCodeUrl: null,
        pairingCode: null,
        status: 'disconnected',
        phoneNumber: candidatePhone || remoteLeaseCheck.lease.phone_number || null,
        lastUpdated: Date.now(),
        handshakeStartedAt: Date.now(),
        retryCount: MAX_AUTO_CONFLICT_RETRIES + 1,
        consecutiveConflicts: MAX_AUTO_CONFLICT_RETRIES + 1,
        conflictCooldownUntil: cooldownUntil,
        disconnectedSince: Date.now()
      };
      activeSessions.set(sessionId, pausedSnapshot);
      return pausedSnapshot;
    }
  }

  // If currently connecting/reconnecting or waiting on backoff timer, do NOT kill the in-flight handshake or timer
  if (
    !options?.forceReconnect &&
    !options?.isAutoReconnect &&
    existing &&
    !existing.superseded &&
    existing.status === 'connecting' &&
    (reconnectTimers.has(sessionId) ||
      sessionStartLocks.has(sessionId) ||
      (existing.socket &&
        (isSocketTrulyOpen(existing.socket) || isSocketConnecting(existing.socket)) &&
        Date.now() - existing.lastUpdated < 60000))
  ) {
    if (userId && !existing.userId) existing.userId = userId;
    return existing;
  }

  // Prevent concurrent duplicate socket creation on the same sessionId
  const inFlight = sessionStartLocks.get(sessionId);
  if (inFlight) {
    return inFlight;
  }

  const initPromise = (async (): Promise<SessionState> => {
    try {
      clearSessionTimers(sessionId);

      if (options?.forceReconnect && candidatePhone) {
        await closeCompetingSocketsForOwnerPhone(sessionId, candidatePhone, candidateUserId);
      }

      const current = activeSessions.get(sessionId);
      const preservedUserId = userId || current?.userId;
      const preservedPhone = phoneNumber || current?.phoneNumber || null;
      const prevRetries = options?.forceReconnect ? 0 : (current?.retryCount || 0);
      const prevConflicts = options?.forceReconnect
        ? 0
        : (current?.consecutiveConflicts ?? sessionConflictStates.get(sessionId)?.count ?? 0);

      if (current) {
        current.superseded = true;
        current.closedByApp = true;
      }
      if (current && current.socket) {
        await closeSocketAndWait(current.socket, current, sessionId, 2000);
      }
      if (activeSessions.get(sessionId) === current) {
        activeSessions.delete(sessionId);
      }

      // Enforce safe handoff settle time across restarts/reconnects so WhatsApp clears any prior Noise stream before dialing
      await waitForHandoffCloseGraceIfNeeded(sessionId);

      const sessionFolder = safeSessionFolderPath(sessionId);
      if (!sessionFolder) {
        throw new Error('Folder sesi WhatsApp tidak valid.');
      }
      if (!fs.existsSync(sessionFolder)) {
        fs.mkdirSync(sessionFolder, { recursive: true, mode: 0o700 });
      }

      // Restore credentials from Online MySQL if container restarted and local disk is empty
      if (!hasRegisteredCredsOnDisk(sessionId)) {
        await hydrateSessionAuthFolderFromMysql(sessionId);
      } else {
        scheduleAuthFolderBackup(sessionId);
      }

      const { state, saveCreds } = await createResilientMultiFileAuthState(sessionId, sessionFolder);
      const cachedAuthState = buildCachedAuthState(sessionId, state);
      const cacheStores = getSessionCacheStores(sessionId);
      const version = await resolveBaileysVersion();

      const sock = makeWASocket(
        buildBaileysSocketConfig(version, BAILEYS_SILENT_LOGGER, cachedAuthState, cacheStores)
      );
      try {
        sock.ws?.on?.('error', () => {});
      } catch {}

      const sessionData: SessionState = {
        sessionId,
        userId: preservedUserId,
        socket: sock,
        qrCodeUrl: null,
        pairingCode: null,
        status: 'connecting',
        phoneNumber: preservedPhone,
        lastUpdated: Date.now(),
        handshakeStartedAt: current?.handshakeStartedAt || Date.now(),
        retryCount: prevRetries,
        consecutiveConflicts: prevConflicts,
        superseded: false,
        closedByApp: false
      };

      try {
        let lastPassiveFrameTouch = 0;
        sock.ws?.on?.('frame', () => {
          if (sessionData.superseded || sessionData.status !== 'connected') return;
          const t = Date.now();
          if (t - lastPassiveFrameTouch >= 15_000) {
            lastPassiveFrameTouch = t;
            sessionData.lastUpdated = t;
          }
        });
      } catch {}

      activeSessions.set(sessionId, sessionData);
      writeLocalRuntimeLease(sessionId, {
        userId: preservedUserId,
        phoneNumber: preservedPhone || undefined,
        status: 'connecting',
        startedAt: sessionData.handshakeStartedAt
      });

      // Safe sequential credential saving queue + automatic MySQL backup
      let credsSaveQueue: Promise<void> = Promise.resolve();
      sock.ev.on('creds.update', () => {
        if (sessionData.superseded) return;
        credsSaveQueue = credsSaveQueue.then(async () => {
          if (sessionData.superseded) return;
          try {
            await saveCreds();
            scheduleAuthFolderBackup(sessionId);
          } catch (saveErr) {
            console.warn('[Baileys] Error saving creds:', saveErr);
          }
        });
      });

      sock.ev.on('connection.update', async (update: any) => {
        if (sessionData.superseded) return;
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            const qrUrl = await QRCode.toDataURL(qr, { margin: 2, width: 300 });
            if (sessionData.superseded) return;
            sessionData.qrCodeUrl = qrUrl;
            sessionData.lastUpdated = Date.now();
            activeSessions.set(sessionId, sessionData);
          } catch (e) {
            console.error('[Baileys] Error generating QR data URL:', e);
          }
        }

        if (connection === 'open') {
          if (sessionData.superseded) {
            closeSocketSafelyWithoutLogout(sock, sessionData, sessionId);
            return;
          }
          const rawSockUser = sock.user?.id ? sock.user.id.split('@')[0].split(':')[0] : '';
          const connectedUser = normalizePhoneNumber(rawSockUser || phoneNumber || sessionData.phoneNumber || '');
          if (!connectedUser || connectedUser.length < 8) {
            console.warn(`[Baileys] Connected session ${sessionId} missing valid phone identity; purging.`);
            await purgeBaileysSessionCompletely(sessionId);
            return;
          }

          const db = initDbFile();
          const owner = resolveActiveVerifiedOwner(sessionId, sessionData.userId, connectedUser);
          if (!isOwnerActiveAndRegistered(owner)) {
            console.warn(`[Baileys Security] Connected session ${sessionId} (${connectedUser}) has no active registered user in app. Purging immediately.`);
            await purgeBaileysSessionCompletely(sessionId, connectedUser);
            return;
          }

          console.log(`[Baileys] WhatsApp Connected successfully for session: ${sessionId} (Owner: ${owner!.username})`);
          try {
            await credsSaveQueue;
            await saveCreds();
          } catch {
            // Ignore immediate flush warning; creds.update queue persists async
          }
          if (sessionData.superseded) {
            closeSocketSafelyWithoutLogout(sock, sessionData, sessionId);
            return;
          }

          const openAt = Date.now();
          sessionData.status = 'connected';
          sessionData.phoneNumber = connectedUser;
          sessionData.qrCodeUrl = null;
          sessionData.pairingCode = null;
          sessionData.lastUpdated = openAt;
          sessionData.handshakeStartedAt = openAt;
          sessionData.openedAt = openAt;
          sessionData.disconnectedSince = undefined;
          sessionData.conflictCooldownUntil = undefined;
          sessionData.userId = owner!.id;
          sessionData.is_primary = Boolean(getSessionById(sessionId)?.is_primary);
          clearSessionExpiryNotificationCooldown(sessionId, owner!.id, connectedUser);
          sessionDisconnectDiagnostics.delete(sessionId);
          clearSessionConflictState(sessionId);
          cleanupDuplicateSessionsForOwnerPhone(sessionId, owner!.id, connectedUser);
          activeSessions.set(sessionId, sessionData);
          scheduleAuthFolderBackup(sessionId);
          void publishActiveSessionLease(sessionData, true);

          // Only reset retry/conflict counters once the connection stays stably open (prevents instant reset during 440 ping-pong)
          if (sessionData.stabilityTimer) clearTimeout(sessionData.stabilityTimer);
          sessionData.stabilityTimer = setTimeout(() => {
            const latest = activeSessions.get(sessionId);
            if (latest === sessionData && !latest.superseded && latest.status === 'connected' && isSocketTrulyOpen(latest.socket)) {
              latest.retryCount = 0;
              latest.consecutiveConflicts = 0;
              clearSessionConflictState(sessionId);
              sessionDisconnectDiagnostics.delete(sessionId);
            }
          }, STABLE_OPEN_THRESHOLD_MS);
          sessionData.stabilityTimer.unref?.();

          const isPairingMethod = Boolean(phoneNumber) || sessionId.includes('_pair_');
          const existingDb =
            getSessionById(sessionId) ||
            db.sessions.find(
              s =>
                s.user_id === owner!.id &&
                s.phone_number &&
                normalizePhoneNumber(s.phone_number) === connectedUser
            );
          const expiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
          const openNowIso = new Date().toISOString();
          const currentAppId = getCurrentAppId();
          const displayAppId = getDisplayAppId();
          const resolvedIdNow = await resolveCurrentServerIdentity().catch(() => getCachedOrFallbackIdentity());
          const primaryServerIp =
            normalizeServerIpValue(extractPrimaryIp(resolvedIdNow.serverIp)) ||
            collectAllLocalIpAddresses()[0] ||
            '';
          const effectiveAssignedApp =
            normalizeAppId(existingDb?.assigned_app_id) ||
            normalizeAppId(options?.assignedAppId) ||
            normalizeAppId(owner?.assigned_app_id) ||
            currentAppId;

          if (effectiveAssignedApp && effectiveAssignedApp !== currentAppId) {
            console.warn(
              `[Cluster Exclusivity] Sesi ${sessionId} (${connectedUser}) terhubung di ${currentAppId} padahal ditugaskan ke ${effectiveAssignedApp}. Melepas socket lokal agar hanya berjalan di ${effectiveAssignedApp}.`
            );
            if (existingDb) {
              updateSession(existingDb.id, {
                id: sessionId,
                status: 'disconnected',
                phone_number: connectedUser,
                user_id: owner!.id,
                assigned_app_id: effectiveAssignedApp,
                assigned_server_ip: undefined,
                connected_app_id: '',
                connected_server_ip: '',
                assignment_status: 'delegated',
                assignment_error: `Dialihkan eksklusif ke APP_ID ${effectiveAssignedApp}`,
                last_assignment_at: openNowIso,
                expires_at: existingDb.expires_at || expiryDate
              });
            } else {
              addSession({
                id: sessionId,
                session_name: isPairingMethod ? `WA Pair - ${connectedUser}` : `WA - ${connectedUser}`,
                phone_number: connectedUser,
                auth_method: isPairingMethod ? 'pairing_code' : 'qr_code',
                status: 'disconnected',
                user_id: owner!.id,
                is_primary: true,
                assigned_app_id: effectiveAssignedApp,
                assignment_status: 'delegated',
                assignment_error: `Dialihkan eksklusif ke APP_ID ${effectiveAssignedApp}`,
                last_assignment_at: openNowIso,
                connected_at: openNowIso,
                expires_at: expiryDate
              });
            }
            void updateSessionAssignmentInMysql(sessionId, {
              assigned_app_id: effectiveAssignedApp,
              assigned_server_ip: '',
              connected_app_id: '',
              connected_server_ip: '',
              assignment_status: 'delegated',
              assignment_error: `Dialihkan eksklusif ke APP_ID ${effectiveAssignedApp}`,
              last_assignment_at: openNowIso,
              status: 'disconnected'
            }).catch(() => {});
            await releaseLocalSocketForDelegation(sessionId).catch(() => {});
            return;
          }

          void deleteWaSessionConflictFromMysql(sessionId).catch(() => {});
          if (existingDb) {
            if (existingDb.id !== sessionId) {
              sessionDisconnectDiagnostics.delete(existingDb.id);
              clearSessionConflictState(existingDb.id);
              void deleteWaSessionConflictFromMysql(existingDb.id).catch(() => {});
            }
            const existingExpiryMs = existingDb.expires_at ? Date.parse(existingDb.expires_at) : 0;
            updateSession(existingDb.id, {
              id: sessionId,
              status: 'connected',
              phone_number: connectedUser,
              user_id: owner!.id,
              assigned_app_id: effectiveAssignedApp,
              assigned_server_ip: undefined,
              connected_app_id: displayAppId,
              connected_server_ip: primaryServerIp || undefined,
              failed_app_ids: [],
              assignment_status: 'connected',
              assignment_error: '',
              last_assignment_at: openNowIso,
              connected_at: existingDb.connected_at || openNowIso,
              last_activity_at: openNowIso,
              expires_at: existingExpiryMs > Date.now() + 30 * 24 * 60 * 60 * 1000 ? existingDb.expires_at : expiryDate
            });
          } else {
            addSession({
              id: sessionId,
              session_name: isPairingMethod ? `WA Pair - ${connectedUser}` : `WA - ${connectedUser}`,
              phone_number: connectedUser,
              auth_method: isPairingMethod ? 'pairing_code' : 'qr_code',
              status: 'connected',
              user_id: owner!.id,
              is_primary: true,
              assigned_app_id: effectiveAssignedApp,
              connected_app_id: displayAppId,
              connected_server_ip: primaryServerIp || undefined,
              failed_app_ids: [],
              assignment_status: 'connected',
              assignment_error: '',
              last_assignment_at: openNowIso,
              connected_at: openNowIso,
              last_activity_at: openNowIso,
              expires_at: expiryDate
            });
          }
          void updateSessionAssignmentInMysql(sessionId, {
            assigned_app_id: effectiveAssignedApp,
            assigned_server_ip: '',
            connected_app_id: displayAppId,
            connected_server_ip: primaryServerIp || undefined,
            failed_app_ids: [],
            assignment_status: 'connected',
            assignment_error: '',
            last_assignment_at: openNowIso,
            status: 'connected'
          }).catch(() => {});
          void publishCurrentSocketRecord({ force: true }).catch(() => {});

          const warmTimer = setTimeout(() => {
            const latest = activeSessions.get(sessionId);
            if (latest === sessionData && !latest.superseded && latest.status === 'connected' && isSocketTrulyOpen(latest.socket)) {
              void warmMetaAiSession(sessionId, sock);
              void processPendingMissedMessagesForSession(sessionId, 'session_open');
            }
          }, 2200);
          warmTimer.unref?.();

          if (owner!.role === 'admin') {
            setTimeout(() => {
              drainSuperadminWaQueue('admin_session_open').catch(() => {});
              processPendingSessionExpiryAlerts('admin_session_open').catch(() => {});
            }, 2500);
          }
        } else if (connection === 'close') {
          if (sessionData.stabilityTimer) {
            clearTimeout(sessionData.stabilityTimer);
            sessionData.stabilityTimer = undefined;
          }

          // Ignore close events from a superseded socket BEFORE recording any diagnostics or touching activeSessions
          const latestBeforeClose = activeSessions.get(sessionId);
          if (
            sessionData.superseded ||
            (latestBeforeClose && latestBeforeClose !== sessionData && latestBeforeClose.socket && latestBeforeClose.socket !== sock)
          ) {
            return;
          }

          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          const disconnectErrMsg = (lastDisconnect?.error as any)?.message ? String((lastDisconnect?.error as any).message) : '';
          const isPermanentLogout = isPermanentLogoutCode(statusCode);
          const isRestartRequired = isRestartRequiredCode(statusCode);
          const isConflict440 = isConnectionReplacedCode(statusCode);
          const hasInMemRegistered = Boolean(sock.authState?.creds?.registered || sock.user?.id);
          if (hasInMemRegistered || isRestartRequired) {
            try {
              await credsSaveQueue;
              await saveCreds();
            } catch {}
          }

          const latestAfterSave = activeSessions.get(sessionId);
          if (
            sessionData.superseded ||
            (latestAfterSave && latestAfterSave !== sessionData && latestAfterSave.socket && latestAfterSave.socket !== sock)
          ) {
            return;
          }

          const existingMeta = getSessionById(sessionId);
          const isRegistered =
            hasRegisteredCredsOnDisk(sessionId) ||
            hasInMemRegistered ||
            Boolean(existingMeta?.connected_at);

          if (isRestartRequired) {
            console.log(
              `[Baileys] Handshake restart required (status ${statusCode ?? 515}, registered: ${isRegistered}) untuk ${sessionId}; menyambung ulang soket...`
            );
          } else if (isConflict440) {
            console.log(
              `[Baileys] Sesi ${sessionId} mengalami pergantian stream (status 440, registered: ${isRegistered}); mengevaluasi pemulihan otomatis...`
            );
          } else {
            console.log(
              `[Baileys] Connection closed for ${sessionId}. Status: ${statusCode}. Registered: ${isRegistered}. PermanentLogout: ${isPermanentLogout}${disconnectErrMsg ? `. Reason: ${disconnectErrMsg}` : ''}`
            );
          }

          try {
            sessionData.detachRawHandlers?.();
            sock.ev?.removeAllListeners?.('connection.update');
            sock.ev?.removeAllListeners?.('creds.update');
            sock.ev?.removeAllListeners?.('messages.upsert');
            sock.ev?.removeAllListeners?.('messages.update');
            sock.ws?.removeAllListeners?.();
            try {
              sock.ws?.on?.('error', () => {});
            } catch {}
          } catch {
            // Ignore listener cleanup errors on closed socket
          }

          recordLastCloseTimestamp(sessionId);
          removeLocalRuntimeLease(sessionId, RUNTIME_INSTANCE_ID);
          sessionData.qrCodeUrl = null;
          sessionData.pairingCode = null;
          sessionData.socket = null;

          if (isPermanentLogout) {
            sessionDisconnectDiagnostics.delete(sessionId);
            clearSessionConflictState(sessionId);
            console.warn(`[Baileys Auto-Purge] Sesi ${sessionId} logout permanen (status ${statusCode}). Menghapus kredensial & data sesi...`);
            const wasPreviouslyLinked = isRegistered || Boolean(sessionData.phoneNumber) || existingMeta?.status === 'connected';
            if (wasPreviouslyLinked) {
              await notifyUserSessionExpired({
                sessionId,
                sessionName: existingMeta?.session_name,
                expiredPhone: sessionData.phoneNumber || existingMeta?.phone_number,
                userId: sessionData.userId || existingMeta?.user_id,
                reason: statusCode === DisconnectReason.loggedOut || statusCode === 401
                  ? 'keluar / terputus dari Perangkat Tertaut di HP'
                  : `terputus permanen (kode ${statusCode})`
              }).catch(() => {});
              const ownerLogout = (sessionData.userId || existingMeta?.user_id)
                ? getUserById((sessionData.userId || existingMeta?.user_id)!)
                : undefined;
              void sendTelegramAlert({
                title: 'Perangkat WhatsApp Terputus / Logout Permanen',
                severity: 'warn',
                dedupKey: `wa_logout_${sessionId}`,
                cooldownMs: 60_000,
                lines: [
                  `• Nomor WA: <code>+${escapeTelegramHtml(sessionData.phoneNumber || existingMeta?.phone_number || '-')}</code>`,
                  `• Sesi: ${escapeTelegramHtml(existingMeta?.session_name || sessionId)}`,
                  `• Pemilik: ${escapeTelegramHtml(ownerLogout ? `${ownerLogout.name} (@${ownerLogout.username})` : (sessionData.userId || '-'))}`,
                  `• APP_ID: <code>${escapeTelegramHtml(getDisplayAppId())}</code>`,
                  `• Kode Status: <code>${escapeTelegramHtml(String(statusCode ?? '-'))}</code>`
                ]
              }).catch(() => {});
            }
            await purgeBaileysSessionCompletely(sessionId, sessionData.phoneNumber || undefined);
            return;
          }

          if (!isRegistered && !isRestartRequired) {
            // Unregistered QR/pairing handshake failed or timed out without linking: clean up without touching unrelated sessions
            console.log(`[Baileys Auto-Purge] Sesi ${sessionId} belum terhubung/timeout (${statusCode}). Menghapus folder & cache sementara...`);
            await purgeBaileysSessionCompletely(sessionId, sessionData.phoneNumber || undefined);
            return;
          }

          const owner = resolveActiveVerifiedOwner(sessionId, sessionData.userId, sessionData.phoneNumber || getCredsPhoneOnDisk(sessionId));
          if (!isOwnerActiveAndRegistered(owner)) {
            console.warn(`[Baileys Auto-Purge] Pemilik sesi ${sessionId} tidak aktif/terdaftar lagi. Menghapus sesi...`);
            await purgeBaileysSessionCompletely(sessionId, sessionData.phoneNumber || undefined);
            return;
          }

          const cleanSockPhone = normalizePhoneNumber(sessionData.phoneNumber || getCredsPhoneOnDisk(sessionId) || '');
          const competingInProcess =
            isConflict440 && cleanSockPhone
              ? hasOtherActiveOrConnectingSocketForPhone(sessionId, cleanSockPhone, owner!.id)
              : null;

          if (competingInProcess) {
            console.log(
              `[Baileys Dedup] Socket ${sessionId} mengalah kepada sesi aktif "${competingInProcess.sessionId}" untuk +${cleanSockPhone}; tanpa memicu peringatan konflik.`
            );
            clearSessionTimers(sessionId);
            clearMetaAiSession(sessionId);
            sessionDisconnectDiagnostics.delete(sessionId);
            clearSessionConflictState(sessionId);
            if (activeSessions.get(sessionId) === sessionData) {
              activeSessions.delete(sessionId);
            }
            return;
          }

          recordDisconnectDiagnostic(sessionId, statusCode, disconnectErrMsg);

          if (isConflict440) {
            // 1. Yield quietly if another worker/container on the SAME domain & IP already owns this session
            const liveLocalSibling = findLiveLocalSiblingLease({
              sessionId,
              userId: owner!.id,
              cleanPhone: cleanSockPhone
            });
            if (liveLocalSibling) {
              clearSessionTimers(sessionId);
              clearMetaAiSession(sessionId);
              sessionDisconnectDiagnostics.delete(sessionId);
              clearSessionConflictState(sessionId);
              if (activeSessions.get(sessionId) === sessionData) {
                activeSessions.delete(sessionId);
              }
              return;
            }

            const remoteLease440 = await evaluateRemoteLeaseForSession({
              sessionId,
              userId: owner!.id,
              cleanPhone: cleanSockPhone,
              assignedAppId: existingMeta?.assigned_app_id,
              forceRefresh: true
            });
            if (remoteLease440.status === 'same_domain_ip' || remoteLease440.status === 'remote_cluster_node') {
              clearSessionTimers(sessionId);
              clearMetaAiSession(sessionId);
              sessionDisconnectDiagnostics.delete(sessionId);
              clearSessionConflictState(sessionId);
              if (activeSessions.get(sessionId) === sessionData) {
                activeSessions.delete(sessionId);
              }
              return;
            }

            const nowMs = Date.now();
            const nextConflictCount = (sessionConflictStates.get(sessionId)?.count || sessionData.consecutiveConflicts || 0) + 1;

            sessionData.consecutiveConflicts = nextConflictCount;
            sessionData.retryCount = Math.max((sessionData.retryCount || 0) + 1, nextConflictCount);

            const hasExternalLease = remoteLease440.status === 'different_ip' && Boolean(remoteLease440.lease);
            const prelimPolicy = computeConflictCooldownMs(nextConflictCount, hasExternalLease);
            let cooldownUntil = nowMs + prelimPolicy.cooldownMs;
            let conflictReason: 'transient' | 'external_conflict' = prelimPolicy.reason;

            clearSessionTimers(sessionId);
            sessionData.status = 'disconnected';
            sessionData.disconnectedSince = nowMs;
            sessionData.lastUpdated = nowMs;

            const cDetail = await captureAndStoreConflictDiagnostic({
              sessionId,
              ownerId: owner!.id,
              cleanPhone: cleanSockPhone,
              sessionName: existingMeta?.session_name,
              disconnectErr: lastDisconnect?.error,
              disconnectErrMsg,
              cooldownUntil
            }).catch(() => null);

            if (cDetail?.source_type === 'same_server') {
              clearSessionConflictState(sessionId);
              sessionDisconnectDiagnostics.delete(sessionId);
              if (activeSessions.get(sessionId) === sessionData) {
                activeSessions.delete(sessionId);
              }
              return;
            }

            const confirmedExternalCompetitor =
              hasExternalLease ||
              cDetail?.source_type === 'remote_instance' ||
              Boolean(cDetail?.competing_ip);
            const finalPolicy = computeConflictCooldownMs(nextConflictCount, confirmedExternalCompetitor);
            cooldownUntil = nowMs + finalPolicy.cooldownMs;
            conflictReason = finalPolicy.reason;

            sessionConflictStates.set(sessionId, {
              count: nextConflictCount,
              cooldownUntil,
              lastConflictAt: nowMs,
              reason: conflictReason
            });
            sessionData.conflictCooldownUntil = cooldownUntil;
            activeSessions.set(sessionId, sessionData);
            if (cDetail) {
              cDetail.cooldown_until = new Date(cooldownUntil).toISOString();
            }

            // If another server with different IP in shared DB still holds a live lease, keep it noted without forcing reconnect
            if (remoteLease440.status === 'different_ip' && remoteLease440.lease) {
              console.warn(
                `[Baileys Conflict Guard] Sesi ${sessionId} terdeteksi aktif di server lain (${remoteLease440.lease.domain || '-'} / IP ${remoteLease440.lease.server_ip || '-'}). Auto-reconnect dihentikan agar tidak bentrok.`
              );
              return;
            }

            if (conflictReason === 'transient') {
              console.warn(
                `[Baileys Conflict Guard] Sesi ${sessionId} mengalami stream conflict 440 sementara (#${nextConflictCount}) tanpa server pesaing aktif. Auto-recovery dijadwalkan dalam ${Math.round(finalPolicy.cooldownMs / 1000)} detik.`
              );
              scheduleTransient440Recovery({
                sessionId,
                sessionData,
                ownerId: owner!.id,
                cleanPhone: cleanSockPhone,
                delayMs: finalPolicy.cooldownMs
              });
              return;
            }

            console.warn(
              `[Baileys Conflict Guard] Sesi ${sessionId} mengalami konflik 440 berulang/eksternal (#${nextConflictCount}). Auto-reconnect dijeda agar sesi aktif tidak terganggu.${cDetail?.competing_ip ? ` Sumber lain: ${cDetail.competing_domain || '-'} (IP ${cDetail.competing_ip}).` : ''}`
            );
            void sendTelegramAlert({
              title: 'Konflik Koneksi WhatsApp (440)',
              severity: 'warn',
              dedupKey: `conflict_440_${sessionId}`,
              cooldownMs: 300_000,
              lines: [
                `• Nomor WA: <code>+${escapeTelegramHtml(cleanSockPhone || '-')}</code>`,
                `• Sesi: ${escapeTelegramHtml(existingMeta?.session_name || sessionId)}`,
                `• APP_ID Terdampak: <code>${escapeTelegramHtml(getDisplayAppId())}</code>`,
                cDetail?.competing_ip
                  ? `• Sumber Lain: ${escapeTelegramHtml(cDetail.competing_domain || '-')} (IP <code>${escapeTelegramHtml(cDetail.competing_ip)}</code>)`
                  : '• Sumber Lain: Konflik 440 berulang (kemungkinan stream / perangkat ganda, cooldown aktif)'
              ]
            }).catch(() => {});
            return;
          } else if (!isRestartRequired) {
            sessionData.retryCount = (sessionData.retryCount || 0) + 1;
          }

          // Only abort/purge unregistered handshakes if they repeatedly fail before ever linking
          if (!isRegistered && sessionData.retryCount > 5) {
            console.warn(`[Baileys Auto-Purge] Handshake baru ${sessionId} gagal berulang (${sessionData.retryCount}x) tanpa tertaut. Menghapus sesi sementara...`);
            await purgeBaileysSessionCompletely(sessionId, sessionData.phoneNumber || undefined);
            return;
          }

          sessionData.status = 'connecting';
          sessionData.lastUpdated = Date.now();
          activeSessions.set(sessionId, sessionData);
          const reconnectDelay = computePersistentReconnectDelay(sessionData.retryCount, statusCode);
          if (isRestartRequired) {
            console.log(
              `[Baileys Persistent Reconnect] Melanjutkan handshake sesi ${sessionId} dalam ${Math.round(reconnectDelay)}ms...`
            );
          } else {
            console.log(
              `[Baileys Persistent Reconnect] Menghubungkan ulang sesi ${sessionId} dalam ${Math.round(reconnectDelay)}ms (percobaan ke-${sessionData.retryCount})...`
            );
          }
          clearSessionTimers(sessionId);
          const rTimer = setTimeout(async () => {
            reconnectTimers.delete(sessionId);
            if (sessionData.superseded) return;
            try {
              await credsSaveQueue;
            } catch {}
            if (sessionData.superseded) return;
            if (!resolveActiveVerifiedOwner(sessionId, sessionData.userId, sessionData.phoneNumber || getCredsPhoneOnDisk(sessionId))) {
              await purgeBaileysSessionCompletely(sessionId);
              return;
            }
            getOrStartBaileysSession(
              sessionId,
              phoneNumber || sessionData.phoneNumber || undefined,
              sessionData.userId,
              { isAutoReconnect: true }
            ).catch(() => {});
          }, reconnectDelay);
          rTimer.unref?.();
          reconnectTimers.set(sessionId, rTimer);
        }
      });

      // Attach messages upsert listener
      attachSocketMessageListener(sock, sessionId, sessionData);

      return sessionData;
    } finally {
      sessionStartLocks.delete(sessionId);
    }
  })();

  sessionStartLocks.set(sessionId, initPromise);
  return initPromise;
}

// Request real WhatsApp pairing code via Baileys socket
export async function requestBaileysPairingCode(
  rawSessionId: string,
  phoneNumber: string,
  userId?: string,
  options?: { bypassNodeGuard?: boolean; assignedAppId?: string }
): Promise<string> {
  if (isSelfKilledByIpRule) {
    throw new Error(`Socket WhatsApp pada server ini telah dimatikan oleh aturan Admin (${selfKilledReason || 'Kill IP'}).`);
  }
  const sessionId = sanitizeSessionId(rawSessionId);
  const cleanPhone = normalizePhoneNumber(phoneNumber);
  if (!cleanPhone || cleanPhone.length < 9) {
    throw new Error('Nomor telepon tidak valid. Gunakan format lengkap (contoh: 0812... atau 62812...).');
  }

  const dbSessForPair = getSessionById(sessionId);
  const ownerForPair = (userId || dbSessForPair?.user_id) ? getUserById((userId || dbSessForPair?.user_id)!) : undefined;
  const pairGuardTarget: Pick<WhatsAppSession, 'id' | 'user_id' | 'assigned_app_id' | 'assignment_status'> =
    dbSessForPair || {
      id: sessionId,
      user_id: userId,
      assigned_app_id: options?.assignedAppId ? normalizeAppId(options.assignedAppId) || undefined : undefined
    };
  if (!options?.bypassNodeGuard && !isSessionOwnedByCurrentAppNode(pairGuardTarget, undefined, ownerForPair)) {
    await releaseLocalSocketForDelegation(sessionId).catch(() => {});
    const targetApp = resolveEffectiveAssignedAppId(pairGuardTarget, ownerForPair);
    throw new Error(
      `Sesi pairing ini ditugaskan secara eksklusif ke APP_ID "${targetApp || 'lain'}".`
    );
  }

  clearSessionTimers(sessionId);
  clearSessionConflictState(sessionId);
  sessionDisconnectDiagnostics.delete(sessionId);

  // Wait completely for any in-flight start lock on this sessionId so two sockets never race
  let pendingStartLock = sessionStartLocks.get(sessionId);
  while (pendingStartLock) {
    await pendingStartLock.catch(() => {});
    pendingStartLock = sessionStartLocks.get(sessionId);
  }

  let resolvePairLock!: (s: SessionState) => void;
  const pairSetupLock = new Promise<SessionState>(resolve => {
    resolvePairLock = resolve;
  });
  sessionStartLocks.set(sessionId, pairSetupLock);

  let sessionData!: SessionState;
  let sock: any;
  let saveCreds!: () => Promise<void>;

  try {
    // Also close any competing open/connecting socket for the same owner + phone on a different sessionId
    await closeCompetingSocketsForOwnerPhone(sessionId, cleanPhone, userId);

    // Safely stop existing sockets on this session ID without deleting DB records yet
    const existing = activeSessions.get(sessionId);
    if (existing) {
      existing.superseded = true;
      existing.closedByApp = true;
    }
    if (existing && existing.socket) {
      await closeSocketAndWait(existing.socket, existing, sessionId, 2000);
    }
    if (activeSessions.get(sessionId) === existing) {
      activeSessions.delete(sessionId);
    }

    await waitForHandoffCloseGraceIfNeeded(sessionId);

    const sessionFolder = safeSessionFolderPath(sessionId);
    if (!sessionFolder) {
      throw new Error('ID sesi WhatsApp tidak valid.');
    }
    if (fs.existsSync(sessionFolder)) {
      try {
        fs.rmSync(sessionFolder, { recursive: true, force: true });
      } catch (e) {
        console.warn('[Baileys] Warning cleaning session folder for new pairing:', e);
      }
    }
    fs.mkdirSync(sessionFolder, { recursive: true, mode: 0o700 });

    const authRes = await createResilientMultiFileAuthState(sessionId, sessionFolder);
    saveCreds = authRes.saveCreds;
    const cachedAuthState = buildCachedAuthState(sessionId, authRes.state);
    const cacheStores = getSessionCacheStores(sessionId);
    const version = await resolveBaileysVersion();

    sock = makeWASocket(
      buildBaileysSocketConfig(version, BAILEYS_SILENT_LOGGER, cachedAuthState, cacheStores)
    );
    try {
      sock.ws?.on?.('error', () => {});
    } catch {}

    sessionData = {
      sessionId,
      userId,
      socket: sock,
      qrCodeUrl: null,
      pairingCode: null,
      status: 'connecting',
      phoneNumber: cleanPhone,
      lastUpdated: Date.now(),
      handshakeStartedAt: Date.now(),
      retryCount: 0,
      consecutiveConflicts: 0,
      superseded: false,
      closedByApp: false
    };

    try {
      let lastPairPassiveFrameTouch = 0;
      sock.ws?.on?.('frame', () => {
        if (sessionData.superseded || sessionData.status !== 'connected') return;
        const t = Date.now();
        if (t - lastPairPassiveFrameTouch >= 15_000) {
          lastPairPassiveFrameTouch = t;
          sessionData.lastUpdated = t;
        }
      });
    } catch {}

    activeSessions.set(sessionId, sessionData);
    writeLocalRuntimeLease(sessionId, {
      userId,
      phoneNumber: cleanPhone,
      status: 'connecting',
      startedAt: sessionData.handshakeStartedAt
    });
  } catch (setupErr) {
    sessionStartLocks.delete(sessionId);
    resolvePairLock(sessionData);
    throw setupErr;
  }

  // Safe sequential credential saving queue for pairing session
  let pairCredsSaveQueue: Promise<void> = Promise.resolve();
  sock.ev.on('creds.update', () => {
    if (sessionData.superseded) return;
    pairCredsSaveQueue = pairCredsSaveQueue.then(async () => {
      if (sessionData.superseded) return;
      try {
        await saveCreds();
        scheduleAuthFolderBackup(sessionId);
      } catch (saveErr) {
        console.warn('[Baileys Pairing] Error saving creds:', saveErr);
      }
    });
  });

  sock.ev.on('connection.update', async (update: any) => {
    if (sessionData.superseded) return;
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      if (sessionData.superseded) {
        closeSocketSafelyWithoutLogout(sock, sessionData, sessionId);
        return;
      }
      const rawSockUser = sock.user?.id ? sock.user.id.split('@')[0].split(':')[0] : '';
      const connectedUser = normalizePhoneNumber(rawSockUser || cleanPhone);
      const owner = resolveActiveVerifiedOwner(sessionId, sessionData.userId || userId, connectedUser);
      if (!isOwnerActiveAndRegistered(owner)) {
        console.warn(`[Baileys Pairing Security] Connected session ${sessionId} has no active registered owner. Purging.`);
        await purgeBaileysSessionCompletely(sessionId, connectedUser);
        return;
      }

      console.log(`[Baileys Pairing] Connected & Linked successfully! User: ${sock.user?.id}`);
      try {
        await pairCredsSaveQueue;
        await saveCreds();
      } catch {
        // Ignore flush warning; creds.update queue persists async
      }
      if (sessionData.superseded) {
        closeSocketSafelyWithoutLogout(sock, sessionData, sessionId);
        return;
      }

      const openAt = Date.now();
      sessionData.status = 'connected';
      sessionData.phoneNumber = connectedUser;
      sessionData.pairingCode = null;
      sessionData.lastUpdated = openAt;
      sessionData.handshakeStartedAt = openAt;
      sessionData.openedAt = openAt;
      sessionData.disconnectedSince = undefined;
      sessionData.conflictCooldownUntil = undefined;
      sessionData.userId = owner!.id;
      clearSessionExpiryNotificationCooldown(sessionId, owner!.id, connectedUser);
      sessionDisconnectDiagnostics.delete(sessionId);
      clearSessionConflictState(sessionId);
      cleanupDuplicateSessionsForOwnerPhone(sessionId, owner!.id, connectedUser);
      activeSessions.set(sessionId, sessionData);
      scheduleAuthFolderBackup(sessionId);
      void publishActiveSessionLease(sessionData, true);

      if (sessionData.stabilityTimer) clearTimeout(sessionData.stabilityTimer);
      sessionData.stabilityTimer = setTimeout(() => {
        const latest = activeSessions.get(sessionId);
        if (latest === sessionData && !latest.superseded && latest.status === 'connected' && isSocketTrulyOpen(latest.socket)) {
          latest.retryCount = 0;
          latest.consecutiveConflicts = 0;
          clearSessionConflictState(sessionId);
          sessionDisconnectDiagnostics.delete(sessionId);
        }
      }, STABLE_OPEN_THRESHOLD_MS);
      sessionData.stabilityTimer.unref?.();

      const db = initDbFile();
      const existingDb =
        getSessionById(sessionId) ||
        db.sessions.find(
          s =>
            s.user_id === owner!.id &&
            s.phone_number &&
            normalizePhoneNumber(s.phone_number) === connectedUser
        );
      const expiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      const pairOpenIso = new Date().toISOString();
      const currentAppId = getCurrentAppId();
      const displayAppId = getDisplayAppId();
      const resolvedIdNow = await resolveCurrentServerIdentity().catch(() => getCachedOrFallbackIdentity());
      const primaryServerIp =
        normalizeServerIpValue(extractPrimaryIp(resolvedIdNow.serverIp)) ||
        collectAllLocalIpAddresses()[0] ||
        '';
      const effectiveAssignedApp =
        normalizeAppId(existingDb?.assigned_app_id) ||
        normalizeAppId(options?.assignedAppId) ||
        normalizeAppId(owner?.assigned_app_id) ||
        currentAppId;

      if (effectiveAssignedApp && effectiveAssignedApp !== currentAppId) {
        console.warn(
          `[Cluster Exclusivity] Pairing ${sessionId} (${connectedUser}) terhubung di ${currentAppId} padahal ditugaskan ke ${effectiveAssignedApp}. Melepas socket lokal.`
        );
        if (existingDb) {
          updateSession(existingDb.id, {
            id: sessionId,
            status: 'disconnected',
            phone_number: connectedUser,
            user_id: owner!.id,
            assigned_app_id: effectiveAssignedApp,
            assigned_server_ip: undefined,
            connected_app_id: '',
            connected_server_ip: '',
            assignment_status: 'delegated',
            assignment_error: `Dialihkan eksklusif ke APP_ID ${effectiveAssignedApp}`,
            last_assignment_at: pairOpenIso,
            expires_at: existingDb.expires_at || expiryDate
          });
        } else {
          addSession({
            id: sessionId,
            session_name: `WA Pair - ${connectedUser}`,
            phone_number: connectedUser,
            auth_method: 'pairing_code',
            status: 'disconnected',
            user_id: owner!.id,
            is_primary: true,
            assigned_app_id: effectiveAssignedApp,
            assignment_status: 'delegated',
            assignment_error: `Dialihkan eksklusif ke APP_ID ${effectiveAssignedApp}`,
            last_assignment_at: pairOpenIso,
            connected_at: pairOpenIso,
            expires_at: expiryDate
          });
        }
        void updateSessionAssignmentInMysql(sessionId, {
          assigned_app_id: effectiveAssignedApp,
          assigned_server_ip: '',
          connected_app_id: '',
          connected_server_ip: '',
          assignment_status: 'delegated',
          assignment_error: `Dialihkan eksklusif ke APP_ID ${effectiveAssignedApp}`,
          last_assignment_at: pairOpenIso,
          status: 'disconnected'
        }).catch(() => {});
        await releaseLocalSocketForDelegation(sessionId).catch(() => {});
        return;
      }

      void deleteWaSessionConflictFromMysql(sessionId).catch(() => {});
      if (existingDb) {
        if (existingDb.id !== sessionId) {
          sessionDisconnectDiagnostics.delete(existingDb.id);
          clearSessionConflictState(existingDb.id);
          void deleteWaSessionConflictFromMysql(existingDb.id).catch(() => {});
        }
        const existingExpiryMs = existingDb.expires_at ? Date.parse(existingDb.expires_at) : 0;
        updateSession(existingDb.id, {
          id: sessionId,
          status: 'connected',
          phone_number: connectedUser,
          user_id: owner!.id,
          assigned_app_id: effectiveAssignedApp,
          assigned_server_ip: undefined,
          connected_app_id: displayAppId,
          connected_server_ip: primaryServerIp || undefined,
          failed_app_ids: [],
          assignment_status: 'connected',
          assignment_error: '',
          last_assignment_at: pairOpenIso,
          connected_at: existingDb.connected_at || pairOpenIso,
          last_activity_at: pairOpenIso,
          expires_at: existingExpiryMs > Date.now() + 30 * 24 * 60 * 60 * 1000 ? existingDb.expires_at : expiryDate
        });
      } else {
        addSession({
          id: sessionId,
          session_name: `WA Pair - ${connectedUser}`,
          phone_number: connectedUser,
          auth_method: 'pairing_code',
          status: 'connected',
          user_id: owner!.id,
          is_primary: true,
          assigned_app_id: effectiveAssignedApp,
          connected_app_id: displayAppId,
          connected_server_ip: primaryServerIp || undefined,
          failed_app_ids: [],
          assignment_status: 'connected',
          assignment_error: '',
          last_assignment_at: pairOpenIso,
          connected_at: pairOpenIso,
          last_activity_at: pairOpenIso,
          expires_at: expiryDate
        });
      }
      void updateSessionAssignmentInMysql(sessionId, {
        assigned_app_id: effectiveAssignedApp,
        assigned_server_ip: '',
        connected_app_id: displayAppId,
        connected_server_ip: primaryServerIp || undefined,
        failed_app_ids: [],
        assignment_status: 'connected',
        assignment_error: '',
        last_assignment_at: pairOpenIso,
        status: 'connected'
      }).catch(() => {});
      void publishCurrentSocketRecord({ force: true }).catch(() => {});

        const pairWarmTimer = setTimeout(() => {
          const latest = activeSessions.get(sessionId);
          if (latest === sessionData && !latest.superseded && latest.status === 'connected' && isSocketTrulyOpen(latest.socket)) {
            void warmMetaAiSession(sessionId, sock);
            void processPendingMissedMessagesForSession(sessionId, 'pairing_open');
          }
        }, 2200);
        pairWarmTimer.unref?.();

        if (owner!.role === 'admin') {
          setTimeout(() => {
            drainSuperadminWaQueue('admin_pairing_open').catch(() => {});
            processPendingSessionExpiryAlerts('admin_pairing_open').catch(() => {});
          }, 2500);
        }
      } else if (connection === 'close') {
      if (sessionData.stabilityTimer) {
        clearTimeout(sessionData.stabilityTimer);
        sessionData.stabilityTimer = undefined;
      }

      const latestBeforeClose = activeSessions.get(sessionId);
      if (
        sessionData.superseded ||
        (latestBeforeClose && latestBeforeClose !== sessionData && latestBeforeClose.socket && latestBeforeClose.socket !== sock)
      ) {
        return;
      }

      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const disconnectErrMsg = (lastDisconnect?.error as any)?.message ? String((lastDisconnect?.error as any).message) : '';
      const isPermanentLogout = isPermanentLogoutCode(statusCode);
      const isPairRestartRequired = isRestartRequiredCode(statusCode);
      const isPairConflict440 = isConnectionReplacedCode(statusCode);
      const hasInMemRegistered = Boolean(sock.authState?.creds?.registered || sock.user?.id);
      if (hasInMemRegistered || isPairRestartRequired) {
        try {
          await pairCredsSaveQueue;
          await saveCreds();
        } catch {}
      }

      const latestSession = activeSessions.get(sessionId);
      if (
        sessionData.superseded ||
        (latestSession && latestSession !== sessionData && latestSession.socket && latestSession.socket !== sock)
      ) {
        return;
      }

      const existingMeta = getSessionById(sessionId);
      const isRegistered =
        hasRegisteredCredsOnDisk(sessionId) ||
        hasInMemRegistered ||
        Boolean(existingMeta?.connected_at);

      if (isPairRestartRequired) {
        console.log(
          `[Baileys Pairing] Handshake restart required (code ${statusCode ?? 515}, registered: ${isRegistered}) untuk ${sessionId}; menyambung ulang sesi...`
        );
      } else if (isPairConflict440) {
        console.log(
          `[Baileys Pairing] Sesi ${sessionId} mengalami pergantian stream (status 440, registered: ${isRegistered}); mengevaluasi pemulihan otomatis...`
        );
      } else {
        console.log(
          `[Baileys Pairing] Connection closed ${sessionId}, code: ${statusCode}, registered: ${isRegistered}${disconnectErrMsg ? `, reason: ${disconnectErrMsg}` : ''}`
        );
      }

      try {
        sessionData.detachRawHandlers?.();
        sock.ev?.removeAllListeners?.('connection.update');
        sock.ev?.removeAllListeners?.('creds.update');
        sock.ev?.removeAllListeners?.('messages.upsert');
        sock.ev?.removeAllListeners?.('messages.update');
        sock.ws?.removeAllListeners?.();
        try {
          sock.ws?.on?.('error', () => {});
        } catch {}
      } catch {
        // Ignore listener cleanup errors on closed pairing socket
      }

      recordLastCloseTimestamp(sessionId);
      removeLocalRuntimeLease(sessionId, RUNTIME_INSTANCE_ID);
      sessionData.socket = null;

      if (isPermanentLogout || (!isRegistered && !isPairRestartRequired)) {
        sessionDisconnectDiagnostics.delete(sessionId);
        clearSessionConflictState(sessionId);
        console.warn(`[Baileys Pairing Auto-Purge] Sesi pairing ${sessionId} terputus/batal (${statusCode}). Menghapus sesi sementara...`);
        if (isPermanentLogout && (isRegistered || existingMeta?.status === 'connected')) {
          await notifyUserSessionExpired({
            sessionId,
            sessionName: existingMeta?.session_name,
            expiredPhone: sessionData.phoneNumber || cleanPhone || existingMeta?.phone_number,
            userId: sessionData.userId || userId || existingMeta?.user_id,
            reason: statusCode === DisconnectReason.loggedOut || statusCode === 401
              ? 'keluar / terputus dari Perangkat Tertaut di HP'
              : `terputus permanen (kode ${statusCode})`
          }).catch(() => {});
        }
        await purgeBaileysSessionCompletely(sessionId, cleanPhone);
        return;
      }

      const pairOwner = resolveActiveVerifiedOwner(sessionId, sessionData.userId || userId, sessionData.phoneNumber || cleanPhone);
      if (!isOwnerActiveAndRegistered(pairOwner)) {
        console.warn(`[Baileys Pairing Auto-Purge] Pemilik sesi pairing ${sessionId} tidak aktif/terdaftar. Menghapus sesi...`);
        await purgeBaileysSessionCompletely(sessionId, cleanPhone);
        return;
      }

      const competingPairInProcess =
        isPairConflict440 && cleanPhone
          ? hasOtherActiveOrConnectingSocketForPhone(sessionId, cleanPhone, pairOwner!.id)
          : null;
      if (competingPairInProcess) {
        console.log(
          `[Baileys Pairing Dedup] Socket ${sessionId} mengalah kepada sesi aktif "${competingPairInProcess.sessionId}" untuk +${cleanPhone}; tanpa peringatan konflik.`
        );
        clearSessionTimers(sessionId);
        clearMetaAiSession(sessionId);
        sessionDisconnectDiagnostics.delete(sessionId);
        clearSessionConflictState(sessionId);
        if (activeSessions.get(sessionId) === sessionData) {
          activeSessions.delete(sessionId);
        }
        return;
      }

      recordDisconnectDiagnostic(sessionId, statusCode, disconnectErrMsg);

      if (isPairConflict440) {
        const liveLocalSibling = findLiveLocalSiblingLease({
          sessionId,
          userId: pairOwner!.id,
          cleanPhone
        });
        if (liveLocalSibling) {
          clearSessionTimers(sessionId);
          clearMetaAiSession(sessionId);
          sessionDisconnectDiagnostics.delete(sessionId);
          clearSessionConflictState(sessionId);
          if (activeSessions.get(sessionId) === sessionData) {
            activeSessions.delete(sessionId);
          }
          return;
        }

        const remoteLease440 = await evaluateRemoteLeaseForSession({
          sessionId,
          userId: pairOwner!.id,
          cleanPhone,
          assignedAppId: existingMeta?.assigned_app_id,
          forceRefresh: true
        });
        if (remoteLease440.status === 'same_domain_ip' || remoteLease440.status === 'remote_cluster_node') {
          clearSessionTimers(sessionId);
          clearMetaAiSession(sessionId);
          sessionDisconnectDiagnostics.delete(sessionId);
          clearSessionConflictState(sessionId);
          if (activeSessions.get(sessionId) === sessionData) {
            activeSessions.delete(sessionId);
          }
          return;
        }

        const nowMs = Date.now();
        const nextConflictCount = (sessionConflictStates.get(sessionId)?.count || sessionData.consecutiveConflicts || 0) + 1;
        sessionData.consecutiveConflicts = nextConflictCount;
        sessionData.retryCount = Math.max((sessionData.retryCount || 0) + 1, nextConflictCount);

        const hasPairExternalLease = remoteLease440.status === 'different_ip' && Boolean(remoteLease440.lease);
        const prelimPairPolicy = computeConflictCooldownMs(nextConflictCount, hasPairExternalLease);
        let cooldownUntil = nowMs + prelimPairPolicy.cooldownMs;

        clearSessionTimers(sessionId);
        sessionData.status = 'disconnected';
        sessionData.disconnectedSince = nowMs;
        sessionData.lastUpdated = nowMs;

        const pairDetail = await captureAndStoreConflictDiagnostic({
          sessionId,
          ownerId: pairOwner!.id,
          cleanPhone,
          sessionName: existingMeta?.session_name,
          disconnectErr: lastDisconnect?.error,
          disconnectErrMsg,
          cooldownUntil
        }).catch(() => null);
        if (pairDetail?.source_type === 'same_server') {
          clearSessionConflictState(sessionId);
          sessionDisconnectDiagnostics.delete(sessionId);
          if (activeSessions.get(sessionId) === sessionData) {
            activeSessions.delete(sessionId);
          }
          return;
        }
        const confirmedPairExternal =
          hasPairExternalLease ||
          pairDetail?.source_type === 'remote_instance' ||
          Boolean(pairDetail?.competing_ip);
        const finalPairPolicy = computeConflictCooldownMs(nextConflictCount, confirmedPairExternal);
        cooldownUntil = nowMs + finalPairPolicy.cooldownMs;

        sessionConflictStates.set(sessionId, {
          count: nextConflictCount,
          cooldownUntil,
          lastConflictAt: nowMs,
          reason: finalPairPolicy.reason
        });
        sessionData.conflictCooldownUntil = cooldownUntil;
        activeSessions.set(sessionId, sessionData);
        if (pairDetail) {
          pairDetail.cooldown_until = new Date(cooldownUntil).toISOString();
        }

        if (finalPairPolicy.reason === 'transient' && isRegistered) {
          console.warn(
            `[Baileys Pairing Conflict Guard] Sesi ${sessionId} mengalami 440 sementara (#${nextConflictCount}). Auto-recovery dijadwalkan dalam ${Math.round(finalPairPolicy.cooldownMs / 1000)} detik.`
          );
          scheduleTransient440Recovery({
            sessionId,
            sessionData,
            ownerId: pairOwner!.id,
            cleanPhone,
            delayMs: finalPairPolicy.cooldownMs
          });
          return;
        }
        console.warn(
          `[Baileys Pairing Conflict Guard] Sesi ${sessionId} mengalami konflik 440. Auto-reconnect tidak dipaksa.${pairDetail?.competing_ip ? ` Server aktif: ${pairDetail.competing_domain || '-'} (IP ${pairDetail.competing_ip}).` : ''}`
        );
        return;
      } else if (!isPairRestartRequired) {
        sessionData.retryCount = (sessionData.retryCount || 0) + 1;
      }
      if (!isRegistered && sessionData.retryCount > 5) {
        await purgeBaileysSessionCompletely(sessionId, cleanPhone);
        return;
      }

      sessionData.status = 'connecting';
      sessionData.lastUpdated = Date.now();
      activeSessions.set(sessionId, sessionData);
      const pairReconnectDelay = computePersistentReconnectDelay(sessionData.retryCount, statusCode);
      if (isPairRestartRequired) {
        console.log(
          `[Baileys Pairing Reconnect] Melanjutkan penautan ${sessionId} setelah restart 515 dalam ${Math.round(pairReconnectDelay)}ms...`
        );
      } else {
        console.log(
          `[Baileys Pairing Persistent Reconnect] Stream closed (${statusCode}). Reconnecting ${sessionId} (attempt ${sessionData.retryCount})...`
        );
      }
      clearSessionTimers(sessionId);
      const rTimer = setTimeout(async () => {
        reconnectTimers.delete(sessionId);
        if (sessionData.superseded) return;
        try {
          await pairCredsSaveQueue;
        } catch {}
        if (sessionData.superseded) return;
        if (!resolveActiveVerifiedOwner(sessionId, sessionData.userId || userId, sessionData.phoneNumber || cleanPhone)) {
          await purgeBaileysSessionCompletely(sessionId, cleanPhone);
          return;
        }
        getOrStartBaileysSession(sessionId, cleanPhone, sessionData.userId || userId, { isAutoReconnect: true }).catch(() => {});
      }, pairReconnectDelay);
      rTimer.unref?.();
      reconnectTimers.set(sessionId, rTimer);
    }
  });

  // Attach messages upsert listener to pairing socket as well
  attachSocketMessageListener(sock, sessionId, sessionData);

  // Release start lock once socket & listeners are initialized
  sessionStartLocks.delete(sessionId);
  resolvePairLock(sessionData);

  // Wait for WebSocket connection to establish before requesting code
  let tries = 0;
  while (tries < 18 && !sessionData.superseded && !sock.ws?.isOpen && !sock.ws?.isClosed) {
    await delay(300);
    tries++;
  }
  await delay(800);

  if (sessionData.superseded) {
    throw new Error('Permintaan Kode Pairing dibatalkan karena sesi digantikan oleh koneksi baru.');
  }

  if (!sock.authState.creds.registered) {
    try {
      const rawCode = await sock.requestPairingCode(cleanPhone);
      const formattedCode = rawCode?.match(/.{1,4}/g)?.join('-') || rawCode;
      sessionData.pairingCode = formattedCode;
      sessionData.lastUpdated = Date.now();
      activeSessions.set(sessionId, sessionData);

      // Jangan langsung menyimpan ke db.sessions sebelum perangkat benar-benar berhasil tertaut (`connection === 'open'`)
      return formattedCode;
    } catch (err: any) {
      console.error('[Baileys] Request pairing code error:', err);
      const alreadyLinkedOrRestarting =
        Boolean(sock.authState?.creds?.registered) ||
        hasRegisteredCredsOnDisk(sessionId) ||
        reconnectTimers.has(sessionId);
      if (!alreadyLinkedOrRestarting) {
        await purgeBaileysSessionCompletely(sessionId, cleanPhone);
      }
      throw new Error(err?.message || 'Gagal meminta Kode Pairing dari WhatsApp.');
    }
  } else {
    throw new Error('Sesi ini sudah terdaftar dan terhubung.');
  }
}

export function getLiveSessionRuntimeStatus(dbSess: {
  id: string;
  user_id?: string;
  phone_number?: string;
}): {
  runtime_status: 'connected' | 'connecting' | 'disconnected';
  has_registered_creds: boolean;
  disconnect_code?: number;
  disconnect_reason?: string;
  conflict_paused?: boolean;
  conflict_detail?: WhatsAppSessionConflictDetail;
  multi_location_active?: boolean;
} {
  const cleanPhone = normalizePhoneNumber(dbSess.phone_number || '');
  const matchingSessions: SessionState[] = [];

  const exactMem = activeSessions.get(dbSess.id);
  if (exactMem && !exactMem.superseded && (!exactMem.userId || !dbSess.user_id || exactMem.userId === dbSess.user_id)) {
    matchingSessions.push(exactMem);
  }

  for (const s of activeSessions.values()) {
    if (s === exactMem || s.superseded) continue;
    if (s.userId && dbSess.user_id && s.userId !== dbSess.user_id) continue;
    if (dbSess.user_id && !s.userId && !isSessionOwnedByUserId(s.sessionId, dbSess.user_id)) {
      const otherDb = getSessionById(s.sessionId);
      if (otherDb?.user_id && otherDb.user_id !== dbSess.user_id) continue;
    }
    const sPhone = normalizePhoneNumber(s.phoneNumber || getCredsPhoneOnDisk(s.sessionId) || '');
    if (s.sessionId === dbSess.id || (cleanPhone.length >= 8 && sPhone === cleanPhone)) {
      matchingSessions.push(s);
    }
  }

  let hasCreds = hasRegisteredCredsOnDisk(dbSess.id);
  if (!hasCreds) {
    for (const m of matchingSessions) {
      if (m.sessionId !== dbSess.id && hasRegisteredCredsOnDisk(m.sessionId)) {
        hasCreds = true;
        break;
      }
    }
  }

  // 1. Prioritize any genuinely OPEN connected socket matching this session ID or (user_id + phone)
  const liveConnected = matchingSessions.find(
    m => m.status === 'connected' && m.socket && isSocketTrulyOpen(m.socket)
  );
  if (liveConnected) {
    const rawDetailWhileOpen =
      sessionConflictDetails.get(dbSess.id) ||
      sessionConflictDetails.get(liveConnected.sessionId) ||
      remoteSessionConflictCache.get(dbSess.id)?.detail ||
      remoteSessionConflictCache.get(liveConnected.sessionId)?.detail;
    const isExternalMultiLocation = Boolean(rawDetailWhileOpen && rawDetailWhileOpen.source_type !== 'same_server');
    sessionDisconnectDiagnostics.delete(dbSess.id);
    clearSessionConflictState(dbSess.id);
    if (liveConnected.sessionId !== dbSess.id) {
      sessionDisconnectDiagnostics.delete(liveConnected.sessionId);
      clearSessionConflictState(liveConnected.sessionId);
    }
    return {
      runtime_status: 'connected',
      has_registered_creds: true,
      conflict_paused: false,
      conflict_detail: isExternalMultiLocation ? rawDetailWhileOpen : undefined,
      multi_location_active: isExternalMultiLocation
    };
  }

  // 2. Next prioritize any connecting/reconnecting/locked socket for this session or owner+phone
  const primaryMem = matchingSessions[0];
  const resolvedSid = primaryMem?.sessionId || dbSess.id;
  const diag = sessionDisconnectDiagnostics.get(resolvedSid) || sessionDisconnectDiagnostics.get(dbSess.id);
  const hasConnectingMatch =
    matchingSessions.some(
      m =>
        m.status === 'connecting' ||
        reconnectTimers.has(m.sessionId) ||
        sessionStartLocks.has(m.sessionId)
    ) ||
    reconnectTimers.has(dbSess.id) ||
    sessionStartLocks.has(dbSess.id);

  if (hasConnectingMatch) {
    return {
      runtime_status: 'connecting',
      has_registered_creds: hasCreds,
      disconnect_code: diag?.code,
      disconnect_reason: diag?.reason,
      conflict_paused: false
    };
  }

  // 3. Check if another live worker/container on this same domain & IP owns the socket
  const liveLocalSibling = findLiveLocalSiblingLease({
    sessionId: dbSess.id,
    userId: dbSess.user_id,
    cleanPhone
  });
  if (liveLocalSibling) {
    if (liveLocalSibling.status === 'connected') {
      sessionDisconnectDiagnostics.delete(dbSess.id);
      clearSessionConflictState(dbSess.id);
      if (resolvedSid !== dbSess.id) {
        sessionDisconnectDiagnostics.delete(resolvedSid);
        clearSessionConflictState(resolvedSid);
      }
      return {
        runtime_status: 'connected',
        has_registered_creds: true,
        conflict_paused: false
      };
    }
    return {
      runtime_status: 'connecting',
      has_registered_creds: hasCreds,
      conflict_paused: false
    };
  }

  // 4. Check cached remote MySQL runtime lease
  const fullDbMeta = getSessionById(dbSess.id);
  const cachedRemote = getCachedRemoteLeaseClassification({
    sessionId: dbSess.id,
    userId: dbSess.user_id,
    cleanPhone,
    assignedAppId: fullDbMeta?.assigned_app_id
  });
  if (cachedRemote.status === 'same_domain_ip' || cachedRemote.status === 'remote_cluster_node') {
    sessionDisconnectDiagnostics.delete(dbSess.id);
    clearSessionConflictState(dbSess.id);
    if (resolvedSid !== dbSess.id) {
      sessionDisconnectDiagnostics.delete(resolvedSid);
      clearSessionConflictState(resolvedSid);
    }
    return {
      runtime_status: 'connected',
      has_registered_creds: true,
      conflict_paused: false
    };
  }
  if (cachedRemote.status === 'different_ip' && cachedRemote.lease) {
    const existingDetail = sessionConflictDetails.get(resolvedSid) || sessionConflictDetails.get(dbSess.id);
    const conflictDetail =
      existingDetail && existingDetail.source_type === 'remote_instance'
        ? existingDetail
        : buildRemoteConflictDetailSync(cachedRemote.lease, dbSess.id);
    return {
      runtime_status: 'connected',
      has_registered_creds: true,
      conflict_paused: false,
      conflict_detail: conflictDetail,
      multi_location_active: true
    };
  }

  const rawConflictDetail =
    sessionConflictDetails.get(resolvedSid) ||
    sessionConflictDetails.get(dbSess.id) ||
    remoteSessionConflictCache.get(resolvedSid)?.detail ||
    remoteSessionConflictCache.get(dbSess.id)?.detail;
  const isSameServerNonConflict = rawConflictDetail?.source_type === 'same_server';
  if (isSameServerNonConflict) {
    clearSessionConflictState(resolvedSid);
    clearSessionConflictState(dbSess.id);
  }

  // IMPORTANT: Never report 'connected' merely from a historical send timestamp (verifiedAtMs).
  // A silent WebSocket disconnect leaves verifiedAtMs >= lastDiagAt and used to blind the watchdog & AI readiness checks.
  const cooldownEntry =
    sessionConflictStates.get(resolvedSid) ||
    sessionConflictStates.get(dbSess.id);
  const cooldownActive =
    isSessionInConflictCooldown(resolvedSid) || isSessionInConflictCooldown(dbSess.id);
  const conflictCooldownExpiryMs = rawConflictDetail?.cooldown_until
    ? Date.parse(rawConflictDetail.cooldown_until)
    : 0;
  const hasActiveRemotePersistedConflict = Boolean(
    !isSameServerNonConflict &&
    rawConflictDetail &&
    (remoteSessionConflictCache.has(resolvedSid) || remoteSessionConflictCache.has(dbSess.id)) &&
    (cooldownActive ||
      rawConflictDetail.source_type === 'remote_instance' ||
      (Number.isFinite(conflictCooldownExpiryMs) && conflictCooldownExpiryMs > Date.now()))
  );
  const conflictPaused =
    !isSameServerNonConflict &&
    (cooldownActive || hasActiveRemotePersistedConflict) &&
    !(cooldownEntry?.reason === 'transient' && !cooldownActive);

  return {
    runtime_status: 'disconnected',
    has_registered_creds: hasCreds,
    disconnect_code: conflictPaused ? (diag?.code || 440) : diag?.code,
    disconnect_reason: conflictPaused ? (diag?.reason || '440_konflik_koneksi_ganda') : diag?.reason,
    conflict_paused: conflictPaused,
    conflict_detail: conflictPaused ? rawConflictDetail : undefined
  };
}

export function getSessionRuntimeIdentitySummary(
  sessionId?: string,
  phoneNumber?: string,
  nodesSnapshot?: AppNodeRuntimeStatus[]
): {
  connected_app_id?: string;
  connected_server_name?: string;
  connected_server_ip?: string;
  connected_server_domain?: string;
  connected_hostname?: string;
  last_send_verified_at?: string;
} {
  const dbSess = sessionId ? getSessionById(sessionId) : undefined;
  const cleanPhone = normalizePhoneNumber(phoneNumber || dbSess?.phone_number || '');
  const currentAppId = getCurrentAppId();
  const displayAppId = getDisplayAppId();
  const sysNodes: AppNodeRuntimeStatus[] =
    nodesSnapshot || getAppNodesConfig().map(n => ({ ...n, active_connections: 0, online: n.app_id === currentAppId }));
  const localId = getCachedOrFallbackIdentity();
  const localPrimaryIp = normalizeServerIpValue(extractPrimaryIp(localId.serverIp)) || localId.serverIp;
  const verifiedMs = getLatestSessionSendVerifiedAt(sessionId || dbSess?.id, cleanPhone);
  const verifiedIso = verifiedMs > 0 ? new Date(verifiedMs).toISOString() : undefined;

  const findNodeMeta = (appId?: string) => {
    const norm = normalizeAppId(appId);
    if (!norm || norm === 'undefined') return undefined;
    return sysNodes.find(n => normalizeAppId(n.app_id) === norm);
  };

  // 1. Check live open socket in this process
  const exactMem = sessionId ? activeSessions.get(sessionId) : undefined;
  let liveMem =
    exactMem && !exactMem.superseded && exactMem.status === 'connected' && isSocketTrulyOpen(exactMem.socket)
      ? exactMem
      : undefined;
  if (!liveMem && cleanPhone.length >= 8) {
    for (const s of activeSessions.values()) {
      if (s.superseded || s.status !== 'connected' || !isSocketTrulyOpen(s.socket)) continue;
      if (dbSess?.user_id && s.userId && s.userId !== dbSess.user_id) continue;
      const sPhone = normalizePhoneNumber(s.phoneNumber || getCredsPhoneOnDisk(s.sessionId) || '');
      if (sPhone === cleanPhone) {
        liveMem = s;
        break;
      }
    }
  }

  if (liveMem) {
    const nodeMeta = findNodeMeta(currentAppId);
    const localVerifiedMs = Math.max(verifiedMs, liveMem.lastOutgoingAt || 0, liveMem.openedAt || 0);
    return {
      connected_app_id: displayAppId,
      connected_server_name: nodeMeta?.name || localId.domain || localId.hostname || displayAppId,
      connected_server_ip: localPrimaryIp,
      connected_server_domain: localId.domain,
      connected_hostname: localId.hostname,
      last_send_verified_at: localVerifiedMs > 0 ? new Date(localVerifiedMs).toISOString() : verifiedIso
    };
  }

  // 2. Check fresh cached remote MySQL lease
  const now = Date.now();
  const leaseCandidates = [
    sessionId ? remoteSessionLeaseCache.get(`sid:${sessionId}`)?.lease : null,
    cleanPhone.length >= 8 ? remoteSessionLeaseCache.get(`phone:${cleanPhone}`)?.lease : null
  ].filter((l): l is WaSessionRuntimeLease => Boolean(l && now - (Number(l.heartbeat_at) || 0) <= REMOTE_LEASE_FRESH_MS));

  if (leaseCandidates.length > 0) {
    const lease = leaseCandidates[0];
    const rawLeaseApp = normalizeAppId(lease.app_id);
    const leaseDisplayAppId =
      rawLeaseApp && rawLeaseApp !== 'default'
        ? rawLeaseApp
        : (normalizeAppId(dbSess?.connected_app_id) || 'undefined');
    const nodeMeta = findNodeMeta(rawLeaseApp);
    const leaseIp = normalizeServerIpValue(extractPrimaryIp(lease.server_ip)) || lease.server_ip || nodeMeta?.server_ip || '-';
    return {
      connected_app_id: leaseDisplayAppId,
      connected_server_name: nodeMeta?.name || lease.domain || lease.hostname || leaseDisplayAppId,
      connected_server_ip: leaseIp,
      connected_server_domain: lease.domain || nodeMeta?.domain || '-',
      connected_hostname: lease.hostname || nodeMeta?.hostname || '-',
      last_send_verified_at: verifiedIso || (lease.heartbeat_at ? new Date(lease.heartbeat_at).toISOString() : undefined)
    };
  }

  // 3. Fallback to persisted DB node metadata if available
  const fallbackAppId = normalizeAppId(dbSess?.connected_app_id) || normalizeAppId(dbSess?.assigned_app_id);
  const fallbackIp = normalizeServerIpValue(dbSess?.connected_server_ip);
  const fallbackNode = findNodeMeta(fallbackAppId);
  if (fallbackAppId || fallbackNode || fallbackIp) {
    const isSelf = fallbackAppId ? fallbackAppId === currentAppId : (fallbackIp && isTargetServerIpLocal(fallbackIp));
    const resolvedAppDisplay =
      fallbackAppId === 'default' && !isAppIdEnvConfigured()
        ? 'undefined'
        : fallbackAppId || (isSelf ? displayAppId : 'undefined');
    return {
      connected_app_id: resolvedAppDisplay,
      connected_server_name:
        fallbackNode?.name ||
        (isSelf ? localId.domain || localId.hostname : fallbackNode?.domain || fallbackNode?.hostname || fallbackIp) ||
        resolvedAppDisplay,
      connected_server_ip: fallbackIp || (isSelf ? localPrimaryIp : fallbackNode?.server_ip) || undefined,
      connected_server_domain: (isSelf ? localId.domain : fallbackNode?.domain) || undefined,
      connected_hostname: (isSelf ? localId.hostname : fallbackNode?.hostname) || undefined,
      last_send_verified_at: verifiedIso
    };
  }

  return {
    connected_app_id: undefined,
    connected_server_name: undefined,
    connected_server_ip: undefined,
    connected_server_domain: undefined,
    connected_hostname: undefined,
    last_send_verified_at: verifiedIso
  };
}

export async function testWhatsAppSessionChatHealth(
  rawSessionId: string,
  options?: { sendChatProbe?: boolean; targetPhone?: string }
): Promise<{
  ok: boolean;
  can_send: boolean;
  mode: 'chat_message' | 'wa_protocol_ping' | 'remote_node_lease' | 'unavailable';
  session_id: string;
  phone_number?: string;
  connected_app_id?: string;
  connected_server_name?: string;
  connected_server_ip?: string;
  connected_server_domain?: string;
  multi_location_active?: boolean;
  latency_ms?: number;
  message: string;
}> {
  const sessionId = sanitizeSessionId(rawSessionId);
  const dbSess = getSessionById(sessionId);
  const cleanPhone = normalizePhoneNumber(dbSess?.phone_number || getCredsPhoneOnDisk(sessionId) || '');
  const startedAt = Date.now();

  // Locate any live open socket in memory for this session or owner+phone (NEVER force reconnect)
  let liveMem: SessionState | undefined = activeSessions.get(sessionId);
  if (!liveMem || liveMem.superseded || liveMem.status !== 'connected' || !isSocketTrulyOpen(liveMem.socket)) {
    liveMem = undefined;
    if (cleanPhone.length >= 8) {
      for (const s of activeSessions.values()) {
        if (s.superseded || s.status !== 'connected' || !isSocketTrulyOpen(s.socket)) continue;
        if (dbSess?.user_id && s.userId && s.userId !== dbSess.user_id) continue;
        const sPhone = normalizePhoneNumber(s.phoneNumber || getCredsPhoneOnDisk(s.sessionId) || '');
        if (sPhone === cleanPhone) {
          liveMem = s;
          break;
        }
      }
    }
  }

  if (liveMem && liveMem.socket && isSocketTrulyOpen(liveMem.socket)) {
    const identity = await resolveCurrentServerIdentity().catch(() => getCachedOrFallbackIdentity());
    const currentAppId = getCurrentAppId();
    const displayAppId = getDisplayAppId();
    const primaryIp = normalizeServerIpValue(extractPrimaryIp(identity.serverIp)) || collectAllLocalIpAddresses()[0] || identity.serverIp;
    const configuredNode = getAppNodesConfig().find(n => normalizeAppId(n.app_id) === currentAppId);
    const serverName = configuredNode?.name || identity.domain || identity.hostname || displayAppId;
    const sockOwnPhone = normalizePhoneNumber(liveMem.phoneNumber || cleanPhone || liveMem.socket?.user?.id?.split(':')[0] || '');
    const hadRemoteConflictNote = Boolean(
      sessionConflictDetails.get(sessionId) ||
      sessionConflictDetails.get(liveMem.sessionId) ||
      remoteSessionConflictCache.get(sessionId)?.detail
    );

    try {
      // 1. Verify WA stream query ping
      if (typeof liveMem.socket.query === 'function') {
        await Promise.race([
          liveMem.socket.query({
            tag: 'iq',
            attrs: { to: 's.whatsapp.net', type: 'get', xmlns: 'w:p' },
            content: [{ tag: 'ping', attrs: {} }]
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('WA ping timeout (5s)')), 5000))
        ]);
      }

      // 2. Verify actual WhatsApp message sending when requested
      let mode: 'chat_message' | 'wa_protocol_ping' = 'wa_protocol_ping';
      if (options?.sendChatProbe) {
        const probePhone = normalizePhoneNumber(options.targetPhone || sockOwnPhone);
        if (probePhone && probePhone.length >= 8) {
          const jid = `${probePhone}@s.whatsapp.net`;
          const probeText = `✓ Tes koneksi Japriin (${serverName} | APP_ID: ${displayAppId} | IP: ${primaryIp}): WhatsApp aktif & aman untuk kirim pesan.`;
          recordBotOutgoing(probeText);
          await sendSocketMessageWithAckGuard(
            liveMem.socket,
            jid,
            { text: probeText },
            { timeoutMs: 15000, sessionData: liveMem }
          );
          mode = 'chat_message';
        }
      } else if (typeof liveMem.socket.sendPresenceUpdate === 'function') {
        await Promise.race([
          Promise.resolve().then(() => liveMem!.socket.sendPresenceUpdate('available')),
          delay(1200)
        ]).catch(() => {});
      }

      const nowIso = new Date().toISOString();
      recordSessionSendVerified(sessionId, sockOwnPhone);
      if (liveMem.sessionId !== sessionId) {
        recordSessionSendVerified(liveMem.sessionId, sockOwnPhone);
      }
      clearSessionConflictState(sessionId);
      sessionDisconnectDiagnostics.delete(sessionId);
      void deleteWaSessionConflictFromMysql(sessionId).catch(() => {});
      liveMem.lastUpdated = Date.now();
      liveMem.lastOutgoingAt = Date.now();
      if (dbSess) {
        updateSession(dbSess.id, {
          status: 'connected',
          connected_app_id: displayAppId,
          connected_server_ip: primaryIp || undefined,
          assignment_status: 'connected',
          assignment_error: '',
          last_activity_at: nowIso
        });
      }
      void publishActiveSessionLease(liveMem, true);
      void publishCurrentSocketRecord({ force: true }).catch(() => {});

      return {
        ok: true,
        can_send: true,
        mode,
        session_id: liveMem.sessionId,
        phone_number: sockOwnPhone || cleanPhone || undefined,
        connected_app_id: displayAppId,
        connected_server_name: serverName,
        connected_server_ip: primaryIp,
        connected_server_domain: identity.domain,
        multi_location_active: hadRemoteConflictNote,
        latency_ms: Date.now() - startedAt,
        message:
          mode === 'chat_message'
            ? `Aman Terkoneksi — Pesan tes WhatsApp berhasil terkirim via ${serverName} (APP_ID: ${displayAppId}, IP ${primaryIp})${hadRemoteConflictNote ? ' meskipun terdeteksi aktif di tempat lain.' : '.'}`
            : `Aman Terkoneksi — Socket WhatsApp merespons normal pada ${serverName} (APP_ID: ${displayAppId}, IP ${primaryIp}).`
      };
    } catch (err: any) {
      return {
        ok: false,
        can_send: false,
        mode: 'unavailable',
        session_id: liveMem.sessionId,
        phone_number: sockOwnPhone || cleanPhone || undefined,
        connected_app_id: displayAppId,
        connected_server_name: serverName,
        connected_server_ip: primaryIp,
        connected_server_domain: identity.domain,
        multi_location_active: hadRemoteConflictNote,
        latency_ms: Date.now() - startedAt,
        message: `Gagal tes kirim pada ${serverName} (APP_ID: ${displayAppId}, IP ${primaryIp}): ${err?.message || 'Koneksi tidak merespons'}.`
      };
    }
  }

  // Fallback: check if another server in shared MySQL holds a fresh live lease (meaning number is connected elsewhere)
  const remoteCheck = await evaluateRemoteLeaseForSession({
    sessionId,
    userId: dbSess?.user_id,
    cleanPhone,
    assignedAppId: dbSess?.assigned_app_id,
    forceRefresh: true
  });

  if (remoteCheck.status !== 'none' && remoteCheck.lease) {
    const lease = remoteCheck.lease;
    const rawLeaseApp = normalizeAppId(lease.app_id);
    const leaseAppId =
      rawLeaseApp && rawLeaseApp !== 'default'
        ? rawLeaseApp
        : (normalizeAppId(dbSess?.connected_app_id) || 'undefined');
    const nodeMeta = getAppNodesConfig().find(n => normalizeAppId(n.app_id) === rawLeaseApp);
    const serverName = nodeMeta?.name || lease.domain || lease.hostname || leaseAppId;
    const leaseIp = normalizeServerIpValue(extractPrimaryIp(lease.server_ip)) || lease.server_ip || '-';
    recordSessionSendVerified(sessionId, cleanPhone || lease.phone_number);
    return {
      ok: true,
      can_send: true,
      mode: 'remote_node_lease',
      session_id: sessionId,
      phone_number: cleanPhone || lease.phone_number || undefined,
      connected_app_id: leaseAppId,
      connected_server_name: serverName,
      connected_server_ip: leaseIp,
      connected_server_domain: lease.domain || '-',
      multi_location_active: remoteCheck.status === 'different_ip',
      latency_ms: Date.now() - startedAt,
      message: `Aman Terkoneksi — Nomor sedang aktif & beroperasi di server ${serverName} (APP_ID: ${leaseAppId}, IP ${leaseIp}).`
    };
  }

  const summary = getSessionRuntimeIdentitySummary(sessionId, cleanPhone);
  return {
    ok: false,
    can_send: false,
    mode: 'unavailable',
    session_id: sessionId,
    phone_number: cleanPhone || undefined,
    connected_app_id: summary.connected_app_id,
    connected_server_name: summary.connected_server_name,
    connected_server_ip: summary.connected_server_ip,
    connected_server_domain: summary.connected_server_domain,
    latency_ms: Date.now() - startedAt,
    message: 'Socket WhatsApp sedang tidak aktif di server ini dan tidak ada lease aktif dari server lain. Auto-reconnect tidak dipaksa agar tidak memicu konflik.'
  };
}

export async function reconnectBaileysSessionForUser(
  rawSessionId: string,
  userId?: string
): Promise<{
  connected: boolean;
  runtime_status: 'connected' | 'connecting' | 'disconnected';
  needs_rescan: boolean;
  session_id: string;
  phone_number?: string;
  disconnect_code?: number;
  disconnect_reason?: string;
  conflict_detail?: WhatsAppSessionConflictDetail;
}> {
  const sessionId = sanitizeSessionId(rawSessionId);
  const dbSess = getSessionById(sessionId);
  const effectiveId = dbSess?.id || sessionId;
  const targetUserId = userId || dbSess?.user_id;

  const remoteLeaseUpfront = await evaluateRemoteLeaseForSession({
    sessionId: effectiveId,
    userId: targetUserId,
    cleanPhone: dbSess?.phone_number,
    assignedAppId: dbSess?.assigned_app_id,
    forceRefresh: true
  });
  if (remoteLeaseUpfront.status === 'same_domain_ip' || remoteLeaseUpfront.status === 'remote_cluster_node') {
    sessionDisconnectDiagnostics.delete(effectiveId);
    clearSessionConflictState(effectiveId);
    if (effectiveId !== sessionId) {
      sessionDisconnectDiagnostics.delete(sessionId);
      clearSessionConflictState(sessionId);
    }
    return {
      connected: true,
      runtime_status: 'connected',
      needs_rescan: false,
      session_id: effectiveId,
      phone_number: dbSess?.phone_number || remoteLeaseUpfront.lease?.phone_number
    };
  }

  const liveStatusNow = getLiveSessionRuntimeStatus({
    id: effectiveId,
    user_id: targetUserId,
    phone_number: dbSess?.phone_number
  });
  if (liveStatusNow.runtime_status === 'connected') {
    return {
      connected: true,
      runtime_status: 'connected',
      needs_rescan: false,
      session_id: effectiveId,
      phone_number: dbSess?.phone_number
    };
  }

  const liveNow = findLiveSocketEntry(targetUserId, effectiveId);
  const targetCleanPhone = normalizePhoneNumber(dbSess?.phone_number || '');
  if (
    liveNow &&
    (liveNow.sessionId === effectiveId ||
      (targetCleanPhone.length >= 8 && normalizePhoneNumber(liveNow.phoneNumber || '') === targetCleanPhone))
  ) {
    sessionDisconnectDiagnostics.delete(effectiveId);
    clearSessionConflictState(effectiveId);
    return {
      connected: true,
      runtime_status: 'connected',
      needs_rescan: false,
      session_id: liveNow.sessionId,
      phone_number: liveNow.phoneNumber || dbSess?.phone_number
    };
  }

  clearSessionConflictState(effectiveId);
  sessionDisconnectDiagnostics.delete(effectiveId);
  if (effectiveId !== sessionId) {
    clearSessionConflictState(sessionId);
    sessionDisconnectDiagnostics.delete(sessionId);
  }

  let hasCreds = hasRegisteredCredsOnDisk(effectiveId);
  if (!hasCreds) {
    hasCreds = await hydrateSessionAuthFolderFromMysql(effectiveId).catch(() => false);
  }
  if (!hasCreds && effectiveId !== sessionId) {
    hasCreds =
      hasRegisteredCredsOnDisk(sessionId) ||
      (await hydrateSessionAuthFolderFromMysql(sessionId).catch(() => false));
  }

  if (!hasCreds) {
    const diag = sessionDisconnectDiagnostics.get(effectiveId) || sessionDisconnectDiagnostics.get(sessionId);
    return {
      connected: false,
      runtime_status: 'disconnected',
      needs_rescan: true,
      session_id: effectiveId,
      phone_number: dbSess?.phone_number,
      disconnect_code: diag?.code,
      disconnect_reason: diag?.reason
    };
  }

  const startedState = await getOrStartBaileysSession(
    effectiveId,
    dbSess?.phone_number,
    targetUserId,
    { forceReconnect: true }
  );

  let tries = 0;
  while (tries < 18 && startedState.status === 'connecting') {
    await delay(400);
    const liveAfterTry = getLiveSessionRuntimeStatus({
      id: effectiveId,
      user_id: targetUserId,
      phone_number: dbSess?.phone_number
    });
    if (liveAfterTry.runtime_status === 'connected') {
      return {
        connected: true,
        runtime_status: 'connected',
        needs_rescan: false,
        session_id: effectiveId,
        phone_number: dbSess?.phone_number
      };
    }
    tries++;
  }

  const finalLiveStatus = getLiveSessionRuntimeStatus({
    id: effectiveId,
    user_id: targetUserId,
    phone_number: dbSess?.phone_number
  });
  if (finalLiveStatus.runtime_status === 'connected') {
    return {
      connected: true,
      runtime_status: 'connected',
      needs_rescan: false,
      session_id: effectiveId,
      phone_number: dbSess?.phone_number
    };
  }

  const conflictDetail = finalLiveStatus.conflict_paused ? finalLiveStatus.conflict_detail : undefined;
  return {
    connected: false,
    runtime_status: finalLiveStatus.runtime_status,
    needs_rescan: false,
    session_id: effectiveId,
    phone_number: dbSess?.phone_number,
    disconnect_code: finalLiveStatus.disconnect_code,
    disconnect_reason: finalLiveStatus.disconnect_reason,
    conflict_detail: conflictDetail
  };
}

export function getBaileysSessionStatus(idOrPhone: string) {
  const cleanKey = String(idOrPhone || '').trim();
  if (!cleanKey) return null;
  let session = activeSessions.get(cleanKey);

  if (!session && /^\+?\d{8,16}$/.test(cleanKey)) {
    const cleanPhone = normalizePhoneNumber(cleanKey);
    for (const s of activeSessions.values()) {
      const memPhone = normalizePhoneNumber(s.phoneNumber || '');
      if (cleanPhone && memPhone && memPhone === cleanPhone) {
        session = s;
        break;
      }
    }
  }

  if (session) {
    return {
      sessionId: session.sessionId,
      qrCodeUrl: session.qrCodeUrl,
      pairingCode: session.pairingCode,
      status: session.status,
      phoneNumber: session.phoneNumber,
      lastUpdated: session.lastUpdated
    };
  }

  // Fallback to database record if session connected
  try {
    const dbSess = getSessionById(idOrPhone);
    if (dbSess && dbSess.status !== 'disconnected') {
      return {
        sessionId: dbSess.id,
        qrCodeUrl: null,
        pairingCode: null,
        status: dbSess.status,
        phoneNumber: dbSess.phone_number,
        lastUpdated: Date.now()
      };
    }
  } catch {}

  return null;
}

export async function purgeBaileysSessionCompletely(
  idOrPhone: string,
  explicitPhone?: string,
  options?: { allowRemoteLogout?: boolean }
): Promise<void> {
  if (!idOrPhone) return;

  clearSessionTimers(idOrPhone);

  const sess = getSessionById(idOrPhone);
  const credsPhone = getCredsPhoneOnDisk(idOrPhone);
  const rawPhoneInput = /^\+?\d{8,16}$/.test(idOrPhone.trim()) ? idOrPhone.trim() : '';
  const targetPhone = normalizePhoneNumber(explicitPhone || sess?.phone_number || credsPhone || rawPhoneInput);
  const targetUserId = sess?.user_id;

  // 1. Delete from DB and MySQL Auth Backup + own runtime lease immediately
  deleteSession(idOrPhone);
  deleteBaileysAuthFromMysql(idOrPhone).catch(() => {});
  deleteWaSessionLeaseFromMysql({
    sessionId: idOrPhone,
    phoneNumber: targetPhone,
    expectedInstanceId: RUNTIME_INSTANCE_ID
  }).catch(() => {});
  sessionConflictDetails.delete(idOrPhone);
  lastLeaseRefreshAt.delete(idOrPhone);
  if (sess?.id && sess.id !== idOrPhone) {
    clearSessionTimers(sess.id);
    deleteSession(sess.id);
    deleteBaileysAuthFromMysql(sess.id).catch(() => {});
    deleteWaSessionLeaseFromMysql({
      sessionId: sess.id,
      phoneNumber: targetPhone,
      expectedInstanceId: RUNTIME_INSTANCE_ID
    }).catch(() => {});
    sessionConflictDetails.delete(sess.id);
    lastLeaseRefreshAt.delete(sess.id);
  }
  if (rawPhoneInput && targetPhone.length >= 8) {
    deleteSession(targetPhone);
  }

  // 2. Terminate matching active sockets & clear timers/dialog state (NEVER match unrelated sessions by userId timestamp digits)
  const keysToRemove: string[] = [];
  for (const [key, sessionData] of activeSessions.entries()) {
    const memPhone = normalizePhoneNumber(sessionData.phoneNumber || '');
    const sameOwner = !targetUserId || !sessionData.userId || sessionData.userId === targetUserId;
    const isExactMatch = key === idOrPhone || Boolean(sess && key === sess.id);
    const isSamePhoneMatch =
      Boolean(targetPhone && targetPhone.length >= 8 && sameOwner && memPhone && memPhone === targetPhone);
    if (isExactMatch || isSamePhoneMatch) {
      clearSessionTimers(key);
      if (sessionData.socket) {
        if (options?.allowRemoteLogout) {
          try {
            await Promise.race([
              sessionData.socket.logout().catch(() => {}),
              new Promise(res => setTimeout(res, 600))
            ]);
          } catch {
            // Ignore remote logout errors
          }
        }
        try {
          sessionData.socket.ev?.removeAllListeners?.('connection.update');
          sessionData.socket.ev?.removeAllListeners?.('creds.update');
          sessionData.socket.ev?.removeAllListeners?.('messages.upsert');
          sessionData.socket.ev?.removeAllListeners?.('messages.update');
          sessionData.socket.end(undefined);
          sessionData.socket.ws?.removeAllListeners?.();
        } catch {
          // Ignore socket close errors
        }
      }
      sessionData.detachRawHandlers?.();
      clearMetaAiSession(key);
      keysToRemove.push(key);
    }
  }

  for (const k of keysToRemove) {
    activeSessions.delete(k);
    lastAuthBackupAt.delete(k);
    lastAuthBackupHashes.delete(k);
    socketPingFailures.delete(k);
    clearOfflineCatchupBuffersForSession(k);
    clearPendingMissedMessagesForSession(k);
    clearSessionCacheStores(k);
    cleanSessionFolder(k);
    deleteBaileysAuthFromMysql(k).catch(() => {});
    for (const stateKey of Array.from(commandState.keys())) {
      if (stateKey.startsWith(`${k}:`)) {
        commandState.delete(stateKey);
      }
    }
  }

  // 3. Clean matching session folders on disk & pending queues
  clearOfflineCatchupBuffersForSession(idOrPhone);
  clearPendingMissedMessagesForSession(idOrPhone);
  cleanSessionFolder(idOrPhone);
  if (sess?.id) {
    clearOfflineCatchupBuffersForSession(sess.id);
    clearPendingMissedMessagesForSession(sess.id);
    cleanSessionFolder(sess.id);
  }
  if (rawPhoneInput && targetPhone.length >= 8) {
    cleanSessionFolder(`session_${targetPhone}`);
    cleanSessionFolder(`session_pair_${targetPhone}`);
  }
}

export async function evictAndPurgeFreeSession(
  sessionId: string,
  reason = 'Slot kapasitas dibutuhkan oleh pengguna paket berbayar'
): Promise<void> {
  if (!sessionId) return;
  console.warn(`[Baileys Slot Eviction] Menggeser & menghapus sesi Free "${sessionId}" (${reason}).`);
  await purgeBaileysSessionCompletely(sessionId, undefined, { allowRemoteLogout: true });
}

export async function stopBaileysSession(idOrPhone: string) {
  if (!idOrPhone) return;
  console.log(`[Baileys] Stopping and purging session: ${idOrPhone}`);
  await purgeBaileysSessionCompletely(idOrPhone, undefined, { allowRemoteLogout: true });
}

export async function parkSocketToSaveRam(_sessionId: string, _markDbDisconnected = false): Promise<boolean> {
  // Socket keep-alive persisten diaktifkan untuk semua user agar tidak terputus otomatis
  return false;
}

export async function stopIdleUserBaileysSockets(_userId: string): Promise<number> {
  // Koneksi WhatsApp tetap terjaga persisten meskipun sakelar Auto-Reply OFF
  return 0;
}

export async function resumeSavedUserBaileysSessions(userId: string): Promise<number> {
  if (!userId) return 0;
  const user = getUserById(userId);
  if (!isOwnerActiveAndRegistered(user)) return 0;

  let started = 0;
  const userSessions = getSessionsByUserId(userId);
  for (const s of userSessions) {
    if (!s.id) continue;
    if (s.expires_at && new Date(s.expires_at).getTime() < Date.now()) continue;
    const mem = activeSessions.get(s.id);
    if (mem && mem.status === 'connected' && isSocketTrulyOpen(mem.socket)) continue;
    let hasCreds = hasRegisteredCredsOnDisk(s.id);
    if (!hasCreds) {
      hasCreds = await hydrateSessionAuthFolderFromMysql(s.id).catch(() => false);
    }
    if (hasCreds) {
      getOrStartBaileysSession(s.id, s.phone_number, userId).catch(() => {});
      started++;
    }
  }
  return started;
}

export async function purgeBaileysSessionsForUser(userId: string): Promise<number> {
  if (!userId) return 0;
  const db = initDbFile();
  const targetUser = getUserById(userId);
  const toPurge = new Set<string>();

  for (const s of db.sessions) {
    if (s.user_id === userId || (targetUser && s.user_id === targetUser.id) || isSessionOwnedByUserId(s.id, userId)) {
      toPurge.add(s.id);
    }
  }
  for (const [sid, mem] of activeSessions.entries()) {
    if (mem.userId === userId || (targetUser && mem.userId === targetUser.id) || isSessionOwnedByUserId(sid, userId)) {
      toPurge.add(sid);
    }
  }
  if (fs.existsSync(AUTH_DIR)) {
    for (const folder of fs.readdirSync(AUTH_DIR)) {
      if (isSessionOwnedByUserId(folder, userId)) toPurge.add(folder);
    }
  }

  for (const sid of toPurge) {
    await purgeBaileysSessionCompletely(sid);
  }
  return toPurge.size;
}

let pruneInFlightPromise: Promise<number> | null = null;
let lastPruneCompletedAt = 0;
let lastMysqlAuthPruneAt = 0;

/**
 * Automatically purges Baileys sessions that are:
 * - Inactive/disconnected (`status === 'disconnected'` with no live socket, or expired `expires_at`)
 * - Stale unscanned QR/pairing handshakes (`> 3 min` without registered creds)
 * - Unregistered/orphan (owner user deleted, inactive, or email unverified, OR orphan auth folder whose phone/session is not registered in app)
 */
export async function pruneInactiveAndUnregisteredBaileysSessions(force = false): Promise<number> {
  if (pruneInFlightPromise) {
    return pruneInFlightPromise;
  }
  const now = Date.now();
  if (!force && now - lastPruneCompletedAt < PRUNE_COOLDOWN_MS) {
    return 0;
  }

  pruneInFlightPromise = (async () => {
    let purgedCount = 0;
    const db = initDbFile();
    const purgedIds = new Set<string>();

    const doPurge = async (sid: string, phone?: string, reason?: string) => {
      if (!sid || purgedIds.has(sid)) return;
      // Never delete a folder/session while an active socket in memory is connected, connecting, or reconnecting!
      const liveMem = activeSessions.get(sid);
      if (
        sessionStartLocks.has(sid) ||
        reconnectTimers.has(sid) ||
        (liveMem &&
          (liveMem.status === 'connected' ||
            isSocketTrulyOpen(liveMem.socket) ||
            (liveMem.status === 'connecting' && Date.now() - liveMem.handshakeStartedAt <= UNSCANNED_HANDSHAKE_TTL_MS)))
      ) {
        return;
      }
      purgedIds.add(sid);
      purgedCount++;
      console.log(`[Baileys Auto-Purge] Menghapus sesi "${sid}" (${reason || 'inactive/unregistered'}).`);
      await purgeBaileysSessionCompletely(sid, phone);
    };

    try {
      // 1. Check all DB Baileys sessions
      for (const s of [...db.sessions]) {
        const mem = activeSessions.get(s.id);
        const hasOpenSocket = Boolean(mem && mem.status === 'connected' && isSocketTrulyOpen(mem.socket));

    const owner = resolveActiveVerifiedOwner(s.id, s.user_id, s.phone_number);
    if (!isOwnerActiveAndRegistered(owner)) {
      await doPurge(s.id, s.phone_number, 'pemilik akun tidak terdaftar atau nonaktif');
      continue;
    }

    // Keep active/Meta-AI-enabled sessions alive without auto-expiring them
    const sessionHasPersistentAi = Boolean(owner && (owner.role === 'admin' || owner.ai_enabled || owner.meta_ai_verified));
    if (s.expires_at && new Date(s.expires_at).getTime() < now) {
      if (hasOpenSocket || sessionHasPersistentAi) {
        updateSession(s.id, {
          expires_at: new Date(now + 365 * 24 * 60 * 60 * 1000).toISOString()
        });
      } else {
        if (s.phone_number) {
          await notifyUserSessionExpired({
            sessionId: s.id,
            sessionName: s.session_name,
            expiredPhone: s.phone_number,
            userId: s.user_id,
            reason: 'masa aktif sesi login telah habis (expired)'
          }).catch(() => {});
        }
        await doPurge(s.id, s.phone_number, 'masa aktif sesi berakhir');
        continue;
      }
    }

    // Hapus otomatis sesi Perangkat Tertaut hanya jika tidak ada aktivitas > 3 hari DAN tidak dipakai AI/Admin aktif
    const lastActivityIso = s.last_activity_at || s.connected_at || s.updated_at || s.created_at;
    const lastActivityMs = lastActivityIso ? Date.parse(lastActivityIso) : NaN;
    const isLinkedSession = s.status === 'connected' || Boolean(s.connected_at) || hasRegisteredCredsOnDisk(s.id);
    if (
      !hasOpenSocket &&
      !sessionHasPersistentAi &&
      isLinkedSession &&
      Number.isFinite(lastActivityMs) &&
      now - lastActivityMs >= SESSION_INACTIVITY_PURGE_MS
    ) {
      await doPurge(
        s.id,
        s.phone_number,
        'tidak ada pesan masuk atau balasan selama 3 hari berturut-turut'
      );
      continue;
    }

    if (s.status === 'disconnected' && !hasOpenSocket && !hasRegisteredCredsOnDisk(s.id)) {
      const hydrated = isMysqlConfigured()
        ? await hydrateSessionAuthFolderFromMysql(s.id).catch(() => false)
        : false;
      if (!hydrated) {
        if (s.phone_number && s.connected_at) {
          await notifyUserSessionExpired({
            sessionId: s.id,
            sessionName: s.session_name,
            expiredPhone: s.phone_number,
            userId: s.user_id,
            reason: 'sesi WhatsApp terputus dan kredensial login tidak aktif lagi'
          }).catch(() => {});
        }
        await doPurge(s.id, s.phone_number, 'status sesi disconnected tanpa kredensial tersimpan');
        continue;
      }
    }

    const updatedMs = new Date(s.updated_at || s.created_at || 0).getTime();
    if (
      s.status === 'connecting' &&
      !s.connected_at &&
      !hasRegisteredCredsOnDisk(s.id) &&
      (!mem || now - mem.handshakeStartedAt > UNSCANNED_HANDSHAKE_TTL_MS) &&
      now - updatedMs > UNSCANNED_HANDSHAKE_TTL_MS
    ) {
      await doPurge(s.id, s.phone_number, 'handshake QR/pairing kadaluarsa tanpa scan');
      continue;
    }
  }

  // 2. Check all in-memory Baileys sockets
  for (const [sid, mem] of Array.from(activeSessions.entries())) {
    if (purgedIds.has(sid)) continue;
    const summary = readCredsSummary(sid);
    const dbSess = getSessionById(sid);
    const memRegistered = Boolean(mem.socket?.authState?.creds?.registered || mem.socket?.user?.id || mem.status === 'connected');
    const owner = resolveActiveVerifiedOwner(sid, mem.userId, mem.phoneNumber || summary.phone);

    if (!isOwnerActiveAndRegistered(owner)) {
      await doPurge(sid, mem.phoneNumber || summary.phone, 'socket memori tidak memiliki pemilik terdaftar aktif');
      continue;
    }

    if (!summary.registered && !memRegistered && !dbSess?.connected_at && now - mem.handshakeStartedAt > UNSCANNED_HANDSHAKE_TTL_MS) {
      await doPurge(sid, mem.phoneNumber || undefined, 'QR/pairing belum tersambung > 3 menit');
      continue;
    }

    if (mem.status === 'disconnected' && !isSocketTrulyOpen(mem.socket)) {
      if (!summary.registered && !memRegistered && !dbSess?.connected_at) {
        await doPurge(sid, mem.phoneNumber || summary.phone, 'socket terputus tanpa kredensial');
        continue;
      }
      // Re-attach persistent socket on next watchdog cycle
      if (mem.disconnectedSince && now - mem.disconnectedSince > 10 * 60 * 1000) {
        clearSessionTimers(sid);
        clearMetaAiSession(sid);
        activeSessions.delete(sid);
      }
    }
  }

  // 3. Check all local disk auth folders
  if (fs.existsSync(AUTH_DIR)) {
    for (const entry of fs.readdirSync(AUTH_DIR)) {
      if (purgedIds.has(entry)) continue;
      const folderPath = safeSessionFolderPath(entry);
      if (!folderPath) continue;
      try {
        const stat = fs.lstatSync(folderPath);
        if (!stat.isDirectory()) continue;

        const mem = activeSessions.get(entry);
        const dbSess = getSessionById(entry);
        const { registered: isRegistered, phone: credsPhone } = readCredsSummary(entry);
        const memRegistered = Boolean(mem && (mem.status === 'connected' || mem.socket?.authState?.creds?.registered || mem.socket?.user?.id));

        if (!isRegistered && !memRegistered && !dbSess?.connected_at) {
          const isFreshConnecting = mem && mem.status === 'connecting' && now - mem.handshakeStartedAt <= UNSCANNED_HANDSHAKE_TTL_MS;
          if (!isFreshConnecting && now - stat.mtimeMs > UNSCANNED_HANDSHAKE_TTL_MS) {
            await doPurge(entry, credsPhone, 'folder auth tidak terdaftar & kadaluarsa');
          }
          continue;
        }

        const owner = resolveActiveVerifiedOwner(entry, dbSess?.user_id || mem?.userId, dbSess?.phone_number || credsPhone);
        if (!isOwnerActiveAndRegistered(owner)) {
          await doPurge(entry, credsPhone, 'folder auth milik user yang sudah terhapus/nonaktif');
          continue;
        }

        // Recover DB session entry when disk creds remain valid after build/restart
        if (!dbSess && owner) {
          addSession({
            id: entry,
            session_name: `WA - ${credsPhone || entry}`,
            phone_number: credsPhone || '',
            auth_method: 'qr_code',
            status: 'connected',
            user_id: owner.id,
            is_primary: true,
            expires_at: new Date(now + 365 * 24 * 60 * 60 * 1000).toISOString()
          });
        }
      } catch {
        // Ignore stat race
      }
    }
  }

      // 4. Check MySQL backed up Baileys auth keys (throttled to reduce MySQL queries)
      if (isMysqlConfigured() && (force || now - lastMysqlAuthPruneAt >= MYSQL_AUTH_PRUNE_INTERVAL_MS)) {
        lastMysqlAuthPruneAt = now;
        const mysqlAuthIds = await loadAllBaileysAuthSessionIdsFromMysql().catch(() => []);
        for (const sid of mysqlAuthIds) {
          if (purgedIds.has(sid)) continue;
          const mem = activeSessions.get(sid);
          if (mem && (mem.status === 'connected' || isSocketTrulyOpen(mem.socket))) continue;
          const dbSess = getSessionById(sid);
          const owner = resolveActiveVerifiedOwner(sid, dbSess?.user_id, dbSess?.phone_number);
          const hasDiskCreds = hasRegisteredCredsOnDisk(sid);
          if (!isOwnerActiveAndRegistered(owner) || (!dbSess && !hasDiskCreds)) {
            await doPurge(sid, dbSess?.phone_number, 'backup auth MySQL tidak memiliki pemilik/sesi aktif');
          }
        }
      }

      return purgedCount;
    } finally {
      lastPruneCompletedAt = Date.now();
      pruneInFlightPromise = null;
    }
  })();

  return pruneInFlightPromise;
}

// Helper to check if a session folder has valid registered credentials on disk
function hasRegisteredCredsOnDisk(sessionId: string): boolean {
  return readCredsSummary(sessionId).registered;
}

export function getPreferredSystemBaileysSessionId(): string | null {
  const db = initDbFile();
  const isAdminUser = (uid?: string) => {
    if (!uid) return false;
    const u = getUserById(uid);
    return Boolean(u && u.role === 'admin' && u.is_active);
  };

  // 1. Only pick live connected sessions owned by an Admin/Superadmin
  const connectedAdmin = Array.from(activeSessions.values()).filter(
    s => s.status === 'connected' && isSocketTrulyOpen(s.socket) && isAdminUser(s.userId)
  );
  if (connectedAdmin.length > 0) {
    const prim = connectedAdmin.find(s => s.is_primary);
    return prim ? prim.sessionId : connectedAdmin[0].sessionId;
  }

  // 2. Fallback to admin DB sessions that are active/connected
  const adminDb = db.sessions.filter(
    s => s.status === 'connected' && isAdminUser(s.user_id)
  );
  const primDb = adminDb.find(s => s.is_primary);
  return primDb?.id || adminDb[0]?.id || null;
}

// Auto-restore all saved active WhatsApp sessions on server startup
let isRestoringSessions = false;
export async function restoreSavedBaileysSessions() {
  if (isRestoringSessions || isSelfKilledByIpRule) return;
  isRestoringSessions = true;
  try {
    await checkAndEnforceIpKillSwitch('startup_restore').catch(() => {});
    if (isSelfKilledByIpRule) return;

    const mysqlBackedUpIds = await loadAllBaileysAuthSessionIdsFromMysql().catch(() => []);
    for (const sid of mysqlBackedUpIds) {
      const dbSess = getSessionById(sid);
      const owner = resolveActiveVerifiedOwner(sid, dbSess?.user_id, dbSess?.phone_number);
      if (!isOwnerActiveAndRegistered(owner)) continue;
      if (dbSess?.expires_at && new Date(dbSess.expires_at).getTime() < Date.now()) continue;
      await hydrateSessionAuthFolderFromMysql(sid).catch(() => false);
    }

    // Purge expired or ownerless sessions AFTER hydrating valid backups from MySQL
    await pruneInactiveAndUnregisteredBaileysSessions(true).catch(() => {});

    const dbSessions = getWhatsAppSessions();
    const diskFolders = fs.existsSync(AUTH_DIR) ? fs.readdirSync(AUTH_DIR) : [];

    const sessionIdsToRestore = new Set<string>();

    const canAutoStartOwner = (owner: ReturnType<typeof getUserById>): boolean => {
      return isOwnerActiveAndRegistered(owner);
    };

    for (const sid of mysqlBackedUpIds) {
      const dbSess = getSessionById(sid);
      const owner = resolveActiveVerifiedOwner(sid, dbSess?.user_id, dbSess?.phone_number);
      if (!canAutoStartOwner(owner)) continue;
      if (dbSess?.expires_at && new Date(dbSess.expires_at).getTime() < Date.now()) continue;

      await hydrateSessionAuthFolderFromMysql(sid);
      if (hasRegisteredCredsOnDisk(sid)) {
        sessionIdsToRestore.add(sid);
      }
    }

    dbSessions.forEach(s => {
      if (s.id && hasRegisteredCredsOnDisk(s.id)) {
        const owner = resolveActiveVerifiedOwner(s.id, s.user_id, s.phone_number);
        const notExpired = !s.expires_at || new Date(s.expires_at).getTime() >= Date.now();
        if (canAutoStartOwner(owner) && notExpired) {
          sessionIdsToRestore.add(s.id);
        }
      }
    });

    diskFolders.forEach(folder => {
      const folderPath = safeSessionFolderPath(folder);
      if (!folderPath) return;
      if (fs.lstatSync(folderPath).isDirectory() && hasRegisteredCredsOnDisk(folder)) {
        const dbSess = getSessionById(folder);
        const credsPhone = getCredsPhoneOnDisk(folder);
        const owner = resolveActiveVerifiedOwner(folder, dbSess?.user_id, dbSess?.phone_number || credsPhone);
        const notExpired = !dbSess?.expires_at || new Date(dbSess.expires_at).getTime() >= Date.now();
        if (canAutoStartOwner(owner) && notExpired) {
          sessionIdsToRestore.add(folder);
        }
      }
    });

    // Deduplicate candidate session IDs by (owner.id, phone) so we NEVER launch two sockets for the same WhatsApp number
    const dedupedByOwnerPhone = new Map<string, string>();
    for (const sid of sessionIdsToRestore) {
      const dbSess = getSessionById(sid);
      const phone = normalizePhoneNumber(dbSess?.phone_number || getCredsPhoneOnDisk(sid) || '');
      const owner = resolveActiveVerifiedOwner(sid, dbSess?.user_id, phone);
      if (!owner) continue;
      const dedupKey = phone ? `${owner.id}:${phone}` : sid;
      const existingSid = dedupedByOwnerPhone.get(dedupKey);
      if (!existingSid) {
        dedupedByOwnerPhone.set(dedupKey, sid);
      } else {
        const existingIsDb = Boolean(getSessionById(existingSid));
        const currentIsDb = Boolean(dbSess);
        if (!existingIsDb && currentIsDb) {
          dedupedByOwnerPhone.set(dedupKey, sid);
        }
      }
    }
    const finalSessionIdsToRestore = Array.from(dedupedByOwnerPhone.values());
    for (const sid of finalSessionIdsToRestore) {
      const dbSess = getSessionById(sid);
      const phone = normalizePhoneNumber(dbSess?.phone_number || getCredsPhoneOnDisk(sid) || '');
      const owner = resolveActiveVerifiedOwner(sid, dbSess?.user_id, phone);
      if (owner && phone) {
        cleanupDuplicateSessionsForOwnerPhone(sid, owner.id, phone);
      }
    }

    console.log(
      `[Baileys Persistent Storage] Found ${finalSessionIdsToRestore.length} active WhatsApp session(s) to restore.`
    );

    // Notify owners only for genuinely broken/expired sessions
    for (const s of dbSessions) {
      if (s.id && s.status === 'connected' && !finalSessionIdsToRestore.includes(s.id)) {
        updateSession(s.id, { status: 'disconnected' });
        const owner = resolveActiveVerifiedOwner(s.id, s.user_id, s.phone_number);
        if (!isOwnerActiveAndRegistered(owner)) continue;
        const isExpiredByDate = Boolean(s.expires_at && new Date(s.expires_at).getTime() < Date.now());
        await notifyUserSessionExpired({
          sessionId: s.id,
          sessionName: s.session_name,
          expiredPhone: s.phone_number,
          userId: owner!.id,
          reason: isExpiredByDate
            ? 'masa aktif sesi berakhir saat aplikasi di-restart'
            : 'kredensial login tidak ditemukan setelah build/restart server'
        }).catch(() => {});
      }
    }

    await resolveCurrentServerIdentity().catch(() => {});

    const restoreLeaseTargets = finalSessionIdsToRestore.map(sid => {
      const dbSess = getSessionById(sid);
      return {
        id: sid,
        user_id: dbSess?.user_id,
        phone_number: dbSess?.phone_number || getCredsPhoneOnDisk(sid) || undefined
      };
    });
    await refreshRemoteSessionLeasesIfNeeded(restoreLeaseTargets).catch(() => {});

    for (const sid of finalSessionIdsToRestore) {
      if (isSelfKilledByIpRule) break;
      const existing = activeSessions.get(sid);
      if (!existing || existing.status !== 'connected' || !isSocketTrulyOpen(existing.socket)) {
        try {
          const dbSess = getSessionById(sid);
          const ownerForRestore = dbSess?.user_id ? getUserById(dbSess.user_id) : undefined;
          if (dbSess && !isSessionOwnedByCurrentAppNode(dbSess, undefined, ownerForRestore)) {
            const targetApp = resolveEffectiveAssignedAppId(dbSess, ownerForRestore);
            console.log(
              `[Baileys Auto-Restore] Skip ${sid}: ${dbSess.assignment_status === 'released' ? 'status dilepas dari socket' : `ditugaskan ke APP_ID "${targetApp || '-'}"`} (APP_ID ini: "${getDisplayAppId()}").`
            );
            continue;
          }
          const cleanPhone = normalizePhoneNumber(dbSess?.phone_number || getCredsPhoneOnDisk(sid) || '');
          const localSibling = findLiveLocalSiblingLease({
            sessionId: sid,
            userId: dbSess?.user_id,
            cleanPhone
          });
          if (localSibling) {
            console.log(`[Baileys Auto-Restore] Skip ${sid}: sudah aktif pada proses lokal lain (PID ${localSibling.pid}).`);
            continue;
          }
          const remoteLease = await evaluateRemoteLeaseForSession({
            sessionId: sid,
            userId: dbSess?.user_id,
            cleanPhone,
            assignedAppId: dbSess?.assigned_app_id
          });
          if (remoteLease.status === 'same_domain_ip' || remoteLease.status === 'remote_cluster_node') {
            console.log(`[Baileys Auto-Restore] Skip ${sid}: sudah aktif pada cluster / host aktif.`);
            continue;
          }
          if (remoteLease.status === 'different_ip') {
            console.log(`[Baileys Auto-Restore] Skip ${sid}: sedang aktif di server/IP berbeda (${remoteLease.lease?.server_ip || '-'}). Tidak memaksa konek ulang.`);
            continue;
          }
          if (isMultiNodeOrchestrationEnabled()) {
            const maxConn = getCurrentNodeMaxConnections();
            if (countLocalOccupiedConnections(sid) >= maxConn) {
              console.log(`[Baileys Auto-Restore] Kapasitas node ${getCurrentAppId()} penuh (${maxConn}); mendelegasikan ${sid} ke node lain...`);
              if (dbSess) {
                await delegateSessionToNextNodeOrError(
                  dbSess,
                  `Kapasitas koneksi node ${getCurrentAppId()} penuh (${maxConn}) saat startup`,
                  { markCurrentFailed: false }
                ).catch(() => {});
              }
              continue;
            }
          }
          console.log(`[Baileys Auto-Restore] Rehydrating session: ${sid}...`);
          await getOrStartBaileysSession(sid, dbSess?.phone_number, dbSess?.user_id);
          await delay(250);
        } catch (err) {
          console.error(`[Baileys Auto-Restore Error] Failed to restore session ${sid}:`, err);
        }
      }
    }
  } catch (err) {
    console.error('[Baileys Restore Error]', err);
  } finally {
    isRestoringSessions = false;
    setBaileysStartupPending(false);
    void publishCurrentSocketRecord({ force: true }).catch(() => {});
    if (!isSelfKilledByIpRule) {
      setTimeout(() => {
        runAppNodeAssignmentTick('post_restore').catch(() => {});
      }, 3000).unref?.();
    }
  }
}

let lastHealthCheckAt = 0;
let lastWakeRecoverAt = 0;
let wakeRecoverPromise: Promise<void> | null = null;
let healthCheckInFlightPromise: Promise<{ checked: number; healed: number; notified: number }> | null = null;

export async function runBaileysPeriodicHealthCheck(): Promise<{
  checked: number;
  healed: number;
  notified: number;
}> {
  if (isBaileysStartupPending() || isRestoringSessions || isSelfKilledByIpRule) {
    return { checked: 0, healed: 0, notified: 0 };
  }
  if (healthCheckInFlightPromise) {
    return healthCheckInFlightPromise;
  }

  healthCheckInFlightPromise = (async () => {
    const now = Date.now();
    lastHealthCheckAt = now;
    let checked = 0;
    let healed = 0;
    let notified = 0;

    cleanupExpiredCommandStates(now);
    if (recentBotOutgoingTexts.size > 0) {
      for (const [k, time] of recentBotOutgoingTexts.entries()) {
        if (now - time > 45000) recentBotOutgoingTexts.delete(k);
      }
    }

    await pruneInactiveAndUnregisteredBaileysSessions();

    const dbSessions = getWhatsAppSessions();
    // Release any local socket whose DB target APP_ID / owner APP_ID moved elsewhere or was released
    for (const [sid, mem] of Array.from(activeSessions.entries())) {
      if (mem.superseded) continue;
      const sMeta = dbSessions.find(x => x.id === sid);
      const owner = (sMeta?.user_id || mem.userId) ? getUserById((sMeta?.user_id || mem.userId)!) : undefined;
      if (sMeta && !isSessionOwnedByCurrentAppNode(sMeta, undefined, owner)) {
        await releaseLocalSocketForDelegation(sid).catch(() => {});
      }
    }

    const healthLeaseTargets = dbSessions.filter(s => {
      if (!s.id || s.status !== 'connected') return false;
      if (s.expires_at && new Date(s.expires_at).getTime() < now) return false;
      const mem = activeSessions.get(s.id);
      return !(mem && !mem.superseded && mem.status === 'connected' && isSocketTrulyOpen(mem.socket));
    });
    if (healthLeaseTargets.length > 0) {
      await refreshRemoteSessionLeasesIfNeeded(healthLeaseTargets).catch(() => {});
    }

    for (const s of dbSessions) {
      if (!s.id || s.status !== 'connected') continue;
      if (s.expires_at && new Date(s.expires_at).getTime() < now) continue;
      const nodeOwner = s.user_id ? getUserById(s.user_id) : undefined;
      if (!isSessionOwnedByCurrentAppNode(s, undefined, nodeOwner)) continue;
      checked++;

      const liveStatus = getLiveSessionRuntimeStatus(s);
      const mem = activeSessions.get(s.id);
      if (mem && !mem.superseded && mem.status === 'connected' && isSocketTrulyOpen(mem.socket)) {
        let socketHealthy = true;
        if (now - mem.lastUpdated > 50_000 && typeof mem.socket?.query === 'function') {
          try {
            await Promise.race([
              mem.socket.query({
                tag: 'iq',
                attrs: { to: 's.whatsapp.net', type: 'get', xmlns: 'w:p' },
                content: [{ tag: 'ping', attrs: {} }]
              }),
              new Promise((_, reject) => setTimeout(() => reject(new Error('ping_timeout')), 6000))
            ]);
            socketPingFailures.delete(s.id);
            mem.lastUpdated = Date.now();
            recordSessionSendVerified(s.id, s.phone_number);
          } catch {
            socketHealthy = false;
            const fails = (socketPingFailures.get(s.id) || 0) + 1;
            socketPingFailures.set(s.id, fails);
            if (fails >= 2 && !isSessionInConflictCooldown(s.id)) {
              socketPingFailures.delete(s.id);
              console.warn(`[Baileys Watchdog] Socket zombie terdeteksi untuk ${s.id} (${fails}x ping gagal); menyambung ulang...`);
              await closeSocketAndWait(mem.socket, mem, s.id, 1800);
              if (activeSessions.get(s.id) === mem) {
                activeSessions.delete(s.id);
              }
              healed++;
              getOrStartBaileysSession(s.id, s.phone_number, s.user_id, { forceReconnect: true }).catch(() => {});
              continue;
            }
          }
        }

        if (socketHealthy) {
          void publishActiveSessionLease(mem);
          if (getPendingMissedMessages(s.id).length > 0) {
            void processPendingMissedMessagesForSession(s.id, 'watchdog');
          }
        }
        continue;
      }

      const watchdogConflictEntry = sessionConflictStates.get(s.id);
      if (watchdogConflictEntry?.reason === 'transient' && canAutoRecoverFromConflictCooldown(s.id)) {
        clearSessionConflictState(s.id);
      }

      const freshLiveStatus = getLiveSessionRuntimeStatus(s);
      if (
        freshLiveStatus.runtime_status === 'connected' ||
        freshLiveStatus.runtime_status === 'connecting' ||
        freshLiveStatus.conflict_paused
      ) {
        continue;
      }

      if (reconnectTimers.has(s.id) || sessionStartLocks.has(s.id) || isRestoringSessions) {
        continue;
      }

      if (isSessionInConflictCooldown(s.id)) {
        continue;
      }

      const isConnectingRecently =
        mem && !mem.superseded && mem.status === 'connecting' && now - mem.lastUpdated < 60000;
      if (isConnectingRecently) continue;

      const cleanPhone = normalizePhoneNumber(s.phone_number || getCredsPhoneOnDisk(s.id) || '');
      if (cleanPhone && hasOtherActiveOrConnectingSocketForPhone(s.id, cleanPhone, s.user_id)) {
        continue;
      }

      const owner = resolveActiveVerifiedOwner(s.id, s.user_id, s.phone_number);
      if (!isOwnerActiveAndRegistered(owner ?? null)) continue;

      let hasCreds = hasRegisteredCredsOnDisk(s.id);
      if (!hasCreds) {
        hasCreds = await hydrateSessionAuthFolderFromMysql(s.id).catch(() => false);
      }

      if (!hasCreds) {
        updateSession(s.id, { status: 'disconnected' });
        const alertRes = await notifyUserSessionExpired({
          sessionId: s.id,
          sessionName: s.session_name,
          expiredPhone: s.phone_number,
          userId: owner!.id,
          reason: 'kredensial login WhatsApp sudah tidak valid atau terputus'
        }).catch(() => ({ notified: false }));
        if (alertRes.notified) notified++;
        continue;
      }

      if (
        mem &&
        mem.status === 'disconnected' &&
        mem.disconnectedSince &&
        now - mem.disconnectedSince >= 5 * 60 * 1000
      ) {
        const alertRes = await notifyUserSessionExpired({
          sessionId: s.id,
          sessionName: s.session_name,
          expiredPhone: s.phone_number,
          userId: owner!.id,
          reason: 'koneksi WhatsApp terputus lebih dari 5 menit dan gagal pulih otomatis'
        }).catch(() => ({ notified: false }));
        if (alertRes.notified) notified++;
      }

      console.log(
        `[Baileys Watchdog] Auto-healing session ${s.id} (${s.phone_number || 'active'})...`
      );
      healed++;
      getOrStartBaileysSession(s.id, s.phone_number, owner!.id || s.user_id).catch(() => {});
    }

    if (getSuperadminWaQueue().length > 0 && resolveConnectedSuperadminSession()) {
      drainSuperadminWaQueue('watchdog').catch(() => {});
    }

    const pendingRes = await processPendingSessionExpiryAlerts('watchdog').catch(() => ({
      checked: 0,
      sent: 0,
      cancelled: 0,
      waiting: 0
    }));
    notified += pendingRes.sent;

    return { checked, healed, notified };
  })().finally(() => {
    healthCheckInFlightPromise = null;
  });

  return healthCheckInFlightPromise;
}

/**
 * Shared-hosting wake-up & catch-up entrypoint called by /api/health & /api/cron/keepalive.
 * Respects 440 conflict cooldowns and 15s throttling so pings stay ultra-lightweight.
 */
export async function ensureSessionsAwakeAndRecoverMissed(reason = 'health_ping'): Promise<void> {
  if (isBaileysStartupPending() || isRestoringSessions || isSelfKilledByIpRule) return;
  const now = Date.now();
  if (now - lastWakeRecoverAt < 15_000) return;
  if (wakeRecoverPromise) return wakeRecoverPromise;
  lastWakeRecoverAt = now;

  wakeRecoverPromise = (async () => {
    try {
      const dbSessions = getWhatsAppSessions();
      const wakeLeaseTargets = dbSessions.filter(s => {
        if (!s.id || s.status !== 'connected') return false;
        if (s.expires_at && new Date(s.expires_at).getTime() < Date.now()) return false;
        const mem = activeSessions.get(s.id);
        return !(mem && !mem.superseded && mem.status === 'connected' && isSocketTrulyOpen(mem.socket));
      });
      if (wakeLeaseTargets.length > 0) {
        await refreshRemoteSessionLeasesIfNeeded(wakeLeaseTargets).catch(() => {});
      }

      for (const s of dbSessions) {
        if (!s.id || s.status !== 'connected') continue;
        if (s.expires_at && new Date(s.expires_at).getTime() < Date.now()) continue;
        if (!isSessionOwnedByCurrentAppNode(s)) continue;

        const mem = activeSessions.get(s.id);
        if (mem && !mem.superseded && mem.status === 'connected' && isSocketTrulyOpen(mem.socket)) {
          if (getPendingMissedMessages(s.id).length > 0) {
            void processPendingMissedMessagesForSession(s.id, reason);
          }
          continue;
        }

        const wakeConflictEntry = sessionConflictStates.get(s.id);
        if (wakeConflictEntry?.reason === 'transient' && canAutoRecoverFromConflictCooldown(s.id)) {
          clearSessionConflictState(s.id);
        }

        const liveStatus = getLiveSessionRuntimeStatus(s);
        if (
          liveStatus.runtime_status === 'connected' ||
          liveStatus.runtime_status === 'connecting' ||
          liveStatus.conflict_paused
        ) {
          continue;
        }

        if (
          isRestoringSessions ||
          isBaileysStartupPending() ||
          reconnectTimers.has(s.id) ||
          sessionStartLocks.has(s.id) ||
          isSessionInConflictCooldown(s.id)
        ) {
          continue;
        }

        const isConnectingRecently =
          mem && !mem.superseded && mem.status === 'connecting' && Date.now() - mem.lastUpdated < 60000;
        if (isConnectingRecently) continue;

        const cleanPhone = normalizePhoneNumber(s.phone_number || getCredsPhoneOnDisk(s.id) || '');
        if (cleanPhone && hasOtherActiveOrConnectingSocketForPhone(s.id, cleanPhone, s.user_id)) {
          continue;
        }

        const owner = resolveActiveVerifiedOwner(s.id, s.user_id, s.phone_number);
        if (!isOwnerActiveAndRegistered(owner)) continue;

        let hasCreds = hasRegisteredCredsOnDisk(s.id);
        if (!hasCreds) {
          hasCreds = await hydrateSessionAuthFolderFromMysql(s.id).catch(() => false);
        }
        if (hasCreds) {
          getOrStartBaileysSession(s.id, s.phone_number, owner!.id || s.user_id).catch(() => {});
        }
      }

      if (Date.now() - lastHealthCheckAt > 20_000) {
        void runBaileysPeriodicHealthCheck().catch(() => {});
      }
    } finally {
      wakeRecoverPromise = null;
    }
  })();

  return wakeRecoverPromise;
}

// Background Keep-Alive, Auto-Heal, Expiry Check & Notification Watchdog (every 25s)
let baileysWatchdogTimer: ReturnType<typeof setInterval> | null = setInterval(() => {
  runBaileysPeriodicHealthCheck().catch(() => {});
}, 25000);
baileysWatchdogTimer.unref?.();
let appNodeTaskTimer: ReturnType<typeof setInterval> | null = null;
let interAppKeepaliveTimer: ReturnType<typeof setInterval> | null = null;

export async function shutdownBaileysManager(options?: {
  selfKilled?: boolean;
  reason?: string;
}): Promise<void> {
  if (baileysWatchdogTimer) {
    clearInterval(baileysWatchdogTimer);
    baileysWatchdogTimer = null;
  }
  if (appNodeTaskTimer) {
    clearInterval(appNodeTaskTimer);
    appNodeTaskTimer = null;
  }
  if (!options?.selfKilled) {
    clearInterval(ipKillCheckTimer);
    if (interAppKeepaliveTimer) {
      clearInterval(interAppKeepaliveTimer);
      interAppKeepaliveTimer = null;
    }
  }
  for (const buf of offlineCatchupBuffers.values()) {
    clearTimeout(buf.timer);
  }
  offlineCatchupBuffers.clear();
  closeAllClusterMeshWebSockets();
  for (const sid of Array.from(authBackupTimers.keys())) {
    clearSessionTimers(sid);
  }
  for (const sid of Array.from(reconnectTimers.keys())) {
    clearSessionTimers(sid);
  }

  const closeTasks: Promise<void>[] = [];
  for (const [sid, sessionData] of activeSessions.entries()) {
    sessionData.superseded = true;
    sessionData.closedByApp = true;
    if (sessionData.stabilityTimer) {
      clearTimeout(sessionData.stabilityTimer);
      sessionData.stabilityTimer = undefined;
    }
    recordLastCloseTimestamp(sid);
    const cleanPhone = normalizePhoneNumber(sessionData.phoneNumber || getCredsPhoneOnDisk(sid) || '');
    closeTasks.push(closeSocketAndWait(sessionData.socket, sessionData, sid, 1400).catch(() => {}));
    if (isMysqlConfigured()) {
      closeTasks.push(
        deleteWaSessionLeaseFromMysql({
          sessionId: sid,
          phoneNumber: cleanPhone || undefined,
          expectedInstanceId: RUNTIME_INSTANCE_ID
        }).catch(() => {})
      );
    }
  }

  if (closeTasks.length > 0) {
    await Promise.race([
      Promise.allSettled(closeTasks).then(() => {}),
      delay(1800)
    ]);
  }

  for (const t of transient440Timers.values()) {
    clearTimeout(t);
  }
  transient440Timers.clear();
  activeSessions.clear();
  sessionStartLocks.clear();
  sessionConflictStates.clear();
  socketPingFailures.clear();
  missedCatchupLocks.clear();
  lastAuthBackupAt.clear();
  lastAuthBackupHashes.clear();
  commandState.clear();
  processedMessageIds.clear();
  recentBotOutgoingTexts.clear();
  incomingChatQueues.clear();
  sessionUpsertQueues.clear();
  sessionPeerLidPnMap.clear();
  for (const sid of Array.from(sessionUserDevicesCaches.keys())) {
    clearSessionCacheStores(sid);
  }

  if (options?.selfKilled) {
    await publishCurrentSocketRecord({ force: true, statusOverride: 'killed' }).catch(() => {});
  } else {
    await publishCurrentSocketRecord({ force: true, statusOverride: 'offline' }).catch(() => {});
  }
}

async function resolveTargetSessionForOutgoing(
  idOrPhone: string,
  options?: { userId?: string; allowAdminFallback?: boolean }
): Promise<{ targetSession: SessionState; sessionUserId?: string }> {
  const db = initDbFile();

  const resolvedDbById = idOrPhone ? getSessionById(idOrPhone) : null;
  const targetUserId =
    options?.userId ||
    resolvedDbById?.user_id ||
    (idOrPhone ? extractUserIdFromSessionId(idOrPhone, db.users) : undefined);

  const belongsToTargetUser = (s: { sessionId?: string; id?: string; userId?: string; user_id?: string }) => {
    if (!targetUserId) return true;
    const sid = s.sessionId || s.id || '';
    const uid = s.userId || s.user_id || '';
    return uid === targetUserId || (Boolean(sid) && isSessionOwnedByUserId(sid, targetUserId));
  };

  let targetSession: SessionState | undefined = idOrPhone ? activeSessions.get(idOrPhone) : undefined;
  if (targetSession && (!belongsToTargetUser(targetSession) || targetSession.status !== 'connected' || !isSocketTrulyOpen(targetSession.socket))) {
    targetSession = undefined;
  }

  if (!targetSession) {
    const cleanId = idOrPhone ? idOrPhone.replace(/\D/g, '') : '';
    for (const s of activeSessions.values()) {
      if (s.status === 'connected' && isSocketTrulyOpen(s.socket) && belongsToTargetUser(s)) {
        if (
          s.sessionId === idOrPhone ||
          (cleanId.length >= 8 && s.phoneNumber && normalizePhoneNumber(s.phoneNumber) === normalizePhoneNumber(cleanId))
        ) {
          targetSession = s;
          break;
        }
      }
    }
  }

  if (!targetSession && targetUserId) {
    const userConnected = Array.from(activeSessions.values()).filter(
      s => s.status === 'connected' && isSocketTrulyOpen(s.socket) && belongsToTargetUser(s)
    );
    targetSession = userConnected.find(s => s.is_primary) || userConnected[0];
  }

  if (!targetSession && (!targetUserId || options?.allowAdminFallback)) {
    const adminSysId = getPreferredSystemBaileysSessionId();
    if (adminSysId) {
      const candidate = activeSessions.get(adminSysId);
      if (candidate && candidate.status === 'connected' && isSocketTrulyOpen(candidate.socket)) {
        targetSession = candidate;
      }
    }
  }

  if (!targetSession) {
    const candidateFolders: string[] = [];
    const now = Date.now();
    const isNotExpiredSession = (sess: { expires_at?: string } | null | undefined) =>
      !sess?.expires_at || Date.parse(sess.expires_at) >= now;

    if (
      idOrPhone &&
      (!targetUserId || resolvedDbById?.user_id === targetUserId || isSessionOwnedByUserId(idOrPhone, targetUserId)) &&
      isNotExpiredSession(resolvedDbById)
    ) {
      candidateFolders.push(idOrPhone);
    }

    const userCandidateDb = [...db.sessions]
      .filter(s => s.id && belongsToTargetUser(s) && isNotExpiredSession(s))
      .sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)));

    for (const s of userCandidateDb) {
      if (!candidateFolders.includes(s.id)) {
        candidateFolders.push(s.id);
      }
    }

    for (const folderId of candidateFolders) {
      const candMeta = getSessionById(folderId);
      if (candMeta && !isSessionOwnedByCurrentAppNode(candMeta)) {
        continue;
      }
      if (isSessionInConflictCooldown(folderId)) {
        continue;
      }
      let hasCreds = hasRegisteredCredsOnDisk(folderId);
      if (!hasCreds) {
        hasCreds = await hydrateSessionAuthFolderFromMysql(folderId).catch(() => false);
      }
      if (hasCreds) {
        console.log(`[Baileys Auto-Connect] Waking session "${folderId}" for outgoing Blast/API dispatch...`);
        const sessMeta = candMeta || getSessionById(folderId);
        targetSession = await getOrStartBaileysSession(folderId, sessMeta?.phone_number, sessMeta?.user_id || targetUserId);
        let waitCount = 0;
        while (waitCount < 14 && targetSession && targetSession.status !== 'connected') {
          await delay(500);
          waitCount++;
        }
        if (targetSession && targetSession.status === 'connected' && isSocketTrulyOpen(targetSession.socket)) {
          targetSession.lastOutgoingAt = Date.now();
          break;
        }
        targetSession = undefined;
      }
    }

    if (!targetSession && targetUserId) {
      const fallbackEntry = await ensureConnectedSessionForUser(targetUserId, idOrPhone || undefined);
      if (fallbackEntry) {
        const mem = activeSessions.get(fallbackEntry.sessionId);
        if (mem && mem.status === 'connected' && isSocketTrulyOpen(mem.socket)) {
          mem.lastOutgoingAt = Date.now();
          targetSession = mem;
        }
      }
    }
  }

  if (!targetSession) {
    const connectingSession = Array.from(activeSessions.values()).find(
      s => s.status === 'connecting' && belongsToTargetUser(s)
    );
    if (connectingSession) {
      let waitRetry = 0;
      while (waitRetry < 10 && connectingSession.status === 'connecting') {
        await delay(500);
        waitRetry++;
      }
      if (connectingSession.status === 'connected' && isSocketTrulyOpen(connectingSession.socket)) {
        targetSession = connectingSession;
      }
    }
  }

  if (targetSession && targetSession.socket && isSocketTrulyOpen(targetSession.socket)) {
    const idleMs = Date.now() - Math.max(targetSession.lastUpdated || 0, targetSession.lastOutgoingAt || 0);
    if (idleMs > 25000 && typeof targetSession.socket.query === 'function') {
      try {
        await targetSession.socket.query(
          {
            tag: 'iq',
            attrs: { to: 's.whatsapp.net', type: 'get', xmlns: 'w:p' },
            content: [{ tag: 'ping', attrs: {} }]
          },
          2500
        );
        targetSession.lastUpdated = Date.now();
      } catch {
        // Only tear down & reconnect if the socket actually closed and NOT paused on conflict; avoid self-inflicted 440
        if (!isSocketTrulyOpen(targetSession.socket) && !isSessionInConflictCooldown(targetSession.sessionId)) {
          console.warn(`[Baileys Liveness Probe] Socket idle >25s (${targetSession.sessionId}) terputus saat ping; menyambung ulang cepat...`);
          const refreshed = await getOrStartBaileysSession(
            targetSession.sessionId,
            targetSession.phoneNumber || undefined,
            targetSession.userId,
            { forceReconnect: true }
          ).catch(() => null);
          if (refreshed) {
            let waitIdx = 0;
            while (waitIdx < 16 && refreshed.status !== 'connected') {
              await delay(250);
              waitIdx++;
            }
            if (refreshed.status === 'connected' && isSocketTrulyOpen(refreshed.socket)) {
              targetSession = refreshed;
            }
          }
        }
      }
    }
  }

  if (!targetSession || !targetSession.socket || targetSession.status !== 'connected' || !isSocketTrulyOpen(targetSession.socket)) {
    throw new Error('Gagal terhubung ke WhatsApp Sesi milik akun ini. Pastikan nomor WhatsApp Anda sudah terhubung (Scan QR / Kode Pairing) di menu Koneksi WA.');
  }

  targetSession.lastOutgoingAt = Date.now();

  const sessionUserId =
    targetUserId ||
    targetSession.userId ||
    extractUserIdFromSessionId(targetSession.sessionId, db.users);

  return { targetSession, sessionUserId };
}

export interface BaileysMediaPayload {
  mediaType: 'image' | 'document' | 'video' | 'audio';
  mediaBuffer?: Buffer;
  mediaUrl?: string;
  mimetype?: string;
  fileName?: string;
  caption?: string;
  text?: string;
  sendTextSeparately?: boolean;
}

export async function sendBaileysMediaMessage(
  idOrPhone: string,
  recipientPhone: string,
  payload: BaileysMediaPayload,
  options?: { userId?: string; isBroadcast?: boolean; skipLog?: boolean; skipQuota?: boolean; allowAdminFallback?: boolean }
) {
  const cleanRecipient = normalizePhoneNumber(recipientPhone);
  if (!cleanRecipient || cleanRecipient.length < 8) {
    throw new Error(`Nomor WhatsApp tujuan tidak valid (${recipientPhone}).`);
  }

  const jid = `${cleanRecipient}@s.whatsapp.net`;
  let { targetSession, sessionUserId } = await resolveTargetSessionForOutgoing(idOrPhone, options);

  const mediaData: any = payload.mediaBuffer
    ? payload.mediaBuffer
    : payload.mediaUrl
      ? { url: payload.mediaUrl }
      : null;

  if (!mediaData) {
    throw new Error('Konten media atau dokumen kosong.');
  }

  const standaloneText = payload.text ? String(payload.text).trim() : '';
  const captionText = payload.caption ? String(payload.caption).trim() : '';

  if ((standaloneText && isInternalPromptLeakText(standaloneText)) || (captionText && isInternalPromptLeakText(captionText))) {
    recordAiAuditEvent({
      level: 'ERROR',
      stage: 'prompt_leak_firewall',
      senderPhone: cleanRecipient,
      error_code: 'OUTGOING_MEDIA_PROMPT_LEAK_BLOCKED',
      reason: 'Memblokir pengiriman media yang caption/teksnya berisi prompt internal AI.'
    });
    throw new Error('Diblokir oleh Prompt Leak Firewall: teks mengandung prompt internal AI.');
  }

  const buildBaileysContent = () => {
    if (payload.mediaType === 'image') {
      return {
        image: mediaData,
        ...(captionText ? { caption: captionText } : {}),
        ...(payload.mimetype ? { mimetype: payload.mimetype } : {})
      };
    }
    if (payload.mediaType === 'video') {
      return {
        video: mediaData,
        ...(captionText ? { caption: captionText } : {}),
        ...(payload.mimetype ? { mimetype: payload.mimetype } : {})
      };
    }
    if (payload.mediaType === 'audio') {
      return {
        audio: mediaData,
        mimetype: payload.mimetype || 'audio/mpeg',
        ptt: false
      };
    }
    return {
      document: mediaData,
      mimetype: payload.mimetype || 'application/pdf',
      fileName: payload.fileName || 'document.pdf',
      ...(captionText ? { caption: captionText } : {})
    };
  };

  const logPreview =
    [
      standaloneText || '',
      `[${payload.mediaType.toUpperCase()}${payload.fileName ? `: ${payload.fileName}` : ''}]`,
      captionText || ''
    ]
      .filter(Boolean)
      .join(' ')
      .slice(0, 1000);

  console.log(`[Baileys Outgoing Media:${payload.mediaType}] Sending to ${jid} via session ${targetSession.sessionId}...`);

  let result: any = null;
  try {
    if (typeof targetSession.socket?.sendPresenceUpdate === 'function') {
      void Promise.race([
        Promise.resolve().then(() => targetSession.socket.sendPresenceUpdate('composing', jid)),
        delay(800)
      ]).catch(() => {});
    }

    if (standaloneText && (payload.sendTextSeparately || captionText || payload.mediaType === 'audio')) {
      recordBotOutgoing(standaloneText);
      await sendSocketMessageWithAckGuard(
        targetSession.socket,
        jid,
        { text: standaloneText },
        { timeoutMs: 24000, sessionData: targetSession }
      );
      await delay(300);
    }

    if (captionText) recordBotOutgoing(captionText);
    result = await sendSocketMessageWithAckGuard(
      targetSession.socket,
      jid,
      buildBaileysContent(),
      { timeoutMs: 32000, sessionData: targetSession }
    );
  } catch (firstErr: any) {
    const errMsg = String(firstErr?.message || '');
    const isSocketDrop = /closed|terputus|connection/i.test(errMsg);
    if (!isSocketDrop) {
      if (!options?.skipLog) {
        addMessageLog({
          wam_id: `baileys_fail_${Date.now()}`,
          session_id: targetSession.sessionId,
          user_id: sessionUserId,
          sender_phone: cleanRecipient,
          sender_name: options?.isBroadcast ? `Broadcast (${cleanRecipient})` : `Tujuan (${cleanRecipient})`,
          message_body: logPreview,
          direction: 'outgoing',
          status: 'Gagal',
          error_detail: errMsg || 'Gagal mengirim media/dokumen'
        });
      }
      throw firstErr;
    }

    console.warn(`[Baileys Outgoing Media Reconnect] Socket terputus (${errMsg}), menyambung ulang sekali...`);
    await delay(600);
    const refreshed = activeSessions.get(targetSession.sessionId);
    if (!refreshed || !refreshed.socket || refreshed.status !== 'connected' || !isSocketTrulyOpen(refreshed.socket)) {
      if (!options?.skipLog) {
        addMessageLog({
          wam_id: `baileys_fail_${Date.now()}`,
          session_id: targetSession.sessionId,
          user_id: sessionUserId,
          sender_phone: cleanRecipient,
          sender_name: options?.isBroadcast ? `Broadcast (${cleanRecipient})` : `Tujuan (${cleanRecipient})`,
          message_body: logPreview,
          direction: 'outgoing',
          status: 'Gagal',
          error_detail: errMsg || 'Koneksi terputus saat kirim media'
        });
      }
      throw firstErr;
    }
    targetSession = refreshed;
    try {
      result = await sendSocketMessageWithAckGuard(
        targetSession.socket,
        jid,
        buildBaileysContent(),
        { timeoutMs: 32000, sessionData: targetSession }
      );
    } catch (retryErr: any) {
      if (!options?.skipLog) {
        addMessageLog({
          wam_id: `baileys_fail_${Date.now()}`,
          session_id: targetSession.sessionId,
          user_id: sessionUserId,
          sender_phone: cleanRecipient,
          sender_name: options?.isBroadcast ? `Broadcast (${cleanRecipient})` : `Tujuan (${cleanRecipient})`,
          message_body: logPreview,
          direction: 'outgoing',
          status: 'Gagal',
          error_detail: retryErr?.message || 'Gagal mengirim media/dokumen setelah percobaan ulang'
        });
      }
      throw retryErr;
    }
  }

  if (!options?.skipLog) {
    addMessageLog({
      wam_id: result?.key?.id || `baileys_${Date.now()}`,
      session_id: targetSession.sessionId,
      user_id: sessionUserId,
      sender_phone: cleanRecipient,
      sender_name: options?.isBroadcast ? `Broadcast (${cleanRecipient})` : `Tujuan (${cleanRecipient})`,
      message_body: logPreview,
      direction: 'outgoing',
      status: 'Sukses',
      reply_body: logPreview
    });
  }

  targetSession.lastOutgoingAt = Date.now();
  recordSessionSendVerified(targetSession.sessionId, targetSession.phoneNumber || undefined);
  clearSessionConflictState(targetSession.sessionId);
  sessionDisconnectDiagnostics.delete(targetSession.sessionId);

  if (!options?.skipQuota && sessionUserId) {
    deductUserDailyQuota(sessionUserId);
  }

  return {
    success: true,
    wam_id: result?.key?.id,
    to: cleanRecipient,
    session_id: targetSession.sessionId,
    media_type: payload.mediaType,
    raw: result
  };
}

// Send actual outgoing WhatsApp message via connected Baileys socket with strict multi-tenant isolation
export async function sendBaileysTextMessage(
  idOrPhone: string,
  recipientPhone: string,
  text: string,
  options?: { userId?: string; isBroadcast?: boolean; skipLog?: boolean; skipQuota?: boolean; allowAdminFallback?: boolean }
) {
  const cleanRecipient = normalizePhoneNumber(recipientPhone);
  if (!cleanRecipient || cleanRecipient.length < 8) {
    throw new Error(`Nomor WhatsApp tujuan tidak valid (${recipientPhone}).`);
  }

  if (isInternalPromptLeakText(text)) {
    recordAiAuditEvent({
      level: 'ERROR',
      stage: 'prompt_leak_firewall',
      senderPhone: cleanRecipient,
      error_code: 'OUTGOING_TEXT_PROMPT_LEAK_BLOCKED',
      reason: 'Memblokir sendBaileysTextMessage karena teks mengandung prompt internal AI.'
    });
    throw new Error('Diblokir oleh Prompt Leak Firewall: teks mengandung prompt internal AI.');
  }

  const jid = `${cleanRecipient}@s.whatsapp.net`;
  let { targetSession, sessionUserId } = await resolveTargetSessionForOutgoing(idOrPhone, options);

  console.log(`[Baileys Outgoing] Sending message to ${jid} via session ${targetSession.sessionId}...`);
  recordBotOutgoing(text);

  let result: any = null;
  try {
    if (typeof targetSession.socket?.sendPresenceUpdate === 'function') {
      void Promise.race([
        Promise.resolve().then(() => targetSession.socket.sendPresenceUpdate('composing', jid)),
        delay(800)
      ]).catch(() => {});
    }
    result = await sendSocketMessageWithAckGuard(
      targetSession.socket,
      jid,
      { text },
      { timeoutMs: 24000, sessionData: targetSession }
    );
  } catch (firstErr: any) {
    const errMsg = String(firstErr?.message || '');
    const isSocketDrop = /closed|terputus|connection/i.test(errMsg);
    if (!isSocketDrop) {
      if (!options?.skipLog) {
        addMessageLog({
          wam_id: `baileys_fail_${Date.now()}`,
          session_id: targetSession.sessionId,
          user_id: sessionUserId,
          sender_phone: cleanRecipient,
          sender_name: options?.isBroadcast ? `Broadcast (${cleanRecipient})` : `Tujuan (${cleanRecipient})`,
          message_body: text,
          direction: 'outgoing',
          status: 'Gagal',
          error_detail: errMsg || 'Gagal mengirim pesan WhatsApp'
        });
      }
      throw firstErr;
    }

    console.warn(`[Baileys Outgoing Reconnect] Socket terputus (${errMsg}), mencoba ulang sekali setelah 600ms...`);
    await delay(600);
    const refreshed = activeSessions.get(targetSession.sessionId);
    if (!refreshed || !refreshed.socket || refreshed.status !== 'connected' || !isSocketTrulyOpen(refreshed.socket)) {
      if (!options?.skipLog) {
        addMessageLog({
          wam_id: `baileys_fail_${Date.now()}`,
          session_id: targetSession.sessionId,
          user_id: sessionUserId,
          sender_phone: cleanRecipient,
          sender_name: options?.isBroadcast ? `Broadcast (${cleanRecipient})` : `Tujuan (${cleanRecipient})`,
          message_body: text,
          direction: 'outgoing',
          status: 'Gagal',
          error_detail: errMsg || 'Koneksi terputus saat mengirim pesan'
        });
      }
      throw firstErr;
    }
    targetSession = refreshed;
    try {
      result = await sendSocketMessageWithAckGuard(
        targetSession.socket,
        jid,
        { text },
        { timeoutMs: 24000, sessionData: targetSession }
      );
    } catch (retryErr: any) {
      if (!options?.skipLog) {
        addMessageLog({
          wam_id: `baileys_fail_${Date.now()}`,
          session_id: targetSession.sessionId,
          user_id: sessionUserId,
          sender_phone: cleanRecipient,
          sender_name: options?.isBroadcast ? `Broadcast (${cleanRecipient})` : `Tujuan (${cleanRecipient})`,
          message_body: text,
          direction: 'outgoing',
          status: 'Gagal',
          error_detail: retryErr?.message || 'Gagal mengirim pesan setelah percobaan ulang'
        });
      }
      throw retryErr;
    }
  }

  if (!options?.skipLog) {
    addMessageLog({
      wam_id: result?.key?.id || `baileys_${Date.now()}`,
      session_id: targetSession.sessionId,
      user_id: sessionUserId,
      sender_phone: cleanRecipient,
      sender_name: options?.isBroadcast ? `Broadcast (${cleanRecipient})` : `Tujuan (${cleanRecipient})`,
      message_body: text,
      direction: 'outgoing',
      status: 'Sukses',
      reply_body: options?.isBroadcast ? 'Dikirim via Broadcast Massal' : text
    });
  }

  targetSession.lastOutgoingAt = Date.now();
  recordSessionSendVerified(targetSession.sessionId, targetSession.phoneNumber || undefined);
  clearSessionConflictState(targetSession.sessionId);
  sessionDisconnectDiagnostics.delete(targetSession.sessionId);

  if (!options?.skipQuota && sessionUserId) {
    deductUserDailyQuota(sessionUserId);
  }

  return {
    success: true,
    wam_id: result?.key?.id,
    to: cleanRecipient,
    session_id: targetSession.sessionId,
    raw: result
  };
}

// =========================================================================
// SUPERADMIN WHATSAPP DIRECT DISPATCH + PERSISTENT SLOW QUEUE DRAIN
// =========================================================================
let isDrainingSuperadminQueue = false;

function resolveConnectedSuperadminSession(): SessionState | null {
  const isAdminSession = (s: SessionState) => {
    if (s.status !== 'connected' || !s.socket || !isSocketTrulyOpen(s.socket)) return false;
    const ownerId = s.userId || getSessionById(s.sessionId)?.user_id;
    const owner = ownerId ? getUserById(ownerId) : null;
    return Boolean(owner && owner.role === 'admin' && owner.is_active);
  };

  const candidates = Array.from(activeSessions.values()).filter(isAdminSession);
  if (candidates.length === 0) return null;
  return candidates.find(s => s.is_primary) || candidates[0];
}

async function sendDirectlyViaSuperadminSocket(
  saSession: SessionState,
  recipientPhone: string,
  text: string
): Promise<string | undefined> {
  const cleanRecipient = normalizePhoneNumber(recipientPhone);
  if (!cleanRecipient || cleanRecipient.length < 8) {
    throw new Error(`Nomor WhatsApp tujuan tidak valid (${recipientPhone}).`);
  }
  const jid = `${cleanRecipient}@s.whatsapp.net`;
  recordBotOutgoing(text);

  if (typeof saSession.socket?.sendPresenceUpdate === 'function') {
    void Promise.race([Promise.resolve().then(() => saSession.socket.sendPresenceUpdate('composing', jid)), delay(800)]).catch(() => {});
  }

  const result: any = await sendSocketMessageWithAckGuard(
    saSession.socket,
    jid,
    { text },
    { timeoutMs: 24000, sessionData: saSession }
  );
  return result?.key?.id;
}

export async function sendOrQueueViaSuperadminWa(params: {
  recipientPhone: string;
  message: string;
  category: 'order_notification' | 'password_reset' | 'system_otp' | 'session_expired' | 'cluster_alert';
  ownerUserId?: string;
  invoiceNumber?: string;
}): Promise<{
  sent: boolean;
  queued: boolean;
  queueId?: string;
  sessionId?: string;
  error?: string;
}> {
  const cleanRecipient = normalizePhoneNumber(params.recipientPhone);
  if (!cleanRecipient || cleanRecipient.length < 8) {
    return {
      sent: false,
      queued: false,
      error: `Nomor WhatsApp tujuan tidak valid (${params.recipientPhone || '-'}).`
    };
  }

  let saSession = resolveConnectedSuperadminSession();

  // If a superadmin session is currently mid-handshake/reconnecting, wait up to 3s once
  if (!saSession) {
    const adminConnecting = Array.from(activeSessions.values()).find(s => {
      if (s.status !== 'connecting') return false;
      const ownerId = s.userId || getSessionById(s.sessionId)?.user_id;
      const owner = ownerId ? getUserById(ownerId) : null;
      return Boolean(owner && owner.role === 'admin' && owner.is_active);
    });
    if (adminConnecting) {
      let tries = 0;
      while (tries < 6 && adminConnecting.status === 'connecting') {
        await delay(500);
        tries++;
      }
      saSession = resolveConnectedSuperadminSession();
    }
  }

  if (saSession) {
    try {
      await sendDirectlyViaSuperadminSocket(saSession, cleanRecipient, params.message);
      console.log(
        `[Superadmin WA Direct] (${params.category}) Sent to ${cleanRecipient} via ${saSession.sessionId}`
      );
      if (params.category === 'order_notification' && params.ownerUserId) {
        addMessageLog({
          wam_id: `sa_ord_${Date.now()}`,
          session_id: saSession.sessionId,
          user_id: params.ownerUserId,
          sender_phone: cleanRecipient,
          sender_name: `Owner Usaha (${cleanRecipient})`,
          message_body: `[Notifikasi Order ${params.invoiceNumber || ''}] Dikirim oleh Superadmin WA`.trim(),
          direction: 'outgoing',
          status: 'Sukses',
          reply_body: params.message.slice(0, 1200)
        });
      }
      return { sent: true, queued: false, sessionId: saSession.sessionId };
    } catch (err: any) {
      console.warn(
        `[Superadmin WA Queue Fallback] Gagal kirim langsung (${params.category}) ke ${cleanRecipient}: ${err?.message}. Memasukkan ke antrean...`
      );
      const queuedEntry = enqueueSuperadminWaMessage({
        recipient_phone: cleanRecipient,
        message: params.message,
        category: params.category,
        owner_user_id: params.ownerUserId,
        invoice_number: params.invoiceNumber,
        last_error: err?.message || 'Gagal kirim langsung'
      });
      return { sent: false, queued: true, queueId: queuedEntry.id, error: err?.message };
    }
  }

  const queuedEntry = enqueueSuperadminWaMessage({
    recipient_phone: cleanRecipient,
    message: params.message,
    category: params.category,
    owner_user_id: params.ownerUserId,
    invoice_number: params.invoiceNumber,
    last_error: 'WhatsApp Superadmin belum terhubung'
  });
  console.log(
    `[Superadmin WA Queued] (${params.category}) Ditambahkan ke antrean untuk ${cleanRecipient} (ID: ${queuedEntry.id})`
  );
  return { sent: false, queued: true, queueId: queuedEntry.id };
}

export async function drainSuperadminWaQueue(
  reason = 'manual'
): Promise<{ processed: number; sent: number; failed: number; remaining: number }> {
  if (isDrainingSuperadminQueue) {
    return { processed: 0, sent: 0, failed: 0, remaining: getSuperadminWaQueue().length };
  }

  const initialQueue = getSuperadminWaQueue();
  if (initialQueue.length === 0) {
    return { processed: 0, sent: 0, failed: 0, remaining: 0 };
  }

  if (!resolveConnectedSuperadminSession()) {
    return { processed: 0, sent: 0, failed: 0, remaining: initialQueue.length };
  }

  isDrainingSuperadminQueue = true;
  let processed = 0;
  let sent = 0;
  let failed = 0;

  try {
    console.log(
      `[Superadmin WA Queue Drain:${reason}] Memproses ${initialQueue.length} pesan antrean secara perlahan (anti-ban)...`
    );

    for (let i = 0; i < initialQueue.length; i++) {
      const item = initialQueue[i];
      const liveSa = resolveConnectedSuperadminSession();
      if (!liveSa) {
        console.warn('[Superadmin WA Queue Drain] Koneksi WA Superadmin terputus saat menguras antrean; sisa pesan ditahan.');
        break;
      }

      processed++;
      try {
        if (item.category === 'session_expired' && item.owner_user_id) {
          const sidFromInvoice = item.invoice_number?.startsWith(`exp_${item.owner_user_id}_`)
            ? item.invoice_number.slice(`exp_${item.owner_user_id}_`.length)
            : '';
          const stateCheck = verifyExpiredAlertState({
            userId: item.owner_user_id,
            sessionId: sidFromInvoice,
            expiredPhone: sidFromInvoice
          });
          if (stateCheck === 'recovered') {
            removeSuperadminWaQueueItem(item.id);
            continue;
          }
          if (stateCheck === 'wait') {
            continue;
          }
        }

        await sendDirectlyViaSuperadminSocket(liveSa, item.recipient_phone, item.message);
        removeSuperadminWaQueueItem(item.id);
        sent++;
        console.log(
          `[Superadmin WA Queue Drain] Terkirim (${i + 1}/${initialQueue.length}) -> ${item.recipient_phone} [${item.category}]`
        );

        if (item.category === 'order_notification' && item.owner_user_id) {
          addMessageLog({
            wam_id: `sa_qord_${Date.now()}`,
            session_id: liveSa.sessionId,
            user_id: item.owner_user_id,
            sender_phone: item.recipient_phone,
            sender_name: `Owner Usaha (${item.recipient_phone})`,
            message_body: `[Notifikasi Order Antrean ${item.invoice_number || ''}] Dikirim oleh Superadmin WA`.trim(),
            direction: 'outgoing',
            status: 'Sukses',
            reply_body: item.message.slice(0, 1200)
          });
        }
      } catch (sendErr: any) {
        failed++;
        const nextAttempts = (item.attempts || 0) + 1;
        if (nextAttempts >= 8) {
          console.warn(
            `[Superadmin WA Queue Drain] Menghapus item antrean ${item.id} setelah ${nextAttempts}x gagal (${sendErr?.message}).`
          );
          removeSuperadminWaQueueItem(item.id);
        } else {
          updateSuperadminWaQueueItem(item.id, {
            attempts: nextAttempts,
            last_error: sendErr?.message || 'Gagal kirim dari antrean'
          });
        }
      }

      // Slow randomized delay (3.5s - 6s) between queued dispatches so Meta won't flag spam
      if (i < initialQueue.length - 1) {
        const slowPaceMs = 3500 + crypto.randomInt(0, 2500);
        await delay(slowPaceMs);
      }
    }
  } finally {
    isDrainingSuperadminQueue = false;
  }

  return {
    processed,
    sent,
    failed,
    remaining: getSuperadminWaQueue().length
  };
}

// =========================================================================
// MULTI-HOST APP_ID CLUSTER ORCHESTRATION, CAPACITY GUARD & CHAIN DELEGATION
// =========================================================================

const lastClusterErrorAlertAt = new Map<string, number>();
const CLUSTER_ERROR_ALERT_COOLDOWN_MS = 15 * 60 * 1000;

export function isMultiNodeOrchestrationEnabled(sysConfig?: SystemConfig): boolean {
  const nodes = getAppNodesConfig(sysConfig);
  return nodes.length > 0 || isAppIdEnvConfigured();
}

export function countLocalOccupiedConnections(excludeSessionId?: string): number {
  const occupiedKeys = new Set<string>();
  const now = Date.now();
  for (const [sid, mem] of activeSessions.entries()) {
    if (excludeSessionId && sid === excludeSessionId) continue;
    if (mem.superseded) continue;
    const isConn = mem.status === 'connected' && (!mem.socket || isSocketTrulyOpen(mem.socket));
    const isConnecting = mem.status === 'connecting' && now - mem.lastUpdated < 120_000;
    if (isConn || isConnecting) {
      occupiedKeys.add(sid);
    }
  }
  for (const sid of sessionStartLocks.keys()) {
    if (excludeSessionId && sid === excludeSessionId) continue;
    occupiedKeys.add(sid);
  }
  const currentAppId = getCurrentAppId();
  for (const s of getWhatsAppSessions()) {
    if (!s?.id || (excludeSessionId && s.id === excludeSessionId)) continue;
    if (s.expires_at && Date.parse(s.expires_at) < now) continue;
    const assignedApp = normalizeAppId(s.assigned_app_id);
    const connectedApp = normalizeAppId(s.connected_app_id);
    if (assignedApp !== currentAppId && connectedApp !== currentAppId) continue;
    const buildingAt = s.last_assignment_at ? Date.parse(s.last_assignment_at) : 0;
    const isFreshBuilding =
      s.assignment_status === 'building' && (!buildingAt || now - buildingAt < 120_000);
    const isConnectedOwned =
      s.assignment_status === 'connected' ||
      (s.status === 'connected' && s.assignment_status !== 'error' && s.assignment_status !== 'delegated');
    if (isConnectedOwned || isFreshBuilding) {
      occupiedKeys.add(s.id);
    }
  }
  return occupiedKeys.size;
}

export function getCurrentNodeMaxConnections(
  sysConfig?: SystemConfig,
  dbNodesFromMysql?: AppNodeRuntimeStatus[]
): number {
  const cfg = sysConfig || getSystemConfig();
  const configuredNodes = getAppNodesConfig(cfg);
  const currentAppId = getCurrentAppId();
  if (configuredNodes.length > 0) {
    const match = configuredNodes.find(n => n.app_id === currentAppId);
    if (!match) return 0;
    return match.is_active === false ? 0 : Math.max(1, match.max_connections);
  }
  if (Array.isArray(dbNodesFromMysql) && dbNodesFromMysql.length > 0) {
    const match = dbNodesFromMysql.find(n => n.app_id === currentAppId);
    if (match) {
      return match.is_active === false ? 0 : Math.max(1, match.max_connections);
    }
  }
  return getMaxGlobalSessions(cfg);
}

export function resolveEffectiveAssignedAppId(
  session?: Pick<WhatsAppSession, 'id' | 'user_id' | 'assigned_app_id' | 'assignment_status'> | null,
  owner?: UserAccount | null
): string {
  if (session?.assignment_status === 'released') {
    return '';
  }
  const sessionApp = normalizeAppId(session?.assigned_app_id);
  if (sessionApp) return sessionApp;
  const resolvedOwner = owner ?? (session?.user_id ? getUserById(session.user_id) : undefined);
  return normalizeAppId(resolvedOwner?.assigned_app_id);
}

export function isSessionOwnedByCurrentAppNode(
  session: Pick<WhatsAppSession, 'id' | 'user_id' | 'assigned_app_id' | 'assigned_server_ip' | 'assignment_status'>,
  sysConfig?: SystemConfig,
  owner?: UserAccount | null
): boolean {
  if (isSelfKilledByIpRule) return false;
  if (session?.assignment_status === 'released') return false;

  const effectiveApp = resolveEffectiveAssignedAppId(session, owner);
  if (effectiveApp) {
    return effectiveApp === getCurrentAppId();
  }

  if (!isMultiNodeOrchestrationEnabled(sysConfig)) return true;
  return true;
}

function buildEffectiveClusterNodes(params: {
  sysConfig?: SystemConfig;
  dbNodesFromMysql?: AppNodeRuntimeStatus[];
  sessions: WhatsAppSession[];
  leases: Record<string, WaSessionRuntimeLease>;
}): AppNodeRuntimeStatus[] {
  const cfg = params.sysConfig || getSystemConfig();
  const configured = getAppNodesConfig(cfg);
  const currentAppId = getCurrentAppId();
  const mysqlMap = new Map<string, AppNodeRuntimeStatus>(
    (params.dbNodesFromMysql || []).map(n => [normalizeAppId(n.app_id), n])
  );
  const nodeMap = new Map<string, AppNodeRuntimeStatus>();
  const localConnectedCount = Array.from(activeSessions.values()).filter(
    s => !s.superseded && s.status === 'connected' && (!s.socket || isSocketTrulyOpen(s.socket))
  ).length;
  const localConnectingCount = Array.from(activeSessions.values()).filter(
    s => !s.superseded && s.status === 'connecting' && Date.now() - s.lastUpdated < 120_000
  ).length;

  for (const cfgNode of configured) {
    const rt = mysqlMap.get(cfgNode.app_id);
    const isSelf = cfgNode.app_id === currentAppId;
    nodeMap.set(cfgNode.app_id, {
      app_id: cfgNode.app_id,
      name: cfgNode.name || rt?.name,
      max_connections: Math.max(1, cfgNode.max_connections),
      is_active: cfgNode.is_active !== false,
      active_connections: isSelf ? countLocalOccupiedConnections() : (rt?.active_connections || 0),
      connecting_connections: isSelf ? localConnectingCount : (rt?.connecting_connections || 0),
      hostname: isSelf ? RUNTIME_HOSTNAME : rt?.hostname,
      domain: isSelf ? getCachedOrFallbackIdentity().domain : rt?.domain,
      server_ip: isSelf ? getCachedOrFallbackIdentity().serverIp : rt?.server_ip,
      last_heartbeat_at: isSelf ? new Date().toISOString() : rt?.last_heartbeat_at,
      updated_at: cfgNode.updated_at || rt?.updated_at,
      online: isSelf ? true : Boolean(rt?.online)
    });
  }

  for (const rt of params.dbNodesFromMysql || []) {
    const id = normalizeAppId(rt.app_id);
    if (!id || nodeMap.has(id)) continue;
    // If configured nodes exist, preserve dbNodes only as runtime entries when configured list is empty
    if (configured.length === 0) {
      const isSelf = id === currentAppId;
      nodeMap.set(id, {
        ...rt,
        app_id: id,
        active_connections: isSelf ? countLocalOccupiedConnections() : rt.active_connections,
        connecting_connections: isSelf ? localConnectingCount : rt.connecting_connections,
        online: isSelf ? true : rt.online
      });
    }
  }

  if (nodeMap.size === 0 && isAppIdEnvConfigured()) {
    nodeMap.set(currentAppId, {
      app_id: currentAppId,
      name: `Server ${currentAppId}`,
      max_connections: getMaxGlobalSessions(cfg),
      is_active: true,
      active_connections: countLocalOccupiedConnections(),
      connecting_connections: localConnectingCount,
      hostname: RUNTIME_HOSTNAME,
      domain: getCachedOrFallbackIdentity().domain,
      server_ip: getCachedOrFallbackIdentity().serverIp,
      last_heartbeat_at: new Date().toISOString(),
      online: true
    });
  }

  // Reconcile occupancy using live leases and DB connected_app_id so newly assigned/delegated tasks count toward target capacity
  const activeLeasesByApp = new Map<string, Set<string>>();
  const now = Date.now();
  for (const lease of Object.values(params.leases || {})) {
    const lid = normalizeAppId(lease?.app_id);
    if (!lid || !lease?.session_id) continue;
    if (now - (Number(lease.heartbeat_at) || 0) > REMOTE_LEASE_FRESH_MS) continue;
    if (!activeLeasesByApp.has(lid)) activeLeasesByApp.set(lid, new Set());
    activeLeasesByApp.get(lid)!.add(lease.session_id);
  }

  const assignedPendingByApp = new Map<string, Set<string>>();
  for (const s of params.sessions || []) {
    if (!s?.id) continue;
    const targetApp = normalizeAppId(s.assigned_app_id);
    const connApp = normalizeAppId(s.connected_app_id);
    if (connApp && s.status === 'connected') {
      if (!activeLeasesByApp.has(connApp)) activeLeasesByApp.set(connApp, new Set());
      activeLeasesByApp.get(connApp)!.add(s.id);
    }
    if (
      targetApp &&
      (s.assignment_status === 'delegated' || s.assignment_status === 'pending' || s.assignment_status === 'building')
    ) {
      if (!assignedPendingByApp.has(targetApp)) assignedPendingByApp.set(targetApp, new Set());
      assignedPendingByApp.get(targetApp)!.add(s.id);
    }
  }

  for (const node of nodeMap.values()) {
    const isSelf = node.app_id === currentAppId;
    const leaseCount = activeLeasesByApp.get(node.app_id)?.size || 0;
    const pendingCount = assignedPendingByApp.get(node.app_id)?.size || 0;
    if (isSelf) {
      node.active_connections = Math.max(localConnectedCount + localConnectingCount, countLocalOccupiedConnections());
    } else {
      node.active_connections = Math.max(node.active_connections || 0, leaseCount) + pendingCount;
    }
  }

  return Array.from(nodeMap.values());
}

export function selectEligibleDelegationTarget(
  nodes: AppNodeRuntimeStatus[],
  excludedAppIds: Set<string>,
  options?: { preferEmptyFirst?: boolean }
): AppNodeRuntimeStatus | null {
  const candidates = nodes.filter(n => {
    const appId = normalizeAppId(n.app_id);
    if (!appId) return false;
    if (n.is_active === false) return false;
    if (excludedAppIds.has(appId)) return false;
    return (n.active_connections || 0) < Math.max(1, n.max_connections || 1);
  });
  if (candidates.length === 0) return null;

  const preferEmpty = options?.preferEmptyFirst !== false;
  candidates.sort((a, b) => {
    // 1. Prefer nodes with live online heartbeat first
    const onlineA = a.online ? 0 : 1;
    const onlineB = b.online ? 0 : 1;
    if (onlineA !== onlineB) return onlineA - onlineB;
    // 2. Prefer empty nodes (0 active WA connections) first
    if (preferEmpty) {
      const emptyA = (a.active_connections || 0) === 0 ? 0 : 1;
      const emptyB = (b.active_connections || 0) === 0 ? 0 : 1;
      if (emptyA !== emptyB) return emptyA - emptyB;
    }
    // 3. Lowest utilization ratio, then lowest active connections
    const ratioA = (a.active_connections || 0) / Math.max(1, a.max_connections || 1);
    const ratioB = (b.active_connections || 0) / Math.max(1, b.max_connections || 1);
    if (ratioA !== ratioB) return ratioA - ratioB;
    return (a.active_connections || 0) - (b.active_connections || 0);
  });
  return candidates[0];
}

async function releaseLocalSocketForDelegation(sessionId: string): Promise<void> {
  if (!sessionId) return;
  clearSessionTimers(sessionId);
  const mem = activeSessions.get(sessionId);
  if (mem) {
    mem.superseded = true;
    mem.closedByApp = true;
    if (mem.socket) {
      await closeSocketAndWait(mem.socket, mem, sessionId, 1600).catch(() => {});
    }
    mem.detachRawHandlers?.();
    clearMetaAiSession(sessionId);
    if (activeSessions.get(sessionId) === mem) {
      activeSessions.delete(sessionId);
    }
  }
  removeLocalRuntimeLease(sessionId, RUNTIME_INSTANCE_ID);
  lastLeaseRefreshAt.delete(sessionId);
  deleteWaSessionLeaseFromMysql({
    sessionId,
    expectedInstanceId: RUNTIME_INSTANCE_ID
  }).catch(() => {});
  void publishCurrentSocketRecord({ force: true }).catch(() => {});
}

export async function delegateSessionToNextNodeOrError(
  session: WhatsAppSession,
  reason: string,
  opts: {
    markCurrentFailed: boolean;
    dbNodes?: AppNodeRuntimeStatus[];
    leases?: Record<string, WaSessionRuntimeLease>;
  }
): Promise<{ delegatedTo: string | null; exhausted: boolean; errorMessage?: string }> {
  const sysConfig = getSystemConfig();
  const currentAppId = getCurrentAppId();
  const allSessions = getWhatsAppSessions();
  const nodes = buildEffectiveClusterNodes({
    sysConfig,
    dbNodesFromMysql: opts.dbNodes,
    sessions: allSessions,
    leases: opts.leases || {}
  });

  const prevFailed = Array.isArray(session.failed_app_ids)
    ? session.failed_app_ids.map(normalizeAppIdValue).filter(Boolean)
    : [];
  const nextFailedIds = opts.markCurrentFailed
    ? Array.from(new Set([...prevFailed, currentAppId]))
    : prevFailed;

  const excluded = new Set<string>([...prevFailed, ...nextFailedIds, currentAppId]);
  const target = selectEligibleDelegationTarget(nodes, excluded);
  const nowIso = new Date().toISOString();

  await releaseLocalSocketForDelegation(session.id).catch(() => {});

  if (target) {
    const cleanReason = String(reason || `Dialihkan dari ${currentAppId}`).slice(0, 500);
    updateSession(session.id, {
      assigned_app_id: target.app_id,
      connected_app_id: '',
      failed_app_ids: nextFailedIds,
      assignment_status: 'delegated',
      assignment_error: cleanReason,
      last_assignment_at: nowIso
    });
    await updateSessionAssignmentInMysql(session.id, {
      assigned_app_id: target.app_id,
      connected_app_id: '',
      failed_app_ids: nextFailedIds,
      assignment_status: 'delegated',
      assignment_error: cleanReason,
      last_assignment_at: nowIso
    });
    console.log(
      `[Cluster Orchestration] Sesi ${session.id} (+${session.phone_number || '-'}) didelegasikan: ${currentAppId} -> ${target.app_id} (${cleanReason})`
    );
    return { delegatedTo: target.app_id, exhausted: false };
  }

  const finalError = `${reason || 'Gagal membangun koneksi'} (Semua server penuh atau gagal: ${Array.from(excluded).join(', ')})`;
  updateSession(session.id, {
    assigned_app_id: '',
    connected_app_id: '',
    failed_app_ids: nextFailedIds,
    assignment_status: 'error',
    assignment_error: finalError.slice(0, 800),
    last_assignment_at: nowIso,
    status: 'disconnected'
  });
  await updateSessionAssignmentInMysql(session.id, {
    assigned_app_id: '',
    connected_app_id: '',
    failed_app_ids: nextFailedIds,
    assignment_status: 'error',
    assignment_error: finalError.slice(0, 800),
    last_assignment_at: nowIso,
    status: 'disconnected'
  });

  console.error(
    `[Cluster Orchestration] ERROR: Sesi ${session.id} (+${session.phone_number || '-'}) gagal di semua server (${Array.from(excluded).join(', ')}).`
  );

  const notifyPhone = resolveClusterNotifyPhone(sysConfig);
  const lastAlertAt = lastClusterErrorAlertAt.get(session.id) || 0;
  if (Date.now() - lastAlertAt >= CLUSTER_ERROR_ALERT_COOLDOWN_MS) {
    lastClusterErrorAlertAt.set(session.id, Date.now());
    const owner = session.user_id ? getUserById(session.user_id) : null;
    if (notifyPhone) {
      const alertText =
        `🚨 *PERINGATAN CLUSTER GATEWAY*\n\n` +
        `Sesi WhatsApp gagal dihubungkan pada seluruh server yang tersedia.\n` +
        `• Nomor WA: +${session.phone_number || '-'}\n` +
        `• Sesi: ${session.session_name || session.id}\n` +
        `• Pemilik: ${owner ? `${owner.name} (@${owner.username})` : (session.user_id || '-')}\n` +
        `• Server Dicoba: ${Array.from(excluded).join(', ')}\n` +
        `• Keterangan: ${reason || 'Gagal membangun socket Baileys / kapasitas penuh'}\n\n` +
        `Silakan periksa menu *Server & Monitor Koneksi* di Superadmin.`;
      await sendOrQueueViaSuperadminWa({
        recipientPhone: notifyPhone,
        message: alertText,
        category: 'cluster_alert',
        ownerUserId: session.user_id,
        invoiceNumber: `cl_${session.id}`
      }).catch(() => {});
    }
    void sendTelegramAlert({
      title: 'Koneksi WA Gagal di Semua Node Cluster',
      severity: 'critical',
      dedupKey: `cluster_exhausted_${session.id}`,
      cooldownMs: CLUSTER_ERROR_ALERT_COOLDOWN_MS,
      lines: [
        `• Nomor WA: <code>+${escapeTelegramHtml(session.phone_number || '-')}</code>`,
        `• Sesi: ${escapeTelegramHtml(session.session_name || session.id)}`,
        `• Pemilik: ${escapeTelegramHtml(owner ? `${owner.name} (@${owner.username})` : (session.user_id || '-'))}`,
        `• Node Dicoba: <code>${escapeTelegramHtml(Array.from(excluded).join(', ') || '-')}</code>`,
        `• Penyebab: ${escapeTelegramHtml(reason || 'Gagal membangun socket Baileys / kapasitas penuh')}`
      ]
    }).catch(() => {});
  }

  return { delegatedTo: null, exhausted: true, errorMessage: finalError };
}

export async function prepareNodeAssignmentForNewConnection(
  sessionId: string,
  userId?: string,
  phoneNumber?: string
): Promise<{
  proceedLocally: boolean;
  assignedAppId?: string;
  delegatedTo?: string;
  error?: string;
}> {
  const sysConfig = getSystemConfig();
  const currentAppId = getCurrentAppId();
  const existingBeforeSync = getSessionById(sessionId);
  const ownerBeforeSync = userId ? getUserById(userId) : (existingBeforeSync?.user_id ? getUserById(existingBeforeSync.user_id) : undefined);

  let dbNodes: AppNodeRuntimeStatus[] = [];
  let leases: Record<string, WaSessionRuntimeLease> = {};
  if (isMysqlConfigured() && (isMultiNodeOrchestrationEnabled(sysConfig) || Boolean(resolveEffectiveAssignedAppId(existingBeforeSync, ownerBeforeSync)))) {
    const snap = await fetchLiveClusterSnapshotFromMysql().catch(() => null);
    if (snap) {
      applyLiveClusterSnapshotToDb(snap);
      dbNodes = snap.nodes || [];
      leases = snap.leases || {};
    }
  }

  const existingAfterSync = getSessionById(sessionId);
  const ownerAfterSync = userId ? getUserById(userId) : (existingAfterSync?.user_id ? getUserById(existingAfterSync.user_id) : undefined);
  const effectiveTargetApp = resolveEffectiveAssignedAppId(existingAfterSync, ownerAfterSync);

  // Aturan Cluster Tunggal: Jika akun / sesi ditugaskan ke APP_ID tertentu, hanya APP_ID itu yang boleh mengeksekusi
  if (effectiveTargetApp && effectiveTargetApp !== currentAppId) {
    await releaseLocalSocketForDelegation(sessionId).catch(() => {});
    const nowIso = new Date().toISOString();
    if (existingAfterSync) {
      updateSession(existingAfterSync.id, {
        assigned_app_id: effectiveTargetApp,
        assigned_server_ip: undefined,
        connected_app_id: '',
        connected_server_ip: undefined,
        assignment_status: 'pending',
        assignment_error: `Akun/sesi ini ditetapkan ke APP_ID ${effectiveTargetApp}`,
        last_assignment_at: nowIso
      });
      await updateSessionAssignmentInMysql(existingAfterSync.id, {
        assigned_app_id: effectiveTargetApp,
        assigned_server_ip: '',
        connected_app_id: '',
        connected_server_ip: '',
        assignment_status: 'pending',
        assignment_error: `Akun/sesi ini ditetapkan ke APP_ID ${effectiveTargetApp}`,
        last_assignment_at: nowIso
      }).catch(() => {});
    } else if (userId) {
      const cleanPhone = phoneNumber ? normalizePhoneNumber(phoneNumber) : '';
      addSession({
        id: sessionId,
        session_name: cleanPhone ? `WA - ${cleanPhone}` : 'WA Device',
        phone_number: cleanPhone,
        auth_method: 'pairing_code',
        status: 'disconnected',
        is_primary: false,
        user_id: userId,
        assigned_app_id: effectiveTargetApp,
        failed_app_ids: [],
        assignment_status: 'pending',
        assignment_error: `Akun/sesi ini ditetapkan ke APP_ID ${effectiveTargetApp}`,
        last_assignment_at: nowIso
      });
      await updateSessionAssignmentInMysql(sessionId, {
        assigned_app_id: effectiveTargetApp,
        assigned_server_ip: '',
        connected_app_id: '',
        connected_server_ip: '',
        failed_app_ids: [],
        assignment_status: 'pending',
        assignment_error: `Akun/sesi ini ditetapkan ke APP_ID ${effectiveTargetApp}`,
        last_assignment_at: nowIso
      }).catch(() => {});
    }
    return {
      proceedLocally: false,
      assignedAppId: effectiveTargetApp,
      delegatedTo: effectiveTargetApp,
      error: `Koneksi WA akun ini ditetapkan berjalan di APP_ID "${effectiveTargetApp}" (bukan "${currentAppId}"). Tugas koneksi dialihkan ke "${effectiveTargetApp}".`
    };
  }

  if (!isMultiNodeOrchestrationEnabled(sysConfig)) {
    const fallbackApp = effectiveTargetApp || currentAppId;
    return { proceedLocally: true, assignedAppId: fallbackApp };
  }

  const maxConn = getCurrentNodeMaxConnections(sysConfig, dbNodes);
  const occupied = countLocalOccupiedConnections(sessionId);

  if (maxConn > 0 && occupied < maxConn) {
    const existing = existingAfterSync || getSessionById(sessionId);
    const nowIso = new Date().toISOString();
    if (existing) {
      updateSession(existing.id, {
        assigned_app_id: currentAppId,
        assigned_server_ip: undefined,
        failed_app_ids: [],
        assignment_status: 'building',
        assignment_error: '',
        last_assignment_at: nowIso
      });
      void updateSessionAssignmentInMysql(existing.id, {
        assigned_app_id: currentAppId,
        assigned_server_ip: '',
        failed_app_ids: [],
        assignment_status: 'building',
        assignment_error: '',
        last_assignment_at: nowIso
      }).catch(() => {});
    }
    return { proceedLocally: true, assignedAppId: currentAppId };
  }

  // Current node is full or disabled -> delegate task to another active node with spare capacity
  const nodes = buildEffectiveClusterNodes({
    sysConfig,
    dbNodesFromMysql: dbNodes,
    sessions: getWhatsAppSessions(),
    leases
  });
  const target = selectEligibleDelegationTarget(nodes, new Set([currentAppId]));
  if (target) {
    const nowIso = new Date().toISOString();
    const existing = getSessionById(sessionId);
    if (existing) {
      updateSession(existing.id, {
        assigned_app_id: target.app_id,
        connected_app_id: '',
        failed_app_ids: [],
        assignment_status: 'delegated',
        assignment_error: `Kapasitas server ${currentAppId} penuh (${occupied}/${maxConn}), dialihkan ke ${target.app_id}`,
        last_assignment_at: nowIso
      });
    } else if (userId && phoneNumber) {
      addSession({
        id: sessionId,
        session_name: `WA Pair - ${normalizePhoneNumber(phoneNumber)}`,
        phone_number: normalizePhoneNumber(phoneNumber),
        auth_method: 'pairing_code',
        status: 'disconnected',
        is_primary: false,
        user_id: userId,
        assigned_app_id: target.app_id,
        failed_app_ids: [],
        assignment_status: 'delegated',
        assignment_error: `Kapasitas server ${currentAppId} penuh (${occupied}/${maxConn}), dialihkan ke ${target.app_id}`,
        last_assignment_at: nowIso
      });
    }
    return {
      proceedLocally: false,
      assignedAppId: target.app_id,
      delegatedTo: target.app_id,
      error: `Kapasitas koneksi server ${currentAppId} penuh (${maxConn}). Koneksi dialihkan ke server ${target.app_id}.`
    };
  }

  return {
    proceedLocally: false,
    error: `Seluruh server koneksi saat ini penuh (batas server ${currentAppId}: ${maxConn} koneksi).`
  };
}

const INTER_APP_PING_INTERVAL_MS = 15_000;
const DEAD_NODE_STALE_MS = 90_000;
const MAX_OUTBOUND_WS_PEERS = 16;
const WS_PONG_TIMEOUT_MS = 40_000;

interface PeerPingState {
  appId: string;
  origin: string;
  peerConnections: number;
  lastOk: boolean;
  lastPingAt: string;
  lastSuccessAt?: string;
  consecutiveFailures: number;
  lastLatencyMs?: number;
  lastError?: string;
  transport?: 'ws' | 'http';
  wsState?: 'open' | 'connecting' | 'closed';
}

interface OutboundClusterWsEntry {
  appId: string;
  origin: string;
  wsUrl: string;
  ws: WebSocket | null;
  state: 'connecting' | 'open' | 'closed';
  lastPingSentAt: number;
  lastPongAt: number;
  lastPingSeq: number;
  nextReconnectAt: number;
  reconnectAttempts: number;
  lastError?: string;
  peerConnections: number;
}

interface InboundClusterWsEntry {
  key: string;
  ws: WebSocket;
  appId: string;
  instanceId: string;
  connectedAt: number;
  lastSeenAt: number;
  peerConnections: number;
}

const peerPingStates = new Map<string, PeerPingState>();
const clusterOutboundWsMap = new Map<string, OutboundClusterWsEntry>();
const clusterInboundWsMap = new Map<string, InboundClusterWsEntry>();
let clusterWsKeepaliveSeq = 0;
let lastKeepaliveRoundAt = '';
let lastInboundPingAt = '';
let lastInboundPingFrom = '';
let interAppKeepaliveInFlight = false;

export function verifyClusterPingOrWsToken(
  token: string,
  expectedTyp: 'cluster_ping' | 'cluster_ws' = 'cluster_ping'
): {
  ok: boolean;
  fromApp?: string;
  fromInstance?: string;
  error?: string;
} {
  const cleanToken = String(token || '').trim();
  if (!cleanToken) {
    return { ok: false, error: 'Token cluster tidak ditemukan.' };
  }
  const payloadRaw = verifySignedToken(cleanToken);
  if (!payloadRaw) {
    return { ok: false, error: 'Token cluster tidak valid.' };
  }
  try {
    const parsed = JSON.parse(payloadRaw);
    if (parsed?.typ !== expectedTyp) {
      return { ok: false, error: 'Tipe token cluster tidak valid.' };
    }
    const ts = Number(parsed?.ts || 0);
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 5 * 60_000) {
      return { ok: false, error: 'Token cluster kedaluwarsa.' };
    }
    const fromApp = typeof parsed.fromApp === 'string' ? parsed.fromApp.trim().slice(0, 64) : '';
    const fromInstance = typeof parsed.fromInstance === 'string' ? parsed.fromInstance.trim().slice(0, 64) : '';
    return { ok: true, fromApp, fromInstance };
  } catch {
    return { ok: false, error: 'Payload token cluster tidak valid.' };
  }
}

export function closeAllClusterMeshWebSockets(): void {
  for (const [, entry] of clusterOutboundWsMap.entries()) {
    try {
      entry.ws?.removeAllListeners?.();
      entry.ws?.terminate?.();
    } catch {
      // Ignore termination errors
    }
  }
  clusterOutboundWsMap.clear();

  for (const [, entry] of clusterInboundWsMap.entries()) {
    try {
      entry.ws?.removeAllListeners?.();
      entry.ws?.close?.(1001, 'shutdown');
    } catch {
      try {
        entry.ws?.terminate?.();
      } catch {
        // Ignore
      }
    }
  }
  clusterInboundWsMap.clear();
}

export function handleClusterWsConnection(
  ws: WebSocket,
  peerMeta: { fromApp?: string; fromInstance?: string }
): void {
  if (isSelfKilledByIpRule) {
    try {
      ws.close(1008, 'Node socket killed');
    } catch {}
    return;
  }

  const fromApp = String(peerMeta.fromApp || 'peer').trim().slice(0, 64) || 'peer';
  const fromInstance = String(peerMeta.fromInstance || 'unknown').trim().slice(0, 64) || 'unknown';
  const key = `${fromApp}::${fromInstance}`;
  const now = Date.now();

  const existing = clusterInboundWsMap.get(key);
  if (existing && existing.ws !== ws) {
    try {
      existing.ws.removeAllListeners?.();
      existing.ws.close(1000, 'replaced');
    } catch {}
  }

  const entry: InboundClusterWsEntry = {
    key,
    ws,
    appId: fromApp,
    instanceId: fromInstance,
    connectedAt: now,
    lastSeenAt: now,
    peerConnections: 0
  };
  clusterInboundWsMap.set(key, entry);
  lastInboundPingAt = new Date(now).toISOString();
  lastInboundPingFrom = fromApp;

  const sendSafe = (obj: Record<string, any>) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(obj));
    } catch {
      // Ignore send failures
    }
  };

  sendSafe({
    type: 'keepalive_welcome',
    app_id: getDisplayAppId(),
    instance_id: RUNTIME_INSTANCE_ID,
    active_connections: countLocalOccupiedConnections(),
    killed: isSelfKilledByIpRule,
    timestamp: lastInboundPingAt
  });

  ws.on('ping', () => {
    entry.lastSeenAt = Date.now();
    lastInboundPingAt = new Date(entry.lastSeenAt).toISOString();
    lastInboundPingFrom = entry.appId;
  });

  ws.on('pong', () => {
    entry.lastSeenAt = Date.now();
  });

  ws.on('message', (rawData: WebSocket.RawData) => {
    entry.lastSeenAt = Date.now();
    lastInboundPingAt = new Date(entry.lastSeenAt).toISOString();
    lastInboundPingFrom = entry.appId;
    const text = typeof rawData === 'string' ? rawData : rawData.toString('utf8');
    if (!text || text.length > 32 * 1024) return;
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== 'object') return;

    if (parsed.type === 'keepalive_ping') {
      const conns = Number(parsed.active_connections);
      if (Number.isFinite(conns) && conns >= 0) {
        entry.peerConnections = Math.floor(conns);
      }
      const res = handleIncomingClusterPing({
        fromApp: typeof parsed.from_app_id === 'string' ? parsed.from_app_id : entry.appId,
        fromInstance: typeof parsed.from_instance_id === 'string' ? parsed.from_instance_id : entry.instanceId,
        activeConnections: entry.peerConnections,
        triggerTick: Boolean(parsed.trigger_tick)
      });
      sendSafe({
        type: 'keepalive_pong',
        seq: parsed.seq,
        ...res
      });
    } else if (parsed.type === 'trigger_tick') {
      handleIncomingClusterPing({
        fromApp: entry.appId,
        fromInstance: entry.instanceId,
        triggerTick: true
      });
    }
  });

  ws.on('close', () => {
    if (clusterInboundWsMap.get(key) === entry) {
      clusterInboundWsMap.delete(key);
    }
  });

  ws.on('error', () => {
    if (clusterInboundWsMap.get(key) === entry) {
      clusterInboundWsMap.delete(key);
    }
  });
}

function toClusterWsUrl(origin: string): string {
  const u = new URL(origin);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  u.pathname = '/ws/cluster';
  u.search = '';
  u.hash = '';
  return u.toString();
}

function selectBoundedMeshPeers<T extends { appId: string; origin: string; peerConnections: number }>(
  sortedPeers: T[],
  currentAppId: string,
  maxPeers = MAX_OUTBOUND_WS_PEERS
): T[] {
  if (sortedPeers.length <= maxPeers) return sortedPeers;

  const picked = new Map<string, T>();
  const ringIds = Array.from(new Set([...sortedPeers.map(p => p.appId), currentAppId])).sort((a, b) =>
    a.localeCompare(b)
  );
  const myIdx = ringIds.indexOf(currentAppId);
  if (myIdx !== -1 && ringIds.length > 1) {
    const prevId = ringIds[(myIdx - 1 + ringIds.length) % ringIds.length];
    const nextId = ringIds[(myIdx + 1) % ringIds.length];
    for (const ringId of [prevId, nextId]) {
      const match = sortedPeers.find(p => p.appId === ringId);
      if (match) picked.set(match.appId, match);
    }
  }

  for (const peer of sortedPeers) {
    if (picked.size >= maxPeers) break;
    if (!picked.has(peer.appId)) {
      picked.set(peer.appId, peer);
    }
  }

  return Array.from(picked.values());
}

function ensureOutboundClusterWsPeer(peer: { appId: string; origin: string; peerConnections: number }): OutboundClusterWsEntry {
  const wsUrl = toClusterWsUrl(peer.origin);
  const existing = clusterOutboundWsMap.get(peer.appId);
  const now = Date.now();

  if (existing && existing.wsUrl !== wsUrl) {
    try {
      existing.ws?.removeAllListeners?.();
      existing.ws?.terminate?.();
    } catch {}
    clusterOutboundWsMap.delete(peer.appId);
  }

  const current = clusterOutboundWsMap.get(peer.appId);
  if (current) {
    current.peerConnections = peer.peerConnections;
    if (current.state === 'open' || current.state === 'connecting') {
      return current;
    }
    if (now < current.nextReconnectAt) {
      return current;
    }
  }

  const entry: OutboundClusterWsEntry = current || {
    appId: peer.appId,
    origin: peer.origin,
    wsUrl,
    ws: null,
    state: 'connecting',
    lastPingSentAt: 0,
    lastPongAt: 0,
    lastPingSeq: 0,
    nextReconnectAt: 0,
    reconnectAttempts: 0,
    peerConnections: peer.peerConnections
  };

  entry.origin = peer.origin;
  entry.wsUrl = wsUrl;
  entry.state = 'connecting';
  clusterOutboundWsMap.set(peer.appId, entry);

  const currentDisplayAppId = getDisplayAppId();
  const wsToken = signToken(
    JSON.stringify({
      typ: 'cluster_ws',
      fromApp: currentDisplayAppId,
      fromInstance: RUNTIME_INSTANCE_ID,
      ts: now
    })
  );

  let ws: WebSocket;
  try {
    ws = new WebSocket(wsUrl, {
      headers: {
        'X-Cluster-Ping-Token': wsToken
      },
      handshakeTimeout: 5000
    });
  } catch (err: any) {
    entry.state = 'closed';
    entry.reconnectAttempts += 1;
    entry.lastError = err?.message || 'WS init error';
    const backoff = 3000 * Math.min(16, 2 ** Math.min(4, entry.reconnectAttempts));
    entry.nextReconnectAt = Date.now() + backoff + crypto.randomInt(0, 1500);
    return entry;
  }

  entry.ws = ws;

  ws.on('open', () => {
    if (clusterOutboundWsMap.get(peer.appId) !== entry) return;
    entry.state = 'open';
    entry.reconnectAttempts = 0;
    entry.lastError = undefined;
    entry.lastPongAt = Date.now();

    const seq = ++clusterWsKeepaliveSeq;
    entry.lastPingSeq = seq;
    entry.lastPingSentAt = Date.now();
    try {
      ws.ping();
      ws.send(
        JSON.stringify({
          type: 'keepalive_ping',
          seq,
          from_app_id: getDisplayAppId(),
          from_instance_id: RUNTIME_INSTANCE_ID,
          active_connections: countLocalOccupiedConnections(),
          trigger_tick: false,
          ts: entry.lastPingSentAt
        })
      );
    } catch {
      // Ignore immediate send error
    }
  });

  ws.on('pong', () => {
    if (clusterOutboundWsMap.get(peer.appId) !== entry) return;
    entry.lastPongAt = Date.now();
  });

  ws.on('message', (rawData: WebSocket.RawData) => {
    if (clusterOutboundWsMap.get(peer.appId) !== entry) return;
    const text = typeof rawData === 'string' ? rawData : rawData.toString('utf8');
    if (!text || text.length > 32 * 1024) return;
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== 'object') return;
    if (parsed.type === 'keepalive_pong' || parsed.type === 'keepalive_welcome') {
      const rxAt = Date.now();
      entry.lastPongAt = rxAt;
      const nowIso = new Date(rxAt).toISOString();
      const killed = Boolean(parsed.killed);
      const latencyMs =
        parsed.type === 'keepalive_pong' && parsed.seq === entry.lastPingSeq && entry.lastPingSentAt > 0
          ? Math.max(0, rxAt - entry.lastPingSentAt)
          : undefined;
      if (Number.isFinite(Number(parsed.active_connections))) {
        entry.peerConnections = Math.max(0, Math.floor(Number(parsed.active_connections)));
      }
      const prev = peerPingStates.get(peer.appId);
      peerPingStates.set(peer.appId, {
        appId: peer.appId,
        origin: peer.origin,
        peerConnections: entry.peerConnections,
        lastOk: !killed,
        lastPingAt: nowIso,
        lastSuccessAt: !killed ? nowIso : prev?.lastSuccessAt,
        consecutiveFailures: killed ? (prev?.consecutiveFailures || 0) + 1 : 0,
        lastLatencyMs: latencyMs ?? prev?.lastLatencyMs,
        lastError: killed ? 'Socket killed' : undefined,
        transport: 'ws',
        wsState: 'open'
      });
      if (!killed && isMysqlConfigured()) {
        void clearDeadAppFailoverClaimInMysql(peer.appId).catch(() => {});
      }
    }
  });

  const handleWsClosed = (errMsg?: string) => {
    if (clusterOutboundWsMap.get(peer.appId) !== entry) return;
    if (entry.state === 'closed' && entry.ws !== ws) return;
    entry.state = 'closed';
    entry.ws = null;
    entry.reconnectAttempts += 1;
    if (errMsg) entry.lastError = errMsg.slice(0, 120);
    const backoff = 3000 * Math.min(16, 2 ** Math.min(4, entry.reconnectAttempts));
    entry.nextReconnectAt = Date.now() + backoff + crypto.randomInt(0, 1500);
    const prev = peerPingStates.get(peer.appId);
    if (prev) {
      peerPingStates.set(peer.appId, {
        ...prev,
        wsState: 'closed'
      });
    }
  };

  ws.on('close', () => handleWsClosed());
  ws.on('error', (err: Error) => handleWsClosed(err?.message || 'WS connection error'));

  return entry;
}

function sendClusterWsPingFrame(entry: OutboundClusterWsEntry, triggerTick = false): boolean {
  if (!entry.ws || entry.state !== 'open' || entry.ws.readyState !== WebSocket.OPEN) {
    return false;
  }
  const now = Date.now();
  if (entry.lastPingSentAt > entry.lastPongAt && now - entry.lastPingSentAt > WS_PONG_TIMEOUT_MS) {
    entry.lastError = 'WebSocket pong timeout';
    try {
      entry.ws.removeAllListeners?.();
      entry.ws.terminate();
    } catch {}
    entry.ws = null;
    entry.state = 'closed';
    entry.nextReconnectAt = now + 3000;
    return false;
  }

  const seq = ++clusterWsKeepaliveSeq;
  entry.lastPingSentAt = now;
  entry.lastPingSeq = seq;
  try {
    entry.ws.ping();
    entry.ws.send(
      JSON.stringify({
        type: 'keepalive_ping',
        seq,
        from_app_id: getDisplayAppId(),
        from_instance_id: RUNTIME_INSTANCE_ID,
        active_connections: countLocalOccupiedConnections(),
        trigger_tick: triggerTick,
        ts: now
      })
    );
    return true;
  } catch (err: any) {
    entry.lastError = err?.message ? String(err.message).slice(0, 120) : 'WS send failed';
    try {
      entry.ws.terminate();
    } catch {}
    entry.ws = null;
    entry.state = 'closed';
    entry.nextReconnectAt = now + 3000;
    return false;
  }
}

function wakePeerViaOpenWebSocket(targetAppId: string): boolean {
  const normTarget = normalizeAppId(targetAppId);
  for (const entry of clusterOutboundWsMap.values()) {
    if (normalizeAppId(entry.appId) === normTarget && entry.state === 'open' && entry.ws?.readyState === WebSocket.OPEN) {
      return sendClusterWsPingFrame(entry, true);
    }
  }
  for (const inbound of clusterInboundWsMap.values()) {
    if (normalizeAppId(inbound.appId) === normTarget && inbound.ws?.readyState === WebSocket.OPEN) {
      try {
        inbound.ws.send(
          JSON.stringify({
            type: 'trigger_tick',
            from_app_id: getDisplayAppId(),
            ts: Date.now()
          })
        );
        return true;
      } catch {
        // Fallback to HTTP
      }
    }
  }
  return false;
}

function isSafePeerOriginUrl(rawUrl: string): string | null {
  const s = String(rawUrl || '').trim();
  if (!s || s.length > 300) return null;
  const candidate = s.includes('://') ? s : `https://${s}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    const host = u.hostname.toLowerCase();
    if (
      !host ||
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '0.0.0.0' ||
      host === '::' ||
      host === '169.254.169.254' ||
      host === 'metadata.google.internal' ||
      host === 'metadata' ||
      host === '100.100.100.200' ||
      host.startsWith('169.254.') ||
      host.endsWith('.internal')
    ) {
      return null;
    }
    return u.origin;
  } catch {
    return null;
  }
}

function collectPeerOriginsFromCluster(params: {
  dbSockets: ActiveSocketRecord[];
  dbNodes: AppNodeRuntimeStatus[];
  selfOrigin?: string;
}): Array<{ appId: string; origin: string; peerConnections: number }> {
  const currentAppId = getCurrentAppId();
  const byApp = new Map<string, { appId: string; origin: string; peerConnections: number }>();
  const now = Date.now();

  for (const sock of params.dbSockets || []) {
    if (!sock || sock.instance_id === RUNTIME_INSTANCE_ID) continue;
    if (sock.status === 'killed') continue;
    const hbMs = sock.last_heartbeat_at ? Date.parse(sock.last_heartbeat_at) : 0;
    if (!sock.online && (!hbMs || now - hbMs > 180_000)) continue;
    const origin = isSafePeerOriginUrl(sock.domain || '');
    if (!origin) continue;
    if (params.selfOrigin && origin === params.selfOrigin) continue;
    const appId = normalizeAppId(sock.app_id) || sock.instance_id;
    if (appId === currentAppId) continue;
    const existing = byApp.get(appId);
    const conns = Number(sock.active_connections || 0);
    if (!existing || conns >= existing.peerConnections) {
      byApp.set(appId, { appId, origin, peerConnections: conns });
    }
  }

  for (const node of params.dbNodes || []) {
    const appId = normalizeAppId(node.app_id);
    if (!appId || appId === currentAppId || byApp.has(appId)) continue;
    if (node.is_active === false) continue;
    const hbMs = node.last_heartbeat_at ? Date.parse(node.last_heartbeat_at) : 0;
    if (!node.online && (!hbMs || now - hbMs > 180_000)) continue;
    const origin = isSafePeerOriginUrl(node.domain || '');
    if (!origin) continue;
    if (params.selfOrigin && origin === params.selfOrigin) continue;
    byApp.set(appId, {
      appId,
      origin,
      peerConnections: Number(node.active_connections || 0)
    });
  }

  const localConns = countLocalOccupiedConnections();
  return Array.from(byApp.values()).sort((a, b) => {
    // Prioritize interaction between idle (0-WA) apps and busy (>0-WA) apps so idle servers never sleep
    const aContrast = localConns === 0 ? (a.peerConnections > 0 ? 0 : 1) : (a.peerConnections === 0 ? 0 : 1);
    const bContrast = localConns === 0 ? (b.peerConnections > 0 ? 0 : 1) : (b.peerConnections === 0 ? 0 : 1);
    if (aContrast !== bContrast) return aContrast - bContrast;
    return a.appId.localeCompare(b.appId);
  });
}

async function pingSinglePeerClusterOrigin(params: {
  appId: string;
  origin: string;
  triggerTick?: boolean;
  timeoutMs?: number;
}): Promise<{ ok: boolean; killed?: boolean; latencyMs: number; error?: string }> {
  const startedAt = Date.now();
  const currentAppId = getDisplayAppId();
  const token = signToken(
    JSON.stringify({
      typ: 'cluster_ping',
      fromApp: currentAppId,
      fromInstance: RUNTIME_INSTANCE_ID,
      ts: startedAt
    })
  );
  try {
    const res = await fetch(`${params.origin}/api/cluster/ping`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Cluster-Ping-Token': token
      },
      body: JSON.stringify({
        from_app_id: currentAppId,
        from_instance_id: RUNTIME_INSTANCE_ID,
        active_connections: countLocalOccupiedConnections(),
        trigger_tick: Boolean(params.triggerTick)
      }),
      signal: AbortSignal.timeout(params.timeoutMs || 4500)
    });
    const latencyMs = Date.now() - startedAt;
    const body: any = await res.json().catch(() => null);
    if (!res.ok || !body?.ok) {
      return { ok: false, latencyMs, error: body?.error || `HTTP ${res.status}` };
    }
    return {
      ok: true,
      killed: Boolean(body.killed),
      latencyMs
    };
  } catch (err: any) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: err?.message ? String(err.message).slice(0, 120) : 'Timeout / unreachable'
    };
  }
}

export function handleIncomingClusterPing(opts: {
  fromApp?: string;
  fromInstance?: string;
  activeConnections?: number;
  triggerTick?: boolean;
}): {
  ok: boolean;
  app_id: string;
  instance_id: string;
  active_connections: number;
  killed: boolean;
  timestamp: string;
} {
  lastInboundPingAt = new Date().toISOString();
  lastInboundPingFrom = String(opts.fromApp || opts.fromInstance || 'peer').slice(0, 64);
  if (opts.triggerTick && !isSelfKilledByIpRule && !isBaileysStartupPending()) {
    setTimeout(() => {
      runAppNodeAssignmentTick('peer_ping_trigger').catch(() => {});
    }, 350).unref?.();
  }
  return {
    ok: true,
    app_id: getDisplayAppId(),
    instance_id: RUNTIME_INSTANCE_ID,
    active_connections: countLocalOccupiedConnections(),
    killed: isSelfKilledByIpRule,
    timestamp: lastInboundPingAt
  };
}

export type ClusterRpcAction =
  | 'ai_status'
  | 'ai_verify'
  | 'ai_test_chat'
  | 'session_reconnect'
  | 'session_test_connection'
  | 'send_message';

const ALLOWED_CLUSTER_RPC_ACTIONS = new Set<ClusterRpcAction>([
  'ai_status',
  'ai_verify',
  'ai_test_chat',
  'session_reconnect',
  'session_test_connection',
  'send_message'
]);

const usedClusterRpcNonces = new Map<string, number>();

function pruneUsedClusterRpcNonces(nowMs = Date.now()): void {
  for (const [k, exp] of usedClusterRpcNonces.entries()) {
    if (exp <= nowMs) {
      usedClusterRpcNonces.delete(k);
    }
  }
  if (usedClusterRpcNonces.size > 5000) {
    let removeCount = usedClusterRpcNonces.size - 4000;
    for (const k of usedClusterRpcNonces.keys()) {
      usedClusterRpcNonces.delete(k);
      if (--removeCount <= 0) break;
    }
  }
}

export function issueClusterRpcToken(action: ClusterRpcAction): string {
  if (!ALLOWED_CLUSTER_RPC_ACTIONS.has(action)) {
    throw new Error(`Aksi cluster RPC tidak diizinkan: ${action}`);
  }
  return signToken(
    JSON.stringify({
      typ: 'cluster_rpc',
      action,
      fromApp: getDisplayAppId(),
      fromInstance: RUNTIME_INSTANCE_ID,
      nonce: crypto.randomBytes(10).toString('hex'),
      ts: Date.now()
    })
  );
}

export function verifyClusterRpcToken(
  token: string,
  expectedAction?: ClusterRpcAction,
  options?: { skipReplayCheck?: boolean }
): {
  ok: boolean;
  action?: ClusterRpcAction;
  fromApp?: string;
  fromInstance?: string;
  error?: string;
} {
  const cleanToken = String(token || '').trim();
  if (!cleanToken) {
    return { ok: false, error: 'Token cluster RPC tidak ditemukan.' };
  }
  const payloadRaw = verifySignedToken(cleanToken);
  if (!payloadRaw) {
    return { ok: false, error: 'Tanda tangan token cluster RPC tidak valid.' };
  }
  try {
    const parsed = JSON.parse(payloadRaw);
    if (parsed?.typ !== 'cluster_rpc') {
      return { ok: false, error: 'Tipe token cluster RPC tidak valid.' };
    }
    const action = String(parsed?.action || '') as ClusterRpcAction;
    if (!ALLOWED_CLUSTER_RPC_ACTIONS.has(action)) {
      return { ok: false, error: 'Aksi cluster RPC tidak diizinkan.' };
    }
    if (expectedAction && action !== expectedAction) {
      return { ok: false, error: 'Aksi token cluster RPC tidak sesuai.' };
    }
    const ts = Number(parsed?.ts || 0);
    const nowMs = Date.now();
    if (!Number.isFinite(ts) || Math.abs(nowMs - ts) > 60_000) {
      return { ok: false, error: 'Token cluster RPC kedaluwarsa.' };
    }
    const nonce = typeof parsed?.nonce === 'string' ? parsed.nonce.trim() : '';
    if (!nonce || nonce.length < 12) {
      return { ok: false, error: 'Nonce token cluster RPC tidak valid.' };
    }
    if (!options?.skipReplayCheck) {
      pruneUsedClusterRpcNonces(nowMs);
      if (usedClusterRpcNonces.has(nonce)) {
        return { ok: false, error: 'Token cluster RPC sudah pernah digunakan (replay ditolak).' };
      }
      usedClusterRpcNonces.set(nonce, nowMs + 90_000);
    }
    return {
      ok: true,
      action,
      fromApp: typeof parsed.fromApp === 'string' ? parsed.fromApp.trim().slice(0, 64) : '',
      fromInstance: typeof parsed.fromInstance === 'string' ? parsed.fromInstance.trim().slice(0, 64) : ''
    };
  } catch {
    return { ok: false, error: 'Payload token cluster RPC tidak valid.' };
  }
}

async function resolvePeerOriginForAppId(targetAppId: string): Promise<string | null> {
  const normTarget = normalizeAppId(targetAppId);
  if (!normTarget || normTarget === getCurrentAppId()) return null;

  for (const entry of clusterOutboundWsMap.values()) {
    if (normalizeAppId(entry.appId) === normTarget) {
      const safe = isSafePeerOriginUrl(entry.origin);
      if (safe) return safe;
    }
  }

  for (const peerState of peerPingStates.values()) {
    if (normalizeAppId(peerState.appId) === normTarget) {
      const safe = isSafePeerOriginUrl(peerState.origin);
      if (safe) return safe;
    }
  }

  if (isMysqlConfigured()) {
    const dbSockets = await fetchAllActiveSocketsFromMysql().catch(() => []);
    const activeSock = dbSockets
      .filter(s => s.status !== 'killed' && normalizeAppId(s.app_id) === normTarget && isSafePeerOriginUrl(s.domain || ''))
      .sort((a, b) => Date.parse(b.last_heartbeat_at || '') - Date.parse(a.last_heartbeat_at || ''))[0];
    if (activeSock?.domain) {
      const safe = isSafePeerOriginUrl(activeSock.domain);
      if (safe) return safe;
    }

    const dbNodes = await fetchAllAppNodesFromMysql().catch(() => []);
    const activeNode = dbNodes.find(n => normalizeAppId(n.app_id) === normTarget && isSafePeerOriginUrl(n.domain || ''));
    if (activeNode?.domain) {
      const safe = isSafePeerOriginUrl(activeNode.domain);
      if (safe) return safe;
    }
  }

  return null;
}

export async function resolveTargetClusterPeerForSession(params: {
  sessionId?: string;
  userId?: string;
}): Promise<{
  localOwned: boolean;
  targetAppId?: string;
  targetOrigin?: string;
  sessionId?: string;
}> {
  const localLive = findLiveSocketEntry(params.userId, params.sessionId);
  if (localLive && isSocketTrulyOpen(localLive.socket)) {
    return {
      localOwned: true,
      targetAppId: getDisplayAppId(),
      sessionId: localLive.sessionId
    };
  }

  let targetSess = params.sessionId ? getSessionById(params.sessionId) : undefined;
  if (!targetSess && params.userId) {
    const userSessions = getSessionsByUserId(params.userId).filter(s => s.status !== 'disconnected');
    targetSess = userSessions.find(s => s.is_primary) || userSessions[0] || getSessionsByUserId(params.userId)[0];
  }

  if (!targetSess) {
    return { localOwned: !isSelfKilledByIpRule, targetAppId: getDisplayAppId(), sessionId: params.sessionId };
  }

  const remoteCheck = await evaluateRemoteLeaseForSession({
    sessionId: targetSess.id,
    userId: targetSess.user_id || params.userId,
    cleanPhone: targetSess.phone_number,
    assignedAppId: targetSess.assigned_app_id
  }).catch(() => ({ status: 'none' as const, lease: undefined }));

  const currentAppId = getCurrentAppId();
  let targetAppId = '';
  if (remoteCheck.status === 'remote_cluster_node' && remoteCheck.lease?.app_id) {
    targetAppId = normalizeAppId(remoteCheck.lease.app_id);
  } else {
    targetAppId = resolveEffectiveAssignedAppId(targetSess);
  }

  if (!targetAppId || (targetAppId === currentAppId && !isSelfKilledByIpRule)) {
    return {
      localOwned: true,
      targetAppId: getDisplayAppId(),
      sessionId: targetSess.id
    };
  }

  const peerOrigin = await resolvePeerOriginForAppId(targetAppId);
  if (!peerOrigin) {
    return {
      localOwned: targetAppId === currentAppId && !isSelfKilledByIpRule,
      targetAppId,
      sessionId: targetSess.id
    };
  }

  return {
    localOwned: false,
    targetAppId,
    targetOrigin: peerOrigin,
    sessionId: targetSess.id
  };
}

export async function callClusterPeerRpc<T = any>(params: {
  targetOrigin: string;
  action: ClusterRpcAction;
  payload: Record<string, any>;
  timeoutMs?: number;
}): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  const safeOrigin = isSafePeerOriginUrl(params.targetOrigin);
  if (!safeOrigin) {
    return { ok: false, status: 400, error: 'Origin peer cluster tidak valid atau dilarang.' };
  }
  if (!ALLOWED_CLUSTER_RPC_ACTIONS.has(params.action)) {
    return { ok: false, status: 400, error: 'Aksi cluster RPC tidak diizinkan.' };
  }

  const token = issueClusterRpcToken(params.action);
  try {
    const res = await fetch(`${safeOrigin}/api/cluster/rpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Cluster-Rpc-Token': token
      },
      body: JSON.stringify({
        action: params.action,
        payload: params.payload
      }),
      signal: AbortSignal.timeout(params.timeoutMs || 25_000)
    });
    const data = await res.json().catch(() => null);
    return {
      ok: res.ok && Boolean(data),
      status: res.status,
      data: data ?? undefined,
      error: !res.ok ? (data?.error || data?.message || `HTTP ${res.status}`) : undefined
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 502,
      error: err?.message ? String(err.message).slice(0, 140) : 'Peer node cluster tidak dapat dihubungi.'
    };
  }
}

export function getInterAppPingStatus(): {
  enabled: boolean;
  ws_enabled: boolean;
  ws_outbound_open: number;
  ws_inbound_open: number;
  interval_ms: number;
  last_round_at?: string;
  last_inbound_ping_at?: string;
  last_inbound_ping_from?: string;
  local_active_connections: number;
  peers: PeerPingState[];
} {
  let wsOutboundOpen = 0;
  for (const entry of clusterOutboundWsMap.values()) {
    if (entry.state === 'open' && entry.ws?.readyState === WebSocket.OPEN) {
      wsOutboundOpen++;
    }
  }
  let wsInboundOpen = 0;
  for (const entry of clusterInboundWsMap.values()) {
    if (entry.ws?.readyState === WebSocket.OPEN) {
      wsInboundOpen++;
    }
  }
  return {
    enabled: Boolean(interAppKeepaliveTimer),
    ws_enabled: true,
    ws_outbound_open: wsOutboundOpen,
    ws_inbound_open: wsInboundOpen,
    interval_ms: INTER_APP_PING_INTERVAL_MS,
    last_round_at: lastKeepaliveRoundAt || undefined,
    last_inbound_ping_at: lastInboundPingAt || undefined,
    last_inbound_ping_from: lastInboundPingFrom || undefined,
    local_active_connections: countLocalOccupiedConnections(),
    peers: Array.from(peerPingStates.values())
  };
}

export async function runInterAppKeepaliveTick(): Promise<void> {
  if (interAppKeepaliveInFlight || isBaileysStartupPending()) return;
  interAppKeepaliveInFlight = true;
  try {
    // If this host was previously killed, poll kill list/MySQL so an Unkill restores it within ~15s
    if (isSelfKilledByIpRule) {
      await checkAndEnforceIpKillSwitch('killed_recovery_poll').catch(() => {});
      return;
    }

    const identity = await resolveCurrentServerIdentity().catch(() => getCachedOrFallbackIdentity());
    const selfOrigin = isSafePeerOriginUrl(identity.domain || resolvePublicAppBaseUrl() || '') || undefined;
    const currentAppId = getCurrentAppId();
    const displayAppId = getDisplayAppId();

    let dbSockets: ActiveSocketRecord[] = [];
    let dbNodes: AppNodeRuntimeStatus[] = [];

    if (isMysqlConfigured()) {
      await publishCurrentSocketRecord({ force: true }).catch(() => {});
      const sysCfg = getSystemConfig();
      const snap = await fetchLiveClusterSnapshotFromMysql().catch(() => null);
      if (snap) {
        applyLiveClusterSnapshotToDb(snap);
        dbSockets = snap.sockets || [];
        dbNodes = snap.nodes || [];
      }
      const maxConnForHb = getCurrentNodeMaxConnections(sysCfg, dbNodes);
      const configuredNode = getAppNodesConfig(sysCfg).find(n => n.app_id === currentAppId);
      const localConnecting = Array.from(activeSessions.values()).filter(
        s => !s.superseded && s.status === 'connecting' && Date.now() - s.lastUpdated < 120_000
      ).length;
      await upsertAppNodeHeartbeatToMysql({
        app_id: currentAppId,
        name: configuredNode?.name,
        max_connections: configuredNode?.max_connections ?? maxConnForHb,
        is_active: configuredNode ? configuredNode.is_active !== false : true,
        active_connections: countLocalOccupiedConnections(),
        connecting_connections: localConnecting,
        hostname: identity.hostname,
        domain: identity.domain,
        server_ip: identity.serverIp
      }).catch(() => {});
    }

    const allPeers = collectPeerOriginsFromCluster({ dbSockets, dbNodes, selfOrigin });
    const meshPeers = selectBoundedMeshPeers(allPeers, currentAppId, MAX_OUTBOUND_WS_PEERS);
    const activeMeshIds = new Set(meshPeers.map(p => p.appId));

    // Prune outbound WS entries that left the active bounded mesh
    for (const [peerId, entry] of Array.from(clusterOutboundWsMap.entries())) {
      if (!activeMeshIds.has(peerId)) {
        try {
          entry.ws?.removeAllListeners?.();
          entry.ws?.close?.(1000, 'mesh_rebalance');
        } catch {}
        clusterOutboundWsMap.delete(peerId);
      }
    }

    // Also ping open inbound WS peers to keep reverse connections active (especially 0-WA servers behind NAT)
    const nowMs = Date.now();
    for (const [inKey, inbound] of Array.from(clusterInboundWsMap.entries())) {
      if (inbound.ws.readyState !== WebSocket.OPEN) {
        clusterInboundWsMap.delete(inKey);
        continue;
      }
      if (nowMs - inbound.lastSeenAt > 75_000) {
        try {
          inbound.ws.terminate();
        } catch {}
        clusterInboundWsMap.delete(inKey);
        continue;
      }
      try {
        inbound.ws.ping();
      } catch {}
    }

    lastKeepaliveRoundAt = new Date().toISOString();

    for (const peer of allPeers) {
      const inWsMesh = activeMeshIds.has(peer.appId);
      let wsEntry: OutboundClusterWsEntry | null = null;
      let wsPingSent = false;

      if (inWsMesh) {
        wsEntry = ensureOutboundClusterWsPeer(peer);
        if (wsEntry.state === 'open') {
          wsPingSent = sendClusterWsPingFrame(wsEntry, false);
        }
      }

      if (wsPingSent && wsEntry) {
        const prev = peerPingStates.get(peer.appId);
        const ageSincePong = Date.now() - (wsEntry.lastPongAt || 0);
        const wsHealthy = ageSincePong <= WS_PONG_TIMEOUT_MS;
        peerPingStates.set(peer.appId, {
          appId: peer.appId,
          origin: peer.origin,
          peerConnections: peer.peerConnections,
          lastOk: prev?.lastOk ?? wsHealthy,
          lastPingAt: new Date().toISOString(),
          lastSuccessAt: prev?.lastSuccessAt,
          consecutiveFailures: prev?.consecutiveFailures || 0,
          lastLatencyMs: prev?.lastLatencyMs,
          lastError: prev?.lastError,
          transport: 'ws',
          wsState: 'open'
        });
        continue;
      }

      // HTTP /api/cluster/ping fallback when WS is connecting, blocked by proxy, or outside MAX_OUTBOUND_WS_PEERS cap
      const pingRes = await pingSinglePeerClusterOrigin({
        appId: peer.appId,
        origin: peer.origin,
        triggerTick: false,
        timeoutMs: 4500
      });
      const prev = peerPingStates.get(peer.appId);
      const nowIso = new Date().toISOString();
      if (pingRes.ok && !pingRes.killed) {
        peerPingStates.set(peer.appId, {
          appId: peer.appId,
          origin: peer.origin,
          peerConnections: peer.peerConnections,
          lastOk: true,
          lastPingAt: nowIso,
          lastSuccessAt: nowIso,
          consecutiveFailures: 0,
          lastLatencyMs: pingRes.latencyMs,
          transport: 'http',
          wsState: wsEntry?.state || 'closed'
        });
        if (isMysqlConfigured()) {
          void clearDeadAppFailoverClaimInMysql(peer.appId).catch(() => {});
        }
      } else {
        const nextFails = (prev?.consecutiveFailures || 0) + 1;
        peerPingStates.set(peer.appId, {
          appId: peer.appId,
          origin: peer.origin,
          peerConnections: peer.peerConnections,
          lastOk: false,
          lastPingAt: nowIso,
          lastSuccessAt: prev?.lastSuccessAt,
          consecutiveFailures: nextFails,
          lastLatencyMs: pingRes.latencyMs,
          lastError: pingRes.killed ? 'Socket killed' : pingRes.error,
          transport: 'http',
          wsState: wsEntry?.state || 'closed'
        });
        if (nextFails === 3) {
          void sendTelegramAlert({
            title: `Ping Antar-App Gagal (${peer.appId})`,
            severity: 'warn',
            dedupKey: `peer_ping_fail_${peer.appId}`,
            cooldownMs: 300_000,
            lines: [
              `• Node Tujuan: <code>${escapeTelegramHtml(peer.appId)}</code>`,
              `• Origin: <code>${escapeTelegramHtml(peer.origin)}</code>`,
              `• Pengirim Ping: <code>${escapeTelegramHtml(displayAppId)}</code>`,
              `• Gagal Berturut: ${nextFails}x`,
              `• Error: ${escapeTelegramHtml(pingRes.killed ? 'Socket dimatikan (killed)' : (pingRes.error || 'Tidak merespons'))}`
            ]
          }).catch(() => {});
        }
      }
    }
  } finally {
    interAppKeepaliveInFlight = false;
  }
}

export function computeSessionFailoverPriority(
  sess: WhatsAppSession,
  owner: UserAccount | null | undefined,
  plansById: Map<string, { price?: number }>
): { tier: 0 | 1 | 2; tierLabel: 'SUPERADMIN' | 'PREMIUM' | 'GRATIS'; price: number; isPrimary: boolean } {
  const isPrimary = Boolean(sess.is_primary);
  if (owner?.role === 'admin') {
    return { tier: 0, tierLabel: 'SUPERADMIN', price: Number.MAX_SAFE_INTEGER, isPrimary };
  }
  const planId = String(owner?.plan_id || 'free').trim();
  const planPrice = Number(plansById.get(planId)?.price || 0);
  const isPaidActive = Boolean(
    owner &&
    owner.plan_status === 'active' &&
    planId !== 'free' &&
    planPrice > 0
  );
  if (isPaidActive) {
    return { tier: 1, tierLabel: 'PREMIUM', price: planPrice, isPrimary };
  }
  return { tier: 2, tierLabel: 'GRATIS', price: 0, isPrimary };
}

export function sortSessionsByFailoverPriority(
  sessions: WhatsAppSession[],
  getOwnerFn: (userId?: string) => UserAccount | null | undefined,
  plansById: Map<string, { price?: number }>
): WhatsAppSession[] {
  return [...sessions].sort((a, b) => {
    const ownerA = a.user_id ? getOwnerFn(a.user_id) : undefined;
    const ownerB = b.user_id ? getOwnerFn(b.user_id) : undefined;
    const pA = computeSessionFailoverPriority(a, ownerA, plansById);
    const pB = computeSessionFailoverPriority(b, ownerB, plansById);
    if (pA.tier !== pB.tier) return pA.tier - pB.tier;
    if (pA.price !== pB.price) return pB.price - pA.price;
    if (pA.isPrimary !== pB.isPrimary) return pA.isPrimary ? -1 : 1;
    const tsA = a.connected_at ? Date.parse(a.connected_at) : 0;
    const tsB = b.connected_at ? Date.parse(b.connected_at) : 0;
    if (tsA !== tsB) return tsA - tsB;
    return a.id.localeCompare(b.id);
  });
}

async function detectAndMigrateDeadNodeSessions(params: {
  dbNodes: AppNodeRuntimeStatus[];
  dbSockets: ActiveSocketRecord[];
  leases: Record<string, WaSessionRuntimeLease>;
}): Promise<void> {
  const currentAppId = getCurrentAppId();
  const displayAppId = getDisplayAppId();
  const sysConfig = getSystemConfig();
  const allSessions = getWhatsAppSessions();
  const now = Date.now();

  if (!isMultiNodeOrchestrationEnabled(sysConfig) && params.dbSockets.length <= 1 && params.dbNodes.length <= 1) {
    return;
  }

  // Group sockets and nodes by normalized app_id
  const socketsByApp = new Map<string, ActiveSocketRecord[]>();
  for (const sock of params.dbSockets) {
    const appId = normalizeAppId(sock.app_id);
    if (!appId) continue;
    const arr = socketsByApp.get(appId) || [];
    arr.push(sock);
    socketsByApp.set(appId, arr);
  }
  const nodeByApp = new Map<string, AppNodeRuntimeStatus>();
  for (const node of params.dbNodes) {
    const appId = normalizeAppId(node.app_id);
    if (!appId) continue;
    nodeByApp.set(appId, node);
  }

  const onlineActiveAppIds = new Set<string>();
  if (!isSelfKilledByIpRule) {
    onlineActiveAppIds.add(currentAppId);
  }
  for (const [appId, arr] of socketsByApp.entries()) {
    const hasFreshActiveSock = arr.some(s => {
      if (s.status === 'killed') return false;
      const hbMs = s.last_heartbeat_at ? Date.parse(s.last_heartbeat_at) : 0;
      return s.status === 'active' && Boolean(hbMs && now - hbMs <= DEAD_NODE_STALE_MS);
    });
    if (hasFreshActiveSock) onlineActiveAppIds.add(appId);
  }
  for (const [appId, n] of nodeByApp.entries()) {
    if (n.is_active === false) continue;
    const allKilled = (socketsByApp.get(appId) || []).length > 0 && (socketsByApp.get(appId) || []).every(s => s.status === 'killed');
    if (allKilled) continue;
    const hbMs = n.last_heartbeat_at ? Date.parse(n.last_heartbeat_at) : 0;
    if (n.online || (hbMs && now - hbMs <= DEAD_NODE_STALE_MS)) {
      onlineActiveAppIds.add(appId);
    }
  }

  // Deterministic leader election among online active nodes (prevents simultaneous duplicate migration)
  const sortedOnlineLeaders = Array.from(onlineActiveAppIds).sort();
  if (sortedOnlineLeaders.length === 0 || sortedOnlineLeaders[0] !== currentAppId) {
    return;
  }

  // Gather candidate app_ids that exist in sockets/nodes or sessions and are NOT currentAppId & NOT online
  const candidateAppIds = new Set<string>();
  for (const appId of socketsByApp.keys()) {
    if (appId !== currentAppId && !onlineActiveAppIds.has(appId)) candidateAppIds.add(appId);
  }
  for (const appId of nodeByApp.keys()) {
    if (appId !== currentAppId && !onlineActiveAppIds.has(appId)) candidateAppIds.add(appId);
  }
  for (const s of allSessions) {
    if (!s || s.assignment_status === 'released' || s.assignment_status === 'error') continue;
    const cApp = normalizeAppId(s.connected_app_id);
    const aApp = normalizeAppId(s.assigned_app_id);
    if (cApp && cApp !== currentAppId && !onlineActiveAppIds.has(cApp)) candidateAppIds.add(cApp);
    if (aApp && aApp !== currentAppId && !onlineActiveAppIds.has(aApp)) candidateAppIds.add(aApp);
  }

  if (candidateAppIds.size === 0) return;

  const plansById = new Map<string, { price?: number }>();
  for (const p of getSubscriptionPlans()) {
    plansById.set(p.id, { price: Number(p.price || 0) });
  }

  for (const deadAppId of candidateAppIds) {
    const appSockets = socketsByApp.get(deadAppId) || [];
    const appNode = nodeByApp.get(deadAppId);
    const isKilledSocket = appSockets.length > 0 && appSockets.every(s => s.status === 'killed');

    const latestHbMs = Math.max(
      appNode?.last_heartbeat_at ? Date.parse(appNode.last_heartbeat_at) : 0,
      ...appSockets.map(s => (s.last_heartbeat_at ? Date.parse(s.last_heartbeat_at) : 0)),
      0
    );

    const isConfirmedStale = isKilledSocket || (latestHbMs > 0 ? now - latestHbMs >= DEAD_NODE_STALE_MS : appNode?.online === false);
    if (!isConfirmedStale) continue;

    // Double-check live origin via ping unless explicitly killed so transient MySQL jitter doesn't trigger false failover
    if (!isKilledSocket) {
      const peerDomain =
        appSockets.find(s => isSafePeerOriginUrl(s.domain || ''))?.domain ||
        appNode?.domain ||
        '';
      const safeOrigin = isSafePeerOriginUrl(peerDomain);
      if (safeOrigin) {
        const probe = await pingSinglePeerClusterOrigin({
          appId: deadAppId,
          origin: safeOrigin,
          triggerTick: false,
          timeoutMs: 3500
        });
        if (probe.ok && !probe.killed) {
          continue; // Node is still alive over HTTP!
        }
      }
    }

    // Check affected sessions belonging to deadAppId
    const affectedSessions = allSessions.filter(s => {
      if (!s?.id) return false;
      if (s.assignment_status === 'released' || s.assignment_status === 'error') return false;
      if (s.expires_at && Date.parse(s.expires_at) < now) return false;
      const owner = resolveActiveVerifiedOwner(s.id, s.user_id, s.phone_number);
      if (!isOwnerActiveAndRegistered(owner)) return false;

      const connApp = normalizeAppId(s.connected_app_id);
      const assignApp = normalizeAppId(s.assigned_app_id);
      return connApp === deadAppId || assignApp === deadAppId;
    });

    if (affectedSessions.length === 0) {
      // Alert admin once per cooldown that this idle node went offline/killed
      void sendTelegramAlert({
        title: `App Node ${deadAppId} Offline / Mati`,
        severity: isKilledSocket ? 'critical' : 'warn',
        dedupKey: `node_offline_${deadAppId}`,
        cooldownMs: 600_000,
        lines: [
          `• Node Mati: <code>${escapeTelegramHtml(deadAppId)}</code>`,
          `• Status: ${isKilledSocket ? 'Dimatikan (Kill IP)' : 'Offline / Heartbeat Terhenti'}`,
          `• Dideteksi Oleh: <code>${escapeTelegramHtml(displayAppId)}</code>`,
          `• Sesi WA Terdampak: 0 (tidak ada sesi perlu dipindah).`
        ]
      }).catch(() => {});
      continue;
    }

    if (isMysqlConfigured()) {
      const claimed = await claimDeadAppFailoverInMysql(deadAppId, currentAppId, 90_000).catch(() => false);
      if (!claimed) continue;
    }

    // Build mutable target nodes snapshot for online nodes (prefer empty 0-WA nodes first)
    const effectiveNodes = buildEffectiveClusterNodes({
      sysConfig,
      dbNodesFromMysql: params.dbNodes,
      sessions: allSessions,
      leases: params.leases
    });
    const workingNodes: AppNodeRuntimeStatus[] = effectiveNodes
      .filter(n => n.app_id !== deadAppId && onlineActiveAppIds.has(n.app_id) && n.is_active !== false)
      .map(n => ({
        ...n,
        online: true,
        active_connections: Math.max(0, Number(n.active_connections || 0))
      }));

    // Strict priority sort: Superadmin WA (tier 0) -> Premium paid (tier 1) -> Free plan (tier 2)
    const prioritizedSessions = sortSessionsByFailoverPriority(
      affectedSessions,
      uid => (uid ? getUserById(uid) : undefined),
      plansById
    );

    const succeededList: Array<{ phone: string; tierLabel: string; targetApp: string }> = [];
    const failedList: Array<{ phone: string; tierLabel: string; reason: string }> = [];
    const targetOriginsToKick = new Set<string>();
    const nowIso = new Date().toISOString();

    for (const s of prioritizedSessions) {
      const owner = resolveActiveVerifiedOwner(s.id, s.user_id, s.phone_number);
      const prio = computeSessionFailoverPriority(s, owner, plansById);
      const cleanPhone = normalizePhoneNumber(s.phone_number || getCredsPhoneOnDisk(s.id) || '');
      const phoneLabel = cleanPhone ? `+${cleanPhone}` : s.id;

      const excluded = new Set<string>([deadAppId]);
      const target = selectEligibleDelegationTarget(workingNodes, excluded, { preferEmptyFirst: true });

      if (target) {
        target.active_connections = (target.active_connections || 0) + 1;
        const moveReason = `Auto-failover: ${deadAppId} ${isKilledSocket ? 'dimatikan' : 'mati/offline'} -> dipindah ke ${target.app_id}`;
        updateSession(s.id, {
          status: 'disconnected',
          assigned_app_id: target.app_id,
          assigned_server_ip: undefined,
          connected_app_id: '',
          connected_server_ip: undefined,
          failed_app_ids: Array.from(new Set([...(s.failed_app_ids || []).map(normalizeAppIdValue).filter(Boolean), deadAppId])),
          assignment_status: 'delegated',
          assignment_error: moveReason.slice(0, 500),
          last_assignment_at: nowIso
        });
        await updateSessionAssignmentInMysql(s.id, {
          status: 'disconnected',
          assigned_app_id: target.app_id,
          assigned_server_ip: '',
          connected_app_id: '',
          connected_server_ip: '',
          failed_app_ids: Array.from(new Set([...(s.failed_app_ids || []).map(normalizeAppIdValue).filter(Boolean), deadAppId])),
          assignment_status: 'delegated',
          assignment_error: moveReason.slice(0, 500),
          last_assignment_at: nowIso
        }).catch(() => {});

        if (owner && normalizeAppId(owner.assigned_app_id) === deadAppId) {
          updateUser(owner.id, { assigned_app_id: target.app_id });
          if (isMysqlConfigured()) {
            void pushUserAssignedAppToMysql(owner.id, target.app_id).catch(() => {});
          }
        }

        if (isMysqlConfigured()) {
          void deleteWaSessionLeaseFromMysql({
            sessionId: s.id,
            phoneNumber: cleanPhone || undefined
          }).catch(() => {});
        }

        if (target.app_id !== currentAppId) {
          const targetSockOrigin =
            params.dbSockets.find(x => normalizeAppId(x.app_id) === target.app_id && isSafePeerOriginUrl(x.domain || ''))?.domain ||
            target.domain ||
            '';
          const safeTargetOrigin = isSafePeerOriginUrl(targetSockOrigin);
          if (safeTargetOrigin) targetOriginsToKick.add(safeTargetOrigin);
        }

        succeededList.push({ phone: phoneLabel, tierLabel: prio.tierLabel, targetApp: target.app_id });
      } else {
        const failReason = `Node ${deadAppId} mati dan tidak ada node aktif dengan slot kosong tersisa`;
        updateSession(s.id, {
          status: 'disconnected',
          assigned_app_id: '',
          connected_app_id: '',
          assignment_status: 'error',
          assignment_error: failReason,
          last_assignment_at: nowIso
        });
        await updateSessionAssignmentInMysql(s.id, {
          status: 'disconnected',
          assigned_app_id: '',
          connected_app_id: '',
          assignment_status: 'error',
          assignment_error: failReason,
          last_assignment_at: nowIso
        }).catch(() => {});
        failedList.push({ phone: phoneLabel, tierLabel: prio.tierLabel, reason: 'Kapasitas node online penuh / tidak tersedia' });
      }
    }

    // Wake remote target nodes via persistent WebSocket first, falling back to HTTP ping
    for (const origin of targetOriginsToKick) {
      const targetSocketRec = params.dbSockets.find(
        x => isSafePeerOriginUrl(x.domain || '') === origin
      );
      const wokeViaWs = targetSocketRec?.app_id ? wakePeerViaOpenWebSocket(targetSocketRec.app_id) : false;
      if (!wokeViaWs) {
        void pingSinglePeerClusterOrigin({
          appId: targetSocketRec?.app_id || 'failover_target',
          origin,
          triggerTick: true,
          timeoutMs: 4500
        }).catch(() => {});
      }
    }

    // Report full failover migration result to Telegram
    const detailLines: string[] = [
      `• Node Mati: <code>${escapeTelegramHtml(deadAppId)}</code> (${isKilledSocket ? 'Kill IP' : 'Offline / Stale'})`,
      `• Dieksekusi Oleh: <code>${escapeTelegramHtml(displayAppId)}</code>`,
      `• Total WA Terdampak: <b>${prioritizedSessions.length}</b>`,
      `• Berhasil Dipindah: <b>${succeededList.length}</b> ✅`,
      `• Gagal Dipindah: <b>${failedList.length}</b> ❌`,
      `• Urutan Prioritas: <i>Superadmin → Paket Premium → Paket Gratis</i>`
    ];
    if (succeededList.length > 0) {
      detailLines.push('');
      detailLines.push('<b>Rincian Berhasil Dipindah:</b>');
      for (const item of succeededList.slice(0, 15)) {
        detailLines.push(`  ✓ [${item.tierLabel}] <code>${escapeTelegramHtml(item.phone)}</code> → <code>${escapeTelegramHtml(item.targetApp)}</code>`);
      }
      if (succeededList.length > 15) {
        detailLines.push(`  ... +${succeededList.length - 15} sesi lainnya`);
      }
    }
    if (failedList.length > 0) {
      detailLines.push('');
      detailLines.push('<b>Rincian Gagal Dipindah:</b>');
      for (const item of failedList.slice(0, 10)) {
        detailLines.push(`  ✗ [${item.tierLabel}] <code>${escapeTelegramHtml(item.phone)}</code> (${escapeTelegramHtml(item.reason)})`);
      }
    }

    console.warn(
      `[Cluster Failover] Node ${deadAppId} mati -> dipindah ${succeededList.length}/${prioritizedSessions.length} sesi (gagal: ${failedList.length}).`
    );

    void sendTelegramAlert({
      title: `Failover Otomatis Node ${deadAppId} Mati`,
      severity: failedList.length > 0 ? 'critical' : 'warn',
      dedupKey: `dead_node_failover_${deadAppId}`,
      cooldownMs: 90_000,
      lines: detailLines
    }).catch(() => {});
  }
}

export function startBaileysBackgroundLoops(): void {
  if (!baileysWatchdogTimer) {
    baileysWatchdogTimer = setInterval(() => {
      runBaileysPeriodicHealthCheck().catch(() => {});
    }, 25_000);
    baileysWatchdogTimer.unref?.();
  }
  if (!appNodeTaskTimer) {
    appNodeTaskTimer = setInterval(() => {
      runAppNodeAssignmentTick('minute_scheduler').catch(() => {});
    }, 30_000);
    appNodeTaskTimer.unref?.();
  }
  if (!interAppKeepaliveTimer) {
    interAppKeepaliveTimer = setInterval(() => {
      runInterAppKeepaliveTick().catch(() => {});
    }, INTER_APP_PING_INTERVAL_MS);
    interAppKeepaliveTimer.unref?.();
    setTimeout(() => {
      runInterAppKeepaliveTick().catch(() => {});
    }, 4000).unref?.();
  }
}

let appNodeTaskTickInFlight = false;

export async function runAppNodeAssignmentTick(
  reason = 'minute_scheduler',
  options?: {
    buildSessionFn?: (sess: WhatsAppSession) => Promise<{ ok: boolean; reason?: string }>;
  }
): Promise<{
  appId: string;
  checked: number;
  built: number;
  delegated: number;
  errors: number;
}> {
  const currentAppId = getCurrentAppId();
  if (appNodeTaskTickInFlight || isBaileysStartupPending() || isRestoringSessions || isSelfKilledByIpRule) {
    return { appId: currentAppId, checked: 0, built: 0, delegated: 0, errors: 0 };
  }

  appNodeTaskTickInFlight = true;
  let checked = 0;
  let built = 0;
  let delegated = 0;
  let errors = 0;

  try {
    let dbNodes: AppNodeRuntimeStatus[] = [];
    let dbSockets: ActiveSocketRecord[] = [];
    let leases: Record<string, WaSessionRuntimeLease> = {};

    const identity = await resolveCurrentServerIdentity().catch(() => getCachedOrFallbackIdentity());
    const localPrimaryIp =
      normalizeServerIpValue(extractPrimaryIp(identity.serverIp)) ||
      collectAllLocalIpAddresses()[0] ||
      '';
    const displayAppId = getDisplayAppId();

    if (isMysqlConfigured()) {
      const snap = await fetchLiveClusterSnapshotFromMysql().catch(() => null);
      if (snap) {
        applyLiveClusterSnapshotToDb(snap);
        dbNodes = snap.nodes || [];
        dbSockets = snap.sockets || [];
        leases = snap.leases || {};
        for (const [sid, detail] of Object.entries(snap.conflicts || {})) {
          remoteSessionConflictCache.set(sid, { detail, fetchedAt: Date.now() });
        }
        for (const [sid, lease] of Object.entries(snap.leases || {})) {
          remoteSessionLeaseCache.set(`sid:${sid}`, { lease, fetchedAt: Date.now() });
          const cleanP = normalizePhoneNumber(lease.phone_number || '');
          if (cleanP.length >= 8) {
            remoteSessionLeaseCache.set(`phone:${cleanP}`, { lease, fetchedAt: Date.now() });
          }
        }
      }

      const sysCfg = getSystemConfig();
      const maxConnForHb = getCurrentNodeMaxConnections(sysCfg, dbNodes);
      const configuredNode = getAppNodesConfig(sysCfg).find(n => n.app_id === currentAppId);
      const localConnecting = Array.from(activeSessions.values()).filter(
        s => !s.superseded && s.status === 'connecting' && Date.now() - s.lastUpdated < 120_000
      ).length;
      await upsertAppNodeHeartbeatToMysql({
        app_id: currentAppId,
        name: configuredNode?.name,
        max_connections: configuredNode?.max_connections ?? maxConnForHb,
        is_active: configuredNode ? configuredNode.is_active !== false : true,
        active_connections: countLocalOccupiedConnections(),
        connecting_connections: localConnecting,
        hostname: identity.hostname,
        domain: identity.domain,
        server_ip: identity.serverIp
      }).catch(() => {});
    }

    await publishCurrentSocketRecord({ force: reason !== 'minute_scheduler' }).catch(() => {});

    // Check for dead/killed peer nodes and failover their WA sessions (Superadmin -> Premium -> Free)
    await detectAndMigrateDeadNodeSessions({ dbNodes, dbSockets, leases }).catch(err => {
      console.warn('[Cluster Failover] Gagal memeriksa dead node:', err?.message || err);
    });

    // Drain any queued Superadmin WA messages (including cluster_alert sent by other nodes)
    if (getSuperadminWaQueue().length > 0 && resolveConnectedSuperadminSession()) {
      void drainSuperadminWaQueue(`node_tick_${reason}`).catch(() => {});
    }

    const sysConfig = getSystemConfig();
    const now = Date.now();
    const allSessions = getWhatsAppSessions();

    // WAJIB: Setiap aplikasi HANYA boleh menjalankan WA yang ditujukan untuk dirinya.
    // Jika akun/sesi ditujukan ke APP_ID lain (misal 02) atau dilepas ('released'), app ini (misal 01) wajib langsung memutus socket lokal!
    // Satu nomor WA hanya boleh berjalan di SATU server cluster.
    for (const [sid, mem] of Array.from(activeSessions.entries())) {
      if (mem.superseded) continue;
      const sMeta = allSessions.find(x => x.id === sid);
      const owner = (sMeta?.user_id || mem.userId) ? getUserById((sMeta?.user_id || mem.userId)!) : undefined;
      const memPhone = normalizePhoneNumber(mem.phoneNumber || sMeta?.phone_number || getCredsPhoneOnDisk(sid) || '');

      let releaseReason = '';
      if (sMeta?.assignment_status === 'released') {
        releaseReason = 'sesi dilepas dari socket oleh Admin';
      } else if (!isSessionOwnedByCurrentAppNode(sMeta || { id: sid, user_id: mem.userId }, sysConfig, owner)) {
        const targetApp = resolveEffectiveAssignedAppId(sMeta || { id: sid, user_id: mem.userId }, owner);
        releaseReason = `ditugaskan eksklusif ke APP_ID "${targetApp || 'lain'}" (bukan "${displayAppId}")`;
      } else if (memPhone.length >= 8) {
        const competingSessionOtherApp = allSessions.find(x => {
          if (!x || x.id === sid || x.assignment_status === 'error') return false;
          if (normalizePhoneNumber(x.phone_number || '') !== memPhone) return false;
          if (x.assignment_status === 'released') {
            const xTs = x.last_assignment_at ? Date.parse(x.last_assignment_at) : 0;
            const mTs = sMeta?.last_assignment_at ? Date.parse(sMeta.last_assignment_at) : 0;
            return xTs >= mTs;
          }
          const xOwner = x.user_id ? getUserById(x.user_id) : undefined;
          const xTargetApp = resolveEffectiveAssignedAppId(x, xOwner);
          return Boolean(xTargetApp && xTargetApp !== currentAppId);
        });
        if (competingSessionOtherApp) {
          const cOwner = competingSessionOtherApp.user_id ? getUserById(competingSessionOtherApp.user_id) : undefined;
          const cTargetApp = resolveEffectiveAssignedAppId(competingSessionOtherApp, cOwner);
          releaseReason =
            competingSessionOtherApp.assignment_status === 'released'
              ? `nomor +${memPhone} dilepas dari cluster`
              : `nomor +${memPhone} aktif/ditugaskan di APP_ID "${cTargetApp || 'lain'}"`;
        } else {
          const remoteSamePhoneLease = Object.values(leases).find(l => {
            if (!l || l.instance_id === RUNTIME_INSTANCE_ID) return false;
            if (normalizePhoneNumber(l.phone_number || '') !== memPhone) return false;
            if (now - (Number(l.heartbeat_at) || 0) > REMOTE_LEASE_FRESH_MS) return false;
            const lApp = normalizeAppId(l.app_id);
            return Boolean(lApp && lApp !== currentAppId && (Number(l.heartbeat_at) || 0) > (mem.openedAt || 0));
          });
          if (remoteSamePhoneLease) {
            releaseReason = `nomor +${memPhone} sudah berjalan di APP_ID "${remoteSamePhoneLease.app_id}"`;
          }
        }
      }

      if (releaseReason) {
        console.log(`[Cluster Exclusivity] Melepas socket lokal ${sid} (+${memPhone || '-'}): ${releaseReason}.`);
        await releaseLocalSocketForDelegation(sid);
      }
    }

    const dbUsersSnapshot = initDbFile().users || [];
    const hasExplicitAppAssignments =
      allSessions.some(s => Boolean(normalizeAppId(s.assigned_app_id))) ||
      dbUsersSnapshot.some(u => Boolean(normalizeAppId(u.assigned_app_id)));
    if (!isMultiNodeOrchestrationEnabled(sysConfig) && !hasExplicitAppAssignments) {
      return { appId: currentAppId, checked: 0, built: 0, delegated: 0, errors: 0 };
    }

    const maxConn = getCurrentNodeMaxConnections(sysConfig, dbNodes);
    const configuredNodes = getAppNodesConfig(sysConfig);
    const currentIsActive = configuredNodes.length === 0 || maxConn > 0;
    const tasksForThisNode: WhatsAppSession[] = [];
    for (const s of allSessions) {
      if (!s?.id) continue;
      if (s.assignment_status === 'released') continue;
      if (s.expires_at && Date.parse(s.expires_at) < now) continue;
      const owner = resolveActiveVerifiedOwner(s.id, s.user_id, s.phone_number);
      if (!isOwnerActiveAndRegistered(owner)) continue;
      if (!isSessionOwnedByCurrentAppNode(s, sysConfig, owner)) continue;

      const effectiveTargetApp = resolveEffectiveAssignedAppId(s, owner);
      const isPendingOrDelegated =
        s.assignment_status === 'delegated' ||
        s.assignment_status === 'pending' ||
        s.assignment_status === 'building';
      const needsBuild = isPendingOrDelegated || (s.status === 'connected' && s.assignment_status !== 'error');
      if (!needsBuild) continue;

      if (effectiveTargetApp) {
        if (effectiveTargetApp === currentAppId) {
          tasksForThisNode.push(s);
        }
      } else if (currentIsActive && configuredNodes.length > 0) {
        if (hasRegisteredCredsOnDisk(s.id) || countLocalOccupiedConnections(s.id) < maxConn) {
          tasksForThisNode.push(s);
        }
      }
    }

    const defaultBuildSessionFn = async (sess: WhatsAppSession): Promise<{ ok: boolean; reason?: string; conflict?: boolean }> => {
      const mem = activeSessions.get(sess.id);
      if (mem && !mem.superseded && mem.status === 'connected' && isSocketTrulyOpen(mem.socket)) {
        return { ok: true };
      }
      const sessOwner = sess.user_id ? getUserById(sess.user_id) : undefined;
      const effectiveApp = resolveEffectiveAssignedAppId(sess, sessOwner);
      const remoteExisting = await evaluateRemoteLeaseForSession({
        sessionId: sess.id,
        userId: sess.user_id,
        cleanPhone: sess.phone_number,
        assignedAppId: effectiveApp || undefined
      }).catch(() => ({ status: 'none' as const, lease: undefined }));
      if (remoteExisting.status !== 'none' && remoteExisting.lease) {
        const remoteLeaseApp = normalizeAppId(remoteExisting.lease.app_id);
        const remoteLeaseIp = normalizeServerIpValue(extractPrimaryIp(remoteExisting.lease.server_ip));
        if (!effectiveApp || remoteLeaseApp === effectiveApp) {
          if (remoteLeaseApp) {
            updateSession(sess.id, {
              status: 'connected',
              connected_app_id: remoteLeaseApp,
              connected_server_ip: remoteLeaseIp || undefined,
              assignment_status: 'connected',
              assignment_error: ''
            });
          }
          return { ok: true };
        }
      }
      if (isSessionInConflictCooldown(sess.id)) {
        const cDetail = sessionConflictDetails.get(sess.id) || remoteSessionConflictCache.get(sess.id)?.detail;
        return {
          ok: false,
          conflict: true,
          reason: cDetail?.raw_reason || 'Konflik koneksi WhatsApp (440)'
        };
      }
      let hasCreds = hasRegisteredCredsOnDisk(sess.id);
      if (!hasCreds) {
        hasCreds = await hydrateSessionAuthFolderFromMysql(sess.id).catch(() => false);
      }

      // Tangani permintaan pairing_code yang ditugaskan Admin ke APP_ID ini saat belum ada creds
      if (!hasCreds && sess.auth_method === 'pairing_code' && sess.phone_number) {
        try {
          const code = await requestBaileysPairingCode(sess.id, sess.phone_number, sess.user_id, {
            bypassNodeGuard: true,
            assignedAppId: effectiveApp || currentAppId
          });
          updateSession(sess.id, {
            pairing_code: code,
            assignment_status: 'building',
            assignment_error: `Kode Pairing aktif (${code}) berjalan di APP_ID ${displayAppId}`
          });
          await updateSessionAssignmentInMysql(sess.id, {
            assigned_app_id: effectiveApp || currentAppId,
            assigned_server_ip: '',
            assignment_status: 'building',
            assignment_error: `Kode Pairing aktif (${code}) berjalan di APP_ID ${displayAppId}`
          }).catch(() => {});
          return { ok: true };
        } catch (pairErr: any) {
          return { ok: false, reason: pairErr?.message || 'Gagal meminta kode pairing di APP_ID target' };
        }
      }

      if (!hasCreds) {
        return { ok: false, reason: 'Kredensial WhatsApp tidak tersedia pada server / MySQL' };
      }

      const started = await getOrStartBaileysSession(sess.id, sess.phone_number, sess.user_id, {
        bypassNodeGuard: true,
        assignedAppId: effectiveApp || currentAppId
      });
      let tries = 0;
      while (tries < 40) {
        const latest = activeSessions.get(sess.id);
        if (latest && !latest.superseded && latest.status === 'connected' && isSocketTrulyOpen(latest.socket)) {
          return { ok: true };
        }
        if (isSessionInConflictCooldown(sess.id)) {
          const cDetail = sessionConflictDetails.get(sess.id) || remoteSessionConflictCache.get(sess.id)?.detail;
          return { ok: false, conflict: true, reason: cDetail?.raw_reason || 'Konflik koneksi WhatsApp (440)' };
        }
        if (latest && latest.status === 'disconnected') {
          const diag = sessionDisconnectDiagnostics.get(sess.id);
          return {
            ok: false,
            conflict: diag?.code === 440,
            reason: diag?.reason || 'Koneksi terputus saat inisialisasi socket'
          };
        }
        if (!latest && tries > 4) {
          const diag = sessionDisconnectDiagnostics.get(sess.id);
          return { ok: false, reason: diag?.reason || 'Socket gagal dipertahankan' };
        }
        await delay(500);
        tries++;
      }
      const finalLatest = activeSessions.get(sess.id);
      if (finalLatest && !finalLatest.superseded && finalLatest.status === 'connected' && isSocketTrulyOpen(finalLatest.socket)) {
        return { ok: true };
      }
      if (started?.status === 'connected') return { ok: true };
      const diag = sessionDisconnectDiagnostics.get(sess.id);
      return { ok: false, reason: diag?.reason || 'Timeout membangun koneksi WhatsApp (20 detik)' };
    };

    const runBuild = options?.buildSessionFn || defaultBuildSessionFn;

    for (const s of tasksForThisNode) {
      checked++;
      const sOwner = s.user_id ? getUserById(s.user_id) : undefined;
      const sEffectiveApp = resolveEffectiveAssignedAppId(s, sOwner);
      const mem = activeSessions.get(s.id);
      if (mem && !mem.superseded && mem.status === 'connected' && isSocketTrulyOpen(mem.socket)) {
        if (
          s.connected_app_id !== displayAppId ||
          s.connected_server_ip !== localPrimaryIp ||
          s.assignment_status !== 'connected' ||
          normalizeAppId(s.assigned_app_id) !== (sEffectiveApp || currentAppId)
        ) {
          const okIso = new Date().toISOString();
          updateSession(s.id, {
            assigned_app_id: sEffectiveApp || currentAppId,
            assigned_server_ip: undefined,
            connected_app_id: displayAppId,
            connected_server_ip: localPrimaryIp || undefined,
            failed_app_ids: [],
            assignment_status: 'connected',
            assignment_error: '',
            last_assignment_at: okIso
          });
          await updateSessionAssignmentInMysql(s.id, {
            assigned_app_id: sEffectiveApp || currentAppId,
            assigned_server_ip: '',
            connected_app_id: displayAppId,
            connected_server_ip: localPrimaryIp || undefined,
            failed_app_ids: [],
            assignment_status: 'connected',
            assignment_error: '',
            last_assignment_at: okIso,
            status: 'connected'
          });
        }
        continue;
      }

      if (isSessionInConflictCooldown(s.id) && s.assignment_status !== 'delegated' && s.assignment_status !== 'pending') {
        continue;
      }

      if (mem && !mem.superseded && mem.status === 'connecting' && mem.pairingCode) {
        continue;
      }

      const isExplicitlyPinnedApp = Boolean(normalizeAppId(s.assigned_app_id) || normalizeAppId(sOwner?.assigned_app_id));
      const occupiedExcludingThis = countLocalOccupiedConnections(s.id);
      if (isMultiNodeOrchestrationEnabled(sysConfig) && !isExplicitlyPinnedApp && (maxConn <= 0 || occupiedExcludingThis >= maxConn)) {
        const capReason =
          maxConn <= 0
            ? `Server ${currentAppId} sedang dinonaktifkan`
            : `Batas kapasitas server ${currentAppId} penuh (${occupiedExcludingThis}/${maxConn})`;
        const delRes = await delegateSessionToNextNodeOrError(s, capReason, {
          markCurrentFailed: false,
          dbNodes,
          leases
        });
        if (delRes.exhausted) errors++;
        else delegated++;
        continue;
      }

      const buildingIso = new Date().toISOString();
      updateSession(s.id, {
        assigned_app_id: sEffectiveApp || currentAppId,
        assigned_server_ip: undefined,
        assignment_status: 'building',
        last_assignment_at: buildingIso
      });
      await updateSessionAssignmentInMysql(s.id, {
        assigned_app_id: sEffectiveApp || currentAppId,
        assigned_server_ip: '',
        assignment_status: 'building',
        last_assignment_at: buildingIso
      });

      const buildRes = await runBuild(s);
      if (buildRes.ok) {
        built++;
        const okIso = new Date().toISOString();
        const latestSess = getSessionById(s.id);
        const stillPairing = latestSess?.assignment_status === 'building' && Boolean(latestSess?.pairing_code);
        if (!stillPairing) {
          void deleteWaSessionConflictFromMysql(s.id).catch(() => {});
          clearSessionConflictState(s.id);
          updateSession(s.id, {
            status: 'connected',
            assigned_app_id: sEffectiveApp || currentAppId,
            assigned_server_ip: undefined,
            connected_app_id: displayAppId,
            connected_server_ip: localPrimaryIp || undefined,
            failed_app_ids: [],
            assignment_status: 'connected',
            assignment_error: '',
            last_assignment_at: okIso
          });
          await updateSessionAssignmentInMysql(s.id, {
            status: 'connected',
            assigned_app_id: sEffectiveApp || currentAppId,
            assigned_server_ip: '',
            connected_app_id: displayAppId,
            connected_server_ip: localPrimaryIp || undefined,
            failed_app_ids: [],
            assignment_status: 'connected',
            assignment_error: '',
            last_assignment_at: okIso
          });
        }
      } else {
        const failReason = buildRes.reason || `Gagal membangun koneksi pada APP_ID ${displayAppId}`;
        if ((buildRes as any).conflict) {
          continue;
        }
        // Jika ditugaskan ke APP_ID spesifik oleh Admin/Akun, catat error tanpa melompat ke APP lain secara sepihak
        if (isExplicitlyPinnedApp) {
          errors++;
          const errIso = new Date().toISOString();
          updateSession(s.id, {
            assignment_status: 'error',
            assignment_error: failReason.slice(0, 500),
            last_assignment_at: errIso
          });
          await updateSessionAssignmentInMysql(s.id, {
            assignment_status: 'error',
            assignment_error: failReason.slice(0, 500),
            last_assignment_at: errIso
          }).catch(() => {});
          continue;
        }
        const delRes = await delegateSessionToNextNodeOrError(s, failReason, {
          markCurrentFailed: true,
          dbNodes,
          leases
        });
        if (delRes.exhausted) errors++;
        else delegated++;
      }
    }
  } finally {
    appNodeTaskTickInFlight = false;
  }

  return { appId: currentAppId, checked, built, delegated, errors };
}

startBaileysBackgroundLoops();

export async function getClusterMonitorData(): Promise<{
  current_app_id: string;
  multi_node_enabled: boolean;
  admin_notify_phone: string;
  inter_app_ping: ReturnType<typeof getInterAppPingStatus>;
  self_socket: ActiveSocketRecord;
  active_sockets: ActiveSocketRecord[];
  kill_target_ips: KillTargetIpRule[];
  nodes: AppNodeRuntimeStatus[];
  sessions: Array<
    WhatsAppSession & {
      runtime_status: 'connected' | 'connecting' | 'disconnected';
      has_registered_creds: boolean;
      conflict_paused: boolean;
      conflict_detail?: WhatsAppSessionConflictDetail;
      disconnect_code?: number;
      disconnect_reason?: string;
      owner_username?: string;
      owner_name?: string;
      owner_email?: string;
      monitor_health: 'connected' | 'conflict' | 'error' | 'delegating' | 'disconnected';
    }
  >;
  summary: {
    total_nodes: number;
    online_nodes: number;
    total_sockets: number;
    online_sockets: number;
    total_capacity: number;
    used_capacity: number;
    connected_count: number;
    conflict_count: number;
    error_count: number;
    delegating_count: number;
  };
}> {
  await resolveCurrentServerIdentity().catch(() => {});
  const selfSocket = await publishCurrentSocketRecord({ force: true }).catch(() => buildCurrentSocketRecord());

  let dbNodes: AppNodeRuntimeStatus[] = [];
  let leases: Record<string, WaSessionRuntimeLease> = {};
  let dbSockets: ActiveSocketRecord[] = [];
  if (isMysqlConfigured()) {
    const snap = await fetchLiveClusterSnapshotFromMysql().catch(() => null);
    if (snap) {
      applyLiveClusterSnapshotToDb(snap);
      dbNodes = snap.nodes || [];
      leases = snap.leases || {};
      dbSockets = Array.isArray(snap.sockets) ? snap.sockets : [];
      for (const [sid, detail] of Object.entries(snap.conflicts || {})) {
        remoteSessionConflictCache.set(sid, { detail, fetchedAt: Date.now() });
      }
      for (const [sid, lease] of Object.entries(snap.leases || {})) {
        remoteSessionLeaseCache.set(`sid:${sid}`, { lease, fetchedAt: Date.now() });
        const cleanP = normalizePhoneNumber(lease.phone_number || '');
        if (cleanP.length >= 8) {
          remoteSessionLeaseCache.set(`phone:${cleanP}`, { lease, fetchedAt: Date.now() });
        }
      }
    } else {
      dbNodes = await fetchAllAppNodesFromMysql().catch(() => []);
      leases = await fetchAllWaSessionLeasesFromMysql().catch(() => ({}));
      dbSockets = await fetchAllActiveSocketsFromMysql().catch(() => []);
      const allConflicts = await fetchAllWaSessionConflictsFromMysql().catch(() => ({}));
      for (const [sid, detail] of Object.entries(allConflicts)) {
        remoteSessionConflictCache.set(sid, { detail, fetchedAt: Date.now() });
      }
    }
  }

  const socketMap = new Map<string, ActiveSocketRecord>();
  const nowMs = Date.now();
  for (const s of dbSockets) {
    if (!s?.instance_id) continue;
    const hbMs = s.last_heartbeat_at ? Date.parse(s.last_heartbeat_at) : 0;
    const isFresh = Boolean(hbMs && nowMs - hbMs <= 120_000);
    const effectiveStatus = s.status === 'killed' ? 'killed' : isFresh ? 'active' : 'offline';
    socketMap.set(s.instance_id, {
      ...s,
      app_id: s.app_id || 'undefined',
      status: effectiveStatus,
      online: effectiveStatus === 'active',
      is_self: s.instance_id === selfSocket.instance_id
    });
  }
  socketMap.set(selfSocket.instance_id, selfSocket);
  const activeSockets = Array.from(socketMap.values()).sort((a, b) => {
    if (a.is_self !== b.is_self) return a.is_self ? -1 : 1;
    if (a.online !== b.online) return a.online ? -1 : 1;
    return (a.primary_ip || '').localeCompare(b.primary_ip || '');
  });

  const sysConfig = getSystemConfig();
  const killTargetIps = getKillTargetIpsConfig(sysConfig);
  const rawSessions = getWhatsAppSessions();
  const nodes = buildEffectiveClusterNodes({
    sysConfig,
    dbNodesFromMysql: dbNodes,
    sessions: rawSessions,
    leases
  });

  const enrichedSessions = rawSessions.map(s => {
    const runtime = getLiveSessionRuntimeStatus(s);
    const serverIdentity = getSessionRuntimeIdentitySummary(s.id, s.phone_number, nodes);
    const owner = s.user_id ? getUserById(s.user_id) : undefined;
    const isExternalConflict = Boolean(
      runtime.conflict_paused && runtime.conflict_detail?.source_type !== 'same_server'
    );
    const multiLocationActive = Boolean(
      runtime.multi_location_active ||
      (runtime.runtime_status === 'connected' &&
        runtime.conflict_detail &&
        runtime.conflict_detail.source_type !== 'same_server')
    );

    let monitorHealth: 'connected' | 'conflict' | 'error' | 'delegating' | 'disconnected' = 'disconnected';
    if (runtime.runtime_status === 'connected') {
      monitorHealth = 'connected';
    } else if (isExternalConflict) {
      monitorHealth = 'conflict';
    } else if (s.assignment_status === 'error') {
      monitorHealth = 'error';
    } else if (
      s.assignment_status === 'delegated' ||
      s.assignment_status === 'pending' ||
      s.assignment_status === 'building' ||
      runtime.runtime_status === 'connecting'
    ) {
      monitorHealth = 'delegating';
    }

    return {
      ...s,
      connected_app_id: serverIdentity.connected_app_id || s.connected_app_id || (s.status === 'connected' ? 'undefined' : undefined),
      connected_server_name: serverIdentity.connected_server_name,
      connected_server_ip: serverIdentity.connected_server_ip || s.connected_server_ip,
      connected_server_domain: serverIdentity.connected_server_domain,
      connected_hostname: serverIdentity.connected_hostname,
      last_send_verified_at: serverIdentity.last_send_verified_at,
      multi_location_active: multiLocationActive,
      runtime_status: runtime.runtime_status,
      has_registered_creds: runtime.has_registered_creds,
      conflict_paused: isExternalConflict,
      conflict_detail:
        runtime.conflict_detail && runtime.conflict_detail.source_type !== 'same_server'
          ? runtime.conflict_detail
          : undefined,
      disconnect_code: runtime.disconnect_code,
      disconnect_reason: runtime.disconnect_reason,
      owner_username: owner?.username,
      owner_name: owner?.name,
      owner_email: owner?.email,
      monitor_health: monitorHealth
    };
  });

  const totalCapacity = nodes.filter(n => n.is_active !== false).reduce((acc, n) => acc + (n.max_connections || 0), 0);
  const usedCapacity = nodes.filter(n => n.is_active !== false).reduce((acc, n) => acc + (n.active_connections || 0), 0);

  return {
    current_app_id: getDisplayAppId(),
    multi_node_enabled: isMultiNodeOrchestrationEnabled(sysConfig),
    admin_notify_phone: resolveClusterNotifyPhone(sysConfig),
    inter_app_ping: getInterAppPingStatus(),
    self_socket: selfSocket,
    active_sockets: activeSockets,
    kill_target_ips: killTargetIps,
    nodes,
    sessions: enrichedSessions,
    summary: {
      total_nodes: nodes.length,
      online_nodes: nodes.filter(n => n.online).length,
      total_sockets: activeSockets.length,
      online_sockets: activeSockets.filter(s => s.online).length,
      total_capacity: totalCapacity,
      used_capacity: usedCapacity,
      connected_count: enrichedSessions.filter(s => s.monitor_health === 'connected').length,
      conflict_count: enrichedSessions.filter(s => s.monitor_health === 'conflict').length,
      error_count: enrichedSessions.filter(s => s.monitor_health === 'error').length,
      delegating_count: enrichedSessions.filter(s => s.monitor_health === 'delegating').length
    }
  };
}

export async function disconnectSessionFromSocket(sessionId: string): Promise<{
  success: boolean;
  session_id: string;
  phone_number?: string;
  message: string;
}> {
  const sess = getSessionById(sessionId);
  if (!sess) {
    throw new Error('Sesi WhatsApp tidak ditemukan.');
  }

  await releaseLocalSocketForDelegation(sess.id).catch(() => {});
  const cleanPhone = normalizePhoneNumber(sess.phone_number || '');
  await deleteWaSessionLeaseFromMysql({
    sessionId: sess.id,
    phoneNumber: cleanPhone || undefined
  }).catch(() => {});
  clearSessionConflictState(sess.id);
  sessionDisconnectDiagnostics.delete(sess.id);
  void deleteWaSessionConflictFromMysql(sess.id).catch(() => {});

  const nowIso = new Date().toISOString();
  updateSession(sess.id, {
    status: 'disconnected',
    assigned_app_id: '',
    assigned_server_ip: undefined,
    connected_app_id: '',
    connected_server_ip: undefined,
    assignment_status: 'released',
    assignment_error: 'Diputuskan dari socket oleh Admin',
    last_assignment_at: nowIso
  });
  await updateSessionAssignmentInMysql(sess.id, {
    status: 'disconnected',
    assigned_app_id: '',
    assigned_server_ip: '',
    connected_app_id: '',
    connected_server_ip: '',
    assignment_status: 'released',
    assignment_error: 'Diputuskan dari socket oleh Admin',
    last_assignment_at: nowIso
  });
  await publishCurrentSocketRecord({ force: true }).catch(() => {});

  return {
    success: true,
    session_id: sess.id,
    phone_number: sess.phone_number,
    message: `WhatsApp +${sess.phone_number || sess.id} berhasil diputuskan dari socket. Semua server tidak akan menjalankan sesi ini sampai dialihkan ke App baru.`
  };
}

export async function assignUserToAppNode(
  userId: string,
  targetAppId?: string
): Promise<{
  success: boolean;
  user_id: string;
  assigned_app_id?: string;
  affected_sessions: number;
  message: string;
}> {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('Akun pengguna tidak ditemukan.');
  }
  const cleanAppId = normalizeAppId(targetAppId);
  updateUser(user.id, {
    assigned_app_id: cleanAppId || undefined
  });
  await pushUserAssignedAppToMysql(user.id, cleanAppId).catch(() => {});

  const currentAppId = getCurrentAppId();
  const userSessions = getWhatsAppSessions().filter(s => s.user_id === user.id);
  const nowIso = new Date().toISOString();
  let affected = 0;

  for (const s of userSessions) {
    affected++;
    const nextBelongsHere = !cleanAppId || cleanAppId === currentAppId;
    if (!nextBelongsHere) {
      await releaseLocalSocketForDelegation(s.id).catch(() => {});
    }
    updateSession(s.id, {
      assigned_app_id: cleanAppId || '',
      assigned_server_ip: undefined,
      connected_app_id: nextBelongsHere ? s.connected_app_id : '',
      connected_server_ip: nextBelongsHere ? s.connected_server_ip : undefined,
      failed_app_ids: [],
      assignment_status: cleanAppId ? 'pending' : s.assignment_status,
      assignment_error: cleanAppId ? `Akun ditugaskan eksklusif ke APP_ID ${cleanAppId}` : '',
      last_assignment_at: nowIso
    });
    await updateSessionAssignmentInMysql(s.id, {
      assigned_app_id: cleanAppId || '',
      assigned_server_ip: '',
      connected_app_id: nextBelongsHere ? s.connected_app_id : '',
      connected_server_ip: nextBelongsHere ? s.connected_server_ip : '',
      failed_app_ids: [],
      assignment_status: cleanAppId ? 'pending' : s.assignment_status,
      assignment_error: cleanAppId ? `Akun ditugaskan eksklusif ke APP_ID ${cleanAppId}` : '',
      last_assignment_at: nowIso
    }).catch(() => {});
  }

  if (!cleanAppId || cleanAppId === currentAppId) {
    void runAppNodeAssignmentTick('user_app_assign').catch(() => {});
  }

  return {
    success: true,
    user_id: user.id,
    assigned_app_id: cleanAppId || undefined,
    affected_sessions: affected,
    message: cleanAppId
      ? `Akun ${user.username} ditugaskan eksklusif ke APP_ID "${cleanAppId}". Server lain otomatis memutus koneksi akun ini.`
      : `Penugasan APP_ID tetap untuk akun ${user.username} dibersihkan.`
  };
}

export async function reassignSessionToAppNode(
  sessionId: string,
  target?: string | { targetAppId?: string; applyToUser?: boolean }
): Promise<{
  success: boolean;
  session_id: string;
  assigned_app_id: string;
  message: string;
}> {
  const sess = getSessionById(sessionId);
  if (!sess) {
    throw new Error('Sesi WhatsApp tidak ditemukan.');
  }

  const rawTargetAppId = typeof target === 'string' ? target : target?.targetAppId;
  const applyToUser = typeof target === 'object' && Boolean(target?.applyToUser);
  let nextAppId = normalizeAppId(rawTargetAppId);

  if (!nextAppId) {
    const monitor = await getClusterMonitorData();
    const eligibleSocket = monitor.active_sockets.find(
      s => s.online && s.status === 'active' && normalizeAppId(s.app_id)
    );
    if (eligibleSocket) {
      nextAppId = normalizeAppId(eligibleSocket.app_id);
    } else {
      const targetNode = selectEligibleDelegationTarget(monitor.nodes, new Set());
      if (!targetNode) {
        throw new Error('APP_ID tujuan wajib dipilih atau harus ada node/socket APP_ID aktif.');
      }
      nextAppId = targetNode.app_id;
    }
  }

  const currentAppId = getCurrentAppId();
  const targetBelongsHere = nextAppId === currentAppId;

  if (!targetBelongsHere) {
    await releaseLocalSocketForDelegation(sess.id);
    const cleanPhone = normalizePhoneNumber(sess.phone_number || '');
    if (cleanPhone.length >= 8) {
      await closeCompetingSocketsForOwnerPhone(sess.id, cleanPhone, sess.user_id).catch(() => {});
    }
  }
  clearSessionConflictState(sess.id);
  sessionDisconnectDiagnostics.delete(sess.id);
  void deleteWaSessionConflictFromMysql(sess.id).catch(() => {});

  const nowIso = new Date().toISOString();
  updateSession(sess.id, {
    assigned_app_id: nextAppId,
    assigned_server_ip: undefined,
    connected_app_id: targetBelongsHere ? sess.connected_app_id : '',
    connected_server_ip: targetBelongsHere ? sess.connected_server_ip : undefined,
    failed_app_ids: [],
    assignment_status: 'pending',
    assignment_error: `Dialihkan eksklusif ke APP_ID ${nextAppId}`,
    last_assignment_at: nowIso
  });
  await updateSessionAssignmentInMysql(sess.id, {
    assigned_app_id: nextAppId,
    assigned_server_ip: '',
    connected_app_id: targetBelongsHere ? sess.connected_app_id : '',
    connected_server_ip: targetBelongsHere ? sess.connected_server_ip : '',
    failed_app_ids: [],
    assignment_status: 'pending',
    assignment_error: `Dialihkan eksklusif ke APP_ID ${nextAppId}`,
    last_assignment_at: nowIso
  });

  if (applyToUser && sess.user_id) {
    updateUser(sess.user_id, { assigned_app_id: nextAppId });
    await pushUserAssignedAppToMysql(sess.user_id, nextAppId).catch(() => {});
  }

  if (targetBelongsHere) {
    void runAppNodeAssignmentTick('manual_reassign').catch(() => {});
  }

  return {
    success: true,
    session_id: sess.id,
    assigned_app_id: nextAppId,
    message: targetBelongsHere
      ? `Koneksi dialihkan eksklusif ke APP_ID "${nextAppId}" (server ini) dan sedang dibangun.`
      : `Koneksi dialihkan eksklusif ke APP_ID "${nextAppId}". Server lama wajib melepas dan hanya APP_ID tujuan yang menjalankannya.`
  };
}

export async function assignPairingTargetToApp(params: {
  sessionId: string;
  userId: string;
  phoneNumber: string;
  sessionName?: string;
  targetAppId: string;
  authMethod?: 'pairing_code' | 'qr_code';
}): Promise<{
  success: boolean;
  executed_locally: boolean;
  session_id: string;
  assigned_app_id: string;
  pairing_code?: string;
  message: string;
}> {
  const cleanAppId = normalizeAppId(params.targetAppId);
  if (!cleanAppId) {
    throw new Error('Target APP_ID wajib diisi (contoh: 01, 02, app01).');
  }
  const authMethod = params.authMethod || 'pairing_code';
  const cleanPhone = params.phoneNumber ? normalizePhoneNumber(params.phoneNumber) : '';
  if (authMethod === 'pairing_code' && (!cleanPhone || cleanPhone.length < 9)) {
    throw new Error('Nomor WhatsApp tidak valid untuk pairing.');
  }

  const sessionId = sanitizeSessionId(params.sessionId);
  const nowIso = new Date().toISOString();
  const targetIsHere = cleanAppId === getCurrentAppId();

  // Lepaskan socket lokal yang memegang sesi ini atau nomor WA ini bila bukan APP_ID tujuan
  if (!targetIsHere) {
    await releaseLocalSocketForDelegation(sessionId).catch(() => {});
    if (cleanPhone.length >= 8) {
      await closeCompetingSocketsForOwnerPhone(sessionId, cleanPhone, params.userId).catch(() => {});
    }
  }

  // Simpan assignment berbasis APP_ID ke DB & MySQL agar server lain melepas & hanya APP_ID tujuan yang menjalankan
  const existing = getSessionById(sessionId);
  if (existing) {
    updateSession(existing.id, {
      phone_number: cleanPhone,
      auth_method: authMethod,
      user_id: params.userId,
      session_name: params.sessionName || existing.session_name,
      assigned_server_ip: undefined,
      assigned_app_id: cleanAppId,
      connected_app_id: targetIsHere ? existing.connected_app_id : '',
      connected_server_ip: targetIsHere ? existing.connected_server_ip : undefined,
      failed_app_ids: [],
      assignment_status: 'pending',
      assignment_error: `Ditugaskan eksklusif ke APP_ID ${cleanAppId}`,
      last_assignment_at: nowIso
    });
  } else {
    addSession({
      id: sessionId,
      session_name: params.sessionName || `WA Pair - ${cleanPhone}`,
      phone_number: cleanPhone,
      auth_method: authMethod,
      status: 'disconnected',
      is_primary: false,
      user_id: params.userId,
      assigned_app_id: cleanAppId,
      failed_app_ids: [],
      assignment_status: 'pending',
      assignment_error: `Ditugaskan eksklusif ke APP_ID ${cleanAppId}`,
      last_assignment_at: nowIso
    });
  }

  await updateSessionAssignmentInMysql(sessionId, {
    assigned_server_ip: '',
    assigned_app_id: cleanAppId,
    connected_app_id: '',
    connected_server_ip: '',
    failed_app_ids: [],
    assignment_status: 'pending',
    assignment_error: `Ditugaskan eksklusif ke APP_ID ${cleanAppId}`,
    last_assignment_at: nowIso
  }).catch(() => {});

  if (targetIsHere && authMethod === 'pairing_code') {
    const code = await requestBaileysPairingCode(sessionId, cleanPhone, params.userId, {
      bypassNodeGuard: true,
      assignedAppId: cleanAppId
    });
    updateSession(sessionId, {
      pairing_code: code,
      assignment_status: 'building',
      assignment_error: `Kode Pairing aktif (${code}) di APP_ID ${cleanAppId}`
    });
    return {
      success: true,
      executed_locally: true,
      session_id: sessionId,
      assigned_app_id: cleanAppId,
      pairing_code: code,
      message: `Pairing dijalankan langsung di APP_ID "${cleanAppId}".`
    };
  }

  return {
    success: true,
    executed_locally: false,
    session_id: sessionId,
    assigned_app_id: cleanAppId,
    message: `Pairing ditugaskan ke APP_ID "${cleanAppId}". App lain otomatis melepas dan hanya "${cleanAppId}" yang mengeksekusi.`
  };
}

export const assignPairingTargetToServer = assignPairingTargetToApp;


