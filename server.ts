import 'dotenv/config';
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import net from 'net';
import { fileURLToPath } from 'url';

import {
  handleIncomingWhatsAppMessage,
  simulateAutoReplyForTest
} from './src/lib/whatsapp.js';
import {
  getRecentAiAuditLogs,
  getAiAuditLogRelativePath,
  type AiAuditLevel
} from './src/lib/aiAuditLogger.js';
import {
  initDbFile,
  getMessageLogs,
  clearMessageLogs,
  getBotStats,
  exportCurrentDataToSql,
  getWhatsAppSessions,
  getSessions,
  getSessionById,
  getSessionsByUserId,
  addWhatsAppSession,
  updateWhatsAppSession,
  deleteWhatsAppSession,
  setPrimarySession,
  extendWhatsAppSession,
  getAntiBanSettings,
  updateAntiBanSettings,
  getUsers,
  getUserById,
  updateUser,
  getUserByApiKey,
  getUserByPhone,
  approveUserSubscription,
  rejectUserSubscription,
  registerUser,
  checkAccountAvailability,
  verifyUserOtp,
  resetPasswordWithOtp,
  getSystemConfig,
  updateSystemConfig,
  getSubscriptionPlans,
  updateSubscriptionPlan,
  addSubscriptionPlan,
  deleteSubscriptionPlan,
  getWhitelabelConfig,
  updateWhitelabelConfig,
  setUserSecurityPin,
  verifyUserSecurityPin,
  unlockUserBot,
  generateUserApiKey,
  deductUserDailyQuota,
  processRemoteWhatsAppCommand,
  upgradeUserPlan,
  deleteUserAccount,
  getQrisConfig,
  updateQrisConfig,
  getBroadcastHistory,
  addBroadcastHistory,
  clearBroadcastHistory,
  getSmtpAccounts,
  addSmtpAccountAndSync,
  updateSmtpAccountAndSync,
  deleteSmtpAccountAndSync,
  toggleSmtpAccountAndSync,
  replaceRuntimeDatabaseFromMysql,
  bumpUserSessionVersion,
  isSessionOwnedByUserId,
  flushLocalDbToDisk,
  setRuntimePublicBaseUrl,
  resolvePublicAppBaseUrl,
  resolveProductImagePublicUrl,
  getCatalogForUser,
  updateCatalogSettings,
  addCatalogProduct,
  updateCatalogProduct,
  deleteCatalogProduct,
  isLocalCatalogImageReferenced,
  resolveOrderNotificationRecipientPhone,
  getSuperadminWaQueue,
  isPhoneMetaAiVerifiedForUser,
  markUserMetaAiVerified,
  getFreeAutoReplyHours,
  normalizeFreeAutoReplyHours,
  getMaxGlobalSessions,
  normalizeMaxGlobalSessions,
  getGlobalSlotStatus,
  evaluateGlobalSlotAdmission,
  withSlotAllocationLock,
  getUserAutoReplyStatus,
  toggleUserAutoReply,
  resetFreeUserAutoReplyTimer,
  getAppNodesConfig,
  getAdminNotifyPhone,
  normalizeAppNodes,
  normalizeAdminNotifyPhone,
  resolveClusterNotifyPhone,
  normalizeServerIpValue,
  normalizeKillTargetIps,
  getKillTargetIpsConfig,
  getTelegramConfigs,
  sanitizeTelegramConfigsForAdmin,
  normalizeTelegramConfigs,
  normalizeTelegramChatId,
  isValidTelegramBotTokenFormat,
  getActiveTelegramTargets
} from './src/lib/db.js';
import {
  getOrStartBaileysSession,
  requestBaileysPairingCode,
  getBaileysSessionStatus,
  stopBaileysSession,
  sendBaileysTextMessage,
  sendBaileysMediaMessage,
  sendOrQueueViaSuperadminWa,
  normalizePhoneNumber,
  restoreSavedBaileysSessions,
  getPreferredSystemBaileysSessionId,
  pruneInactiveAndUnregisteredBaileysSessions,
  purgeBaileysSessionsForUser,
  evictAndPurgeFreeSession,
  resumeSavedUserBaileysSessions,
  sanitizeSessionId,
  shutdownBaileysManager,
  getLiveSessionRuntimeStatus,
  reconnectBaileysSessionForUser,
  ensureConnectedSessionForUser,
  clearSessionExpiryNotificationCooldown,
  isSessionInConflictCooldown,
  isBaileysRestoreInFlight,
  ensureSessionsAwakeAndRecoverMissed,
  setBaileysStartupPending,
  refreshRemoteSessionLeasesIfNeeded,
  prepareNodeAssignmentForNewConnection,
  getClusterMonitorData,
  reassignSessionToAppNode,
  disconnectSessionFromSocket,
  assignUserToAppNode,
  runAppNodeAssignmentTick,
  getSessionRuntimeIdentitySummary,
  testWhatsAppSessionChatHealth,
  assignPairingTargetToApp,
  resolveEffectiveAssignedAppId,
  checkAndEnforceIpKillSwitch,
  isIpCurrentlyActiveInCluster,
  unkillTargetIp,
  handleIncomingClusterPing,
  verifyClusterPingOrWsToken,
  handleClusterWsConnection,
  closeAllClusterMeshWebSockets,
  isSessionOwnedByCurrentAppNode,
  verifyClusterRpcToken,
  resolveTargetClusterPeerForSession,
  callClusterPeerRpc,
  type ClusterRpcAction
} from './src/lib/baileysManager.js';
import { testTelegramNotification, sendTelegramAlert, escapeTelegramHtml } from './src/lib/telegramService.js';
import { resolveIncomingApiMedia, ResolvedApiMedia } from './src/lib/mediaSecurity.js';
import {
  sendVerificationOtpEmail,
  sendPasswordResetEmail,
  testSmtpAccountConnection
} from './src/lib/emailService.js';
import {
  testGeminiApiKey,
  verifyPaymentReceiptWithAi
} from './src/lib/geminiService.js';
import {
  getMetaAiAvailabilityForUser,
  getAllConnectedMetaAiSessions,
  verifyAndInitMetaAiForUser,
  ensureConnectedMetaAiSocketForUser
} from './src/lib/metaAiService.js';
import {
  testMysqlConnection,
  syncPushStructureAndData,
  initMysqlSchemaIfNotExists,
  pushUserToMysql,
  fetchDatabaseFromMysql,
  getEffectiveMysqlConfig,
  isMysqlConfigured,
  closeMysqlPool,
  getCurrentAppId,
  getDisplayAppId,
  normalizeAppId,
  deleteAppNodeFromMysql,
  syncConfiguredAppNodesToMysql
} from './src/lib/mysqlService.js';
import {
  maskSensitiveString,
  generateOtpCode,
  decryptData,
  verifyMasterPin,
  verifyPassword,
  needsHashUpgrade,
  hashPassword,
  signToken,
  verifySignedToken,
  safeEqual
} from './src/lib/security.js';
import { EnvConfigMasked, UserAccount } from './src/types/whatsapp.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
const rawPort = process.env.PORT?.trim();
const PORT: number | string = rawPort
  ? (/^\d+$/.test(rawPort) ? parseInt(rawPort, 10) : rawPort)
  : 3000;
const isProductionRuntime =
  process.env.NODE_ENV === 'production' ||
  (typeof import.meta?.url === 'string' &&
    import.meta.url.endsWith('.js') &&
    process.env.NODE_ENV !== 'development');

const SESSION_COOKIE_NAME = 'japriin_sid';
const CSRF_COOKIE_NAME = 'japriin_csrf';
const MASTER_COOKIE_NAME = 'japriin_master';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const MASTER_UNLOCK_TTL_MS = 15 * 60 * 1000; // 15 minutes

interface ServerAuthSession {
  sid: string;
  userId: string;
  role: 'admin' | 'user';
  ver: number;
  expiresAt: number;
  masterUnlockedUntil: number;
}

interface SignedSessionPayload {
  sid: string;
  uid: string;
  role: 'admin' | 'user';
  ver: number;
  iat: number;
  exp: number;
}

interface SignedMasterPayload {
  sid: string;
  uid: string;
  exp: number;
}

const authSessions = new Map<string, ServerAuthSession>();
const revokedSids = new Map<string, number>();

function capMapEntries<K, V>(map: Map<K, V>, maxEntries: number) {
  while (map.size > maxEntries) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

// Cleanup expired auth sessions and revocations periodically
const authCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [sid, sess] of authSessions.entries()) {
    if (sess.expiresAt <= now) {
      authSessions.delete(sid);
    }
  }
  for (const [sid, exp] of revokedSids.entries()) {
    if (exp <= now) {
      revokedSids.delete(sid);
    }
  }
  capMapEntries(authSessions, 2000);
  capMapEntries(revokedSids, 5000);
}, 5 * 60 * 1000);
authCleanupTimer.unref?.();

function revokeUserAuthSessions(userId: string) {
  const exp = Date.now() + SESSION_TTL_MS;
  for (const [sid, sess] of authSessions.entries()) {
    if (sess.userId === userId) {
      revokedSids.set(sid, Math.max(sess.expiresAt, exp));
      authSessions.delete(sid);
    }
  }
  bumpUserSessionVersion(userId);
}

function encodeSignedSessionCookie(sess: ServerAuthSession): string {
  const payload: SignedSessionPayload = {
    sid: sess.sid,
    uid: sess.userId,
    role: sess.role,
    ver: sess.ver,
    iat: Date.now(),
    exp: sess.expiresAt
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return signToken(encoded);
}

function decodeSignedSessionCookie(rawCookie?: string): SignedSessionPayload | null {
  if (!rawCookie) return null;
  const verified = verifySignedToken(rawCookie);
  if (!verified) return null;

  try {
    const json = Buffer.from(verified, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as Partial<SignedSessionPayload>;
    if (
      parsed &&
      typeof parsed.sid === 'string' &&
      typeof parsed.uid === 'string' &&
      typeof parsed.exp === 'number'
    ) {
      if (parsed.exp <= Date.now()) return null;
      if (revokedSids.has(parsed.sid)) return null;
      return {
        sid: parsed.sid,
        uid: parsed.uid,
        role: parsed.role === 'admin' ? 'admin' : 'user',
        ver: Number(parsed.ver) || 1,
        iat: Number(parsed.iat) || 0,
        exp: parsed.exp
      };
    }
  } catch {
    // Legacy raw sid token fallback if in memory
    if (revokedSids.has(verified)) return null;
    const mem = authSessions.get(verified);
    if (mem && mem.expiresAt > Date.now()) {
      return {
        sid: mem.sid,
        uid: mem.userId,
        role: mem.role,
        ver: mem.ver,
        iat: Date.now(),
        exp: mem.expiresAt
      };
    }
  }
  return null;
}

function encodeSignedMasterCookie(sid: string, userId: string, exp: number): string {
  const payload: SignedMasterPayload = { sid, uid: userId, exp };
  return signToken(Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url'));
}

function decodeSignedMasterCookie(rawCookie?: string): SignedMasterPayload | null {
  if (!rawCookie) return null;
  const verified = verifySignedToken(rawCookie);
  if (!verified) return null;
  try {
    const parsed = JSON.parse(Buffer.from(verified, 'base64url').toString('utf8')) as Partial<SignedMasterPayload>;
    if (parsed && typeof parsed.sid === 'string' && typeof parsed.uid === 'string' && typeof parsed.exp === 'number') {
      if (parsed.exp <= Date.now()) return null;
      return { sid: parsed.sid, uid: parsed.uid, exp: parsed.exp };
    }
  } catch {
    return null;
  }
  return null;
}

function parseCookies(req: express.Request): Record<string, string> {
  const header = req.headers.cookie;
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    try {
      result[key] = decodeURIComponent(val);
    } catch {
      result[key] = val;
    }
  }
  return result;
}

function isHttpsRequest(req: express.Request): boolean {
  if (req.secure) return true;
  const proto = String(req.headers['x-forwarded-proto'] || '').toLowerCase().split(',')[0].trim();
  if (proto === 'https') return true;
  if (String(req.headers['x-forwarded-ssl'] || '').toLowerCase() === 'on') return true;
  const origin = String(req.headers.origin || '').toLowerCase();
  if (origin.startsWith('https://')) return true;
  const referer = String(req.headers.referer || '').toLowerCase();
  if (referer.startsWith('https://')) return true;
  return false;
}

function formatCookie(
  name: string,
  value: string,
  options: { httpOnly?: boolean; secure?: boolean; sameSite: 'Lax' | 'None'; maxAgeSec: number; partitioned?: boolean }
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${Math.max(0, Math.floor(options.maxAgeSec))}`,
    `SameSite=${options.sameSite}`
  ];
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.partitioned || (options.sameSite === 'None' && options.secure)) {
    parts.push('Partitioned');
  }
  return parts.join('; ');
}

function issueSessionCookies(req: express.Request, res: express.Response, user: UserAccount): ServerAuthSession {
  // Session rotation: revoke prior session ID if present
  const oldCookies = parseCookies(req);
  if (oldCookies[SESSION_COOKIE_NAME]) {
    const oldPayload = decodeSignedSessionCookie(oldCookies[SESSION_COOKIE_NAME]);
    if (oldPayload) {
      revokedSids.set(oldPayload.sid, oldPayload.exp);
      authSessions.delete(oldPayload.sid);
    }
  }

  const sid = crypto.randomBytes(32).toString('hex');
  const csrfToken = crypto.randomBytes(24).toString('hex');
  const session: ServerAuthSession = {
    sid,
    userId: user.id,
    role: user.role === 'admin' ? 'admin' : 'user',
    ver: Number(user.session_version) || 1,
    expiresAt: Date.now() + SESSION_TTL_MS,
    masterUnlockedUntil: 0
  };
  authSessions.set(sid, session);
  capMapEntries(authSessions, 2000);
  capMapEntries(revokedSids, 5000);

  const https = isHttpsRequest(req);
  const sameSite: 'Lax' | 'None' = https ? 'None' : 'Lax';
  const maxAgeSec = Math.floor(SESSION_TTL_MS / 1000);

  res.setHeader('Set-Cookie', [
    formatCookie(SESSION_COOKIE_NAME, encodeSignedSessionCookie(session), {
      httpOnly: true,
      secure: https,
      sameSite,
      maxAgeSec,
      partitioned: https
    }),
    formatCookie(CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: false,
      secure: https,
      sameSite,
      maxAgeSec,
      partitioned: https
    }),
    formatCookie(MASTER_COOKIE_NAME, '', {
      httpOnly: true,
      secure: https,
      sameSite,
      maxAgeSec: 0,
      partitioned: https
    })
  ]);

  return session;
}

function clearSessionCookies(req: express.Request, res: express.Response) {
  const cookies = parseCookies(req);
  if (cookies[SESSION_COOKIE_NAME]) {
    const oldPayload = decodeSignedSessionCookie(cookies[SESSION_COOKIE_NAME]);
    if (oldPayload) {
      revokedSids.set(oldPayload.sid, oldPayload.exp);
      authSessions.delete(oldPayload.sid);
    }
  }
  const https = isHttpsRequest(req);
  const sameSite: 'Lax' | 'None' = https ? 'None' : 'Lax';
  res.setHeader('Set-Cookie', [
    formatCookie(SESSION_COOKIE_NAME, '', { httpOnly: true, secure: https, sameSite, maxAgeSec: 0, partitioned: https }),
    formatCookie(CSRF_COOKIE_NAME, '', { httpOnly: false, secure: https, sameSite, maxAgeSec: 0, partitioned: https }),
    formatCookie(MASTER_COOKIE_NAME, '', { httpOnly: true, secure: https, sameSite, maxAgeSec: 0, partitioned: https })
  ]);
}

// =============================================================
// RATE LIMITING & BRUTE-FORCE PROTECTION
// =============================================================

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

function createRateLimiter(options: {
  windowMs: number;
  max: number;
  keyPrefix: string;
  message?: string;
}) {
  const buckets = new Map<string, RateLimitBucket>();

  const cleanupTimer = setInterval(() => {
    if (buckets.size === 0) return;
    const now = Date.now();
    for (const [k, b] of buckets.entries()) {
      if (b.resetAt <= now) buckets.delete(k);
    }
  }, Math.max(60_000, options.windowMs));
  cleanupTimer.unref?.();

  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${options.keyPrefix}:${ip}`;
    const now = Date.now();
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      capMapEntries(buckets, 5000);
      return next();
    }

    if (existing.count >= options.max) {
      const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        success: false,
        error: options.message || `Terlalu banyak permintaan. Coba lagi dalam ${retryAfter} detik.`
      });
    }

    existing.count += 1;
    next();
  };
}

const authRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 25,
  keyPrefix: 'auth',
  message: 'Terlalu banyak percobaan autentikasi. Silakan tunggu beberapa menit.'
});

const apiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 300,
  keyPrefix: 'api'
});

// Brute-force lockout tracker for Login passwords & Master PIN / User PIN
const failedAttemptMap = new Map<string, { failures: number; lockedUntil: number; updatedAt: number }>();

const securityMapsCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, rec] of failedAttemptMap.entries()) {
    const staleThreshold = rec.lockedUntil > 0 ? rec.lockedUntil + 60_000 : rec.updatedAt + 30 * 60 * 1000;
    if (now > staleThreshold) {
      failedAttemptMap.delete(key);
    }
  }
  for (const [key, ts] of otpCooldownMap.entries()) {
    if (now - ts > 5 * 60 * 1000) {
      otpCooldownMap.delete(key);
    }
  }
}, 5 * 60 * 1000);
securityMapsCleanupTimer.unref?.();

function checkBruteForceLock(key: string): { locked: boolean; remainingSec: number } {
  const rec = failedAttemptMap.get(key);
  if (!rec) return { locked: false, remainingSec: 0 };
  const now = Date.now();
  if (rec.lockedUntil > now) {
    return { locked: true, remainingSec: Math.ceil((rec.lockedUntil - now) / 1000) };
  }
  if (rec.lockedUntil > 0 && rec.lockedUntil <= now) {
    failedAttemptMap.delete(key);
  }
  return { locked: false, remainingSec: 0 };
}

function recordFailedAttempt(key: string, maxAttempts = 5, lockMs = 15 * 60 * 1000) {
  const now = Date.now();
  const prev = failedAttemptMap.get(key) || { failures: 0, lockedUntil: 0, updatedAt: now };
  const failures = prev.failures + 1;
  const lockedUntil = failures >= maxAttempts ? now + lockMs : 0;
  failedAttemptMap.set(key, { failures, lockedUntil, updatedAt: now });
  capMapEntries(failedAttemptMap, 3000);
}

function clearFailedAttempts(key: string) {
  failedAttemptMap.delete(key);
}

// =============================================================
// SECURITY HEADERS, CORS, JSON PARSER, AUTH & CSRF MIDDLEWARE
// =============================================================

app.use((req, res, next) => {
  res.removeHeader('X-Powered-By');
  res.removeHeader('X-Frame-Options');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  const cspScriptExtra = isProductionRuntime ? '' : " 'unsafe-eval'";
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'; img-src 'self' data: blob: https:; font-src 'self' data: https:; style-src 'self' 'unsafe-inline' https:; script-src 'self' 'unsafe-inline'${cspScriptExtra}; connect-src 'self' ws: wss: https:; frame-ancestors 'self' https://aistudio.google.com https://*.google.com https://*.usercontent.goog;`
  );
  if (isHttpsRequest(req)) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // CORS allowlist validation (never wildcard * with credentials)
  const origin = req.headers.origin;
  if (origin) {
    const allowedFromEnv = (process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const appUrl = (process.env.APP_URL || '').trim().replace(/\/$/, '');
    const hostOriginHttp = req.headers.host ? `http://${req.headers.host}` : '';
    const hostOriginHttps = req.headers.host ? `https://${req.headers.host}` : '';
    const isAllowed =
      origin === hostOriginHttp ||
      origin === hostOriginHttps ||
      (appUrl && origin === appUrl) ||
      allowedFromEnv.includes(origin);

    if (isAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-CSRF-Token');
    }
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

app.use(
  express.json({
    limit: '16mb',
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    }
  })
);
app.use(express.urlencoded({ extended: true, limit: '16mb' }));
app.use((req, _res, next) => {
  const rawHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (rawHost && /^[a-zA-Z0-9.-]+(:\d{1,5})?$/.test(rawHost) && !isBlockedSsrfHost(rawHost)) {
    const proto = isHttpsRequest(req) ? 'https' : 'http';
    setRuntimePublicBaseUrl(`${proto}://${rawHost}`);
  }
  next();
});
app.use('/api', apiRateLimiter);

// Attach authenticated session & user context from HttpOnly signed cookie (survives hot reloads/restarts)
app.use((req, _res, next) => {
  const cookies = parseCookies(req);
  const rawToken = cookies[SESSION_COOKIE_NAME];
  if (rawToken) {
    const payload = decodeSignedSessionCookie(rawToken);
    if (payload) {
      const user = getUserById(payload.uid);
      const currentVer = user ? (Number(user.session_version) || 1) : -1;
      if (user && user.is_active && user.email_verified && currentVer === payload.ver) {
        let sess = authSessions.get(payload.sid);
        if (!sess) {
          sess = {
            sid: payload.sid,
            userId: user.id,
            role: user.role === 'admin' ? 'admin' : 'user',
            ver: currentVer,
            expiresAt: payload.exp,
            masterUnlockedUntil: 0
          };
          authSessions.set(payload.sid, sess);
        } else {
          sess.role = user.role === 'admin' ? 'admin' : 'user';
        }

        if (user.role === 'admin' && cookies[MASTER_COOKIE_NAME]) {
          const masterPayload = decodeSignedMasterCookie(cookies[MASTER_COOKIE_NAME]);
          if (masterPayload && masterPayload.sid === sess.sid && masterPayload.uid === user.id) {
            sess.masterUnlockedUntil = Math.max(sess.masterUnlockedUntil, masterPayload.exp);
          }
        }

        (req as any).authSession = sess;
        (req as any).authUser = user;
      } else {
        authSessions.delete(payload.sid);
      }
    }
  }
  next();
});

// Double-submit CSRF protection for state-changing API requests
const CSRF_EXEMPT_EXACT = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/verify-otp',
  '/api/auth/resend-otp',
  '/api/auth/verify-login-pin',
  '/api/auth/forgot-password/request',
  '/api/auth/forgot-password/reset',
  '/api/auth/check-availability',
  '/api/cluster/ping',
  '/api/cluster/rpc'
]);

app.use('/api', (req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }

  const fullPath = `/api${req.path}`;
  if (CSRF_EXEMPT_EXACT.has(fullPath)) {
    return next();
  }

  // Bearer / x-api-key external REST API v1 clients do not use browser cookies
  const hasApiKeyHeader = Boolean(req.headers.authorization || req.headers['x-api-key']);
  if (fullPath.startsWith('/api/v1/') && hasApiKeyHeader) {
    return next();
  }

  const cookies = parseCookies(req);
  const cookieCsrf = cookies[CSRF_COOKIE_NAME] || '';
  const headerCsrf = String(req.headers['x-csrf-token'] || '');

  // If browser has an active session cookie or csrf cookie, enforce exact CSRF header match
  if (cookies[SESSION_COOKIE_NAME] || cookieCsrf) {
    if (!cookieCsrf || !headerCsrf || !safeEqual(cookieCsrf, headerCsrf)) {
      return res.status(403).json({
        success: false,
        error: 'Validasi keamanan CSRF gagal. Silakan muat ulang halaman dan coba lagi.'
      });
    }
  }

  next();
});

// =============================================================
// HELPERS: AUTH, RBAC, SANITIZATION & SYSTEM NOTIFICATIONS
// =============================================================

const requireAuth: express.RequestHandler = (req, res, next) => {
  const user = (req as any).authUser as UserAccount | undefined;
  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'Sesi login tidak valid atau telah berakhir. Silakan masuk kembali.'
    });
  }
  next();
};

const requireAdmin: express.RequestHandler = (req, res, next) => {
  const user = (req as any).authUser as UserAccount | undefined;
  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'Autentikasi diperlukan untuk mengakses fitur ini.'
    });
  }
  if (user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Akses ditolak. Hanya Superadmin yang dapat melakukan aksi ini.'
    });
  }
  next();
};

const requireMasterUnlocked: express.RequestHandler = (req, res, next) => {
  const user = (req as any).authUser as UserAccount | undefined;
  const sess = (req as any).authSession as ServerAuthSession | undefined;
  if (!user) {
    return res.status(401).json({ success: false, error: 'Autentikasi diperlukan.' });
  }
  if (user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Akses ditolak. Khusus Superadmin.' });
  }
  if (!sess || !sess.masterUnlockedUntil || sess.masterUnlockedUntil <= Date.now()) {
    return res.status(403).json({
      success: false,
      code: 'MASTER_PIN_REQUIRED',
      error: 'Panel Master terkunci. Masukkan PIN Master Superadmin terlebih dahulu.'
    });
  }
  next();
};

function resolveEffectiveUserId(req: express.Request, requestedId?: string): string {
  const authUser = (req as any).authUser as UserAccount;
  if (authUser.role === 'admin' && requestedId && getUserById(requestedId)) {
    return requestedId;
  }
  return authUser.id;
}

function canAccessSession(authUser: UserAccount, sessionId: string): boolean {
  if (authUser.role === 'admin') return true;
  const sess = getSessionById(sessionId);
  if (sess) {
    if (sess.user_id) return sess.user_id === authUser.id;
    return isSessionOwnedByUserId(sess.id, authUser.id);
  }
  return isSessionOwnedByUserId(sessionId, authUser.id);
}

function isBlockedSsrfHost(rawHostOrUrl: string): boolean {
  const val = String(rawHostOrUrl || '').trim().toLowerCase();
  if (!val) return false;
  let hostname = val;
  try {
    if (val.includes('://')) {
      hostname = new URL(val).hostname.toLowerCase();
    } else {
      hostname = val.split(':')[0].replace(/^\[|\]$/g, '').toLowerCase();
    }
  } catch {
    return true;
  }

  if (!hostname) return true;
  if (
    hostname === '169.254.169.254' ||
    hostname === 'metadata.google.internal' ||
    hostname === 'metadata' ||
    hostname === '100.100.100.200' ||
    hostname === '0.0.0.0' ||
    hostname === '::' ||
    hostname.startsWith('169.254.') ||
    hostname.endsWith('.internal')
  ) {
    return true;
  }
  return false;
}

