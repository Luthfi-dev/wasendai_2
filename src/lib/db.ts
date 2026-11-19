import crypto from 'crypto';
import fs from 'fs';
import net from 'net';
import path from 'path';
import {
  WhatsAppMessageLog,
  AutoReplyRule,
  BotStats,
  WhatsAppSession,
  AntiBanSettings,
  UserAccount,
  SubscriptionPlan,
  SmtpAccount,
  GeminiApiKey,
  SystemConfig,
  AiBotConfig,
  AppWhitelabelConfig,
  RemoteBotChallenge,
  CatalogProduct,
  CatalogSettings,
  CatalogPaymentAccount,
  SuperadminWaQueueItem,
  PendingSessionExpiryAlert,
  PendingMissedMessageItem,
  AutoReplyStatusInfo,
  GlobalSlotStatus,
  AppNodeConfig,
  KillTargetIpRule,
  TelegramConfigItem
} from '../types/whatsapp.js';
import {
  encryptData,
  decryptData,
  hashPassword,
  hashPin,
  verifyPin,
  safeEqual,
  verifyMasterPin,
  generateOtpCode,
  generateApiKey,
  maskSensitiveString
} from './security.js';

const RUNTIME_DB_PATH = path.resolve(process.cwd(), '.runtime_db.enc');
let cachedMemoryDb: LocalDatabase | null = null;
let lastLocalMutationAt = 0;
let lastLoadedDbMtimeMs = 0;
let lastDiskStatCheckedAt = 0;

function syncDbFileMtimeMarker(): void {
  try {
    const st = fs.statSync(RUNTIME_DB_PATH);
    lastLoadedDbMtimeMs = st.mtimeMs;
    lastDiskStatCheckedAt = Date.now();
  } catch {
    // Ignore stat errors
  }
}

function loadEncryptedLocalDb(): LocalDatabase | null {
  if (process.env.JAPRIIN_EPHEMERAL_DB === '1') return null;
  try {
    if (!fs.existsSync(RUNTIME_DB_PATH)) return null;
    const raw = fs.readFileSync(RUNTIME_DB_PATH, 'utf8').trim();
    if (!raw) return null;
    const decrypted = decryptData(raw);
    if (!decrypted) return null;
    const parsed = JSON.parse(decrypted) as Partial<LocalDatabase>;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.users)) {
      return null;
    }
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      broadcastHistory: Array.isArray(parsed.broadcastHistory) ? parsed.broadcastHistory : [],
      rules: Array.isArray(parsed.rules) ? parsed.rules : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      antiBan: parsed.antiBan ? { ...DEFAULT_ANTIBAN, ...parsed.antiBan } : DEFAULT_ANTIBAN,
      users: parsed.users.map(u => ({ ...u, max_sessions: 1 })),
      plans: (Array.isArray(parsed.plans) && parsed.plans.length > 0 ? parsed.plans : DEFAULT_SUBSCRIPTION_PLANS).map(
        normalizeSubscriptionPlan
      ),
      smtpAccounts: Array.isArray(parsed.smtpAccounts) ? parsed.smtpAccounts : [],
      geminiKeys: Array.isArray(parsed.geminiKeys) ? parsed.geminiKeys : [],
      systemConfig: parsed.systemConfig
        ? {
            ...DEFAULT_SYSTEM_CONFIG,
            ...parsed.systemConfig,
            max_global_sessions:
              normalizeMaxGlobalSessions(parsed.systemConfig.max_global_sessions) ?? DEFAULT_MAX_GLOBAL_SESSIONS,
            ai_config: { ...DEFAULT_AI_CONFIG, ...(parsed.systemConfig.ai_config || {}) },
            qris_config: { ...DEFAULT_QRIS_CONFIG, ...(parsed.systemConfig.qris_config || {}) },
            whitelabel_config: {
              ...DEFAULT_WHITELABEL,
              ...(parsed.systemConfig.whitelabel_config || {}),
              logo_url: normalizeWhitelabelLogoUrl(parsed.systemConfig.whitelabel_config?.logo_url)
            },
            app_nodes: normalizeAppNodes(parsed.systemConfig.app_nodes),
            kill_target_ips: normalizeKillTargetIps(parsed.systemConfig.kill_target_ips),
            admin_notify_phone: normalizeAdminNotifyPhone(parsed.systemConfig.admin_notify_phone),
            telegram_bot_token: normalizeStoredTelegramToken(parsed.systemConfig.telegram_bot_token),
            telegram_chat_id: normalizeTelegramChatId(parsed.systemConfig.telegram_chat_id),
            telegram_enabled: parsed.systemConfig.telegram_enabled !== undefined ? Boolean(parsed.systemConfig.telegram_enabled) : true,
            telegram_configs: normalizeTelegramConfigs(parsed.systemConfig.telegram_configs)
          }
        : DEFAULT_SYSTEM_CONFIG,
      catalogProducts: Array.isArray(parsed.catalogProducts) ? parsed.catalogProducts : [],
      catalogSettings: parsed.catalogSettings && typeof parsed.catalogSettings === 'object' ? parsed.catalogSettings : {},
      superadminWaQueue: Array.isArray(parsed.superadminWaQueue) ? parsed.superadminWaQueue : [],
      expiredSessionAlertKeys:
        parsed.expiredSessionAlertKeys && typeof parsed.expiredSessionAlertKeys === 'object'
          ? parsed.expiredSessionAlertKeys
          : {},
      pendingSessionExpiryAlerts: Array.isArray(parsed.pendingSessionExpiryAlerts)
        ? parsed.pendingSessionExpiryAlerts
        : [],
      handledIncomingMessages:
        parsed.handledIncomingMessages && typeof parsed.handledIncomingMessages === 'object'
          ? parsed.handledIncomingMessages
          : {},
      chatReplyWatermark:
        parsed.chatReplyWatermark && typeof parsed.chatReplyWatermark === 'object'
          ? parsed.chatReplyWatermark
          : {},
      pendingMissedMessages: Array.isArray(parsed.pendingMissedMessages)
        ? parsed.pendingMissedMessages
        : [],
      stats: parsed.stats || {
        total_incoming: 0,
        total_auto_replied: 0,
        total_failed: 0,
        total_ai_replied: 0
      }
    };
  } catch (err: any) {
    console.warn('[Local DB Load] Failed to decrypt/parse .runtime_db.enc:', err?.message);
    return null;
  }
}

let pendingPersistTimer: NodeJS.Timeout | null = null;
let isPersistingLocalDb = false;
let needsAnotherPersist = false;

function saveEncryptedLocalDb(data: LocalDatabase): void {
  if (process.env.JAPRIIN_EPHEMERAL_DB === '1') return;
  try {
    const encrypted = encryptData(JSON.stringify(data));
    const tmpPath = `${RUNTIME_DB_PATH}.${process.pid}.tmp`;
    fs.writeFileSync(tmpPath, encrypted, { mode: 0o600 });
    fs.renameSync(tmpPath, RUNTIME_DB_PATH);
    syncDbFileMtimeMarker();
  } catch (err: any) {
    console.warn('[Local DB Save] Failed to persist .runtime_db.enc:', err?.message);
  }
}

async function saveEncryptedLocalDbAsync(data: LocalDatabase): Promise<void> {
  if (process.env.JAPRIIN_EPHEMERAL_DB === '1') return;
  if (isPersistingLocalDb) {
    needsAnotherPersist = true;
    return;
  }
  isPersistingLocalDb = true;
  try {
    const encrypted = encryptData(JSON.stringify(data));
    const tmpPath = `${RUNTIME_DB_PATH}.${process.pid}.tmp`;
    await fs.promises.writeFile(tmpPath, encrypted, { mode: 0o600 });
    await fs.promises.rename(tmpPath, RUNTIME_DB_PATH);
    syncDbFileMtimeMarker();
  } catch (err: any) {
    console.warn('[Local DB Save] Failed to persist .runtime_db.enc:', err?.message);
  } finally {
    isPersistingLocalDb = false;
    if (needsAnotherPersist && cachedMemoryDb) {
      needsAnotherPersist = false;
      saveEncryptedLocalDbAsync(cachedMemoryDb).catch(() => {});
    }
  }
}

export function flushLocalDbToDisk(): void {
  if (pendingPersistTimer) {
    clearTimeout(pendingPersistTimer);
    pendingPersistTimer = null;
  }
  if (cachedMemoryDb) {
    saveEncryptedLocalDb(cachedMemoryDb);
  }
}

function markMutated() {
  lastLocalMutationAt = Date.now();
}

function asyncSyncMessage(msg: WhatsAppMessageLog) {
  markMutated();
  import('./mysqlService.js').then(m => m.pushMessageToMysql(msg)).catch(() => {});
}

function asyncClearMessages(userId?: string) {
  markMutated();
  import('./mysqlService.js').then(m => m.clearMessagesFromMysql(userId)).catch(() => {});
}

function asyncSyncSession(sess: WhatsAppSession) {
  markMutated();
  import('./mysqlService.js').then(m => m.pushSessionToMysql(sess)).catch(() => {});
}

function asyncDeleteSession(id: string, phoneNumber?: string) {
  markMutated();
  import('./mysqlService.js').then(m => m.deleteSessionFromMysql(id, phoneNumber)).catch(() => {});
}

function asyncSyncUser(u: UserAccount) {
  markMutated();
  import('./mysqlService.js').then(m => m.pushUserToMysql(u)).catch(() => {});
}

function asyncDeleteUser(id: string) {
  markMutated();
  import('./mysqlService.js').then(m => m.deleteUserFromMysql(id)).catch(() => {});
}

function asyncSyncRule(r: AutoReplyRule) {
  markMutated();
  import('./mysqlService.js').then(m => m.pushRuleToMysql(r)).catch(() => {});
}

function asyncDeleteRule(id: string) {
  markMutated();
  import('./mysqlService.js').then(m => m.deleteRuleFromMysql(id)).catch(() => {});
}

function asyncSyncSmtp(acc: SmtpAccount) {
  markMutated();
  import('./mysqlService.js').then(m => m.pushSmtpAccountToMysql(acc)).catch(() => {});
}

function asyncSyncGeminiKey(key: GeminiApiKey) {
  markMutated();
  import('./mysqlService.js').then(m => m.pushGeminiKeyToMysql(key)).catch(() => {});
}

function asyncDeleteGeminiKey(id: string) {
  markMutated();
  import('./mysqlService.js').then(m => m.deleteGeminiKeyFromMysql(id)).catch(() => {});
}

function asyncSyncKv(key: string, val: any) {
  markMutated();
  import('./mysqlService.js').then(m => m.pushKvSettingToMysql(key, val)).catch(() => {});
}

export function replaceRuntimeDatabaseFromMysql(remote: any): void {
  const db = initDbFile();
  if (!remote) return;

  if (remote.users && Array.isArray(remote.users) && remote.users.length > 0) {
    const localMap = new Map(db.users.map(u => [u.id, u]));
    db.users = remote.users.map((ru: UserAccount) => {
      const local = localMap.get(ru.id);
      const emailVerified = Boolean(ru.email_verified) || Boolean(local?.email_verified);
      const waVerified = Boolean(ru.wa_verified) || Boolean(local?.wa_verified);
      const isActive = Boolean(ru.is_active) || Boolean(local?.is_active);
      return {
        ...local,
        ...ru,
        max_sessions: 1,
        wa_verified: waVerified,
        email_verified: emailVerified,
        is_active: isActive,
        plan_status:
          ru.plan_id === 'free' || !ru.plan_id
            ? 'active'
            : ru.plan_status || local?.plan_status || 'active',
        last_login_device: local?.last_login_device || ru.last_login_device,
        assigned_app_id:
          ru.assigned_app_id !== undefined
            ? (normalizeAppIdValue(ru.assigned_app_id) || undefined)
            : (normalizeAppIdValue(local?.assigned_app_id) || undefined),
        approved_at: local?.approved_at || ru.approved_at,
        rules_initialized: local?.rules_initialized ?? true
      };
    });
  }

  if (
    remote.smtpAccounts &&
    Array.isArray(remote.smtpAccounts) &&
    (remote.smtpAccounts.length > 0 || (Array.isArray(remote.users) && remote.users.length > 0))
  ) {
    const localSmtpMap = new Map((db.smtpAccounts || []).map(s => [s.id, s]));
    db.smtpAccounts = remote.smtpAccounts.map((rs: SmtpAccount) => {
      const local = localSmtpMap.get(rs.id);
      const keepLocalError =
        !rs.last_error &&
        Boolean(local?.last_error) &&
        rs.pass === local?.pass &&
        (rs.success_count || 0) <= (local?.success_count || 0);
      return {
        ...local,
        ...rs,
        last_error: rs.last_error || (keepLocalError ? local?.last_error : '')
      };
    });
  }

  if (remote.geminiKeys && Array.isArray(remote.geminiKeys) && remote.geminiKeys.length > 0) {
    db.geminiKeys = remote.geminiKeys;
  }

  if (remote.sessions && Array.isArray(remote.sessions) && remote.sessions.length > 0) {
    const localSessMap = new Map(db.sessions.map(s => [s.id, s]));
    const remoteIds = new Set(remote.sessions.map((rs: WhatsAppSession) => rs.id));
    const mergedSessions = remote.sessions.map((rs: WhatsAppSession) => {
      const local = localSessMap.get(rs.id);
      const resolvedUserId =
        rs.user_id ||
        local?.user_id ||
        extractUserIdFromSessionId(rs.id, db.users || []);
      const resolvedStatus =
        local?.status === 'connected' ? 'connected' : rs.status || local?.status || 'disconnected';
      const resolvedAiEnabled =
        'ai_enabled' in rs && rs.ai_enabled !== undefined
          ? (rs.ai_enabled === null ? null : Boolean(rs.ai_enabled))
          : (local?.ai_enabled !== undefined ? local.ai_enabled : null);
      const resolvedCustomPrompt =
        typeof rs.custom_system_prompt === 'string'
          ? rs.custom_system_prompt
          : (local?.custom_system_prompt || '');
      const resolvedFailedApps = Array.isArray(rs.failed_app_ids)
        ? rs.failed_app_ids.map(x => normalizeAppIdValue(x)).filter(Boolean)
        : (Array.isArray(local?.failed_app_ids) ? local!.failed_app_ids : []);
      return {
        ...local,
        ...rs,
        user_id: resolvedUserId,
        status: resolvedStatus,
        is_primary: Boolean(rs.is_primary),
        ai_enabled: resolvedAiEnabled,
        custom_system_prompt: resolvedCustomPrompt,
        assigned_app_id:
          rs.assignment_status === 'released'
            ? undefined
            : (normalizeAppIdValue(rs.assigned_app_id) || (rs.assigned_app_id === undefined ? normalizeAppIdValue(local?.assigned_app_id) || undefined : undefined)),
        assigned_server_ip:
          normalizeServerIpValue(rs.assigned_server_ip) ||
          (rs.assigned_server_ip === undefined ? normalizeServerIpValue(local?.assigned_server_ip) || undefined : undefined),
        connected_app_id:
          rs.assignment_status === 'released'
            ? undefined
            : (normalizeAppIdValue(rs.connected_app_id) || (rs.connected_app_id === undefined ? normalizeAppIdValue(local?.connected_app_id) || undefined : undefined)),
        connected_server_ip:
          rs.assignment_status === 'released'
            ? undefined
            : (normalizeServerIpValue(rs.connected_server_ip) || (rs.connected_server_ip === undefined ? normalizeServerIpValue(local?.connected_server_ip) || undefined : undefined)),
        failed_app_ids: resolvedFailedApps,
        assignment_status: rs.assignment_status || local?.assignment_status,
        assignment_error: rs.assignment_error !== undefined ? rs.assignment_error : local?.assignment_error,
        last_assignment_at: rs.last_assignment_at || local?.last_assignment_at,
        connected_at: rs.connected_at || local?.connected_at || (resolvedStatus === 'connected' ? new Date().toISOString() : undefined),
        expires_at:
          rs.expires_at ||
          local?.expires_at ||
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      };
    });
    for (const localSess of db.sessions) {
      if (
        localSess.id &&
        !remoteIds.has(localSess.id) &&
        (localSess.status === 'connected' || Boolean(localSess.connected_at))
      ) {
        mergedSessions.push(localSess);
      }
    }
    db.sessions = mergedSessions;
  }

  if (remote.rules && Array.isArray(remote.rules) && remote.rules.length > 0) {
    const localRuleMap = new Map(db.rules.map(r => [r.id, r]));
    db.rules = remote.rules.map((rr: AutoReplyRule) => {
      const local = localRuleMap.get(rr.id);
      let resolvedUserId = rr.user_id || local?.user_id;
      if (!resolvedUserId && typeof rr?.id === 'string' && rr.id.startsWith('rule_halo_')) {
        resolvedUserId = rr.id.replace('rule_halo_', '');
      }
      return {
        ...local,
        ...rr,
        user_id: resolvedUserId || 'user_superadmin',
        is_active: Boolean(rr.is_active)
      };
    });
  }

  if (remote.messages && Array.isArray(remote.messages) && remote.messages.length > 0) {
    db.messages = remote.messages;
  }

  if (remote.kvMap) {
    if (remote.kvMap.systemConfig) {
      db.systemConfig = {
        ...db.systemConfig,
        ...remote.kvMap.systemConfig,
        app_nodes:
          remote.kvMap.systemConfig.app_nodes !== undefined
            ? normalizeAppNodes(remote.kvMap.systemConfig.app_nodes)
            : normalizeAppNodes(db.systemConfig.app_nodes),
        kill_target_ips:
          remote.kvMap.systemConfig.kill_target_ips !== undefined
            ? normalizeKillTargetIps(remote.kvMap.systemConfig.kill_target_ips)
            : normalizeKillTargetIps(db.systemConfig.kill_target_ips),
        admin_notify_phone:
          remote.kvMap.systemConfig.admin_notify_phone !== undefined
            ? normalizeAdminNotifyPhone(remote.kvMap.systemConfig.admin_notify_phone)
            : normalizeAdminNotifyPhone(db.systemConfig.admin_notify_phone),
        telegram_bot_token:
          remote.kvMap.systemConfig.telegram_bot_token !== undefined
            ? normalizeStoredTelegramToken(remote.kvMap.systemConfig.telegram_bot_token)
            : normalizeStoredTelegramToken(db.systemConfig.telegram_bot_token),
        telegram_chat_id:
          remote.kvMap.systemConfig.telegram_chat_id !== undefined
            ? normalizeTelegramChatId(remote.kvMap.systemConfig.telegram_chat_id)
            : normalizeTelegramChatId(db.systemConfig.telegram_chat_id),
        telegram_enabled:
          remote.kvMap.systemConfig.telegram_enabled !== undefined
            ? Boolean(remote.kvMap.systemConfig.telegram_enabled)
            : db.systemConfig.telegram_enabled !== false,
        telegram_configs:
          remote.kvMap.systemConfig.telegram_configs !== undefined
            ? normalizeTelegramConfigs(remote.kvMap.systemConfig.telegram_configs)
            : normalizeTelegramConfigs(db.systemConfig.telegram_configs),
        app_url: process.env.APP_URL?.trim() || remote.kvMap.systemConfig.app_url || db.systemConfig.app_url,
        mysql_host: process.env.MYSQL_HOST?.trim() || remote.kvMap.systemConfig.mysql_host || db.systemConfig.mysql_host,
        mysql_port: Number(process.env.MYSQL_PORT) || remote.kvMap.systemConfig.mysql_port || db.systemConfig.mysql_port,
        mysql_user: process.env.MYSQL_USER?.trim() || remote.kvMap.systemConfig.mysql_user || db.systemConfig.mysql_user,
        mysql_database: process.env.MYSQL_DATABASE?.trim() || remote.kvMap.systemConfig.mysql_database || db.systemConfig.mysql_database,
        mysql_password: process.env.MYSQL_PASSWORD
          ? encryptData(process.env.MYSQL_PASSWORD)
          : (remote.kvMap.systemConfig.mysql_password || db.systemConfig.mysql_password)
      };
    }
    if (remote.kvMap.qris && typeof remote.kvMap.qris === 'object' && Object.keys(remote.kvMap.qris).length > 0) {
      db.systemConfig = {
        ...db.systemConfig,
        qris_config: {
          ...db.systemConfig.qris_config,
          ...remote.kvMap.qris
        }
      };
    }
    if (Array.isArray(remote.kvMap.plans) && remote.kvMap.plans.length > 0) {
      db.plans = remote.kvMap.plans.map((p: SubscriptionPlan) => normalizeSubscriptionPlan(p));
    }
    if (remote.kvMap.antiBan) {
      db.antiBan = { ...db.antiBan, ...remote.kvMap.antiBan };
    }
    if (Array.isArray(remote.kvMap.broadcastHistory)) {
      db.broadcastHistory = remote.kvMap.broadcastHistory;
    }
    if (Array.isArray(remote.kvMap.catalogProducts)) {
      db.catalogProducts = remote.kvMap.catalogProducts;
    }
    if (remote.kvMap.catalogSettings && typeof remote.kvMap.catalogSettings === 'object') {
      db.catalogSettings = { ...(db.catalogSettings || {}), ...remote.kvMap.catalogSettings };
    }
    if (Array.isArray(remote.kvMap.superadminWaQueue)) {
      const mergedQueue = new Map<string, SuperadminWaQueueItem>();
      for (const item of remote.kvMap.superadminWaQueue) {
        if (item?.id) mergedQueue.set(item.id, item);
      }
      for (const item of db.superadminWaQueue || []) {
        if (item?.id) mergedQueue.set(item.id, item);
      }
      db.superadminWaQueue = Array.from(mergedQueue.values()).slice(0, 500);
    }
    if (remote.kvMap.expiredSessionAlertKeys && typeof remote.kvMap.expiredSessionAlertKeys === 'object') {
      db.expiredSessionAlertKeys = { ...remote.kvMap.expiredSessionAlertKeys };
    }
    if (Array.isArray(remote.kvMap.pendingSessionExpiryAlerts)) {
      const mergedPending = new Map<string, PendingSessionExpiryAlert>();
      for (const item of remote.kvMap.pendingSessionExpiryAlerts) {
        if (item?.key) mergedPending.set(item.key, item);
      }
      for (const item of db.pendingSessionExpiryAlerts || []) {
        if (item?.key) {
          const prev = mergedPending.get(item.key);
          if (!prev || Date.parse(item.first_detected_at) <= Date.parse(prev.first_detected_at)) {
            mergedPending.set(item.key, item);
          }
        }
      }
      db.pendingSessionExpiryAlerts = Array.from(mergedPending.values()).slice(-500);
    }
    if (remote.kvMap.handledIncomingMessages && typeof remote.kvMap.handledIncomingMessages === 'object') {
      const mergedHandled: Record<string, number> = {
        ...remote.kvMap.handledIncomingMessages,
        ...(db.handledIncomingMessages || {})
      };
      db.handledIncomingMessages = pruneTimestampMap(mergedHandled, HANDLED_MSG_RETENTION_MS, MAX_HANDLED_INCOMING_MESSAGES);
    }
    if (remote.kvMap.chatReplyWatermark && typeof remote.kvMap.chatReplyWatermark === 'object') {
      const mergedWm: Record<string, number> = { ...(db.chatReplyWatermark || {}) };
      for (const [k, v] of Object.entries(remote.kvMap.chatReplyWatermark)) {
        const ts = Number(v);
        if (Number.isFinite(ts) && ts > (mergedWm[k] || 0)) {
          mergedWm[k] = ts;
        }
      }
      db.chatReplyWatermark = pruneTimestampMap(mergedWm, CHAT_WATERMARK_RETENTION_MS, MAX_CHAT_REPLY_WATERMARKS);
    }
    if (Array.isArray(remote.kvMap.pendingMissedMessages)) {
      const cutoff = Date.now() - MISSED_MSG_RETENTION_MS;
      const mergedMissed = new Map<string, PendingMissedMessageItem>();
      for (const item of remote.kvMap.pendingMissedMessages) {
        if (!item?.id || !item?.session_id || !item?.wam_id) continue;
        const createdMs = Date.parse(item.created_at || '');
        if (Number.isFinite(createdMs) && createdMs < cutoff) continue;
        mergedMissed.set(item.id, item);
      }
      for (const item of db.pendingMissedMessages || []) {
        if (!item?.id || !item?.session_id || !item?.wam_id) continue;
        const createdMs = Date.parse(item.created_at || '');
        if (Number.isFinite(createdMs) && createdMs < cutoff) continue;
        mergedMissed.set(item.id, item);
      }
      db.pendingMissedMessages = Array.from(mergedMissed.values()).slice(-MAX_PENDING_MISSED_MESSAGES);
    }
    if (remote.kvMap.stats) {
      db.stats = { ...db.stats, ...remote.kvMap.stats };
    }
  }
}

let mysqlModulePromise: Promise<typeof import('./mysqlService.js')> | null = null;
function getMysqlModule() {
  if (!mysqlModulePromise) {
    mysqlModulePromise = import('./mysqlService.js');
  }
  return mysqlModulePromise;
}

// Periodic background reconciliation from Online MySQL Database (every 3 minutes, only when MySQL configured)
let isMysqlSyncInFlight = false;
const mysqlBgSyncTimer = setInterval(() => {
  if (isMysqlSyncInFlight || Date.now() - lastLocalMutationAt < 4000) {
    return;
  }
  isMysqlSyncInFlight = true;
  getMysqlModule()
    .then(async m => {
      if (!m.isMysqlConfigured()) return;
      const remote = await m.fetchDatabaseFromMysql();
      if (Date.now() - lastLocalMutationAt < 4000) {
        return;
      }
      if (remote) {
        replaceRuntimeDatabaseFromMysql(remote);
      }
    })
    .catch(() => {})
    .finally(() => {
      isMysqlSyncInFlight = false;
    });
}, 3 * 60 * 1000);
mysqlBgSyncTimer.unref?.();

export interface BroadcastLogEntry {
  id: string;
  user_id?: string;
  session_id?: string;
  recipients_count: number;
  message: string;
  status: 'completed' | 'scheduled' | 'running' | 'failed';
  success_count: number;
  failed_count: number;
  scheduled_at?: string;
  created_at: string;
}