function isSafeImageUrl(rawUrl: unknown): boolean {
  if (rawUrl === undefined || rawUrl === null) return true;
  const s = String(rawUrl).trim();
  if (!s) return true;
  if (s.length > 500000) return false;
  if (s.startsWith('/') && !s.startsWith('//')) return true;
  if (/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i.test(s)) return true;
  try {
    const parsed = new URL(s);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    if (isBlockedSsrfHost(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

function isSafeHttpUrl(rawUrl: unknown): boolean {
  if (rawUrl === undefined || rawUrl === null) return false;
  const s = String(rawUrl).trim();
  if (!s || s.length > 512) return false;
  try {
    const parsed = new URL(s);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    if (isBlockedSsrfHost(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

function sanitizeSessionForClient(sess: any, options?: { includeClusterFields?: boolean }) {
  if (!sess) return sess;
  const copy = { ...sess };
  if (copy.access_token) {
    const plain = decryptData(String(copy.access_token));
    copy.access_token = plain ? maskSensitiveString(plain) : '';
  }
  if (!options?.includeClusterFields) {
    delete copy.assigned_app_id;
    delete copy.assigned_server_ip;
    delete copy.failed_app_ids;
    delete copy.assignment_status;
    delete copy.assignment_error;
    delete copy.last_assignment_at;
  }
  return copy;
}

function sanitizeUserForClient(user: any) {
  if (!user) return null;
  const copy: any = { ...user };
  delete copy.verification_otp;
  delete copy.password;
  delete copy.security_pin;

  copy.has_security_pin = Boolean(user.security_pin);
  copy.email_verified = Boolean(user.email_verified);
  copy.wa_verified = Boolean(user.wa_verified);
  copy.is_active = Boolean(user.is_active);
  copy.meta_ai_verified = Boolean(user.meta_ai_verified);
  copy.meta_ai_verified_phone = user.meta_ai_verified_phone || '';
  copy.meta_ai_verified_phones = Array.isArray(user.meta_ai_verified_phones) ? user.meta_ai_verified_phones : [];
  copy.meta_ai_verified_at = user.meta_ai_verified_at || '';

  const autoReplyStatus = getUserAutoReplyStatus(user);
  copy.auto_reply_enabled = autoReplyStatus.enabled;
  copy.auto_reply_activated_at = user.auto_reply_activated_at || '';
  copy.auto_reply_status = autoReplyStatus;
  copy.ai_enabled = user.role === 'admin' ? user.ai_enabled !== false : user.ai_enabled === true;
  copy.default_cs_reply_enabled =
    user.role === 'admin' ? user.default_cs_reply_enabled !== false : user.default_cs_reply_enabled === true;

  if (user.custom_gemini_key) {
    const plain = decryptData(String(user.custom_gemini_key));
    copy.custom_gemini_key_set = Boolean(plain);
    copy.custom_gemini_key = plain ? maskSensitiveString(plain, 6, 4) : '';
  } else {
    copy.custom_gemini_key_set = false;
    copy.custom_gemini_key = '';
  }

  return copy;
}

function sanitizeSystemConfigForAdmin(sysConfig: any) {
  const effectiveMysql = getEffectiveMysqlConfig();
  return {
    ...sysConfig,
    app_nodes: getAppNodesConfig(sysConfig),
    kill_target_ips: getKillTargetIpsConfig(sysConfig),
    telegram_bot_token: '',
    telegram_bot_token_set: Boolean(sysConfig?.telegram_bot_token),
    telegram_configs: sanitizeTelegramConfigsForAdmin(sysConfig),
    telegram_configured: getActiveTelegramTargets(sysConfig).length > 0,
    admin_notify_phone: resolveClusterNotifyPhone(sysConfig),
    current_app_id: getDisplayAppId(),
    mysql_host: effectiveMysql.host,
    mysql_port: effectiveMysql.port,
    mysql_user: effectiveMysql.user,
    mysql_database: effectiveMysql.database,
    mysql_ssl: effectiveMysql.ssl,
    mysql_env_managed: Boolean(
      process.env.MYSQL_HOST?.trim() &&
      process.env.MYSQL_USER?.trim() &&
      process.env.MYSQL_DATABASE?.trim()
    ),
    mysql_password: '',
    mysql_password_set: Boolean(effectiveMysql.password)
  };
}

function getSystemWhatsAppSessionId() {
  const preferred = getPreferredSystemBaileysSessionId();
  if (preferred) return preferred;

  const sessions = getWhatsAppSessions();
  const adminSess = sessions.find(s => {
    if (s.status !== 'connected') return false;
    const owner = s.user_id ? getUserById(s.user_id) : null;
    return owner?.role === 'admin' && owner.is_active;
  });
  return adminSess ? adminSess.id : null;
}

async function sendSystemWhatsAppNotification(
  phone: string,
  text: string,
  meta?: { category?: 'password_reset' | 'system_otp' | 'order_notification'; ownerUserId?: string; invoiceNumber?: string }
): Promise<{ sent: boolean; queued: boolean }> {
  const res = await sendOrQueueViaSuperadminWa({
    recipientPhone: phone,
    message: text,
    category: meta?.category || 'system_otp',
    ownerUserId: meta?.ownerUserId,
    invoiceNumber: meta?.invoiceNumber
  });
  return { sent: res.sent, queued: res.queued };
}

// In-memory rate limiting map for OTP generation (30 seconds cooldown per target)
const otpCooldownMap = new Map<string, number>();

function checkOtpCooldown(key: string, seconds = 30): { allowed: boolean; remaining: number } {
  if (!key) return { allowed: true, remaining: 0 };
  const lastTime = otpCooldownMap.get(key) || 0;
  const now = Date.now();
  const diffSec = Math.floor((now - lastTime) / 1000);
  if (diffSec < seconds) {
    return { allowed: false, remaining: seconds - diffSec };
  }
  otpCooldownMap.set(key, now);
  capMapEntries(otpCooldownMap, 3000);
  return { allowed: true, remaining: 0 };
}

// =============================================================
// 2. SESSION AUTHENTICATION ENDPOINTS
// =============================================================

app.get('/api/auth/me', (req, res) => {
  const user = (req as any).authUser as UserAccount | undefined;
  const sess = (req as any).authSession as ServerAuthSession | undefined;
  if (!user) {
    return res.status(401).json({ success: false, authenticated: false, user: null });
  }
  const freshUser = getUserById(user.id);
  if (!freshUser || !freshUser.is_active || !freshUser.email_verified) {
    clearSessionCookies(req, res);
    return res.status(401).json({ success: false, authenticated: false, user: null });
  }
  res.json({
    success: true,
    authenticated: true,
    user: sanitizeUserForClient(freshUser),
    masterUnlocked: Boolean(sess?.masterUnlockedUntil && sess.masterUnlockedUntil > Date.now())
  });
});

app.post('/api/auth/logout', (req, res) => {
  clearSessionCookies(req, res);
  res.json({ success: true, message: 'Berhasil keluar dari sesi.' });
});

app.get('/api/auth/master-status', requireAdmin, (req, res) => {
  const user = (req as any).authUser as UserAccount;
  const sess = (req as any).authSession as ServerAuthSession;
  const unlocked = Boolean(sess?.masterUnlockedUntil && sess.masterUnlockedUntil > Date.now());
  const pinConfigured = Boolean(process.env.SUPERADMIN_MASTER_PIN?.trim() || user.security_pin);
  res.json({
    success: true,
    unlocked,
    pinConfigured,
    expiresAt: unlocked ? sess.masterUnlockedUntil : null
  });
});

app.post('/api/auth/master-pin', requireAdmin, authRateLimiter, (req, res) => {
  const user = (req as any).authUser as UserAccount;
  const sess = (req as any).authSession as ServerAuthSession;
  const { pin } = req.body || {};
  if (!pin || typeof pin !== 'string') {
    return res.status(400).json({ success: false, error: 'PIN Master wajib diisi.' });
  }

  const lockKey = `master_pin:${req.ip}:${user.id}`;
  const lockStatus = checkBruteForceLock(lockKey);
  if (lockStatus.locked) {
    return res.status(429).json({
      success: false,
      error: `Terlalu banyak percobaan PIN salah. Silakan tunggu ${lockStatus.remainingSec} detik.`
    });
  }

  if (!process.env.SUPERADMIN_MASTER_PIN?.trim() && !user.security_pin) {
    return res.status(400).json({
      success: false,
      error: 'PIN Master belum dikonfigurasi. Atur SUPERADMIN_MASTER_PIN di environment server atau atur PIN keamanan pada profil Superadmin.'
    });
  }

  const isValid = verifyMasterPin(pin, user.security_pin);
  if (isValid) {
    clearFailedAttempts(lockKey);
    sess.masterUnlockedUntil = Date.now() + MASTER_UNLOCK_TTL_MS;
    const https = isHttpsRequest(req);
    const sameSite: 'Lax' | 'None' = https ? 'None' : 'Lax';
    res.append(
      'Set-Cookie',
      formatCookie(MASTER_COOKIE_NAME, encodeSignedMasterCookie(sess.sid, user.id, sess.masterUnlockedUntil), {
        httpOnly: true,
        secure: https,
        sameSite,
        maxAgeSec: Math.floor(MASTER_UNLOCK_TTL_MS / 1000),
        partitioned: https
      })
    );
    return res.json({
      success: true,
      unlocked: true,
      expiresAt: sess.masterUnlockedUntil,
      message: 'Otentikasi Superadmin Berhasil!'
    });
  }

  recordFailedAttempt(lockKey, 5, 15 * 60 * 1000);
  return res.status(403).json({ success: false, error: 'PIN Master Superadmin Salah!' });
});

app.post('/api/auth/master-lock', requireAdmin, (req, res) => {
  const sess = (req as any).authSession as ServerAuthSession;
  if (sess) sess.masterUnlockedUntil = 0;
  const https = isHttpsRequest(req);
  const sameSite: 'Lax' | 'None' = https ? 'None' : 'Lax';
  res.append(
    'Set-Cookie',
    formatCookie(MASTER_COOKIE_NAME, '', {
      httpOnly: true,
      secure: https,
      sameSite,
      maxAgeSec: 0,
      partitioned: https
    })
  );
  res.json({ success: true, unlocked: false, message: 'Panel Master dikunci.' });
});

app.get('/api/auth/check-availability', authRateLimiter, (req, res) => {
  const { username, email, phone, exclude_user_id } = req.query;
  const result = checkAccountAvailability({
    username: username as string | undefined,
    email: email as string | undefined,
    phone: phone as string | undefined,
    excludeUserId: exclude_user_id as string | undefined
  });
  res.json({ success: true, ...result });
});

app.post('/api/auth/check-availability', authRateLimiter, (req, res) => {
  const { username, email, phone, exclude_user_id } = req.body || {};
  const result = checkAccountAvailability({
    username,
    email,
    phone,
    excludeUserId: exclude_user_id
  });
  res.json({ success: true, ...result });
});

app.get('/api/slots/status', (_req, res) => {
  res.json({
    success: true,
    data: getGlobalSlotStatus()
  });
});

app.post('/api/auth/register', authRateLimiter, async (req, res) => {
  try {
    if (!req.body?.email || !String(req.body.email).includes('@')) {
      return res.status(400).json({ success: false, error: 'Alamat Email aktif wajib diisi untuk menerima kode OTP aktivasi akun.' });
    }

    const plans = getSubscriptionPlans();
    const rawPlanId = typeof req.body?.plan_id === 'string' ? req.body.plan_id.trim() : 'free';
    const requestedPlan = plans.find(p => p.id === rawPlanId) || plans[0];
    const isPaidSignupIntent = requestedPlan.id !== 'free' && Number(requestedPlan.price) > 0;

    const lockResult = await withSlotAllocationLock(async () => {
      const admission = evaluateGlobalSlotAdmission({
        requestedPlanId: isPaidSignupIntent ? requestedPlan.id : 'free',
        action: 'register'
      });

      if (!admission.allowed) {
        return { blocked: true as const, admission };
      }

      const { user, otp } = registerUser({
        username: req.body.username,
        name: req.body.name,
        email: req.body.email,
        phone: req.body.phone,
        password: req.body.password,
        // Public registration always provisions Free until payment is verified; paid intent recorded separately
        plan_id: 'free',
        payment_note: isPaidSignupIntent
          ? `Permohonan Paket ${requestedPlan.name} (Menunggu Verifikasi Email & Pembayaran)`
          : req.body.payment_note
      });

      if (isPaidSignupIntent) {
        updateUser(user.id, {
          requested_plan_id: requestedPlan.id,
          plan_status: 'pending_approval'
        });
      }

      return { blocked: false as const, user: getUserById(user.id) || user, otp };
    });

    if (lockResult.blocked) {
      const statusCode = lockResult.admission.code === 'HIGH_SURGE_FULL' ? 429 : 409;
      return res.status(statusCode).json({
        success: false,
        code: lockResult.admission.code,
        slot_status: lockResult.admission.slotStatus,
        error: lockResult.admission.message || 'Lonjakan aplikasi sedang tinggi, belum bisa buat sesi baru saat ini.'
      });
    }

    const { user, otp } = lockResult;
    await pushUserToMysql(user).catch(() => {});

    const emailRes = await sendVerificationOtpEmail(user.email, user.name || user.username, otp).catch((e: any) => ({
      success: false,
      error: e?.message
    }));

    const cleanUser = sanitizeUserForClient(user);
    res.json({
      success: true,
      user: cleanUser,
      data: cleanUser,
      user_id: user.id,
      email: user.email,
      email_sent: emailRes.success,
      slot_status: getGlobalSlotStatus(),
      message: emailRes.success
        ? `Pendaftaran berhasil! Kode OTP 6 digit telah dikirim ke email ${user.email}. Masukkan kode OTP untuk mengaktifkan akun Anda.`
        : `Pendaftaran berhasil disimpan, namun pengiriman email OTP tertunda (${emailRes.error || 'SMTP belum dikonfigurasi'}).`
    });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e?.message || 'Gagal mendaftar pengguna baru.' });
  }
});

app.post('/api/auth/login', authRateLimiter, async (req, res) => {
  try {
    const { username, password, device_id } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username/Email dan Password wajib diisi.' });
    }

    const cleanUser = String(username).toLowerCase().trim();
    const loginLockKey = `login:${req.ip}:${cleanUser}`;
    const lockCheck = checkBruteForceLock(loginLockKey);
    if (lockCheck.locked) {
      return res.status(429).json({
        success: false,
        error: `Terlalu banyak percobaan login gagal. Silakan tunggu ${lockCheck.remainingSec} detik.`
      });
    }

    const users = getUsers();
    const cleanDigits = String(username).replace(/\D/g, '');
    const normDigits = cleanDigits.startsWith('0') ? '62' + cleanDigits.slice(1) : cleanDigits;

    const user = users.find(u => {
      const uName = u.username?.toLowerCase();
      const uEmail = u.email?.toLowerCase();
      const uPhone = u.phone ? u.phone.replace(/\D/g, '') : '';
      const uNormPhone = uPhone.startsWith('0') ? '62' + uPhone.slice(1) : uPhone;

      return (
        uName === cleanUser ||
        uEmail === cleanUser ||
        (cleanDigits.length >= 8 && (uPhone === cleanDigits || uNormPhone === normDigits))
      );
    });

    const passwordValid = user && user.password ? verifyPassword(String(password), user.password) : false;
    if (!user || !passwordValid) {
      recordFailedAttempt(loginLockKey, 8, 10 * 60 * 1000);
      return res.status(401).json({
        success: false,
        error: 'Username/Email atau Password tidak sesuai.'
      });
    }

    clearFailedAttempts(loginLockKey);

    // Upgrade legacy unsalted password hash transparently on successful login
    if (needsHashUpgrade(user.password)) {
      updateUser(user.id, { password: hashPassword(String(password)) });
    }

    if (!user.email_verified) {
      let pendingOtp = user.verification_otp;
      const now = Date.now();
      const isExpired = !user.otp_expires_at || new Date(user.otp_expires_at).getTime() < now;
      const cooldownCheck = checkOtpCooldown(`login_email_${user.id}`, 30);

      if (!pendingOtp || isExpired || cooldownCheck.allowed) {
        pendingOtp = generateOtpCode();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        const updatedPending = updateUser(user.id, {
          verification_otp: pendingOtp,
          otp_expires_at: expiresAt,
          otp_failed_attempts: 0
        });
        if (updatedPending) {
          await pushUserToMysql(updatedPending).catch(() => {});
        }
        if (user.email) {
          sendVerificationOtpEmail(user.email, user.name || user.username, pendingOtp).catch(err => {
            console.error('[Send Pending Login Email OTP Error]', err);
          });
        }
      }

      return res.status(200).json({
        success: false,
        requires_email_verification: true,
        user_id: user.id,
        email: user.email,
        message: `Akun Anda belum terverifikasi. Kami telah mengirimkan kode OTP ke email ${user.email}.`
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        error: 'Akun Anda sedang dinonaktifkan atau menunggu persetujuan administrator.'
      });
    }

    const incomingDevice = typeof device_id === 'string' && device_id.length <= 128 ? device_id : 'trusted_browser';
    const updatedUser = updateUser(user.id, {
      last_login_device: incomingDevice
    });
    if (updatedUser) {
      await pushUserToMysql(updatedUser).catch(() => {});
    }

    const activeUser = updatedUser || user;
    issueSessionCookies(req, res, activeUser);

    const sanitizedUser = sanitizeUserForClient(activeUser);
    res.json({ success: true, user: sanitizedUser, data: sanitizedUser });
  } catch (err) {
    console.error('Server login handler error:', err);
    res.status(500).json({ success: false, error: 'Terjadi kesalahan pada server saat memproses login.' });
  }
});

app.post('/api/auth/verify-login-pin', authRateLimiter, (req, res) => {
  const { user_id, pin, device_id } = req.body || {};
  if (!user_id || !pin) {
    return res.status(400).json({ success: false, error: 'User ID dan PIN wajib diisi.' });
  }

  const lockKey = `login_pin:${req.ip}:${user_id}`;
  const lockCheck = checkBruteForceLock(lockKey);
  if (lockCheck.locked) {
    return res.status(429).json({
      success: false,
      error: `Terlalu banyak percobaan PIN salah. Coba lagi dalam ${lockCheck.remainingSec} detik.`
    });
  }

  const targetUser = getUserById(String(user_id));
  if (!targetUser || !targetUser.is_active || !targetUser.email_verified) {
    return res.status(403).json({ success: false, error: 'Akun tidak aktif atau belum terverifikasi.' });
  }

  const isValid = verifyUserSecurityPin(String(user_id), String(pin));
  if (isValid) {
    clearFailedAttempts(lockKey);
    if (device_id && typeof device_id === 'string' && device_id.length <= 128) {
      updateUser(user_id, { last_login_device: device_id });
    }
    const freshUser = getUserById(String(user_id))!;
    issueSessionCookies(req, res, freshUser);
    const user = sanitizeUserForClient(freshUser);
    return res.json({ success: true, message: 'Verifikasi PIN berhasil!', user, data: user });
  }

  recordFailedAttempt(lockKey, 5, 15 * 60 * 1000);
  res.status(400).json({ success: false, error: 'PIN Keamanan salah. Silakan coba lagi.' });
});

app.post('/api/auth/verify-otp', authRateLimiter, async (req, res) => {
  const { user_id, otp, type, device_id } = req.body || {};
  if (!user_id || !otp) {
    return res.status(400).json({ success: false, error: 'User ID dan kode OTP wajib diisi.' });
  }

  const targetId = String(user_id);
  const success = verifyUserOtp(targetId, String(otp), type === 'whatsapp' ? 'whatsapp' : 'email');
  if (success) {
    if (device_id && typeof device_id === 'string' && device_id.length <= 128) {
      updateUser(targetId, { last_login_device: device_id });
    }
    const updatedUser = getUserById(targetId);
    if (updatedUser) {
      await pushUserToMysql(updatedUser).catch(() => {});
      if (updatedUser.is_active && updatedUser.email_verified) {
        issueSessionCookies(req, res, updatedUser);
      }
    }
    const user = sanitizeUserForClient(updatedUser);
    res.json({ success: true, message: 'Verifikasi berhasil! Akun Anda kini aktif.', user, data: user });
  } else {
    res.status(400).json({ success: false, error: 'Kode OTP tidak cocok, sudah kadaluarsa, atau terkunci.' });
  }
});

app.post('/api/auth/resend-otp', authRateLimiter, async (req, res) => {
  const { user_id, method } = req.body || {};
  const user = getUserById(String(user_id || ''));
  if (!user) return res.status(404).json({ success: false, error: 'Pengguna tidak ditemukan.' });

  const targetMethod = method === 'whatsapp' ? 'whatsapp' : 'email';
  const cooldownKey = `resend_${user.id}_${targetMethod}`;
  const cooldownCheck = checkOtpCooldown(cooldownKey, 30);
  if (!cooldownCheck.allowed) {
    return res.status(429).json({
      success: false,
      cooldown_seconds: cooldownCheck.remaining,
      error: `Mohon tunggu ${cooldownCheck.remaining} detik lagi sebelum mengirim ulang kode OTP baru.`
    });
  }

  const newOtp = generateOtpCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const updated = updateUser(user.id, {
    verification_otp: newOtp,
    otp_expires_at: expiresAt,
    otp_failed_attempts: 0
  });
  if (updated) {
    await pushUserToMysql(updated).catch(() => {});
  }
  const wl = getWhitelabelConfig();

  if (targetMethod === 'email') {
    const emailRes = await sendVerificationOtpEmail(user.email, user.name || user.username, newOtp).catch((e: any) => ({
      success: false,
      error: e?.message
    }));
    if (!emailRes.success) {
      return res.status(500).json({ success: false, error: `Gagal mengirim email OTP: ${emailRes.error || 'Periksa konfigurasi SMTP'}` });
    }
    return res.json({
      success: true,
      cooldown_seconds: 30,
      message: `Kode OTP 6 digit baru telah dikirimkan ke alamat email ${user.email}.`,
      user: sanitizeUserForClient(updated)
    });
  }

  if (!user.phone) {
    return res.status(400).json({ success: false, error: 'Nomor WhatsApp pengguna belum diatur.' });
  }

  const msg = `Halo *${user.name}*! 👋\n\nKode OTP rahasia verifikasi WhatsApp *${wl.app_name || 'Japriin'}* Anda adalah:\n\n*${newOtp}*\n\nJangan bagikan kode ini kepada siapa pun. Silakan masukkan kode ini di aplikasi untuk memverifikasi akun Anda.`;
  const waRes = await sendSystemWhatsAppNotification(user.phone, msg, {
    category: 'system_otp',
    ownerUserId: user.id
  }).catch(e => {
    console.error('Resend WA Error:', e);
    return { sent: false, queued: false };
  });

  res.json({
    success: true,
    cooldown_seconds: 30,
    queued: waRes.queued,
    message: waRes.sent
      ? 'Kode OTP rahasia baru telah dikirimkan langsung oleh WA Superadmin ke nomor WhatsApp Anda.'
      : 'WA Superadmin belum terhubung. Kode OTP baru telah masuk ke antrean dan akan dikirim perlahan saat WA Superadmin login.',
    user: sanitizeUserForClient(updated)
  });
});

app.post('/api/auth/forgot-password/request', authRateLimiter, async (req, res) => {
  const { identifier, method } = req.body || {};
  if (!identifier) return res.status(400).json({ success: false, error: 'Username, Email, atau No. WhatsApp wajib diisi.' });

  const users = getUsers();
  const clean = String(identifier).toLowerCase().trim();
  const cleanDigits = String(identifier).replace(/\D/g, '');
  const normDigits = cleanDigits.startsWith('0') ? '62' + cleanDigits.slice(1) : cleanDigits;

  const user = users.find(u => {
    if (u.id === identifier) return true;
    if (u.username.toLowerCase() === clean) return true;
    if (u.email.toLowerCase() === clean) return true;
    if (cleanDigits.length >= 8 && u.phone) {
      const uDigits = u.phone.replace(/\D/g, '');
      const uNorm = uDigits.startsWith('0') ? '62' + uDigits.slice(1) : uDigits;
      if (uDigits === cleanDigits || uNorm === normDigits) return true;
    }
    return false;
  });

  if (!user) {
    return res.status(404).json({ success: false, error: 'Akun dengan identitas tersebut tidak ditemukan.' });
  }

  const selectedMethod = method === 'email' ? 'email' : 'whatsapp';
  if (selectedMethod === 'email' && !user.email_verified) {
    return res.status(400).json({
      success: false,
      error: 'Alamat email pada akun ini belum diverifikasi. Gunakan metode verifikasi WhatsApp.'
    });
  }
  if (selectedMethod === 'whatsapp' && !user.phone) {
    return res.status(400).json({
      success: false,
      error: 'Nomor WhatsApp pada akun ini belum terdaftar.'
    });
  }

  const cooldownKey = `forgot_${user.id}_${selectedMethod}`;
  const cooldownCheck = checkOtpCooldown(cooldownKey, 30);
  if (!cooldownCheck.allowed) {
    return res.status(429).json({
      success: false,
      cooldown_seconds: cooldownCheck.remaining,
      error: `Mohon tunggu ${cooldownCheck.remaining} detik lagi sebelum meminta kode OTP reset password baru.`
    });
  }

  const resetOtp = generateOtpCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  updateUser(user.id, { verification_otp: resetOtp, otp_expires_at: expiresAt, otp_failed_attempts: 0 });
  const wl = getWhitelabelConfig();

  if (selectedMethod === 'email') {
    const emailRes = await sendPasswordResetEmail(user.email, user.username, resetOtp);
    if (!emailRes.success) {
      return res.status(500).json({
        success: false,
        error: `Gagal mengirim kode OTP ke email: ${emailRes.error || 'Pastikan akun SMTP sudah aktif'}`
      });
    }
    return res.json({
      success: true,
      cooldown_seconds: 30,
      message: 'Kode OTP rahasia untuk ganti/reset password telah dikirim ke alamat email terverifikasi Anda.',
      user_id: user.id,
      method: 'email'
    });
  }

  const msg = `🔐 *RESET PASSWORD ${(wl.app_name || 'JAPRIIN').toUpperCase()}*\n\nHalo *${user.name}* (@${user.username}),\nKami menerima permintaan untuk mengganti/mereset password akun Anda.\n\nKode OTP rahasia Anda adalah:\n\n*${resetOtp}*\n\nJangan bagikan kode ini kepada siapa pun. Kode berlaku selama 15 menit.`;
  let waRes = { sent: false, queued: false };
  if (user.phone) {
    waRes = await sendSystemWhatsAppNotification(user.phone, msg, {
      category: 'password_reset',
      ownerUserId: user.id
    }).catch(e => {
      console.error('Forgot WA Error:', e);
      return { sent: false, queued: false };
    });
  }

  res.json({
    success: true,
    cooldown_seconds: 30,
    queued: waRes.queued,
    message: waRes.sent
      ? 'Kode OTP rahasia untuk reset password telah dikirimkan oleh WhatsApp Superadmin ke nomor terdaftar Anda.'
      : 'WhatsApp Superadmin belum login. Kode OTP reset password telah dimasukkan ke antrean dan akan dikirim perlahan secara otomatis saat WA Superadmin login.',
    user_id: user.id,
    method: 'whatsapp'
  });
});

app.post('/api/auth/forgot-password/reset', authRateLimiter, (req, res) => {
  const { identifier, otp, new_password } = req.body || {};
  if (!identifier || !otp || !new_password) {
    return res.status(400).json({ success: false, error: 'Semua kolom wajib diisi.' });
  }
  if (String(new_password).length < 8) {
    return res.status(400).json({ success: false, error: 'Password baru minimal 8 karakter.' });
  }

  const success = resetPasswordWithOtp(String(identifier), String(otp), String(new_password));
  if (success) {
    res.json({ success: true, message: 'Password berhasil direset! Silakan login dengan password baru Anda.' });
  } else {
    res.status(400).json({ success: false, error: 'Kode OTP tidak cocok, sudah kadaluarsa, atau terkunci.' });
  }
});

// =============================================================
// 3. DASHBOARD MANAGEMENT API ENDPOINTS (AUTHENTICATED + SCOPED)
// =============================================================

app.get('/api/messages', requireAuth, (req, res) => {
  const userId = resolveEffectiveUserId(req, req.query.userId as string);
  const messages = getMessageLogs(userId);
  res.json({ success: true, count: messages.length, retention_days: 7, data: messages });
});

app.delete('/api/messages', requireAuth, (req, res) => {
  const userId = resolveEffectiveUserId(req, req.query.userId as string);
  clearMessageLogs(userId);
  res.json({ success: true, message: 'Riwayat pesan berhasil dibersihkan.' });
});

app.get('/api/broadcast/history', requireAuth, (req, res) => {
  const userId = resolveEffectiveUserId(req, req.query.userId as string);
  const history = getBroadcastHistory(userId);
  res.json({ success: true, count: history.length, retention_days: 7, data: history });
});

app.post('/api/broadcast/history', requireAuth, (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  const { session_id, recipients_count, message, status, success_count, failed_count, scheduled_at } = req.body || {};
  const cleanSessionId = session_id ? String(session_id).trim() : undefined;
  if (cleanSessionId && !canAccessSession(authUser, cleanSessionId)) {
    return res.status(403).json({ success: false, error: 'Akses ditolak ke sesi tersebut.' });
  }
  const allowedStatuses = ['completed', 'scheduled', 'running', 'failed'] as const;
  const cleanStatus = allowedStatuses.includes(status) ? status : 'completed';
  const saved = addBroadcastHistory({
    user_id: authUser.id,
    session_id: cleanSessionId,
    recipients_count: Math.min(10000, Math.max(0, Number(recipients_count) || 0)),
    message: String(message || '').slice(0, 4000),
    status: cleanStatus,
    success_count: Math.min(10000, Math.max(0, Number(success_count) || 0)),
    failed_count: Math.min(10000, Math.max(0, Number(failed_count) || 0)),
    scheduled_at: typeof scheduled_at === 'string' ? scheduled_at.slice(0, 64) : undefined
  });
  res.json({ success: true, data: saved });
});

app.delete('/api/broadcast/history', requireAuth, (req, res) => {
  const userId = resolveEffectiveUserId(req, req.query.userId as string);
  clearBroadcastHistory(userId);
  res.json({ success: true, message: 'Riwayat broadcast berhasil dibersihkan.' });
});

app.get('/api/stats', requireAuth, (req, res) => {
  const userId = resolveEffectiveUserId(req, req.query.userId as string);
  const stats = getBotStats(userId);
  res.json({ success: true, data: stats });
});

app.get('/api/rules', requireAuth, (_req, res) => {
  res.json({ success: true, count: 0, data: [] });
});

app.post('/api/rules', requireAuth, (_req, res) => {
  res.status(410).json({
    success: false,
    error: 'Fitur aturan kata kunci telah dihapus. Semua pesan masuk kini ditangani langsung oleh Meta AI.'
  });
});

app.put('/api/rules/:id/toggle', requireAuth, (_req, res) => {
  res.status(410).json({
    success: false,
    error: 'Fitur aturan kata kunci telah dihapus. Semua pesan masuk kini ditangani langsung oleh Meta AI.'
  });
});

app.delete('/api/rules/:id', requireAuth, (_req, res) => {
  res.status(410).json({
    success: false,
    error: 'Fitur aturan kata kunci telah dihapus.'
  });
});

// =============================================================
// 3B. MULTI-TENANT MINI SHOP / PRODUCT CATALOG & IMAGE HOSTING
// =============================================================

const CATALOG_UPLOAD_DIR = path.resolve(process.cwd(), 'uploads', 'catalog');
const MAX_CATALOG_IMAGE_BYTES = 1.5 * 1024 * 1024; // 1.5 MB
const MIN_CATALOG_IMAGE_BYTES = 100;
const SAFE_CATALOG_FILENAME_RE = /^(?:prod|qris)_[a-f0-9-]+\.(png|jpg|webp|gif)$/i;

function hasValidCatalogImageMagicBytes(buf: Buffer, mimeType: string): boolean {
  if (buf.length < 12) return false;
  if (mimeType === 'image/png') {
    return (
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a
    );
  }
  if (mimeType === 'image/jpeg') {
    return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }
  if (mimeType === 'image/webp') {
    return buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  }
  if (mimeType === 'image/gif') {
    const hdr = buf.toString('ascii', 0, 6);
    return hdr === 'GIF87a' || hdr === 'GIF89a';
  }
  return false;
}

function getRequestFallbackOrigin(req: express.Request): string | undefined {
  const rawHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (!rawHost || !/^[a-zA-Z0-9.-]+(:\d{1,5})?$/.test(rawHost) || isBlockedSsrfHost(rawHost)) {
    return undefined;
  }
  return `${isHttpsRequest(req) ? 'https' : 'http'}://${rawHost}`;
}

function cleanupUnreferencedCatalogImage(imageUrl?: string) {
  if (!imageUrl || !imageUrl.startsWith('/api/catalog/images/')) return;
  const filename = path.basename(imageUrl);
  if (!SAFE_CATALOG_FILENAME_RE.test(filename)) return;
  if (isLocalCatalogImageReferenced(filename)) return;
  const targetPath = path.resolve(CATALOG_UPLOAD_DIR, filename);
  if (!targetPath.startsWith(CATALOG_UPLOAD_DIR + path.sep)) return;
  try {
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
  } catch {
    // Non-fatal cleanup
  }
}

function isValidCatalogProductImageUrl(rawUrl: unknown): boolean {
  if (rawUrl === undefined || rawUrl === null || rawUrl === '') return true;
  const s = String(rawUrl).trim();
  if (!s) return true;
  if (s.startsWith('/api/catalog/images/')) {
    const filename = s.slice('/api/catalog/images/'.length);
    return SAFE_CATALOG_FILENAME_RE.test(filename);
  }
  return isSafeHttpUrl(s);
}

// Public read endpoint for uploaded product photos so Meta AI / WhatsApp customers can open the link
app.get('/api/catalog/images/:filename', (req, res) => {
  const filename = String(req.params.filename || '').trim();
  if (!SAFE_CATALOG_FILENAME_RE.test(filename)) {
    return res.status(400).json({ success: false, error: 'Nama file gambar tidak valid.' });
  }

  const filePath = path.resolve(CATALOG_UPLOAD_DIR, filename);
  if (!filePath.startsWith(CATALOG_UPLOAD_DIR + path.sep)) {
    return res.status(403).json({ success: false, error: 'Akses file ditolak.' });
  }

  try {
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Gambar produk tidak ditemukan.' });
    }
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return res.status(404).json({ success: false, error: 'Gambar produk tidak ditemukan.' });
    }
    const ext = path.extname(filename).toLowerCase();
    const contentType =
      ext === '.png'
        ? 'image/png'
        : ext === '.webp'
          ? 'image/webp'
          : ext === '.gif'
            ? 'image/gif'
            : 'image/jpeg';

    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.sendFile(filePath);
  } catch {
    return res.status(500).json({ success: false, error: 'Gagal memuat gambar produk.' });
  }
});

app.get('/api/catalog', requireAuth, (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  const fallbackOrigin = getRequestFallbackOrigin(req);
  const publicBaseUrl = resolvePublicAppBaseUrl(fallbackOrigin);
  const { settings, products } = getCatalogForUser(authUser.id);
  const enrichedProducts = products.map(p => ({
    ...p,
    public_image_url: resolveProductImagePublicUrl(p.image_url, fallbackOrigin)
  }));
  const enrichedSettings = {
    ...settings,
    public_qris_image_url: resolveProductImagePublicUrl(settings.qris_image_url, fallbackOrigin),
    effective_order_notify_phone: resolveOrderNotificationRecipientPhone(authUser.id)
  };
  res.json({
    success: true,
    public_base_url: publicBaseUrl,
    superadmin_wa_queue_count: authUser.role === 'admin' ? getSuperadminWaQueue().length : undefined,
    data: { settings: enrichedSettings, products: enrichedProducts }
  });
});

app.put('/api/catalog/settings', requireAuth, (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  const body = req.body || {};
  const prevCatalog = getCatalogForUser(authUser.id).settings;
  const updates: {
    enabled?: boolean;
    shop_name?: string;
    bank_accounts?: Array<{ id: string; bank_name: string; account_number: string; account_holder: string }>;
    payment_notes?: string;
    qris_image_url?: string | null;
    order_notify_phone?: string | null;
  } = {};

  if (typeof body.enabled === 'boolean') updates.enabled = body.enabled;
  if (typeof body.shop_name === 'string') updates.shop_name = body.shop_name.trim().slice(0, 80);
  if (typeof body.payment_notes === 'string') updates.payment_notes = body.payment_notes.trim().slice(0, 1000);

  if (body.order_notify_phone !== undefined) {
    const rawNotifyPhone = typeof body.order_notify_phone === 'string' ? body.order_notify_phone.trim() : '';
    if (rawNotifyPhone) {
      const normalizedNotifyPhone = normalizePhoneNumber(rawNotifyPhone);
      if (!normalizedNotifyPhone || normalizedNotifyPhone.length < 8 || normalizedNotifyPhone.length > 16) {
        return res.status(400).json({
          success: false,
          error: 'Nomor WhatsApp tujuan orderan tidak valid (gunakan minimal 8 digit angka, contoh: 0812... atau 62812...).'
        });
      }
      updates.order_notify_phone = normalizedNotifyPhone;
    } else {
      updates.order_notify_phone = null;
    }
  }

  if (body.bank_accounts !== undefined) {
    if (!Array.isArray(body.bank_accounts) || body.bank_accounts.length > 10) {
      return res.status(400).json({ success: false, error: 'Daftar rekening maksimal 10 akun dan harus berupa array.' });
    }
    updates.bank_accounts = body.bank_accounts
      .filter((item: any) => item && typeof item === 'object')
      .map((item: any) => ({
        id: typeof item.id === 'string' && item.id.trim() ? item.id.trim().slice(0, 48) : `bank_${crypto.randomBytes(4).toString('hex')}`,
        bank_name: String(item.bank_name || '').trim().slice(0, 50),
        account_number: String(item.account_number || '').trim().slice(0, 50),
        account_holder: String(item.account_holder || '').trim().slice(0, 80)
      }))
      .filter((acc: any) => acc.bank_name || acc.account_number);
  }

  if (body.qris_image_url !== undefined) {
    const cleanQris = typeof body.qris_image_url === 'string' ? body.qris_image_url.trim() : '';
    if (cleanQris && !isValidCatalogProductImageUrl(cleanQris)) {
      return res.status(400).json({
        success: false,
        error: 'URL gambar QRIS tidak valid. Upload file gambar atau gunakan URL https:// yang aman.'
      });
    }
    updates.qris_image_url = cleanQris || null;
  }

  const settings = updateCatalogSettings(authUser.id, updates);
  if (prevCatalog.qris_image_url && prevCatalog.qris_image_url !== settings.qris_image_url) {
    cleanupUnreferencedCatalogImage(prevCatalog.qris_image_url);
  }

  const fallbackOrigin = getRequestFallbackOrigin(req);
  res.json({
    success: true,
    message: 'Pengaturan Mini Shop & Metode Pembayaran berhasil disimpan.',
    data: {
      ...settings,
      public_qris_image_url: resolveProductImagePublicUrl(settings.qris_image_url, fallbackOrigin),
      effective_order_notify_phone: resolveOrderNotificationRecipientPhone(authUser.id)
    }
  });
});

app.post('/api/catalog/upload-image', requireAuth, (req, res) => {
  const raw = req.body?.image_data;
  if (typeof raw !== 'string' || !raw.trim()) {
    return res.status(400).json({ success: false, error: 'File gambar tidak ditemukan.' });
  }

  const match = raw.trim().match(/^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) {
    return res.status(400).json({
      success: false,
      error: 'Format gambar harus PNG, JPG, WEBP, atau GIF.'
    });
  }

  const rawMime = match[1].toLowerCase();
  const normalizedMime = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime;
  const b64Payload = match[2].replace(/\s+/g, '');
  if (b64Payload.length > MAX_CATALOG_IMAGE_BYTES * 1.45) {
    return res.status(400).json({
      success: false,
      error: 'Ukuran gambar terlalu besar. Maksimal 1,5 MB.'
    });
  }

  const buf = Buffer.from(b64Payload, 'base64');
  if (buf.length < MIN_CATALOG_IMAGE_BYTES || buf.length > MAX_CATALOG_IMAGE_BYTES) {
    return res.status(400).json({
      success: false,
      error: 'Ukuran file gambar harus antara 100 byte hingga 1,5 MB.'
    });
  }

  if (!hasValidCatalogImageMagicBytes(buf, normalizedMime)) {
    return res.status(400).json({
      success: false,
      error: 'Signature file gambar tidak valid atau file rusak.'
    });
  }

  const ext =
    normalizedMime === 'image/png'
      ? 'png'
      : normalizedMime === 'image/webp'
        ? 'webp'
        : normalizedMime === 'image/gif'
          ? 'gif'
          : 'jpg';
  const purpose = req.body?.purpose === 'qris' ? 'qris' : 'prod';
  const filename = `${purpose}_${crypto.randomUUID()}.${ext}`;
  const filePath = path.resolve(CATALOG_UPLOAD_DIR, filename);
  if (!filePath.startsWith(CATALOG_UPLOAD_DIR + path.sep)) {
    return res.status(500).json({ success: false, error: 'Path penyimpanan tidak valid.' });
  }

  try {
    if (!fs.existsSync(CATALOG_UPLOAD_DIR)) {
      fs.mkdirSync(CATALOG_UPLOAD_DIR, { recursive: true, mode: 0o700 });
    }
    fs.writeFileSync(filePath, buf, { mode: 0o600 });
    const relativeUrl = `/api/catalog/images/${filename}`;
    const publicUrl = resolveProductImagePublicUrl(relativeUrl, getRequestFallbackOrigin(req)) || relativeUrl;

    return res.json({
      success: true,
      relative_url: relativeUrl,
      public_url: publicUrl,
      size_bytes: buf.length
    });
  } catch {
    return res.status(500).json({ success: false, error: 'Gagal menyimpan file gambar produk.' });
  }
});

app.post('/api/catalog/products', requireAuth, (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  const { title, description, price, image_url, is_active } = req.body || {};

  const cleanTitle = typeof title === 'string' ? title.trim() : '';
  if (!cleanTitle || cleanTitle.length > 120) {
    return res.status(400).json({ success: false, error: 'Judul produk wajib diisi (maksimal 120 karakter).' });
  }

  const cleanDesc = typeof description === 'string' ? description.trim().slice(0, 600) : '';
  const numPrice = price === undefined || price === null || price === '' ? 0 : Number(price);
  if (!Number.isFinite(numPrice) || numPrice < 0 || numPrice > 1_000_000_000) {
    return res.status(400).json({ success: false, error: 'Harga produk harus berupa angka valid (>= 0).' });
  }

  const cleanImageUrl = typeof image_url === 'string' ? image_url.trim() : '';
  if (cleanImageUrl && !isValidCatalogProductImageUrl(cleanImageUrl)) {
    return res.status(400).json({
      success: false,
      error: 'Link foto produk tidak valid. Gunakan upload gambar atau URL https:// yang aman.'
    });
  }

  try {
    const created = addCatalogProduct(authUser.id, {
      title: cleanTitle,
      description: cleanDesc,
      price: Math.round(numPrice),
      image_url: cleanImageUrl || undefined,
      is_active: is_active !== undefined ? Boolean(is_active) : true
    });
    const fallbackOrigin = getRequestFallbackOrigin(req);
    return res.json({
      success: true,
      message: 'Produk berhasil ditambahkan ke katalog!',
      data: {
        ...created,
        public_image_url: resolveProductImagePublicUrl(created.image_url, fallbackOrigin)
      }
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message || 'Gagal menambah produk.' });
  }
});

app.put('/api/catalog/products/:id', requireAuth, (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  const body = req.body || {};
  const updates: {
    title?: string;
    description?: string;
    price?: number;
    image_url?: string | null;
    is_active?: boolean;
  } = {};

  if (body.title !== undefined) {
    const cleanTitle = typeof body.title === 'string' ? body.title.trim() : '';
    if (!cleanTitle || cleanTitle.length > 120) {
      return res.status(400).json({ success: false, error: 'Judul produk wajib diisi (maksimal 120 karakter).' });
    }
    updates.title = cleanTitle;
  }
  if (body.description !== undefined) {
    updates.description = typeof body.description === 'string' ? body.description.trim().slice(0, 600) : '';
  }
  if (body.price !== undefined) {
    const numPrice = Number(body.price);
    if (!Number.isFinite(numPrice) || numPrice < 0 || numPrice > 1_000_000_000) {
      return res.status(400).json({ success: false, error: 'Harga produk tidak valid.' });
    }
    updates.price = Math.round(numPrice);
  }
  if (body.image_url !== undefined) {
    const cleanImageUrl = typeof body.image_url === 'string' ? body.image_url.trim() : '';
    if (cleanImageUrl && !isValidCatalogProductImageUrl(cleanImageUrl)) {
      return res.status(400).json({
        success: false,
        error: 'Link foto produk tidak valid. Gunakan upload gambar atau URL https:// yang aman.'
      });
    }
    updates.image_url = cleanImageUrl || null;
  }
  if (typeof body.is_active === 'boolean') {
    updates.is_active = body.is_active;
  }

  const result = updateCatalogProduct(req.params.id, authUser.id, updates);
  if (!result) {
    return res.status(404).json({ success: false, error: 'Produk tidak ditemukan atau Anda tidak memiliki akses.' });
  }

  if (result.previousImageUrl && result.previousImageUrl !== result.product.image_url) {
    cleanupUnreferencedCatalogImage(result.previousImageUrl);
  }

  const fallbackOrigin = getRequestFallbackOrigin(req);
  res.json({
    success: true,
    message: 'Produk berhasil diperbarui!',
    data: {
      ...result.product,
      public_image_url: resolveProductImagePublicUrl(result.product.image_url, fallbackOrigin)
    }
  });
});

app.delete('/api/catalog/products/:id', requireAuth, (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  const deleted = deleteCatalogProduct(req.params.id, authUser.id);
  if (!deleted) {
    return res.status(404).json({ success: false, error: 'Produk tidak ditemukan atau Anda tidak memiliki akses.' });
  }
  if (deleted.image_url) {
    cleanupUnreferencedCatalogImage(deleted.image_url);
  }
  res.json({ success: true, message: 'Produk berhasil dihapus dari katalog.' });
});

// =============================================================
// 4. PUBLIC CATALOG / WHITELABEL READ + SUPERADMIN MUTATIONS
// =============================================================

app.get('/api/whitelabel', (_req, res) => {
  res.json({ success: true, data: getWhitelabelConfig() });
});

app.post('/api/whitelabel', requireMasterUnlocked, (req, res) => {
  const body = req.body || {};
  if (body.logo_url !== undefined && !isSafeImageUrl(body.logo_url)) {
    return res.status(400).json({ success: false, error: 'URL Logo tidak valid atau berpotensi tidak aman.' });
  }
  const safeUpdates: Record<string, any> = {};
  if (typeof body.app_name === 'string') safeUpdates.app_name = body.app_name.trim().slice(0, 80);
  if (typeof body.tagline === 'string') safeUpdates.tagline = body.tagline.trim().slice(0, 200);
  if (typeof body.logo_url === 'string') safeUpdates.logo_url = body.logo_url.trim();
  if (typeof body.company_name === 'string') safeUpdates.company_name = body.company_name.trim().slice(0, 120);
  if (typeof body.support_phone === 'string') safeUpdates.support_phone = body.support_phone.trim().slice(0, 30);
  if (typeof body.primary_bot_phone === 'string') safeUpdates.primary_bot_phone = body.primary_bot_phone.trim().slice(0, 30);
  if (typeof body.primary_bot_name === 'string') safeUpdates.primary_bot_name = body.primary_bot_name.trim().slice(0, 80);
  if (typeof body.footer_text === 'string') safeUpdates.footer_text = body.footer_text.trim().slice(0, 200);
  if (typeof body.api_enabled === 'boolean') safeUpdates.api_enabled = body.api_enabled;

  const updated = updateWhitelabelConfig(safeUpdates);
  res.json({ success: true, message: 'Informasi brand aplikasi berhasil disimpan!', data: updated });
});

app.get('/api/plans', (_req, res) => {
  const sysConfig = getSystemConfig();
  res.json({
    success: true,
    data: getSubscriptionPlans(),
    free_auto_reply_hours: 0,
    max_global_sessions: getMaxGlobalSessions(sysConfig),
    slot_status: getGlobalSlotStatus(sysConfig)
  });
});

app.post('/api/superadmin/max-sessions', requireMasterUnlocked, (req, res) => {
  const parsed = normalizeMaxGlobalSessions(req.body?.max_global_sessions);
  if (parsed === null) {
    return res.status(400).json({
      success: false,
      error: 'Kapasitas maksimal nomor WhatsApp global harus berupa bilangan bulat antara 1 hingga 10.000.'
    });
  }
  const updatedSys = updateSystemConfig({ max_global_sessions: parsed });
  const effectiveMax = getMaxGlobalSessions(updatedSys);
  const slotStatus = getGlobalSlotStatus(updatedSys);
  res.json({
    success: true,
    max_global_sessions: effectiveMax,
    slot_status: slotStatus,
    message: `Kapasitas maksimal nomor WhatsApp global berhasil diatur ke ${effectiveMax} sesi!`
  });
});

app.post('/api/superadmin/free-auto-reply-hours', requireMasterUnlocked, (_req, res) => {
  const updatedSys = updateSystemConfig({ free_auto_reply_hours: 0 });
  res.json({
    success: true,
    free_auto_reply_hours: getFreeAutoReplyHours(updatedSys),
    message: 'Paket Gratis kini menikmati respon otomatis penuh tanpa batas waktu.'
  });
});

app.post('/api/plans', requireMasterUnlocked, (req, res) => {
  const { id, name, price, period, daily_msg_limit, monthly_msg_limit, daily_ai_limit, monthly_ai_limit, features, popular } = req.body || {};
  if (!id || !name || price === undefined) {
    return res.status(400).json({ success: false, error: 'ID, Nama Paket, dan Harga wajib diisi.' });
  }
  const numPrice = Number(price);
  if (!Number.isFinite(numPrice) || numPrice < 0 || numPrice > 1000000000) {
    return res.status(400).json({ success: false, error: 'Harga paket harus berupa angka valid (>= 0).' });
  }

  const cleanFeatures = Array.isArray(features)
    ? features.map(f => String(f).trim().slice(0, 160)).filter(Boolean).slice(0, 20)
    : ['1 Nomor WhatsApp Terhubung', 'Balas Otomatis Penuh'];

  const newPlan = addSubscriptionPlan({
    id: String(id).toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40),
    name: String(name).trim().slice(0, 80),
    price: numPrice,
    period: String(period || '/ bulan').trim().slice(0, 30),
    max_sessions: 1,
    daily_msg_limit: Math.min(1000000, Math.max(1, Number(daily_msg_limit) || 500)),
    monthly_msg_limit: monthly_msg_limit !== undefined ? Math.min(30000000, Math.max(1, Number(monthly_msg_limit) || 500)) : undefined,
    daily_ai_limit: daily_ai_limit !== undefined ? Math.min(100000, Math.max(0, Number(daily_ai_limit) || 0)) : 50,
    monthly_ai_limit: monthly_ai_limit !== undefined ? Math.min(3000000, Math.max(0, Number(monthly_ai_limit) || 0)) : 1500,
    features: cleanFeatures,
    popular: Boolean(popular),
    is_active: true
  });

  res.json({ success: true, message: 'Paket baru berhasil ditambahkan!', data: newPlan });
});

app.put('/api/plans/:id', requireMasterUnlocked, (req, res) => {
  const body = req.body || {};
  const safeUpdates: Record<string, any> = {
    max_sessions: 1
  };
  if (typeof body.name === 'string') safeUpdates.name = body.name.trim().slice(0, 80);
  if (body.price !== undefined) {
    const p = Number(body.price);
    if (!Number.isFinite(p) || p < 0 || p > 1000000000) {
      return res.status(400).json({ success: false, error: 'Harga paket tidak valid.' });
    }
    safeUpdates.price = p;
  }
  if (typeof body.period === 'string') safeUpdates.period = body.period.trim().slice(0, 30);
  if (body.daily_msg_limit !== undefined) safeUpdates.daily_msg_limit = Math.min(1000000, Math.max(1, Number(body.daily_msg_limit) || 100));
  if (body.monthly_msg_limit !== undefined) safeUpdates.monthly_msg_limit = Math.min(30000000, Math.max(1, Number(body.monthly_msg_limit) || 500));
  if (body.daily_ai_limit !== undefined) safeUpdates.daily_ai_limit = Math.min(100000, Math.max(0, Number(body.daily_ai_limit) || 0));
  if (body.monthly_ai_limit !== undefined) safeUpdates.monthly_ai_limit = Math.min(3000000, Math.max(0, Number(body.monthly_ai_limit) || 0));
  if (Array.isArray(body.features)) {
    safeUpdates.features = body.features.map((f: any) => String(f).trim().slice(0, 160)).filter(Boolean).slice(0, 20);
  }
  if (typeof body.popular === 'boolean') safeUpdates.popular = body.popular;
  if (typeof body.is_active === 'boolean') safeUpdates.is_active = body.is_active;

  const updated = updateSubscriptionPlan(req.params.id, safeUpdates);
  if (!updated) return res.status(404).json({ success: false, error: 'Paket tidak ditemukan.' });
  res.json({ success: true, message: 'Ketentuan paket berhasil diperbarui!', data: updated });
});

app.delete('/api/plans/:id', requireMasterUnlocked, (req, res) => {
  if (req.params.id === 'free') {
    return res.status(400).json({ success: false, error: 'Paket Gratis tidak boleh dihapus!' });
  }
  const deleted = deleteSubscriptionPlan(req.params.id);
  if (!deleted) return res.status(404).json({ success: false, error: 'Paket tidak ditemukan.' });
  res.json({ success: true, message: 'Paket berhasil dihapus.' });
});

app.get('/api/qris', (_req, res) => {
  res.json({ success: true, data: getQrisConfig() });
});

app.post('/api/qris', requireAdmin, (req, res) => {
  const body = req.body || {};
  if (body.image_url !== undefined && !isSafeImageUrl(body.image_url)) {
    return res.status(400).json({ success: false, error: 'URL gambar QRIS tidak valid atau berpotensi tidak aman.' });
  }
  const current = getQrisConfig();
  const safeConfig = {
    ...current,
    ...(typeof body.image_url === 'string' ? { image_url: body.image_url.trim() } : {}),
    ...(typeof body.account_name === 'string' ? { account_name: body.account_name.trim().slice(0, 120) } : {}),
    ...(typeof body.bank_name === 'string' ? { bank_name: body.bank_name.trim().slice(0, 120) } : {}),
    ...(typeof body.account_number === 'string' ? { account_number: body.account_number.trim().slice(0, 120) } : {}),
    ...(typeof body.instructions === 'string' ? { instructions: body.instructions.trim().slice(0, 3000) } : {})
  };
  const updated = updateQrisConfig(safeConfig);
  res.json({ success: true, message: 'Pengaturan QRIS berhasil disimpan!', data: updated });
});

// =============================================================
// 5. META AI WHATSAPP (BAILEYS), SMTP & ANTI-BAN
// =============================================================

const handleDeprecatedGeminiKeysGet = (_req: express.Request, res: express.Response) => {
  res.json({
    success: true,
    deprecated: true,
    engine: 'meta_ai_whatsapp',
    data: []
  });
};

const handleDeprecatedGeminiKeyMutation = (_req: express.Request, res: express.Response) => {
  res.status(410).json({
    success: false,
    error: 'Gemini API Key sudah tidak digunakan. Aplikasi kini menggunakan Meta AI bawaan WhatsApp (Baileys) tanpa API key.'
  });
};

app.get('/api/gemini/keys', requireAdmin, handleDeprecatedGeminiKeysGet);
app.get('/api/gemini-keys', requireAdmin, handleDeprecatedGeminiKeysGet);

app.post('/api/gemini/keys', requireMasterUnlocked, handleDeprecatedGeminiKeyMutation);
app.post('/api/gemini-keys', requireMasterUnlocked, handleDeprecatedGeminiKeyMutation);

app.put('/api/gemini/keys/:id', requireMasterUnlocked, handleDeprecatedGeminiKeyMutation);
app.put('/api/gemini-keys/:id', requireMasterUnlocked, handleDeprecatedGeminiKeyMutation);

app.delete('/api/gemini/keys/:id', requireMasterUnlocked, handleDeprecatedGeminiKeyMutation);
app.delete('/api/gemini-keys/:id', requireMasterUnlocked, handleDeprecatedGeminiKeyMutation);

app.post('/api/gemini/keys/:id/toggle', requireMasterUnlocked, handleDeprecatedGeminiKeyMutation);
app.put('/api/gemini/keys/:id/toggle', requireMasterUnlocked, handleDeprecatedGeminiKeyMutation);
app.post('/api/gemini-keys/:id/toggle', requireMasterUnlocked, handleDeprecatedGeminiKeyMutation);
app.put('/api/gemini-keys/:id/toggle', requireMasterUnlocked, handleDeprecatedGeminiKeyMutation);

function buildLocalAiStatusForUser(
  authUser: UserAccount,
  sysConfig = getSystemConfig(),
  preferredSessionId?: string
) {
  const availability = getMetaAiAvailabilityForUser(authUser.id, preferredSessionId);
  const userDbSessions = getSessionsByUserId(authUser.id).filter(s => s.status !== 'disconnected');
  const arStatus = getUserAutoReplyStatus(authUser, sysConfig);

  const primaryLinked =
    (preferredSessionId ? userDbSessions.find(s => s.id === preferredSessionId) : undefined) ||
    userDbSessions.find(s => s.is_primary) ||
    userDbSessions[0] ||
    null;
  const runtimeInfo = primaryLinked ? getLiveSessionRuntimeStatus(primaryLinked) : null;

  // Trigger non-blocking background self-heal when this node owns a disconnected session with saved creds
  if (
    !availability.connected &&
    primaryLinked &&
    runtimeInfo?.has_registered_creds &&
    !runtimeInfo.conflict_paused &&
    runtimeInfo.runtime_status === 'disconnected' &&
    isSessionOwnedByCurrentAppNode(primaryLinked, sysConfig, authUser)
  ) {
    void ensureConnectedMetaAiSocketForUser(authUser.id, primaryLinked.id).catch(() => null);
  }

  const resolvedPhone = availability.phoneNumber || primaryLinked?.phone_number || null;
  const metaAiVerified = Boolean(
    availability.connected && isPhoneMetaAiVerifiedForUser(authUser, resolvedPhone || undefined)
  );
  return {
    success: true,
    engine: 'meta_ai_whatsapp',
    requires_api_key: false,
    meta_ai_connected: availability.connected,
    meta_ai_verified: metaAiVerified,
    meta_ai_verified_phones: Array.isArray(authUser.meta_ai_verified_phones) ? authUser.meta_ai_verified_phones : [],
    meta_ai_contact_number: '13135550002',
    session_id: availability.sessionId || primaryLinked?.id || null,
    phone_number: availability.phoneNumber || null,
    linked_sessions_count: userDbSessions.length,
    linked_session_phone: primaryLinked?.phone_number || null,
    session_runtime_status: availability.connected
      ? 'connected'
      : runtimeInfo?.runtime_status || 'disconnected',
    has_registered_creds: Boolean(runtimeInfo?.has_registered_creds),
    queue_depth: availability.activeQueueDepth,
    meta_ai_jid: availability.metaAiJid,
    last_error: availability.lastError || null,
    ai_enabled: authUser.role === 'admin' ? Boolean(sysConfig.ai_config?.enabled) : (authUser.ai_enabled === true),
    fallback_when_no_rule: Boolean(sysConfig.ai_config?.fallback_when_no_rule),
    auto_reply_status: arStatus,
    connected_sessions: authUser.role === 'admin' ? getAllConnectedMetaAiSessions() : undefined
  };
}

app.get('/api/ai/status', requireAuth, async (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  const sysConfig = getSystemConfig();
  const userDbSessions = getSessionsByUserId(authUser.id).filter(s => s.status !== 'disconnected');
  if (userDbSessions.length > 0) {
    await refreshRemoteSessionLeasesIfNeeded(userDbSessions).catch(() => {});
  }

  const primaryLinked = userDbSessions.find(s => s.is_primary) || userDbSessions[0] || null;
  const localPayload = buildLocalAiStatusForUser(authUser, sysConfig, primaryLinked?.id);
  if (localPayload.meta_ai_connected || !primaryLinked) {
    return res.json(localPayload);
  }

  const peer = await resolveTargetClusterPeerForSession({
    userId: authUser.id,
    sessionId: primaryLinked.id
  });
  if (!peer.localOwned && peer.targetOrigin) {
    const rpc = await callClusterPeerRpc({
      targetOrigin: peer.targetOrigin,
      action: 'ai_status',
      payload: {
        user_id: authUser.id,
        session_id: peer.sessionId || primaryLinked.id
      },
      timeoutMs: 8000
    });
    if (rpc.ok && rpc.data?.success) {
      const remotePhone = rpc.data.phone_number || primaryLinked.phone_number || undefined;
      const remoteConnected = Boolean(rpc.data.meta_ai_connected);
      return res.json({
        ...localPayload,
        meta_ai_connected: remoteConnected,
        meta_ai_verified: Boolean(remoteConnected && isPhoneMetaAiVerifiedForUser(authUser, remotePhone)),
        session_id: rpc.data.session_id || localPayload.session_id,
        phone_number: rpc.data.phone_number || localPayload.phone_number,
        session_runtime_status: remoteConnected
          ? 'connected'
          : (rpc.data.session_runtime_status || localPayload.session_runtime_status),
        queue_depth: Number(rpc.data.queue_depth || 0),
        meta_ai_jid: rpc.data.meta_ai_jid || localPayload.meta_ai_jid,
        last_error: rpc.data.last_error ?? localPayload.last_error
      });
    }
  }

  res.json(localPayload);
});

app.post('/api/ai/verify', requireAuth, async (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  const cooldown = checkOtpCooldown(`meta_ai_verify_${authUser.id}`, 5);
  if (!cooldown.allowed) {
    return res.status(429).json({
      success: false,
      verified: false,
      cooldown_seconds: cooldown.remaining,
      message: `Mohon tunggu ${cooldown.remaining} detik sebelum menguji verifikasi Meta AI lagi.`
    });
  }

  let validatedSessionId: string | undefined;
  if (typeof req.body?.session_id === 'string' && req.body.session_id.trim()) {
    try {
      const candidateId = sanitizeSessionId(req.body.session_id.trim());
      if (!canAccessSession(authUser, candidateId)) {
        return res.status(403).json({
          success: false,
          verified: false,
          message: 'Sesi WhatsApp tersebut bukan milik akun Anda.'
        });
      }
      validatedSessionId = candidateId;
    } catch {
      return res.status(400).json({
        success: false,
        verified: false,
        message: 'ID sesi WhatsApp tidak valid.'
      });
    }
  }

  const peer = await resolveTargetClusterPeerForSession({
    userId: authUser.id,
    sessionId: validatedSessionId
  });
  let result: Awaited<ReturnType<typeof verifyAndInitMetaAiForUser>>;
  if (!peer.localOwned && peer.targetOrigin) {
    const rpc = await callClusterPeerRpc({
      targetOrigin: peer.targetOrigin,
      action: 'ai_verify',
      payload: {
        user_id: authUser.id,
        session_id: validatedSessionId || peer.sessionId
      },
      timeoutMs: 30_000
    });
    if (rpc.ok && rpc.data?.result) {
      result = rpc.data.result;
    } else {
      result = await verifyAndInitMetaAiForUser({
        userId: authUser.id,
        sessionId: validatedSessionId
      });
    }
  } else {
    result = await verifyAndInitMetaAiForUser({
      userId: authUser.id,
      sessionId: validatedSessionId
    });
  }

  if (result.verified && result.phoneNumber) {
    markUserMetaAiVerified(authUser.id, result.phoneNumber);
    const shouldAutoEnable = Boolean(req.body?.auto_enable);
    const arCheck = getUserAutoReplyStatus(authUser);
    if (shouldAutoEnable && arCheck.allowed) {
      if (result.sessionId) {
        const verifiedSess = getSessionById(result.sessionId);
        if (verifiedSess && verifiedSess.ai_enabled === false) {
          updateWhatsAppSession(result.sessionId, { ai_enabled: true });
        }
      }
      if (authUser.role === 'admin') {
        const sysConfig = getSystemConfig();
        updateSystemConfig({
          ai_config: {
            ...sysConfig.ai_config,
            enabled: true,
            fallback_when_no_rule: true
          }
        });
      } else {
        updateUser(authUser.id, { ai_enabled: true });
      }
    }
    const freshUser = getUserById(authUser.id);
    if (freshUser) {
      await pushUserToMysql(freshUser).catch(() => {});
    }
    const sysConfig = getSystemConfig();
    return res.json({
      success: true,
      verified: true,
      code: result.code,
      connected: true,
      session_id: result.sessionId || null,
      phone_number: result.phoneNumber,
      has_official_bot_entry: result.hasOfficialBotEntry,
      bot_reply_preview: result.botReplyPreview || null,
      ai_enabled: authUser.role === 'admin' ? Boolean(sysConfig.ai_config?.enabled) : (freshUser?.ai_enabled === true),
      user: sanitizeUserForClient(freshUser),
      message: result.message
    });
  }

  const userDbSessions = getSessionsByUserId(authUser.id).filter(s => s.status !== 'disconnected');
  const primaryLinked = userDbSessions.find(s => s.is_primary) || userDbSessions[0] || null;
  let helpfulMessage = result.message;
  if (result.code === 'WA_NOT_CONNECTED' && primaryLinked) {
    helpfulMessage = `Perangkat +${primaryLinked.phone_number} tercatat di Perangkat Tertaut, namun koneksi WebSocket WhatsApp saat ini terputus atau sesi autentikasi kedaluwarsa. Klik 'Sambungkan Ulang' atau Login Ulang di menu Koneksi WA.`;
  }

  return res.json({
    success: false,
    verified: false,
    code: result.code,
    connected: result.connected,
    session_id: result.sessionId || primaryLinked?.id || null,
    phone_number: result.phoneNumber || null,
    has_linked_session: Boolean(primaryLinked),
    linked_session_phone: primaryLinked?.phone_number || null,
    has_official_bot_entry: result.hasOfficialBotEntry,
    diagnostic_reason: result.diagnosticReason || null,
    meta_ai_contact_number: '13135550002',
    message: helpfulMessage
  });
});

app.get('/api/admin/ai-audit-logs', requireAdmin, (req, res) => {
  const rawLimit = Number(req.query?.limit);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, Math.floor(rawLimit))) : 50;
  const rawLevel = typeof req.query?.level === 'string' ? req.query.level.toUpperCase() : 'ALL';
  const allowedLevels = new Set(['ALL', 'INFO', 'WARN', 'ERROR']);
  const level = (allowedLevels.has(rawLevel) ? rawLevel : 'ALL') as AiAuditLevel | 'ALL';

  const items = getRecentAiAuditLogs({ limit, level });
  res.json({
    success: true,
    log_file: getAiAuditLogRelativePath(),
    count: items.length,
    data: items
  });
});

app.post('/api/gemini/keys/test', requireAdmin, async (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  const result = await testGeminiApiKey(undefined, authUser.id);
  res.json(result);
});

app.post('/api/gemini/test', requireAdmin, async (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  const result = await testGeminiApiKey(undefined, authUser.id);
  res.json(result);
});

const handleSaveAiConfig: express.RequestHandler = async (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  const { enabled, system_prompt, fallback_when_no_rule, temperature, offline_fallback_message } = req.body || {};
  const sysConfig = getSystemConfig();

  let availability = enabled === true ? getMetaAiAvailabilityForUser(authUser.id) : null;
  if (enabled === true && !availability?.connected) {
    await ensureConnectedMetaAiSocketForUser(authUser.id).catch(() => null);
    availability = getMetaAiAvailabilityForUser(authUser.id);
  }
  if (
    enabled === true &&
    (!sysConfig.ai_config?.enabled ||
      (availability?.connected && !isPhoneMetaAiVerifiedForUser(authUser, availability.phoneNumber)))
  ) {
    if (!availability?.connected) {
      const linked = getSessionsByUserId(authUser.id).filter(s => s.status !== 'disconnected');
      const primaryLinked = linked.find(s => s.is_primary) || linked[0] || null;
      return res.status(400).json({
        success: false,
        code: 'WA_NOT_CONNECTED',
        has_linked_session: Boolean(primaryLinked),
        linked_session_phone: primaryLinked?.phone_number || null,
        error: primaryLinked
          ? `Perangkat +${primaryLinked.phone_number} tercatat di Perangkat Tertaut, namun koneksi WebSocket sedang terputus. Klik Sambungkan Ulang atau Login Ulang di menu Koneksi.`
          : 'Hubungkan nomor WhatsApp terlebih dahulu di menu Koneksi sebelum mengaktifkan Meta AI Balas Otomatis.'
      });
    }
    if (!isPhoneMetaAiVerifiedForUser(authUser, availability.phoneNumber)) {
      return res.status(400).json({
        success: false,
        code: 'META_AI_NOT_VERIFIED',
        connected: true,
        phone_number: availability.phoneNumber || null,
        error: 'Nomor WhatsApp ini belum terverifikasi pernah chat dengan Meta AI. Silakan lakukan cek & verifikasi Meta AI terlebih dahulu.'
      });
    }
  }

  const updatedAiConfig = {
    ...sysConfig.ai_config,
    enabled: enabled !== undefined ? Boolean(enabled) : sysConfig.ai_config.enabled,
    system_prompt: system_prompt !== undefined ? String(system_prompt).slice(0, 4000) : sysConfig.ai_config.system_prompt,
    fallback_when_no_rule: fallback_when_no_rule !== undefined ? Boolean(fallback_when_no_rule) : sysConfig.ai_config.fallback_when_no_rule,
    model: 'meta-ai-whatsapp',
    temperature: temperature !== undefined ? Math.min(2, Math.max(0, Number(temperature) || 0.3)) : (sysConfig.ai_config.temperature || 0.3),
    offline_fallback_message: offline_fallback_message !== undefined ? String(offline_fallback_message).slice(0, 2000) : sysConfig.ai_config.offline_fallback_message
  };
  const updatedSys = updateSystemConfig({ ai_config: updatedAiConfig });
  res.json({ success: true, message: 'Pengaturan Meta AI WhatsApp & Pesan Offline berhasil disimpan!', data: updatedSys.ai_config });
};