export const LOG_RETENTION_DAYS = 7;
export const LOG_RETENTION_MS = LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export interface LocalDatabase {
  messages: WhatsAppMessageLog[];
  broadcastHistory?: BroadcastLogEntry[];
  rules: AutoReplyRule[];
  sessions: WhatsAppSession[];
  antiBan: AntiBanSettings;
  users: UserAccount[];
  plans: SubscriptionPlan[];
  smtpAccounts: SmtpAccount[];
  geminiKeys: GeminiApiKey[];
  systemConfig: SystemConfig;
  catalogProducts?: CatalogProduct[];
  catalogSettings?: Record<string, CatalogSettings>;
  superadminWaQueue?: SuperadminWaQueueItem[];
  expiredSessionAlertKeys?: Record<string, string>;
  pendingSessionExpiryAlerts?: PendingSessionExpiryAlert[];
  handledIncomingMessages?: Record<string, number>;
  chatReplyWatermark?: Record<string, number>;
  pendingMissedMessages?: PendingMissedMessageItem[];
  stats: {
    total_incoming: number;
    total_auto_replied: number;
    total_failed: number;
    total_ai_replied?: number;
    last_message_at?: string;
  };
}

const DEFAULT_ANTIBAN: AntiBanSettings = {
  enabled: true,
  min_delay_seconds: 1,
  max_delay_seconds: 4,
  typing_simulation: true,
  max_messages_per_minute: 15,
  daily_quota_per_number: 500,
  read_receipt_simulation: true
};

const DEFAULT_AI_CONFIG: AiBotConfig = {
  enabled: true,
  system_prompt: 'Anda adalah Customer Service Assistant untuk bisnis yang ramah nama kamu Anita, sopan, ringkas, dan solutif. Jawab pertanyaan pelanggan dengan ramah dalam Bahasa Indonesia yang natural. Jika tidak tahu pasti mengenai stok atau harga spesifik, sampaikan bahwa tim CS manusia akan segera merespons. Ingat jangan menjawab sesuatu yg kamu tidak ketahui pasti jawab saja team kami akan segera membalas untuk hal itu.',
  model: 'meta-ai-whatsapp',
  fallback_when_no_rule: true,
  temperature: 0.7,
  offline_fallback_message: 'Halo! Terima kasih telah menghubungi kami. Maaf saat ini petugas/CS kami sedang offline. Kami akan membalas pesan Anda sesegera mungkin.'
};

const DEFAULT_QRIS_CONFIG = {
  image_url: 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=00020101021126580014ID.LINKAJA.WWW01189360091432263435130208123456785204581253033605802ID5913JAPRIIN6007BANDUNG61054011562070703A016304E8A2',
  account_name: 'Japriin Official',
  bank_name: 'QRIS (Semua Bank / E-Wallet) & Bank BCA',
  account_number: '123-456-7890 a.n Japriin Media',
  instructions: '1. Buka aplikasi M-Banking atau E-Wallet (BCA, Mandiri, BRI, GoPay, OVO, Dana, ShopeePay)\n2. Scan barcode QRIS di atas atau transfer ke rekening BCA 123-456-7890\n3. Masukkan nominal sesuai harga paket yang dipilih\n4. Simpan / Screenshot bukti struk transfer\n5. Upload foto struk di bawah untuk diperiksa oleh Superadmin'
};

export function normalizeWhitelabelLogoUrl(rawUrl?: string | null): string {
  const trimmed = String(rawUrl || '').trim();
  if (
    !trimmed ||
    trimmed === '/src/assets/images/japriin_logo_1791445508697.jpg' ||
    trimmed === 'src/assets/images/japriin_logo_1791445508697.jpg' ||
    trimmed === './src/assets/images/japriin_logo_1791445508697.jpg'
  ) {
    return '/logo.jpg';
  }
  return trimmed;
}

export const DEFAULT_WHITELABEL: AppWhitelabelConfig = {
  app_name: 'Japriin',
  tagline: 'Whitelabel WhatsApp Gateway, Interactive REST API & Remote AI Bot',
  logo_url: '/logo.jpg',
  company_name: 'Maudigi Teknologi Indonesia',
  support_phone: '081234567890',
  primary_bot_phone: '085761010112',
  primary_bot_name: 'Japriin Assistant Pusat',
  footer_text: 'Dikelola secara profesional oleh maudigi.com',
  api_enabled: true,
  updated_at: new Date().toISOString()
};

export const DEFAULT_SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'free',
    name: 'Paket Gratis',
    price: 0,
    period: 'selamanya',
    max_sessions: 1,
    daily_msg_limit: 100,
    monthly_msg_limit: 500,
    daily_ai_limit: 100,
    monthly_ai_limit: 500,
    is_active: true,
    features: [
      '1 Nomor WhatsApp Terhubung',
      'Balas Otomatis Penuh Tanpa Batas Jam',
      '100 Pesan Otomatis / Hari',
      'Respon AI Tanpa Batas Terpisah (Ikuti Batas Chat Harian)',
      '100% Tanpa Watermark (Pesan Murni)',
      'Akses Remote Bot Assistant WA',
      'Aturan Balas Otomatis Bebas Atur',
      'Simulasi Ketik Proteksi Anti-Ban',
      'Langsung Aktif Tanpa Biaya (Rp 0)'
    ]
  },
  {
    id: 'starter',
    name: 'Paket Starter',
    price: 50000,
    period: '/ bulan',
    max_sessions: 1,
    daily_msg_limit: 500,
    monthly_msg_limit: 15000,
    daily_ai_limit: 150,
    monthly_ai_limit: 3000,
    is_active: true,
    features: [
      '1 Nomor WhatsApp Terhubung',
      '500 Pesan Otomatis / Hari',
      'Batas Respon AI 150 / Hari (3.000/bln)',
      '100% Tanpa Watermark / No Ads',
      'Prioritas Slot Kapasitas Server (Aman dari Geseran)',
      'Akses Developer REST API v1',
      'Sistem Proteksi Anti-Ban Guard',
      'Aturan Balas Otomatis Tanpa Batas',
      'Log Pesan & Export data.sql'
    ]
  },
  {
    id: 'business',
    name: 'Paket Business',
    price: 85000,
    period: '/ bulan',
    max_sessions: 1,
    daily_msg_limit: 2500,
    monthly_msg_limit: 75000,
    daily_ai_limit: 500,
    monthly_ai_limit: 15000,
    popular: true,
    is_active: true,
    features: [
      '1 Nomor WhatsApp Terhubung',
      '2.500 Pesan Otomatis / Hari',
      'Batas Respon AI 500 / Hari (15.000/bln)',
      '100% Tanpa Watermark (Whitelabel)',
      'Prioritas Slot Kapasitas Server (Aman dari Geseran)',
      'Interactive REST API v1 Terbuka',
      'Advance Anti-Ban & Jeda Acak',
      'Simulasi Ketik Status & Read Receipt',
      'Fitur Balas Otomatis AI (Multi-Key)'
    ]
  },
  {
    id: 'pro',
    name: 'Paket Unlimited Pro',
    price: 99000,
    period: '/ bulan',
    max_sessions: 1,
    daily_msg_limit: 10000,
    monthly_msg_limit: 300000,
    daily_ai_limit: 2000,
    monthly_ai_limit: 60000,
    is_active: true,
    features: [
      '1 Nomor WhatsApp Terhubung',
      '10.000 Pesan Otomatis / Hari',
      'Batas Respon AI 2.000 / Hari (60.000/bln)',
      '100% Tanpa Watermark / Pure Clean',
      'Prioritas Slot Kapasitas Server (Aman dari Geseran)',
      'Prioritas Anti-Ban Behavioral Guard',
      'Fitur Balas AI Multi-Key Tanpa Batas',
      'Akses Developer REST API v1 & DB Cloud Sync'
    ]
  }
];

export const DEFAULT_FREE_AUTO_REPLY_HOURS = 0; // 0 = Tanpa batas jam (penuh)
export const DEFAULT_MAX_GLOBAL_SESSIONS = 10;
export const SESSION_INACTIVITY_PURGE_DAYS = 3;
export const SESSION_INACTIVITY_PURGE_MS = SESSION_INACTIVITY_PURGE_DAYS * 24 * 60 * 60 * 1000;

export function normalizeMaxGlobalSessions(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 1 || num > 10000) return null;
  return Math.floor(num);
}

export function normalizeAppIdValue(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 64);
}

export function normalizeAdminNotifyPhone(raw: unknown): string {
  if (raw === undefined || raw === null) return '';
  let clean = String(raw).replace(/\D/g, '');
  if (!clean) return '';
  if (clean.startsWith('00')) clean = clean.slice(2);
  if (clean.startsWith('620')) clean = '62' + clean.slice(3);
  else if (clean.startsWith('0')) clean = '62' + clean.slice(1);
  else if (clean.startsWith('8')) clean = '62' + clean;
  if (clean.length < 8 || clean.length > 16) return '';
  return clean;
}

export function normalizeAppNodes(raw: unknown): AppNodeConfig[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Map<string, AppNodeConfig>();
  const nowIso = new Date().toISOString();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const appId = normalizeAppIdValue(obj.app_id);
    if (!appId) continue;
    const maxRaw = Number(obj.max_connections);
    const maxConnections = Number.isFinite(maxRaw) && maxRaw >= 1 && maxRaw <= 10000 ? Math.floor(maxRaw) : 10;
    const name = typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim().slice(0, 80) : undefined;
    seen.set(appId, {
      app_id: appId,
      name,
      max_connections: maxConnections,
      is_active: obj.is_active === undefined ? true : Boolean(obj.is_active),
      updated_at: typeof obj.updated_at === 'string' && obj.updated_at ? obj.updated_at : nowIso
    });
  }
  return Array.from(seen.values());
}

export function normalizeServerIpValue(raw: unknown): string {
  let s = String(raw ?? '').trim().toLowerCase();
  if (!s) return '';
  if (s.startsWith('::ffff:')) {
    const v4 = s.slice(7);
    if (net.isIP(v4) === 4) s = v4;
  }
  if (net.isIP(s) !== 0) return s;
  return '';
}

export function normalizeKillTargetIps(raw: unknown): KillTargetIpRule[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Map<string, KillTargetIpRule>();
  const nowIso = new Date().toISOString();
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      if (typeof item === 'string') {
        const cleanIp = normalizeServerIpValue(item);
        if (cleanIp) {
          seen.set(cleanIp, { ip: cleanIp, requested_at: nowIso });
        }
      }
      continue;
    }
    const obj = item as Record<string, unknown>;
    const cleanIp = normalizeServerIpValue(obj.ip);
    if (!cleanIp) continue;
    const reason = typeof obj.reason === 'string' && obj.reason.trim() ? obj.reason.trim().slice(0, 200) : undefined;
    const requestedBy = typeof obj.requested_by === 'string' && obj.requested_by.trim() ? obj.requested_by.trim().slice(0, 80) : undefined;
    seen.set(cleanIp, {
      ip: cleanIp,
      reason,
      requested_at: typeof obj.requested_at === 'string' && obj.requested_at ? obj.requested_at : nowIso,
      requested_by: requestedBy
    });
  }
  return Array.from(seen.values());
}

export function getKillTargetIpsConfig(sysConfig?: SystemConfig): KillTargetIpRule[] {
  const cfg = sysConfig || initDbFile().systemConfig;
  return normalizeKillTargetIps(cfg?.kill_target_ips);
}

export function getAppNodesConfig(sysConfig?: SystemConfig): AppNodeConfig[] {
  const cfg = sysConfig || initDbFile().systemConfig;
  return normalizeAppNodes(cfg?.app_nodes);
}

export function getAdminNotifyPhone(sysConfig?: SystemConfig): string {
  const cfg = sysConfig || initDbFile().systemConfig;
  return normalizeAdminNotifyPhone(cfg?.admin_notify_phone);
}

export function resolveClusterNotifyPhone(sysConfig?: SystemConfig): string {
  const configured = getAdminNotifyPhone(sysConfig);
  if (configured) return configured;
  const db = initDbFile();
  const activeAdmin = (db.users || []).find(
    u => u.role === 'admin' && u.is_active && normalizeAdminNotifyPhone(u.phone).length >= 8
  );
  return activeAdmin ? normalizeAdminNotifyPhone(activeAdmin.phone) : '';
}

export function normalizeTelegramChatId(raw: unknown): string {
  const s = String(raw ?? '').trim().slice(0, 64);
  if (!s) return '';
  if (/^-?\d{5,25}$/.test(s) || /^@[a-zA-Z0-9_]{5,32}$/.test(s)) {
    return s;
  }
  return '';
}

export function isValidTelegramBotTokenFormat(raw: unknown): boolean {
  const s = String(raw ?? '').trim();
  if (!s || s.length < 20 || s.length > 140) return false;
  return /^\d{5,16}:[A-Za-z0-9_-]{20,100}$/.test(s);
}

export function normalizeStoredTelegramToken(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (s.startsWith('gcm:')) {
    // Validate decryptability; if encrypted with another runtime key, return empty so admin can re-enter
    return decryptData(s) ? s : '';
  }
  if (s.includes('****')) return '';
  return encryptData(s);
}

export function normalizeTelegramConfigs(raw: unknown): TelegramConfigItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Map<string, TelegramConfigItem>();
  const nowIso = new Date().toISOString();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const id = String(obj.id || '').trim().replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 64);
    const chatId = normalizeTelegramChatId(obj.chat_id);
    const storedToken = normalizeStoredTelegramToken(obj.bot_token);
    if (!id || !chatId || !storedToken) continue;
    const name = typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim().slice(0, 80) : `Telegram ${chatId}`;
    seen.set(id, {
      id,
      name,
      bot_token: storedToken,
      chat_id: chatId,
      is_active: obj.is_active === undefined ? true : Boolean(obj.is_active),
      created_at: typeof obj.created_at === 'string' && obj.created_at ? obj.created_at : nowIso,
      updated_at: typeof obj.updated_at === 'string' && obj.updated_at ? obj.updated_at : nowIso
    });
  }
  return Array.from(seen.values());
}

export function getTelegramConfigs(sysConfig?: SystemConfig): TelegramConfigItem[] {
  const cfg = sysConfig || initDbFile().systemConfig;
  return normalizeTelegramConfigs(cfg?.telegram_configs);
}

export function sanitizeTelegramConfigsForAdmin(sysConfig?: SystemConfig): Array<Omit<TelegramConfigItem, 'bot_token'> & { bot_token: string; bot_token_masked: string; bot_token_configured: boolean }> {
  const list = getTelegramConfigs(sysConfig);
  return list.map(item => {
    const plain = decryptData(item.bot_token || '');
    return {
      id: item.id,
      name: item.name,
      bot_token: '',
      bot_token_masked: plain ? maskSensitiveString(plain, 6, 4) : '',
      bot_token_configured: Boolean(plain),
      chat_id: item.chat_id,
      is_active: item.is_active !== false,
      created_at: item.created_at,
      updated_at: item.updated_at
    };
  });
}

export function getActiveTelegramTargets(sysConfig?: SystemConfig): Array<{
  id: string;
  name: string;
  botToken: string;
  chatId: string;
}> {
  const cfg = sysConfig || initDbFile().systemConfig;
  const targets: Array<{ id: string; name: string; botToken: string; chatId: string }> = [];
  const seenPair = new Set<string>();

  for (const item of getTelegramConfigs(cfg)) {
    if (item.is_active === false) continue;
    const plainToken = decryptData(item.bot_token || '').trim();
    const chatId = normalizeTelegramChatId(item.chat_id);
    if (!plainToken || !chatId) continue;
    const dedup = `${plainToken}::${chatId}`;
    if (seenPair.has(dedup)) continue;
    seenPair.add(dedup);
    targets.push({ id: item.id, name: item.name, botToken: plainToken, chatId });
  }

  // Backward-compatible fallback if primary single fields exist
  if (cfg?.telegram_enabled !== false && cfg?.telegram_bot_token && cfg?.telegram_chat_id) {
    const plainToken = decryptData(String(cfg.telegram_bot_token)).trim();
    const chatId = normalizeTelegramChatId(cfg.telegram_chat_id);
    if (plainToken && chatId) {
      const dedup = `${plainToken}::${chatId}`;
      if (!seenPair.has(dedup)) {
        seenPair.add(dedup);
        targets.push({ id: 'primary', name: 'Telegram Utama', botToken: plainToken, chatId });
      }
    }
  }

  return targets;
}

const DEFAULT_SYSTEM_CONFIG: SystemConfig = {
  app_url: process.env.APP_URL || 'http://localhost:3000',
  mysql_host: process.env.MYSQL_HOST || '',
  mysql_port: parseInt(process.env.MYSQL_PORT || '3306', 10) || 3306,
  mysql_user: process.env.MYSQL_USER || '',
  mysql_password: process.env.MYSQL_PASSWORD ? encryptData(process.env.MYSQL_PASSWORD) : '',
  mysql_database: process.env.MYSQL_DATABASE || '',
  free_auto_reply_hours: DEFAULT_FREE_AUTO_REPLY_HOURS,
  max_global_sessions: DEFAULT_MAX_GLOBAL_SESSIONS,
  ai_config: DEFAULT_AI_CONFIG,
  qris_config: DEFAULT_QRIS_CONFIG,
  whitelabel_config: DEFAULT_WHITELABEL,
  app_nodes: [],
  kill_target_ips: [],
  admin_notify_phone: process.env.INITIAL_ADMIN_PHONE
    ? normalizeAdminNotifyPhone(process.env.INITIAL_ADMIN_PHONE)
    : '',
  telegram_bot_token: '',
  telegram_chat_id: '',
  telegram_enabled: true,
  telegram_configs: []
};

export const SUBSCRIPTION_PLANS = DEFAULT_SUBSCRIPTION_PLANS;

function buildDefaultDatabaseUsers(): UserAccount[] {
  const envUser = process.env.INITIAL_ADMIN_USERNAME?.trim().toLowerCase();
  const envPass = process.env.INITIAL_ADMIN_PASSWORD;
  const envEmail = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPin = process.env.SUPERADMIN_MASTER_PIN?.trim();

  if (!envUser || !envPass || envPass.length < 8 || !envEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(envEmail)) {
    return [];
  }

  return [
    {
      id: 'user_superadmin',
      username: envUser,
      name: process.env.INITIAL_ADMIN_NAME?.trim() || 'Super Administrator',
      role: 'admin',
      email: envEmail,
      phone: process.env.INITIAL_ADMIN_PHONE ? normalizePhoneForUniqueness(process.env.INITIAL_ADMIN_PHONE) : '',
      password: hashPassword(envPass),
      is_active: true,
      email_verified: true,
      wa_verified: true,
      plan_id: 'pro',
      plan_status: 'active',
      max_sessions: 1,
      security_pin: adminPin ? hashPin(adminPin) : undefined,
      pin_failed_attempts: 0,
      is_bot_locked: false,
      api_key: generateApiKey('mgw_supe_'),
      daily_messages_sent: 0,
      monthly_messages_sent: 0,
      auto_reply_enabled: true,
      ai_enabled: true,
      default_cs_reply_enabled: true,
      default_cs_reply_text: 'Halo kak *{nama}*! Terima kasih telah menghubungi kami. Tim Customer Service kami akan segera membalas pesan Anda sesegera mungkin.',
      rules_initialized: true,
      session_version: 1,
      created_at: new Date().toISOString(),
      approved_at: new Date().toISOString()
    }
  ];
}

// In-Memory Remote WhatsApp Bot Challenges Map (expires in 5 minutes)
const activeRemoteChallenges = new Map<string, RemoteBotChallenge>();

// Clean up expired challenges
const challengeCleanupTimer = setInterval(() => {
  if (activeRemoteChallenges.size === 0) return;
  const now = Date.now();
  for (const [phone, challenge] of activeRemoteChallenges.entries()) {
    if (challenge.expires_at < now) {
      activeRemoteChallenges.delete(phone);
    }
  }
}, 60000);
challengeCleanupTimer.unref?.();

export function initDbFile(): LocalDatabase {
  const now = Date.now();
  if (cachedMemoryDb) {
    if (now - lastDiskStatCheckedAt > 1000 && process.env.JAPRIIN_EPHEMERAL_DB !== '1') {
      lastDiskStatCheckedAt = now;
      try {
        if (fs.existsSync(RUNTIME_DB_PATH)) {
          const diskMtime = fs.statSync(RUNTIME_DB_PATH).mtimeMs;
          if (diskMtime > lastLoadedDbMtimeMs + 1) {
            const reloaded = loadEncryptedLocalDb();
            if (reloaded) {
              cachedMemoryDb = reloaded;
              lastLoadedDbMtimeMs = diskMtime;
            }
          }
        }
      } catch {
        // Ignore stat race
      }
    }
    return cachedMemoryDb;
  }

  const persisted = loadEncryptedLocalDb();
  if (persisted) {
    if (!persisted.users.some(u => u.role === 'admin' && u.is_active)) {
      const envAdmins = buildDefaultDatabaseUsers();
      if (envAdmins.length > 0) {
        persisted.users.unshift(...envAdmins);
      }
    }
    cachedMemoryDb = persisted;
    syncDbFileMtimeMarker();
    return persisted;
  }

  const initialDb: LocalDatabase = {
    messages: [],
    broadcastHistory: [],
    rules: [],
    sessions: [],
    antiBan: DEFAULT_ANTIBAN,
    users: buildDefaultDatabaseUsers(),
    plans: DEFAULT_SUBSCRIPTION_PLANS,
    smtpAccounts: [],
    geminiKeys: [],
    systemConfig: DEFAULT_SYSTEM_CONFIG,
    catalogProducts: [],
    catalogSettings: {},
    superadminWaQueue: [],
    expiredSessionAlertKeys: {},
    pendingSessionExpiryAlerts: [],
    handledIncomingMessages: {},
    chatReplyWatermark: {},
    pendingMissedMessages: [],
    stats: {
      total_incoming: 0,
      total_auto_replied: 0,
      total_failed: 0,
      total_ai_replied: 0
    }
  };

  cachedMemoryDb = initialDb;
  return initialDb;
}

export function bumpUserSessionVersion(userId: string): number {
  const db = initDbFile();
  const user = db.users.find(u => u.id === userId);
  if (!user) return 1;
  user.session_version = (Number(user.session_version) || 1) + 1;
  writeDbFile(db, true);
  asyncSyncUser(user);
  return user.session_version;
}

export function writeDbFile(data: LocalDatabase, immediate = false): void {
  markMutated();
  cachedMemoryDb = data;
  if (immediate) {
    if (pendingPersistTimer) {
      clearTimeout(pendingPersistTimer);
      pendingPersistTimer = null;
    }
    saveEncryptedLocalDb(data);
    return;
  }
  if (pendingPersistTimer) {
    clearTimeout(pendingPersistTimer);
  }
  pendingPersistTimer = setTimeout(() => {
    pendingPersistTimer = null;
    if (cachedMemoryDb) {
      saveEncryptedLocalDbAsync(cachedMemoryDb).catch(() => {});
    }
  }, 2500);
  pendingPersistTimer.unref?.();
}

// ==========================================
// SUBSCRIPTION PLANS CRUD (SUPERADMIN EDITABLE)
// ==========================================
export function normalizeSubscriptionPlan(plan: SubscriptionPlan): SubscriptionPlan {
  if (!plan || plan.id !== 'free') {
    return { ...plan, max_sessions: 1 };
  }
  const dailyMsgLimit = Math.max(1, Number(plan.daily_msg_limit) || 100);
  const monthlyMsgLimit = Math.max(dailyMsgLimit, Number(plan.monthly_msg_limit) || 500);
  const updatedFeatures = Array.isArray(plan.features)
    ? plan.features.map(f =>
        /Batas\s+Respon\s+AI\s+25\s*\/\s*Hari/i.test(String(f))
          ? 'Respon AI Tanpa Batas Terpisah (Ikuti Batas Chat Harian)'
          : f
      )
    : [];
  return {
    ...plan,
    max_sessions: 1,
    daily_msg_limit: dailyMsgLimit,
    monthly_msg_limit: monthlyMsgLimit,
    daily_ai_limit: dailyMsgLimit,
    monthly_ai_limit: monthlyMsgLimit,
    features: updatedFeatures
  };
}

export function getSubscriptionPlans(): SubscriptionPlan[] {
  const db = initDbFile();
  return (db.plans || DEFAULT_SUBSCRIPTION_PLANS).map(normalizeSubscriptionPlan);
}

export function saveSubscriptionPlans(plans: SubscriptionPlan[]): SubscriptionPlan[] {
  const db = initDbFile();
  db.plans = plans.map(normalizeSubscriptionPlan);
  writeDbFile(db, true);
  asyncSyncKv('plans', db.plans);
  return db.plans;
}

export function updateSubscriptionPlan(id: string, updates: Partial<SubscriptionPlan>): SubscriptionPlan | null {
  const db = initDbFile();
  const index = db.plans.findIndex(p => p.id === id);
  if (index === -1) return null;

  db.plans[index] = normalizeSubscriptionPlan({
    ...db.plans[index],
    ...updates,
    max_sessions: 1,
    updated_at: new Date().toISOString()
  });
  writeDbFile(db, true);
  asyncSyncKv('plans', db.plans);
  return db.plans[index];
}

export function addSubscriptionPlan(planData: Omit<SubscriptionPlan, 'updated_at'>): SubscriptionPlan {
  const db = initDbFile();
  const newPlan: SubscriptionPlan = {
    ...planData,
    max_sessions: 1,
    updated_at: new Date().toISOString()
  };
  db.plans.push(newPlan);
  writeDbFile(db, true);
  asyncSyncKv('plans', db.plans);
  return newPlan;
}

export function deleteSubscriptionPlan(id: string): boolean {
  const db = initDbFile();
  const beforeCount = db.plans.length;
  db.plans = db.plans.filter(p => p.id !== id);
  if (db.plans.length !== beforeCount) {
    writeDbFile(db, true);
    asyncSyncKv('plans', db.plans);
    return true;
  }
  return false;
}

// ==========================================
// WHITELABEL APP CONFIGURATION CRUD
// ==========================================
export function getWhitelabelConfig(): AppWhitelabelConfig {
  const db = initDbFile();
  const wl = db.systemConfig?.whitelabel_config || DEFAULT_WHITELABEL;
  const normalizedLogo = normalizeWhitelabelLogoUrl(wl.logo_url);
  if (normalizedLogo !== wl.logo_url) {
    return { ...wl, logo_url: normalizedLogo };
  }
  return wl;
}