app.post('/api/gemini/config', requireAdmin, handleSaveAiConfig);
app.post('/api/ai/config', requireAdmin, handleSaveAiConfig);

function sanitizeSmtpForAdmin(acc: ReturnType<typeof getSmtpAccounts>[number]) {
  const decryptedPass = decryptData(acc.pass);
  const passConfigured = Boolean(decryptedPass && decryptedPass.trim().length > 0);
  return {
    id: acc.id,
    name: acc.name,
    host: acc.host,
    port: acc.port,
    secure: acc.secure,
    user: acc.user,
    sender_name: acc.sender_name,
    is_active: acc.is_active,
    success_count: acc.success_count,
    error_count: acc.error_count,
    last_error: acc.last_error,
    last_used_at: acc.last_used_at,
    created_at: acc.created_at,
    pass_configured: passConfigured,
    needs_password_reset: !passConfigured,
    pass_masked: passConfigured ? maskSensitiveString(decryptedPass) : ''
  };
}

app.get('/api/smtp', requireAdmin, (_req, res) => {
  const accounts = getSmtpAccounts().map(sanitizeSmtpForAdmin);
  res.json({ success: true, data: accounts });
});

app.post('/api/smtp', requireMasterUnlocked, async (req, res) => {
  try {
    const { name, host, port, secure, user, pass, sender_name, is_active } = req.body || {};
    const cleanUser = typeof user === 'string' ? user.trim().slice(0, 120) : '';
    const cleanPass = typeof pass === 'string' ? pass.trim() : '';
    if (!cleanUser || !cleanPass) {
      return res.status(400).json({
        success: false,
        error: 'Email pengirim (user) dan App Password (pass) wajib diisi.'
      });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanUser)) {
      return res.status(400).json({ success: false, error: 'Format email pengirim (user) tidak valid.' });
    }
    const cleanHost = String(host || 'smtp.gmail.com').trim().slice(0, 120);
    if (!cleanHost || !/^[a-zA-Z0-9._-]+$/.test(cleanHost) || isBlockedSsrfHost(cleanHost)) {
      return res.status(400).json({ success: false, error: 'Host SMTP tidak valid atau dilarang.' });
    }
    const cleanPort = Number(port) || 587;
    if (!Number.isInteger(cleanPort) || cleanPort < 1 || cleanPort > 65535) {
      return res.status(400).json({ success: false, error: 'Port SMTP tidak valid (1-65535).' });
    }

    const result = await addSmtpAccountAndSync({
      name: String(name || `SMTP (${cleanUser.split('@')[0]})`).trim().slice(0, 120),
      host: cleanHost,
      port: cleanPort,
      secure: cleanPort === 465 ? true : cleanPort === 587 ? false : Boolean(secure),
      user: cleanUser,
      pass: cleanPass,
      sender_name: String(sender_name || getWhitelabelConfig().app_name || 'Japriin').trim().slice(0, 120),
      is_active: is_active !== undefined ? Boolean(is_active) : true
    });

    if (!result.ok || !result.data) {
      return res.status(500).json({
        success: false,
        error: result.error || 'Gagal menyimpan akun SMTP ke database.'
      });
    }

    res.json({
      success: true,
      message: 'Akun SMTP berhasil ditambahkan ke rotasi!',
      data: sanitizeSmtpForAdmin(result.data)
    });
  } catch (err: any) {
    console.error('[SMTP Add Error]', err?.message || err);
    res.status(500).json({ success: false, error: 'Gagal menyimpan akun SMTP.' });
  }
});

const handleUpdateSmtp: express.RequestHandler = async (req, res) => {
  try {
    const raw = req.body || {};
    const safeBody: Record<string, any> = {};

    if (raw.name !== undefined) {
      const cleanName = String(raw.name || '').trim().slice(0, 120);
      if (!cleanName) {
        return res.status(400).json({ success: false, error: 'Nama/Label akun SMTP tidak boleh kosong.' });
      }
      safeBody.name = cleanName;
    }
    if (raw.host !== undefined) {
      const cleanHost = String(raw.host || '').trim().slice(0, 120);
      if (!cleanHost || !/^[a-zA-Z0-9._-]+$/.test(cleanHost) || isBlockedSsrfHost(cleanHost)) {
        return res.status(400).json({ success: false, error: 'Host SMTP tidak valid atau dilarang.' });
      }
      safeBody.host = cleanHost;
    }
    if (raw.port !== undefined) {
      const cleanPort = Number(raw.port);
      if (!Number.isInteger(cleanPort) || cleanPort < 1 || cleanPort > 65535) {
        return res.status(400).json({ success: false, error: 'Port SMTP tidak valid (1-65535).' });
      }
      safeBody.port = cleanPort;
    }
    if (typeof raw.secure === 'boolean') safeBody.secure = raw.secure;
    if (raw.user !== undefined) {
      const cleanUser = String(raw.user || '').trim().slice(0, 120);
      if (!cleanUser || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanUser)) {
        return res.status(400).json({ success: false, error: 'Format email pengirim (user) tidak valid.' });
      }
      safeBody.user = cleanUser;
    }
    if (typeof raw.pass === 'string' && raw.pass.trim() && !raw.pass.includes('****')) {
      safeBody.pass = raw.pass.trim();
    }
    if (raw.sender_name !== undefined) {
      safeBody.sender_name = String(raw.sender_name || '').trim().slice(0, 120);
    }
    if (typeof raw.is_active === 'boolean') safeBody.is_active = raw.is_active;

    const result = await updateSmtpAccountAndSync(req.params.id, safeBody);
    if (result.notFound) {
      return res.status(404).json({ success: false, error: 'Akun SMTP tidak ditemukan.' });
    }
    if (!result.ok || !result.data) {
      return res.status(500).json({ success: false, error: result.error || 'Gagal memperbarui akun SMTP.' });
    }

    res.json({
      success: true,
      message: 'Akun SMTP berhasil diperbarui!',
      data: sanitizeSmtpForAdmin(result.data)
    });
  } catch (err: any) {
    console.error('[SMTP Update Error]', err?.message || err);
    res.status(500).json({ success: false, error: 'Gagal memperbarui akun SMTP.' });
  }
};

app.put('/api/smtp/:id', requireMasterUnlocked, handleUpdateSmtp);
app.patch('/api/smtp/:id', requireMasterUnlocked, handleUpdateSmtp);

const handleToggleSmtp: express.RequestHandler = async (req, res) => {
  try {
    const result = await toggleSmtpAccountAndSync(req.params.id);
    if (result.notFound) {
      return res.status(404).json({ success: false, error: 'Akun SMTP tidak ditemukan.' });
    }
    if (!result.ok || !result.data) {
      return res.status(500).json({ success: false, error: result.error || 'Gagal mengubah status akun SMTP.' });
    }
    res.json({
      success: true,
      message: `Status akun SMTP diubah menjadi ${result.data.is_active ? 'Aktif' : 'Non-Aktif'}.`,
      data: sanitizeSmtpForAdmin(result.data)
    });
  } catch (err: any) {
    console.error('[SMTP Toggle Error]', err?.message || err);
    res.status(500).json({ success: false, error: 'Gagal mengubah status akun SMTP.' });
  }
};

app.put('/api/smtp/:id/toggle', requireMasterUnlocked, handleToggleSmtp);
app.post('/api/smtp/:id/toggle', requireMasterUnlocked, handleToggleSmtp);

app.delete('/api/smtp/:id', requireMasterUnlocked, async (req, res) => {
  try {
    const result = await deleteSmtpAccountAndSync(req.params.id);
    if (result.notFound) {
      return res.status(404).json({ success: false, error: 'Akun SMTP tidak ditemukan.' });
    }
    if (!result.ok) {
      return res.status(500).json({ success: false, error: result.error || 'Gagal menghapus akun SMTP.' });
    }
    res.json({ success: true, message: 'Akun SMTP berhasil dihapus dari rotasi.' });
  } catch (err: any) {
    console.error('[SMTP Delete Error]', err?.message || err);
    res.status(500).json({ success: false, error: 'Gagal menghapus akun SMTP.' });
  }
});

app.post('/api/smtp/test', requireAdmin, async (req, res) => {
  try {
    const { recipient_email, to, account_id, id } = req.body || {};
    const result = await testSmtpAccountConnection({
      accountId: account_id || id,
      recipientEmail: recipient_email || to
    });
    res.json(result);
  } catch {
    res.status(500).json({ success: false, error: 'Gagal menguji koneksi SMTP.' });
  }
});

app.get('/api/antiban', requireAdmin, (_req, res) => {
  res.json({ success: true, data: getAntiBanSettings() });
});

app.post('/api/antiban', requireAdmin, (req, res) => {
  const raw = req.body || {};
  const current = getAntiBanSettings();
  const minDelay = raw.min_delay_seconds !== undefined
    ? Math.min(60, Math.max(1, Number(raw.min_delay_seconds) || 1))
    : current.min_delay_seconds;
  const maxDelay = raw.max_delay_seconds !== undefined
    ? Math.min(120, Math.max(minDelay, Number(raw.max_delay_seconds) || minDelay))
    : Math.max(minDelay, current.max_delay_seconds);

  const safeUpdates = {
    enabled: raw.enabled !== undefined ? Boolean(raw.enabled) : current.enabled,
    min_delay_seconds: minDelay,
    max_delay_seconds: maxDelay,
    typing_simulation: raw.typing_simulation !== undefined ? Boolean(raw.typing_simulation) : current.typing_simulation,
    max_messages_per_minute: raw.max_messages_per_minute !== undefined
      ? Math.min(60, Math.max(1, Number(raw.max_messages_per_minute) || 15))
      : current.max_messages_per_minute,
    daily_quota_per_number: raw.daily_quota_per_number !== undefined
      ? Math.min(100000, Math.max(1, Number(raw.daily_quota_per_number) || 500))
      : current.daily_quota_per_number,
    read_receipt_simulation: raw.read_receipt_simulation !== undefined ? Boolean(raw.read_receipt_simulation) : current.read_receipt_simulation
  };

  const updated = updateAntiBanSettings(safeUpdates);
  res.json({ success: true, message: 'Pengaturan Anti-Ban berhasil disimpan!', data: updated });
});

// Live Test Meta AI Reply Chat Simulation (scoped to authenticated user)
const handleTestAiChat: express.RequestHandler = async (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  const { prompt, session_id } = req.body || {};
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ success: false, error: 'Pesan tes wajib diisi.' });
  }

  let selectedSessionId: string | undefined;
  if (typeof session_id === 'string' && session_id.trim()) {
    try {
      const candidateId = sanitizeSessionId(session_id.trim());
      if (!canAccessSession(authUser, candidateId)) {
        return res.status(403).json({ success: false, error: 'Akses ditolak ke sesi WhatsApp tersebut.' });
      }
      selectedSessionId = candidateId;
    } catch {
      return res.status(400).json({ success: false, error: 'ID sesi WhatsApp tidak valid.' });
    }
  }

  const startTime = Date.now();
  try {
    const peer = await resolveTargetClusterPeerForSession({
      userId: authUser.id,
      sessionId: selectedSessionId
    });
    if (!peer.localOwned && peer.targetOrigin) {
      const rpc = await callClusterPeerRpc({
        targetOrigin: peer.targetOrigin,
        action: 'ai_test_chat',
        payload: {
          user_id: authUser.id,
          session_id: selectedSessionId || peer.sessionId,
          prompt: String(prompt).slice(0, 2000),
          sender_name: authUser.name || 'Uji Coba AI User'
        },
        timeoutMs: 32_000
      });
      if (rpc.ok && rpc.data?.success) {
        const remoteResult = rpc.data;
        if (
          remoteResult.ai_generated &&
          remoteResult.meta_ai_session_phone &&
          !isPhoneMetaAiVerifiedForUser(authUser, remoteResult.meta_ai_session_phone)
        ) {
          markUserMetaAiVerified(authUser.id, remoteResult.meta_ai_session_phone);
        }
        const freshAuthUser = getUserById(authUser.id) || authUser;
        return res.json({
          ...remoteResult,
          meta_ai_verified: Boolean(
            remoteResult.meta_ai_connected &&
              isPhoneMetaAiVerifiedForUser(freshAuthUser, remoteResult.meta_ai_session_phone || undefined)
          ),
          elapsed_ms: Date.now() - startTime
        });
      }
    }

    const result = await simulateAutoReplyForTest({
      senderPhone: '628999000111',
      senderName: authUser.name || 'Uji Coba AI User',
      messageText: String(prompt).slice(0, 2000),
      userId: authUser.id,
      sessionId: selectedSessionId
    });

    const elapsedMs = Date.now() - startTime;
    const availability = getMetaAiAvailabilityForUser(authUser.id, selectedSessionId);
    if (result.ai_generated && availability.phoneNumber && !isPhoneMetaAiVerifiedForUser(authUser, availability.phoneNumber)) {
      markUserMetaAiVerified(authUser.id, availability.phoneNumber);
    }
    const freshAuthUser = getUserById(authUser.id) || authUser;
    const metaAiVerified = Boolean(
      availability.connected && isPhoneMetaAiVerifiedForUser(freshAuthUser, availability.phoneNumber)
    );

    res.json({
      success: true,
      engine: 'meta_ai_whatsapp',
      source: result.source,
      reply: result.reply,
      ai_generated: result.ai_generated,
      ai_enabled: result.ai_enabled,
      matched_rule_id: result.matched_rule_id,
      customer_code: result.customer_code || null,
      media_type: result.media_type || null,
      media_url: result.media_url || null,
      order_verified_paid: Boolean(result.order_verified_paid),
      order_notify_target: result.order_notify_target || null,
      order_notify_status: result.order_notify_status || null,
      fallback_reason: result.ai_error || null,
      session_id: availability.sessionId || selectedSessionId || null,
      meta_ai_connected: availability.connected,
      meta_ai_verified: metaAiVerified,
      meta_ai_session_phone: availability.phoneNumber || null,
      key_count: availability.connected ? 1 : 0,
      elapsed_ms: elapsedMs,
      timestamp: new Date().toISOString()
    });
  } catch {
    res.status(500).json({ success: false, error: 'Gagal memproses simulasi balasan Meta AI.' });
  }
};

app.post('/api/gemini/test-chat', requireAuth, handleTestAiChat);
app.post('/api/ai/test-chat', requireAuth, handleTestAiChat);

// =============================================================
// 6. USER PROFILE, SECURITY PIN & AI CONFIG (STRICT SELF-SCOPE)
// =============================================================

app.post('/api/user/pin', requireAuth, (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  const { pin } = req.body || {};
  if (!pin) return res.status(400).json({ success: false, error: 'PIN wajib diisi.' });
  const result = setUserSecurityPin(authUser.id, String(pin));
  if (!result.success) return res.status(400).json({ success: false, error: result.message });
  res.json(result);
});

app.post('/api/user/pin/verify', requireAuth, (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  const { pin } = req.body || {};
  if (!pin) return res.status(400).json({ success: false, error: 'PIN wajib diisi.' });

  const lockKey = `user_pin:${req.ip}:${authUser.id}`;
  const lockCheck = checkBruteForceLock(lockKey);
  if (lockCheck.locked) {
    return res.status(429).json({
      success: false,
      error: `Terlalu banyak percobaan PIN salah. Tunggu ${lockCheck.remainingSec} detik.`
    });
  }

  const isValid = verifyUserSecurityPin(authUser.id, String(pin));
  if (isValid) {
    clearFailedAttempts(lockKey);
    return res.json({ success: true });
  }
  recordFailedAttempt(lockKey, 5, 15 * 60 * 1000);
  res.status(400).json({ success: false, error: 'PIN salah.' });
});

app.post('/api/user/unlock-bot', requireAuth, (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  const targetUserId = resolveEffectiveUserId(req, req.body?.user_id);
  if (authUser.role !== 'admin' && targetUserId !== authUser.id) {
    return res.status(403).json({ success: false, error: 'Tidak diizinkan.' });
  }
  const user = unlockUserBot(targetUserId);
  if (!user) return res.status(404).json({ success: false, error: 'Pengguna tidak ditemukan.' });
  res.json({ success: true, message: 'Blokir bot WhatsApp berhasil dibuka!', user: sanitizeUserForClient(user) });
});

app.post('/api/user/api-key/regenerate', requireAuth, (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  const newApiKey = generateUserApiKey(authUser.id);
  if (!newApiKey) return res.status(404).json({ success: false, error: 'Pengguna tidak ditemukan.' });
  res.json({ success: true, api_key: newApiKey });
});

app.post('/api/user/custom-gemini-key', requireAuth, (_req, res) => {
  res.status(410).json({
    success: false,
    error: 'Kunci API Gemini Pribadi sudah tidak digunakan. AI berjalan otomatis melalui Meta AI di akun WhatsApp Baileys Anda.'
  });
});

app.delete('/api/user/custom-gemini-key', requireAuth, (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  const updated = updateUser(authUser.id, { custom_gemini_key: '' });
  res.json({
    success: true,
    message: 'Data kunci lama dibersihkan.',
    user: sanitizeUserForClient(updated)
  });
});

app.post('/api/user/offline-message', requireAuth, (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  const { message } = req.body || {};
  const cleanMsg = String(message || '').slice(0, 2000);
  const updated = updateUser(authUser.id, {
    custom_offline_message: cleanMsg,
    default_cs_reply_text: cleanMsg
  });
  res.json({
    success: true,
    message: 'Pesan CS standar / offline berhasil disimpan!',
    user: sanitizeUserForClient(updated)
  });
});

app.post('/api/user/auto-reply-toggle', requireAuth, async (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  if (typeof req.body?.enabled !== 'boolean') {
    return res.status(400).json({ success: false, error: 'Parameter enabled (boolean) wajib diisi.' });
  }
  const enabled = Boolean(req.body.enabled);
  const result = toggleUserAutoReply(authUser.id, enabled);
  if (!result.success) {
    return res.status(400).json({
      success: false,
      code: result.code,
      error: result.error || 'Gagal memperbarui status respon otomatis.',
      status: result.status,
      user: result.user ? sanitizeUserForClient(result.user) : undefined
    });
  }

  if (result.user) {
    await pushUserToMysql(result.user).catch(() => {});
  }

  if (enabled) {
    // Pastikan sesi tertaut siap merespon
    resumeSavedUserBaileysSessions(authUser.id).catch(() => {});
  }

  return res.json({
    success: true,
    message: enabled
      ? 'Respon pesan otomatis berhasil diaktifkan!'
      : 'Respon pesan otomatis berhasil dinonaktifkan (koneksi WhatsApp tetap standby).',
    status: result.status,
    user: sanitizeUserForClient(result.user)
  });
});

app.post('/api/user/default-cs-reply', requireAuth, (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  const { enabled, text } = req.body || {};
  const updates: any = {};
  if (typeof enabled === 'boolean') updates.default_cs_reply_enabled = enabled;
  if (typeof text === 'string') {
    const clean = text.trim().slice(0, 2000);
    updates.default_cs_reply_text = clean;
    updates.custom_offline_message = clean;
  }

  const updated = updateUser(authUser.id, updates);
  res.json({
    success: true,
    message: 'Pengaturan pesan balas otomatis CS berhasil disimpan!',
    user: sanitizeUserForClient(updated)
  });
});

app.post('/api/user/allowed-numbers', requireAuth, (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  const { allowed_numbers } = req.body || {};
  if (!Array.isArray(allowed_numbers)) {
    return res.status(400).json({ success: false, error: 'Format nomor tidak valid.' });
  }
  const cleanNumbers = allowed_numbers
    .map(n => normalizePhoneNumber(String(n)))
    .filter(n => n.length >= 8 && n.length <= 16)
    .slice(0, 50);

  const updated = updateUser(authUser.id, { allowed_numbers: cleanNumbers });
  res.json({
    success: true,
    message: 'Nomor yang diizinkan berhasil disimpan!',
    user: sanitizeUserForClient(updated)
  });
});

app.post('/api/user/ai-config', requireAuth, async (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  const { enabled, system_prompt } = req.body || {};
  const updates: any = {};

  if (enabled === true) {
    let availability = getMetaAiAvailabilityForUser(authUser.id);
    if (!availability.connected) {
      await ensureConnectedMetaAiSocketForUser(authUser.id).catch(() => null);
      availability = getMetaAiAvailabilityForUser(authUser.id);
    }
    if (!availability.connected) {
      const linked = getSessionsByUserId(authUser.id).filter(s => s.status !== 'disconnected');
      const primaryLinked = linked.find(s => s.is_primary) || linked[0] || null;
      return res.status(400).json({
        success: false,
        code: 'WA_NOT_CONNECTED',
        has_linked_session: Boolean(primaryLinked),
        linked_session_phone: primaryLinked?.phone_number || null,
        error: primaryLinked
          ? `Perangkat +${primaryLinked.phone_number} tercatat di Perangkat Tertaut, namun koneksi WebSocket sedang terputus. Klik Sambungkan Ulang atau Login Ulang di menu Koneksi.`
          : 'Hubungkan nomor WhatsApp terlebih dahulu di menu Koneksi sebelum mengaktifkan Meta AI Balas Otomatis.'
      });
    }
    if (!isPhoneMetaAiVerifiedForUser(authUser, availability.phoneNumber)) {
      return res.status(400).json({
        success: false,
        code: 'META_AI_NOT_VERIFIED',
        connected: true,
        phone_number: availability.phoneNumber || null,
        error: 'Akun WhatsApp ini belum terverifikasi pernah chat dengan Meta AI. Silakan verifikasi Meta AI terlebih dahulu.'
      });
    }
  }

  if (enabled !== undefined) updates.ai_enabled = Boolean(enabled);
  if (system_prompt !== undefined) updates.custom_system_prompt = String(system_prompt).slice(0, 4000);

  const updated = updateUser(authUser.id, updates);
  if (updated) {
    await pushUserToMysql(updated).catch(() => {});
  }
  res.json({
    success: true,
    message: 'Pengaturan AI kustom berhasil disimpan!',
    user: sanitizeUserForClient(updated)
  });
});

app.post('/api/user/send-email-otp', requireAuth, async (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  const cooldownCheck = checkOtpCooldown(`profile_email_${authUser.id}`, 30);
  if (!cooldownCheck.allowed) {
    return res.status(429).json({
      success: false,
      cooldown_seconds: cooldownCheck.remaining,
      error: `Mohon tunggu ${cooldownCheck.remaining} detik lagi sebelum mengirim ulang kode OTP email.`
    });
  }

  const newOtp = generateOtpCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const updated = updateUser(authUser.id, {
    verification_otp: newOtp,
    otp_expires_at: expiresAt,
    otp_failed_attempts: 0
  });

  try {
    const emailResult = await sendVerificationOtpEmail(authUser.email, authUser.username, newOtp);
    if (emailResult.success) {
      res.json({
        success: true,
        cooldown_seconds: 30,
        message: 'Kode OTP rahasia verifikasi email berhasil dikirim!',
        user: sanitizeUserForClient(updated)
      });
    } else {
      res.status(500).json({ success: false, error: `Gagal mengirim email: ${emailResult.error}` });
    }
  } catch {
    res.status(500).json({ success: false, error: 'Terjadi kesalahan saat mengirim email OTP.' });
  }
});

app.post('/api/user/send-wa-otp', requireAuth, async (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  if (!authUser.phone) {
    return res.status(400).json({ success: false, error: 'Nomor WhatsApp pengguna belum diatur.' });
  }

  const cooldownCheck = checkOtpCooldown(`profile_wa_${authUser.id}`, 30);
  if (!cooldownCheck.allowed) {
    return res.status(429).json({
      success: false,
      cooldown_seconds: cooldownCheck.remaining,
      error: `Mohon tunggu ${cooldownCheck.remaining} detik lagi sebelum mengirim ulang kode OTP WhatsApp.`
    });
  }

  const newOtp = generateOtpCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const updated = updateUser(authUser.id, {
    verification_otp: newOtp,
    otp_expires_at: expiresAt,
    otp_failed_attempts: 0
  });
  const wl = getWhitelabelConfig();
  const msg = `Halo *${authUser.name}*! 👋\n\nKode rahasia verifikasi WhatsApp *${wl.app_name || 'Japriin'}* Anda adalah:\n\n*${newOtp}*\n\nJangan berikan kode ini kepada siapa pun.`;

  const waRes = await sendSystemWhatsAppNotification(authUser.phone, msg, {
    category: 'system_otp',
    ownerUserId: authUser.id
  });
  if (waRes.sent || waRes.queued) {
    res.json({
      success: true,
      cooldown_seconds: 30,
      queued: waRes.queued,
      message: waRes.sent
        ? 'Kode OTP rahasia verifikasi WhatsApp berhasil dikirim via WhatsApp Superadmin!'
        : 'WhatsApp Superadmin belum login. Kode OTP verifikasi masuk antrean dan akan otomatis dikirim perlahan saat WhatsApp Superadmin login.',
      user: sanitizeUserForClient(updated)
    });
  } else {
    res.status(500).json({
      success: false,
      error: 'Nomor WhatsApp akun tidak valid untuk menerima OTP.'
    });
  }
});

// =============================================================
// 7. INTERACTIVE DEVELOPER REST API v1 (BEARER OR COOKIE+CSRF)
// =============================================================

const authenticateApiKey: express.RequestHandler = (req, res, next) => {
  const authHeader = req.headers.authorization || (req.headers['x-api-key'] as string);
  let token = '';

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (authHeader) {
    token = String(authHeader).trim();
  }

  if (token) {
    const apiUser = getUserByApiKey(token);
    if (apiUser && apiUser.is_active && apiUser.email_verified) {
      (req as any).apiUser = apiUser;
      return next();
    }
    return res.status(401).json({
      success: false,
      error: 'API Token tidak valid atau akun tidak aktif.'
    });
  }

  // Or authenticated browser dashboard session (already CSRF-checked on mutating routes)
  const sessionUser = (req as any).authUser as UserAccount | undefined;
  if (sessionUser && sessionUser.is_active && sessionUser.email_verified) {
    (req as any).apiUser = sessionUser;
    return next();
  }

  return res.status(401).json({
    success: false,
    error: 'Unauthorized. Sertakan Bearer API Token yang valid atau login terlebih dahulu.'
  });
};

app.get('/api/v1/status', authenticateApiKey, (req, res) => {
  const user = (req as any).apiUser as UserAccount;
  const plans = getSubscriptionPlans();
  const plan = plans.find(p => p.id === user.plan_id) || plans[0];
  const now = Date.now();
  const autoReplyStatus = getUserAutoReplyStatus(user);
  const userSessions = getSessionsByUserId(user.id)
    .filter(s => !s.expires_at || Date.parse(s.expires_at) >= now)
    .map(s => ({ session: s, runtime: getLiveSessionRuntimeStatus(s) }))
    .filter(item => item.session.status === 'connected' || item.runtime.has_registered_creds);
  const primaryItem =
    userSessions.find(item => item.session.is_primary) || userSessions[0] || null;

  res.json({
    status: 'online',
    app: 'Japriin Pro REST API v1',
    user: {
      username: user.username,
      name: user.name,
      plan: plan.name,
      daily_limit: plan.daily_msg_limit,
      daily_messages_sent: user.daily_messages_sent || 0,
      quota_remaining: Math.max(0, plan.daily_msg_limit - (user.daily_messages_sent || 0)),
      is_bot_locked: user.is_bot_locked,
      auto_reply_allowed: autoReplyStatus.allowed
    },
    gateway: {
      primary_phone: primaryItem?.session.phone_number || null,
      primary_runtime_status: primaryItem?.runtime.runtime_status || 'disconnected',
      standby_ready: Boolean(primaryItem?.runtime.has_registered_creds || primaryItem?.session.status === 'connected'),
      total_sessions: userSessions.length
    }
  });
});

async function dispatchTextOrMediaToRecipient(params: {
  sessionId: string;
  recipientPhone: string;
  userId: string;
  messageText: string;
  captionText: string;
  sendTextSeparately: boolean;
  resolvedMedia: { hasMedia: false } | ResolvedApiMedia;
  isBroadcast?: boolean;
  skipRemoteForward?: boolean;
}) {
  const {
    sessionId,
    recipientPhone,
    userId,
    messageText,
    captionText,
    sendTextSeparately,
    resolvedMedia,
    isBroadcast,
    skipRemoteForward
  } = params;

  if (!skipRemoteForward) {
    const peer = await resolveTargetClusterPeerForSession({
      sessionId: sessionId || undefined,
      userId
    });
    if (!peer.localOwned && peer.targetOrigin) {
      const rpc = await callClusterPeerRpc({
        targetOrigin: peer.targetOrigin,
        action: 'send_message',
        payload: {
          session_id: sessionId || peer.sessionId || '',
          recipient_phone: recipientPhone,
          user_id: userId,
          message_text: messageText,
          caption_text: captionText,
          send_text_separately: sendTextSeparately,
          is_broadcast: Boolean(isBroadcast),
          media: resolvedMedia.hasMedia
            ? {
                mediaType: resolvedMedia.mediaType,
                mediaBase64: resolvedMedia.mediaBuffer.toString('base64'),
                mimetype: resolvedMedia.mimetype,
                fileName: resolvedMedia.fileName
              }
            : null
        },
        timeoutMs: 35_000
      });
      if (rpc.ok && rpc.data?.success) {
        return rpc.data.data;
      }
      if (rpc.data?.error) {
        throw new Error(rpc.data.error);
      }
    }
  }

  if (!resolvedMedia.hasMedia) {
    return sendBaileysTextMessage(sessionId, recipientPhone, messageText, {
      userId,
      isBroadcast: Boolean(isBroadcast),
      skipQuota: true
    });
  }

  // Case 1: Only media (no text, no caption) -> mediaBuffer + empty caption
  // Case 2: Media + Caption -> message or caption attached directly on the media message
  // Case 3: Text + Media simultaneously -> text sent first, then media (with optional caption)
  const useSeparateText = Boolean(messageText && (sendTextSeparately || captionText));
  const effectiveCaption = useSeparateText ? captionText : (captionText || messageText);
  const effectiveText = useSeparateText ? messageText : '';

  return sendBaileysMediaMessage(
    sessionId,
    recipientPhone,
    {
      mediaType: resolvedMedia.mediaType,
      mediaBuffer: resolvedMedia.mediaBuffer,
      mimetype: resolvedMedia.mimetype,
      fileName: resolvedMedia.fileName,
      caption: effectiveCaption || undefined,
      text: effectiveText || undefined,
      sendTextSeparately: useSeparateText
    },
    {
      userId,
      isBroadcast: Boolean(isBroadcast),
      skipQuota: true
    }
  );
}