export function updateWhitelabelConfig(updates: Partial<AppWhitelabelConfig>): AppWhitelabelConfig {
  const db = initDbFile();
  if (!db.systemConfig.whitelabel_config) {
    db.systemConfig.whitelabel_config = { ...DEFAULT_WHITELABEL };
  }
  const nextUpdates = { ...updates };
  if (nextUpdates.logo_url !== undefined) {
    nextUpdates.logo_url = normalizeWhitelabelLogoUrl(nextUpdates.logo_url);
  }
  db.systemConfig.whitelabel_config = {
    ...db.systemConfig.whitelabel_config,
    ...nextUpdates,
    updated_at: new Date().toISOString()
  };
  writeDbFile(db, true);
  asyncSyncKv('systemConfig', db.systemConfig);
  return db.systemConfig.whitelabel_config;
}

// ==========================================
// GEMINI MULTI-KEY ROTATION & API KEYS
// ==========================================
export function getGeminiKeys(): GeminiApiKey[] {
  const db = initDbFile();
  return db.geminiKeys || [];
}

export function getActiveGeminiKeys(): GeminiApiKey[] {
  const db = initDbFile();
  return (db.geminiKeys || []).filter(k => k.is_active);
}

export function addGeminiKey(name: string, key: string): GeminiApiKey {
  const db = initDbFile();
  const newKey: GeminiApiKey = {
    id: `gem_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    name: name.trim() || `Gemini Key ${db.geminiKeys.length + 1}`,
    key: encryptData(key.trim()),
    is_active: true,
    usage_count: 0,
    error_count: 0,
    created_at: new Date().toISOString()
  };
  db.geminiKeys.push(newKey);
  writeDbFile(db);
  asyncSyncGeminiKey(newKey);
  return newKey;
}

export function updateGeminiKey(id: string, updates: Partial<GeminiApiKey>): GeminiApiKey | null {
  const db = initDbFile();
  const index = db.geminiKeys.findIndex(k => k.id === id);
  if (index === -1) return null;

  if (updates.key) {
    updates.key = encryptData(updates.key.trim());
  }

  db.geminiKeys[index] = { ...db.geminiKeys[index], ...updates };
  writeDbFile(db);
  asyncSyncGeminiKey(db.geminiKeys[index]);
  return db.geminiKeys[index];
}

export function deleteGeminiKey(id: string): boolean {
  const db = initDbFile();
  const beforeCount = db.geminiKeys.length;
  db.geminiKeys = db.geminiKeys.filter(k => k.id !== id);
  if (db.geminiKeys.length !== beforeCount) {
    writeDbFile(db);
    asyncDeleteGeminiKey(id);
    return true;
  }
  return false;
}

export function toggleGeminiKey(id: string): GeminiApiKey | null {
  const db = initDbFile();
  const index = db.geminiKeys.findIndex(k => k.id === id);
  if (index === -1) return null;

  db.geminiKeys[index].is_active = !db.geminiKeys[index].is_active;
  writeDbFile(db);
  asyncSyncGeminiKey(db.geminiKeys[index]);
  return db.geminiKeys[index];
}

// ==========================================
// USER ACCOUNTS & SECURITY PIN MANAGEMENT
// ==========================================
export function getUsers(): UserAccount[] {
  const db = initDbFile();
  return db.users;
}

export function getUserById(id: string): UserAccount | null {
  const db = initDbFile();
  if (!id) return null;
  return db.users.find(u => 
    u.id === id || 
    u.username.toLowerCase() === id.toLowerCase() ||
    (id === 'usr_user' && (u.id === 'user_regular' || u.username === 'user')) ||
    (id === 'user_regular' && (u.id === 'usr_user' || u.username === 'user')) ||
    (id === 'usr_admin' && (u.id === 'user_admin' || u.username === 'admin')) ||
    (id === 'usr_superadmin' && (u.id === 'user_superadmin' || u.username === 'superadmin'))
  ) || null;
}

export function getUserByPhone(phone: string): UserAccount | null {
  const db = initDbFile();
  if (!phone) return null;
  const cleanPhone = phone.replace(/\D/g, '');
  if (!cleanPhone) return null;
  return db.users.find(u => {
    if (!u.phone) return false;
    const uPhone = u.phone.replace(/\D/g, '');
    return uPhone === cleanPhone || (uPhone.length >= 8 && cleanPhone.endsWith(uPhone.slice(-8))) || (cleanPhone.length >= 8 && uPhone.endsWith(cleanPhone.slice(-8)));
  }) || null;
}

export function getUserByApiKey(apiKey: string): UserAccount | null {
  const db = initDbFile();
  if (!apiKey) return null;
  const trimmed = apiKey.trim();
  if (!trimmed) return null;
  return db.users.find(u => Boolean(u.api_key) && safeEqual(u.api_key!, trimmed)) || null;
}

export function setUserSecurityPin(userId: string, pin: string): { success: boolean; message: string } {
  if (!pin || pin.length < 4 || pin.length > 8 || !/^\d+$/.test(pin)) {
    return { success: false, message: 'PIN harus berupa 4-8 digit angka!' };
  }

  const db = initDbFile();
  const user = db.users.find(u => u.id === userId);
  if (!user) return { success: false, message: 'Pengguna tidak ditemukan.' };

  user.security_pin = hashPin(pin);
  user.pin_failed_attempts = 0;
  user.is_bot_locked = false;
  writeDbFile(db);
  asyncSyncUser(user);
  return { success: true, message: 'PIN Keamanan berhasil dibuat & disimpan dengan aman!' };
}

export function verifyUserSecurityPin(userId: string, inputPin: string): boolean {
  const db = initDbFile();
  const user = db.users.find(u => u.id === userId);
  if (!user || !user.security_pin || !inputPin) return false;

  const isValid = verifyPin(inputPin.trim(), user.security_pin);
  if (isValid && !user.security_pin.startsWith('scrypt:')) {
    user.security_pin = hashPin(inputPin.trim());
    writeDbFile(db);
    asyncSyncUser(user);
  }
  return isValid;
}

export function unlockUserBot(userId: string): UserAccount | null {
  const db = initDbFile();
  const user = db.users.find(u => u.id === userId);
  if (!user) return null;

  user.is_bot_locked = false;
  user.pin_failed_attempts = 0;
  writeDbFile(db);
  asyncSyncUser(user);
  return user;
}

export function generateUserApiKey(userId: string): string | null {
  const db = initDbFile();
  const user = db.users.find(u => u.id === userId);
  if (!user) return null;

  user.api_key = generateApiKey(`mgw_${user.username.substring(0, 4)}_`);
  writeDbFile(db);
  asyncSyncUser(user);
  return user.api_key;
}

function isUserOnFreeTier(user: UserAccount): boolean {
  return user.role !== 'admin' && (!user.plan_id || user.plan_id === 'free' || user.plan_status !== 'active');
}

function resolveUserPlanForQuota(plans: SubscriptionPlan[], user: UserAccount): SubscriptionPlan {
  const fallbackFree = plans.find(p => p.id === 'free') || plans[0] || DEFAULT_SUBSCRIPTION_PLANS[0];
  if (isUserOnFreeTier(user)) {
    return normalizeSubscriptionPlan(fallbackFree);
  }
  const matched = plans.find(p => p.id === user.plan_id) || fallbackFree;
  return normalizeSubscriptionPlan(matched);
}

export function canUseDailyQuota(userId?: string): { allowed: boolean; remaining: number; dailyLimit: number; message?: string } {
  if (!userId) return { allowed: true, remaining: 999999, dailyLimit: 999999 };
  const db = initDbFile();
  const targetUser = getUserById(userId);
  if (!targetUser) return { allowed: false, remaining: 0, dailyLimit: 0, message: 'Pengguna tidak ditemukan' };
  const user = db.users.find(u => u.id === targetUser.id);
  if (!user) return { allowed: false, remaining: 0, dailyLimit: 0, message: 'Pengguna tidak ditemukan' };

  const isAdmin = user.role === 'admin';
  const plans = db.plans || DEFAULT_SUBSCRIPTION_PLANS;
  const userPlan = resolveUserPlanForQuota(plans, user);
  const dailyLimit = isAdmin ? 999999 : (userPlan.daily_msg_limit || 100);
  const monthlyLimit = isAdmin ? 999999 : (userPlan.monthly_msg_limit || 500);

  const today = new Date().toISOString().split('T')[0];
  const currentMonth = today.substring(0, 7);
  let mutated = false;
  if (user.last_quota_reset_date !== today) {
    user.daily_messages_sent = 0;
    user.daily_ai_sent = 0;
    user.last_quota_reset_date = today;
    mutated = true;
  }
  if ((user as any).last_quota_reset_month !== currentMonth) {
    user.monthly_messages_sent = 0;
    user.monthly_ai_sent = 0;
    (user as any).last_quota_reset_month = currentMonth;
    mutated = true;
  }
  if (mutated) writeDbFile(db);

  if (!isAdmin && (user.daily_messages_sent || 0) >= dailyLimit) {
    return {
      allowed: false,
      remaining: 0,
      dailyLimit,
      message: `Kuota pesan harian Anda telah habis (${user.daily_messages_sent || 0}/${dailyLimit} pesan). Upgrade paket Anda untuk kuota lebih banyak.`
    };
  }

  if (!isAdmin && (user.monthly_messages_sent || 0) >= monthlyLimit) {
    return {
      allowed: false,
      remaining: 0,
      dailyLimit,
      message: `Kuota pesan bulanan Anda telah habis (${user.monthly_messages_sent || 0}/${monthlyLimit} pesan). Upgrade paket Anda untuk kuota lebih banyak.`
    };
  }

  return {
    allowed: true,
    remaining: isAdmin ? 999999 : Math.max(0, dailyLimit - (user.daily_messages_sent || 0)),
    dailyLimit: isAdmin ? 999999 : dailyLimit
  };
}

export function deductUserDailyQuota(userId: string): { allowed: boolean; remaining: number; dailyLimit: number; message?: string } {
  const db = initDbFile();
  const targetUser = getUserById(userId);
  if (!targetUser) return { allowed: false, remaining: 0, dailyLimit: 0, message: 'Pengguna tidak ditemukan' };
  const user = db.users.find(u => u.id === targetUser.id);
  if (!user) return { allowed: false, remaining: 0, dailyLimit: 0, message: 'Pengguna tidak ditemukan' };

  const isAdmin = user.role === 'admin';
  const plans = db.plans || DEFAULT_SUBSCRIPTION_PLANS;
  const userPlan = resolveUserPlanForQuota(plans, user);
  const dailyLimit = isAdmin ? 999999 : (userPlan.daily_msg_limit || 100);
  const monthlyLimit = isAdmin ? 999999 : (userPlan.monthly_msg_limit || 500);

  const today = new Date().toISOString().split('T')[0];
  const currentMonth = today.substring(0, 7);
  if (user.last_quota_reset_date !== today) {
    user.daily_messages_sent = 0;
    user.daily_ai_sent = 0;
    user.last_quota_reset_date = today;
  }
  if ((user as any).last_quota_reset_month !== currentMonth) {
    user.monthly_messages_sent = 0;
    user.monthly_ai_sent = 0;
    (user as any).last_quota_reset_month = currentMonth;
  }

  if (!isAdmin && user.daily_messages_sent >= dailyLimit) {
    return {
      allowed: false,
      remaining: 0,
      dailyLimit,
      message: `Kuota pesan harian Anda telah habis (${user.daily_messages_sent}/${dailyLimit} pesan). Upgrade paket Anda untuk kuota lebih banyak.`
    };
  }

  if (!isAdmin && (user.monthly_messages_sent || 0) >= monthlyLimit) {
    return {
      allowed: false,
      remaining: 0,
      dailyLimit,
      message: `Kuota pesan bulanan Anda telah habis (${user.monthly_messages_sent || 0}/${monthlyLimit} pesan). Upgrade paket Anda untuk kuota lebih banyak.`
    };
  }

  user.daily_messages_sent = (user.daily_messages_sent || 0) + 1;
  user.monthly_messages_sent = (user.monthly_messages_sent || 0) + 1;
  writeDbFile(db);
  asyncSyncUser(user);

  return {
    allowed: true,
    remaining: isAdmin ? 999999 : Math.max(0, dailyLimit - user.daily_messages_sent),
    dailyLimit: isAdmin ? 999999 : dailyLimit
  };
}

export function canUseAiQuota(userId?: string): {
  allowed: boolean;
  remainingDaily: number;
  dailyLimit: number;
  remainingMonthly: number;
  monthlyLimit: number;
  message?: string;
} {
  if (!userId) {
    return {
      allowed: true,
      remainingDaily: 999999,
      dailyLimit: 999999,
      remainingMonthly: 999999,
      monthlyLimit: 999999
    };
  }
  const db = initDbFile();
  const targetUser = getUserById(userId);
  if (!targetUser) {
    return {
      allowed: false,
      remainingDaily: 0,
      dailyLimit: 0,
      remainingMonthly: 0,
      monthlyLimit: 0,
      message: 'Pengguna tidak ditemukan'
    };
  }
  const user = db.users.find(u => u.id === targetUser.id);
  if (!user) {
    return {
      allowed: false,
      remainingDaily: 0,
      dailyLimit: 0,
      remainingMonthly: 0,
      monthlyLimit: 0,
      message: 'Pengguna tidak ditemukan'
    };
  }

  const isAdmin = user.role === 'admin';
  const isFree = isUserOnFreeTier(user);
  const plans = db.plans || DEFAULT_SUBSCRIPTION_PLANS;
  const userPlan = resolveUserPlanForQuota(plans, user);
  const dailyMsgLimit = isAdmin ? 999999 : (userPlan.daily_msg_limit || 100);
  const monthlyMsgLimit = isAdmin ? 999999 : (userPlan.monthly_msg_limit || 500);
  // Paket Gratis tidak memiliki batas AI terpisah — mengikuti batas chat harian/bulanan sepenuhnya
  const dailyAiLimit = isAdmin ? 999999 : isFree ? dailyMsgLimit : (userPlan.daily_ai_limit ?? dailyMsgLimit);
  const monthlyAiLimit = isAdmin ? 999999 : isFree ? monthlyMsgLimit : (userPlan.monthly_ai_limit ?? monthlyMsgLimit);

  const today = new Date().toISOString().split('T')[0];
  const currentMonth = today.substring(0, 7);
  let mutated = false;
  if (user.last_quota_reset_date !== today) {
    user.daily_messages_sent = 0;
    user.daily_ai_sent = 0;
    user.last_quota_reset_date = today;
    mutated = true;
  }
  if ((user as any).last_quota_reset_month !== currentMonth) {
    user.monthly_messages_sent = 0;
    user.monthly_ai_sent = 0;
    (user as any).last_quota_reset_month = currentMonth;
    mutated = true;
  }
  if (mutated) writeDbFile(db);

  const currentDailyMsg = user.daily_messages_sent || 0;
  const currentMonthlyMsg = user.monthly_messages_sent || 0;
  const currentDailyAi = user.daily_ai_sent || 0;
  const currentMonthlyAi = user.monthly_ai_sent || 0;

  if (!isAdmin && currentDailyMsg >= dailyMsgLimit) {
    return {
      allowed: false,
      remainingDaily: 0,
      dailyLimit: dailyAiLimit,
      remainingMonthly: Math.max(0, monthlyMsgLimit - currentMonthlyMsg),
      monthlyLimit: monthlyAiLimit,
      message: `Batas chat harian Anda telah habis (${currentDailyMsg}/${dailyMsgLimit}). Respon AI mengikuti batas chat harian.`
    };
  }

  if (!isAdmin && currentMonthlyMsg >= monthlyMsgLimit) {
    return {
      allowed: false,
      remainingDaily: Math.max(0, dailyMsgLimit - currentDailyMsg),
      dailyLimit: dailyAiLimit,
      remainingMonthly: 0,
      monthlyLimit: monthlyAiLimit,
      message: `Batas chat bulanan Anda telah habis (${currentMonthlyMsg}/${monthlyMsgLimit}). Respon AI mengikuti batas chat bulanan.`
    };
  }

  if (!isAdmin && !isFree && currentDailyAi >= dailyAiLimit) {
    return {
      allowed: false,
      remainingDaily: 0,
      dailyLimit: dailyAiLimit,
      remainingMonthly: Math.max(0, monthlyAiLimit - currentMonthlyAi),
      monthlyLimit: monthlyAiLimit,
      message: `Batas kuota respon AI harian Anda telah habis (${currentDailyAi}/${dailyAiLimit}).`
    };
  }

  if (!isAdmin && !isFree && currentMonthlyAi >= monthlyAiLimit) {
    return {
      allowed: false,
      remainingDaily: Math.max(0, dailyAiLimit - currentDailyAi),
      dailyLimit: dailyAiLimit,
      remainingMonthly: 0,
      monthlyLimit: monthlyAiLimit,
      message: `Batas kuota respon AI bulanan Anda telah habis (${currentMonthlyAi}/${monthlyAiLimit}).`
    };
  }

  return {
    allowed: true,
    remainingDaily: isAdmin
      ? 999999
      : isFree
        ? Math.max(0, dailyMsgLimit - currentDailyMsg)
        : Math.max(0, dailyAiLimit - currentDailyAi),
    dailyLimit: dailyAiLimit,
    remainingMonthly: isAdmin
      ? 999999
      : isFree
        ? Math.max(0, monthlyMsgLimit - currentMonthlyMsg)
        : Math.max(0, monthlyAiLimit - currentMonthlyAi),
    monthlyLimit: monthlyAiLimit
  };
}

export function deductUserAiQuota(userId: string): {
  allowed: boolean;
  remainingDaily: number;
  dailyLimit: number;
  remainingMonthly: number;
  monthlyLimit: number;
  message?: string;
} {
  const db = initDbFile();
  const targetUser = getUserById(userId);
  if (!targetUser) {
    return {
      allowed: false,
      remainingDaily: 0,
      dailyLimit: 0,
      remainingMonthly: 0,
      monthlyLimit: 0,
      message: 'Pengguna tidak ditemukan'
    };
  }
  const user = db.users.find(u => u.id === targetUser.id);
  if (!user) {
    return {
      allowed: false,
      remainingDaily: 0,
      dailyLimit: 0,
      remainingMonthly: 0,
      monthlyLimit: 0,
      message: 'Pengguna tidak ditemukan'
    };
  }

  const isAdmin = user.role === 'admin';
  const isFree = isUserOnFreeTier(user);
  const plans = db.plans || DEFAULT_SUBSCRIPTION_PLANS;
  const userPlan = resolveUserPlanForQuota(plans, user);
  const dailyMsgLimit = isAdmin ? 999999 : (userPlan.daily_msg_limit || 100);
  const monthlyMsgLimit = isAdmin ? 999999 : (userPlan.monthly_msg_limit || 500);
  const dailyAiLimit = isAdmin ? 999999 : isFree ? dailyMsgLimit : (userPlan.daily_ai_limit ?? dailyMsgLimit);
  const monthlyAiLimit = isAdmin ? 999999 : isFree ? monthlyMsgLimit : (userPlan.monthly_ai_limit ?? monthlyMsgLimit);

  const today = new Date().toISOString().split('T')[0];
  const currentMonth = today.substring(0, 7);
  if (user.last_quota_reset_date !== today) {
    user.daily_messages_sent = 0;
    user.daily_ai_sent = 0;
    user.last_quota_reset_date = today;
  }
  if ((user as any).last_quota_reset_month !== currentMonth) {
    user.monthly_messages_sent = 0;
    user.monthly_ai_sent = 0;
    (user as any).last_quota_reset_month = currentMonth;
  }

  const currentDailyAi = user.daily_ai_sent || 0;
  const currentMonthlyAi = user.monthly_ai_sent || 0;

  if (!isAdmin && !isFree && currentDailyAi >= dailyAiLimit) {
    return {
      allowed: false,
      remainingDaily: 0,
      dailyLimit: dailyAiLimit,
      remainingMonthly: Math.max(0, monthlyAiLimit - currentMonthlyAi),
      monthlyLimit: monthlyAiLimit,
      message: `Batas kuota respon AI harian Anda telah habis (${currentDailyAi}/${dailyAiLimit}).`
    };
  }

  if (!isAdmin && !isFree && currentMonthlyAi >= monthlyAiLimit) {
    return {
      allowed: false,
      remainingDaily: Math.max(0, dailyAiLimit - currentDailyAi),
      dailyLimit: dailyAiLimit,
      remainingMonthly: 0,
      monthlyLimit: monthlyAiLimit,
      message: `Batas kuota respon AI bulanan Anda telah habis (${currentMonthlyAi}/${monthlyAiLimit}).`
    };
  }

  user.daily_ai_sent = currentDailyAi + 1;
  user.monthly_ai_sent = currentMonthlyAi + 1;
  writeDbFile(db);

  return {
    allowed: true,
    remainingDaily: isAdmin
      ? 999999
      : isFree
        ? Math.max(0, dailyMsgLimit - (user.daily_messages_sent || 0))
        : Math.max(0, dailyAiLimit - user.daily_ai_sent),
    dailyLimit: dailyAiLimit,
    remainingMonthly: isAdmin
      ? 999999
      : isFree
        ? Math.max(0, monthlyMsgLimit - (user.monthly_messages_sent || 0))
        : Math.max(0, monthlyAiLimit - user.monthly_ai_sent),
    monthlyLimit: monthlyAiLimit
  };
}

// ==========================================
// REMOTE WHATSAPP BOT ASSISTANT ENGINE
// ==========================================
export function createPinChallenge(userPhone: string, userId: string, pendingAction: any): { prompt: string; pinOptions: string[] } {
  const challenge: RemoteBotChallenge = {
    user_phone: userPhone,
    user_id: userId,
    pending_action: pendingAction,
    correct_pin: '',
    pin_options: [],
    expires_at: Date.now() + 5 * 60 * 1000
  };

  activeRemoteChallenges.set(userPhone, challenge);
  if (activeRemoteChallenges.size > 200) {
    const oldestKey = activeRemoteChallenges.keys().next().value;
    if (oldestKey) activeRemoteChallenges.delete(oldestKey);
  }

  let prompt = `🔒 *KONFIRMASI KEAMANAN PIN*\n`;
  prompt += `Perintah Anda membutuhkan otorisasi PIN keamanan.\n\n`;
  prompt += `Silakan balas dengan *4-8 digit PIN keamanan Anda* secara langsung (atau ketik */batal* untuk membatalkan).`;

  return { prompt, pinOptions: [] };
}

export function getActivePinChallenge(userPhone: string): RemoteBotChallenge | null {
  const challenge = activeRemoteChallenges.get(userPhone);
  if (!challenge) return null;
  if (challenge.expires_at < Date.now()) {
    activeRemoteChallenges.delete(userPhone);
    return null;
  }
  return challenge;
}

export function clearPinChallenge(userPhone: string): void {
  activeRemoteChallenges.delete(userPhone);
}

export async function processRemoteWhatsAppCommand(
  fromPhone: string,
  senderName: string,
  rawText: string
): Promise<{ reply: string; actionExecuted?: boolean }> {
  const text = rawText.trim();
  const db = initDbFile();
  const whitelabel = db.systemConfig?.whitelabel_config || DEFAULT_WHITELABEL;
  const user = getUserByPhone(fromPhone);

  if (!user || !user.is_active || !user.email_verified) {
    return {
      reply: `Halo kak ${senderName}! 👋\nNomor WhatsApp Anda belum terdaftar atau akun belum aktif di sistem *${whitelabel.app_name}*.\n\nSilakan daftar & verifikasi akun di web kami: ${db.systemConfig.app_url || 'https://japriin.com'}`
    };
  }

  // Deduct quota for interaction
  const quota = deductUserDailyQuota(user.id);
  if (!quota.allowed) {
    return {
      reply: `⚠️ *KUOTA PESAN HABIS*\n\n${quota.message}\nUpgrade paket Pro Anda di website untuk melanjutkan.`
    };
  }

  // Check if user is locked due to 3x wrong PIN
  if (user.is_bot_locked) {
    return {
      reply: `🚫 *AKUN DIBLOKIR DARI WHATSAPP BOT*\n\nAkun Anda telah dinonaktifkan sementara dari akses bot karena 3x salah memasukkan PIN keamanan.\n\nUntuk membuka blokir, silakan masuk ke dashboard web *${whitelabel.app_name}* lalu verifikasi & reset PIN Anda.`
    };
  }

  // Check if there is an active PIN challenge waiting for response
  const activeChallenge = getActivePinChallenge(fromPhone);
  if (activeChallenge) {
    if (text.toLowerCase() === '/batal' || text.toLowerCase() === 'batal') {
      clearPinChallenge(fromPhone);
      return { reply: 'Permintaan perintah dibatalkan.' };
    }

    const inputVal = text.replace(/\D/g, '');
    const isCorrect = inputVal.length >= 4 && inputVal.length <= 8 && verifyUserSecurityPin(user.id, inputVal);
    clearPinChallenge(fromPhone);

    if (isCorrect) {
      user.pin_failed_attempts = 0;
      writeDbFile(db);
      asyncSyncUser(user);

      // Execute pending action
      const action = activeChallenge.pending_action;
      if (action.type === 'edit_account') {
        if (action.payload.name) user.name = action.payload.name;
        if (action.payload.email) user.email = action.payload.email;
        writeDbFile(db);
        return {
          reply: `✅ *DATA AKUN BERHASIL DIUBAH!*\n\nNama: *${user.name}*\nEmail: *${user.email}*\nUsername: @${user.username}\n\nSisa kuota harian: ${quota.remaining} pesan.`,
          actionExecuted: true
        };
      } else if (action.type === 'send_message') {
        const targetPhone = action.payload.to;
        const msgBody = action.payload.msg;

        // Log outgoing message
        addMessageLog({
          sender_phone: targetPhone,
          sender_name: `Customer (${targetPhone})`,
          message_body: msgBody,
          direction: 'outgoing',
          status: 'Sukses',
          reply_body: 'Pesan dikirim via WhatsApp Remote Assistant'
        });

        return {
          reply: `✅ *PESAN BERHASIL DIKIRIM!*\n\nPesan terkirim ke: *${targetPhone}*\nIsi pesan: "${msgBody}"\n\n100% Bebas Watermark.`,
          actionExecuted: true
        };
      } else if (action.type === 'toggle_ai') {
        const state = action.payload.state;
        return {
          reply: `✅ *STATUS AI DIUBAH!*\n\nMode AI Cerdas Auto-Reply sekarang: *${state ? 'AKTIF ⚡' : 'NONAKTIF'}*`,
          actionExecuted: true
        };
      }

      return {
        reply: `✅ *OTORISASI PIN BERHASIL!*\nPerintah Anda telah selesai dijalankan.`,
        actionExecuted: true
      };
    } else {
      user.pin_failed_attempts = (user.pin_failed_attempts || 0) + 1;
      if (user.pin_failed_attempts >= 3) {
        user.is_bot_locked = true;
        writeDbFile(db);
        return {
          reply: `❌ *PIN SALAH 3 KALI! AKUN DIBLOKIR!*\n\nDemi keamanan akun Anda, akses bot WhatsApp telah diblokir otomatis. Silakan buka website dashboard untuk membuka blokir atau mereset PIN Anda.`
        };
      } else {
        writeDbFile(db);
        return {
          reply: `❌ *PIN SALAH!*\nPercobaan gagal: ${user.pin_failed_attempts}/3.\nJika salah 3 kali, akun akan diblokir otomatis. Ketik */menu* untuk mengulang perintah.`
        };
      }
    }
  }

  // Handle Command Menu & Quick Actions
  const lower = text.toLowerCase();

  if (lower === 'hai' || lower === 'halo' || lower === 'menu' || lower === 'help' || lower === '/menu' || lower === '/help' || lower === '/bantuan') {
    return {
      reply: `👋 *Halo kak ${user.name}!* (@${user.username})\nSelamat datang di *${whitelabel.primary_bot_name}* ⚡\n\nKamu bisa mengelola bot & kirim pesan langsung dari WhatsApp tanpa perlu buka web! Berikut perintah cepat:\n\n1️⃣ */send <nomor_tujuan> <isi_pesan>*\nKirim pesan ke customer (Tanpa Watermark)\n\n2️⃣ */send*\nTampilkan template kirim pesan interaktif\n\n3️⃣ */status* atau */cekkuota*\nCek sisa batas kuota pesan & status bot\n\n4️⃣ */editakun nama=NamaBaru*\nUbah nama profil operator\n\n5️⃣ */setpin 123456*\nBuat / atur PIN keamanan remote kamu`
    };
  }

  if (lower.startsWith('/cekkuota') || lower === '/kuota' || lower === '/saldo') {
    const plans = db.plans || DEFAULT_SUBSCRIPTION_PLANS;
    const userPlan = plans.find(p => p.id === user.plan_id) || plans[0];
    return {
      reply: `📊 *STATUS KUOTA PESAN*\n\nPengguna: *${user.name}* (@${user.username})\nPaket: *${userPlan.name}*\nTerkirim Hari Ini: *${user.daily_messages_sent}* / ${userPlan.daily_msg_limit} pesan\nSisa Kuota: *${Math.max(0, userPlan.daily_msg_limit - user.daily_messages_sent)}* pesan\n\n_100% Whitelabel Murni Bebas Watermark._`
    };
  }

  if (lower.startsWith('/statusbot') || lower === '/status') {
    const primarySess = db.sessions.find(s => s.is_primary) || db.sessions[0];
    return {
      reply: `🟢 *STATUS GATEWAY WHATSAPP*\n\nStatus: *${primarySess?.status === 'connected' ? 'TERHUBUNG (ONLINE)' : 'SIAP KONEK'}*\nNomor Gateway: *${primarySess?.phone_number || whitelabel.primary_bot_phone}*\nEngine: *${whitelabel.app_name} v2.6*\nAI Fallback: *Aktif 24/7*\n\n_Ketik */send* untuk kirim pesan._`
    };
  }

  if (lower === '/send' || lower === '/kirim' || lower === '/broadcast') {
    return {
      reply:
        `📱 *Template Kirim Pesan & Broadcast (Japriin Bridge)*\n\n` +
        `Silakan kirim pesan dengan format:\n` +
        `1️⃣ *1 Nomor:* */send <nomor> <pesan>*\n` +
        `   _Contoh: /send 08123456789 Halo kak, pesanan siap._\n\n` +
        `2️⃣ *Banyak Nomor (Broadcast):* */broadcast <nomor1>,<nomor2> <pesan>*\n` +
        `   _Contoh: /broadcast 08123456789, 08198765432 Halo kak, promo diskon hari ini!_\n\n` +
        `_Ketik */status* untuk cek sisa kuota harian._`
    };
  }

  if (lower.startsWith('/send ') || lower.startsWith('/kirim ') || lower.startsWith('/broadcast ')) {
    const cmdWord = text.split(/\s+/)[0];
    const rawArgs = text.substring(cmdWord.length).trim();

    // Extract 1 or many leading phone numbers (comma, semicolon, or space/newline separated)
    const phones: string[] = [];
    let pos = 0;
    while (pos < rawArgs.length) {
      const wsMatch = rawArgs.slice(pos).match(/^[\s,;]+/);
      if (wsMatch) pos += wsMatch[0].length;
      const tokMatch = rawArgs.slice(pos).match(/^([^\s]+)/);
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
        subParts.forEach(sp => phones.push(normalizePhoneNumber(sp.replace(/\D/g, ''))));
        pos += token.length;
      } else {
        break;
      }
    }

    const msgContent = rawArgs.slice(pos).replace(/^[\s:,\-|]+/, '').trim();

    if (phones.length === 0 || !msgContent) {
      return {
        reply:
          `⚠️ *Format Pengiriman Belum Sesuai*\n\n` +
          `Gunakan format:\n` +
          `👉 */send <nomor_tujuan> <isi_pesan>*\n` +
          `👉 */broadcast <nomor1>,<nomor2> <isi_pesan>*\n\n` +
          `Contoh:\n` +
          `*/send 08123456789 Halo kak, pesanan sudah dikirim!*`
      };
    }

    const uniquePhones = Array.from(new Set(phones));
    for (const p of uniquePhones) {
      addMessageLog({
        sender_phone: p,
        sender_name: uniquePhones.length > 1 ? `Broadcast (${p})` : `Tujuan (${p})`,
        message_body: msgContent,
        direction: 'outgoing',
        status: 'Sukses',
        user_id: user.id,
        reply_body: uniquePhones.length > 1 ? 'Dikirim via Broadcast WhatsApp (/broadcast)' : 'Dikirim via Remote WhatsApp Command (/send)'
      });
    }

    if (uniquePhones.length > 1) {
      addBroadcastHistory({
        user_id: user.id,
        recipients_count: uniquePhones.length,
        message: msgContent,
        status: 'completed',
        success_count: uniquePhones.length,
        failed_count: 0
      });
    }

    return {
      reply:
        uniquePhones.length > 1
          ? `✅ *Broadcast Berhasil Terkirim ke ${uniquePhones.length} Nomor!*\n\n• Daftar Tujuan: *${uniquePhones.slice(0, 5).join(', ')}${uniquePhones.length > 5 ? ` (+${uniquePhones.length - 5} lainnya)` : ''}*\n• Isi Pesan: "${msgContent}"`
          : `✅ *Pesan Berhasil Terkirim!*\n\n• Nomor Tujuan: *${uniquePhones[0]}*\n• Isi Pesan: "${msgContent}"`,
      actionExecuted: true
    };
  }

  if (lower.startsWith('/setpin')) {
    const pinPart = text.replace('/setpin', '').trim();
    if (!pinPart || pinPart.length < 4 || pinPart.length > 8) {
      return {
        reply: `⚠️ Format salah! Contoh penggunaan:\n*/setpin 123456* (Masukkan 4-8 digit angka)`
      };
    }
    setUserSecurityPin(user.id, pinPart);
    return {
      reply: `✅ *PIN KEAMANAN BERHASIL DISIMPAN!*\n\nPIN keamanan Anda telah aktif. Setiap kali Anda mengeksekusi perintah penting via WhatsApp, bot akan meminta Anda memilih PIN Anda.`
    };
  }

  if (lower.startsWith('/editakun')) {
    const rawParams = text.replace('/editakun', '').trim();
    const nameMatch = rawParams.match(/nama=([^&]+)/i);
    const emailMatch = rawParams.match(/email=([^&]+)/i);

    const newName = nameMatch ? nameMatch[1].trim() : undefined;
    const newEmail = emailMatch ? emailMatch[1].trim() : undefined;

    if (!newName && !newEmail) {
      return {
        reply: `⚠️ Format salah! Contoh penggunaan:\n*/editakun nama=Ahmad Fauzi* atau */editakun email=ahmad@gmail.com*`
      };
    }

    // Must have security PIN
    if (!user.security_pin) {
      return {
        reply: `🔒 Anda belum membuat PIN keamanan. Silakan buat PIN terlebih dahulu dengan mengetik:\n*/setpin 123456*`
      };
    }

    // Trigger PIN challenge
    const challenge = createPinChallenge(fromPhone, user.id, {
      type: 'edit_account',
      payload: { name: newName, email: newEmail }
    });

    return {
      reply: challenge.prompt
    };
  }

  if (lower.startsWith('/kirimpesan')) {
    const rawParams = text.replace('/kirimpesan', '').trim();
    const toMatch = rawParams.match(/to=([0-9+]+)/i);
    const msgMatch = rawParams.match(/msg=(.+)/i);

    if (!toMatch || !msgMatch) {
      return {
        reply: `⚠️ Format salah! Contoh penggunaan:\n*/kirimpesan to=08123456789 msg=Halo kak pesanan sudah dikirim!*`
      };
    }

    const targetTo = toMatch[1].trim();
    const messageContent = msgMatch[1].trim();

    if (!user.security_pin) {
      return {
        reply: `🔒 Anda belum membuat PIN keamanan. Silakan buat PIN terlebih dahulu dengan mengetik:\n*/setpin <4-8 digit PIN>*`
      };
    }

    const challenge = createPinChallenge(fromPhone, user.id, {
      type: 'send_message',
      payload: { to: targetTo, msg: messageContent }
    });

    return {
      reply: challenge.prompt
    };
  }

  // Fallback: Informative Guide
  return {
    reply: `Halo kak ${user.name}! Pesan Anda: "${text}"\n\nUntuk melihat menu aksi cepat bot tanpa buka web, ketik: */menu*`
  };
}

// ==========================================
// SYSTEM CONFIG & QRIS
// ==========================================
export function getSystemConfig(): SystemConfig {
  const db = initDbFile();
  return db.systemConfig;
}

export function normalizeFreeAutoReplyHours(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0 || num > 720) return null;
  return Math.round(num * 100) / 100;
}

export function getFreeAutoReplyHours(_sysConfig?: SystemConfig): number {
  return 0; // Akun Free kini dapat memakai balas otomatis penuh tanpa batas jam
}

export function getMaxGlobalSessions(sysConfig?: SystemConfig): number {
  const cfg = sysConfig || initDbFile().systemConfig;
  const parsed = normalizeMaxGlobalSessions(cfg?.max_global_sessions);
  return parsed !== null ? parsed : DEFAULT_MAX_GLOBAL_SESSIONS;
}

export function getUserAutoReplyStatus(
  userOrId: UserAccount | string | null | undefined,
  _sysConfig?: SystemConfig
): AutoReplyStatusInfo {
  const user =
    typeof userOrId === 'string'
      ? getUserById(userOrId)
      : userOrId || null;

  if (!user) {
    return {
      enabled: false,
      allowed: false,
      is_free_plan: true,
      expired: false,
      free_hours_limit: 0,
      activated_at: null,
      expires_at: null,
      remaining_seconds: null,
      reason: 'Akun pengguna tidak ditemukan.'
    };
  }

  const isFreePlan =
    user.role !== 'admin' &&
    (!user.plan_id || user.plan_id === 'free' || user.plan_status !== 'active');

  if (!user.is_active || !user.email_verified) {
    return {
      enabled: false,
      allowed: false,
      is_free_plan: isFreePlan,
      expired: false,
      free_hours_limit: 0,
      activated_at: user.auto_reply_activated_at || null,
      expires_at: null,
      remaining_seconds: null,
      reason: 'Akun belum aktif atau belum terverifikasi email.'
    };
  }

  // Admin default true kecuali dimatikan eksplisit; user biasa default OFF (wajib diaktifkan manual)
  const enabled = user.role === 'admin'
    ? user.auto_reply_enabled !== false
    : user.auto_reply_enabled === true;

  return {
    enabled,
    allowed: enabled,
    is_free_plan: isFreePlan,
    expired: false,
    free_hours_limit: 0,
    activated_at: user.auto_reply_activated_at || null,
    expires_at: null,
    remaining_seconds: null,
    reason: enabled ? undefined : 'Respon pesan otomatis sedang dimatikan (nonaktif).'
  };
}

export function toggleUserAutoReply(
  userId: string,
  enabled: boolean
): {
  success: boolean;
  user?: UserAccount;
  status?: AutoReplyStatusInfo;
  code?: string;
  error?: string;
} {
  const db = initDbFile();
  const idx = db.users.findIndex(u => u.id === userId);
  if (idx === -1) {
    return { success: false, code: 'USER_NOT_FOUND', error: 'Akun pengguna tidak ditemukan.' };
  }

  const user = db.users[idx];
  if (!user.is_active || !user.email_verified) {
    return { success: false, code: 'USER_INACTIVE', error: 'Akun belum aktif atau belum verifikasi email.' };
  }

  if (enabled && (!user.auto_reply_activated_at || !Number.isFinite(Date.parse(user.auto_reply_activated_at)))) {
    user.auto_reply_activated_at = new Date().toISOString();
  }

  user.auto_reply_enabled = Boolean(enabled);
  writeDbFile(db, true);
  asyncSyncUser(user);
  const status = getUserAutoReplyStatus(user, db.systemConfig);
  return {
    success: true,
    user,
    status
  };
}

export function resetFreeUserAutoReplyTimer(userId: string): UserAccount | null {
  const db = initDbFile();
  const idx = db.users.findIndex(u => u.id === userId);
  if (idx === -1) return null;
  db.users[idx].auto_reply_activated_at = undefined;
  writeDbFile(db, true);
  asyncSyncUser(db.users[idx]);
  return db.users[idx];
}

export function updateSystemConfig(updates: Partial<SystemConfig>): SystemConfig {
  const db = initDbFile();
  const safeUpdates: Partial<SystemConfig> = { ...updates };
  if (typeof safeUpdates.mysql_password === 'string') {
    const trimmed = safeUpdates.mysql_password.trim();
    if (!trimmed) {
      delete safeUpdates.mysql_password;
    } else if (!trimmed.startsWith('gcm:')) {
      safeUpdates.mysql_password = encryptData(trimmed);
    }
  }
  if (safeUpdates.free_auto_reply_hours !== undefined) {
    const cleanHours = normalizeFreeAutoReplyHours(safeUpdates.free_auto_reply_hours);
    if (cleanHours !== null) {
      safeUpdates.free_auto_reply_hours = cleanHours;
    } else {
      delete safeUpdates.free_auto_reply_hours;
    }
  }
  if (safeUpdates.max_global_sessions !== undefined) {
    const cleanMaxGlobal = normalizeMaxGlobalSessions(safeUpdates.max_global_sessions);
    if (cleanMaxGlobal !== null) {
      safeUpdates.max_global_sessions = cleanMaxGlobal;
    } else {
      delete safeUpdates.max_global_sessions;
    }
  }
  if (safeUpdates.app_nodes !== undefined) {
    safeUpdates.app_nodes = normalizeAppNodes(safeUpdates.app_nodes);
  }
  if (safeUpdates.kill_target_ips !== undefined) {
    safeUpdates.kill_target_ips = normalizeKillTargetIps(safeUpdates.kill_target_ips);
  }
  if (safeUpdates.admin_notify_phone !== undefined) {
    safeUpdates.admin_notify_phone = normalizeAdminNotifyPhone(safeUpdates.admin_notify_phone);
  }
  if (safeUpdates.telegram_bot_token !== undefined) {
    safeUpdates.telegram_bot_token = normalizeStoredTelegramToken(safeUpdates.telegram_bot_token);
  }
  if (safeUpdates.telegram_chat_id !== undefined) {
    safeUpdates.telegram_chat_id = normalizeTelegramChatId(safeUpdates.telegram_chat_id);
  }
  if (safeUpdates.telegram_enabled !== undefined) {
    safeUpdates.telegram_enabled = Boolean(safeUpdates.telegram_enabled);
  }
  if (safeUpdates.telegram_configs !== undefined) {
    safeUpdates.telegram_configs = normalizeTelegramConfigs(safeUpdates.telegram_configs);
  }
  db.systemConfig = { ...db.systemConfig, ...safeUpdates };
  writeDbFile(db, true);
  asyncSyncKv('systemConfig', db.systemConfig);
  if (safeUpdates.app_nodes !== undefined) {
    import('./mysqlService.js')
      .then(m => m.syncConfiguredAppNodesToMysql(db.systemConfig.app_nodes || []))
      .catch(() => {});
  }
  return db.systemConfig;
}

export function getQrisConfig(): any {
  const db = initDbFile();
  return db.systemConfig.qris_config || DEFAULT_QRIS_CONFIG;
}

export function updateQrisConfig(config: any): any {
  const db = initDbFile();
  db.systemConfig.qris_config = {
    ...config,
    updated_at: new Date().toISOString()
  };
  writeDbFile(db, true);
  asyncSyncKv('systemConfig', db.systemConfig);
  return db.systemConfig.qris_config;
}

// ==========================================
// MESSAGE LOGS, BROADCAST LOGS & 7-DAY AUTO RETENTION
// ==========================================
let lastLogPurgeCheckAt = 0;
const LOG_PURGE_COOLDOWN_MS = 5 * 60 * 1000;

export function purgeExpiredLogs(dbInstance?: LocalDatabase, force = false): number {
  const now = Date.now();
  if (!force && now - lastLogPurgeCheckAt < LOG_PURGE_COOLDOWN_MS) {
    return 0;
  }
  lastLogPurgeCheckAt = now;

  const db = dbInstance || initDbFile();
  const cutoffMs = now - LOG_RETENTION_MS;
  let removedCount = 0;

  if (Array.isArray(db.messages) && db.messages.length > 0) {
    const beforeLen = db.messages.length;
    db.messages = db.messages.filter(m => {
      if (!m.created_at) return true;
      const ts = new Date(m.created_at).getTime();
      return isNaN(ts) || ts >= cutoffMs;
    });
    removedCount += beforeLen - db.messages.length;
  }

  if (Array.isArray(db.broadcastHistory) && db.broadcastHistory.length > 0) {
    const beforeBcLen = db.broadcastHistory.length;
    db.broadcastHistory = db.broadcastHistory.filter(b => {
      if (!b.created_at) return true;
      const ts = new Date(b.created_at).getTime();
      return isNaN(ts) || ts >= cutoffMs;
    });
    removedCount += beforeBcLen - db.broadcastHistory.length;
  }

  if (removedCount > 0) {
    writeDbFile(db);
    getMysqlModule()
      .then(m => {
        if (m.isMysqlConfigured()) return m.purgeOldMysqlLogs();
      })
      .catch(() => {});
    console.log(`[Auto-Clean 7 Hari] Berhasil menghapus otomatis ${removedCount} log pesan/broadcast yang berusia > 7 hari.`);
  }

  return removedCount;
}

// Run 7-day log cleanup automatically every 30 minutes
const logCleanupTimer = setInterval(() => {
  try {
    purgeExpiredLogs(undefined, true);
    getMysqlModule()
      .then(m => {
        if (m.isMysqlConfigured()) return m.purgeOldMysqlLogs();
      })
      .catch(() => {});
  } catch {
    // Ignore background cleanup errors
  }
}, 30 * 60 * 1000);
logCleanupTimer.unref?.();

function isSecretOtpMessageContent(text?: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return (
    lower.includes('kode verifikasi') ||
    lower.includes('kode otp') ||
    lower.includes('verifikasi dua langkah') ||
    lower.includes('reset password')
  );
}

export function getMessageLogs(userId?: string): WhatsAppMessageLog[] {
  const db = initDbFile();
  purgeExpiredLogs(db);
  if (!userId) return [];

  const user = getUserById(userId);
  if (!user) return [];

  const nonOtpMessages = db.messages.filter(
    m => !isSecretOtpMessageContent(m.message_body) && !isSecretOtpMessageContent(m.reply_body)
  );

  if (user.role === 'admin') return nonOtpMessages;

  // Gather user session IDs
  const userSessions = getSessionsByUserId(user.id);
  const sessionIds = new Set(userSessions.map(s => s.id));

  // STRICT MESSAGE ISOLATION: Only messages that belong to this user or their sessions
  return nonOtpMessages.filter(m => {
    if (m.user_id && (m.user_id === user.id || m.user_id === userId)) return true;
    if (m.session_id && sessionIds.has(m.session_id)) return true;
    return false;
  });
}

export function addMessageLog(logData: Omit<WhatsAppMessageLog, 'id' | 'created_at'>): WhatsAppMessageLog {
  const db = initDbFile();
  purgeExpiredLogs(db);

  // Never record secret OTP messages in the visible message logs
  if (isSecretOtpMessageContent(logData.message_body) || isSecretOtpMessageContent(logData.reply_body)) {
    return {
      ...logData,
      id: `msg_otp_hidden_${Date.now()}`,
      created_at: new Date().toISOString()
    };
  }

  let assignedUserId = logData.user_id;
  if (!assignedUserId && logData.session_id) {
    const s = db.sessions.find(ses => ses.id === logData.session_id);
    if (s && s.user_id) assignedUserId = s.user_id;
  }
  if (!assignedUserId) {
    const regularUsers = db.users.filter(u => u.role === 'user');
    if (regularUsers.length === 1) assignedUserId = regularUsers[0].id;
  }

  const newLog: WhatsAppMessageLog = {
    ...logData,
    user_id: assignedUserId,
    id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    created_at: new Date().toISOString()
  };

  db.messages.unshift(newLog);
  if (db.messages.length > 1000) {
    db.messages = db.messages.slice(0, 1000);
  }

  if (logData.direction === 'incoming') {
    db.stats.total_incoming = (db.stats.total_incoming || 0) + 1;
    db.stats.last_message_at = new Date().toISOString();
  }

  if (logData.reply_body) {
    db.stats.total_auto_replied = (db.stats.total_auto_replied || 0) + 1;
    if (logData.ai_generated) {
      db.stats.total_ai_replied = (db.stats.total_ai_replied || 0) + 1;
    }
  }

  if (logData.status === 'Gagal') {
    db.stats.total_failed = (db.stats.total_failed || 0) + 1;
  }

  // Track message activity for 3-day inactivity cleanup & Free eviction scoring
  const msgDelta = logData.reply_body ? 2 : 1;
  recordSessionMessageActivity(logData.session_id, assignedUserId, msgDelta);

  writeDbFile(db);
  asyncSyncMessage(newLog);
  return newLog;
}

export function clearMessageLogs(userId?: string): void {
  const db = initDbFile();
  if (!userId) {
    db.messages = [];
    asyncClearMessages();
  } else {
    const user = getUserById(userId);
    if (!user || user.role === 'admin') {
      db.messages = [];
      asyncClearMessages();
    } else {
      const userSessions = getSessionsByUserId(user.id);
      const sessionIds = new Set(userSessions.map(s => s.id));
      db.messages = db.messages.filter(
        m => m.user_id !== user.id && m.user_id !== userId && (!m.session_id || !sessionIds.has(m.session_id))
      );
      asyncClearMessages(user.id);
    }
  }
  writeDbFile(db);
}

export function getBroadcastHistory(userId?: string): BroadcastLogEntry[] {
  const db = initDbFile();
  purgeExpiredLogs(db);
  if (!Array.isArray(db.broadcastHistory)) {
    db.broadcastHistory = [];
  }
  if (!userId) return db.broadcastHistory;
  const user = getUserById(userId);
  if (!user || user.role === 'admin') return db.broadcastHistory;
  return db.broadcastHistory.filter(b => b.user_id === user.id || b.user_id === userId);
}

export function addBroadcastHistory(entry: Omit<BroadcastLogEntry, 'id' | 'created_at'>): BroadcastLogEntry {
  const db = initDbFile();
  purgeExpiredLogs(db);
  if (!Array.isArray(db.broadcastHistory)) {
    db.broadcastHistory = [];
  }
  const newItem: BroadcastLogEntry = {
    ...entry,
    id: `bc_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    created_at: new Date().toISOString()
  };
  db.broadcastHistory.unshift(newItem);
  if (db.broadcastHistory.length > 200) {
    db.broadcastHistory = db.broadcastHistory.slice(0, 200);
  }
  writeDbFile(db);
  asyncSyncKv('broadcastHistory', db.broadcastHistory);
  return newItem;
}