app.post('/api/v1/send-message', authenticateApiKey, async (req, res) => {
  const user = (req as any).apiUser as UserAccount;
  const body = req.body || {};
  const { to, message, caption, session_id, is_broadcast, send_text_separately } = body;

  if (session_id && !canAccessSession(user, String(session_id))) {
    return res.status(403).json({ success: false, error: 'Anda tidak memiliki izin menggunakan session_id tersebut.' });
  }

  let resolvedMedia: { hasMedia: false } | ResolvedApiMedia;
  try {
    resolvedMedia = await resolveIncomingApiMedia(body);
  } catch (mediaErr: any) {
    return res.status(400).json({ success: false, error: mediaErr?.message || 'Payload media/dokumen tidak valid.' });
  }

  const safeMessage = typeof message === 'string' ? message.trim().slice(0, 4096) : '';
  const safeCaption = typeof caption === 'string' ? caption.trim().slice(0, 2048) : '';

  if (!to || (!safeMessage && !resolvedMedia.hasMedia && !safeCaption)) {
    return res.status(400).json({
      success: false,
      error: 'Parameter "to" serta minimal salah satu dari "message", "caption", atau media/dokumen wajib diisi.'
    });
  }

  const targetSessionId = session_id ? String(session_id) : '';
  const rawPhones = Array.isArray(to)
    ? to.map(String)
    : String(to).split(/[\r\n,;]+/).map(p => p.trim()).filter(Boolean);

  const phonesList = rawPhones
    .map(p => normalizePhoneNumber(p))
    .filter(p => p.length >= 8 && p.length <= 16);

  if (phonesList.length === 0) {
    return res.status(400).json({ success: false, error: 'Nomor tujuan WhatsApp tidak valid (minimal 8 digit).' });
  }
  if (phonesList.length > 500) {
    return res.status(400).json({ success: false, error: 'Maksimal 500 nomor penerima dalam sekali permintaan REST API.' });
  }

  const sendSeparatelyFlag = Boolean(send_text_separately);

  if (phonesList.length === 1) {
    const quota = deductUserDailyQuota(user.id);
    if (!quota.allowed) {
      return res.status(429).json({ success: false, error: quota.message });
    }

    try {
      const cleanPhone = phonesList[0];
      const sendRes = await dispatchTextOrMediaToRecipient({
        sessionId: targetSessionId,
        recipientPhone: cleanPhone,
        userId: user.id,
        messageText: safeMessage,
        captionText: safeCaption,
        sendTextSeparately: sendSeparatelyFlag,
        resolvedMedia,
        isBroadcast: Boolean(is_broadcast)
      });

      return res.json({
        success: true,
        message: resolvedMedia.hasMedia
          ? `Media/Dokumen (${resolvedMedia.mediaType}) berhasil dikirim via WhatsApp Gateway!`
          : 'Pesan berhasil dikirim via WhatsApp Gateway!',
        data: {
          to: cleanPhone,
          wam_id: sendRes?.wam_id,
          media_type: resolvedMedia.hasMedia ? resolvedMedia.mediaType : 'text',
          file_name: resolvedMedia.hasMedia ? resolvedMedia.fileName : undefined,
          message: safeMessage || undefined,
          caption: safeCaption || undefined,
          remaining_quota: quota.remaining,
          daily_limit: quota.dailyLimit
        }
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Gagal mengirim pesan WhatsApp.' });
    }
  }

  let successCount = 0;
  let failedCount = 0;
  const results: any[] = [];

  for (let i = 0; i < phonesList.length; i++) {
    const cleanPhone = phonesList[i];
    const quota = deductUserDailyQuota(user.id);
    if (!quota.allowed) {
      failedCount++;
      results.push({ phone: cleanPhone, status: 'failed', error: quota.message });
      continue;
    }

    try {
      const personalizedMsg = safeMessage.replace(/\{\{name\}\}|\{nama\}/gi, `Pelanggan (${cleanPhone})`);
      const personalizedCap = safeCaption.replace(/\{\{name\}\}|\{nama\}/gi, `Pelanggan (${cleanPhone})`);
      await dispatchTextOrMediaToRecipient({
        sessionId: targetSessionId,
        recipientPhone: cleanPhone,
        userId: user.id,
        messageText: personalizedMsg,
        captionText: personalizedCap,
        sendTextSeparately: sendSeparatelyFlag,
        resolvedMedia,
        isBroadcast: true
      });
      successCount++;
      results.push({ phone: cleanPhone, status: 'sent' });
      if (i < phonesList.length - 1) {
        await new Promise(r => setTimeout(r, 800));
      }
    } catch (err: any) {
      failedCount++;
      results.push({ phone: cleanPhone, status: 'failed', error: err?.message });
    }
  }

  addBroadcastHistory({
    user_id: user.id,
    session_id: targetSessionId || 'user_primary',
    recipients_count: phonesList.length,
    message: [safeMessage, resolvedMedia.hasMedia ? `[${resolvedMedia.mediaType}: ${resolvedMedia.fileName}]` : '', safeCaption]
      .filter(Boolean)
      .join(' '),
    status: failedCount === phonesList.length ? 'failed' : 'completed',
    success_count: successCount,
    failed_count: failedCount
  });

  res.json({
    success: successCount > 0,
    message: `Broadcast selesai dikirim ke ${phonesList.length} nomor (${successCount} sukses, ${failedCount} gagal).`,
    data: {
      total: phonesList.length,
      success_count: successCount,
      failed_count: failedCount,
      results
    }
  });
});

app.post('/api/v1/broadcast', authenticateApiKey, async (req, res) => {
  const user = (req as any).apiUser as UserAccount;
  const body = req.body || {};
  const { recipients, phones, to, message, caption, session_id, min_delay, max_delay, send_text_separately } = body;
  const rawInput = recipients || phones || to;

  if (session_id && !canAccessSession(user, String(session_id))) {
    return res.status(403).json({ success: false, error: 'Anda tidak memiliki izin menggunakan session_id tersebut.' });
  }

  let resolvedMedia: { hasMedia: false } | ResolvedApiMedia;
  try {
    resolvedMedia = await resolveIncomingApiMedia(body);
  } catch (mediaErr: any) {
    return res.status(400).json({ success: false, error: mediaErr?.message || 'Payload media/dokumen tidak valid.' });
  }

  const parsedRecipients: Array<{ phone: string; name?: string }> = [];
  if (Array.isArray(rawInput)) {
    for (const item of rawInput) {
      if (typeof item === 'string') {
        item.split(/[\r\n,;]+/).map(s => s.trim()).filter(Boolean).forEach(s => parsedRecipients.push({ phone: s }));
      } else if (item && typeof item === 'object' && item.phone) {
        parsedRecipients.push({ phone: String(item.phone), name: item.name ? String(item.name) : undefined });
      }
    }
  } else if (typeof rawInput === 'string') {
    rawInput.split(/[\r\n,;]+/).map(s => s.trim()).filter(Boolean).forEach(s => parsedRecipients.push({ phone: s }));
  }

  const safeMessage = typeof message === 'string' ? message.trim().slice(0, 4096) : '';
  const safeCaption = typeof caption === 'string' ? caption.trim().slice(0, 2048) : '';

  if (parsedRecipients.length === 0 || (!safeMessage && !resolvedMedia.hasMedia && !safeCaption)) {
    return res.status(400).json({
      success: false,
      error: 'Parameter "recipients" serta minimal salah satu dari "message", "caption", atau media/dokumen wajib diisi.'
    });
  }
  if (parsedRecipients.length > 500) {
    return res.status(400).json({ success: false, error: 'Maksimal 500 kontak per request broadcast REST API.' });
  }

  const plans = getSubscriptionPlans();
  const plan = plans.find(p => p.id === user.plan_id) || plans[0];
  const isAdmin = user.role === 'admin';
  const quotaRemaining = isAdmin ? 999999 : Math.max(0, plan.daily_msg_limit - (user.daily_messages_sent || 0));

  if (!isAdmin && parsedRecipients.length > quotaRemaining) {
    return res.status(429).json({
      success: false,
      error: `Jumlah penerima broadcast (${parsedRecipients.length}) melebihi sisa kuota harian Anda (${quotaRemaining}).`
    });
  }

  const targetSessionId = session_id ? String(session_id) : '';
  const minD = Math.min(30, Math.max(1, Number(min_delay) || 1));
  const maxD = Math.min(60, Math.max(minD, Number(max_delay) || 2));
  const sendSeparatelyFlag = Boolean(send_text_separately);

  const results: any[] = [];
  let successCount = 0;
  let failedCount = 0;

  for (let i = 0; i < parsedRecipients.length; i++) {
    const rawItem = parsedRecipients[i];
    const phone = rawItem.phone || '';
    const customName = rawItem.name || `Pelanggan (${phone})`;
    try {
      const q = deductUserDailyQuota(user.id);
      if (!q.allowed) {
        failedCount++;
        results.push({ phone, status: 'failed', error: q.message });
        continue;
      }
      const clean = normalizePhoneNumber(phone);
      const personalizedMsg = safeMessage.replace(/\{\{name\}\}|\{nama\}/gi, customName);
      const personalizedCap = safeCaption.replace(/\{\{name\}\}|\{nama\}/gi, customName);
      await dispatchTextOrMediaToRecipient({
        sessionId: targetSessionId,
        recipientPhone: clean,
        userId: user.id,
        messageText: personalizedMsg,
        captionText: personalizedCap,
        sendTextSeparately: sendSeparatelyFlag,
        resolvedMedia,
        isBroadcast: true
      });
      successCount++;
      results.push({ phone: clean, status: 'sent' });
      if (i < parsedRecipients.length - 1) {
        const waitMs = Math.floor(Math.random() * (maxD - minD + 1) + minD) * 500;
        await new Promise(r => setTimeout(r, waitMs));
      }
    } catch (e: any) {
      failedCount++;
      results.push({ phone, status: 'failed', error: e?.message });
    }
  }

  addBroadcastHistory({
    user_id: user.id,
    session_id: targetSessionId || 'user_primary',
    recipients_count: parsedRecipients.length,
    message: [safeMessage, resolvedMedia.hasMedia ? `[${resolvedMedia.mediaType}: ${resolvedMedia.fileName}]` : '', safeCaption]
      .filter(Boolean)
      .join(' '),
    status: failedCount === parsedRecipients.length ? 'failed' : 'completed',
    success_count: successCount,
    failed_count: failedCount
  });

  res.json({
    success: successCount > 0,
    message: `Broadcast selesai diproses ke ${results.length} kontak (${successCount} sukses, ${failedCount} gagal).`,
    success_count: successCount,
    failed_count: failedCount,
    results
  });
});

// =============================================================
// 8. SIMULATOR & REMOTE BOT TEST (AUTHENTICATED + SCOPED)
// =============================================================

app.post('/api/simulate', requireAuth, async (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  const { sender_phone, sender_name, message_body } = req.body || {};
  if (!sender_phone || !message_body) {
    return res.status(400).json({ success: false, error: 'Sender Phone dan Message Body wajib diisi.' });
  }

  const cleanPhone = normalizePhoneNumber(String(sender_phone));
  const targetUser = authUser.role === 'admin' ? (getUserByPhone(cleanPhone) || authUser) : authUser;

  if (String(message_body).trim().startsWith('/') && targetUser.phone && normalizePhoneNumber(targetUser.phone) === cleanPhone) {
    const botResult = await processRemoteWhatsAppCommand(cleanPhone, String(sender_name || targetUser.name), String(message_body));
    return res.json({
      success: true,
      mode: 'remote_assistant_bot',
      reply: botResult.reply,
      user_name: targetUser.name,
      action_executed: botResult.actionExecuted
    });
  }

  const result = await handleIncomingWhatsAppMessage({
    senderPhone: cleanPhone,
    senderName: String(sender_name || 'Pengguna Simulasi'),
    messageText: String(message_body),
    userId: authUser.id,
    skipSend: true
  });

  res.json({
    success: true,
    mode: 'auto_reply_standard',
    reply: result.reply_body,
    ai_generated: result.ai_generated
  });
});

// =============================================================
// 9. HEALTH, CONFIG, SESSIONS, BAILEYS & PAYMENT UPGRADE
// =============================================================

app.get('/api/health', (_req, res) => {
  void ensureSessionsAwakeAndRecoverMissed('health_ping').catch(() => {});
  res.json({ success: true, status: 'online', timestamp: new Date().toISOString() });
});

app.get('/api/cron/keepalive', (_req, res) => {
  void ensureSessionsAwakeAndRecoverMissed('cron_keepalive').catch(() => {});
  res.json({ success: true, status: 'online', timestamp: new Date().toISOString() });
});

app.get('/api/config', requireAdmin, (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  const sysConfig = getSystemConfig();
  const whitelabel = getWhitelabelConfig();
  const appUrl = process.env.APP_URL?.trim() || sysConfig.app_url || 'http://localhost:3000';
  const effectiveMysql = getEffectiveMysqlConfig();

  const sessions = getWhatsAppSessions();
  const systemSession = sessions.find(s => {
    if (s.status !== 'connected') return false;
    const owner = s.user_id ? getUserById(s.user_id) : null;
    return owner?.role === 'admin';
  });
  const systemPhone = systemSession?.phone_number || whitelabel.primary_bot_phone || '';
  const connectedMetaSessions = getAllConnectedMetaAiSessions();
  const userMetaAvail = getMetaAiAvailabilityForUser(authUser.id);

  const masked: EnvConfigMasked = {
    db_status: isMysqlConfigured() ? 'online' : 'offline',
    db_host: effectiveMysql.host,
    db_name: effectiveMysql.database,
    app_url: appUrl,
    active_phone_number: whitelabel.primary_bot_phone,
    primary_bot_phone: whitelabel.primary_bot_phone,
    gemini_keys_count: connectedMetaSessions.length,
    ai_reply_enabled: sysConfig.ai_config?.enabled,
    meta_ai_connected: userMetaAvail.connected || connectedMetaSessions.length > 0,
    meta_ai_sessions: connectedMetaSessions.length,
    free_auto_reply_hours: getFreeAutoReplyHours(sysConfig),
    max_global_sessions: getMaxGlobalSessions(sysConfig),
    app_name: whitelabel.app_name,
    system_phone: systemPhone
  };

  res.json({
    success: true,
    data: masked,
    fullConfig: sanitizeSystemConfigForAdmin(sysConfig),
    whitelabel,
    system_phone: systemPhone,
    slot_status: getGlobalSlotStatus(sysConfig)
  });
});

app.post('/api/config', requireMasterUnlocked, (req, res) => {
  const current = getSystemConfig();
  const raw = req.body || {};
  const safeUpdates: Record<string, any> = {};

  if (typeof raw.app_url === 'string' && raw.app_url.trim()) {
    if (!isSafeHttpUrl(raw.app_url)) {
      return res.status(400).json({ success: false, error: 'APP_URL tidak valid atau dilarang.' });
    }
    safeUpdates.app_url = raw.app_url.trim().replace(/\/$/, '');
  }
  if (raw.free_auto_reply_hours !== undefined) {
    const cleanHours = normalizeFreeAutoReplyHours(raw.free_auto_reply_hours);
    if (cleanHours !== null) {
      safeUpdates.free_auto_reply_hours = cleanHours;
    }
  }
  if (raw.max_global_sessions !== undefined) {
    const cleanMax = normalizeMaxGlobalSessions(raw.max_global_sessions);
    if (cleanMax === null) {
      return res.status(400).json({
        success: false,
        error: 'Kapasitas maksimal nomor WA global harus bilangan bulat 1 - 10.000.'
      });
    }
    safeUpdates.max_global_sessions = cleanMax;
  }
  if (typeof raw.mysql_host === 'string') {
    const cleanHost = raw.mysql_host.trim().slice(0, 255);
    if (cleanHost && (!/^[a-zA-Z0-9._-]+$/.test(cleanHost) || isBlockedSsrfHost(cleanHost))) {
      return res.status(400).json({ success: false, error: 'Host MySQL tidak valid atau dilarang.' });
    }
    safeUpdates.mysql_host = cleanHost;
  }
  if (raw.mysql_port !== undefined) {
    const p = Number(raw.mysql_port) || 3306;
    if (!Number.isInteger(p) || p < 1 || p > 65535) {
      return res.status(400).json({ success: false, error: 'Port MySQL harus 1-65535.' });
    }
    safeUpdates.mysql_port = p;
  }
  if (typeof raw.mysql_user === 'string') safeUpdates.mysql_user = raw.mysql_user.trim().slice(0, 128);
  if (typeof raw.mysql_password === 'string' && raw.mysql_password.trim() && !raw.mysql_password.includes('****')) {
    safeUpdates.mysql_password = raw.mysql_password;
  } else {
    safeUpdates.mysql_password = current.mysql_password;
  }
  if (typeof raw.mysql_database === 'string') safeUpdates.mysql_database = raw.mysql_database.trim().slice(0, 128);
  if (raw.ai_config && typeof raw.ai_config === 'object') {
    safeUpdates.ai_config = {
      ...current.ai_config,
      enabled: raw.ai_config.enabled !== undefined ? Boolean(raw.ai_config.enabled) : current.ai_config.enabled,
      system_prompt: raw.ai_config.system_prompt !== undefined ? String(raw.ai_config.system_prompt).slice(0, 4000) : current.ai_config.system_prompt,
      fallback_when_no_rule: raw.ai_config.fallback_when_no_rule !== undefined ? Boolean(raw.ai_config.fallback_when_no_rule) : current.ai_config.fallback_when_no_rule,
      model: 'meta-ai-whatsapp',
      offline_fallback_message: raw.ai_config.offline_fallback_message !== undefined
        ? String(raw.ai_config.offline_fallback_message).slice(0, 2000)
        : current.ai_config.offline_fallback_message
    };
  }

  const updated = updateSystemConfig(safeUpdates);
  res.json({
    success: true,
    message: 'Konfigurasi sistem berhasil disimpan!',
    data: sanitizeSystemConfigForAdmin(updated)
  });
});

function sanitizeConflictDetailForRole(
  detail: any,
  isAdmin: boolean
) {
  if (!detail || !isAdmin) return undefined;
  return detail;
}

app.get('/api/sessions', requireAuth, async (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  void pruneInactiveAndUnregisteredBaileysSessions().catch(() => {});
  const showAll = req.query.all === 'true';
  const isAdmin = authUser.role === 'admin';

  const rawSessions =
    isAdmin && showAll
      ? getWhatsAppSessions()
      : getSessionsByUserId(authUser.id);

  await refreshRemoteSessionLeasesIfNeeded(rawSessions).catch(() => {});

  // Read-only status fetch: never auto-trigger socket reconnects when opening Menu Koneksi
  const enriched = rawSessions
    .map((s) => {
      const runtime = getLiveSessionRuntimeStatus(s);
      if (s.status === 'connecting' && !s.connected_at && !runtime.has_registered_creds) {
        return null;
      }
      const identitySummary = getSessionRuntimeIdentitySummary(s.id, s.phone_number);
      const isExternalConflict = Boolean(
        runtime.conflict_paused && runtime.conflict_detail?.source_type !== 'same_server'
      );
      const multiLocationActive = Boolean(
        runtime.multi_location_active ||
        (runtime.runtime_status === 'connected' &&
          runtime.conflict_detail &&
          runtime.conflict_detail.source_type !== 'same_server')
      );
      const includeClusterDetails = isAdmin && showAll;
      return {
        ...sanitizeSessionForClient(s, { includeClusterFields: includeClusterDetails }),
        ...(includeClusterDetails
          ? {
              connected_app_id:
                identitySummary.connected_app_id ||
                s.connected_app_id ||
                (runtime.runtime_status === 'connected' ? 'undefined' : undefined),
              connected_server_name: identitySummary.connected_server_name || s.connected_server_name,
              connected_server_ip: identitySummary.connected_server_ip || s.connected_server_ip,
              connected_server_domain: identitySummary.connected_server_domain || s.connected_server_domain,
              connected_hostname: identitySummary.connected_hostname || s.connected_hostname,
              last_send_verified_at: identitySummary.last_send_verified_at || s.last_send_verified_at
            }
          : {
              connected_app_id: undefined,
              connected_server_name: undefined,
              connected_server_ip: undefined,
              connected_server_domain: undefined,
              connected_hostname: undefined,
              last_send_verified_at: undefined
            }),
        multi_location_active: includeClusterDetails ? multiLocationActive : false,
        runtime_status: isExternalConflict ? 'disconnected' : runtime.runtime_status,
        has_registered_creds: runtime.has_registered_creds,
        disconnect_code: includeClusterDetails ? runtime.disconnect_code : undefined,
        disconnect_reason: includeClusterDetails ? runtime.disconnect_reason : undefined,
        conflict_paused: includeClusterDetails ? isExternalConflict : false,
        conflict_detail:
          includeClusterDetails && isExternalConflict
            ? sanitizeConflictDetailForRole(runtime.conflict_detail, true)
            : undefined
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return res.json({ success: true, data: enriched });
});

app.post('/api/sessions/:id/test-connection', requireAuth, async (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  try {
    const sessionId = sanitizeSessionId(req.params.id || '');
    if (!canAccessSession(authUser, sessionId)) {
      return res.status(403).json({ success: false, error: 'Akses ditolak ke sesi ini.' });
    }
    const sendChatProbe = req.body?.send_chat_probe !== false;
    const rawTargetPhone = typeof req.body?.target_phone === 'string' ? req.body.target_phone.trim() : '';
    const cleanTargetPhone = rawTargetPhone ? normalizePhoneNumber(rawTargetPhone) : '';
    if (rawTargetPhone && (!cleanTargetPhone || cleanTargetPhone.length < 8 || cleanTargetPhone.length > 16)) {
      return res.status(400).json({ success: false, error: 'Format nomor tujuan pengujian tidak valid.' });
    }

    const peer = await resolveTargetClusterPeerForSession({
      sessionId,
      userId: authUser.id
    });
    if (!peer.localOwned && peer.targetOrigin) {
      const rpc = await callClusterPeerRpc({
        targetOrigin: peer.targetOrigin,
        action: 'session_test_connection',
        payload: {
          session_id: sessionId,
          send_chat_probe: sendChatProbe,
          target_phone: cleanTargetPhone || undefined
        },
        timeoutMs: 25_000
      });
      if (rpc.ok && rpc.data) {
        return res.json(rpc.data);
      }
    }

    const result = await testWhatsAppSessionChatHealth(sessionId, {
      sendChatProbe,
      targetPhone: cleanTargetPhone || undefined
    });

    return res.json({
      success: result.ok,
      ...result
    });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      ok: false,
      can_send: false,
      error: err?.message || 'Gagal menguji koneksi WhatsApp.'
    });
  }
});

app.post('/api/sessions/:id/reconnect', requireAuth, async (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  try {
    const sessionId = sanitizeSessionId(req.params.id || '');
    if (!canAccessSession(authUser, sessionId)) {
      return res.status(403).json({ success: false, error: 'Akses ditolak ke sesi ini.' });
    }
    const targetSess = getSessionById(sessionId);
    const peer = await resolveTargetClusterPeerForSession({
      sessionId,
      userId: targetSess?.user_id || authUser.id
    });
    if (!peer.localOwned && peer.targetOrigin) {
      const rpc = await callClusterPeerRpc({
        targetOrigin: peer.targetOrigin,
        action: 'session_reconnect',
        payload: {
          session_id: sessionId,
          user_id: targetSess?.user_id || authUser.id
        },
        timeoutMs: 28_000
      });
      if (rpc.ok && rpc.data) {
        return res.json(rpc.data);
      }
    }

    const nodePrep = await prepareNodeAssignmentForNewConnection(
      sessionId,
      targetSess?.user_id || authUser.id,
      targetSess?.phone_number
    );
    if (!nodePrep.proceedLocally) {
      return res.status(409).json({
        success: false,
        delegated_to: nodePrep.delegatedTo,
        error: nodePrep.error || 'Kapasitas server sedang penuh, tugas koneksi dialihkan ke server lain.'
      });
    }
    const result = await reconnectBaileysSessionForUser(sessionId, authUser.id);
    return res.json({
      success: true,
      connected: result.connected,
      runtime_status: result.runtime_status,
      needs_rescan: result.needs_rescan,
      session_id: result.session_id,
      phone_number: result.phone_number,
      message: result.connected
        ? `Perangkat +${result.phone_number || ''} tersambung dan aktif!`
        : result.needs_rescan
          ? 'Kredensial sesi tidak ditemukan atau sudah terputus dari HP. Silakan Login Ulang dengan Kode Pairing atau Scan QR.'
          : result.disconnect_code === 440
            ? 'Koneksi WhatsApp belum dapat dipulihkan saat ini. Periksa status koneksi atau coba lagi beberapa saat lagi.'
            : 'Sedang mencoba menyambungkan ulang ke WhatsApp...'
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message || 'Gagal menyambungkan ulang sesi.' });
  }
});

app.post('/api/sessions/connect', requireAuth, (_req, res) => {
  return res.status(410).json({
    success: false,
    error: 'Metode Token Cloud API / Webhook telah dihapus. Hubungkan WhatsApp melalui Kode Pairing 8-Digit atau Scan QR Code Baileys.'
  });
});

app.put('/api/sessions/:id/primary', requireAuth, (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  if (!canAccessSession(authUser, req.params.id)) {
    return res.status(403).json({ success: false, error: 'Akses ditolak ke sesi ini.' });
  }
  setPrimarySession(req.params.id);
  res.json({ success: true, message: 'Nomor utama berhasil diperbarui.' });
});

app.post('/api/sessions/:id/primary', requireAuth, (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  if (!canAccessSession(authUser, req.params.id)) {
    return res.status(403).json({ success: false, error: 'Akses ditolak ke sesi ini.' });
  }
  setPrimarySession(req.params.id);
  res.json({ success: true, message: 'Nomor utama berhasil diperbarui.' });
});

const handleRenewSession: express.RequestHandler = (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  if (!canAccessSession(authUser, req.params.id)) {
    return res.status(403).json({ success: false, error: 'Akses ditolak ke sesi ini.' });
  }
  const days = Math.min(90, Math.max(1, Number(req.body?.days) || 30));
  const updated = extendWhatsAppSession(req.params.id, days);
  if (updated) {
    clearSessionExpiryNotificationCooldown(updated.id, updated.user_id, updated.phone_number);
    res.json({ success: true, message: `Masa aktif sesi WhatsApp berhasil diperpanjang +${days} hari!`, data: updated });
  } else {
    res.status(404).json({ success: false, error: 'Sesi tidak ditemukan.' });
  }
};

app.post('/api/sessions/:id/renew', requireAuth, handleRenewSession);
app.post('/api/sessions/:id/extend', requireAuth, handleRenewSession);

const handleUpdateSession: express.RequestHandler = async (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  let sessionId = '';
  try {
    sessionId = sanitizeSessionId(req.params.id || '');
  } catch {
    return res.status(400).json({ success: false, error: 'ID sesi WhatsApp tidak valid.' });
  }
  if (!canAccessSession(authUser, sessionId)) {
    return res.status(403).json({ success: false, error: 'Akses ditolak ke sesi ini.' });
  }
  const targetSess = getSessionById(sessionId);
  if (!targetSess) {
    return res.status(404).json({ success: false, error: 'Sesi tidak ditemukan.' });
  }

  const body = req.body || {};
  const safeUpdates: Record<string, any> = {};
  if (typeof body.session_name === 'string') {
    const cleanName = body.session_name.trim().slice(0, 120);
    if (!cleanName) {
      return res.status(400).json({ success: false, error: 'Nama perangkat tidak boleh kosong.' });
    }
    safeUpdates.session_name = cleanName;
  }
  if (typeof body.is_primary === 'boolean') safeUpdates.is_primary = body.is_primary;

  if (body.custom_system_prompt !== undefined) {
    if (body.custom_system_prompt === null) {
      safeUpdates.custom_system_prompt = '';
    } else if (typeof body.custom_system_prompt === 'string') {
      safeUpdates.custom_system_prompt = body.custom_system_prompt.trim().slice(0, 4000);
    } else {
      return res.status(400).json({ success: false, error: 'Format prompt AI khusus harus berupa teks.' });
    }
  }

  if (body.ai_enabled !== undefined) {
    if (body.ai_enabled !== null && typeof body.ai_enabled !== 'boolean') {
      return res.status(400).json({ success: false, error: 'Status AI perangkat harus true, false, atau null (ikuti akun).' });
    }
    if (body.ai_enabled === true && !isPhoneMetaAiVerifiedForUser(authUser, targetSess.phone_number)) {
      const targetPhoneNorm = normalizePhoneNumber(targetSess.phone_number || '');
      let availability = getMetaAiAvailabilityForUser(authUser.id, targetSess.id);
      const isThisSessionConnected = () =>
        Boolean(
          availability.connected &&
            (availability.sessionId === targetSess.id ||
              (targetPhoneNorm && normalizePhoneNumber(availability.phoneNumber || '') === targetPhoneNorm))
        );
      if (!isThisSessionConnected()) {
        await ensureConnectedMetaAiSocketForUser(authUser.id, targetSess.id).catch(() => null);
        availability = getMetaAiAvailabilityForUser(authUser.id, targetSess.id);
      }
      if (!isThisSessionConnected()) {
        return res.status(400).json({
          success: false,
          code: 'WA_NOT_CONNECTED',
          session_id: targetSess.id,
          phone_number: targetSess.phone_number || null,
          error: `Perangkat +${targetSess.phone_number} belum tersambung secara langsung. Sambungkan ulang perangkat ini sebelum mengaktifkan Meta AI khusus.`
        });
      }
      return res.status(400).json({
        success: false,
        code: 'META_AI_NOT_VERIFIED',
        connected: true,
        session_id: targetSess.id,
        phone_number: targetSess.phone_number || availability.phoneNumber || null,
        error: `Nomor +${targetSess.phone_number} belum terverifikasi pernah chat dengan Meta AI. Lakukan Cek & Verifikasi Meta AI pada kartu nomor ini terlebih dahulu.`
      });
    }
    safeUpdates.ai_enabled = body.ai_enabled;
  }

  const updated = updateWhatsAppSession(targetSess.id, safeUpdates);
  if (!updated) return res.status(404).json({ success: false, error: 'Sesi tidak ditemukan.' });
  res.json({
    success: true,
    message: 'Pengaturan perangkat & AI berhasil disimpan.',
    data: sanitizeSessionForClient(updated)
  });
};

app.put('/api/sessions/:id', requireAuth, handleUpdateSession);
app.patch('/api/sessions/:id', requireAuth, handleUpdateSession);

app.delete('/api/sessions/:id', requireAuth, async (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  const sessionId = req.params.id;
  if (!canAccessSession(authUser, sessionId)) {
    return res.status(403).json({ success: false, error: 'Anda tidak memiliki izin menghapus sesi ini.' });
  }
  const deleted = deleteWhatsAppSession(sessionId);
  await stopBaileysSession(sessionId).catch(() => {});
  res.json({ success: true, deleted });
});

app.post('/api/messages/send', requireAuth, async (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  const body = req.body || {};
  const { session_id, recipient_phone, to, message, caption, is_broadcast, send_text_separately } = body;
  const targetPhone = recipient_phone || to;

  if (session_id && !canAccessSession(authUser, String(session_id))) {
    return res.status(403).json({ success: false, error: 'Anda tidak memiliki akses ke sesi pengirim tersebut.' });
  }

  let resolvedMedia: { hasMedia: false } | ResolvedApiMedia;
  try {
    resolvedMedia = await resolveIncomingApiMedia(body);
  } catch (mediaErr: any) {
    return res.status(400).json({ success: false, error: mediaErr?.message || 'Payload media/dokumen tidak valid.' });
  }

  const safeMessage = typeof message === 'string' ? message.trim().slice(0, 4096) : '';
  const safeCaption = typeof caption === 'string' ? caption.trim().slice(0, 2048) : '';

  if (!targetPhone || (!safeMessage && !resolvedMedia.hasMedia && !safeCaption)) {
    return res.status(400).json({ success: false, error: 'Nomor tujuan serta isi pesan atau media/dokumen wajib diisi.' });
  }

  const targetSession = session_id ? String(session_id) : '';
  const phonesList = String(targetPhone)
    .split(/[\r\n,;]+/)
    .map(p => normalizePhoneNumber(p.trim()))
    .filter(p => p.length >= 8 && p.length <= 16);

  if (phonesList.length === 0) {
    return res.status(400).json({ success: false, error: 'Format nomor tujuan tidak valid (minimal 8 digit).' });
  }
  if (phonesList.length > 500) {
    return res.status(400).json({ success: false, error: 'Maksimal 500 nomor penerima dalam sekali kirim.' });
  }

  const sendSeparatelyFlag = Boolean(send_text_separately);

  if (phonesList.length === 1) {
    const quota = deductUserDailyQuota(authUser.id);
    if (!quota.allowed) {
      return res.status(429).json({ success: false, error: quota.message });
    }
    try {
      const result = await dispatchTextOrMediaToRecipient({
        sessionId: targetSession,
        recipientPhone: phonesList[0],
        userId: authUser.id,
        messageText: safeMessage,
        captionText: safeCaption,
        sendTextSeparately: sendSeparatelyFlag,
        resolvedMedia,
        isBroadcast: Boolean(is_broadcast)
      });
      return res.json({
        success: true,
        message: 'Pesan berhasil dikirim via WhatsApp!',
        data: result
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Gagal mengirim pesan WhatsApp.' });
    }
  }

  let successCount = 0;
  let failedCount = 0;
  for (let i = 0; i < phonesList.length; i++) {
    const quota = deductUserDailyQuota(authUser.id);
    if (!quota.allowed) {
      failedCount++;
      continue;
    }
    try {
      await dispatchTextOrMediaToRecipient({
        sessionId: targetSession,
        recipientPhone: phonesList[i],
        userId: authUser.id,
        messageText: safeMessage,
        captionText: safeCaption,
        sendTextSeparately: sendSeparatelyFlag,
        resolvedMedia,
        isBroadcast: true
      });
      successCount++;
      if (i < phonesList.length - 1) {
        await new Promise(r => setTimeout(r, 800));
      }
    } catch {
      failedCount++;
    }
  }

  res.json({
    success: successCount > 0,
    message: `Berhasil mengirim ke ${successCount} dari ${phonesList.length} nomor tujuan.`,
    data: { total: phonesList.length, success_count: successCount, failed_count: failedCount }
  });
});

async function enforceSingleDeviceAndGlobalSlotForUser(
  authUser: UserAccount,
  targetSessionId: string
): Promise<
  | { allowed: true }
  | { allowed: false; httpStatus: number; code: string; error: string; slot_status?: ReturnType<typeof getGlobalSlotStatus> }
> {
  // 1. Enforce strictly 1 linked/connected WA number per user across ALL plans
  const existingUserSessions = getSessionsByUserId(authUser.id);
  const conflictingSession = existingUserSessions.find(
    s =>
      s.id !== targetSessionId &&
      s.status !== 'disconnected' &&
      (s.status === 'connected' || Boolean(s.connected_at))
  );
  if (conflictingSession) {
    return {
      allowed: false,
      httpStatus: 403,
      code: 'MAX_ONE_DEVICE_PER_USER',
      error: 'Setiap akun hanya dapat menautkan maksimal 1 nomor WhatsApp saat ini. Putuskan perangkat lama terlebih dahulu untuk mengganti nomor.',
      slot_status: getGlobalSlotStatus()
    };
  }

  // Clean up any abandoned unscanned connecting attempt by the same user for a different session ID
  for (const s of existingUserSessions) {
    if (s.id !== targetSessionId && s.status === 'connecting' && !s.connected_at) {
      deleteWhatsAppSession(s.id);
      await stopBaileysSession(s.id).catch(() => {});
    }
  }

  // 2. Enforce global capacity limit + smart Free eviction / Paid hold
  const admission = evaluateGlobalSlotAdmission({
    user: authUser,
    action: 'connect_session',
    targetSessionId
  });
  if (!admission.allowed) {
    return {
      allowed: false,
      httpStatus: admission.code === 'HIGH_SURGE_FULL' ? 429 : 409,
      code: admission.code || 'HIGH_SURGE_FULL',
      error: admission.message || 'Lonjakan aplikasi sedang tinggi, belum bisa buat sesi baru saat ini.',
      slot_status: admission.slotStatus
    };
  }

  if (admission.evictSessionId) {
    await evictAndPurgeFreeSession(
      admission.evictSessionId,
      'Slot dialihkan untuk pengguna paket berbayar'
    );
  }

  return { allowed: true };
}

app.post('/api/sessions/qr/generate', requireAuth, async (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  try {
    const { session_id } = req.body || {};
    const requestedRaw = session_id ? String(session_id) : '';
    const sessionId = sanitizeSessionId(requestedRaw || `session_user_${authUser.id}`);

    if (!canAccessSession(authUser, sessionId)) {
      return res.status(403).json({ success: false, error: 'Akses ditolak untuk ID sesi tersebut.' });
    }

    const startGuard = await withSlotAllocationLock(async () => {
      const check = await enforceSingleDeviceAndGlobalSlotForUser(authUser, sessionId);
      if (!check.allowed) return check;

      const existing = getSessionById(sessionId);
      const pinnedAppId = resolveEffectiveAssignedAppId(existing, authUser);
      if (pinnedAppId && pinnedAppId !== getCurrentAppId()) {
        await assignPairingTargetToApp({
          sessionId,
          userId: authUser.id,
          phoneNumber: existing?.phone_number || authUser.phone || '',
          targetAppId: pinnedAppId,
          authMethod: 'qr_code'
        });
        return {
          allowed: true as const,
          delegatedRemote: true as const,
          delegatedAppId: pinnedAppId
        };
      }

      const nodePrep = await prepareNodeAssignmentForNewConnection(sessionId, authUser.id);
      if (!nodePrep.proceedLocally) {
        if (nodePrep.delegatedTo) {
          await assignPairingTargetToApp({
            sessionId,
            userId: authUser.id,
            phoneNumber: existing?.phone_number || authUser.phone || '',
            targetAppId: nodePrep.delegatedTo,
            authMethod: 'qr_code'
          });
          return {
            allowed: true as const,
            delegatedRemote: true as const,
            delegatedAppId: nodePrep.delegatedTo
          };
        }
        return {
          allowed: false as const,
          httpStatus: 409,
          code: 'NODE_CAPACITY_DELEGATED',
          error: nodePrep.error || 'Kapasitas koneksi node ini penuh; dialihkan ke node lain.',
          slot_status: getGlobalSlotStatus()
        };
      }
      await getOrStartBaileysSession(sessionId, undefined, authUser.id, {
        bypassNodeGuard: true,
        assignedAppId: nodePrep.assignedAppId
      });
      return { allowed: true as const, delegatedRemote: false as const };
    });

    if (!startGuard.allowed) {
      return res.status(startGuard.httpStatus).json({
        success: false,
        code: startGuard.code,
        slot_status: startGuard.slot_status,
        error: startGuard.error
      });
    }

    if (startGuard.delegatedRemote) {
      return res.json({
        success: true,
        delegated: true,
        session_id: sessionId,
        status: 'connecting',
        qr_image: null,
        message: 'Permintaan koneksi QR sedang diproses di server gateway. Mohon tunggu beberapa saat.',
        slot_status: getGlobalSlotStatus()
      });
    }

    // Wait up to 4 seconds for real Baileys QR code to render (never call external qrserver API)
    let status = getBaileysSessionStatus(sessionId);
    let tries = 0;
    while (tries < 8 && status && status.status !== 'connected' && !status.qrCodeUrl) {
      await new Promise(r => setTimeout(r, 500));
      status = getBaileysSessionStatus(sessionId);
      tries++;
    }

    res.json({
      success: true,
      session_id: sessionId,
      status: status?.status || 'connecting',
      qr_image: status?.qrCodeUrl || null,
      slot_status: getGlobalSlotStatus()
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message || 'Gagal generate QR Code.' });
  }
});

app.get('/api/sessions/status/:sessionId', requireAuth, (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  try {
    const sessionId = sanitizeSessionId(req.params.sessionId || '');
    if (!canAccessSession(authUser, sessionId)) {
      return res.status(403).json({ success: false, error: 'Akses ditolak ke status sesi ini.' });
    }
    const status = getBaileysSessionStatus(sessionId);
    res.json({ success: true, data: status });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message || 'ID sesi tidak valid.' });
  }
});

app.get('/api/baileys/status/:sessionId', requireAuth, (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  try {
    const sessionId = sanitizeSessionId(req.params.sessionId || '');
    if (!canAccessSession(authUser, sessionId)) {
      return res.status(403).json({ success: false, error: 'Akses ditolak ke status sesi ini.' });
    }
    const status = getBaileysSessionStatus(sessionId);
    res.json({ success: true, data: status });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message || 'ID sesi tidak valid.' });
  }
});

app.post('/api/baileys/start', requireAuth, async (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  try {
    const { sessionId } = req.body || {};
    const targetId = sanitizeSessionId(String(sessionId || `session_user_${authUser.id}`));
    if (!canAccessSession(authUser, targetId)) {
      return res.status(403).json({ success: false, error: 'Akses ditolak ke ID sesi ini.' });
    }

    const startGuard = await withSlotAllocationLock(async () => {
      const check = await enforceSingleDeviceAndGlobalSlotForUser(authUser, targetId);
      if (!check.allowed) return check;
      const nodePrep = await prepareNodeAssignmentForNewConnection(targetId, authUser.id);
      if (!nodePrep.proceedLocally) {
        return {
          allowed: false as const,
          httpStatus: 409,
          code: 'NODE_CAPACITY_DELEGATED',
          error: nodePrep.error || 'Kapasitas koneksi node ini penuh; dialihkan ke node lain.',
          slot_status: getGlobalSlotStatus()
        };
      }
      const session = await getOrStartBaileysSession(targetId, undefined, authUser.id, {
        bypassNodeGuard: true,
        assignedAppId: nodePrep.assignedAppId
      });
      return { allowed: true as const, session };
    });

    if (!startGuard.allowed) {
      return res.status(startGuard.httpStatus).json({
        success: false,
        code: startGuard.code,
        slot_status: startGuard.slot_status,
        error: startGuard.error
      });
    }

    const session = startGuard.session;
    res.json({
      success: true,
      data: {
        sessionId: session.sessionId,
        status: session.status,
        qrCodeUrl: session.qrCodeUrl,
        phoneNumber: session.phoneNumber
      },
      slot_status: getGlobalSlotStatus()
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message || 'Gagal memulai sesi Baileys.' });
  }
});

app.post('/api/baileys/request-pairing', requireAuth, async (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  const { sessionId, phoneNumber } = req.body || {};
  try {
    const cleanPhone = normalizePhoneNumber(String(phoneNumber || ''));
    const targetId = sanitizeSessionId(String(sessionId || `session_pair_${authUser.id}_${cleanPhone}`));
    if (!canAccessSession(authUser, targetId)) {
      return res.status(403).json({ success: false, error: 'Akses ditolak ke ID sesi ini.' });
    }

    const pairGuard = await withSlotAllocationLock(async () => {
      const check = await enforceSingleDeviceAndGlobalSlotForUser(authUser, targetId);
      if (!check.allowed) return check;

      const existing = getSessionById(targetId);
      const pinnedAppId = resolveEffectiveAssignedAppId(existing, authUser);
      if (pinnedAppId && pinnedAppId !== getCurrentAppId()) {
        const assigned = await assignPairingTargetToApp({
          sessionId: targetId,
          userId: authUser.id,
          phoneNumber: cleanPhone,
          targetAppId: pinnedAppId,
          authMethod: 'pairing_code'
        });
        return { allowed: true as const, delegatedRemote: true as const, assigned };
      }

      const nodePrep = await prepareNodeAssignmentForNewConnection(targetId, authUser.id, cleanPhone);
      if (!nodePrep.proceedLocally) {
        if (nodePrep.delegatedTo) {
          const assigned = await assignPairingTargetToApp({
            sessionId: targetId,
            userId: authUser.id,
            phoneNumber: cleanPhone,
            targetAppId: nodePrep.delegatedTo,
            authMethod: 'pairing_code'
          });
          return { allowed: true as const, delegatedRemote: true as const, assigned };
        }
        return {
          allowed: false as const,
          httpStatus: 409,
          code: 'NODE_CAPACITY_DELEGATED',
          error: nodePrep.error || 'Kapasitas koneksi node ini penuh; dialihkan ke node lain.',
          slot_status: getGlobalSlotStatus()
        };
      }
      const pairingCode = await requestBaileysPairingCode(targetId, cleanPhone, authUser.id, {
        bypassNodeGuard: true,
        assignedAppId: nodePrep.assignedAppId
      });
      return { allowed: true as const, delegatedRemote: false as const, pairingCode };
    });

    if (!pairGuard.allowed) {
      return res.status(pairGuard.httpStatus).json({
        success: false,
        code: pairGuard.code,
        slot_status: pairGuard.slot_status,
        error: pairGuard.error
      });
    }

    if (pairGuard.delegatedRemote) {
      return res.json({
        success: true,
        delegated: true,
        session_id: targetId,
        message: 'Permintaan pairing sedang diproses di server gateway. Mohon tunggu beberapa saat.',
        slot_status: getGlobalSlotStatus()
      });
    }

    res.json({ success: true, pairing_code: pairGuard.pairingCode, session_id: targetId, slot_status: getGlobalSlotStatus() });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message || 'Gagal meminta kode pairing.' });
  }
});