export function clearBroadcastHistory(userId?: string): void {
  const db = initDbFile();
  if (!Array.isArray(db.broadcastHistory)) {
    db.broadcastHistory = [];
    return;
  }
  if (!userId) {
    db.broadcastHistory = [];
  } else {
    const user = getUserById(userId);
    if (!user || user.role === 'admin') {
      db.broadcastHistory = [];
    } else {
      db.broadcastHistory = db.broadcastHistory.filter(b => b.user_id !== user.id && b.user_id !== userId);
    }
  }
  writeDbFile(db);
  asyncSyncKv('broadcastHistory', db.broadcastHistory);
}

export function getBotStats(userId?: string): BotStats {
  const db = initDbFile();
  const user = userId ? getUserById(userId) : null;
  const hasServerEnvMysql = Boolean(
    process.env.MYSQL_HOST?.trim() &&
    process.env.MYSQL_USER?.trim() &&
    process.env.MYSQL_DATABASE?.trim()
  );
  const hasSavedMysql = Boolean(
    db.systemConfig.mysql_host?.trim() &&
    db.systemConfig.mysql_user?.trim() &&
    db.systemConfig.mysql_database?.trim()
  );
  const dbStatus: 'online' | 'offline' = hasServerEnvMysql || hasSavedMysql ? 'online' : 'offline';

  if (!userId || !user || user.role === 'admin') {
    const primarySession = db.sessions.find(s => s.is_primary) || db.sessions[0];
    const whitelabel = db.systemConfig?.whitelabel_config || DEFAULT_WHITELABEL;

    return {
      total_incoming: db.stats.total_incoming || db.messages.filter(m => m.direction === 'incoming').length,
      total_auto_replied: db.stats.total_auto_replied || db.messages.filter(m => m.reply_body).length,
      total_failed: db.stats.total_failed || db.messages.filter(m => m.status === 'Gagal').length,
      total_ai_replied: db.stats.total_ai_replied || db.messages.filter(m => m.ai_generated).length,
      gateway_status: db.sessions.some(s => s.status === 'connected') ? 'Active' : 'Inactive',
      db_status: dbStatus,
      last_message_at: db.stats.last_message_at || db.messages[0]?.created_at,
      active_session_phone: primarySession?.phone_number || whitelabel.primary_bot_phone,
      active_session_name: primarySession?.session_name || whitelabel.primary_bot_name,
      primary_bot_phone: whitelabel.primary_bot_phone,
      total_connected_sessions: db.sessions.filter(s => s.status === 'connected').length,
      daily_messages_sent: user?.daily_messages_sent || 0,
      daily_msg_limit: 999999,
      monthly_messages_sent: user?.monthly_messages_sent || 0,
      monthly_msg_limit: 999999,
      daily_ai_sent: user?.daily_ai_sent || 0,
      daily_ai_limit: 999999,
      monthly_ai_sent: user?.monthly_ai_sent || 0,
      monthly_ai_limit: 999999,
      free_auto_reply_hours: 0,
      max_global_sessions: getMaxGlobalSessions(db.systemConfig),
      slot_status: getGlobalSlotStatus()
    };
  }

  // Isolated stats for regular users
  const userLogs = getMessageLogs(userId);
  let totalIncoming = 0;
  let totalAutoReplied = 0;
  let totalFailed = 0;
  let totalAiReplied = 0;
  for (const m of userLogs) {
    if (m.direction === 'incoming') totalIncoming++;
    if (m.reply_body) totalAutoReplied++;
    if (m.status === 'Gagal') totalFailed++;
    if (m.ai_generated) totalAiReplied++;
  }
  const userSessions = getSessionsByUserId(userId);
  const connectedUserSessions = userSessions.filter(s => s.status === 'connected');
  const primarySession = connectedUserSessions[0] || userSessions[0];

  const plans = db.plans || DEFAULT_SUBSCRIPTION_PLANS;
  const userPlan = resolveUserPlanForQuota(plans, user);
  const isFree = isUserOnFreeTier(user);
  const dailyMsgLimit = userPlan.daily_msg_limit || 100;
  const monthlyMsgLimit = userPlan.monthly_msg_limit || 500;

  return {
    total_incoming: totalIncoming,
    total_auto_replied: totalAutoReplied,
    total_failed: totalFailed,
    total_ai_replied: totalAiReplied,
    gateway_status: connectedUserSessions.length > 0 ? 'Active' : 'Inactive',
    db_status: dbStatus,
    last_message_at: userLogs[0]?.created_at,
    active_session_phone: primarySession?.phone_number || user.phone || '081234567890',
    active_session_name: primarySession?.session_name || `Nomor ${user.name}`,
    primary_bot_phone: primarySession?.phone_number || user.phone,
    total_connected_sessions: connectedUserSessions.length,
    daily_messages_sent: user.daily_messages_sent || 0,
    daily_msg_limit: dailyMsgLimit,
    monthly_messages_sent: user.monthly_messages_sent || 0,
    monthly_msg_limit: monthlyMsgLimit,
    daily_ai_sent: user.daily_ai_sent || 0,
    daily_ai_limit: isFree ? dailyMsgLimit : (userPlan.daily_ai_limit || dailyMsgLimit),
    monthly_ai_sent: user.monthly_ai_sent || 0,
    monthly_ai_limit: isFree ? monthlyMsgLimit : (userPlan.monthly_ai_limit || monthlyMsgLimit),
    free_auto_reply_hours: 0,
    max_global_sessions: getMaxGlobalSessions(db.systemConfig),
    slot_status: getGlobalSlotStatus()
  };
}

// ==========================================
// AUTO REPLY RULES (STRICT MULTI-USER ISOLATION)
// ==========================================
export function getAutoReplyRules(userId?: string): AutoReplyRule[] {
  const db = initDbFile();
  if (!Array.isArray(db.rules)) db.rules = [];

  // Strictly isolate: never leak all rules if userId is missing
  if (!userId) {
    return [];
  }

  const user = getUserById(userId);
  if (!user) {
    return [];
  }

  // If user is administrator, show admin/system rules
  if (user.role === 'admin') {
    return db.rules.filter(
      r => r.user_id === user.id || r.user_id === 'user_superadmin' || r.user_id === 'usr_superadmin' || r.user_id === 'user_admin' || r.user_id === 'usr_admin'
    );
  }

  const userRules = db.rules.filter(r => r.user_id === user.id || r.user_id === userId);
  if (!user.rules_initialized) {
    user.rules_initialized = true;
    writeDbFile(db);
  }

  return userRules;
}

export function addAutoReplyRule(ruleData: Omit<AutoReplyRule, 'id' | 'created_at' | 'updated_at'> & { user_id?: string }): AutoReplyRule {
  const db = initDbFile();
  if (!Array.isArray(db.rules)) db.rules = [];

  if (!ruleData.user_id) {
    throw new Error('User ID wajib disertakan untuk isolasi data akun.');
  }

  const targetUserId = ruleData.user_id;
  const newRule: AutoReplyRule = {
    ...ruleData,
    user_id: targetUserId,
    id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  db.rules.push(newRule);
  writeDbFile(db);
  asyncSyncRule(newRule);
  return newRule;
}

export function toggleAutoReplyRule(id: string, userId?: string): AutoReplyRule | null {
  const db = initDbFile();
  if (!Array.isArray(db.rules)) db.rules = [];

  const rule = db.rules.find(r => r.id === id);
  if (!rule) return null;

  if (!userId) return null;

  const user = getUserById(userId);
  if (!user) return null;

  // Strict ownership check
  if (user.role !== 'admin') {
    if (rule.user_id !== user.id && rule.user_id !== userId) {
      return null; // Forbidden: cannot edit another user's rule
    }
  } else {
    // If admin is toggling, allow if rule belongs to admin or system
    const isAdminRule = !rule.user_id || rule.user_id === user.id || rule.user_id.includes('admin') || rule.user_id.includes('superadmin');
    if (!isAdminRule && rule.user_id !== user.id) {
      return null;
    }
  }

  rule.is_active = !rule.is_active;
  rule.updated_at = new Date().toISOString();
  writeDbFile(db);
  asyncSyncRule(rule);
  return rule;
}

export function deleteAutoReplyRule(id: string, userId?: string): boolean {
  const db = initDbFile();
  if (!Array.isArray(db.rules)) db.rules = [];

  const rule = db.rules.find(r => r.id === id);
  if (!rule) return false;

  if (!userId) return false;

  const user = getUserById(userId);
  if (!user) return false;

  // Strict ownership check
  if (user.role !== 'admin') {
    if (rule.user_id !== user.id && rule.user_id !== userId) {
      return false; // Forbidden: cannot delete another user's rule
    }
  } else {
    // If admin is deleting, only allow deleting their own/admin rules
    const isAdminRule = !rule.user_id || rule.user_id === user.id || rule.user_id.includes('admin') || rule.user_id.includes('superadmin');
    if (!isAdminRule && rule.user_id !== user.id) {
      return false;
    }
  }

  const initialLength = db.rules.length;
  db.rules = db.rules.filter(r => r.id !== id);
  if (db.rules.length !== initialLength) {
    writeDbFile(db);
    asyncDeleteRule(id);
    return true;
  }
  return false;
}

// ==========================================
// WHATSAPP SESSIONS & MULTI-USER ISOLATION
// ==========================================

/**
 * Deduplicates WhatsApp sessions array so that each clean phone number per user appears ONLY ONCE.
 */
function deduplicateSessionsList(sessions: WhatsAppSession[]): { deduplicated: WhatsAppSession[]; modified: boolean } {
  if (!sessions || sessions.length <= 1) return { deduplicated: sessions || [], modified: false };

  const map = new Map<string, WhatsAppSession>();
  let modified = false;

  for (const sess of sessions) {
    const cleanPhone = sess.phone_number ? sess.phone_number.replace(/\D/g, '') : sess.id;
    const key = sess.user_id ? `${sess.user_id}_${cleanPhone}` : cleanPhone;

    if (!map.has(key)) {
      map.set(key, sess);
    } else {
      modified = true;
      const existing = map.get(key)!;
      // Prefer connected status over disconnected, or keep latest updated_at
      if (sess.status === 'connected' && existing.status !== 'connected') {
        map.set(key, sess);
      } else if (new Date(sess.updated_at || 0) > new Date(existing.updated_at || 0)) {
        map.set(key, sess);
      }
    }
  }

  return { deduplicated: Array.from(map.values()), modified };
}

export function getWhatsAppSessions(): WhatsAppSession[] {
  const db = initDbFile();
  const { deduplicated, modified } = deduplicateSessionsList(db.sessions || []);
  if (modified) {
    db.sessions = deduplicated;
    writeDbFile(db);
  }
  return db.sessions;
}

export function getSessionById(id: string): WhatsAppSession | null {
  const db = initDbFile();
  const cleanId = String(id || '').trim();
  if (!cleanId) return null;
  const direct = db.sessions.find(s => s.id === cleanId);
  if (direct) return direct;
  if (/^\+?\d{8,16}$/.test(cleanId)) {
    const cleanDigits = normalizePhoneForUniqueness(cleanId);
    if (cleanDigits.length >= 8) {
      return (
        db.sessions.find(
          s => s.phone_number && normalizePhoneForUniqueness(s.phone_number) === cleanDigits
        ) || null
      );
    }
  }
  return db.sessions.find(s => s.phone_number === cleanId) || null;
}

export function isSessionOwnedByUserId(sessionId?: string | null, userId?: string | null): boolean {
  if (!sessionId || !userId) return false;
  const cleanSession = String(sessionId).trim();
  const cleanUser = String(userId).trim();
  if (!cleanSession || !cleanUser) return false;
  if (cleanSession === cleanUser) return true;
  const escaped = cleanUser.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^(?:session_user_|session_pair_|session_meta_|session_)?${escaped}(?:$|[._-])`);
  return pattern.test(cleanSession);
}

export function extractUserIdFromSessionId(sessionId: string, users: UserAccount[]): string | undefined {
  if (!sessionId) return undefined;
  // Match known user IDs using boundary-safe check (sorting descending by length to match specific IDs first)
  const sortedUsers = [...users].sort((a, b) => b.id.length - a.id.length);
  for (const u of sortedUsers) {
    if (isSessionOwnedByUserId(sessionId, u.id)) {
      return u.id;
    }
  }
  return undefined;
}

export function getSessionsByUserId(userId: string): WhatsAppSession[] {
  const db = initDbFile();
  const allSessions = getWhatsAppSessions();
  const user = getUserById(userId);
  if (!user) return [];

  const userPhoneClean = user.phone ? normalizePhoneForUniqueness(user.phone) : '';

  // STRICT USER ISOLATION: A user only ever sees their OWN connected devices
  return allSessions.filter(s => {
    // 1. Direct match on user_id
    if (s.user_id && (s.user_id === user.id || s.user_id === userId)) return true;
    // 2. Boundary-safe match on session ID for this user
    if (s.id && isSessionOwnedByUserId(s.id, user.id)) return true;
    // 3. Fallback only if session has NO user_id AND strictly matches this user's registered phone
    if (
      !s.user_id &&
      userPhoneClean &&
      s.phone_number &&
      normalizePhoneForUniqueness(s.phone_number) === userPhoneClean
    ) {
      s.user_id = user.id;
      writeDbFile(db);
      return true;
    }
    return false;
  });
}

export function addWhatsAppSession(sessionData: Omit<WhatsAppSession, 'id' | 'created_at' | 'updated_at'> & { id?: string }): WhatsAppSession {
  const db = initDbFile();
  const cleanPhone = sessionData.phone_number ? sessionData.phone_number.replace(/\D/g, '') : '';

  let targetUserId = sessionData.user_id;
  if (!targetUserId && cleanPhone) {
    const matchedU = db.users.find(u => u.phone && u.phone.replace(/\D/g, '') === cleanPhone);
    if (matchedU) targetUserId = matchedU.id;
  }
  if (!targetUserId && sessionData.id) {
    targetUserId = extractUserIdFromSessionId(sessionData.id, db.users);
  }

  // Calculate default 30-day session expiry (like WhatsApp Web)
  const defaultExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  // Check for existing session with same ID or same phone_number for the SAME user
  const existingIndex = db.sessions.findIndex(s => {
    if (sessionData.id && s.id === sessionData.id) return true;
    const sClean = s.phone_number ? s.phone_number.replace(/\D/g, '') : '';
    if (cleanPhone && sClean && cleanPhone === sClean) {
      if (targetUserId && s.user_id) {
        return s.user_id === targetUserId;
      }
      return false;
    }
    return false;
  });

  if (existingIndex !== -1) {
    // Update existing session in-place instead of creating a duplicate row
    const existing = db.sessions[existingIndex];
    const resolvedOwnerId = targetUserId || existing.user_id;
    if (sessionData.is_primary) {
      db.sessions.forEach(s => {
        if (!resolvedOwnerId || s.user_id === resolvedOwnerId) {
          s.is_primary = false;
        }
      });
    }
    const nowIso = new Date().toISOString();
    const nextConnectedAt =
      sessionData.connected_at ||
      existing.connected_at ||
      (sessionData.status === 'connected' ? nowIso : undefined);
    db.sessions[existingIndex] = {
      ...existing,
      ...sessionData,
      id: sessionData.id || existing.id,
      phone_number: cleanPhone || sessionData.phone_number || existing.phone_number,
      status: sessionData.status || existing.status,
      user_id: resolvedOwnerId,
      session_name: sessionData.session_name || existing.session_name,
      connected_at: nextConnectedAt,
      last_activity_at:
        sessionData.last_activity_at ||
        existing.last_activity_at ||
        (sessionData.status === 'connected' ? nowIso : existing.connected_at),
      total_messages_count:
        sessionData.total_messages_count !== undefined
          ? Math.max(0, Number(sessionData.total_messages_count) || 0)
          : (existing.total_messages_count ?? 0),
      expires_at: sessionData.expires_at || existing.expires_at || defaultExpiry,
      updated_at: nowIso
    };
    writeDbFile(db, true);
    asyncSyncSession(db.sessions[existingIndex]);
    return db.sessions[existingIndex];
  }

  // Insert new session if none exists
  const nowIso = new Date().toISOString();
  const newSession: WhatsAppSession = {
    ...sessionData,
    user_id: targetUserId,
    phone_number: cleanPhone || sessionData.phone_number,
    id: sessionData.id || `sess_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    connected_at:
      sessionData.connected_at ||
      (sessionData.status === 'connected' ? nowIso : undefined),
    last_activity_at:
      sessionData.last_activity_at ||
      (sessionData.status === 'connected' ? nowIso : undefined),
    total_messages_count: Math.max(0, Number(sessionData.total_messages_count) || 0),
    expires_at: sessionData.expires_at || defaultExpiry,
    created_at: nowIso,
    updated_at: nowIso
  };

  if (newSession.is_primary) {
    db.sessions.forEach(s => {
      if (!targetUserId || s.user_id === targetUserId) {
        s.is_primary = false;
      }
    });
  }

  db.sessions.push(newSession);
  writeDbFile(db, true);
  asyncSyncSession(newSession);
  return newSession;
}

export function extendWhatsAppSession(id: string, daysToAdd: number = 30): WhatsAppSession | null {
  const db = initDbFile();
  const index = db.sessions.findIndex(s => s.id === id || s.phone_number === id);
  if (index === -1) return null;

  const current = db.sessions[index];
  const currentExpiry = current.expires_at ? new Date(current.expires_at).getTime() : Date.now();
  const baseTime = currentExpiry > Date.now() ? currentExpiry : Date.now();
  const newExpiry = new Date(baseTime + daysToAdd * 24 * 60 * 60 * 1000).toISOString();

  db.sessions[index] = {
    ...current,
    expires_at: newExpiry,
    updated_at: new Date().toISOString()
  };
  writeDbFile(db);
  asyncSyncSession(db.sessions[index]);
  return db.sessions[index];
}

export function updateWhatsAppSession(id: string, updates: Partial<WhatsAppSession>): WhatsAppSession | null {
  const db = initDbFile();
  const index = db.sessions.findIndex(s => s.id === id || s.phone_number === id);
  if (index === -1) return null;

  const targetOwnerId = updates.user_id || db.sessions[index].user_id;
  if (updates.is_primary) {
    db.sessions.forEach(s => {
      if (!targetOwnerId || s.user_id === targetOwnerId) {
        s.is_primary = false;
      }
    });
  }

  db.sessions[index] = {
    ...db.sessions[index],
    ...updates,
    updated_at: new Date().toISOString()
  };

  writeDbFile(db, true);
  asyncSyncSession(db.sessions[index]);
  return db.sessions[index];
}

export function recordSessionMessageActivity(
  sessionId?: string,
  userId?: string,
  countDelta: number = 1,
  persistImmediately = false
): void {
  const db = initDbFile();
  const nowIso = new Date().toISOString();
  const delta = Math.max(0, Math.floor(countDelta));
  let changed = false;

  let sess: WhatsAppSession | undefined;
  if (sessionId) {
    sess = db.sessions.find(s => s.id === sessionId || s.phone_number === sessionId);
  }
  if (!sess && userId) {
    const owned = db.sessions.filter(
      s => s.user_id === userId || isSessionOwnedByUserId(s.id, userId)
    );
    sess = owned.find(s => s.status === 'connected') || owned[0];
  }

  const resolvedUserId = userId || sess?.user_id || (sess ? extractUserIdFromSessionId(sess.id, db.users) : undefined);

  if (sess) {
    const prevLastAt = sess.last_activity_at ? Date.parse(sess.last_activity_at) : 0;
    const baseCount =
      typeof sess.total_messages_count === 'number' && Number.isFinite(sess.total_messages_count)
        ? sess.total_messages_count
        : (db.messages || []).filter(m => m.session_id === sess!.id).length;
    sess.last_activity_at = nowIso;
    sess.total_messages_count = Math.max(0, baseCount + delta);
    changed = true;
    // Sync to MySQL when message count changes or last activity advanced significantly
    if (delta > 0 || !prevLastAt || Date.now() - prevLastAt >= 60 * 1000) {
      asyncSyncSession(sess);
    }
  }

  if (resolvedUserId) {
    const uIdx = db.users.findIndex(u => u.id === resolvedUserId);
    if (uIdx !== -1) {
      const u = db.users[uIdx];
      const baseUserCount =
        typeof u.total_messages_count === 'number' && Number.isFinite(u.total_messages_count)
          ? u.total_messages_count
          : Math.max(
              Number(u.monthly_messages_sent || 0),
              (db.messages || []).filter(m => m.user_id === u.id).length
            );
      u.total_messages_count = Math.max(0, baseUserCount + delta);
      changed = true;
      if (delta > 0) {
        asyncSyncUser(u);
      }
    }
  }

  if (changed) {
    writeDbFile(db, persistImmediately);
  }
}

export function deleteWhatsAppSession(id: string): boolean {
  const db = initDbFile();
  const cleanId = String(id || '').trim();
  if (!cleanId) return false;
  const initialLength = db.sessions.length;

  const isPhoneInput = /^\+?\d{8,16}$/.test(cleanId);
  const inputPhoneNorm = isPhoneInput ? normalizePhoneForUniqueness(cleanId) : '';
  const targetSession = db.sessions.find(
    s =>
      s.id === cleanId ||
      (isPhoneInput && s.phone_number && normalizePhoneForUniqueness(s.phone_number) === inputPhoneNorm)
  );
  const targetPhone = targetSession?.phone_number
    ? normalizePhoneForUniqueness(targetSession.phone_number)
    : inputPhoneNorm;

  db.sessions = db.sessions.filter(s => {
    if (s.id === cleanId) return false;
    if (targetPhone && s.phone_number) {
      const sPhone = normalizePhoneForUniqueness(s.phone_number);
      const sameOwner = !targetSession?.user_id || !s.user_id || s.user_id === targetSession.user_id;
      if (sPhone === targetPhone && sameOwner) return false;
    }
    return true;
  });

  if (db.sessions.length !== initialLength) {
    writeDbFile(db, true);
    asyncDeleteSession(targetSession?.id || cleanId, targetPhone || undefined);
    return true;
  }
  return false;
}

// ==========================================
// GLOBAL WA CAPACITY, SLOTS & SMART FREE EVICTION
// ==========================================
let slotAllocationChain: Promise<void> = Promise.resolve();

export async function withSlotAllocationLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = slotAllocationChain;
  let release!: () => void;
  slotAllocationChain = new Promise<void>(resolve => {
    release = resolve;
  });
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

export function isPaidActiveUser(user: UserAccount | null | undefined): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return Boolean(user.plan_id && user.plan_id !== 'free' && user.plan_status === 'active');
}

export function isSessionOccupyingGlobalSlot(s: WhatsAppSession): boolean {
  if (!s) return false;
  if (s.status === 'disconnected') return false;
  if (s.expires_at) {
    const expMs = Date.parse(s.expires_at);
    if (Number.isFinite(expMs) && expMs < Date.now()) return false;
  }
  if (s.status === 'connected') return true;
  if (Boolean(s.connected_at)) return true;
  const digits = String(s.phone_number || '').replace(/\D/g, '');
  if (s.status !== 'connecting' && digits.length >= 8) return true;
  if (s.status === 'connecting') {
    const ts = Date.parse(s.updated_at || s.created_at || '');
    if (Number.isFinite(ts) && Date.now() - ts < 3 * 60 * 1000) {
      return true;
    }
  }
  return false;
}

function getOccupiedGlobalSessionRecords(): Array<{
  session: WhatsAppSession;
  owner: UserAccount | null;
  isPaid: boolean;
}> {
  const db = initDbFile();
  const sessions = getWhatsAppSessions();
  const users = db.users || [];

  // Deduplicate by resolved owner (1 WA session slot per user max)
  const byOwnerOrSession = new Map<
    string,
    { session: WhatsAppSession; owner: UserAccount | null; isPaid: boolean }
  >();

  for (const s of sessions) {
    if (!isSessionOccupyingGlobalSlot(s)) continue;
    const ownerId = s.user_id || extractUserIdFromSessionId(s.id, users);
    const owner = ownerId ? getUserById(ownerId) : null;
    if (owner && (!owner.is_active || !owner.email_verified)) continue;

    const dedupKey = owner ? `owner:${owner.id}` : `sess:${s.id}`;
    const isPaid = owner ? isPaidActiveUser(owner) : false;

    const existing = byOwnerOrSession.get(dedupKey);
    if (!existing) {
      byOwnerOrSession.set(dedupKey, { session: s, owner, isPaid });
    } else if (s.status === 'connected' && existing.session.status !== 'connected') {
      byOwnerOrSession.set(dedupKey, { session: s, owner, isPaid });
    }
  }

  return Array.from(byOwnerOrSession.values());
}

export function getGlobalSlotStatus(sysConfig?: SystemConfig): GlobalSlotStatus {
  const maxGlobal = getMaxGlobalSessions(sysConfig);
  const occupied = getOccupiedGlobalSessionRecords();
  const totalOccupied = occupied.length;
  const paidOccupied = occupied.filter(item => item.isPaid).length;
  const freeOccupied = Math.max(0, totalOccupied - paidOccupied);
  const availableSlots = Math.max(0, maxGlobal - totalOccupied);
  const allSlotsFull = totalOccupied >= maxGlobal;
  const paidSlotsFull = paidOccupied >= maxGlobal;

  return {
    max_global_sessions: maxGlobal,
    total_occupied: totalOccupied,
    paid_occupied: paidOccupied,
    free_occupied: freeOccupied,
    available_slots: availableSlots,
    all_slots_full: allSlotsFull,
    paid_slots_full: paidSlotsFull,
    free_registrations_open: !allSlotsFull,
    paid_registrations_open: !paidSlotsFull
  };
}

export function selectFreeSessionToEvict(): {
  session: WhatsAppSession;
  owner: UserAccount | null;
  totalMessagesCount: number;
  accountCreatedAtMs: number;
} | null {
  const db = initDbFile();
  const occupied = getOccupiedGlobalSessionRecords();
  const freeCandidates = occupied.filter(item => !item.isPaid && Boolean(item.owner));
  if (freeCandidates.length === 0) return null;

  const ranked = freeCandidates.map(item => {
    const s = item.session;
    const owner = item.owner!;
    const sCount =
      typeof s.total_messages_count === 'number' && Number.isFinite(s.total_messages_count)
        ? s.total_messages_count
        : (db.messages || []).filter(m => m.session_id === s.id).length;
    const uCount =
      typeof owner.total_messages_count === 'number' && Number.isFinite(owner.total_messages_count)
        ? owner.total_messages_count
        : Math.max(
            Number(owner.monthly_messages_sent || 0),
            (db.messages || []).filter(m => m.user_id === owner.id).length
          );
    const totalMessagesCount = Math.max(0, sCount, uCount);
    const accountCreatedAtMs =
      Date.parse(owner.created_at || s.created_at || '') || Date.now();
    const sessionCreatedAtMs = Date.parse(s.created_at || '') || Date.now();

    return {
      session: s,
      owner,
      totalMessagesCount,
      accountCreatedAtMs,
      sessionCreatedAtMs
    };
  });

  // Priority:
  // 1) Never sent/received messages first (0 messages), then fewest total sent/received messages
  // 2) Oldest account/session in the application first
  ranked.sort((a, b) => {
    if (a.totalMessagesCount !== b.totalMessagesCount) {
      return a.totalMessagesCount - b.totalMessagesCount;
    }
    if (a.accountCreatedAtMs !== b.accountCreatedAtMs) {
      return a.accountCreatedAtMs - b.accountCreatedAtMs;
    }
    return a.sessionCreatedAtMs - b.sessionCreatedAtMs;
  });

  return ranked[0];
}