app.post('/api/sessions/pair-code/generate', requireAuth, async (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  const { session_id, phone_number } = req.body || {};
  const rawPhone = phone_number || req.body?.phoneNumber;
  if (!rawPhone) {
    return res.status(400).json({ success: false, error: 'Nomor WhatsApp wajib diisi.' });
  }

  const cleanPhone = normalizePhoneNumber(String(rawPhone));
  if (!cleanPhone || cleanPhone.length < 9) {
    return res.status(400).json({ success: false, error: 'Format nomor WhatsApp tidak valid.' });
  }

  let targetSessionId = '';
  try {
    targetSessionId = sanitizeSessionId(String(session_id || `session_user_${authUser.id}_${cleanPhone}`));
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message });
  }

  if (!canAccessSession(authUser, targetSessionId)) {
    return res.status(403).json({ success: false, error: 'Akses ditolak ke ID sesi tersebut.' });
  }

  try {
    const pairGuard = await withSlotAllocationLock(async () => {
      const check = await enforceSingleDeviceAndGlobalSlotForUser(authUser, targetSessionId);
      if (!check.allowed) return check;

      const existing = getSessionById(targetSessionId);
      const pinnedAppId = resolveEffectiveAssignedAppId(existing, authUser);
      if (pinnedAppId && pinnedAppId !== getCurrentAppId()) {
        const assigned = await assignPairingTargetToApp({
          sessionId: targetSessionId,
          userId: authUser.id,
          phoneNumber: cleanPhone,
          targetAppId: pinnedAppId,
          authMethod: 'pairing_code'
        });
        return { allowed: true as const, delegatedRemote: true as const, assigned };
      }

      const nodePrep = await prepareNodeAssignmentForNewConnection(targetSessionId, authUser.id, cleanPhone);
      if (!nodePrep.proceedLocally) {
        if (nodePrep.delegatedTo) {
          const assigned = await assignPairingTargetToApp({
            sessionId: targetSessionId,
            userId: authUser.id,
            phoneNumber: cleanPhone,
            targetAppId: nodePrep.delegatedTo,
            authMethod: 'pairing_code'
          });
          return { allowed: true as const, delegatedRemote: true as const, assigned };
        }
        return {
          allowed: false as const,
          httpStatus: 409,
          code: 'NODE_CAPACITY_DELEGATED',
          error: nodePrep.error || 'Kapasitas koneksi node ini penuh; dialihkan ke node lain.',
          slot_status: getGlobalSlotStatus()
        };
      }
      const pairingCode = await requestBaileysPairingCode(targetSessionId, cleanPhone, authUser.id, {
        bypassNodeGuard: true,
        assignedAppId: nodePrep.assignedAppId
      });
      return { allowed: true as const, delegatedRemote: false as const, pairingCode };
    });

    if (!pairGuard.allowed) {
      return res.status(pairGuard.httpStatus).json({
        success: false,
        code: pairGuard.code,
        slot_status: pairGuard.slot_status,
        error: pairGuard.error
      });
    }

    if (pairGuard.delegatedRemote) {
      return res.json({
        success: true,
        delegated: true,
        session_id: targetSessionId,
        phone_number: cleanPhone,
        message: 'Permintaan pairing sedang diproses di server gateway. Mohon tunggu beberapa saat.',
        slot_status: getGlobalSlotStatus()
      });
    }

    res.json({
      success: true,
      pairing_code: pairGuard.pairingCode,
      session_id: targetSessionId,
      phone_number: cleanPhone,
      expires_in: 120,
      slot_status: getGlobalSlotStatus()
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: err?.message || 'Gagal meminta Kode Pairing dari WhatsApp.'
    });
  }
});

// Upgrade Subscription Plan (AUTHENTICATED + SELF-SCOPED + FAIL-CLOSED RECEIPT VALIDATION)
app.post('/api/upgrade-plan', requireAuth, async (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  const { plan_id, receipt_base64, payment_note } = req.body || {};

  const plans = getSubscriptionPlans();
  const plan = plans.find(p => p.id === plan_id && p.id !== 'free');
  if (!plan || plan.price <= 0) {
    return res.status(400).json({ success: false, error: 'Paket berbayar tidak valid.' });
  }

  try {
    const admissionCheck = await withSlotAllocationLock(async () => {
      return evaluateGlobalSlotAdmission({
        user: authUser,
        requestedPlanId: String(plan_id),
        action: 'upgrade_or_approve'
      });
    });

    if (!admissionCheck.allowed) {
      return res.status(409).json({
        success: false,
        code: admissionCheck.code,
        slot_status: admissionCheck.slotStatus,
        error:
          admissionCheck.message ||
          'Seluruh slot kapasitas aplikasi saat ini penuh diisi akun berbayar. Proses upgrade ditahan sementara.'
      });
    }

    const receiptCheck = await verifyPaymentReceiptWithAi({
      receiptBase64: receipt_base64,
      paymentNote: payment_note,
      planName: plan.name,
      expectedPrice: plan.price
    });

    if (
      receiptCheck.transactionRef === 'MISSING_RECEIPT' ||
      receiptCheck.transactionRef === 'INVALID_IMAGE_FORMAT' ||
      receiptCheck.transactionRef === 'INVALID_IMAGE_SIZE' ||
      receiptCheck.transactionRef === 'INVALID_MAGIC_BYTES'
    ) {
      return res.status(400).json({
        success: false,
        error: receiptCheck.reason,
        ai_result: receiptCheck
      });
    }

    const updatedUser = upgradeUserPlan({
      userId: authUser.id,
      planId: String(plan_id),
      receiptUrl: `receipt_${Date.now()}`,
      paymentNote: typeof payment_note === 'string' && payment_note.trim()
        ? payment_note.trim().slice(0, 300)
        : `Permohonan Upgrade ${plan.name} (Pending Audit)`,
      aiVerification: receiptCheck
    });

    res.json({
      success: true,
      message: 'Bukti transfer valid diterima! Permohonan upgrade masuk antrean review manual Superadmin.',
      ai_result: receiptCheck,
      user: sanitizeUserForClient(updatedUser)
    });
  } catch {
    res.status(500).json({ success: false, error: 'Gagal memproses permohonan upgrade paket.' });
  }
});

// =============================================================
// 10. USER MANAGEMENT & MYSQL ADMIN ROUTES (SUPERADMIN ONLY)
// =============================================================

app.get('/api/users', requireAdmin, (_req, res) => {
  res.json({ success: true, data: getUsers().map(u => sanitizeUserForClient(u)) });
});

app.post('/api/users', requireAdmin, async (req, res) => {
  try {
    const { username, name, role, email, phone, plan_id, password } = req.body || {};
    if (!username || !name || !email) {
      return res.status(400).json({ success: false, error: 'Username, Nama, dan Email wajib diisi.' });
    }
    if (!password || String(password).length < 8) {
      return res.status(400).json({ success: false, error: 'Password minimal 8 karakter wajib diisi.' });
    }

    const validPlanId = getSubscriptionPlans().some(p => p.id === plan_id) ? String(plan_id) : 'free';
    const createdResult = await withSlotAllocationLock(async () => {
      if (validPlanId !== 'free') {
        const admission = evaluateGlobalSlotAdmission({
          requestedPlanId: validPlanId,
          action: 'upgrade_or_approve'
        });
        if (!admission.allowed) {
          return { blocked: true as const, admission };
        }
      }

      const { user } = registerUser({
        username: String(username),
        name: String(name).slice(0, 120),
        email: String(email),
        phone: phone ? String(phone) : '',
        password: String(password),
        plan_id: validPlanId
      });

      const finalUser = updateUser(user.id, {
        role: role === 'admin' ? 'admin' : 'user',
        plan_status: 'active',
        email_verified: true,
        wa_verified: true,
        is_active: true,
        max_sessions: 1,
        verification_otp: undefined,
        otp_expires_at: undefined
      });
      return { blocked: false as const, finalUser: finalUser || user };
    });

    if (createdResult.blocked) {
      return res.status(409).json({
        success: false,
        code: createdResult.admission.code,
        slot_status: createdResult.admission.slotStatus,
        error: createdResult.admission.message
      });
    }

    res.json({
      success: true,
      message: 'Pengguna baru berhasil ditambahkan!',
      data: sanitizeUserForClient(createdResult.finalUser)
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message || 'Gagal menambahkan pengguna.' });
  }
});

app.post('/api/users/:id/verify', requireAdmin, async (req, res) => {
  const { email_verified, wa_verified, is_active } = req.body || {};
  const updates: Partial<UserAccount> = {};

  if (typeof email_verified === 'boolean') updates.email_verified = email_verified;
  if (typeof is_active === 'boolean') updates.is_active = is_active;
  if (typeof wa_verified === 'boolean') {
    updates.wa_verified = wa_verified;
    if (wa_verified) {
      updates.is_active = true;
      updates.plan_status = 'active';
      updates.payment_note = 'Aktif (Diverifikasi Admin)';
    } else {
      updates.is_active = false;
      updates.plan_status = 'pending_approval';
      updates.payment_note = 'Pending - Menunggu Verifikasi Nomor WhatsApp';
    }
  }

  const updated = updateUser(req.params.id, updates);
  if (!updated) return res.status(404).json({ success: false, error: 'Pengguna tidak ditemukan.' });

  if (!updated.is_active || !updated.email_verified) {
    revokeUserAuthSessions(updated.id);
    await purgeBaileysSessionsForUser(updated.id).catch(() => {});
  }

  res.json({
    success: true,
    message: 'Status verifikasi pengguna diperbarui.',
    data: sanitizeUserForClient(updated)
  });
});

app.post('/api/users/:id/send-wa-otp', requireAdmin, async (req, res) => {
  const user = getUserById(req.params.id);
  if (!user) return res.status(404).json({ success: false, error: 'Pengguna tidak ditemukan.' });
  if (!user.phone) return res.status(400).json({ success: false, error: 'Nomor WhatsApp pengguna belum diatur.' });

  const newOtp = generateOtpCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const updated = updateUser(user.id, {
    verification_otp: newOtp,
    otp_expires_at: expiresAt,
    otp_failed_attempts: 0
  });
  const wl = getWhitelabelConfig();
  const msg = `Halo *${user.name}*! 👋\n\nKode rahasia verifikasi WhatsApp *${wl.app_name || 'Japriin'}* Anda adalah:\n\n*${newOtp}*\n\nJangan berikan kode ini kepada siapa pun.`;
  const waRes = await sendSystemWhatsAppNotification(user.phone, msg, {
    category: 'system_otp',
    ownerUserId: user.id
  });

  res.json({
    success: true,
    queued: waRes.queued,
    message: waRes.sent
      ? `Kode OTP rahasia berhasil dikirim ke WhatsApp ${user.phone} melalui WA Superadmin!`
      : `WA Superadmin belum login. Kode OTP untuk ${user.name} masuk antrean dan otomatis dikirim perlahan saat WA Superadmin login.`,
    data: sanitizeUserForClient(updated)
  });
});

app.post('/api/users/:id/approve', requireAdmin, async (req, res) => {
  const approveResult = await withSlotAllocationLock(async () => {
    const targetUser = getUserById(req.params.id);
    if (!targetUser) return { notFound: true as const };

    const targetPlan = targetUser.requested_plan_id || targetUser.plan_id || 'free';
    const admission = evaluateGlobalSlotAdmission({
      user: targetUser,
      requestedPlanId: targetPlan,
      action: 'upgrade_or_approve'
    });
    if (!admission.allowed) {
      return { notFound: false as const, blocked: true as const, admission };
    }

    const updated = approveUserSubscription(targetUser.id);
    return { notFound: false as const, blocked: false as const, updated };
  });

  if (approveResult.notFound) {
    return res.status(404).json({ success: false, error: 'Pengguna tidak ditemukan.' });
  }
  if (approveResult.blocked) {
    return res.status(409).json({
      success: false,
      code: approveResult.admission.code,
      slot_status: approveResult.admission.slotStatus,
      error: approveResult.admission.message
    });
  }
  if (!approveResult.updated) {
    return res.status(404).json({ success: false, error: 'Pengguna tidak ditemukan.' });
  }

  res.json({
    success: true,
    message: `Langganan ${approveResult.updated.name} berhasil di-ACC!`,
    data: sanitizeUserForClient(approveResult.updated)
  });
});

app.post('/api/users/:id/reset-free-timer', requireAdmin, async (req, res) => {
  const updated = resetFreeUserAutoReplyTimer(req.params.id);
  if (!updated) return res.status(404).json({ success: false, error: 'Pengguna tidak ditemukan.' });
  await pushUserToMysql(updated).catch(() => {});
  res.json({
    success: true,
    message: `Status respon otomatis penuh untuk ${updated.name} diperbarui.`,
    data: sanitizeUserForClient(updated)
  });
});

app.post('/api/users/:id/reject', requireAdmin, async (req, res) => {
  const updated = rejectUserSubscription(req.params.id);
  if (!updated) return res.status(404).json({ success: false, error: 'Pengguna tidak ditemukan.' });
  revokeUserAuthSessions(updated.id);
  await purgeBaileysSessionsForUser(updated.id).catch(() => {});
  res.json({ success: true, message: 'Permohonan langganan ditolak.', data: sanitizeUserForClient(updated) });
});

app.delete('/api/users/:id', requireAdmin, async (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  const { id } = req.params;
  const user = getUserById(id);
  if (!user) return res.status(404).json({ success: false, error: 'Pengguna tidak ditemukan.' });
  if (user.id === authUser.id) {
    return res.status(400).json({ success: false, error: 'Anda tidak dapat menghapus akun Superadmin yang sedang aktif.' });
  }
  if (user.role === 'admin' && getUsers().filter(u => u.role === 'admin' && u.is_active).length <= 1) {
    return res.status(400).json({ success: false, error: 'Akun Superadmin terakhir tidak boleh dihapus!' });
  }

  revokeUserAuthSessions(user.id);
  await purgeBaileysSessionsForUser(user.id).catch(() => {});
  deleteUserAccount(user.id);

  res.json({ success: true, message: `Pengguna ${user.name} beserta seluruh sesi WhatsApp-nya berhasil dihapus!` });
});

app.post('/api/mysql/test', requireAdmin, async (req, res) => {
  const raw = req.body || {};
  const cleanHost = typeof raw.host === 'string' ? raw.host.trim() : '';
  if (cleanHost && (!/^[a-zA-Z0-9._-]+$/.test(cleanHost) || isBlockedSsrfHost(cleanHost))) {
    const errMsg = `Host MySQL "${cleanHost}" tidak valid atau diblokir oleh kebijakan keamanan jaringan.`;
    return res.status(400).json({
      success: false,
      error: errMsg,
      data: {
        connected: false,
        host: cleanHost,
        port: Number(raw.port) || 3306,
        database: typeof raw.database === 'string' ? raw.database.trim() : '',
        error_code: 'INVALID_OR_BLOCKED_HOST',
        error_detail: errMsg,
        hint: 'Gunakan hostname domain atau alamat IP server database yang valid (bukan alamat metadata internal cloud).',
        message: errMsg,
        checked_at: new Date().toISOString()
      }
    });
  }
  let validPort: number | undefined;
  if (raw.port !== undefined && raw.port !== '') {
    const p = Number(raw.port);
    if (!Number.isInteger(p) || p < 1 || p > 65535) {
      const errMsg = 'Port MySQL tidak valid (harus angka bulat antara 1 - 65535).';
      return res.status(400).json({
        success: false,
        error: errMsg,
        data: {
          connected: false,
          host: cleanHost,
          error_code: 'INVALID_PORT',
          error_detail: errMsg,
          hint: 'Port standar MySQL/MariaDB adalah 3306.',
          message: errMsg,
          checked_at: new Date().toISOString()
        }
      });
    }
    validPort = p;
  }

  const cleanOverride = {
    host: cleanHost || undefined,
    port: validPort,
    user: typeof raw.user === 'string' && raw.user.trim() ? raw.user.trim() : undefined,
    password: typeof raw.password === 'string' && raw.password !== '' ? raw.password : undefined,
    database: typeof raw.database === 'string' && raw.database.trim() ? raw.database.trim() : undefined,
    ssl: typeof raw.ssl === 'boolean' ? raw.ssl : undefined
  };

  const status = await testMysqlConnection(cleanOverride);
  res.json({ success: status.connected, data: status });
});

app.post('/api/mysql/sync', requireMasterUnlocked, async (req, res) => {
  const raw = req.body || {};
  const cleanHost = typeof raw.host === 'string' ? raw.host.trim() : '';
  if (cleanHost && (!/^[a-zA-Z0-9._-]+$/.test(cleanHost) || isBlockedSsrfHost(cleanHost))) {
    return res.status(400).json({
      success: false,
      error: 'Host MySQL tidak valid atau dilarang.',
      message: `Host MySQL "${cleanHost}" tidak valid atau diblokir oleh kebijakan keamanan.`,
      logs: [`✗ Host "${cleanHost}" tidak valid atau diblokir.`]
    });
  }
  const portNum = raw.port !== undefined && raw.port !== '' ? Number(raw.port) : undefined;
  if (portNum !== undefined && (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535)) {
    return res.status(400).json({
      success: false,
      error: 'Port MySQL harus 1-65535.',
      message: 'Port MySQL tidak valid (harus 1-65535).',
      logs: ['✗ Port MySQL harus berada di rentang 1 - 65535.']
    });
  }

  const cleanOverride = {
    host: cleanHost || undefined,
    port: portNum,
    user: typeof raw.user === 'string' && raw.user.trim() ? raw.user.trim() : undefined,
    password: typeof raw.password === 'string' && raw.password !== '' ? raw.password : undefined,
    database: typeof raw.database === 'string' && raw.database.trim() ? raw.database.trim() : undefined,
    ssl: typeof raw.ssl === 'boolean' ? raw.ssl : undefined
  };

  const result = await syncPushStructureAndData(cleanOverride);
  res.json(result);
});

app.get('/api/export-sql', requireMasterUnlocked, (_req, res) => {
  const sql = exportCurrentDataToSql();
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="data.sql"');
  res.send(sql);
});

// =============================================================
// SUPERADMIN MULTI-NODE CLUSTER MONITOR & ORCHESTRATION ROUTES
// =============================================================

async function buildClusterMonitorResponsePayload() {
  const monitor = await getClusterMonitorData();
  const safeSessions = monitor.sessions.map(s => ({
    ...sanitizeSessionForClient(s, { includeClusterFields: true }),
    runtime_status: s.runtime_status,
    has_registered_creds: s.has_registered_creds,
    conflict_paused: s.conflict_paused,
    conflict_detail: s.conflict_detail,
    disconnect_code: s.disconnect_code,
    disconnect_reason: s.disconnect_reason,
    owner_username: s.owner_username,
    owner_name: s.owner_name,
    owner_email: s.owner_email,
    monitor_health: s.monitor_health
  }));
  const safeUsers = getUsers().map(u => ({
    id: u.id,
    username: u.username,
    name: u.name,
    email: u.email,
    role: u.role,
    assigned_app_id: u.assigned_app_id || ''
  }));
  return {
    ...monitor,
    telegram_configs: sanitizeTelegramConfigsForAdmin(),
    telegram_configured: getActiveTelegramTargets().length > 0,
    sessions: safeSessions,
    users: safeUsers
  };
}

// Inter-App Keepalive Ping Endpoints (keeps idle 0-WA nodes awake & verifies peer liveness)
app.get('/api/cluster/ping', (_req, res) => {
  res.json({
    ok: true,
    alive: true,
    app_id: getDisplayAppId(),
    timestamp: new Date().toISOString()
  });
});

app.post('/api/cluster/ping', (req, res) => {
  const token = String(req.headers['x-cluster-ping-token'] || '').trim();
  const tokenCheck = verifyClusterPingOrWsToken(token, 'cluster_ping');
  if (!tokenCheck.ok) {
    return res.status(403).json({ ok: false, error: tokenCheck.error || 'Token cluster ping tidak valid.' });
  }
  const result = handleIncomingClusterPing({
    fromApp: tokenCheck.fromApp || req.body?.from_app_id,
    fromInstance: tokenCheck.fromInstance || req.body?.from_instance_id,
    activeConnections: Number(req.body?.active_connections || 0),
    triggerTick: Boolean(req.body?.trigger_tick)
  });
  return res.json(result);
});