export function evaluateGlobalSlotAdmission(params: {
  user?: UserAccount | null;
  requestedPlanId?: string;
  action: 'register' | 'upgrade_or_approve' | 'connect_session';
  targetSessionId?: string;
}): {
  allowed: boolean;
  reusesExistingSlot?: boolean;
  evictSessionId?: string;
  evictOwnerId?: string;
  evictPhone?: string;
  code?: 'HIGH_SURGE_FULL' | 'PAID_SLOTS_FULL';
  message?: string;
  slotStatus: GlobalSlotStatus;
} {
  const slotStatus = getGlobalSlotStatus();
  const { user, requestedPlanId, action, targetSessionId } = params;

  // Check if user already holds an occupied session slot
  const userOccupiedSessions = user
    ? getSessionsByUserId(user.id).filter(s => isSessionOccupyingGlobalSlot(s))
    : [];
  const holdsSlot =
    userOccupiedSessions.length > 0 ||
    Boolean(targetSessionId && userOccupiedSessions.some(s => s.id === targetSessionId));

  if (holdsSlot) {
    // Reconnecting own slot OR upgrading own account (converting Free -> Paid slot) requires NO extra slot
    return {
      allowed: true,
      reusesExistingSlot: true,
      slotStatus
    };
  }

  const isPaidIntent = (() => {
    if (action === 'upgrade_or_approve') {
      const targetPlan = requestedPlanId || user?.requested_plan_id || user?.plan_id || 'free';
      return targetPlan !== 'free';
    }
    if (action === 'register') {
      const targetPlan = requestedPlanId || 'free';
      return targetPlan !== 'free';
    }
    // connect_session
    return isPaidActiveUser(user);
  })();

  if (!isPaidIntent) {
    if (slotStatus.all_slots_full) {
      return {
        allowed: false,
        code: 'HIGH_SURGE_FULL',
        message: 'Lonjakan aplikasi sedang tinggi, belum bisa buat sesi baru saat ini.',
        slotStatus
      };
    }
    return { allowed: true, slotStatus };
  }

  // Paid / Non-Free intent without existing slot:
  if (!slotStatus.all_slots_full) {
    return { allowed: true, slotStatus };
  }

  if (slotStatus.paid_slots_full) {
    const msg =
      action === 'upgrade_or_approve'
        ? 'Seluruh slot kapasitas aplikasi saat ini penuh diisi akun berbayar. Proses upgrade/approval paket ditahan sementara sampai ada slot kosong.'
        : 'Seluruh slot kapasitas aplikasi saat ini penuh diisi akun berbayar. Pendaftaran / penambahan sesi berbayar ditahan sementara.';
    return {
      allowed: false,
      code: 'PAID_SLOTS_FULL',
      message: msg,
      slotStatus
    };
  }

  // Only reserve eviction on actual connect_session (registration/upgrade check confirms at least 1 Free slot can be shifted when connecting)
  if (action === 'connect_session') {
    const candidate = selectFreeSessionToEvict();
    if (!candidate) {
      return {
        allowed: false,
        code: 'PAID_SLOTS_FULL',
        message: 'Seluruh slot kapasitas aplikasi saat ini penuh diisi akun berbayar.',
        slotStatus
      };
    }
    return {
      allowed: true,
      evictSessionId: candidate.session.id,
      evictOwnerId: candidate.owner?.id,
      evictPhone: candidate.session.phone_number,
      slotStatus
    };
  }

  return { allowed: true, slotStatus };
}

// ==========================================
// USER REGISTRATION & SUBSCRIPTION
// ==========================================
export function normalizePhoneForUniqueness(phone?: string): string {
  if (!phone) return '';
  let digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('0')) {
    digits = '62' + digits.slice(1);
  } else if (digits.startsWith('8')) {
    digits = '628' + digits.slice(1);
  }
  return digits;
}

export const normalizePhoneNumber = normalizePhoneForUniqueness;

export interface AccountAvailabilityResult {
  usernameAvailable: boolean;
  emailAvailable: boolean;
  phoneAvailable: boolean;
  usernameMessage?: string;
  emailMessage?: string;
  phoneMessage?: string;
  isAvailable: boolean;
}

export function checkAccountAvailability(params: {
  username?: string;
  email?: string;
  phone?: string;
  excludeUserId?: string;
}): AccountAvailabilityResult {
  const db = initDbFile();
  const excludeId = params.excludeUserId;
  const filteredUsers = excludeId ? db.users.filter(u => u.id !== excludeId) : db.users;

  let usernameAvailable = true;
  let usernameMessage: string | undefined = undefined;
  if (params.username !== undefined) {
    const cleanUser = params.username.toLowerCase().trim().replace(/\s+/g, '');
    if (!cleanUser) {
      usernameAvailable = false;
      usernameMessage = 'Username wajib diisi';
    } else if (cleanUser.length < 3) {
      usernameAvailable = false;
      usernameMessage = 'Username minimal 3 karakter';
    } else if (!/^[a-zA-Z0-9_.-]+$/.test(cleanUser)) {
      usernameAvailable = false;
      usernameMessage = 'Username hanya boleh huruf, angka, underscore, atau titik';
    } else {
      const match = filteredUsers.find(u => u.username.toLowerCase().trim() === cleanUser);
      if (match) {
        usernameAvailable = false;
        usernameMessage = 'Username sudah digunakan, silakan pilih yang lain';
      } else {
        usernameAvailable = true;
        usernameMessage = 'Username tersedia';
      }
    }
  }

  let emailAvailable = true;
  let emailMessage: string | undefined = undefined;
  if (params.email !== undefined) {
    const cleanEmail = params.email.toLowerCase().trim();
    if (!cleanEmail) {
      emailAvailable = false;
      emailMessage = 'Email wajib diisi';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      emailAvailable = false;
      emailMessage = 'Format email tidak valid';
    } else {
      const match = filteredUsers.find(u => u.email.toLowerCase().trim() === cleanEmail);
      if (match) {
        emailAvailable = false;
        emailMessage = 'Email sudah terdaftar pada akun lain';
      } else {
        emailAvailable = true;
        emailMessage = 'Email tersedia';
      }
    }
  }

  let phoneAvailable = true;
  let phoneMessage: string | undefined = undefined;
  if (params.phone !== undefined) {
    const cleanPhone = normalizePhoneForUniqueness(params.phone);
    if (!cleanPhone) {
      phoneAvailable = false;
      phoneMessage = 'Nomor WhatsApp wajib diisi';
    } else if (cleanPhone.length < 9) {
      phoneAvailable = false;
      phoneMessage = 'Nomor WhatsApp minimal 8 digit angka';
    } else {
      const match = filteredUsers.find(u => {
        if (!u.phone) return false;
        return normalizePhoneForUniqueness(u.phone) === cleanPhone;
      });
      if (match) {
        phoneAvailable = false;
        phoneMessage = 'Nomor WhatsApp sudah terdaftar pada akun lain';
      } else {
        phoneAvailable = true;
        phoneMessage = 'Nomor WhatsApp tersedia';
      }
    }
  }

  const isAvailable = usernameAvailable && emailAvailable && phoneAvailable;
  return {
    usernameAvailable,
    emailAvailable,
    phoneAvailable,
    usernameMessage,
    emailMessage,
    phoneMessage,
    isAvailable
  };
}

export function registerUser(data: {
  username: string;
  name: string;
  email: string;
  phone?: string;
  password?: string;
  plan_id?: string;
  payment_note?: string;
  payment_receipt_url?: string;
}): { user: UserAccount; otp: string } {
  const db = initDbFile();
  const cleanUsername = data.username.toLowerCase().trim().replace(/\s+/g, '');
  const cleanEmail = data.email.toLowerCase().trim();

  // Strict Unique & Duplicate Check
  const avail = checkAccountAvailability({
    username: cleanUsername,
    email: cleanEmail,
    phone: data.phone
  });

  if (!avail.usernameAvailable) {
    throw new Error(avail.usernameMessage || 'Username sudah digunakan, silakan pilih yang lain.');
  }
  if (!avail.emailAvailable) {
    throw new Error(avail.emailMessage || 'Email sudah terdaftar pada akun lain.');
  }
  if (data.phone && !avail.phoneAvailable) {
    throw new Error(avail.phoneMessage || 'Nomor WhatsApp sudah terdaftar pada akun lain.');
  }

  const selectedPlanId = data.plan_id || 'free';
  const plans = db.plans || DEFAULT_SUBSCRIPTION_PLANS;
  const planInfo = plans.find(p => p.id === selectedPlanId) || plans[0];
  const otp = generateOtpCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  if (!data.password || data.password.trim().length < 8) {
    throw new Error('Password wajib diisi minimal 8 karakter.');
  }

  // Account only requires Email OTP verification to immediately become active!
  const newUser: UserAccount = {
    id: `usr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    username: cleanUsername,
    name: data.name.trim(),
    role: 'user',
    email: cleanEmail,
    phone: data.phone ? normalizePhoneForUniqueness(data.phone) : '',
    password: hashPassword(data.password),
    is_active: false, // Becomes true immediately upon Email OTP verification
    email_verified: false,
    wa_verified: true, // WA verification not required for account activation
    verification_otp: otp,
    otp_expires_at: expiresAt,
    plan_id: selectedPlanId,
    plan_status: 'active',
    payment_note: data.payment_note || 'Menunggu Verifikasi Email OTP',
    payment_receipt_url: data.payment_receipt_url,
    max_sessions: 1,
    security_pin: undefined,
    pin_failed_attempts: 0,
    is_bot_locked: false,
    api_key: generateApiKey(`mgw_${cleanUsername.substring(0, 4)}_`),
    daily_messages_sent: 0,
    monthly_messages_sent: 0,
    total_messages_count: 0,
    auto_reply_enabled: false,
    ai_enabled: false,
    meta_ai_verified: false,
    meta_ai_verified_phones: [],
    default_cs_reply_enabled: false,
    default_cs_reply_text: 'Halo kak *{nama}*! Terima kasih telah menghubungi kami. Tim Customer Service kami akan segera membalas pesan Anda sesegera mungkin.',
    rules_initialized: true,
    session_version: 1,
    created_at: new Date().toISOString()
  };

  db.users.push(newUser);
  writeDbFile(db, true);
  asyncSyncUser(newUser);
  return { user: newUser, otp };
}

export function upgradeUserPlan(data: {
  userId: string;
  planId: string;
  receiptUrl?: string;
  paymentNote?: string;
  aiVerification?: {
    isValid: boolean;
    confidence: string;
    amountDetected?: number;
    transactionRef?: string;
    reason?: string;
    autoApproved?: boolean;
  };
}): UserAccount | null {
  const db = initDbFile();
  const user = db.users.find(u => u.id === data.userId);
  if (!user) return null;

  const plans = db.plans || DEFAULT_SUBSCRIPTION_PLANS;
  const planInfo = plans.find(p => p.id === data.planId) || plans[1];

  user.requested_plan_id = data.planId;
  user.payment_receipt_url = data.receiptUrl || user.payment_receipt_url;
  user.payment_note = data.paymentNote || `Upgrade ke ${planInfo.name}`;
  user.ai_verified = false;
  user.ai_verification_notes = data.aiVerification?.reason || 'Menunggu verifikasi manual Superadmin';
  user.ai_verified_at = new Date().toISOString();
  // Always fail-closed: paid plan activation requires explicit Superadmin review
  user.plan_status = 'pending_approval';

  writeDbFile(db, true);
  asyncSyncUser(user);
  return user;
}

export function approveUserSubscription(userId: string): UserAccount | null {
  const db = initDbFile();
  const user = db.users.find(u => u.id === userId);
  if (!user) return null;

  if (user.requested_plan_id) {
    user.plan_id = user.requested_plan_id;
  }
  user.plan_status = 'active';
  user.is_active = true;
  user.approved_at = new Date().toISOString();
  user.max_sessions = 1;

  writeDbFile(db, true);
  asyncSyncUser(user);
  return user;
}

export function rejectUserSubscription(userId: string): UserAccount | null {
  const db = initDbFile();
  const user = db.users.find(u => u.id === userId);
  if (!user) return null;

  user.plan_status = 'rejected';
  user.session_version = (Number(user.session_version) || 1) + 1;
  writeDbFile(db, true);
  asyncSyncUser(user);
  return user;
}

export function deleteUserAccount(userId: string): boolean {
  const db = initDbFile();
  const beforeCount = db.users.length;
  db.users = db.users.filter(u => u.id !== userId);
  if (db.users.length !== beforeCount) {
    // Cascade delete user's auto-reply rules and WhatsApp sessions
    const removedRules = (db.rules || []).filter(r => r.user_id === userId);
    db.rules = (db.rules || []).filter(r => r.user_id !== userId);
    for (const r of removedRules) {
      asyncDeleteRule(r.id);
    }

    const removedSessions = (db.sessions || []).filter(
      s => s.user_id === userId || isSessionOwnedByUserId(s.id, userId)
    );
    db.sessions = (db.sessions || []).filter(
      s => s.user_id !== userId && !isSessionOwnedByUserId(s.id, userId)
    );
    for (const s of removedSessions) {
      asyncDeleteSession(s.id, s.phone_number);
    }

    writeDbFile(db, true);
    asyncDeleteUser(userId);
    return true;
  }
  return false;
}

export function verifyUserOtp(userId: string, otp: string, _type: 'email' | 'whatsapp' = 'email'): boolean {
  const db = initDbFile();
  const user = db.users.find(u => u.id === userId);
  if (!user || !user.verification_otp || !otp) return false;

  // Enforce OTP expiration
  if (user.otp_expires_at && Date.parse(user.otp_expires_at) < Date.now()) {
    user.verification_otp = undefined;
    user.otp_expires_at = undefined;
    (user as any).otp_failed_attempts = 0;
    writeDbFile(db, true);
    asyncSyncUser(user);
    return false;
  }

  const attempts = Number((user as any).otp_failed_attempts || 0);
  if (attempts >= 5) {
    user.verification_otp = undefined;
    user.otp_expires_at = undefined;
    writeDbFile(db, true);
    asyncSyncUser(user);
    return false;
  }

  if (safeEqual(String(user.verification_otp).trim(), otp.trim())) {
    user.email_verified = true;
    user.wa_verified = true;
    user.is_active = true;
    user.plan_status = 'active';
    user.approved_at = user.approved_at || new Date().toISOString();
    user.payment_note = 'Aktif (Email Terverifikasi)';
    user.verification_otp = undefined;
    user.otp_expires_at = undefined;
    (user as any).otp_failed_attempts = 0;
    writeDbFile(db, true);
    asyncSyncUser(user);
    return true;
  }

  (user as any).otp_failed_attempts = attempts + 1;
  if ((user as any).otp_failed_attempts >= 5) {
    user.verification_otp = undefined;
    user.otp_expires_at = undefined;
  }
  writeDbFile(db, true);
  asyncSyncUser(user);
  return false;
}

export function resetPasswordWithOtp(identifier: string, otp: string, newPass: string): boolean {
  const db = initDbFile();
  if (!identifier || !otp || !newPass || newPass.length < 8) return false;
  const clean = identifier.toLowerCase().trim();
  const cleanDigits = normalizePhoneForUniqueness(identifier);

  const user = db.users.find(u => {
    if (u.id === identifier.trim()) return true;
    if (u.username.toLowerCase() === clean) return true;
    if (u.email.toLowerCase() === clean) return true;
    if (cleanDigits.length >= 9 && u.phone) {
      const uNorm = normalizePhoneForUniqueness(u.phone);
      if (uNorm && uNorm === cleanDigits) return true;
    }
    return false;
  });

  if (!user || !user.verification_otp) return false;

  if (user.otp_expires_at && Date.parse(user.otp_expires_at) < Date.now()) {
    user.verification_otp = undefined;
    user.otp_expires_at = undefined;
    writeDbFile(db, true);
    asyncSyncUser(user);
    return false;
  }

  const attempts = Number((user as any).otp_failed_attempts || 0);
  if (attempts >= 5) {
    user.verification_otp = undefined;
    user.otp_expires_at = undefined;
    writeDbFile(db, true);
    asyncSyncUser(user);
    return false;
  }

  if (safeEqual(String(user.verification_otp).trim(), otp.trim())) {
    user.password = hashPassword(newPass);
    user.verification_otp = undefined;
    user.otp_expires_at = undefined;
    (user as any).otp_failed_attempts = 0;
    user.session_version = (Number(user.session_version) || 1) + 1;
    writeDbFile(db, true);
    asyncSyncUser(user);
    return true;
  }

  (user as any).otp_failed_attempts = attempts + 1;
  if ((user as any).otp_failed_attempts >= 5) {
    user.verification_otp = undefined;
    user.otp_expires_at = undefined;
  }
  writeDbFile(db, true);
  asyncSyncUser(user);
  return false;
}

// SQL Export
export function exportCurrentDataToSql(): string {
  const db = initDbFile();
  let sql = `-- =============================================================\n`;
  sql += `-- SQL MIGRATION EXPORT FOR MYSQL / POSTGRESQL (${new Date().toISOString()})\n`;
  sql += `-- Generated by Japriin Pro (Japriin.com)\n`;
  sql += `-- =============================================================\n\n`;

  sql += `CREATE TABLE IF NOT EXISTS whatsapp_messages (\n`;
  sql += `    id VARCHAR(64) PRIMARY KEY,\n`;
  sql += `    wam_id VARCHAR(128),\n`;
  sql += `    sender_phone VARCHAR(32) NOT NULL,\n`;
  sql += `    sender_name VARCHAR(128) NOT NULL,\n`;
  sql += `    message_body TEXT NOT NULL,\n`;
  sql += `    direction VARCHAR(16) DEFAULT 'incoming',\n`;
  sql += `    status VARCHAR(32) NOT NULL,\n`;
  sql += `    reply_body TEXT,\n`;
  sql += `    error_detail TEXT,\n`;
  sql += `    ai_generated BOOLEAN DEFAULT FALSE,\n`;
  sql += `    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n`;
  sql += `);\n\n`;

  sql += `CREATE TABLE IF NOT EXISTS auto_reply_rules (\n`;
  sql += `    id VARCHAR(64) PRIMARY KEY,\n`;
  sql += `    keyword VARCHAR(128) NOT NULL,\n`;
  sql += `    match_type VARCHAR(32) NOT NULL DEFAULT 'contains',\n`;
  sql += `    response_text TEXT NOT NULL,\n`;
  sql += `    is_active BOOLEAN DEFAULT TRUE,\n`;
  sql += `    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n`;
  sql += `    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n`;
  sql += `);\n\n`;

  sql += `CREATE TABLE IF NOT EXISTS whatsapp_sessions (\n`;
  sql += `    id VARCHAR(64) PRIMARY KEY,\n`;
  sql += `    session_name VARCHAR(128) NOT NULL,\n`;
  sql += `    phone_number VARCHAR(32) NOT NULL,\n`;
  sql += `    auth_method VARCHAR(32) NOT NULL,\n`;
  sql += `    status VARCHAR(32) NOT NULL DEFAULT 'connected',\n`;
  sql += `    phone_number_id VARCHAR(64),\n`;
  sql += `    access_token TEXT,\n`;
  sql += `    is_primary BOOLEAN DEFAULT TRUE,\n`;
  sql += `    connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n`;
  sql += `);\n\n`;

  return sql;
}

// ==========================================
// COMPATIBILITY EXPORT ALIASES
// ==========================================
export const getRules = getAutoReplyRules;
export const addRule = addAutoReplyRule;
export const toggleRule = toggleAutoReplyRule;
export const deleteRule = deleteAutoReplyRule;

export const getSessions = getWhatsAppSessions;
export const addSession = addWhatsAppSession;
export const updateSession = updateWhatsAppSession;
export const deleteSession = deleteWhatsAppSession;
export const setPrimarySession = (id: string): boolean => {
  const db = initDbFile();
  const target = db.sessions.find(s => s.id === id);
  if (!target) return false;
  const targetOwnerId = target.user_id;
  db.sessions.forEach(s => {
    if (!targetOwnerId || s.user_id === targetOwnerId) {
      s.is_primary = s.id === id;
      asyncSyncSession(s);
    }
  });
  writeDbFile(db);
  return true;
};
export const getActiveSession = (): WhatsAppSession | null => {
  const db = initDbFile();
  return db.sessions.find(s => s.is_primary) || db.sessions[0] || null;
};

export const getMessages = getMessageLogs;
export const clearMessages = clearMessageLogs;

export const addUser = (data: any): UserAccount => {
  const res = registerUser(data);
  return res.user;
};

export const updateUser = (id: string, updates: Partial<UserAccount>): UserAccount | null => {
  const db = initDbFile();
  const idx = db.users.findIndex(u => u.id === id);
  if (idx === -1) return null;
  db.users[idx] = { ...db.users[idx], ...updates };
  writeDbFile(db);
  asyncSyncUser(db.users[idx]);
  return db.users[idx];
};

export const isPhoneMetaAiVerifiedForUser = (
  user: Pick<UserAccount, 'meta_ai_verified' | 'meta_ai_verified_phone' | 'meta_ai_verified_phones'> | null | undefined,
  phone?: string | null
): boolean => {
  if (!user) return false;
  const cleanPhone = phone ? normalizePhoneForUniqueness(phone) : '';
  const list = Array.isArray(user.meta_ai_verified_phones)
    ? user.meta_ai_verified_phones.map(p => normalizePhoneForUniqueness(p)).filter(Boolean)
    : [];
  if (cleanPhone) {
    if (list.includes(cleanPhone)) return true;
    if (user.meta_ai_verified && user.meta_ai_verified_phone) {
      return normalizePhoneForUniqueness(user.meta_ai_verified_phone) === cleanPhone;
    }
    return false;
  }
  return Boolean(user.meta_ai_verified && (list.length > 0 || user.meta_ai_verified_phone));
};

export const markUserMetaAiVerified = (userId: string, phoneNumber: string): UserAccount | null => {
  const db = initDbFile();
  const idx = db.users.findIndex(u => u.id === userId);
  if (idx === -1) return null;

  const cleanPhone = normalizePhoneForUniqueness(phoneNumber || '');
  const current = db.users[idx];
  const existingList = Array.isArray(current.meta_ai_verified_phones)
    ? current.meta_ai_verified_phones.map(p => normalizePhoneForUniqueness(p)).filter(Boolean)
    : [];
  if (cleanPhone && !existingList.includes(cleanPhone)) {
    existingList.push(cleanPhone);
  }
  const cappedList = existingList.slice(-20);
  const nowIso = new Date().toISOString();

  db.users[idx] = {
    ...current,
    meta_ai_verified: true,
    meta_ai_verified_phone: cleanPhone || current.meta_ai_verified_phone || '',
    meta_ai_verified_phones: cappedList,
    meta_ai_verified_at: nowIso
  };
  writeDbFile(db);
  asyncSyncUser(db.users[idx]);
  return db.users[idx];
};

export const resolveEffectiveSessionAiSettings = (params: {
  user: UserAccount | null | undefined;
  session?: WhatsAppSession | null;
  sysConfig: SystemConfig;
}): {
  aiEnabled: boolean;
  aiSource: 'session_override' | 'account_default';
  systemPrompt: string | undefined;
  promptSource: 'session_override' | 'account_default' | 'system_default';
} => {
  const { user, session, sysConfig } = params;

  const autoReplyStatus = user ? getUserAutoReplyStatus(user, sysConfig) : null;
  const masterAutoReplyAllowed = autoReplyStatus ? autoReplyStatus.allowed : true;

  const accountAiEnabled = user
    ? (user.role === 'admin'
        ? Boolean(masterAutoReplyAllowed && sysConfig.ai_config?.enabled && sysConfig.ai_config?.fallback_when_no_rule)
        : Boolean(masterAutoReplyAllowed && user.ai_enabled === true))
    : Boolean(sysConfig.ai_config?.enabled && sysConfig.ai_config?.fallback_when_no_rule);

  const hasSessionAiOverride = typeof session?.ai_enabled === 'boolean';
  const aiEnabled = masterAutoReplyAllowed
    ? (hasSessionAiOverride ? Boolean(session!.ai_enabled) : accountAiEnabled)
    : false;
  const aiSource: 'session_override' | 'account_default' = hasSessionAiOverride
    ? 'session_override'
    : 'account_default';

  const sessionPrompt = typeof session?.custom_system_prompt === 'string' ? session.custom_system_prompt.trim() : '';
  const userPrompt = typeof user?.custom_system_prompt === 'string' ? user.custom_system_prompt.trim() : '';
  const sysPrompt = typeof sysConfig.ai_config?.system_prompt === 'string' ? sysConfig.ai_config.system_prompt.trim() : '';

  if (sessionPrompt) {
    return {
      aiEnabled,
      aiSource,
      systemPrompt: sessionPrompt,
      promptSource: 'session_override'
    };
  }

  if (userPrompt) {
    return {
      aiEnabled,
      aiSource,
      systemPrompt: userPrompt,
      promptSource: 'account_default'
    };
  }

  return {
    aiEnabled,
    aiSource,
    systemPrompt: sysPrompt || undefined,
    promptSource: 'system_default'
  };
};

export const getUserByUsernameOrEmail = (identifier: string): UserAccount | null => {
  const db = initDbFile();
  const clean = identifier.toLowerCase().trim();
  return db.users.find(u => u.username.toLowerCase() === clean || u.email.toLowerCase() === clean) || null;
};

export const getAntiBanSettings = (): AntiBanSettings => {
  const db = initDbFile();
  return db.antiBan || DEFAULT_ANTIBAN;
};

export const updateAntiBanSettings = (updates: Partial<AntiBanSettings>): AntiBanSettings => {
  const db = initDbFile();
  db.antiBan = { ...db.antiBan, ...updates };
  writeDbFile(db);
  asyncSyncKv('antiBan', db.antiBan);
  return db.antiBan;
};

export const getSmtpAccounts = (): SmtpAccount[] => {
  const db = initDbFile();
  if (!Array.isArray(db.smtpAccounts)) db.smtpAccounts = [];
  return db.smtpAccounts;
};

export const getActiveSmtpAccounts = (): SmtpAccount[] => {
  const db = initDbFile();
  if (!Array.isArray(db.smtpAccounts)) db.smtpAccounts = [];
  return db.smtpAccounts.filter(s => s.is_active);
};

export const addSmtpAccount = (data: any): SmtpAccount => {
  const db = initDbFile();
  if (!Array.isArray(db.smtpAccounts)) db.smtpAccounts = [];

  const rawPass = String(data.pass || '').trim();
  const host = String(data.host || 'smtp.gmail.com').trim();
  const port = Number(data.port) || 587;
  const secure = port === 465 ? true : (port === 587 ? false : Boolean(data.secure));
  const wl = getWhitelabelConfig();

  const newAcc: SmtpAccount = {
    id: `smtp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    name: String(data.name || `SMTP (${String(data.user || '').split('@')[0]})`).trim(),
    host,
    port,
    secure,
    user: String(data.user || '').trim(),
    pass: rawPass.startsWith('gcm:') ? rawPass : encryptData(rawPass),
    sender_name: String(data.sender_name || wl.app_name || 'Japriin').trim(),
    is_active: data.is_active !== undefined ? Boolean(data.is_active) : true,
    success_count: 0,
    error_count: 0,
    created_at: new Date().toISOString()
  };
  db.smtpAccounts.push(newAcc);
  writeDbFile(db, true);
  asyncSyncSmtp(newAcc);
  return newAcc;
};