app.post('/api/cluster/rpc', async (req, res) => {
  const token = String(req.headers['x-cluster-rpc-token'] || '').trim();
  const rawAction = typeof req.body?.action === 'string' ? req.body.action.trim() : '';
  const tokenCheck = verifyClusterRpcToken(token, rawAction as ClusterRpcAction);
  if (!tokenCheck.ok || !tokenCheck.action) {
    return res.status(403).json({ success: false, error: tokenCheck.error || 'Token cluster RPC tidak valid.' });
  }

  const action = tokenCheck.action;
  const payload = req.body?.payload && typeof req.body.payload === 'object' ? req.body.payload : {};

  try {
    let targetUser: UserAccount | undefined;
    if (typeof payload.user_id === 'string' && payload.user_id.trim()) {
      targetUser = getUserById(payload.user_id.trim()) || undefined;
      if (!targetUser) {
        return res.status(404).json({ success: false, error: 'Akun pemilik sesi tidak ditemukan di node ini.' });
      }
    }

    let safeSessionId: string | undefined;
    if (typeof payload.session_id === 'string' && payload.session_id.trim()) {
      try {
        safeSessionId = sanitizeSessionId(payload.session_id.trim());
      } catch {
        return res.status(400).json({ success: false, error: 'ID sesi WhatsApp tidak valid.' });
      }
      if (targetUser && !canAccessSession(targetUser, safeSessionId)) {
        return res.status(403).json({ success: false, error: 'Sesi bukan milik pengguna tersebut.' });
      }
    }

    if (action === 'ai_status') {
      if (!targetUser) {
        return res.status(400).json({ success: false, error: 'user_id wajib disertakan.' });
      }
      const sysConfig = getSystemConfig();
      return res.json(buildLocalAiStatusForUser(targetUser, sysConfig, safeSessionId));
    }

    if (action === 'ai_verify') {
      if (!targetUser) {
        return res.status(400).json({ success: false, error: 'user_id wajib disertakan.' });
      }
      const result = await verifyAndInitMetaAiForUser({
        userId: targetUser.id,
        sessionId: safeSessionId
      });
      return res.json({ success: true, result });
    }

    if (action === 'ai_test_chat') {
      if (!targetUser) {
        return res.status(400).json({ success: false, error: 'user_id wajib disertakan.' });
      }
      const prompt = typeof payload.prompt === 'string' ? payload.prompt.slice(0, 2000).trim() : '';
      if (!prompt) {
        return res.status(400).json({ success: false, error: 'Pesan tes wajib diisi.' });
      }
      const senderName = typeof payload.sender_name === 'string' ? payload.sender_name.slice(0, 120) : (targetUser.name || 'Uji Coba AI User');
      const result = await simulateAutoReplyForTest({
        senderPhone: '628999000111',
        senderName,
        messageText: prompt,
        userId: targetUser.id,
        sessionId: safeSessionId
      });
      const availability = getMetaAiAvailabilityForUser(targetUser.id, safeSessionId);
      return res.json({
        success: true,
        engine: 'meta_ai_whatsapp',
        source: result.source,
        reply: result.reply,
        ai_generated: result.ai_generated,
        ai_enabled: result.ai_enabled,
        matched_rule_id: result.matched_rule_id,
        customer_code: result.customer_code || null,
        media_type: result.media_type || null,
        media_url: result.media_url || null,
        order_verified_paid: Boolean(result.order_verified_paid),
        order_notify_target: result.order_notify_target || null,
        order_notify_status: result.order_notify_status || null,
        fallback_reason: result.ai_error || null,
        session_id: availability.sessionId || safeSessionId || null,
        meta_ai_connected: availability.connected,
        meta_ai_session_phone: availability.phoneNumber || null,
        key_count: availability.connected ? 1 : 0,
        timestamp: new Date().toISOString()
      });
    }

    if (action === 'session_test_connection') {
      if (!safeSessionId) {
        return res.status(400).json({ success: false, error: 'session_id wajib disertakan.' });
      }
      const sendChatProbe = payload.send_chat_probe !== false;
      const cleanTargetPhone =
        typeof payload.target_phone === 'string' && payload.target_phone.trim()
          ? normalizePhoneNumber(payload.target_phone.trim())
          : undefined;
      const result = await testWhatsAppSessionChatHealth(safeSessionId, {
        sendChatProbe,
        targetPhone: cleanTargetPhone
      });
      return res.json({
        success: result.ok,
        ...result
      });
    }

    if (action === 'session_reconnect') {
      if (!safeSessionId) {
        return res.status(400).json({ success: false, error: 'session_id wajib disertakan.' });
      }
      const sessMeta = getSessionById(safeSessionId);
      const effectiveOwnerId = targetUser?.id || sessMeta?.user_id;
      const result = await reconnectBaileysSessionForUser(safeSessionId, effectiveOwnerId);
      return res.json({
        success: true,
        connected: result.connected,
        runtime_status: result.runtime_status,
        needs_rescan: result.needs_rescan,
        session_id: result.session_id,
        phone_number: result.phone_number,
        message: result.connected
          ? `Perangkat +${result.phone_number || ''} tersambung dan aktif!`
          : result.needs_rescan
            ? 'Kredensial sesi tidak ditemukan atau sudah terputus dari HP. Silakan Login Ulang dengan Kode Pairing atau Scan QR.'
            : result.disconnect_code === 440
              ? 'Koneksi WhatsApp belum dapat dipulihkan saat ini. Periksa status koneksi atau coba lagi beberapa saat lagi.'
              : 'Sedang mencoba menyambungkan ulang ke WhatsApp...'
      });
    }

    if (action === 'send_message') {
      if (!targetUser) {
        return res.status(400).json({ success: false, error: 'user_id wajib disertakan.' });
      }
      const recipientPhone = normalizePhoneNumber(String(payload.recipient_phone || ''));
      if (!recipientPhone || recipientPhone.length < 8) {
        return res.status(400).json({ success: false, error: 'Nomor tujuan tidak valid.' });
      }
      const messageText = typeof payload.message_text === 'string' ? payload.message_text.slice(0, 4096) : '';
      const captionText = typeof payload.caption_text === 'string' ? payload.caption_text.slice(0, 2048) : '';
      const mediaObj = payload.media && typeof payload.media === 'object' ? payload.media : null;
      let resolvedMedia: { hasMedia: false } | ResolvedApiMedia = { hasMedia: false };
      if (mediaObj && typeof mediaObj.mediaBase64 === 'string' && mediaObj.mediaBase64.length > 0) {
        const buf = Buffer.from(mediaObj.mediaBase64, 'base64');
        if (buf.length > 16 * 1024 * 1024) {
          return res.status(400).json({ success: false, error: 'Ukuran media melebihi batas maksimum.' });
        }
        const mType = ['image', 'document', 'video', 'audio'].includes(String(mediaObj.mediaType))
          ? (mediaObj.mediaType as 'image' | 'document' | 'video' | 'audio')
          : 'document';
        resolvedMedia = {
          hasMedia: true,
          mediaType: mType,
          mediaBuffer: buf,
          mimetype: typeof mediaObj.mimetype === 'string' ? mediaObj.mimetype : 'application/octet-stream',
          fileName: typeof mediaObj.fileName === 'string' ? mediaObj.fileName.slice(0, 180) : 'attachment'
        };
      }
      const sendRes = await dispatchTextOrMediaToRecipient({
        sessionId: safeSessionId || '',
        recipientPhone,
        userId: targetUser.id,
        messageText,
        captionText,
        sendTextSeparately: Boolean(payload.send_text_separately),
        resolvedMedia,
        isBroadcast: Boolean(payload.is_broadcast),
        skipRemoteForward: true
      });
      return res.json({ success: true, data: sendRes });
    }

    return res.status(400).json({ success: false, error: 'Aksi cluster RPC tidak dikenali.' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Gagal memproses RPC internal cluster.' });
  }
});

app.get('/api/superadmin/cluster-monitor', requireMasterUnlocked, async (_req, res) => {
  try {
    res.json({
      success: true,
      data: await buildClusterMonitorResponsePayload()
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Gagal memuat monitor cluster server.' });
  }
});

app.post('/api/superadmin/cluster-config', requireMasterUnlocked, async (req, res) => {
  const body = req.body || {};
  const updates: Record<string, any> = {};

  if (body.admin_notify_phone !== undefined) {
    const rawPhone = String(body.admin_notify_phone || '').trim();
    if (!rawPhone) {
      updates.admin_notify_phone = '';
    } else {
      const cleanPhone = normalizeAdminNotifyPhone(rawPhone);
      if (!cleanPhone) {
        return res.status(400).json({
          success: false,
          error: 'Nomor WhatsApp Admin Aplikasi tidak valid (minimal 8 digit, contoh 0812... atau 62812...).'
        });
      }
      updates.admin_notify_phone = cleanPhone;
    }
  }

  if (body.app_nodes !== undefined) {
    if (!Array.isArray(body.app_nodes)) {
      return res.status(400).json({ success: false, error: 'Format app_nodes harus berupa daftar array.' });
    }
    if (body.app_nodes.length > 100) {
      return res.status(400).json({ success: false, error: 'Maksimal 100 node server APP_ID.' });
    }
    const validatedNodes: Array<{
      app_id: string;
      name?: string;
      max_connections: number;
      is_active: boolean;
      updated_at: string;
    }> = [];
    const seen = new Set<string>();
    const nowIso = new Date().toISOString();
    for (const rawNode of body.app_nodes) {
      if (!rawNode || typeof rawNode !== 'object') {
        return res.status(400).json({ success: false, error: 'Item node tidak valid.' });
      }
      const rawId = String((rawNode as any).app_id || '').trim();
      if (!/^[a-zA-Z0-9._-]{1,64}$/.test(rawId) || rawId.toLowerCase() === 'undefined') {
        return res.status(400).json({
          success: false,
          error: `APP_ID "${rawId || '-'}" tidak valid. Gunakan huruf, angka, titik, garis bawah, atau tanda hubung (1-64 karakter).`
        });
      }
      const appId = normalizeAppId(rawId);
      if (seen.has(appId)) {
        return res.status(400).json({ success: false, error: `APP_ID "${appId}" terdeteksi duplikat.` });
      }
      seen.add(appId);
      const maxConn = Number((rawNode as any).max_connections);
      if (!Number.isFinite(maxConn) || maxConn < 1 || maxConn > 10000) {
        return res.status(400).json({
          success: false,
          error: `Batas koneksi untuk APP_ID "${appId}" harus antara 1 hingga 10000.`
        });
      }
      const nameStr = typeof (rawNode as any).name === 'string' ? (rawNode as any).name.trim().slice(0, 80) : '';
      validatedNodes.push({
        app_id: appId,
        name: nameStr || undefined,
        max_connections: Math.floor(maxConn),
        is_active: (rawNode as any).is_active === undefined ? true : Boolean((rawNode as any).is_active),
        updated_at: nowIso
      });
    }
    updates.app_nodes = normalizeAppNodes(validatedNodes);
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ success: false, error: 'Tidak ada perubahan konfigurasi cluster yang dikirim.' });
  }

  const updated = updateSystemConfig(updates);
  if (updates.app_nodes !== undefined) {
    await syncConfiguredAppNodesToMysql(updated.app_nodes || []).catch(() => {});
  }
  res.json({
    success: true,
    message: 'Konfigurasi node server & nomor notifikasi admin berhasil disimpan!',
    data: await buildClusterMonitorResponsePayload()
  });
});

app.delete('/api/superadmin/nodes/:appId', requireMasterUnlocked, async (req, res) => {
  const rawAppId = String(req.params.appId || '').trim();
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(rawAppId) || rawAppId.toLowerCase() === 'undefined') {
    return res.status(400).json({ success: false, error: 'APP_ID tidak valid.' });
  }
  const targetAppId = normalizeAppId(rawAppId);
  const currentNodes = getAppNodesConfig();
  const remainingNodes = currentNodes.filter(n => n.app_id !== targetAppId);
  updateSystemConfig({ app_nodes: remainingNodes });
  await syncConfiguredAppNodesToMysql(remainingNodes).catch(() => {});
  await deleteAppNodeFromMysql(targetAppId).catch(() => {});
  res.json({
    success: true,
    message: `Node server "${targetAppId}" berhasil dihapus.`,
    data: await buildClusterMonitorResponsePayload()
  });
});

app.post('/api/superadmin/sessions/:id/reassign', requireMasterUnlocked, async (req, res) => {
  let sessionId = '';
  try {
    sessionId = sanitizeSessionId(req.params.id || '');
  } catch {
    return res.status(400).json({ success: false, error: 'ID sesi WhatsApp tidak valid.' });
  }

  const rawTargetAppId = typeof req.body?.target_app_id === 'string' ? req.body.target_app_id.trim() : '';
  if (rawTargetAppId) {
    if (!/^[a-zA-Z0-9._-]{1,64}$/.test(rawTargetAppId) || rawTargetAppId.toLowerCase() === 'undefined') {
      return res.status(400).json({ success: false, error: 'Target APP_ID tidak valid (tidak boleh "undefined").' });
    }
  }
  const cleanAppId = rawTargetAppId ? normalizeAppId(rawTargetAppId) : '';
  const applyToUser = Boolean(req.body?.apply_to_user);

  try {
    const resAssign = await reassignSessionToAppNode(sessionId, {
      targetAppId: cleanAppId || undefined,
      applyToUser
    });
    res.json({
      ...resAssign,
      data: await buildClusterMonitorResponsePayload()
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message || 'Gagal mengalihkan tugas koneksi sesi.' });
  }
});

app.post('/api/superadmin/sessions/:id/disconnect-socket', requireMasterUnlocked, async (req, res) => {
  let sessionId = '';
  try {
    sessionId = sanitizeSessionId(req.params.id || '');
  } catch {
    return res.status(400).json({ success: false, error: 'ID sesi WhatsApp tidak valid.' });
  }

  try {
    const resDisconnect = await disconnectSessionFromSocket(sessionId);
    res.json({
      ...resDisconnect,
      data: await buildClusterMonitorResponsePayload()
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message || 'Gagal memutuskan WA dari socket.' });
  }
});

app.post('/api/superadmin/users/:id/assign-app', requireMasterUnlocked, async (req, res) => {
  const userId = String(req.params.id || '').trim();
  if (!userId || !getUserById(userId)) {
    return res.status(404).json({ success: false, error: 'Akun pengguna tidak ditemukan.' });
  }

  const rawAppId = typeof req.body?.target_app_id === 'string' ? req.body.target_app_id.trim() : '';
  if (rawAppId) {
    if (!/^[a-zA-Z0-9._-]{1,64}$/.test(rawAppId) || rawAppId.toLowerCase() === 'undefined') {
      return res.status(400).json({ success: false, error: 'Format target_app_id tidak valid (tidak boleh "undefined").' });
    }
  }
  const cleanAppId = rawAppId ? normalizeAppId(rawAppId) : '';

  try {
    const resUserAssign = await assignUserToAppNode(userId, cleanAppId || undefined);
    res.json({
      ...resUserAssign,
      data: await buildClusterMonitorResponsePayload()
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message || 'Gagal menetapkan APP_ID akun pengguna.' });
  }
});

app.post('/api/superadmin/socket-kill-ips', requireMasterUnlocked, async (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  const rawIp = typeof req.body?.ip === 'string' ? req.body.ip.trim() : '';
  const cleanIp = normalizeServerIpValue(rawIp);
  if (!cleanIp || net.isIP(cleanIp) === 0) {
    return res.status(400).json({ success: false, error: 'Alamat IP target shutdown tidak valid (IPv4/IPv6).' });
  }

  // Wajib: IP yang masih aktif/online TIDAK BOLEH di-kill!
  const activeCheck = await isIpCurrentlyActiveInCluster(cleanIp).catch(() => ({ active: false as const }));
  if (activeCheck.active) {
    return res.status(409).json({
      success: false,
      code: 'ACTIVE_IP_PROTECTED',
      error: activeCheck.reason || `IP ${cleanIp} sedang AKTIF/ONLINE dan dilindungi sehingga tidak dapat di-kill.`
    });
  }

  const cleanReason =
    typeof req.body?.reason === 'string' && req.body.reason.trim()
      ? req.body.reason.trim().slice(0, 200)
      : 'Dimatikan oleh Superadmin';

  const currentList = getKillTargetIpsConfig();
  const nextList = normalizeKillTargetIps([
    ...currentList.filter(item => item.ip !== cleanIp),
    {
      ip: cleanIp,
      reason: cleanReason,
      requested_at: new Date().toISOString(),
      requested_by: authUser?.username || 'superadmin'
    }
  ]);

  updateSystemConfig({ kill_target_ips: nextList });
  const killCheck = await checkAndEnforceIpKillSwitch('superadmin_add_kill_ip').catch(() => ({
    killed: false,
    matchedIp: undefined
  }));

  void sendTelegramAlert({
    title: 'Aturan Kill IP Ditambahkan',
    severity: 'warn',
    dedupKey: `kill_ip_added_${cleanIp}`,
    cooldownMs: 15_000,
    lines: [
      `• IP Target: <code>${escapeTelegramHtml(cleanIp)}</code>`,
      `• Alasan: ${escapeTelegramHtml(cleanReason)}`,
      `• Oleh: ${escapeTelegramHtml(authUser?.username || 'superadmin')}`
    ]
  }).catch(() => {});

  res.json({
    success: true,
    killed_locally: killCheck.killed,
    matched_ip: killCheck.matchedIp,
    message: killCheck.killed
      ? `IP ${cleanIp} cocok dengan socket server ini. Socket langsung mematikan diri secara aman.`
      : `IP ${cleanIp} masuk daftar target shutdown. Socket pada IP tersebut akan otomatis mematikan diri saat pengecekan berkala.`,
    data: await buildClusterMonitorResponsePayload()
  });
});

app.delete('/api/superadmin/socket-kill-ips/:ip', requireMasterUnlocked, async (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  const rawIp = decodeURIComponent(String(req.params.ip || '')).trim();
  const cleanIp = normalizeServerIpValue(rawIp);
  if (!cleanIp || net.isIP(cleanIp) === 0) {
    return res.status(400).json({ success: false, error: 'Alamat IP tidak valid.' });
  }
  try {
    const unkillRes = await unkillTargetIp(cleanIp, authUser?.username || 'superadmin');
    res.json({
      ...unkillRes,
      data: await buildClusterMonitorResponsePayload()
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message || 'Gagal melakukan Unkill IP.' });
  }
});

app.post('/api/superadmin/socket-unkill-ip', requireMasterUnlocked, async (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  const rawIp = typeof req.body?.ip === 'string' ? req.body.ip.trim() : '';
  const cleanIp = normalizeServerIpValue(rawIp);
  if (!cleanIp || net.isIP(cleanIp) === 0) {
    return res.status(400).json({ success: false, error: 'Alamat IP tidak valid.' });
  }
  try {
    const unkillRes = await unkillTargetIp(cleanIp, authUser?.username || 'superadmin');
    res.json({
      ...unkillRes,
      data: await buildClusterMonitorResponsePayload()
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message || 'Gagal melakukan Unkill IP.' });
  }
});

// Telegram Alert Bot Key & Chat ID Management (Encrypted in DB)
app.get('/api/superadmin/telegram-configs', requireMasterUnlocked, (_req, res) => {
  res.json({
    success: true,
    data: sanitizeTelegramConfigsForAdmin(),
    telegram_configured: getActiveTelegramTargets().length > 0
  });
});

app.post('/api/superadmin/telegram-configs', requireMasterUnlocked, (req, res) => {
  const body = req.body || {};
  const idInput = typeof body.id === 'string' ? body.id.trim().slice(0, 80) : '';
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 80) : 'Telegram Alert';
  const chatId = normalizeTelegramChatId(body.chat_id);
  const rawToken = typeof body.bot_token === 'string' ? body.bot_token.trim() : '';
  const isActive = body.is_active === undefined ? true : Boolean(body.is_active);

  if (!chatId) {
    return res.status(400).json({
      success: false,
      error: 'ID Chat Telegram tidak valid (gunakan angka ID user/grup/channel, misal 123456789 atau -1001234567890).'
    });
  }

  const existingList = getTelegramConfigs();
  const existingItem = idInput ? existingList.find(item => item.id === idInput) : undefined;
  const isMaskedKeepExisting = Boolean(existingItem && (!rawToken || rawToken.includes('****')));

  let plainTokenToSave = '';
  if (isMaskedKeepExisting && existingItem) {
    plainTokenToSave = decryptData(String(existingItem.bot_token || ''));
  } else {
    plainTokenToSave = rawToken;
  }

  if (!isValidTelegramBotTokenFormat(plainTokenToSave)) {
    return res.status(400).json({
      success: false,
      error: 'Format Key / Bot Token Telegram tidak valid (contoh format: 123456789:AAH...).'
    });
  }

  const nowIso = new Date().toISOString();
  const targetId = existingItem?.id || `tg_${crypto.randomBytes(6).toString('hex')}`;
  const updatedItem = {
    id: targetId,
    name,
    bot_token: plainTokenToSave,
    chat_id: chatId,
    is_active: isActive,
    created_at: existingItem?.created_at || nowIso,
    updated_at: nowIso
  };

  const nextConfigs = normalizeTelegramConfigs(
    existingItem
      ? existingList.map(item => (item.id === targetId ? updatedItem : item))
      : [...existingList, updatedItem]
  );

  updateSystemConfig({ telegram_configs: nextConfigs });

  return res.json({
    success: true,
    message: existingItem
      ? `Konfigurasi Telegram "${name}" berhasil diperbarui di database.`
      : `Key Bot & ID Chat Telegram "${name}" berhasil disimpan ke database.`,
    telegram_configs: sanitizeTelegramConfigsForAdmin(),
    telegram_configured: getActiveTelegramTargets().length > 0
  });
});

app.delete('/api/superadmin/telegram-configs/:id', requireMasterUnlocked, (req, res) => {
  const targetId = String(req.params.id || '').trim();
  if (!targetId) {
    return res.status(400).json({ success: false, error: 'ID konfigurasi Telegram wajib diisi.' });
  }
  const existingList = getTelegramConfigs();
  if (!existingList.some(item => item.id === targetId)) {
    return res.status(404).json({ success: false, error: 'Konfigurasi Telegram tidak ditemukan.' });
  }
  const nextConfigs = normalizeTelegramConfigs(existingList.filter(item => item.id !== targetId));
  updateSystemConfig({ telegram_configs: nextConfigs });

  return res.json({
    success: true,
    message: 'Konfigurasi Telegram berhasil dihapus dari database.',
    telegram_configs: sanitizeTelegramConfigsForAdmin(),
    telegram_configured: getActiveTelegramTargets().length > 0
  });
});

app.post('/api/superadmin/telegram-configs/test', requireMasterUnlocked, async (req, res) => {
  const body = req.body || {};
  const idInput = typeof body.id === 'string' ? body.id.trim() : '';
  const rawToken = typeof body.bot_token === 'string' ? body.bot_token.trim() : '';
  let chatId = normalizeTelegramChatId(body.chat_id);
  let label = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
  let plainToken = '';

  if (idInput) {
    const item = getTelegramConfigs().find(t => t.id === idInput);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Konfigurasi Telegram tidak ditemukan.' });
    }
    plainToken = rawToken && !rawToken.includes('****') ? rawToken : decryptData(String(item.bot_token || ''));
    if (!chatId) chatId = item.chat_id;
    if (!label) label = item.name;
  } else {
    plainToken = rawToken;
  }

  if (!isValidTelegramBotTokenFormat(plainToken)) {
    return res.status(400).json({ success: false, error: 'Key / Bot Token Telegram tidak valid.' });
  }
  if (!chatId) {
    return res.status(400).json({ success: false, error: 'ID Chat Telegram tidak valid.' });
  }

  const testRes = await testTelegramNotification({
    botToken: plainToken,
    chatId,
    label,
    appId: getDisplayAppId()
  });

  if (!testRes.ok) {
    return res.status(400).json({
      success: false,
      error: `Gagal mengirim tes ke Telegram: ${testRes.error || 'Periksa kembali Bot Token, Chat ID, atau pastikan bot sudah di-Start di Telegram.'}`
    });
  }

  return res.json({
    success: true,
    message: `Tes notifikasi berhasil dikirim ke Chat ID ${chatId}!`
  });
});

app.post('/api/superadmin/pairing/assign', requireMasterUnlocked, async (req, res) => {
  const authUser = (req as any).authUser as UserAccount;
  const body = req.body || {};
  const rawAppId = typeof body.target_app_id === 'string' ? body.target_app_id.trim() : '';
  if (!rawAppId || !/^[a-zA-Z0-9._-]{1,64}$/.test(rawAppId) || rawAppId.toLowerCase() === 'undefined') {
    return res.status(400).json({ success: false, error: 'Target APP_ID wajib diisi (misal: 01, 02, app01).' });
  }
  const cleanTargetAppId = normalizeAppId(rawAppId);

  const authMethod = body.auth_method === 'qr_code' ? 'qr_code' : 'pairing_code';
  const cleanPhone = body.phone_number ? normalizePhoneNumber(String(body.phone_number || '')) : '';
  if (authMethod === 'pairing_code' && (!cleanPhone || cleanPhone.length < 9)) {
    return res.status(400).json({ success: false, error: 'Nomor WhatsApp wajib diisi (minimal 9 digit).' });
  }

  const requestedUserId = typeof body.user_id === 'string' && body.user_id.trim() ? body.user_id.trim() : authUser.id;
  const targetUser = getUserById(requestedUserId);
  if (!targetUser) {
    return res.status(404).json({ success: false, error: 'Akun pengguna pemilik sesi tidak ditemukan.' });
  }
  const rawSessionName = typeof body.session_name === 'string' ? body.session_name.trim().slice(0, 120) : '';

  let sessionId = '';
  try {
    sessionId = sanitizeSessionId(
      String(body.session_id || (cleanPhone ? `session_user_${targetUser.id}_${cleanPhone}` : `session_user_${targetUser.id}`))
    );
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message || 'ID sesi tidak valid.' });
  }

  try {
    const result = await assignPairingTargetToApp({
      sessionId,
      userId: targetUser.id,
      phoneNumber: cleanPhone,
      sessionName: rawSessionName || undefined,
      targetAppId: cleanTargetAppId,
      authMethod
    });
    res.json({
      ...result,
      data: await buildClusterMonitorResponsePayload()
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message || 'Gagal menugaskan pairing ke APP_ID.' });
  }
});

app.post('/api/superadmin/cluster-tick', requireMasterUnlocked, async (_req, res) => {
  try {
    const tickResult = await runAppNodeAssignmentTick('manual_superadmin');
    res.json({
      success: true,
      tick: tickResult,
      message: `Siklus tugas node ${tickResult.appId} selesai (dicek: ${tickResult.checked}, dibangun: ${tickResult.built}, didelegasikan: ${tickResult.delegated}, error: ${tickResult.errors}).`,
      data: await buildClusterMonitorResponsePayload()
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Gagal menjalankan siklus tugas node.' });
  }
});

// Return JSON 404 for unknown API endpoints instead of SPA HTML fallback
app.all('/api/*', (_req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint API tidak ditemukan.' });
});

// Global error handling middleware (never leak stack traces)
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server Error]', err?.message || err);
  if (res.headersSent) return;
  res.status(500).json({
    success: false,
    error: 'Terjadi kesalahan internal pada server.'
  });
});

// =============================================================
// STATIC / SPA VITE HANDLER & STARTUP
// =============================================================

async function startServer() {
  initDbFile();

  if (!isProductionRuntime) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const moduleDir = path.dirname(fileURLToPath(import.meta.url));
    const distCandidates = [
      path.join(process.cwd(), 'dist'),
      moduleDir,
      path.resolve(moduleDir, 'dist'),
      path.resolve(moduleDir, '..', 'dist')
    ];
    const distPath =
      distCandidates.find(dir => fs.existsSync(path.join(dir, 'index.html'))) ||
      path.join(process.cwd(), 'dist');
    const appRootDir =
      path.basename(distPath) === 'dist' ? path.dirname(distPath) : process.cwd();
    const indexHtmlPath = path.join(distPath, 'index.html');
    if (!fs.existsSync(indexHtmlPath)) {
      console.warn('[Production Build Notice] dist/index.html tidak ditemukan. Jalankan `npm run build` terlebih dahulu.');
    }

    const fallbackLogoPaths = [
      path.join(distPath, 'logo.jpg'),
      path.join(appRootDir, 'public', 'logo.jpg'),
      path.join(appRootDir, 'src', 'assets', 'images', 'japriin_logo_1791445508697.jpg')
    ];
    const serveBrandLogo = (_req: express.Request, res: express.Response, next: express.NextFunction) => {
      const existing = fallbackLogoPaths.find(p => fs.existsSync(p));
      if (existing) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.sendFile(existing);
      }
      next();
    };
    app.get('/logo.jpg', serveBrandLogo);
    app.get('/src/assets/images/japriin_logo_1791445508697.jpg', serveBrandLogo);

    // Block public access to compiled backend bundle, sourcemaps, and hidden dotfiles in dist/
    app.use((req, res, next) => {
      const reqPath = (req.path || '').toLowerCase();
      if (
        reqPath === '/server.js' ||
        reqPath === '/server.js.map' ||
        reqPath.endsWith('.map') ||
        reqPath.includes('/.')
      ) {
        return res.status(404).end();
      }
      next();
    });

    app.use(
      express.static(distPath, {
        etag: true,
        lastModified: true,
        maxAge: '7d',
        dotfiles: 'ignore',
        setHeaders: (res, filePath) => {
          const normalized = filePath.replace(/\\/g, '/');
          if (normalized.endsWith('/index.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          } else if (normalized.includes('/assets/')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        }
      })
    );
    app.get('*', (_req, res) => {
      if (!fs.existsSync(indexHtmlPath)) {
        return res.status(503).send('Aplikasi belum dibuild. Jalankan `npm run build` pada server.');
      }
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(indexHtmlPath);
    });
  }

  const onListening = () => {
    const displayAddr = typeof PORT === 'number' ? `http://0.0.0.0:${PORT}` : String(PORT);
    console.log(`====================================================`);
    console.log(`Japriin Server Running on ${displayAddr} (${isProductionRuntime ? 'production' : 'development'})`);
    console.log(`WhatsApp Engine: Baileys Multi-Device & Meta AI`);
    console.log(`Developer REST API v1: ${displayAddr}/api/v1/status`);
    console.log(`====================================================`);

    setBaileysStartupPending(true);
    const startupMysqlSync = initMysqlSchemaIfNotExists()
      .then(async ok => {
        if (!ok) return;
        const remote = await fetchDatabaseFromMysql().catch(() => null);
        if (remote?.users && remote.users.some((u: UserAccount) => u.role === 'admin')) {
          replaceRuntimeDatabaseFromMysql(remote);
        } else {
          const db = initDbFile();
          const seededAdmin = db.users.find(u => u.role === 'admin');
          if (seededAdmin) {
            await pushUserToMysql(seededAdmin).catch(() => {});
          }
        }
      })
      .catch(err => {
        console.warn('[Online DB] Inisialisasi latar belakang:', err?.message);
      });

    Promise.race([
      startupMysqlSync,
      new Promise<void>(resolve => setTimeout(resolve, 7000))
    ]).finally(() => {
      restoreSavedBaileysSessions()
        .catch(err => {
          console.warn('[Baileys Auto-Restore] Peringatan:', err?.message);
        })
        .finally(() => {
          setBaileysStartupPending(false);
        });
    });

    // Optional production self-pinger when host uses HTTP traffic to stay awake (SSRF-guarded)
    if (isProductionRuntime && process.env.KEEPALIVE_SELF_PING === 'true') {
      const candidateBaseUrl = (process.env.APP_URL || getSystemConfig().app_url || '').trim().replace(/\/+$/, '');
      if (isSafeHttpUrl(candidateBaseUrl)) {
        try {
          const parsedHost = new URL(candidateBaseUrl).hostname.toLowerCase();
          if (parsedHost !== 'localhost' && parsedHost !== '127.0.0.1' && parsedHost !== '::1') {
            const selfPingTimer = setInterval(() => {
              fetch(`${candidateBaseUrl}/api/cron/keepalive`, {
                method: 'GET',
                signal: AbortSignal.timeout(4000)
              }).catch(() => {});
            }, 4 * 60 * 1000);
            selfPingTimer.unref?.();
          }
        } catch {
          // Ignore invalid URL
        }
      }
    }
  };

  const httpServer = http.createServer(app);
  const clusterWss = new WebSocketServer({
    noServer: true,
    maxPayload: 64 * 1024
  });

  httpServer.on('upgrade', (req, socket, head) => {
    try {
      const reqUrl = String(req.url || '/');
      const parsedUrl = new URL(reqUrl, 'http://localhost');
      if (parsedUrl.pathname !== '/ws/cluster') {
        // Leave non-cluster WebSocket upgrades (e.g. Vite HMR) untouched
        return;
      }

      const rawHeaderToken = req.headers['x-cluster-ping-token'];
      const token = Array.isArray(rawHeaderToken)
        ? String(rawHeaderToken[0] || '').trim()
        : String(rawHeaderToken || '').trim();

      const verified = verifyClusterPingOrWsToken(token, 'cluster_ws');
      if (!verified.ok) {
        socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }

      clusterWss.handleUpgrade(req, socket, head, ws => {
        handleClusterWsConnection(ws, {
          fromApp: verified.fromApp,
          fromInstance: verified.fromInstance
        });
      });
    } catch {
      try {
        socket.destroy();
      } catch {}
    }
  });

  activeHttpServer = httpServer;
  activeClusterWss = clusterWss;

  if (typeof PORT === 'number') {
    httpServer.listen(PORT, '0.0.0.0', onListening);
  } else {
    httpServer.listen(PORT, onListening);
  }
}

let activeHttpServer: http.Server | null = null;
let activeClusterWss: WebSocketServer | null = null;

process.on('unhandledRejection', (reason: any) => {
  console.warn('[Server Protective Guard] Unhandled rejection ditangani aman:', reason?.message || reason);
});

process.on('uncaughtException', (err: any) => {
  console.error('[Server Protective Guard] Uncaught exception:', err?.message || err);
});

for (const sig of ['SIGINT', 'SIGTERM', 'beforeExit'] as const) {
  process.on(sig, () => {
    flushLocalDbToDisk();
    if (sig !== 'beforeExit') {
      closeAllClusterMeshWebSockets();
      try {
        activeClusterWss?.close();
        activeHttpServer?.close();
      } catch {}
      void Promise.race([
        shutdownBaileysManager().catch(() => {}),
        new Promise<void>(resolve => setTimeout(resolve, 2200))
      ]).finally(() => {
        void closeMysqlPool().finally(() => process.exit(0));
      });
    }
  });
}

startServer();