export const updateSmtpAccount = (id: string, updates: any): SmtpAccount | null => {
  const db = initDbFile();
  if (!Array.isArray(db.smtpAccounts)) db.smtpAccounts = [];
  const idx = db.smtpAccounts.findIndex(s => s.id === id);
  if (idx === -1) return null;

  const cleanUpdates = { ...updates };
  if (cleanUpdates.pass && typeof cleanUpdates.pass === 'string') {
    const trimmedPass = cleanUpdates.pass.trim();
    cleanUpdates.pass = trimmedPass.startsWith('gcm:') ? trimmedPass : encryptData(trimmedPass);
    cleanUpdates.last_error = '';
  }
  if (cleanUpdates.port !== undefined) {
    cleanUpdates.port = Number(cleanUpdates.port) || 587;
    if (cleanUpdates.port === 465) cleanUpdates.secure = true;
    else if (cleanUpdates.port === 587) cleanUpdates.secure = false;
  }

  db.smtpAccounts[idx] = { ...db.smtpAccounts[idx], ...cleanUpdates };
  writeDbFile(db, true);
  asyncSyncSmtp(db.smtpAccounts[idx]);
  return db.smtpAccounts[idx];
};

export const toggleSmtpAccount = (id: string): SmtpAccount | null => {
  const db = initDbFile();
  if (!Array.isArray(db.smtpAccounts)) db.smtpAccounts = [];
  const idx = db.smtpAccounts.findIndex(s => s.id === id);
  if (idx === -1) return null;
  db.smtpAccounts[idx].is_active = !db.smtpAccounts[idx].is_active;
  writeDbFile(db, true);
  asyncSyncSmtp(db.smtpAccounts[idx]);
  return db.smtpAccounts[idx];
};

export const deleteSmtpAccount = (id: string): boolean => {
  const db = initDbFile();
  if (!Array.isArray(db.smtpAccounts)) db.smtpAccounts = [];
  const before = db.smtpAccounts.length;
  db.smtpAccounts = db.smtpAccounts.filter(s => s.id !== id);
  if (db.smtpAccounts.length !== before) {
    markMutated();
    writeDbFile(db, true);
    import('./mysqlService.js').then(m => m.deleteSmtpAccountFromMysql(id)).catch(() => {});
    return true;
  }
  return false;
};

export const addSmtpAccountAndSync = async (
  data: any
): Promise<{ ok: boolean; data?: SmtpAccount; error?: string }> => {
  const db = initDbFile();
  if (!Array.isArray(db.smtpAccounts)) db.smtpAccounts = [];
  const snapshot = db.smtpAccounts.map(s => ({ ...s }));

  const rawPass = String(data.pass || '').trim();
  const host = String(data.host || 'smtp.gmail.com').trim();
  const port = Number(data.port) || 587;
  const secure = port === 465 ? true : port === 587 ? false : Boolean(data.secure);
  const wl = getWhitelabelConfig();

  const newAcc: SmtpAccount = {
    id: `smtp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    name: String(data.name || `SMTP (${String(data.user || '').split('@')[0]})`).trim(),
    host,
    port,
    secure,
    user: String(data.user || '').trim(),
    pass: rawPass.startsWith('gcm:') ? rawPass : encryptData(rawPass),
    sender_name: String(data.sender_name || wl.app_name || 'Japriin').trim(),
    is_active: data.is_active !== undefined ? Boolean(data.is_active) : true,
    success_count: 0,
    error_count: 0,
    created_at: new Date().toISOString()
  };

  markMutated();
  db.smtpAccounts.push(newAcc);

  try {
    const m = await import('./mysqlService.js');
    const res = await m.pushSmtpAccountToMysql(newAcc);
    if (!res.ok) {
      db.smtpAccounts = snapshot;
      writeDbFile(db, true);
      return { ok: false, error: res.error || 'Gagal menyimpan akun SMTP ke database MySQL.' };
    }
  } catch {
    // Non-fatal fallback if mysql module unavailable
  }

  markMutated();
  writeDbFile(db, true);
  return { ok: true, data: newAcc };
};

export const updateSmtpAccountAndSync = async (
  id: string,
  updates: any
): Promise<{ ok: boolean; notFound?: boolean; data?: SmtpAccount; error?: string }> => {
  const db = initDbFile();
  if (!Array.isArray(db.smtpAccounts)) db.smtpAccounts = [];
  const idx = db.smtpAccounts.findIndex(s => s.id === id);
  if (idx === -1) return { ok: false, notFound: true, error: 'Akun SMTP tidak ditemukan.' };

  const snapshot = db.smtpAccounts.map(s => ({ ...s }));
  const cleanUpdates = { ...updates };
  if (cleanUpdates.pass && typeof cleanUpdates.pass === 'string') {
    const trimmedPass = cleanUpdates.pass.trim();
    cleanUpdates.pass = trimmedPass.startsWith('gcm:') ? trimmedPass : encryptData(trimmedPass);
    cleanUpdates.last_error = '';
  }
  if (cleanUpdates.port !== undefined) {
    cleanUpdates.port = Number(cleanUpdates.port) || 587;
    if (cleanUpdates.port === 465) cleanUpdates.secure = true;
    else if (cleanUpdates.port === 587) cleanUpdates.secure = false;
  }

  markMutated();
  db.smtpAccounts[idx] = { ...db.smtpAccounts[idx], ...cleanUpdates };
  const updatedAcc = db.smtpAccounts[idx];

  try {
    const m = await import('./mysqlService.js');
    const res = await m.pushSmtpAccountToMysql(updatedAcc);
    if (!res.ok) {
      db.smtpAccounts = snapshot;
      writeDbFile(db, true);
      return { ok: false, error: res.error || 'Gagal memperbarui akun SMTP di database MySQL.' };
    }
  } catch {
    // Non-fatal fallback
  }

  markMutated();
  writeDbFile(db, true);
  return { ok: true, data: updatedAcc };
};

export const toggleSmtpAccountAndSync = async (
  id: string
): Promise<{ ok: boolean; notFound?: boolean; data?: SmtpAccount; error?: string }> => {
  const db = initDbFile();
  if (!Array.isArray(db.smtpAccounts)) db.smtpAccounts = [];
  const idx = db.smtpAccounts.findIndex(s => s.id === id);
  if (idx === -1) return { ok: false, notFound: true, error: 'Akun SMTP tidak ditemukan.' };

  const snapshot = db.smtpAccounts.map(s => ({ ...s }));
  markMutated();
  db.smtpAccounts[idx] = { ...db.smtpAccounts[idx], is_active: !db.smtpAccounts[idx].is_active };
  const toggledAcc = db.smtpAccounts[idx];

  try {
    const m = await import('./mysqlService.js');
    const res = await m.pushSmtpAccountToMysql(toggledAcc);
    if (!res.ok) {
      db.smtpAccounts = snapshot;
      writeDbFile(db, true);
      return { ok: false, error: res.error || 'Gagal mengubah status akun SMTP di database MySQL.' };
    }
  } catch {
    // Non-fatal fallback
  }

  markMutated();
  writeDbFile(db, true);
  return { ok: true, data: toggledAcc };
};

export const deleteSmtpAccountAndSync = async (
  id: string
): Promise<{ ok: boolean; notFound?: boolean; error?: string }> => {
  const db = initDbFile();
  if (!Array.isArray(db.smtpAccounts)) db.smtpAccounts = [];
  const exists = db.smtpAccounts.some(s => s.id === id);
  if (!exists) return { ok: false, notFound: true, error: 'Akun SMTP tidak ditemukan.' };

  const snapshot = db.smtpAccounts.map(s => ({ ...s }));
  markMutated();
  db.smtpAccounts = db.smtpAccounts.filter(s => s.id !== id);

  try {
    const m = await import('./mysqlService.js');
    const res = await m.deleteSmtpAccountFromMysql(id);
    if (!res.ok) {
      db.smtpAccounts = snapshot;
      writeDbFile(db, true);
      return { ok: false, error: res.error || 'Gagal menghapus akun SMTP dari database MySQL.' };
    }
  } catch {
    // Non-fatal fallback
  }

  markMutated();
  writeDbFile(db, true);
  return { ok: true };
};

export const updateSmtpStats = (id: string, success: boolean, errMsg?: string): void => {
  const db = initDbFile();
  if (!Array.isArray(db.smtpAccounts)) db.smtpAccounts = [];
  const idx = db.smtpAccounts.findIndex(s => s.id === id);
  if (idx === -1) return;
  const acc = db.smtpAccounts[idx];
  if (success) {
    acc.success_count = (acc.success_count || 0) + 1;
    acc.last_error = undefined;
  } else {
    acc.error_count = (acc.error_count || 0) + 1;
    if (errMsg) acc.last_error = errMsg;
  }
  acc.last_used_at = new Date().toISOString();
  writeDbFile(db);
  asyncSyncSmtp(acc);
};

// =============================================================
// MULTI-TENANT MINI SHOP / PRODUCT CATALOG & PUBLIC URL HELPERS
// =============================================================

let runtimePublicBaseUrl = '';

function isUsablePublicBaseUrl(raw?: string): boolean {
  if (!raw || typeof raw !== 'string') return false;
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed || trimmed === 'MY_APP_URL') return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function isLoopbackBaseUrl(raw: string): boolean {
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}

export function setRuntimePublicBaseUrl(candidateUrl: string): void {
  if (!isUsablePublicBaseUrl(candidateUrl)) return;
  const clean = candidateUrl.trim().replace(/\/+$/, '');
  if (isLoopbackBaseUrl(clean) && runtimePublicBaseUrl && !isLoopbackBaseUrl(runtimePublicBaseUrl)) {
    return;
  }
  runtimePublicBaseUrl = clean;
}

export function resolvePublicAppBaseUrl(fallbackOrigin?: string): string {
  const envUrl = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (isUsablePublicBaseUrl(envUrl) && !isLoopbackBaseUrl(envUrl)) {
    return envUrl;
  }

  const sysUrl = (getSystemConfig().app_url || '').trim().replace(/\/+$/, '');
  if (isUsablePublicBaseUrl(sysUrl) && !isLoopbackBaseUrl(sysUrl)) {
    return sysUrl;
  }

  if (isUsablePublicBaseUrl(runtimePublicBaseUrl) && !isLoopbackBaseUrl(runtimePublicBaseUrl)) {
    return runtimePublicBaseUrl;
  }

  if (fallbackOrigin && isUsablePublicBaseUrl(fallbackOrigin)) {
    return fallbackOrigin.trim().replace(/\/+$/, '');
  }

  if (isUsablePublicBaseUrl(envUrl)) return envUrl;
  if (isUsablePublicBaseUrl(runtimePublicBaseUrl)) return runtimePublicBaseUrl;
  if (isUsablePublicBaseUrl(sysUrl)) return sysUrl;
  return '';
}

export function resolveProductImagePublicUrl(imageUrl?: string, fallbackOrigin?: string): string | undefined {
  const clean = String(imageUrl || '').trim();
  if (!clean) return undefined;
  if (/^https?:\/\//i.test(clean)) return clean;
  if (clean.startsWith('/')) {
    const base = resolvePublicAppBaseUrl(fallbackOrigin);
    return base ? `${base}${clean}` : clean;
  }
  return undefined;
}

const MAX_PRODUCTS_PER_USER = 100;

function resolveCanonicalCatalogUserId(userId: string): string {
  const clean = String(userId || '').trim();
  if (!clean) return '';
  return getUserById(clean)?.id || clean;
}

function sanitizeCatalogBankAccounts(rawAccounts: unknown): CatalogPaymentAccount[] {
  if (!Array.isArray(rawAccounts)) return [];
  const cleaned: CatalogPaymentAccount[] = [];
  for (const item of rawAccounts.slice(0, 10)) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const bankName = String(raw.bank_name || '').trim().slice(0, 50);
    const accNumber = String(raw.account_number || '').trim().slice(0, 50);
    const accHolder = String(raw.account_holder || '').trim().slice(0, 80);
    if (!bankName && !accNumber) continue;
    cleaned.push({
      id: typeof raw.id === 'string' && raw.id.trim()
        ? raw.id.trim().slice(0, 48)
        : `bank_${crypto.randomBytes(4).toString('hex')}`,
      bank_name: bankName || 'Bank / E-Wallet',
      account_number: accNumber,
      account_holder: accHolder
    });
  }
  return cleaned;
}

function sanitizeOrderNotifyPhone(rawPhone: unknown): string {
  const clean = normalizePhoneForUniqueness(String(rawPhone || '').trim());
  if (!clean || clean.length < 8) return '';
  return clean.slice(0, 16);
}

export function getCatalogForUser(userId: string): {
  settings: CatalogSettings;
  products: CatalogProduct[];
} {
  const db = initDbFile();
  const canonicalId = resolveCanonicalCatalogUserId(userId);
  if (!Array.isArray(db.catalogProducts)) db.catalogProducts = [];
  if (!db.catalogSettings || typeof db.catalogSettings !== 'object') db.catalogSettings = {};

  const existingSettings = db.catalogSettings[canonicalId] || db.catalogSettings[userId];
  const settings: CatalogSettings = existingSettings
    ? {
        user_id: canonicalId,
        enabled: Boolean(existingSettings.enabled),
        shop_name: existingSettings.shop_name || '',
        order_notify_phone: sanitizeOrderNotifyPhone(existingSettings.order_notify_phone),
        bank_accounts: sanitizeCatalogBankAccounts(existingSettings.bank_accounts),
        payment_notes: typeof existingSettings.payment_notes === 'string' ? existingSettings.payment_notes.slice(0, 1000) : '',
        qris_image_url: typeof existingSettings.qris_image_url === 'string' ? existingSettings.qris_image_url.trim().slice(0, 512) : '',
        updated_at: existingSettings.updated_at || new Date().toISOString()
      }
    : {
        user_id: canonicalId,
        enabled: false,
        shop_name: '',
        order_notify_phone: '',
        bank_accounts: [],
        payment_notes: '',
        qris_image_url: '',
        updated_at: new Date().toISOString()
      };

  const products = db.catalogProducts
    .filter(p => p.user_id === canonicalId || p.user_id === userId)
    .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime());

  return { settings, products };
}

export function updateCatalogSettings(
  userId: string,
  updates: {
    enabled?: boolean;
    shop_name?: string;
    order_notify_phone?: string | null;
    bank_accounts?: CatalogPaymentAccount[];
    payment_notes?: string;
    qris_image_url?: string | null;
  }
): CatalogSettings {
  const db = initDbFile();
  const canonicalId = resolveCanonicalCatalogUserId(userId);
  if (!db.catalogSettings || typeof db.catalogSettings !== 'object') db.catalogSettings = {};

  const prev = db.catalogSettings[canonicalId] || db.catalogSettings[userId] || {
    user_id: canonicalId,
    enabled: false,
    shop_name: '',
    order_notify_phone: '',
    bank_accounts: [],
    payment_notes: '',
    qris_image_url: '',
    updated_at: new Date().toISOString()
  };

  const next: CatalogSettings = {
    user_id: canonicalId,
    enabled: updates.enabled !== undefined ? Boolean(updates.enabled) : Boolean(prev.enabled),
    shop_name: updates.shop_name !== undefined ? String(updates.shop_name).trim().slice(0, 80) : (prev.shop_name || ''),
    order_notify_phone: updates.order_notify_phone !== undefined
      ? sanitizeOrderNotifyPhone(updates.order_notify_phone)
      : sanitizeOrderNotifyPhone(prev.order_notify_phone),
    bank_accounts: updates.bank_accounts !== undefined
      ? sanitizeCatalogBankAccounts(updates.bank_accounts)
      : sanitizeCatalogBankAccounts(prev.bank_accounts),
    payment_notes: updates.payment_notes !== undefined
      ? String(updates.payment_notes).trim().slice(0, 1000)
      : (prev.payment_notes || ''),
    qris_image_url: updates.qris_image_url !== undefined
      ? (updates.qris_image_url ? String(updates.qris_image_url).trim().slice(0, 512) : '')
      : (prev.qris_image_url || ''),
    updated_at: new Date().toISOString()
  };

  db.catalogSettings[canonicalId] = next;
  writeDbFile(db, true);
  asyncSyncKv('catalogSettings', db.catalogSettings);
  return next;
}

export function addCatalogProduct(
  userId: string,
  data: {
    title: string;
    description: string;
    price: number;
    image_url?: string;
    is_active?: boolean;
  }
): CatalogProduct {
  const db = initDbFile();
  const canonicalId = resolveCanonicalCatalogUserId(userId);
  if (!Array.isArray(db.catalogProducts)) db.catalogProducts = [];

  const userCount = db.catalogProducts.filter(p => p.user_id === canonicalId || p.user_id === userId).length;
  if (userCount >= MAX_PRODUCTS_PER_USER) {
    throw new Error(`Maksimal ${MAX_PRODUCTS_PER_USER} produk per akun.`);
  }

  const now = new Date().toISOString();
  const product: CatalogProduct = {
    id: `prod_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    user_id: canonicalId,
    title: String(data.title || '').trim().slice(0, 120),
    description: String(data.description || '').trim().slice(0, 600),
    price: Math.max(0, Math.round(Number(data.price) || 0)),
    image_url: data.image_url ? String(data.image_url).trim().slice(0, 512) : undefined,
    is_active: data.is_active !== undefined ? Boolean(data.is_active) : true,
    created_at: now,
    updated_at: now
  };

  db.catalogProducts.unshift(product);
  writeDbFile(db, true);
  asyncSyncKv('catalogProducts', db.catalogProducts);
  return product;
}

export function updateCatalogProduct(
  id: string,
  userId: string,
  updates: {
    title?: string;
    description?: string;
    price?: number;
    image_url?: string | null;
    is_active?: boolean;
  }
): { product: CatalogProduct; previousImageUrl?: string } | null {
  const db = initDbFile();
  const canonicalId = resolveCanonicalCatalogUserId(userId);
  if (!Array.isArray(db.catalogProducts)) db.catalogProducts = [];

  const idx = db.catalogProducts.findIndex(p => p.id === id && (p.user_id === canonicalId || p.user_id === userId));
  if (idx === -1) return null;

  const current = db.catalogProducts[idx];
  const previousImageUrl = current.image_url;

  const updated: CatalogProduct = {
    ...current,
    ...(updates.title !== undefined ? { title: String(updates.title).trim().slice(0, 120) } : {}),
    ...(updates.description !== undefined ? { description: String(updates.description).trim().slice(0, 600) } : {}),
    ...(updates.price !== undefined ? { price: Math.max(0, Math.round(Number(updates.price) || 0)) } : {}),
    ...(updates.image_url !== undefined
      ? { image_url: updates.image_url ? String(updates.image_url).trim().slice(0, 512) : undefined }
      : {}),
    ...(updates.is_active !== undefined ? { is_active: Boolean(updates.is_active) } : {}),
    updated_at: new Date().toISOString()
  };

  db.catalogProducts[idx] = updated;
  writeDbFile(db, true);
  asyncSyncKv('catalogProducts', db.catalogProducts);
  return { product: updated, previousImageUrl };
}

export function deleteCatalogProduct(id: string, userId: string): CatalogProduct | null {
  const db = initDbFile();
  const canonicalId = resolveCanonicalCatalogUserId(userId);
  if (!Array.isArray(db.catalogProducts)) db.catalogProducts = [];

  const target = db.catalogProducts.find(p => p.id === id && (p.user_id === canonicalId || p.user_id === userId));
  if (!target) return null;

  db.catalogProducts = db.catalogProducts.filter(p => !(p.id === id && (p.user_id === canonicalId || p.user_id === userId)));
  writeDbFile(db, true);
  asyncSyncKv('catalogProducts', db.catalogProducts);
  return target;
}

export function isLocalCatalogImageReferenced(filename: string): boolean {
  const db = initDbFile();
  const expectedPath = `/api/catalog/images/${filename}`;
  const usedInProducts =
    Array.isArray(db.catalogProducts) && db.catalogProducts.some(p => p.image_url === expectedPath);
  if (usedInProducts) return true;
  if (db.catalogSettings && typeof db.catalogSettings === 'object') {
    return Object.values(db.catalogSettings).some(s => s?.qris_image_url === expectedPath);
  }
  return false;
}

export function resolveOrderNotificationRecipientPhone(userId?: string): string {
  if (!userId) return '';
  const canonicalId = resolveCanonicalCatalogUserId(userId);
  const { settings } = getCatalogForUser(canonicalId);
  const customNotifyPhone = sanitizeOrderNotifyPhone(settings.order_notify_phone);
  if (customNotifyPhone) {
    return customNotifyPhone;
  }

  const owner = getUserById(canonicalId) || getUserById(userId);
  const userPhone = sanitizeOrderNotifyPhone(owner?.phone);
  if (userPhone) {
    return userPhone;
  }

  const db = initDbFile();
  const userSessions = (db.sessions || []).filter(
    s => (s.user_id === canonicalId || s.user_id === userId) && sanitizeOrderNotifyPhone(s.phone_number)
  );
  const preferredSession =
    userSessions.find(s => s.status === 'connected' && s.is_primary) ||
    userSessions.find(s => s.status === 'connected') ||
    userSessions.find(s => s.is_primary) ||
    userSessions[0];

  return preferredSession ? sanitizeOrderNotifyPhone(preferredSession.phone_number) : '';
}

export function getActiveCatalogForAi(userId?: string): {
  enabled: boolean;
  shopName?: string;
  orderNotifyPhone?: string;
  products: Array<{
    title: string;
    description: string;
    price: number;
    image_url?: string;
  }>;
  bankAccounts: CatalogPaymentAccount[];
  paymentNotes?: string;
  qrisImageUrl?: string;
  qrisPublicUrl?: string;
} {
  if (!userId) {
    return { enabled: false, products: [], bankAccounts: [] };
  }
  const { settings, products } = getCatalogForUser(userId);
  const bankAccounts = sanitizeCatalogBankAccounts(settings.bank_accounts);
  const paymentNotes = settings.payment_notes?.trim() || undefined;
  const qrisImageUrl = settings.qris_image_url?.trim() || undefined;
  const qrisPublicUrl = resolveProductImagePublicUrl(qrisImageUrl);
  const orderNotifyPhone = resolveOrderNotificationRecipientPhone(userId) || undefined;

  if (!settings.enabled) {
    return {
      enabled: false,
      shopName: settings.shop_name?.trim() || undefined,
      orderNotifyPhone,
      products: [],
      bankAccounts,
      paymentNotes,
      qrisImageUrl,
      qrisPublicUrl
    };
  }
  const activeProducts = products.filter(p => p.is_active && p.title.trim().length > 0);
  if (activeProducts.length === 0) {
    return {
      enabled: false,
      shopName: settings.shop_name?.trim() || undefined,
      orderNotifyPhone,
      products: [],
      bankAccounts,
      paymentNotes,
      qrisImageUrl,
      qrisPublicUrl
    };
  }

  return {
    enabled: true,
    shopName: settings.shop_name?.trim() || undefined,
    orderNotifyPhone,
    products: activeProducts.map(p => ({
      title: p.title,
      description: p.description,
      price: p.price,
      image_url: resolveProductImagePublicUrl(p.image_url)
    })),
    bankAccounts,
    paymentNotes,
    qrisImageUrl,
    qrisPublicUrl
  };
}

// ==========================================
// PERSISTENT SUPERADMIN WA QUEUE
// ==========================================
const MAX_SUPERADMIN_WA_QUEUE = 500;

export function getSuperadminWaQueue(): SuperadminWaQueueItem[] {
  const db = initDbFile();
  if (!Array.isArray(db.superadminWaQueue)) db.superadminWaQueue = [];
  return [...db.superadminWaQueue];
}

export function enqueueSuperadminWaMessage(item: {
  recipient_phone: string;
  message: string;
  category: SuperadminWaQueueItem['category'];
  owner_user_id?: string;
  invoice_number?: string;
  last_error?: string;
}): SuperadminWaQueueItem {
  const db = initDbFile();
  if (!Array.isArray(db.superadminWaQueue)) db.superadminWaQueue = [];

  const cleanPhone = normalizePhoneForUniqueness(item.recipient_phone);
  if (!cleanPhone || cleanPhone.length < 8) {
    throw new Error('Nomor WhatsApp tujuan antrean tidak valid.');
  }

  // Deduplicate queued invoice and session_expired notifications
  if ((item.category === 'order_notification' || item.category === 'session_expired') && item.invoice_number) {
    const existing = db.superadminWaQueue.find(
      q =>
        q.category === item.category &&
        q.invoice_number === item.invoice_number &&
        normalizePhoneForUniqueness(q.recipient_phone) === cleanPhone
    );
    if (existing) {
      return existing;
    }
  }

  const entry: SuperadminWaQueueItem = {
    id: `saq_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    recipient_phone: cleanPhone,
    message: String(item.message || '').slice(0, 4000),
    category: item.category,
    owner_user_id: item.owner_user_id,
    invoice_number: item.invoice_number,
    attempts: 0,
    last_error: item.last_error,
    created_at: new Date().toISOString()
  };

  db.superadminWaQueue.push(entry);
  if (db.superadminWaQueue.length > MAX_SUPERADMIN_WA_QUEUE) {
    db.superadminWaQueue = db.superadminWaQueue.slice(-MAX_SUPERADMIN_WA_QUEUE);
  }
  writeDbFile(db, true);
  asyncSyncKv('superadminWaQueue', db.superadminWaQueue);
  return entry;
}

const recentlyRemovedQueueIds = new Map<string, number>();

export function updateSuperadminWaQueueItem(
  id: string,
  updates: Partial<SuperadminWaQueueItem>
): SuperadminWaQueueItem | null {
  const db = initDbFile();
  if (!Array.isArray(db.superadminWaQueue)) return null;
  const idx = db.superadminWaQueue.findIndex(q => q.id === id);
  if (idx === -1) return null;
  db.superadminWaQueue[idx] = { ...db.superadminWaQueue[idx], ...updates };
  writeDbFile(db, true);
  asyncSyncKv('superadminWaQueue', db.superadminWaQueue);
  return db.superadminWaQueue[idx];
}

export function removeSuperadminWaQueueItem(id: string): boolean {
  const db = initDbFile();
  if (!Array.isArray(db.superadminWaQueue)) return false;
  const before = db.superadminWaQueue.length;
  db.superadminWaQueue = db.superadminWaQueue.filter(q => q.id !== id);
  if (db.superadminWaQueue.length !== before) {
    recentlyRemovedQueueIds.set(id, Date.now());
    if (recentlyRemovedQueueIds.size > 500) {
      const oldest = recentlyRemovedQueueIds.keys().next().value;
      if (oldest) recentlyRemovedQueueIds.delete(oldest);
    }
    writeDbFile(db, true);
    asyncSyncKv('superadminWaQueue', db.superadminWaQueue);
    return true;
  }
  return false;
}

export function applyLiveClusterSnapshotToDb(snapshot: {
  sessions?: WhatsAppSession[];
  usersAppMap?: Record<string, string>;
  systemConfig?: Partial<SystemConfig> | null;
  superadminWaQueue?: SuperadminWaQueueItem[] | null;
}): void {
  const db = initDbFile();
  let changed = false;

  if (snapshot.usersAppMap && typeof snapshot.usersAppMap === 'object' && Array.isArray(db.users)) {
    for (const u of db.users) {
      if (!u?.id || !(u.id in snapshot.usersAppMap)) continue;
      const remoteApp = normalizeAppIdValue(snapshot.usersAppMap[u.id]) || undefined;
      if ((normalizeAppIdValue(u.assigned_app_id) || undefined) !== remoteApp) {
        u.assigned_app_id = remoteApp;
        changed = true;
      }
    }
  }

  if (snapshot.systemConfig && typeof snapshot.systemConfig === 'object') {
    const nextNodes =
      snapshot.systemConfig.app_nodes !== undefined
        ? normalizeAppNodes(snapshot.systemConfig.app_nodes)
        : normalizeAppNodes(db.systemConfig.app_nodes);
    const nextKillTargetIps =
      snapshot.systemConfig.kill_target_ips !== undefined
        ? normalizeKillTargetIps(snapshot.systemConfig.kill_target_ips)
        : normalizeKillTargetIps(db.systemConfig.kill_target_ips);
    const nextAdminPhone =
      snapshot.systemConfig.admin_notify_phone !== undefined
        ? normalizeAdminNotifyPhone(snapshot.systemConfig.admin_notify_phone)
        : normalizeAdminNotifyPhone(db.systemConfig.admin_notify_phone);
    const nextTelegramToken =
      snapshot.systemConfig.telegram_bot_token !== undefined
        ? normalizeStoredTelegramToken(snapshot.systemConfig.telegram_bot_token)
        : normalizeStoredTelegramToken(db.systemConfig.telegram_bot_token);
    const nextTelegramChatId =
      snapshot.systemConfig.telegram_chat_id !== undefined
        ? normalizeTelegramChatId(snapshot.systemConfig.telegram_chat_id)
        : normalizeTelegramChatId(db.systemConfig.telegram_chat_id);
    const nextTelegramEnabled =
      snapshot.systemConfig.telegram_enabled !== undefined
        ? Boolean(snapshot.systemConfig.telegram_enabled)
        : db.systemConfig.telegram_enabled !== false;
    const nextTelegramConfigs =
      snapshot.systemConfig.telegram_configs !== undefined
        ? normalizeTelegramConfigs(snapshot.systemConfig.telegram_configs)
        : normalizeTelegramConfigs(db.systemConfig.telegram_configs);
    db.systemConfig = {
      ...db.systemConfig,
      app_nodes: nextNodes,
      kill_target_ips: nextKillTargetIps,
      admin_notify_phone: nextAdminPhone,
      telegram_bot_token: nextTelegramToken,
      telegram_chat_id: nextTelegramChatId,
      telegram_enabled: nextTelegramEnabled,
      telegram_configs: nextTelegramConfigs
    };
    changed = true;
  }

  if (Array.isArray(snapshot.sessions)) {
    const localMap = new Map(db.sessions.map(s => [s.id, s]));
    const remoteIds = new Set(snapshot.sessions.map(s => s.id));
    const merged: WhatsAppSession[] = snapshot.sessions.map(rs => {
      const local = localMap.get(rs.id);
      const localTs = local?.last_assignment_at ? Date.parse(local.last_assignment_at) : 0;
      const remoteTs = rs.last_assignment_at ? Date.parse(rs.last_assignment_at) : 0;
      const preferLocalAssignment = localTs > remoteTs && Date.now() - localTs < 20_000;
      const effectiveAssignStatus = preferLocalAssignment
        ? local?.assignment_status
        : (rs.assignment_status || local?.assignment_status);
      const isReleased = effectiveAssignStatus === 'released';
      return {
        ...local,
        ...rs,
        user_id: rs.user_id || local?.user_id || extractUserIdFromSessionId(rs.id, db.users || []),
        status: isReleased ? 'disconnected' : (rs.status || local?.status || 'disconnected'),
        assigned_app_id: isReleased
          ? undefined
          : preferLocalAssignment
            ? (normalizeAppIdValue(local?.assigned_app_id) || undefined)
            : (normalizeAppIdValue(rs.assigned_app_id) || undefined),
        assigned_server_ip: undefined,
        connected_app_id: isReleased
          ? undefined
          : preferLocalAssignment
            ? (normalizeAppIdValue(local?.connected_app_id) || undefined)
            : (normalizeAppIdValue(rs.connected_app_id) || undefined),
        connected_server_ip: isReleased
          ? undefined
          : preferLocalAssignment
            ? (normalizeServerIpValue(local?.connected_server_ip) || normalizeServerIpValue(rs.connected_server_ip) || undefined)
            : (normalizeServerIpValue(rs.connected_server_ip) || undefined),
        failed_app_ids: preferLocalAssignment
          ? (local?.failed_app_ids || [])
          : (Array.isArray(rs.failed_app_ids) ? rs.failed_app_ids.map(normalizeAppIdValue).filter(Boolean) : []),
        assignment_status: effectiveAssignStatus,
        assignment_error: preferLocalAssignment ? local?.assignment_error : rs.assignment_error,
        last_assignment_at: preferLocalAssignment ? local?.last_assignment_at : rs.last_assignment_at
      };
    });
    for (const localSess of db.sessions) {
      if (localSess.id && !remoteIds.has(localSess.id) && (localSess.status === 'connected' || Boolean(localSess.connected_at))) {
        merged.push(localSess);
      }
    }
    db.sessions = merged;
    changed = true;
  }

  if (Array.isArray(snapshot.superadminWaQueue)) {
    const now = Date.now();
    for (const [qid, removedAt] of recentlyRemovedQueueIds.entries()) {
      if (now - removedAt > 120_000) recentlyRemovedQueueIds.delete(qid);
    }
    const mergedQueue = new Map<string, SuperadminWaQueueItem>();
    for (const item of snapshot.superadminWaQueue) {
      if (item?.id && !recentlyRemovedQueueIds.has(item.id)) {
        mergedQueue.set(item.id, item);
      }
    }
    for (const item of db.superadminWaQueue || []) {
      if (item?.id && !recentlyRemovedQueueIds.has(item.id)) {
        mergedQueue.set(item.id, item);
      }
    }
    db.superadminWaQueue = Array.from(mergedQueue.values()).slice(-MAX_SUPERADMIN_WA_QUEUE);
    changed = true;
  }

  if (changed) {
    writeDbFile(db, false);
  }
}

export function hasSessionExpiryAlertSent(keys: string[]): boolean {
  const db = initDbFile();
  const map = db.expiredSessionAlertKeys;
  if (!map || typeof map !== 'object') return false;
  return keys.some(k => Boolean(k && map[k]));
}

export function markSessionExpiryAlertSent(keys: string[]): void {
  const cleanKeys = keys.map(k => String(k || '').trim()).filter(Boolean);
  if (cleanKeys.length === 0) return;
  const db = initDbFile();
  if (!db.expiredSessionAlertKeys || typeof db.expiredSessionAlertKeys !== 'object') {
    db.expiredSessionAlertKeys = {};
  }
  const nowIso = new Date().toISOString();
  for (const k of cleanKeys) {
    db.expiredSessionAlertKeys[k] = nowIso;
  }
  const entries = Object.entries(db.expiredSessionAlertKeys);
  if (entries.length > 1000) {
    db.expiredSessionAlertKeys = Object.fromEntries(entries.slice(-1000));
  }
  writeDbFile(db, true);
  asyncSyncKv('expiredSessionAlertKeys', db.expiredSessionAlertKeys);
}

export function clearSessionExpiryAlertSent(keys: string[]): void {
  const cleanKeys = keys.map(k => String(k || '').trim()).filter(Boolean);
  if (cleanKeys.length === 0) return;
  const db = initDbFile();
  const map = db.expiredSessionAlertKeys;
  if (!map || typeof map !== 'object') return;
  let changed = false;
  for (const k of cleanKeys) {
    if (k in map) {
      delete map[k];
      changed = true;
    }
  }
  if (changed) {
    writeDbFile(db, true);
    asyncSyncKv('expiredSessionAlertKeys', db.expiredSessionAlertKeys);
  }
}

export function getPendingSessionExpiryAlerts(): PendingSessionExpiryAlert[] {
  const db = initDbFile();
  if (!Array.isArray(db.pendingSessionExpiryAlerts)) db.pendingSessionExpiryAlerts = [];
  return [...db.pendingSessionExpiryAlerts];
}

export function upsertPendingSessionExpiryAlert(params: {
  key: string;
  user_id: string;
  session_id: string;
  session_name?: string;
  expired_phone?: string;
  reason?: string;
  grace_ms: number;
}): { item: PendingSessionExpiryAlert; created: boolean } {
  const db = initDbFile();
  if (!Array.isArray(db.pendingSessionExpiryAlerts)) {
    db.pendingSessionExpiryAlerts = [];
  }
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const cleanKey = String(params.key || '').trim();
  const existingIdx = db.pendingSessionExpiryAlerts.findIndex(a => a.key === cleanKey);

  if (existingIdx !== -1) {
    const prev = db.pendingSessionExpiryAlerts[existingIdx];
    const updated: PendingSessionExpiryAlert = {
      ...prev,
      session_id: params.session_id || prev.session_id,
      session_name: params.session_name || prev.session_name,
      expired_phone: params.expired_phone || prev.expired_phone,
      reason: params.reason || prev.reason,
      updated_at: nowIso
    };
    db.pendingSessionExpiryAlerts[existingIdx] = updated;
    writeDbFile(db, true);
    asyncSyncKv('pendingSessionExpiryAlerts', db.pendingSessionExpiryAlerts);
    return { item: updated, created: false };
  }

  const created: PendingSessionExpiryAlert = {
    id: `psea_${nowMs}_${crypto.randomBytes(4).toString('hex')}`,
    key: cleanKey,
    user_id: params.user_id,
    session_id: params.session_id,
    session_name: params.session_name,
    expired_phone: params.expired_phone,
    first_detected_at: nowIso,
    notify_after: new Date(nowMs + Math.max(0, params.grace_ms)).toISOString(),
    reason: params.reason,
    updated_at: nowIso
  };

  db.pendingSessionExpiryAlerts.push(created);
  if (db.pendingSessionExpiryAlerts.length > 500) {
    db.pendingSessionExpiryAlerts = db.pendingSessionExpiryAlerts.slice(-500);
  }
  writeDbFile(db, true);
  asyncSyncKv('pendingSessionExpiryAlerts', db.pendingSessionExpiryAlerts);
  return { item: created, created: true };
}

export function removePendingSessionExpiryAlert(idOrKey: string): boolean {
  const db = initDbFile();
  if (!Array.isArray(db.pendingSessionExpiryAlerts) || !idOrKey) return false;
  const before = db.pendingSessionExpiryAlerts.length;
  db.pendingSessionExpiryAlerts = db.pendingSessionExpiryAlerts.filter(
    a => a.id !== idOrKey && a.key !== idOrKey
  );
  if (db.pendingSessionExpiryAlerts.length !== before) {
    writeDbFile(db, true);
    asyncSyncKv('pendingSessionExpiryAlerts', db.pendingSessionExpiryAlerts);
    return true;
  }
  return false;
}

export function clearPendingSessionExpiryAlertsByKeys(params: {
  userId?: string;
  sessionId?: string;
  phone?: string;
}): number {
  const db = initDbFile();
  if (!Array.isArray(db.pendingSessionExpiryAlerts) || db.pendingSessionExpiryAlerts.length === 0) {
    return 0;
  }
  const cleanPhone = params.phone ? normalizePhoneForUniqueness(params.phone) : '';
  const before = db.pendingSessionExpiryAlerts.length;
  db.pendingSessionExpiryAlerts = db.pendingSessionExpiryAlerts.filter(a => {
    if (params.userId && a.user_id !== params.userId) return true;
    const matchSid = Boolean(params.sessionId && a.session_id === params.sessionId);
    const matchPhone = Boolean(
      cleanPhone && a.expired_phone && normalizePhoneForUniqueness(a.expired_phone) === cleanPhone
    );
    return !(matchSid || matchPhone);
  });
  const removed = before - db.pendingSessionExpiryAlerts.length;
  if (removed > 0) {
    writeDbFile(db, true);
    asyncSyncKv('pendingSessionExpiryAlerts', db.pendingSessionExpiryAlerts);
  }
  return removed;
}

// ==========================================
// PERSISTENT CATCH-UP DEDUP, WATERMARKS & MISSED-MESSAGE RECOVERY QUEUE
// ==========================================
const HANDLED_MSG_RETENTION_MS = 48 * 60 * 60 * 1000;
const MAX_HANDLED_INCOMING_MESSAGES = 3000;
const CHAT_WATERMARK_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CHAT_REPLY_WATERMARKS = 2000;
const MISSED_MSG_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_PENDING_MISSED_MESSAGES = 200;

const throttledKvTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleThrottledKvSync(key: string, valueGetter: () => any, delayMs = 8000): void {
  markMutated();
  if (throttledKvTimers.has(key)) return;
  const timer = setTimeout(() => {
    throttledKvTimers.delete(key);
    try {
      asyncSyncKv(key, valueGetter());
    } catch {
      // Non-fatal MySQL KV sync error
    }
  }, delayMs);
  timer.unref?.();
  throttledKvTimers.set(key, timer);
}

function pruneTimestampMap(
  map: Record<string, number>,
  retentionMs: number,
  maxEntries: number,
  now = Date.now()
): Record<string, number> {
  const cutoff = now - retentionMs;
  const entries = Object.entries(map || {}).filter(
    ([k, v]) => Boolean(k) && typeof v === 'number' && Number.isFinite(v) && v >= cutoff
  );
  if (entries.length > maxEntries) {
    entries.sort((a, b) => a[1] - b[1]);
    return Object.fromEntries(entries.slice(-maxEntries));
  }
  return Object.fromEntries(entries);
}

export function hasIncomingMessageBeenHandled(wamId?: string | null, sessionId?: string): boolean {
  const cleanId = String(wamId || '').trim();
  if (!cleanId) return false;
  const db = initDbFile();
  const map = db.handledIncomingMessages;
  if (map && typeof map === 'object') {
    if (sessionId && map[`${sessionId}::${cleanId}`]) return true;
    if (map[cleanId]) return true;
  }
  return (db.messages || []).some(
    m =>
      m.wam_id === cleanId &&
      (!sessionId || !m.session_id || m.session_id === sessionId) &&
      m.direction === 'incoming' &&
      (m.status === 'Sukses' || m.status === 'Diterima')
  );
}

export function markIncomingMessagesHandled(
  wamIds: Array<string | undefined | null>,
  sessionId?: string,
  timestampMs = Date.now()
): void {
  const cleanIds = Array.from(
    new Set(wamIds.map(id => String(id || '').trim()).filter(Boolean))
  );
  if (cleanIds.length === 0) return;

  const db = initDbFile();
  if (!db.handledIncomingMessages || typeof db.handledIncomingMessages !== 'object') {
    db.handledIncomingMessages = {};
  }
  const now = Date.now();
  const recordTs = Number.isFinite(timestampMs) && timestampMs > 0 ? Math.max(timestampMs, now - HANDLED_MSG_RETENTION_MS + 60_000) : now;

  for (const id of cleanIds) {
    const key = sessionId ? `${sessionId}::${id}` : id;
    db.handledIncomingMessages[key] = Math.max(db.handledIncomingMessages[key] || 0, recordTs);
  }

  if (Object.keys(db.handledIncomingMessages).length > MAX_HANDLED_INCOMING_MESSAGES) {
    db.handledIncomingMessages = pruneTimestampMap(
      db.handledIncomingMessages,
      HANDLED_MSG_RETENTION_MS,
      MAX_HANDLED_INCOMING_MESSAGES,
      now
    );
  }

  writeDbFile(db);
  scheduleThrottledKvSync('handledIncomingMessages', () => initDbFile().handledIncomingMessages || {});
}

export function getChatReplyWatermark(
  sessionId: string,
  cleanPhone?: string,
  remoteJid?: string
): number {
  if (!sessionId) return 0;
  const db = initDbFile();
  const map = db.chatReplyWatermark;
  if (!map || typeof map !== 'object') return 0;

  let maxTs = 0;
  const normPhone = cleanPhone ? normalizePhoneForUniqueness(cleanPhone) : '';
  if (normPhone && normPhone.length >= 8) {
    const ts = Number(map[`${sessionId}::pn:${normPhone}`] || 0);
    if (Number.isFinite(ts) && ts > maxTs) maxTs = ts;
  }
  const cleanJid = String(remoteJid || '').trim();
  if (cleanJid) {
    const ts = Number(map[`${sessionId}::jid:${cleanJid}`] || 0);
    if (Number.isFinite(ts) && ts > maxTs) maxTs = ts;
  }
  return maxTs;
}

export function recordChatReplyWatermark(
  sessionId: string,
  params: { cleanPhone?: string; remoteJid?: string; timestampMs?: number }
): void {
  if (!sessionId) return;
  const normPhone = params.cleanPhone ? normalizePhoneForUniqueness(params.cleanPhone) : '';
  const cleanJid = String(params.remoteJid || '').trim();
  if ((!normPhone || normPhone.length < 8) && !cleanJid) return;

  const db = initDbFile();
  if (!db.chatReplyWatermark || typeof db.chatReplyWatermark !== 'object') {
    db.chatReplyWatermark = {};
  }

  const tsMs =
    typeof params.timestampMs === 'number' && Number.isFinite(params.timestampMs) && params.timestampMs > 0
      ? params.timestampMs
      : Date.now();
  let changed = false;

  if (normPhone && normPhone.length >= 8) {
    const pnKey = `${sessionId}::pn:${normPhone}`;
    if (tsMs > (db.chatReplyWatermark[pnKey] || 0)) {
      db.chatReplyWatermark[pnKey] = tsMs;
      changed = true;
    }
  }
  if (cleanJid) {
    const jidKey = `${sessionId}::jid:${cleanJid}`;
    if (tsMs > (db.chatReplyWatermark[jidKey] || 0)) {
      db.chatReplyWatermark[jidKey] = tsMs;
      changed = true;
    }
  }

  if (!changed) return;

  if (Object.keys(db.chatReplyWatermark).length > MAX_CHAT_REPLY_WATERMARKS) {
    db.chatReplyWatermark = pruneTimestampMap(
      db.chatReplyWatermark,
      CHAT_WATERMARK_RETENTION_MS,
      MAX_CHAT_REPLY_WATERMARKS
    );
  }

  writeDbFile(db);
  scheduleThrottledKvSync('chatReplyWatermark', () => initDbFile().chatReplyWatermark || {});
}

export function getPendingMissedMessages(sessionId?: string): PendingMissedMessageItem[] {
  const db = initDbFile();
  if (!Array.isArray(db.pendingMissedMessages)) {
    db.pendingMissedMessages = [];
    return [];
  }
  const cutoff = Date.now() - MISSED_MSG_RETENTION_MS;
  const beforeLen = db.pendingMissedMessages.length;
  db.pendingMissedMessages = db.pendingMissedMessages.filter(item => {
    if (!item?.id || !item?.session_id || !item?.user_id || !item?.wam_id) return false;
    const createdMs = Date.parse(item.created_at || '');
    return !Number.isFinite(createdMs) || createdMs >= cutoff;
  });
  if (db.pendingMissedMessages.length !== beforeLen) {
    writeDbFile(db);
    scheduleThrottledKvSync('pendingMissedMessages', () => initDbFile().pendingMissedMessages || [], 4000);
  }

  const list = sessionId
    ? db.pendingMissedMessages.filter(item => item.session_id === sessionId)
    : db.pendingMissedMessages;
  return [...list].sort((a, b) => (a.message_ts_ms || 0) - (b.message_ts_ms || 0));
}

export function upsertPendingMissedMessage(
  item: Omit<PendingMissedMessageItem, 'id' | 'attempts' | 'next_retry_at' | 'created_at'> & {
    nextRetryDelayMs?: number;
  }
): PendingMissedMessageItem | null {
  const cleanSid = String(item.session_id || '').trim();
  const cleanUid = String(item.user_id || '').trim();
  const cleanPhone = String(item.sender_phone || '').trim();
  const cleanWamId = String(item.wam_id || '').trim();
  const cleanBody = String(item.message_body || '').trim();
  const cleanRemoteJid = String(item.remote_jid || '').trim();
  if (!cleanSid || !cleanUid || !cleanPhone || !cleanWamId || !cleanBody || !cleanRemoteJid) {
    return null;
  }

  const db = initDbFile();
  if (!Array.isArray(db.pendingMissedMessages)) {
    db.pendingMissedMessages = [];
  }

  const nowMs = Date.now();
  const retryAt = nowMs + Math.max(2000, item.nextRetryDelayMs ?? 15000);
  const incomingExtras = Array.isArray(item.extra_wam_ids) ? item.extra_wam_ids.filter(Boolean) : [];

  const existingIdx = db.pendingMissedMessages.findIndex(
    q =>
      q.session_id === cleanSid &&
      q.user_id === cleanUid &&
      (q.remote_jid === cleanRemoteJid || q.sender_phone === cleanPhone)
  );

  if (existingIdx !== -1) {
    const prev = db.pendingMissedMessages[existingIdx];
    const knownWamIds = new Set<string>([prev.wam_id, ...(prev.extra_wam_ids || [])]);
    const isDuplicateWam = knownWamIds.has(cleanWamId);

    const nextBody = isDuplicateWam
      ? prev.message_body
      : prev.message_body === cleanBody
        ? prev.message_body
        : `${prev.message_body}\n${cleanBody}`.slice(-1500);

    for (const id of [cleanWamId, ...incomingExtras]) {
      knownWamIds.add(id);
    }
    const allIds = Array.from(knownWamIds);

    const updated: PendingMissedMessageItem = {
      ...prev,
      sender_name: item.sender_name || prev.sender_name,
      fallback_pn_jid: item.fallback_pn_jid || prev.fallback_pn_jid,
      message_body: nextBody,
      has_media: Boolean(prev.has_media || item.has_media),
      extra_wam_ids: allIds.filter(id => id !== prev.wam_id).slice(-12),
      message_ts_ms: Math.max(prev.message_ts_ms || 0, item.message_ts_ms || nowMs),
      last_error: item.last_error || prev.last_error,
      next_retry_at: Math.min(prev.next_retry_at || retryAt, retryAt)
    };
    db.pendingMissedMessages[existingIdx] = updated;
    writeDbFile(db, true);
    scheduleThrottledKvSync('pendingMissedMessages', () => initDbFile().pendingMissedMessages || [], 4000);
    return updated;
  }

  const created: PendingMissedMessageItem = {
    id: `pmm_${nowMs}_${crypto.randomBytes(4).toString('hex')}`,
    wam_id: cleanWamId,
    extra_wam_ids: incomingExtras.filter(id => id !== cleanWamId).slice(-12),
    session_id: cleanSid,
    user_id: cleanUid,
    sender_phone: cleanPhone,
    sender_name: String(item.sender_name || 'Pengguna WhatsApp').slice(0, 100),
    remote_jid: cleanRemoteJid,
    fallback_pn_jid: item.fallback_pn_jid,
    message_body: cleanBody.slice(0, 1500),
    has_media: Boolean(item.has_media),
    message_ts_ms: item.message_ts_ms || nowMs,
    attempts: 0,
    last_error: item.last_error,
    next_retry_at: retryAt,
    created_at: new Date(nowMs).toISOString()
  };

  db.pendingMissedMessages.push(created);
  if (db.pendingMissedMessages.length > MAX_PENDING_MISSED_MESSAGES) {
    db.pendingMissedMessages = db.pendingMissedMessages.slice(-MAX_PENDING_MISSED_MESSAGES);
  }
  writeDbFile(db, true);
  scheduleThrottledKvSync('pendingMissedMessages', () => initDbFile().pendingMissedMessages || [], 4000);
  return created;
}

export function updatePendingMissedMessage(
  id: string,
  updates: Partial<PendingMissedMessageItem>
): PendingMissedMessageItem | null {
  if (!id) return null;
  const db = initDbFile();
  if (!Array.isArray(db.pendingMissedMessages)) return null;
  const idx = db.pendingMissedMessages.findIndex(q => q.id === id);
  if (idx === -1) return null;
  db.pendingMissedMessages[idx] = { ...db.pendingMissedMessages[idx], ...updates };
  writeDbFile(db);
  scheduleThrottledKvSync('pendingMissedMessages', () => initDbFile().pendingMissedMessages || [], 4000);
  return db.pendingMissedMessages[idx];
}

export function removePendingMissedMessage(id: string): boolean {
  if (!id) return false;
  const db = initDbFile();
  if (!Array.isArray(db.pendingMissedMessages) || db.pendingMissedMessages.length === 0) return false;
  const before = db.pendingMissedMessages.length;
  db.pendingMissedMessages = db.pendingMissedMessages.filter(q => q.id !== id);
  if (db.pendingMissedMessages.length !== before) {
    writeDbFile(db, true);
    scheduleThrottledKvSync('pendingMissedMessages', () => initDbFile().pendingMissedMessages || [], 4000);
    return true;
  }
  return false;
}

export function clearPendingMissedMessagesForSession(sessionId: string): number {
  if (!sessionId) return 0;
  const db = initDbFile();
  if (!Array.isArray(db.pendingMissedMessages) || db.pendingMissedMessages.length === 0) return 0;
  const before = db.pendingMissedMessages.length;
  db.pendingMissedMessages = db.pendingMissedMessages.filter(q => q.session_id !== sessionId);
  const removed = before - db.pendingMissedMessages.length;
  if (removed > 0) {
    writeDbFile(db, true);
    scheduleThrottledKvSync('pendingMissedMessages', () => initDbFile().pendingMissedMessages || [], 4000);
  }
  return removed;
}


