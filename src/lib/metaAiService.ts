import crypto from 'crypto';
import {
  META_AI_JID,
  S_WHATSAPP_NET,
  aesDecryptGCM,
  areJidsSameUser,
  buildAckStanza,
  encodeSignedDeviceIdentity,
  encodeWAMessage,
  generateMessageIDV2,
  generateWAMessage,
  getBinaryNodeChild,
  getBinaryNodeChildren,
  isJidBot,
  isJidMetaAI,
  jidDecode,
  jidNormalizedUser,
  parseAndInjectE2ESessions,
  proto,
  unpadRandomMax16
} from '@whiskeysockets/baileys';
import { recordAiAuditEvent } from './aiAuditLogger.js';
import {
  isRecoverableSignalMacError,
  shouldResetCorruptedSignalSession,
  withSignalDecryptScope
} from './signalRecovery.js';

export interface ConnectedSocketEntry {
  sessionId: string;
  userId?: string;
  phoneNumber?: string;
  socket: any;
}

export interface MetaAiRuleHint {
  keyword: string;
  response_text: string;
}

export interface MetaAiCatalogProduct {
  title: string;
  description?: string;
  price: number;
  image_url?: string;
}

export interface MetaAiCustomerTurn {
  role: 'customer' | 'assistant';
  text: string;
}

export interface MetaAiQueryParams {
  userId?: string;
  sessionId?: string;
  senderPhone: string;
  senderName?: string;
  messageBody: string;
  customSystemPrompt?: string;
  autoReplyRules?: MetaAiRuleHint[];
  catalogShopName?: string;
  catalogProducts?: MetaAiCatalogProduct[];
  customerCode?: string;
  customerHistory?: MetaAiCustomerTurn[];
  orderSummary?: string;
  paymentSummary?: string;
}

export interface MetaAiQueryResult {
  replyText: string;
  usedAi: boolean;
  isOfflineFallback?: boolean;
  retryable?: boolean;
  source: 'meta_ai_whatsapp' | 'offline_fallback';
  sessionId?: string;
  errorReason?: string;
}

interface BotListEntry {
  jid: string;
  personaId?: string;
}

interface PendingBotSecretEntry {
  sessionId: string;
  msgId: string;
  botJid: string;
  messageSecret: Buffer;
  expiresAt: number;
}

interface PendingWaiter {
  sessionId: string;
  customerCode?: string;
  promptSent: string;
  sentAt: number;
  latestText: string;
  hasSignal: boolean;
  settled: boolean;
  pendingAckMsgIds: Set<string>;
  msgIdToTargetJid: Map<string, string>;
  lastAckError?: string;
  fallbackInProgress?: boolean;
  fallbackAttemptFn?: () => Promise<boolean>;
  resolve: (value: { ok: boolean; text?: string; reason?: string }) => void;
  hardTimer: ReturnType<typeof setTimeout>;
  settleTimer: ReturnType<typeof setTimeout> | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
}

type ConnectedSocketProvider = (userId?: string, preferredSessionId?: string) => ConnectedSocketEntry | null;
type AllConnectedSocketsProvider = () => ConnectedSocketEntry[];
type EnsureConnectedSocketProvider = (
  userId?: string,
  preferredSessionId?: string,
  options?: { forceReconnect?: boolean }
) => Promise<ConnectedSocketEntry | null>;

let socketProvider: ConnectedSocketProvider | null = null;
let allSocketsProvider: AllConnectedSocketsProvider | null = null;
let ensureSocketProvider: EnsureConnectedSocketProvider | null = null;

interface ResponseCacheEntry {
  replyText: string;
  expiresAt: number;
}

interface SessionCooldownEntry {
  until: number;
  consecutiveTimeouts: number;
  reason: string;
}

const sessionQueues = new Map<string, Promise<unknown>>();
const sessionQueueDepth = new Map<string, number>();
const activeWaiters = new Map<string, PendingWaiter>();
const recentMetaPrompts = new Map<string, number>();
const sessionMetaAiLids = new Map<string, string>();
const sessionPreferredMetaJid = new Map<string, string>();
const sessionBotEntries = new Map<string, { entries: BotListEntry[]; expiresAt: number }>();
const sessionBotPersonas = new Map<string, Map<string, string>>();
const pendingBotSecrets = new Map<string, PendingBotSecretEntry>();
const sessionLatestBotSecret = new Map<string, PendingBotSecretEntry>();
const sessionLastPromptAt = new Map<string, number>();
const sessionPromptTimestamps = new Map<string, number[]>();
const sessionCooldowns = new Map<string, SessionCooldownEntry>();
const senderQueryHistory = new Map<string, number[]>();
const responseCache = new Map<string, ResponseCacheEntry>();
const botSignalReadyCache = new Map<string, number>();
const sessionRejectedBotJids = new Map<string, Map<string, number>>();
const sessionConsecutiveSends = new Map<string, number>();
const sessionLastMetaError = new Map<string, { code: string; message: string; at: number }>();
const sessionDecryptHint = new Map<string, { modType: string; origSender: string; modSender: string }>();
const wrappedSockets = new WeakMap<object, { active: boolean; sessionId: string; socket: any }>();

const MAX_QUEUE_DEPTH = 35;
const HARD_TIMEOUT_MS = 30000;
const SILENT_FALLBACK_RETRY_MS = 4500;
const SETTLE_DEBOUNCE_MS = 950;
const FAST_FINAL_SETTLE_MS = 300;
const PROMPT_ECHO_TTL_MS = 90000;
const BOT_SECRET_TTL_MS = 180 * 1000;
const MAX_BOT_SECRETS = 120;
const MAX_RECENT_PROMPTS = 200;
const MAX_TRACKED_SESSIONS = 200;
const MAX_RESPONSE_CACHE = 200;
const RESPONSE_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_SENDER_HISTORY = 500;
const SENDER_BURST_WINDOW_MS = 60 * 1000;
const SENDER_BURST_MAX = 25;
const MIN_INTER_QUERY_MS = 1000;
const INTER_QUERY_JITTER_MS = 450;
const MAX_PROMPTS_PER_MIN = 25;
const MAX_PROMPTS_PER_HOUR = 600;
const BOT_LIST_CACHE_TTL_MS = 30 * 60 * 1000;
const BOT_LIST_EMPTY_CACHE_TTL_MS = 5 * 60 * 1000;
const BOT_SIGNAL_READY_TTL_MS = 60 * 60 * 1000;
const BOT_JID_REJECT_TTL_MS = 60 * 1000;

const metaAiMaintenanceTimer = setInterval(() => {
  const now = Date.now();
  prunePendingBotSecrets(now);
  pruneRecentPrompts(now);
  for (const [k, v] of responseCache.entries()) {
    if (v.expiresAt <= now) responseCache.delete(k);
  }
  for (const [k, exp] of botSignalReadyCache.entries()) {
    if (exp <= now) botSignalReadyCache.delete(k);
  }
  for (const [sid, map] of sessionRejectedBotJids.entries()) {
    for (const [jidKey, exp] of map.entries()) {
      if (exp <= now) map.delete(jidKey);
    }
    if (map.size === 0) sessionRejectedBotJids.delete(sid);
  }
  for (const [sid, cd] of sessionCooldowns.entries()) {
    if (cd.until > 0 && cd.until <= now && cd.consecutiveTimeouts === 0) {
      sessionCooldowns.delete(sid);
    }
  }
  const oneHourAgo = now - 60 * 60 * 1000;
  for (const [sid, arr] of sessionPromptTimestamps.entries()) {
    const filtered = arr.filter(t => t > oneHourAgo);
    if (filtered.length === 0) sessionPromptTimestamps.delete(sid);
    else if (filtered.length !== arr.length) sessionPromptTimestamps.set(sid, filtered);
  }
  const burstCutoff = now - SENDER_BURST_WINDOW_MS;
  for (const [k, arr] of senderQueryHistory.entries()) {
    const filtered = arr.filter(t => t > burstCutoff);
    if (filtered.length === 0) senderQueryHistory.delete(k);
    else if (filtered.length !== arr.length) senderQueryHistory.set(k, filtered);
  }
}, 5 * 60 * 1000);
metaAiMaintenanceTimer.unref?.();

export const DEFAULT_META_AI_BOT_JID = '867051314767696@bot';
export const DEFAULT_META_AI_PERSONA_ID = '867051314767696$760019659443059';
export const DEFAULT_META_AI_JID = DEFAULT_META_AI_BOT_JID;

const FALLBACK_META_AI_JIDS: string[] = Array.from(
  new Set([
    DEFAULT_META_AI_BOT_JID,
    '13135550002@s.whatsapp.net'
  ])
);

function isRoutableOutgoingMetaJid(jid?: string | null): boolean {
  if (!jid || typeof jid !== 'string') return false;
  const clean = jid.trim();
  if (!clean) return false;
  // Legacy @c.us JIDs and synthetic phone@bot JIDs trigger server ACK 488 (NackUnrecognizedStanza) on MD
  if (clean.endsWith('@c.us')) return false;
  if (clean.toLowerCase() === '13135550002@bot') return false;
  return clean.endsWith('@bot') || clean.endsWith('@lid') || clean.endsWith('@s.whatsapp.net');
}

export function registerConnectedSocketProvider(
  provider: ConnectedSocketProvider,
  allProvider?: AllConnectedSocketsProvider,
  ensureProvider?: EnsureConnectedSocketProvider
) {
  socketProvider = provider;
  if (allProvider) {
    allSocketsProvider = allProvider;
  }
  if (ensureProvider) {
    ensureSocketProvider = ensureProvider;
  }
}

export async function ensureConnectedMetaAiSocketForUser(
  userId?: string,
  preferredSessionId?: string,
  options?: { forceReconnect?: boolean }
): Promise<ConnectedSocketEntry | null> {
  const existing = socketProvider ? socketProvider(userId, preferredSessionId) : null;
  if (existing && isSocketOpen(existing.socket)) {
    return existing;
  }
  if (ensureSocketProvider) {
    try {
      const ensured = await ensureSocketProvider(userId, preferredSessionId, options);
      if (ensured && isSocketOpen(ensured.socket)) {
        return ensured;
      }
    } catch {
      // Non-blocking fallback
    }
  }
  const retry = socketProvider ? socketProvider(userId, preferredSessionId) : null;
  return retry && isSocketOpen(retry.socket) ? retry : null;
}

export function isMetaAiJid(jid?: string | null): boolean {
  if (!jid || typeof jid !== 'string') return false;
  const trimmed = jid.trim();
  if (!trimmed) return false;

  try {
    if (typeof isJidMetaAI === 'function' && isJidMetaAI(trimmed)) return true;
  } catch {
    // Ignore library helper errors on malformed JIDs
  }
  try {
    if (typeof isJidBot === 'function' && isJidBot(trimmed)) return true;
  } catch {
    // Ignore library helper errors
  }

  try {
    if (areJidsSameUser(trimmed, DEFAULT_META_AI_BOT_JID)) return true;
    if (areJidsSameUser(trimmed, '13135550002@s.whatsapp.net')) return true;
  } catch {
    // Ignore JID comparison errors
  }

  const normalized = (() => {
    try {
      return jidNormalizedUser(trimmed).toLowerCase();
    } catch {
      return trimmed.toLowerCase();
    }
  })();

  const [userPart = '', domainPart = ''] = normalized.split('@');
  const bareUser = userPart.split(':')[0];

  if (domainPart === 'bot') return true;
  if (bareUser === '867051314767696' || bareUser === '13135550002') return true;
  if (/^1313555\d{4}$/.test(bareUser) || /^131655500\d{2}$/.test(bareUser)) return true;
  if (normalized === 'meta_ai@s.whatsapp.net') return true;

  return false;
}

export function isSessionMetaAiJid(sessionId: string, jid?: string | null): boolean {
  if (!jid || typeof jid !== 'string') return false;
  if (isMetaAiJid(jid)) return true;
  const knownLid = sessionMetaAiLids.get(sessionId);
  if (knownLid) {
    try {
      if (knownLid === jid || areJidsSameUser(knownLid, jid)) return true;
    } catch {
      if (knownLid === jid) return true;
    }
  }
  const cachedBots = sessionBotEntries.get(sessionId)?.entries || [];
  for (const bot of cachedBots) {
    try {
      if (bot.jid === jid || areJidsSameUser(bot.jid, jid)) return true;
    } catch {
      if (bot.jid === jid) return true;
    }
  }
  return false;
}

function capMapSize<K, V>(map: Map<K, V>, maxSize: number) {
  while (map.size > maxSize) {
    const firstKey = map.keys().next().value;
    if (firstKey === undefined) break;
    map.delete(firstKey);
  }
}

function rememberSessionMetaAiLid(sessionId: string, candidateJid?: string | null, setPreferred = false) {
  if (!sessionId || !candidateJid || typeof candidateJid !== 'string') return;
  const raw = candidateJid.trim();
  if (!raw) return;
  const clean = raw.endsWith('@c.us') ? safeNormalizeJid(raw) : raw;
  if (!clean || !isRoutableOutgoingMetaJid(clean)) return;
  if (clean.endsWith('@lid')) {
    sessionMetaAiLids.set(sessionId, clean);
    capMapSize(sessionMetaAiLids, MAX_TRACKED_SESSIONS);
  }
  if (setPreferred && (clean.endsWith('@lid') || isMetaAiJid(clean))) {
    sessionPreferredMetaJid.set(sessionId, clean);
    capMapSize(sessionPreferredMetaJid, MAX_TRACKED_SESSIONS);
  }
}

function rememberBotPersona(sessionId: string, jid: string, personaId?: string) {
  if (!sessionId || !jid || !personaId) return;
  let map = sessionBotPersonas.get(sessionId);
  if (!map) {
    map = new Map<string, string>();
    sessionBotPersonas.set(sessionId, map);
    capMapSize(sessionBotPersonas, MAX_TRACKED_SESSIONS);
  }
  map.set(jid, personaId);
  const norm = safeNormalizeJid(jid);
  if (norm) map.set(norm, personaId);
  capMapSize(map, 50);
}

function safeNormalizeJid(jid?: string | null): string {
  if (!jid || typeof jid !== 'string') return '';
  const trimmed = jid.trim();
  if (!trimmed) return '';
  try {
    const norm = jidNormalizedUser(trimmed);
    return norm || trimmed;
  } catch {
    return trimmed;
  }
}

function markSessionRejectedBotJid(sessionId: string, jid?: string | null, ttlMs = BOT_JID_REJECT_TTL_MS) {
  if (!sessionId || !jid || typeof jid !== 'string') return;
  const clean = jid.trim();
  if (!clean) return;
  let map = sessionRejectedBotJids.get(sessionId);
  if (!map) {
    map = new Map<string, number>();
    sessionRejectedBotJids.set(sessionId, map);
    capMapSize(sessionRejectedBotJids, MAX_TRACKED_SESSIONS);
  }
  const expiresAt = Date.now() + ttlMs;
  map.set(clean, expiresAt);
  const norm = safeNormalizeJid(clean);
  if (norm) map.set(norm, expiresAt);
  capMapSize(map, 20);
}

function isSessionBotJidRejected(sessionId: string, jid?: string | null, now = Date.now()): boolean {
  if (!sessionId || !jid) return false;
  const map = sessionRejectedBotJids.get(sessionId);
  if (!map) return false;
  const clean = jid.trim();
  const norm = safeNormalizeJid(clean);
  for (const candidate of [clean, norm]) {
    if (!candidate) continue;
    const exp = map.get(candidate);
    if (exp !== undefined) {
      if (exp > now) return true;
      map.delete(candidate);
    }
  }
  if (map.size === 0) sessionRejectedBotJids.delete(sessionId);
  return false;
}

function prunePendingBotSecrets(now = Date.now()) {
  for (const [key, entry] of pendingBotSecrets.entries()) {
    if (entry.expiresAt <= now) {
      pendingBotSecrets.delete(key);
    }
  }
  while (pendingBotSecrets.size > MAX_BOT_SECRETS) {
    const firstKey = pendingBotSecrets.keys().next().value;
    if (!firstKey) break;
    pendingBotSecrets.delete(firstKey);
  }
  for (const [sid, entry] of sessionLatestBotSecret.entries()) {
    if (entry.expiresAt <= now) {
      sessionLatestBotSecret.delete(sid);
    }
  }
}

function storePendingBotSecret(sessionId: string, msgId: string, botJid: string, messageSecret: Buffer) {
  const now = Date.now();
  prunePendingBotSecrets(now);
  const entry: PendingBotSecretEntry = {
    sessionId,
    msgId,
    botJid,
    messageSecret: Buffer.from(messageSecret),
    expiresAt: now + BOT_SECRET_TTL_MS
  };
  pendingBotSecrets.set(`${sessionId}::${msgId}`, entry);
  sessionLatestBotSecret.set(sessionId, entry);
}

/**
 * Derives the 32-byte BotMessageSecret via HKDF-SHA256 with info "Bot Message".
 */
export function applyBotMessageHKDF(messageSecret: Buffer | Uint8Array): Buffer {
  return Buffer.from(
    crypto.hkdfSync('sha256', Buffer.from(messageSecret), Buffer.alloc(0), Buffer.from('Bot Message', 'utf8'), 32)
  );
}

/**
 * Decrypts a WhatsApp Bot `msmsg` payload (`proto.MessageSecretMessage`) using HKDF-SHA256 + AES-256-GCM.
 */
export function decryptMsmsgCiphertext(params: {
  messageSecret: Buffer | Uint8Array;
  encPayload: Uint8Array | Buffer;
  encIv: Uint8Array | Buffer;
  msgIds: string[];
  origSenders: string[];
  modificationSenders: string[];
  hint?: { modType?: string; origSender?: string; modSender?: string } | null;
  onMatch?: (meta: { modType: string; origSender: string; modSender: string }) => void;
}): proto.IMessage | null {
  const { messageSecret, encPayload, encIv, msgIds, origSenders, modificationSenders, hint, onMatch } = params;
  if (!messageSecret?.length || !encPayload?.length || !encIv?.length) return null;

  const payloadBuf = Buffer.from(encPayload);
  const ivBuf = Buffer.from(encIv);
  const secretBuf = Buffer.from(messageSecret);
  const botSecretBuf = applyBotMessageHKDF(secretBuf);

  const uniqueIds = Array.from(new Set(msgIds.filter(Boolean)));
  const uniqueOrigSenders = Array.from(new Set(origSenders.filter(Boolean)));
  const uniqueModSenders = Array.from(new Set(modificationSenders.filter(Boolean)));

  const keyVariants: Array<{ ikm: Buffer; modType: string }> = [
    { ikm: botSecretBuf, modType: '' },
    { ikm: secretBuf, modType: 'Bot Message' }
  ];

  const tryDecryptOne = (ikm: Buffer, modType: string, msgId: string, origSender: string, modSender: string): proto.IMessage | null => {
    try {
      const useCaseSecret = Buffer.concat([
        Buffer.from(msgId, 'utf8'),
        Buffer.from(origSender, 'utf8'),
        Buffer.from(modSender, 'utf8'),
        Buffer.from(modType, 'utf8')
      ]);
      const aesKey = Buffer.from(crypto.hkdfSync('sha256', ikm, Buffer.alloc(0), useCaseSecret, 32));
      const aad = Buffer.from(`${msgId}\u0000${modSender}`, 'utf8');
      const plaintext = aesDecryptGCM(payloadBuf, aesKey, ivBuf, aad);
      const decoded = proto.Message.decode(plaintext);
      if (decoded && typeof decoded === 'object') {
        onMatch?.({ modType, origSender, modSender });
        return decoded;
      }
    } catch {
      // AES-GCM auth tag prevents false positives
    }
    return null;
  };

  // Fast-path: try last winning decrypt shape for this session on primary msgId first (1 HKDF instead of up to 48)
  if (hint && hint.origSender && hint.modSender && uniqueIds.length > 0) {
    const hintKey = hint.modType === 'Bot Message' ? secretBuf : botSecretBuf;
    const hintModType = hint.modType === 'Bot Message' ? 'Bot Message' : '';
    const fast = tryDecryptOne(hintKey, hintModType, uniqueIds[0], hint.origSender, hint.modSender);
    if (fast) return fast;
  }

  for (const { ikm, modType } of keyVariants) {
    for (const msgId of uniqueIds) {
      for (const origSender of uniqueOrigSenders) {
        for (const modSender of uniqueModSenders) {
          const decoded = tryDecryptOne(ikm, modType, msgId, origSender, modSender);
          if (decoded) return decoded;
        }
      }
    }
  }

  return null;
}

export function unwrapBaileysMessageContent(message: any, depth = 0): any {
  if (!message || typeof message !== 'object' || depth > 8) return null;

  if (message.editedMessage?.message) {
    return unwrapBaileysMessageContent(message.editedMessage.message, depth + 1);
  }
  if (message.protocolMessage?.editedMessage) {
    return unwrapBaileysMessageContent(message.protocolMessage.editedMessage, depth + 1);
  }
  if (message.ephemeralMessage?.message) {
    return unwrapBaileysMessageContent(message.ephemeralMessage.message, depth + 1);
  }
  if (message.viewOnceMessage?.message) {
    return unwrapBaileysMessageContent(message.viewOnceMessage.message, depth + 1);
  }
  if (message.viewOnceMessageV2?.message) {
    return unwrapBaileysMessageContent(message.viewOnceMessageV2.message, depth + 1);
  }
  if (message.viewOnceMessageV2Extension?.message) {
    return unwrapBaileysMessageContent(message.viewOnceMessageV2Extension.message, depth + 1);
  }
  if (message.deviceSentMessage?.message) {
    return unwrapBaileysMessageContent(message.deviceSentMessage.message, depth + 1);
  }
  if (message.documentWithCaptionMessage?.message) {
    return unwrapBaileysMessageContent(message.documentWithCaptionMessage.message, depth + 1);
  }
  if (message.associatedChildMessage?.message) {
    return unwrapBaileysMessageContent(message.associatedChildMessage.message, depth + 1);
  }
  if (message.botInvokeMessage?.message) {
    return unwrapBaileysMessageContent(message.botInvokeMessage.message, depth + 1);
  }

  return message;
}

function extractRichResponseText(rich: any): string {
  if (!rich || typeof rich !== 'object' || !Array.isArray(rich.submessages)) return '';
  const chunks: string[] = [];
  for (const sub of rich.submessages) {
    if (!sub || typeof sub !== 'object') continue;
    const direct = sub.messageText || sub.text || sub.caption || sub.latexMetadata?.text || '';
    if (typeof direct === 'string' && direct.trim()) {
      chunks.push(direct.trim());
    }
    const codeBlocks = sub.codeMetadata?.codeBlocks;
    if (Array.isArray(codeBlocks) && codeBlocks.length > 0) {
      const codeLines = codeBlocks
        .map((b: any) => (typeof b?.codeContent === 'string' ? b.codeContent : b?.text || ''))
        .filter((s: any) => typeof s === 'string' && s.length > 0);
      if (codeLines.length > 0) {
        chunks.push(codeLines.join('\n'));
      }
    }
    const rows = sub.tableMetadata?.rows;
    if (Array.isArray(rows) && rows.length > 0) {
      const tableText = rows
        .map((r: any) => (Array.isArray(r?.items) ? r.items.map((cell: any) => String(cell || '').trim()).join(' | ') : ''))
        .filter(Boolean)
        .join('\n');
      if (tableText) {
        chunks.push(tableText);
      }
    }
  }
  return chunks.join('\n').trim();
}

export function extractTextFromBaileysMessage(message: any): string {
  const unwrapped = unwrapBaileysMessageContent(message);
  if (!unwrapped || typeof unwrapped !== 'object') return '';

  const text =
    unwrapped.conversation ||
    unwrapped.extendedTextMessage?.text ||
    unwrapped.imageMessage?.caption ||
    unwrapped.videoMessage?.caption ||
    unwrapped.documentMessage?.caption ||
    unwrapped.buttonsResponseMessage?.selectedDisplayText ||
    unwrapped.listResponseMessage?.title ||
    unwrapped.templateButtonReplyMessage?.selectedDisplayText ||
    extractRichResponseText(unwrapped.richResponseMessage) ||
    extractRichResponseText(message?.richResponseMessage) ||
    '';

  return typeof text === 'string' ? text.trim() : '';
}

export function isPlaceholderMetaAiReply(text: string): boolean {
  const normalized = String(text || '').trim();
  if (!normalized) return true;
  if (/^(\.{1,6}|…+)$/.test(normalized)) return true;
  if (
    /^(thinking|memikirkan|sedang berpikir|sedang memproses|processing|generating|loading|mengetik|typing)(\.{0,5}|…)?$/i.test(
      normalized
    )
  ) {
    return true;
  }
  return false;
}

function pruneRecentPrompts(now = Date.now()) {
  for (const [k, exp] of recentMetaPrompts.entries()) {
    if (exp <= now) {
      recentMetaPrompts.delete(k);
    }
  }
  capMapSize(recentMetaPrompts, MAX_RECENT_PROMPTS);
}

function rememberPromptEcho(sessionId: string, text: string) {
  const clean = text.trim();
  if (!clean) return;
  const now = Date.now();
  pruneRecentPrompts(now);
  recentMetaPrompts.set(`${sessionId}::${clean}`, now + PROMPT_ECHO_TTL_MS);
}

export function hasMismatchedCustomerCode(text: string, expectedCustomerCode?: string): boolean {
  if (!expectedCustomerCode) return false;
  const matches = String(text || '').match(/\[?\bcustomer_(\d{4,6})\b\]?/gi);
  if (!matches || matches.length === 0) return false;
  const expectedLower = expectedCustomerCode.toLowerCase();
  const normalizedCodes = matches.map(m => m.replace(/[\[\]\s]/g, '').toLowerCase());
  return !normalizedCodes.includes(expectedLower);
}

export function stripCustomerCodeTags(rawText: string): string {
  return String(rawText || '')
    .replace(/^\s*\[?\bcustomer_\d{4,6}\b\]?\s*[:\-–—]?\s*/i, '')
    .replace(/\[?\bcustomer_\d{4,6}\b\]?\s*[:\-–—]?\s*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function cleanMetaAiReply(rawText: string): string {
  let text = stripCustomerCodeTags(String(rawText || '').trim());
  if (!text) return '';

  // Strip robotic AI assistant wrapper preambles if Meta AI adds a lead-in line
  const leadInPatterns = [
    /^(?:tentu|baik|oke|siap|nah|bisa banget|saran aku|kalau aku jadi kamu|coba balas gini)[!,.\s]*(?:(?:berikut|ini)(?:\s+adalah)?|(?:kamu|anda)\s+bisa\s+(?:balas|jawab|kirim|gunakan))?\s*(?:contoh|opsi|saran|draft|teks)?\s*(?:balasan(?:nya)?|jawaban(?:nya)?|respon(?:nya)?|kalimat(?:nya)?)(?:\s+[^\n:]{1,50})?\s*:\s*\n*/i,
    /^(?:berikut(?:\s+adalah)?|ini(?:\s+adalah)?)\s+(?:contoh|opsi|saran|draft|teks)?\s*(?:balasan(?:nya)?|jawaban(?:nya)?|respon(?:nya)?|kalimat(?:nya)?)(?:\s+[^\n:]{1,50})?\s*:\s*\n*/i,
    /^(?:contoh|saran|draft|opsi)?\s*(?:balasan(?:nya)?|jawaban(?:nya)?|respon(?:nya)?)(?:\s+(?:singkat|wa|whatsapp|ramah|sopan|terbaik))?\s*:\s*\n*/i,
    /^(?:kamu|anda)\s+bisa\s+(?:balas|jawab|kirim)\s+(?:seperti\s+ini|kayak\s+gini|dengan\s+kalimat\s+ini|gini)?\s*:\s*\n*/i
  ];
  for (const rx of leadInPatterns) {
    const stripped = text.replace(rx, '').trim();
    if (stripped.length >= 2) {
      text = stripped;
      break;
    }
  }

  // Strip surrounding quotation marks if the entire reply was wrapped in quotes
  if (
    (text.startsWith('"') && text.endsWith('"') && text.indexOf('"', 1) === text.length - 1) ||
    (text.startsWith('“') && text.endsWith('”')) ||
    (text.startsWith("'") && text.endsWith("'") && text.indexOf("'", 1) === text.length - 1)
  ) {
    const inner = text.slice(1, -1).trim();
    if (inner.length >= 2) text = inner;
  }

  // Convert Markdown double-asterisk bold (**x**) to WhatsApp single-asterisk bold (*x*)
  text = text.replace(/\*\*([^*\n]+)\*\*/g, '*$1*');

  return stripCustomerCodeTags(text);
}

export function reconcileCatalogImageLinksInReply(
  replyText: string,
  customerMessage: string,
  catalogProducts?: MetaAiCatalogProduct[]
): string {
  const baseReply = String(replyText || '').trim();
  if (!baseReply) return '';

  const withImages = (catalogProducts || [])
    .filter(
      (p): p is MetaAiCatalogProduct & { image_url: string } =>
        Boolean(p && typeof p.title === 'string' && p.title.trim() && typeof p.image_url === 'string' && /^https?:\/\//i.test(p.image_url.trim()))
    )
    .map(p => ({ ...p, title: p.title.trim(), image_url: p.image_url.trim() }));

  if (withImages.length === 0) return baseReply;

  const replyLower = baseReply.toLowerCase();
  const msgLower = String(customerMessage || '').toLowerCase();

  const ranked = withImages
    .map(p => {
      const titleLower = p.title.toLowerCase();
      const tokens = titleLower.split(/[^a-z0-9]+/i).filter(t => t.length >= 2);
      let score = 0;
      if (replyLower.includes(titleLower)) score += 12;
      if (msgLower.includes(titleLower)) score += 10;
      for (const t of tokens) {
        if (replyLower.includes(t)) score += 3;
        if (msgLower.includes(t)) score += 2;
      }
      return { product: p, score };
    })
    .sort((a, b) => b.score - a.score);

  const matched = ranked.filter(r => r.score > 0).map(r => r.product);
  const bestTargets = matched.length > 0 ? matched.slice(0, 3) : withImages.length === 1 ? [withImages[0]] : withImages.slice(0, 3);
  const primaryTarget = bestTargets[0];

  const placeholderRegex =
    /[\[(]\s*(?:tautan|link|url|foto|gambar)\s+(?:(?:gambar|foto|produk)\s+)?(?:tidak|belum)\s+(?:tersedia|ada|dapat\s+ditampilkan|bisa\s+ditampilkan|bisa\s+dikirim)[^\]\)]*[\])]|[\[(]\s*(?:link|tautan|url)\s*(?:gambar|foto|produk)?\s*[\])]|(?<=:\s*)(?:tautan|link|url|foto|gambar)\s+(?:tidak|belum)\s+(?:tersedia|ada)\b\.?/gi;

  const replacementText =
    matched.length > 1
      ? matched.slice(0, 3).map(p => `${p.title}: ${p.image_url}`).join('\n')
      : primaryTarget.image_url;

  let repaired = baseReply.replace(placeholderRegex, replacementText).replace(/[ \t]+\n/g, '\n').trim();

  const alreadyHasProductUrl = withImages.some(p => repaired.includes(p.image_url));
  const customerAskedForPhoto = /\b(foto|gambar|pict?|image|lihat|liat|penampakan|modelnya|contohnya)\b/i.test(
    customerMessage || ''
  );

  if (!alreadyHasProductUrl && customerAskedForPhoto) {
    const linksBlock =
      bestTargets.length === 1
        ? `Foto ${primaryTarget.title}: ${primaryTarget.image_url}`
        : bestTargets.map(p => `Foto ${p.title}: ${p.image_url}`).join('\n');
    repaired = `${repaired}\n\n${linksBlock}`.trim();
  }

  return repaired;
}

const PROMPT_LEAK_EXACT_PATTERNS: RegExp[] = [
  /\[ID Chat Terisolasi:\s*customer_\d{4,6}/i,
  /fokus HANYA menjawab chat customer_\d{4,6}/i,
  /JANGAN campur dengan pelanggan lain/i,
  /awali jawabanmu dengan \[?customer_\d{4,6}\]?/i,
  /Riwayat percakapan sebelumnya khusus (?:customer_\d{4,6}|pembeli ini)\s*:/i,
  /Aturan order,\s*checkout\s*&\s*verifikasi bayar\s*:/i,
  /Metode pembayaran tersedia di tokoku\s*:/i,
  /sertakan kode \[\[SEND_QRIS\]\] agar sistem/i,
  /verifikasi dan akhiri balasanmu dengan tag \[\[ORDER_PAID\]\]/i,
  /Status keranjang customer_\d{4,6}\b/i
];

const PROMPT_LEAK_SCAFFOLD_MARKERS: RegExp[] = [
  /\bChat dari customer_\d{4,6}\s*:/i,
  /\bKonteks\s*:\s*(?:kalau ada yang tanya|aku punya|di tempatku ada|biasanya kalau pembeli|aku udah biasa|catatan jawaban|patokan balasan|aku punya daftar produk|terus ini katalog|daftar produk,\s*harga,\s*sama foto|list jualan di tempatku|aku lagi nawarin|cara jawab dan gaya|catatan karakter CS|nih gambaran karakter)/i,
  /(?:kalau customernya minta foto atau gambar produk,\s*langsung tulis dan salin persis|jangan pernah menulis tautan tidak tersedia|langsung selipin link foto https dari listku di atas)/i,
  /(?:tolong bantu aku jawab dong|aku cocok jawab apa ya\?|bantu bikinin kata-kata balesannya dong|kasih ide dong aku enaknya jawab apa)/i,
  /(?:langsung kasih teks jawabannya aja ya biar tinggal kukirim|tulis satu kalimat siap kirim aja ya,\s*nggak usah pakai pembuka|kasih satu versi aja yang siap langsung kukirim ke WA-nya)/i,
  /\blist jualan di tempatku lengkap sama harga dan link fotonya begini\s*:/i,
  /\bjika ada yang nanya "[^"]+"\s+aku balas\s+"/i
];

function normalizePromptCompareText(text: string): string {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[“”"'`]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function isInternalPromptLeakText(text: string): boolean {
  const raw = String(text || '').trim();
  if (!raw) return false;

  for (const rx of PROMPT_LEAK_EXACT_PATTERNS) {
    if (rx.test(raw)) return true;
  }

  let scaffoldHits = 0;
  for (const rx of PROMPT_LEAK_SCAFFOLD_MARKERS) {
    if (rx.test(raw)) {
      scaffoldHits++;
      if (scaffoldHits >= 2) return true;
    }
  }

  // Catch truncated prompt echoes that still open with internal context scaffolding
  if (
    /^\s*(?:\[ID Chat Terisolasi:|Konteks:\s*(?:kalau ada yang tanya|aku punya|di tempatku ada|catatan|list jualan)|Chat dari customer_\d{4,6}:)/i.test(
      raw
    )
  ) {
    return true;
  }

  return false;
}

function hasHighOverlapWithSentPrompt(candidateText: string, sentPrompt: string): boolean {
  const normCand = normalizePromptCompareText(candidateText);
  const normSent = normalizePromptCompareText(sentPrompt);
  if (!normCand || !normSent) return false;
  if (normCand === normSent) return true;

  // Prefix / substring containment checks for truncated or wrapped echoes
  if (normSent.length >= 48) {
    const sentHead = normSent.slice(0, Math.min(80, normSent.length));
    if (normCand.includes(sentHead)) return true;
    const bodyIdx = normSent.indexOf('konteks:');
    if (bodyIdx >= 0 && normSent.length - bodyIdx >= 48) {
      const ctxSlice = normSent.slice(bodyIdx, Math.min(normSent.length, bodyIdx + 72));
      if (normCand.includes(ctxSlice)) return true;
    }
  }
  if (normCand.length >= 56 && normSent.includes(normCand)) {
    return true;
  }

  // Significant token overlap on long suspicious responses (>= 80 chars)
  if (normCand.length >= 80 && normSent.length >= 80) {
    const sentTokens = new Set(normSent.split(/[^a-z0-9_]+/).filter(t => t.length >= 4));
    const candTokens = normCand.split(/[^a-z0-9_]+/).filter(t => t.length >= 4);
    if (sentTokens.size >= 8 && candTokens.length >= 8) {
      let overlap = 0;
      for (const tok of candTokens) {
        if (sentTokens.has(tok)) overlap++;
      }
      if (overlap / candTokens.length >= 0.72) {
        return true;
      }
    }
  }

  return false;
}

function isEchoOfPrompt(sessionId: string, candidateText: string, waiter?: PendingWaiter): boolean {
  const clean = candidateText.trim();
  if (!clean) return true;
  if (isInternalPromptLeakText(clean)) return true;
  if (waiter && hasHighOverlapWithSentPrompt(clean, waiter.promptSent)) return true;
  const key = `${sessionId}::${clean}`;
  const exp = recentMetaPrompts.get(key);
  if (exp && exp > Date.now()) return true;

  const prefix = `${sessionId}::`;
  const now = Date.now();
  for (const [storedKey, storedExp] of recentMetaPrompts.entries()) {
    if (storedExp <= now) continue;
    if (!storedKey.startsWith(prefix)) continue;
    const storedPrompt = storedKey.slice(prefix.length);
    if (hasHighOverlapWithSentPrompt(clean, storedPrompt)) {
      return true;
    }
  }
  return false;
}

function finalizeWaiter(
  sessionId: string,
  result: { ok: boolean; text?: string; reason?: string }
) {
  const waiter = activeWaiters.get(sessionId);
  if (!waiter || waiter.settled) return;
  waiter.settled = true;
  clearTimeout(waiter.hardTimer);
  if (waiter.settleTimer) {
    clearTimeout(waiter.settleTimer);
    waiter.settleTimer = null;
  }
  if (waiter.retryTimer) {
    clearTimeout(waiter.retryTimer);
    waiter.retryTimer = null;
  }
  activeWaiters.delete(sessionId);
  waiter.resolve(result);
}

function ingestMetaAiCandidateText(
  sessionId: string,
  candidateText: string,
  sourceJid?: string | null,
  isFinalEdit = false
) {
  const waiter = activeWaiters.get(sessionId);
  if (!waiter || waiter.settled) return;

  const trimmed = String(candidateText || '').trim();
  if (!trimmed) return;
  if (isEchoOfPrompt(sessionId, trimmed, waiter)) {
    if (isInternalPromptLeakText(trimmed)) {
      recordAiAuditEvent({
        level: 'WARN',
        stage: 'meta_ai_firewall',
        session_id: sessionId,
        customer_code: waiter.customerCode,
        error_code: 'PROMPT_ECHO_BLOCKED',
        reason: 'Firewall memblokir echo prompt internal Meta AI sebelum diproses.'
      });
    }
    return;
  }
  if (isPlaceholderMetaAiReply(trimmed)) return;

  // Reject cross-customer leaked chunk when a specific customer_XXXXX code tag belongs to someone else
  if (waiter.customerCode && hasMismatchedCustomerCode(trimmed, waiter.customerCode)) {
    console.warn(`[Meta AI Isolation] Mengabaikan respon silang (${waiter.customerCode} diharapkan) agar jawaban antar pelanggan tidak tertukar.`);
    return;
  }

  waiter.hasSignal = true;
  if (waiter.retryTimer) {
    clearTimeout(waiter.retryTimer);
    waiter.retryTimer = null;
  }

  if (sourceJid) {
    rememberSessionMetaAiLid(sessionId, sourceJid, true);
  }

  waiter.latestText = trimmed;
  if (waiter.settleTimer) {
    clearTimeout(waiter.settleTimer);
  }
  const waitSettleMs = isFinalEdit ? FAST_FINAL_SETTLE_MS : SETTLE_DEBOUNCE_MS;
  waiter.settleTimer = setTimeout(() => {
    const current = activeWaiters.get(sessionId);
    if (!current || current.settled) return;
    if (current.latestText) {
      finalizeWaiter(sessionId, { ok: true, text: current.latestText });
    }
  }, waitSettleMs);
}

export function isMetaAiRawMessageNode(sessionId: string, node: any): boolean {
  if (!node || typeof node !== 'object' || node.tag !== 'message') return false;
  const from = node.attrs?.from;
  const participant = node.attrs?.participant;
  const recipient = node.attrs?.recipient;
  const senderPn = node.attrs?.sender_pn;
  const senderLid = node.attrs?.sender_lid;

  if (
    isSessionMetaAiJid(sessionId, from) ||
    isSessionMetaAiJid(sessionId, participant) ||
    isSessionMetaAiJid(sessionId, recipient) ||
    isSessionMetaAiJid(sessionId, senderPn) ||
    isSessionMetaAiJid(sessionId, senderLid)
  ) {
    return true;
  }
  if (typeof from === 'string' && from.endsWith('@bot')) return true;

  const encNodes = getBinaryNodeChildren(node, 'enc');
  if (encNodes.some((enc: any) => enc?.attrs?.type === 'msmsg')) {
    return true;
  }
  return false;
}

export async function handleRawMetaAiMessageNode(
  sessionId: string,
  sock: any,
  node: any
): Promise<boolean> {
  if (!isMetaAiRawMessageNode(sessionId, node)) return false;

  const from = String(node.attrs?.from || '');
  const participant = node.attrs?.participant ? String(node.attrs.participant) : undefined;
  const msgId = String(node.attrs?.id || '');
  const rawSender = participant || from;
  const normSender = safeNormalizeJid(rawSender);

  const metaNode = getBinaryNodeChild(node, 'meta');
  const botNode = getBinaryNodeChild(node, 'bot');
  const unavailableNode = getBinaryNodeChild(node, 'unavailable');

  const targetId = String(metaNode?.attrs?.target_id || metaNode?.attrs?.['target-id'] || '').trim();
  const targetSenderRaw = String(
    metaNode?.attrs?.target_sender_jid || metaNode?.attrs?.target_sender || ''
  ).trim();
  const editType = String(botNode?.attrs?.edit || node.attrs?.edit || '').trim().toLowerCase();
  const editTargetId = String(
    botNode?.attrs?.edit_target_id || botNode?.attrs?.['edit-target-id'] || ''
  ).trim();

  const children = Array.isArray(node.content) ? node.content : [];
  const cryptoNodes = children.filter(
    (c: any) => c && (c.tag === 'enc' || c.tag === 'plaintext') && c.content instanceof Uint8Array
  );

  let decryptedProtoMsg: proto.IMessage | null = null;
  let sawMsmsg = false;
  let lastSignalDecryptError: any = null;

  const ownIdRaw = String(sock?.authState?.creds?.me?.id || sock?.user?.id || '').trim();
  const ownLidRaw = String(sock?.authState?.creds?.me?.lid || sock?.user?.lid || '').trim();
  const origSenders = [
    safeNormalizeJid(targetSenderRaw),
    targetSenderRaw,
    safeNormalizeJid(ownLidRaw),
    safeNormalizeJid(ownIdRaw),
    ownLidRaw,
    ownIdRaw
  ].filter(Boolean);

  const primaryDecryptId =
    (editType === 'inner' || editType === 'last') && editTargetId ? editTargetId : msgId;
  const modSenders = [normSender, rawSender].filter(Boolean);

  const secretEntryCandidates: PendingBotSecretEntry[] = [];
  const seenSecrets = new Set<Buffer>();
  const pushSecretEntry = (entry?: PendingBotSecretEntry) => {
    if (entry?.messageSecret && !seenSecrets.has(entry.messageSecret)) {
      seenSecrets.add(entry.messageSecret);
      secretEntryCandidates.push(entry);
    }
  };

  if (targetId) {
    pushSecretEntry(pendingBotSecrets.get(`${sessionId}::${targetId}`));
  }
  pushSecretEntry(sessionLatestBotSecret.get(sessionId));

  // Cap fallback secret scans to at most 3 total secrets to prevent HKDF/AES CPU spikes
  if (secretEntryCandidates.length < 3) {
    const sessionEntries = Array.from(pendingBotSecrets.values()).filter((e) => e.sessionId === sessionId);
    for (let idx = sessionEntries.length - 1; idx >= 0 && secretEntryCandidates.length < 3; idx--) {
      pushSecretEntry(sessionEntries[idx]);
    }
  }

  const secretCandidates = secretEntryCandidates.map((e) => e.messageSecret);
  const msgIdCandidates = [
    targetId,
    ...secretEntryCandidates.map((e) => e.msgId),
    primaryDecryptId,
    msgId,
    editTargetId
  ].filter(Boolean);

  for (const cNode of cryptoNodes) {
    const e2eType = cNode.tag === 'plaintext' ? 'plaintext' : String(cNode.attrs?.type || '');
    const contentBytes = cNode.content as Uint8Array;

    try {
      if (e2eType === 'msmsg') {
        sawMsmsg = true;
        const msMsg = proto.MessageSecretMessage.decode(contentBytes);
        if (msMsg?.encPayload?.length && msMsg?.encIv?.length) {
          const hint = sessionDecryptHint.get(sessionId) || null;
          for (const secretEntry of secretEntryCandidates) {
            const pairedMsgIds = [
              targetId,
              secretEntry.msgId,
              primaryDecryptId,
              msgId,
              editTargetId
            ].filter(Boolean);
            const decoded = decryptMsmsgCiphertext({
              messageSecret: secretEntry.messageSecret,
              encPayload: msMsg.encPayload,
              encIv: msMsg.encIv,
              msgIds: pairedMsgIds.length > 0 ? pairedMsgIds : msgIdCandidates,
              origSenders,
              modificationSenders: modSenders,
              hint,
              onMatch: (meta) => {
                sessionDecryptHint.set(sessionId, meta);
                capMapSize(sessionDecryptHint, MAX_TRACKED_SESSIONS);
              }
            });
            if (decoded) {
              decryptedProtoMsg = decoded;
              break;
            }
          }
        }
      } else if (e2eType === 'plaintext') {
        decryptedProtoMsg = proto.Message.decode(contentBytes);
      } else if ((e2eType === 'msg' || e2eType === 'pkmsg') && sock?.signalRepository?.decryptMessage) {
        try {
          const plainBuf = await withSignalDecryptScope<Uint8Array>(() =>
            sock.signalRepository.decryptMessage({
              jid: rawSender,
              type: e2eType,
              ciphertext: contentBytes
            })
          );
          decryptedProtoMsg = proto.Message.decode(unpadRandomMax16(plainBuf));
        } catch (signalErr: any) {
          lastSignalDecryptError = signalErr;
          if (isRecoverableSignalMacError(signalErr)) {
            for (const cacheKey of Array.from(botSignalReadyCache.keys())) {
              if (cacheKey.startsWith(`${sessionId}::`)) {
                botSignalReadyCache.delete(cacheKey);
              }
            }
            if (
              shouldResetCorruptedSignalSession(signalErr) &&
              typeof sock?.signalRepository?.deleteSession === 'function'
            ) {
              await sock.signalRepository.deleteSession([rawSender]).catch(() => {});
            }
            recordAiAuditEvent({
              level: 'WARN',
              stage: 'meta_ai_stanza',
              session_id: sessionId,
              error_code: 'SIGNAL_BAD_MAC_RESET',
              reason: `Dekripsi Signal ${e2eType} dari ${rawSender} gagal (${signalErr?.message || signalErr}); cache sesi Meta AI di-reset.`
            });
          }
        }
      }
    } catch {
      // Continue checking remaining nodes
    }

    if (decryptedProtoMsg) break;
  }

  // Request retry when @bot Signal decryption failed; otherwise send clean ACK so WhatsApp keeps streaming
  let sentRetry = false;
  if (!decryptedProtoMsg && lastSignalDecryptError && !unavailableNode && !sawMsmsg && typeof sock?.sendRetryRequest === 'function') {
    try {
      await sock.sendRetryRequest(node, true);
      sentRetry = true;
    } catch {
      sentRetry = false;
    }
  }
  if (!sentRetry && typeof sock?.sendNode === 'function') {
    try {
      const ackNode = buildAckStanza(node, undefined, sock?.authState?.creds?.me?.id);
      await sock.sendNode(ackNode);
    } catch {
      // Non-fatal ACK send failure
    }
  }

  if (decryptedProtoMsg) {
    const isDeviceSentReflection = Boolean(decryptedProtoMsg.deviceSentMessage);
    const isSelfSender =
      node.attrs?.fromMe === 'true' ||
      isDeviceSentReflection ||
      (ownIdRaw ? areJidsSameUser(from, ownIdRaw) : false) ||
      (ownLidRaw ? areJidsSameUser(from, ownLidRaw) : false) ||
      (participant && ownIdRaw ? areJidsSameUser(participant, ownIdRaw) : false) ||
      (participant && ownLidRaw ? areJidsSameUser(participant, ownLidRaw) : false);
    const syntheticMsg = {
      key: {
        remoteJid: from,
        remoteJidAlt: node.attrs?.sender_pn || node.attrs?.sender_lid || undefined,
        fromMe: isSelfSender,
        id: msgId,
        participant
      },
      messageTimestamp: node.attrs?.t ? Number(node.attrs.t) : Math.floor(Date.now() / 1000),
      message: decryptedProtoMsg
    };
    handleMetaAiIncomingUpsert(sessionId, syntheticMsg, editType === 'last');
    return true;
  }

  if (unavailableNode) {
    const unavailableType = String(unavailableNode.attrs?.type || 'unavailable');
    console.warn(`[Meta AI] Session=${sessionId} menerima stanza unavailable (${unavailableType}) dari ${from}`);
    const errMsg =
      unavailableType === 'bot_unavailable_fanout'
        ? 'Akun WhatsApp ini menerima status bot_unavailable_fanout dari Meta AI (fitur Meta AI belum diaktifkan/belum pernah chat di HP).'
        : `Meta AI mengembalikan status tidak tersedia (${unavailableType}).`;
    sessionLastMetaError.set(sessionId, { code: unavailableType, message: errMsg, at: Date.now() });
    capMapSize(sessionLastMetaError, MAX_TRACKED_SESSIONS);
    recordAiAuditEvent({
      level: 'ERROR',
      stage: 'meta_ai_stanza',
      session_id: sessionId,
      error_code: unavailableType,
      reason: errMsg
    });
    const waiter = activeWaiters.get(sessionId);
    if (waiter && !waiter.settled && unavailableType === 'bot_unavailable_fanout') {
      waiter.lastAckError = errMsg;
      sessionPreferredMetaJid.delete(sessionId);
      setSessionMetaCooldown(sessionId, 10_000, waiter.lastAckError);
    }
    return true;
  }

  if (sawMsmsg) {
    console.warn(`[Meta AI] Session=${sessionId} menerima msmsg dari ${from} (msgId=${msgId}, targetId=${targetId || '-'}) namun gagal didekripsi.`);
    recordAiAuditEvent({
      level: 'ERROR',
      stage: 'msmsg_decrypt',
      session_id: sessionId,
      error_code: 'MSMSG_DECRYPT_FAILED',
      reason: `Menerima payload msmsg terenkripsi dari ${from} (msgId=${msgId}) namun gagal didekripsi.`
    });
  }

  return true;
}

export function handleMetaAiMessageAckNode(sessionId: string, ackNode: any) {
  const ackId = String(ackNode?.attrs?.id || '').trim();
  const ackErr = ackNode?.attrs?.error ? String(ackNode.attrs.error).trim() : '';
  if (!ackId || !ackErr) return;

  const waiter = activeWaiters.get(sessionId);
  if (!waiter || waiter.settled || !waiter.pendingAckMsgIds.has(ackId)) return;

  const errDesc =
    ackErr === '463'
      ? 'WhatsApp menolak pengiriman ke Meta AI (error 463: pembatasan kontak/token privasi).'
      : ackErr === '479'
        ? 'Stanza Meta AI ditolak server WhatsApp (error 479: SMAX_INVALID).'
        : ackErr === '488'
          ? 'Stanza Meta AI ditolak server WhatsApp (error 488: NackUnrecognizedStanza / fitur atau format bot belum didukung pada sesi ini).'
          : ackErr === '429'
            ? 'Meta AI membatasi frekuensi pesan sementara (error 429).'
            : `Server WhatsApp mengembalikan error ACK ${ackErr} saat mengirim ke Meta AI.`;

  waiter.lastAckError = errDesc;
  sessionLastMetaError.set(sessionId, { code: `ACK_${ackErr}`, message: errDesc, at: Date.now() });
  capMapSize(sessionLastMetaError, MAX_TRACKED_SESSIONS);
  recordAiAuditEvent({
    level: 'ERROR',
    stage: 'meta_ai_ack',
    session_id: sessionId,
    customer_code: waiter.customerCode,
    error_code: `ACK_${ackErr}`,
    reason: errDesc
  });

  if (ackErr === '463' || ackErr === '429') {
    console.log(`[Meta AI Routing] Session=${sessionId} msgId=${ackId} ack_code=${ackErr}; membersihkan cache jalur & beralih.`);
    sessionPreferredMetaJid.delete(sessionId);
    for (const cacheKey of Array.from(botSignalReadyCache.keys())) {
      if (cacheKey.startsWith(`${sessionId}::`)) {
        botSignalReadyCache.delete(cacheKey);
      }
    }
    if (ackErr === '429') {
      setSessionMetaCooldown(sessionId, 15_000, errDesc);
    }
    if (waiter.fallbackAttemptFn) {
      const runFallback = waiter.fallbackAttemptFn;
      void runFallback()
        .then((attempted) => {
          const current = activeWaiters.get(sessionId);
          if (!attempted && current && !current.settled && !current.hasSignal && !current.latestText) {
            finalizeWaiter(sessionId, { ok: false, reason: errDesc });
          }
        })
        .catch(() => {
          const current = activeWaiters.get(sessionId);
          if (current && !current.settled && !current.hasSignal && !current.latestText) {
            finalizeWaiter(sessionId, { ok: false, reason: errDesc });
          }
        });
      return;
    }
    finalizeWaiter(sessionId, { ok: false, reason: errDesc });
    return;
  }

  if (ackErr === '488' || ackErr === '479') {
    const rejectedTargetJid = waiter.msgIdToTargetJid.get(ackId);
    if (rejectedTargetJid) {
      markSessionRejectedBotJid(sessionId, rejectedTargetJid);
    }
    sessionPreferredMetaJid.delete(sessionId);
    for (const cacheKey of Array.from(botSignalReadyCache.keys())) {
      if (cacheKey.startsWith(`${sessionId}::`)) {
        botSignalReadyCache.delete(cacheKey);
      }
    }
  }

  if (waiter.fallbackAttemptFn) {
    if (waiter.retryTimer) {
      clearTimeout(waiter.retryTimer);
      waiter.retryTimer = null;
    }
    const runFallback = waiter.fallbackAttemptFn;
    console.log(`[Meta AI Routing] Session=${sessionId} msgId=${ackId} ack_code=${ackErr}; mencoba jalur kandidat berikutnya atau fallback.`);
    void runFallback()
      .then((attempted) => {
        const current = activeWaiters.get(sessionId);
        if (!attempted && current && !current.settled && !current.hasSignal && !current.latestText) {
          finalizeWaiter(sessionId, { ok: false, reason: errDesc });
        }
      })
      .catch(() => {
        const current = activeWaiters.get(sessionId);
        if (current && !current.settled && !current.hasSignal && !current.latestText) {
          finalizeWaiter(sessionId, { ok: false, reason: errDesc });
        }
      });
    return;
  }

  console.log(`[Meta AI Routing] Session=${sessionId} msgId=${ackId} ack_code=${ackErr}; beralih ke balasan fallback.`);
  finalizeWaiter(sessionId, { ok: false, reason: errDesc });
}

/**
 * Intercepts raw `CB:message` (msmsg / @bot) and `CB:ack,class:message` before Baileys v7 drops msmsg with NACK 495
 * or throws "Unknown message type" on `@bot`. Safe & idempotent per socket instance.
 */
export function attachMetaAiRawSocketHandlers(sock: any, sessionId: string): () => void {
  const ws = sock?.ws;
  if (!ws || typeof ws.emit !== 'function') {
    return () => {};
  }

  const existingState = wrappedSockets.get(ws);
  if (existingState) {
    existingState.sessionId = sessionId;
    existingState.socket = sock;
    existingState.active = true;
    return () => {
      existingState.active = false;
      existingState.socket = null;
    };
  }

  const state = { active: true, sessionId, socket: sock };
  wrappedSockets.set(ws, state);

  const origEmit = ws.emit.bind(ws);
  ws.emit = function (event: string | symbol, ...args: any[]) {
    if (state.active && state.socket) {
      if (event === 'CB:message' && args[0]) {
        const node = args[0];
        if (isMetaAiRawMessageNode(state.sessionId, node)) {
          void handleRawMetaAiMessageNode(state.sessionId, state.socket, node).catch((err) => {
            console.warn('[Meta AI Raw Message Handler Error]', err?.message || err);
          });
          // Skip Baileys default handleMessage for @bot / msmsg so it does not send NACK 495/500
          return true;
        }
      } else if (
        (event === 'CB:ack,class:message' ||
          (event === 'CB:ack' && args[0]?.attrs?.class === 'message')) &&
        args[0]
      ) {
        try {
          handleMetaAiMessageAckNode(state.sessionId, args[0]);
        } catch {
          // Non-fatal
        }
      }
    }
    return origEmit(event, ...args);
  };

  return () => {
    state.active = false;
    state.socket = null;
  };
}

export function handleMetaAiIncomingUpsert(sessionId: string, msg: any, isFinalEdit = false): boolean {
  const candidateJids = [
    msg?.key?.remoteJid,
    msg?.key?.remoteJidAlt,
    msg?.key?.participant,
    msg?.message?.deviceSentMessage?.destinationJid
  ].filter(Boolean) as string[];

  const isRichBotMsg = Boolean(
    activeWaiters.has(sessionId) &&
      (msg?.message?.richResponseMessage ||
        msg?.message?.editedMessage?.message?.richResponseMessage ||
        msg?.message?.protocolMessage?.editedMessage?.richResponseMessage)
  );
  const matched = isRichBotMsg || candidateJids.some((j) => isSessionMetaAiJid(sessionId, j));
  if (!matched) return false;

  // Remember learned @lid or effective JID when WA pairs Meta AI with a LID
  for (const j of candidateJids) {
    if (j.endsWith('@lid') || isMetaAiJid(j) || isRichBotMsg) {
      rememberSessionMetaAiLid(sessionId, j, !msg?.key?.fromMe);
    }
  }

  // Always ignore our own outgoing prompt upserts
  if (msg?.key?.fromMe) {
    const ownText = extractTextFromBaileysMessage(msg?.message);
    if (ownText) rememberPromptEcho(sessionId, ownText);
    return true;
  }

  const primaryJid = msg?.key?.remoteJid || msg?.key?.remoteJidAlt || candidateJids[0];
  const text = extractTextFromBaileysMessage(msg?.message);
  if (text) {
    ingestMetaAiCandidateText(sessionId, text, primaryJid, isFinalEdit);
  } else {
    const waiter = activeWaiters.get(sessionId);
    if (waiter && !waiter.settled) {
      waiter.hasSignal = true;
    }
  }
  return true;
}

export function handleMetaAiIncomingUpdate(sessionId: string, updates: any[]): number {
  if (!Array.isArray(updates) || updates.length === 0) return 0;
  let handled = 0;

  for (const item of updates) {
    const candidateJids = [
      item?.key?.remoteJid,
      item?.key?.remoteJidAlt,
      item?.key?.participant
    ].filter(Boolean) as string[];

    if (!candidateJids.some((j) => isSessionMetaAiJid(sessionId, j))) continue;
    handled++;

    if (item?.key?.fromMe) continue;

    const primaryJid = item?.key?.remoteJid || item?.key?.remoteJidAlt || candidateJids[0];
    const candidateMsg =
      item?.update?.message ||
      item?.update?.messageStubParameters?.[0] ||
      item?.message ||
      null;

    if (candidateMsg && typeof candidateMsg === 'object') {
      const text = extractTextFromBaileysMessage(candidateMsg);
      if (text) {
        ingestMetaAiCandidateText(sessionId, text, primaryJid);
      }
    } else if (typeof candidateMsg === 'string') {
      ingestMetaAiCandidateText(sessionId, candidateMsg, primaryJid);
    }
  }

  return handled;
}

export function clearMetaAiSession(sessionId: string) {
  if (!sessionId) return;
  finalizeWaiter(sessionId, {
    ok: false,
    reason: 'Sesi WhatsApp terputus saat menunggu balasan Meta AI.'
  });
  sessionQueueDepth.delete(sessionId);
  sessionQueues.delete(sessionId);
  sessionMetaAiLids.delete(sessionId);
  sessionPreferredMetaJid.delete(sessionId);
  sessionBotEntries.delete(sessionId);
  sessionBotPersonas.delete(sessionId);
  sessionLatestBotSecret.delete(sessionId);
  sessionLastPromptAt.delete(sessionId);
  sessionPromptTimestamps.delete(sessionId);
  sessionCooldowns.delete(sessionId);
  sessionRejectedBotJids.delete(sessionId);
  sessionLastMetaError.delete(sessionId);
  sessionDecryptHint.delete(sessionId);
  sessionConsecutiveSends.delete(sessionId);
  const now = Date.now();
  for (const [cacheKey, cacheVal] of responseCache.entries()) {
    if (!cacheVal || cacheVal.expiresAt <= now) {
      responseCache.delete(cacheKey);
    }
  }
  for (const key of Array.from(pendingBotSecrets.keys())) {
    if (key.startsWith(`${sessionId}::`)) {
      pendingBotSecrets.delete(key);
    }
  }
  for (const key of Array.from(recentMetaPrompts.keys())) {
    if (key.startsWith(`${sessionId}::`)) {
      recentMetaPrompts.delete(key);
    }
  }
  for (const key of Array.from(senderQueryHistory.keys())) {
    if (key.startsWith(`${sessionId}::`)) {
      senderQueryHistory.delete(key);
    }
  }
  for (const key of Array.from(botSignalReadyCache.keys())) {
    if (key.startsWith(`${sessionId}::`)) {
      botSignalReadyCache.delete(key);
    }
  }
}

function setSessionMetaCooldown(sessionId: string, durationMs: number, reason: string) {
  if (!sessionId) return;
  const now = Date.now();
  const prev = sessionCooldowns.get(sessionId);
  sessionCooldowns.set(sessionId, {
    until: Math.max(prev?.until || 0, now + durationMs),
    consecutiveTimeouts: prev?.consecutiveTimeouts || 0,
    reason
  });
  capMapSize(sessionCooldowns, MAX_TRACKED_SESSIONS);
}

function getActiveSessionCooldown(sessionId: string): SessionCooldownEntry | null {
  const entry = sessionCooldowns.get(sessionId);
  if (!entry) return null;
  if (entry.until <= Date.now()) {
    sessionCooldowns.delete(sessionId);
    return null;
  }
  return entry;
}

async function waitAndRecordSessionRateWindow(sessionId: string): Promise<{ allowed: boolean; reason?: string }> {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  let timestamps = (sessionPromptTimestamps.get(sessionId) || []).filter(t => t > oneHourAgo);

  if (timestamps.length >= MAX_PROMPTS_PER_HOUR) {
    sessionPromptTimestamps.set(sessionId, timestamps);
    return {
      allowed: false,
      reason: `Batas aman per jam tercapai (${timestamps.length}/${MAX_PROMPTS_PER_HOUR}) untuk mencegah pembatasan akun WhatsApp.`
    };
  }

  let now = Date.now();
  let inLastMin = timestamps.filter(t => t > now - 60_000);
  if (inLastMin.length >= MAX_PROMPTS_PER_MIN) {
    const oldestInMin = Math.min(...inLastMin);
    const waitMs = Math.min(62_000, Math.max(1500, oldestInMin + 60_500 - now));
    console.log(`[Meta AI Queue] Antrean rapi ${sessionId}: menunggu ${(waitMs / 1000).toFixed(1)}d agar aman dari deteksi spam Meta.`);
    await new Promise((r) => setTimeout(r, waitMs));
    now = Date.now();
    timestamps = timestamps.filter(t => t > now - 60 * 60 * 1000);
  }

  timestamps.push(now);
  sessionPromptTimestamps.set(sessionId, timestamps);
  capMapSize(sessionPromptTimestamps, MAX_TRACKED_SESSIONS);
  return { allowed: true };
}

function checkAndRecordSenderBurst(sessionId: string, senderPhone: string, now = Date.now()): boolean {
  const cleanPhone = String(senderPhone || '').replace(/\D/g, '');
  if (!cleanPhone || cleanPhone === '628999000111') return true;
  const key = `${sessionId}::${cleanPhone}`;
  const cutoff = now - SENDER_BURST_WINDOW_MS;
  const recent = (senderQueryHistory.get(key) || []).filter(t => t > cutoff);
  if (recent.length >= SENDER_BURST_MAX) {
    senderQueryHistory.set(key, recent);
    return false;
  }
  recent.push(now);
  senderQueryHistory.set(key, recent);

  if (senderQueryHistory.size > MAX_SENDER_HISTORY) {
    for (const [k, arr] of senderQueryHistory.entries()) {
      if (!arr.some(t => t > cutoff)) senderQueryHistory.delete(k);
    }
    capMapSize(senderQueryHistory, MAX_SENDER_HISTORY);
  }
  return true;
}

function buildResponseCacheKey(
  userId: string | undefined,
  instruction: string,
  messageBody: string,
  autoReplyRules?: MetaAiRuleHint[],
  catalogShopName?: string,
  catalogProducts?: MetaAiCatalogProduct[]
): string {
  const normMsg = messageBody.trim().toLowerCase().replace(/\s+/g, ' ');
  const rulesDigest = Array.isArray(autoReplyRules) && autoReplyRules.length > 0
    ? autoReplyRules.map((r) => `${r.keyword}=${r.response_text}`).join('|')
    : '';
  const catalogDigest = Array.isArray(catalogProducts) && catalogProducts.length > 0
    ? `${catalogShopName || ''}|${catalogProducts
        .map((p) => `${p.title}:${p.price}:${p.description || ''}:${p.image_url || ''}`)
        .join('|')}`
    : '';
  const ctxHash = crypto
    .createHash('sha1')
    .update(`${userId || 'global'}::${instruction.trim()}::${rulesDigest}::${catalogDigest}`)
    .digest('hex')
    .slice(0, 12);
  return `${ctxHash}::${normMsg}`;
}

function getCachedMetaResponse(key: string): string | null {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now() || isInternalPromptLeakText(entry.replyText)) {
    responseCache.delete(key);
    return null;
  }
  return entry.replyText;
}

function storeCachedMetaResponse(key: string, replyText: string) {
  if (!replyText || isInternalPromptLeakText(replyText)) return;
  const now = Date.now();
  for (const [k, v] of responseCache.entries()) {
    if (v.expiresAt <= now) responseCache.delete(k);
  }
  responseCache.set(key, { replyText, expiresAt: now + RESPONSE_CACHE_TTL_MS });
  capMapSize(responseCache, MAX_RESPONSE_CACHE);
}

async function enqueueSessionTask<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
  const currentDepth = sessionQueueDepth.get(sessionId) || 0;
  if (currentDepth >= MAX_QUEUE_DEPTH) {
    throw new Error('Antrean Meta AI untuk sesi ini penuh. Silakan coba sesaat lagi.');
  }

  sessionQueueDepth.set(sessionId, currentDepth + 1);
  const previous = sessionQueues.get(sessionId) || Promise.resolve();

  const currentRun = previous
    .catch(() => undefined)
    .then(() => task());

  const chainHandle = currentRun.finally(() => {
    const remaining = (sessionQueueDepth.get(sessionId) || 1) - 1;
    if (remaining <= 0) {
      sessionQueueDepth.delete(sessionId);
      if (sessionQueues.get(sessionId) === chainHandle) {
        sessionQueues.delete(sessionId);
      }
    } else {
      sessionQueueDepth.set(sessionId, remaining);
    }
  });

  sessionQueues.set(sessionId, chainHandle);
  return currentRun;
}

function pickRandom<T>(items: readonly T[]): T {
  return items[crypto.randomInt(0, items.length)];
}

function compactInstructionForHumanChat(rawInstruction: string): string {
  return rawInstruction
    .replace(/\[[^\]]{1,40}\]\s*[:\-]?/g, '')
    .replace(/\{nama\}/gi, 'kak')
    .replace(/\{pesan\}/gi, 'pertanyaannya')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 550);
}

function summarizeRulesNaturally(
  rules: MetaAiRuleHint[] | undefined,
  userMessage: string
): string {
  if (!Array.isArray(rules) || rules.length === 0) return '';
  const msgWords = new Set(
    userMessage
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((w) => w.length >= 3)
  );

  const valid = rules
    .filter((r) => r && typeof r.keyword === 'string' && typeof r.response_text === 'string')
    .map((r) => {
      const kw = r.keyword.trim().slice(0, 50);
      const resp = r.response_text
        .replace(/\{nama\}/gi, 'kak')
        .replace(/\{pesan\}/gi, 'pertanyaannya')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120);
      const score = kw
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .filter((w) => w.length >= 3 && msgWords.has(w)).length;
      return { kw, resp, score };
    })
    .filter((r) => r.kw.length > 0 && r.resp.length > 0);

  if (valid.length === 0) return '';
  valid.sort((a, b) => b.score - a.score);
  const picked = valid.slice(0, 5);

  const pairJoiners = [
    (k: string, v: string) => `kalau tanya soal "${k}" biasanya kujawab "${v}"`,
    (k: string, v: string) => `misal bahas "${k}" jawabanku "${v}"`,
    (k: string, v: string) => `jika ada yang nanya "${k}" aku balas "${v}"`,
    (k: string, v: string) => `soal "${k}" patokannya "${v}"`
  ];
  const formatter = pickRandom(pairJoiners);
  const body = picked.map((r) => formatter(r.kw, r.resp)).join('; ');
  return body.slice(0, 420);
}

const HUMAN_OPENERS = [
  '',
  '',
  'Eh ',
  'Kak, ',
  'Meta, ',
  'Halo, ',
  'Nanya dong, ',
  'Bantu mikir bentar dong, ',
  'Minta pendapatmu dong, ',
  'Lagi bingung nih, ',
  'Tolongin aku bentar ya, ',
  'Mau tanya dong, ',
  'Bisa bantu nggak, ',
  'Eh bantuin bentar dong, ',
  'Saran dong, ',
  'Punya ide nggak, ',
  'Bro, ',
  'Maaf ganggu bentar, '
] as const;

const HUMAN_RULES_INTROS = [
  'aku punya aturan jawaban ke customer kalau dia tanya hal tertentu, misalnya: ',
  'di tempatku ada patokan balasan buat customer, kayak gini: ',
  'biasanya kalau pembeli nanya soal tertentu aku punya standar jawabannya: ',
  'aku udah biasa pakai patokan respon gini ke pelanggan: ',
  'catatan jawaban standarku ke customer tuh kurang lebih begini: ',
  'kalau ada yang tanya topik tertentu biasanya aku arahin gini: ',
  'aku punya beberapa aturan jawaban ke pembeli, contohnya: ',
  'patokan balasan yang biasa kupakai di tokoku tuh gini: '
] as const;

const HUMAN_INFO_INTROS = [
  'aku juga punya gaya layanan dan info usahaku begini: ',
  'terus ini catatan cara jawab sama info layananku: ',
  'cara jawab dan gaya pelayanan di tempatku tuh kurang lebih gini: ',
  'catatan karakter CS dan ketentuan tokoku tuh kayak gini: ',
  'buat pegangan nada bicara, ini gaya layananku: ',
  'nah di usahaku gaya komunikasi ke pembeli begini: ',
  'aku melayani customer berpatokan sama catatan gaya jawab ini: ',
  'nih gambaran karakter CS sama ketentuan dari tempatku: ',
  'biar nyambung sama gaya CS-ku, ini catatannya: ',
  'gaya bahasaku sama keterangan layananku kurang lebih begini: ',
  'ini patokan gaya jawab dan karakterku ke customer: ',
  'catatan nada layanan yang kupakai tuh ini: '
] as const;

const HUMAN_CATALOG_INTROS = [
  'aku punya daftar produk jualanku saat ini: ',
  'terus ini katalog produk yang lagi kutawarkan sekarang: ',
  'kalau ada yang tanya barang atau harga, ini list produkku: ',
  'di mini shop-ku ada beberapa produk yang siap dipesan, rinciannya ini: ',
  'daftar produk, harga, sama foto barang yang kujual tuh begini: ',
  'kebetulan aku punya katalog dagangan yang aktif nih: ',
  'ini pilihan produk yang tersedia di tempatku saat ini: ',
  'catatan stok produk sama daftar harga yang lagi jalan tuh ini: ',
  'kalau pembelinya nanyain produk, patokannya dari daftar jualanku ini: ',
  'biar jelas soal harga dan fotonya, ini katalog produkku sekarang: ',
  'aku lagi nawarin produk-produk ini ke customer: ',
  'list jualan di tempatku lengkap sama harga dan link fotonya begini: '
] as const;

const HUMAN_CATALOG_LINK_NUDGES = [
  'kalau customernya minta foto atau gambar produk, langsung tulis dan salin persis link URL foto yang ada di daftarku tadi ya, jangan diganti tulisan tautan tidak tersedia',
  'oh iya kalau pembelinya nanya gambar atau foto barang, langsung sertakan aja link https fotonya apa adanya dari daftar tadi ya',
  'catatan penting: kalau pembeli minta liat gambar, tempel langsung link foto lengkap yang kutulis di atas dan jangan pernah menulis tautan tidak tersedia',
  'kalau ada yang minta foto produknya, langsung salin link URL fotonya dari daftar produk tadi ke dalam balasanmu ya',
  'misal dia pengen lihat contoh fotonya, tinggal cantumin aja langsung link gambar produk yang sesuai dari daftarku di atas',
  'jangan lupa kalau pembelinya minta lihat foto, kirimkan langsung link gambar produknya persis seperti URL di atas ya',
  'kalau dia tanya penampakan atau gambar barangnya, langsung selipin link foto https dari listku di atas tanpa disingkat atau disensor',
  'pastikan kalau customer minta foto atau gambar, URL foto produk yang ada di daftarku ikut ditulis utuh di balasan ya',
  'misal customernya minta gambar, langsung kasih link foto produk yang sesuai persis dari catatan di atas ya, jangan bilang tautan tidak tersedia',
  'kalau pembeli pengen cek fotonya, langsung aja tempel link gambar produk tadi di jawabanmu biar dia tinggal klik',
  'kalau ditanyain foto barangnya, salin persis link fotonya dari list produk di atas ke chat balasan ya',
  'khusus kalau dia minta lihat gambar atau modelnya, langsung kirim link URL foto dari daftarku di atas apa adanya ya'
] as const;

function formatCatalogNaturally(
  products: MetaAiCatalogProduct[] | undefined,
  shopName?: string
): { summary: string; hasImageLinks: boolean } {
  if (!Array.isArray(products) || products.length === 0) {
    return { summary: '', hasImageLinks: false };
  }
  const cleanShop = String(shopName || '').trim().slice(0, 60);

  const photoPhases = [
    (_title: string, url: string) => `link foto: ${url}`,
    (title: string, url: string) => `foto ${title}: ${url}`,
    (_title: string, url: string) => `link gambarnya: ${url}`,
    (title: string, url: string) => `gambar ${title} bisa dilihat di ${url}`
  ];
  const photoFormatter = pickRandom(photoPhases);

  const items: string[] = [];
  let hasImageLinks = false;

  for (const raw of products.slice(0, 15)) {
    if (!raw || typeof raw.title !== 'string') continue;
    const title = raw.title.replace(/\s+/g, ' ').trim().slice(0, 100);
    if (!title) continue;

    const priceNum = Number.isFinite(Number(raw.price)) ? Math.max(0, Math.round(Number(raw.price))) : 0;
    const priceText = priceNum > 0 ? `Rp${priceNum.toLocaleString('id-ID')}` : 'harga tanya admin';
    const desc = typeof raw.description === 'string'
      ? raw.description.replace(/\s+/g, ' ').trim().slice(0, 180)
      : '';
    const imgUrl = typeof raw.image_url === 'string' && raw.image_url.trim()
      ? raw.image_url.trim().slice(0, 300)
      : '';

    let line = `${title} (${priceText})`;
    if (desc) line += ` - ${desc}`;
    if (imgUrl) {
      hasImageLinks = true;
      line += `, ${photoFormatter(title, imgUrl)}`;
    }
    items.push(line);
  }

  if (items.length === 0) return { summary: '', hasImageLinks: false };
  const shopPrefix = cleanShop ? `(Toko ${cleanShop}) ` : '';
  return {
    summary: `${shopPrefix}${items.join(' ; ')}`.slice(0, 1600),
    hasImageLinks
  };
}

const HUMAN_CUSTOMER_INTROS = [
  'nah barusan ada customer tanya begini:',
  'ini ada pembeli chat masuk nanya gini:',
  'tadi ada pelanggan ngechat ke aku begini:',
  'barusan ada calon pembeli kirim pesan gini:',
  'ada customer masuk WA nanya kayak gini:',
  'nih barusan ada yang chat nanyain:',
  'terus ada pembeli yang nanya begini ke aku:',
  'pas banget ada customer kirim chat:',
  'ada orang nanya lewat WA bunyinya gini:',
  'barusan masuk chat dari customer:',
  'ini ada pertanyaan masuk dari pembeli:',
  'ada pelanggan yang barusan tanya:',
  'nih ada chat masuk dari calon pembeli:',
  'tadi ada customer kirim pesan kayak gini:',
  'barusan ada yang ngechat nanya gini:',
  'ini barusan ada customer yang bilang:'
] as const;

const HUMAN_CLOSING_ASKS = [
  'tolong bantu aku jawab dong',
  'aku harus jawab apa ya',
  'aku balas apa kira kira bagusnya',
  'aku cocok jawab apa ya?',
  'enaknya aku balas gimana ya biar ramah?',
  'kira-kira balesan yang pas gimana ya?',
  'menurutmu aku cocoknya jawab apa nih?',
  'bantu bikinin kata-kata balesannya dong',
  'aku mesti respon gimana ya biar enak dibaca?',
  'kasih ide dong aku enaknya jawab apa ke dia',
  'kalau posisi gini bagusnya aku bales gimana ya?',
  'bantu dong aku bingung mau ngetik jawaban apa',
  'tolong susunin kalimat balesan yang ramah dong',
  'menurutmu kata-kata yang paling enak buat jawab ini apa ya?',
  'bagusnya aku bales apa nih yang sopan dan jelas?',
  'kalau kamu jadi aku bakal jawab gimana?',
  'bantu rangkai jawaban yang santai tapi sopan dong',
  'aku tinggal kirim aja nih, enaknya bales gimana ya?',
  'minta tolong bikinin satu balesan yang oke dong',
  'tolong kasih saran jawaban terbaiknya dong',
  'enaknya ngomong apa ya ke customernya?',
  'bantu ketikin jawaban yang singkat tapi jelas dong',
  'gimana ya cara jawab yang paling ramah buat chat itu?',
  'aku mesti ngetik apa nih buat jawab pertanyaan dia?',
  'bantu kasih satu balesan yang luwes dong',
  'kasih tau dong aku sebaiknya bales gimana ke pembeli ini?',
  'tolong buatin jawaban yang ramah buat kukirim balik ya',
  'aku bingung nih ngerangkai katanya, bantu jawab dong',
  'kira-kira respon paling pas buat pertanyaan ini apa ya?',
  'bantu aku jawab chat customer ini dong biar nggak salah ngomong',
  'menurutmu balesan yang paling meyakinkan gimana ya?',
  'enaknya aku bales apa ya biar customernya puas?',
  'tolong bantu mikirin balesan yang sopan dan nggak kaku dong',
  'kasih contoh satu jawaban yang enak dibaca dong',
  'aku cocoknya ngetik balesan kayak gimana ya?',
  'bantu bikin kalimat respon yang natural dong'
] as const;

const HUMAN_DIRECT_NUDGES = [
  'langsung kasih teks jawabannya aja ya biar tinggal kukirim',
  'tulis satu kalimat siap kirim aja ya, nggak usah pakai pembuka',
  'langsung buatin isi balesannya aja ya',
  'kasih satu versi aja yang siap langsung kukirim ke WA-nya',
  'cukup tulisin teks balasannya aja ya biar langsung kupake',
  'jawabannya langsung kalimat buat dikirim ke customer aja ya',
  'tulisin satu opsi yang paling oke aja biar tinggal ku-copy',
  'bikinin satu balasan singkat aja yang siap kirim ya',
  'nggak usah panjang-panjang, langsung teks buat bales ke dia aja',
  'cukup kasih teks jadinya aja ya yang ramah dan singkat',
  'buat satu balasan singkat aja yang enak langsung dikirim',
  'langsung susun kata-kata jadinya aja ya tanpa basa-basi',
  'satu jawaban singkat aja cukup kok, biar langsung kukirim',
  'kasih langsung teks yang bisa langsung kupakai buat bales ya',
  'tulisin aja langsung kalimat balasannya ya',
  'singkat dan ramah aja ya, langsung kalimat buat dia'
] as const;

export function buildMetaAiPrompt(params: MetaAiQueryParams): string {
  const rawInstruction = (params.customSystemPrompt || '').trim();
  const instruction = compactInstructionForHumanChat(rawInstruction);
  const userMessage = String(params.messageBody || '').trim().slice(0, 1200);
  const rulesSummary = summarizeRulesNaturally(params.autoReplyRules, userMessage);
  const { summary: catalogSummary, hasImageLinks } = formatCatalogNaturally(
    params.catalogProducts,
    params.catalogShopName
  );

  // Strict privacy: NEVER include senderPhone or senderName in prompt sent to Meta AI
  // Instead, use anonymized customerCode (e.g. customer_63636) to isolate concurrent conversations
  const customerCode = params.customerCode ? String(params.customerCode).trim() : '';
  const opener = customerCode ? '' : pickRandom(HUMAN_OPENERS);
  const customerIntro = pickRandom(HUMAN_CUSTOMER_INTROS);
  const closingAsk = pickRandom(HUMAN_CLOSING_ASKS);
  const directNudge = pickRandom(HUMAN_DIRECT_NUDGES);

  const contextSegments: string[] = [];
  if (rulesSummary) {
    contextSegments.push(`${pickRandom(HUMAN_RULES_INTROS)}${rulesSummary}.`);
  }
  if (catalogSummary) {
    const linkNudge = hasImageLinks ? ` (${pickRandom(HUMAN_CATALOG_LINK_NUDGES)}).` : '';
    contextSegments.push(`${pickRandom(HUMAN_CATALOG_INTROS)}${catalogSummary}${linkNudge}`);
  }
  if (params.orderSummary) {
    contextSegments.push(
      `${params.orderSummary} (Aturan order, checkout & verifikasi bayar: jika customer memesan item, tampilkan rincian invoice & total harganya lalu tanyakan apakah ada produk lain yang ingin ditambahkan lagi; jika dia konfirmasi tidak ada tambahan / sudah oke / checkout, tampilkan total akhir lalu tanyakan mau bayar pakai metode apa dari daftar metode pembayaran yang tersedia; jika customer mengonfirmasi sudah membayar / mengirim bukti bayar dan pesanan sudah oke/lengkap, verifikasi dan akhiri balasanmu dengan tag [[ORDER_PAID]]).`
    );
  }
  if (params.paymentSummary) {
    contextSegments.push(
      `Metode pembayaran tersedia di tokoku: ${params.paymentSummary}. Jika customer memilih bayar pakai QRIS, sertakan kode [[SEND_QRIS]] agar sistem langsung mengirim gambar QRIS. Jika memilih transfer rekening, sertakan [[SEND_REK]] atau nomor rekeningnya.`
    );
  }
  if (Array.isArray(params.customerHistory) && params.customerHistory.length > 0) {
    const histLines = params.customerHistory
      .slice(-6)
      .map(h => `${h.role === 'customer' ? 'Pembeli' : 'CS'}: ${String(h.text || '').replace(/\s+/g, ' ').slice(0, 180)}`)
      .join(' | ');
    if (histLines) {
      contextSegments.push(`Riwayat percakapan sebelumnya khusus ${customerCode || 'pembeli ini'}: ${histLines}.`);
    }
  }
  if (instruction) {
    contextSegments.push(`${pickRandom(HUMAN_INFO_INTROS)}${instruction}`);
  }

  const contextBlock = contextSegments.join(' ').trim();
  const quotedMsg = crypto.randomInt(0, 2) === 0 ? `"${userMessage}"` : userMessage;
  const codeHeader = customerCode
    ? `[ID Chat Terisolasi: ${customerCode} — fokus HANYA menjawab chat ${customerCode}, JANGAN campur dengan pelanggan lain, awali jawabanmu dengan [${customerCode}]]\n`
    : '';

  if (codeHeader) {
    const ctxLine = contextBlock ? `Konteks: ${contextBlock}\n\n` : '';
    return `${codeHeader}${ctxLine}Chat dari ${customerCode}: ${quotedMsg}\n${closingAsk.replace(/\?+$/, '')}, ${directNudge}.`.trim();
  }

  const layout = crypto.randomInt(0, 4);
  const cleanClosing = closingAsk.replace(/\?+$/, '');
  const cleanCustomerIntro = customerIntro.replace(/:+$/, '');

  if (contextBlock) {
    switch (layout) {
      case 0:
        return `${opener}${contextBlock}\n\n${customerIntro} ${quotedMsg}\n${cleanClosing}, ${directNudge}.`.trim();
      case 1:
        return `${opener}${customerIntro} ${quotedMsg} — ${cleanClosing}?\n\nSekadar info, ${contextBlock} (${directNudge}).`.trim();
      case 2:
        return `${opener}${contextBlock} Terus ${cleanCustomerIntro.charAt(0).toLowerCase() + cleanCustomerIntro.slice(1)}: ${quotedMsg}. Menurutmu ${cleanClosing}? (${directNudge})`.trim();
      default:
        return `${opener}${customerIntro}\n${quotedMsg}\n\n${cleanClosing}, ${directNudge}. Sebagai patokan: ${contextBlock}`.trim();
    }
  }

  switch (layout) {
    case 0:
      return `${opener}${customerIntro} ${quotedMsg}\n${cleanClosing}, ${directNudge}.`.trim();
    case 1:
      return `${opener}${customerIntro} ${quotedMsg} — ${cleanClosing}? ${directNudge.charAt(0).toUpperCase() + directNudge.slice(1)}.`.trim();
    case 2:
      return `${opener}${cleanClosing} kalau ${cleanCustomerIntro.charAt(0).toLowerCase() + cleanCustomerIntro.slice(1)}: ${quotedMsg}\n(${directNudge})`.trim();
    default:
      return `${opener}${customerIntro}\n${quotedMsg}\n\n${cleanClosing} (${directNudge}).`.trim();
  }
}

export function isSocketOpen(socket: any): boolean {
  if (!socket || (typeof socket.sendMessage !== 'function' && typeof socket.relayMessage !== 'function')) return false;
  if (socket.ws) {
    if (socket.ws.isClosed === true) return false;
    if (typeof socket.ws.readyState === 'number' && socket.ws.readyState !== 1) return false;
    if (typeof socket.ws.socket?.readyState === 'number' && socket.ws.socket.readyState !== 1) return false;
    if (typeof socket.ws.isOpen === 'boolean') return socket.ws.isOpen;
    if (typeof socket.ws.readyState === 'number') return socket.ws.readyState === 1;
    if (typeof socket.ws.socket?.readyState === 'number') return socket.ws.socket.readyState === 1;
  }
  return Boolean(socket.user?.id);
}

async function fetchAccountBotList(sessionId: string, socket: any): Promise<BotListEntry[]> {
  const now = Date.now();
  const cached = sessionBotEntries.get(sessionId);
  if (cached && cached.expiresAt > now) {
    return cached.entries;
  }

  if (typeof socket?.getBotListV2 !== 'function') {
    return [];
  }

  try {
    const rawList = await Promise.race([
      socket.getBotListV2(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3500))
    ]);
    if (Array.isArray(rawList)) {
      const cleaned: BotListEntry[] = rawList
        .filter((b: any) => typeof b?.jid === 'string' && isRoutableOutgoingMetaJid(b.jid))
        .map((b: any) => ({
          jid: b.jid.trim(),
          personaId: typeof b.personaId === 'string' && b.personaId.trim() ? b.personaId.trim() : undefined
        }));

      for (const b of cleaned) {
        rememberBotPersona(sessionId, b.jid, b.personaId);
      }

      sessionBotEntries.set(sessionId, {
        entries: cleaned,
        expiresAt: now + (cleaned.length > 0 ? BOT_LIST_CACHE_TTL_MS : BOT_LIST_EMPTY_CACHE_TTL_MS)
      });
      return cleaned;
    }
  } catch {
    // Gracefully fall back if bot list IQ is unsupported
  }

  return [];
}

async function lookupMetaAiLidViaSignal(sessionId: string, socket: any): Promise<string | null> {
  const getLIDForPN = socket?.signalRepository?.lidMapping?.getLIDForPN;
  if (typeof getLIDForPN !== 'function') return null;
  try {
    const resolvedLid = await Promise.race([
      getLIDForPN.call(socket.signalRepository.lidMapping, '13135550002@s.whatsapp.net'),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500))
    ]);
    if (typeof resolvedLid === 'string' && resolvedLid.trim()) {
      const clean = jidNormalizedUser(resolvedLid.trim());
      rememberSessionMetaAiLid(sessionId, clean);
      return clean;
    }
  } catch {
    // Fall back gracefully
  }
  return null;
}

/**
 * Baileys v7 assertSessions() filters wireJids to only `@lid` and `@s.whatsapp.net`,
 * omitting `@bot`. Pre-fetching E2E prekeys + seeding device 0 cache when Signal session
 * exists lets relayMessage Signal-encrypt to `867051314767696@bot` cleanly.
 */
async function ensureBotDeviceCached(socket: any, targetJid: string): Promise<void> {
  if (!targetJid.endsWith('@bot') || !socket?.userDevicesCache?.set) return;
  const decoded = jidDecode(targetJid);
  if (!decoded?.user) return;
  try {
    let existingDevices: any[] = [];
    if (typeof socket.userDevicesCache.get === 'function') {
      const cached = await socket.userDevicesCache.get(decoded.user).catch(() => undefined);
      if (Array.isArray(cached) && cached.length > 0) {
        existingDevices = cached;
      }
    }
    if (existingDevices.length === 0 && typeof socket.getUSyncDevices === 'function') {
      existingDevices = await Promise.race([
        socket.getUSyncDevices([targetJid], true, false),
        new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 3500))
      ]).catch(() => []);
    }
    const hasTarget = Array.isArray(existingDevices) && existingDevices.some((d: any) => d?.user === decoded.user);
    if (!hasTarget) {
      const deviceRecord = [{ user: decoded.user, device: 0, domainType: decoded.domainType || 0, server: 'bot' }];
      if (typeof socket.userDevicesCache.mset === 'function') {
        await socket.userDevicesCache.mset([{ key: decoded.user, value: deviceRecord }]);
      } else {
        await socket.userDevicesCache.set(decoded.user, deviceRecord);
      }
    }
  } catch {
    // Non-fatal cache check
  }
}

async function ensureBotSignalSessionAndDevice(sessionId: string, socket: any, targetJid: string): Promise<boolean> {
  if (!targetJid.endsWith('@bot')) return true;

  const cacheKey = `${sessionId}::${targetJid}`;
  const cachedUntil = botSignalReadyCache.get(cacheKey);
  if (cachedUntil && cachedUntil > Date.now()) {
    await ensureBotDeviceCached(socket, targetJid);
    return true;
  }

  const decoded = jidDecode(targetJid);
  if (!decoded?.user) return false;

  const repo = socket?.signalRepository;
  let hasSession = false;

  if (repo?.validateSession) {
    try {
      const val = await repo.validateSession(targetJid);
      hasSession = Boolean(val?.exists);
    } catch {
      hasSession = false;
    }
  }

  if (!hasSession && typeof socket?.assertSessions === 'function') {
    try {
      await Promise.race([
        socket.assertSessions([targetJid], true),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000))
      ]);
      if (repo?.validateSession) {
        const recheckAssert = await repo.validateSession(targetJid);
        hasSession = Boolean(recheckAssert?.exists);
      }
    } catch {
      // Fall through to raw encrypt prekey IQ probe
    }
  }

  if (!hasSession && typeof socket?.query === 'function' && repo) {
    try {
      const res = await Promise.race([
        socket.query({
          tag: 'iq',
          attrs: {
            xmlns: 'encrypt',
            type: 'get',
            to: S_WHATSAPP_NET
          },
          content: [
            {
              tag: 'key',
              attrs: {},
              content: [{ tag: 'user', attrs: { jid: targetJid } }]
            }
          ]
        }),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Timeout query prekey Meta AI')), 6000))
      ]);
      if (res) {
        await parseAndInjectE2ESessions(res, repo);
        if (repo.validateSession) {
          const recheck = await repo.validateSession(targetJid);
          hasSession = Boolean(recheck?.exists);
        } else {
          hasSession = true;
        }
      }
    } catch (err: any) {
      console.warn(`[Meta AI Session] Gagal fetch prekey untuk ${targetJid}: ${err?.message || err}`);
    }
  }

  await ensureBotDeviceCached(socket, targetJid);

  if (hasSession) {
    botSignalReadyCache.set(cacheKey, Date.now() + BOT_SIGNAL_READY_TTL_MS);
    capMapSize(botSignalReadyCache, MAX_TRACKED_SESSIONS * 2);
  } else {
    botSignalReadyCache.delete(cacheKey);
  }

  return hasSession;
}

export async function resolveMetaAiCandidateJids(sessionId: string, socket: any): Promise<string[]> {
  const ordered: string[] = [];
  const preferred = sessionPreferredMetaJid.get(sessionId);
  if (preferred && isRoutableOutgoingMetaJid(preferred)) {
    ordered.push(preferred);
  }

  // 1. Discover official `@bot` entries registered on this WhatsApp account (typically 867051314767696@bot)
  const bots = await fetchAccountBotList(sessionId, socket);
  const cachedEntry = sessionBotEntries.get(sessionId);
  const accountExplicitlyListedNoBots = Boolean(cachedEntry && cachedEntry.entries.length === 0);

  const metaBotFirst = [
    ...bots.filter((b) => b.jid === DEFAULT_META_AI_BOT_JID || b.jid.startsWith('867051314767696')),
    ...bots.filter((b) => b.jid !== DEFAULT_META_AI_BOT_JID && !b.jid.startsWith('867051314767696'))
  ];
  for (const bot of metaBotFirst) {
    ordered.push(bot.jid);
  }

  // 2. Discover learned or Signal-mapped `@lid`
  let discoveredLid: string | null = sessionMetaAiLids.get(sessionId) || null;
  if (!discoveredLid) {
    discoveredLid = await lookupMetaAiLidViaSignal(sessionId, socket);
  }
  if (!discoveredLid && typeof socket?.onWhatsApp === 'function') {
    try {
      const checkRes = await Promise.race([
        socket.onWhatsApp('13135550002'),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500))
      ]);
      if (Array.isArray(checkRes) && checkRes[0]) {
        const resolved = checkRes[0]?.lid || checkRes[0]?.jid;
        if (typeof resolved === 'string' && resolved.trim()) {
          const cleanResolved = resolved.trim().endsWith('@c.us')
            ? safeNormalizeJid(resolved.trim())
            : resolved.trim();
          if (isRoutableOutgoingMetaJid(cleanResolved)) {
            rememberSessionMetaAiLid(sessionId, cleanResolved);
            discoveredLid = cleanResolved;
          }
        }
      }
    } catch {
      // Fall back to standard JID candidates
    }
  }

  // When getBotListV2 explicitly returned [] for this account and a @lid exists, prioritize @lid ahead of @bot
  if (accountExplicitlyListedNoBots && discoveredLid && isRoutableOutgoingMetaJid(discoveredLid)) {
    ordered.push(discoveredLid);
  }

  // 3. Include default Meta AI bot JID when bot list did not already include it
  ordered.push(DEFAULT_META_AI_BOT_JID);

  if (discoveredLid && isRoutableOutgoingMetaJid(discoveredLid)) {
    ordered.push(discoveredLid);
  }

  for (const fallbackJid of FALLBACK_META_AI_JIDS) {
    if (isRoutableOutgoingMetaJid(fallbackJid)) {
      ordered.push(fallbackJid);
    }
  }

  const dedupedValid = Array.from(new Set(ordered.filter((j) => isRoutableOutgoingMetaJid(j))));
  const nonRejected = dedupedValid.filter((j) => !isSessionBotJidRejected(sessionId, j));
  if (nonRejected.length === 0) return dedupedValid;
  const nonRejectedSet = new Set(nonRejected);
  return [...nonRejected, ...dedupedValid.filter((j) => !nonRejectedSet.has(j))];
}

async function simulateHumanMetaTyping(socket: any, targetJid: string, _promptText: string): Promise<void> {
  if (typeof socket?.sendPresenceUpdate !== 'function') return;

  // Lightweight presence nudge so Meta AI receives natural signals without burning latency on shared hosting
  const preDelayMs = crypto.randomInt(100, 220);
  await new Promise((r) => setTimeout(r, preDelayMs));

  void Promise.race([
    socket.sendPresenceUpdate('composing', targetJid),
    new Promise((r) => setTimeout(r, 600))
  ]).catch(() => {});

  const typingMs = crypto.randomInt(150, 300);
  await new Promise((r) => setTimeout(r, typingMs));

  void Promise.race([
    socket.sendPresenceUpdate('paused', targetJid),
    new Promise((r) => setTimeout(r, 500))
  ]).catch(() => {});
}

const ownCompanionDevicesCache = new Map<string, { devices: Array<{ user?: string; device?: number; jid?: string }>; exp: number }>();

/**
 * WhatsApp MD requires `@bot` 1:1 stanzas to fan out companion `deviceSentMessage`
 * copies using our own LID (`creds.me.lid`), not our PN (`creds.me.id`), and without
 * mismatched reporting tokens. Baileys v7 relayMessage treats non-`@lid` recipients as PN.
 */
export async function sendBotDirectStanza(
  socket: any,
  targetJid: string,
  waMessage: proto.IMessage,
  msgId: string
): Promise<boolean> {
  if (!targetJid.endsWith('@bot')) return false;
  if (
    typeof socket?.sendNode !== 'function' ||
    typeof socket?.signalRepository?.encryptMessage !== 'function'
  ) {
    return false;
  }

  const meId = String(socket?.authState?.creds?.me?.id || socket?.user?.id || '').trim();
  const meLid = String(socket?.authState?.creds?.me?.lid || socket?.user?.lid || '').trim();
  if (!meId || !meLid) return false;

  const meLidDecoded = jidDecode(meLid);
  if (!meLidDecoded?.user) return false;
  const normalizedOwnLid = jidNormalizedUser(meLid);

  let ownDevices: Array<{ user?: string; device?: number; jid?: string }> = [];
  const cachedOwn = ownCompanionDevicesCache.get(normalizedOwnLid);
  if (cachedOwn && cachedOwn.exp > Date.now()) {
    ownDevices = cachedOwn.devices;
  } else if (typeof socket.getUSyncDevices === 'function') {
    try {
      const fetched = await Promise.race([
        socket.getUSyncDevices([normalizedOwnLid], true, false),
        new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 2200))
      ]);
      if (Array.isArray(fetched) && fetched.length > 0) {
        ownDevices = fetched;
        ownCompanionDevicesCache.set(normalizedOwnLid, { devices: fetched, exp: Date.now() + 5 * 60 * 1000 });
        capMapSize(ownCompanionDevicesCache, MAX_TRACKED_SESSIONS);
      }
    } catch {
      ownDevices = [];
    }
  }

  const meRecipients: string[] = [];
  const seenOwnJids = new Set<string>();
  const isSameOwnDevice = (candidateJid: string) => {
    if (candidateJid === meId || candidateJid === meLid) return true;
    const dec = jidDecode(candidateJid);
    return Boolean(
      dec &&
        dec.user === meLidDecoded.user &&
        (dec.device || 0) === (meLidDecoded.device || 0)
    );
  };

  for (const dev of ownDevices) {
    const devJid = typeof dev?.jid === 'string' ? dev.jid.trim() : '';
    if (!devJid || seenOwnJids.has(devJid) || isSameOwnDevice(devJid)) continue;
    const dec = jidDecode(devJid);
    if (!dec || dec.user !== meLidDecoded.user) continue;
    seenOwnJids.add(devJid);
    meRecipients.push(devJid);
  }

  // Ensure our primary LID device (device 0) receives DSM when companion session exists
  if (!seenOwnJids.has(normalizedOwnLid) && !isSameOwnDevice(normalizedOwnLid)) {
    meRecipients.push(normalizedOwnLid);
  }

  if (meRecipients.length > 0 && typeof socket.assertSessions === 'function') {
    try {
      await Promise.race([
        socket.assertSessions(meRecipients),
        new Promise((resolve) => setTimeout(resolve, 2500))
      ]);
    } catch {
      // Companion session assertion is best-effort; per-device encryption handles failures gracefully
    }
  }

  const runTransaction = async <T>(work: () => Promise<T>): Promise<T> => {
    const tx = socket?.authState?.keys?.transaction;
    if (typeof tx === 'function') {
      return await tx.call(socket.authState.keys, work, meId);
    }
    return await work();
  };

  const participantNodes: any[] = [];
  let shouldIncludeDeviceIdentity = false;

  await runTransaction(async () => {
    if (meRecipients.length > 0) {
      const meMsg: proto.IMessage = {
        deviceSentMessage: {
          destinationJid: targetJid,
          message: waMessage
        },
        messageContextInfo: waMessage.messageContextInfo
      };
      const encodedDsm = encodeWAMessage(meMsg);
      for (const meDeviceJid of meRecipients) {
        try {
          const { type, ciphertext } = await socket.signalRepository.encryptMessage({
            jid: meDeviceJid,
            data: encodedDsm
          });
          if (type === 'pkmsg') shouldIncludeDeviceIdentity = true;
          participantNodes.push({
            tag: 'to',
            attrs: { jid: meDeviceJid },
            content: [
              {
                tag: 'enc',
                attrs: { v: '2', type },
                content: ciphertext
              }
            ]
          });
        } catch {
          // Skip unavailable companion device rather than failing bot prompt
        }
      }
    }

    const encodedTarget = encodeWAMessage(waMessage);
    const { type: botEncType, ciphertext: botCiphertext } = await socket.signalRepository.encryptMessage({
      jid: targetJid,
      data: encodedTarget
    });
    if (botEncType === 'pkmsg') {
      shouldIncludeDeviceIdentity = true;
    }
    participantNodes.push({
      tag: 'to',
      attrs: { jid: targetJid },
      content: [
        {
          tag: 'enc',
          attrs: { v: '2', type: botEncType },
          content: botCiphertext
        }
      ]
    });
  });

  const binaryNodeContent: any[] = [
    {
      tag: 'participants',
      attrs: {},
      content: participantNodes
    }
  ];

  const account = socket?.authState?.creds?.account;
  if (shouldIncludeDeviceIdentity && account) {
    binaryNodeContent.push({
      tag: 'device-identity',
      attrs: {},
      content: encodeSignedDeviceIdentity(account, true)
    });
  }

  const stanza = {
    tag: 'message',
    attrs: {
      id: msgId,
      to: targetJid,
      type: 'text'
    },
    content: binaryNodeContent
  };

  await socket.sendNode(stanza);
  try {
    socket?.messageRetryManager?.addRecentMessage?.(targetJid, msgId, waMessage);
  } catch {
    // Non-fatal retry cache update
  }
  return true;
}

async function sendPromptToSingleJid(
  sessionId: string,
  socket: any,
  targetJid: string,
  promptText: string,
  waiter?: PendingWaiter
): Promise<string> {
  const isBotDomain = targetJid.endsWith('@bot');
  const messageSecret = crypto.randomBytes(32);

  if (isBotDomain) {
    const sessionOk = await ensureBotSignalSessionAndDevice(sessionId, socket, targetJid);
    if (!sessionOk) {
      throw new Error(`Sesi Signal ke ${targetJid} tidak tersedia dari server WhatsApp.`);
    }
  }

  const userJid = socket?.authState?.creds?.me?.id || socket?.user?.id || '';
  const msgId = generateMessageIDV2(userJid);

  // Store secret BEFORE relaying so fast bot msmsg replies can decrypt immediately
  storePendingBotSecret(sessionId, msgId, targetJid, messageSecret);
  if (waiter && !waiter.settled) {
    waiter.pendingAckMsgIds.add(msgId);
    waiter.msgIdToTargetJid.set(msgId, targetJid);
  }

  const cachedBotsEntry = sessionBotEntries.get(sessionId);
  const accountExplicitlyListedNoBots = Boolean(cachedBotsEntry && cachedBotsEntry.entries.length === 0);
  const personaId =
    sessionBotPersonas.get(sessionId)?.get(targetJid) ||
    sessionBotPersonas.get(sessionId)?.get(safeNormalizeJid(targetJid)) ||
    (!accountExplicitlyListedNoBots && targetJid.startsWith('867051314767696') ? DEFAULT_META_AI_PERSONA_ID : undefined);

  if (typeof socket?.relayMessage === 'function' && userJid) {
    const fullMsg = await generateWAMessage(
      targetJid,
      { text: promptText },
      {
        userJid,
        messageId: msgId,
        logger: typeof socket?.logger?.child === 'function' ? socket.logger : undefined,
        upload: socket.waUploadToServer
      }
    );

    if (fullMsg.message) {
      fullMsg.message.messageContextInfo = {
        ...(fullMsg.message.messageContextInfo || {}),
        messageSecret,
        ...(isBotDomain && personaId ? { botMetadata: { personaId } } : {})
      };
    }

    // Human-like reading/typing presence simulation before sending to Meta AI
    await simulateHumanMetaTyping(socket, targetJid, promptText);

    sessionLastPromptAt.set(sessionId, Date.now());
    let sentViaDirectBot = false;
    if (isBotDomain && fullMsg.message) {
      try {
        sentViaDirectBot = await Promise.race([
          sendBotDirectStanza(socket, targetJid, fullMsg.message, msgId),
          new Promise<boolean>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout mengirim prompt ke Meta AI')), 10000)
          )
        ]);
      } catch (directErr) {
        // Re-throw timeout/sendNode failures; otherwise fall back to Baileys relayMessage
        if (directErr instanceof Error && directErr.message.includes('Timeout mengirim prompt')) {
          throw directErr;
        }
        sentViaDirectBot = false;
      }
    }

    if (!sentViaDirectBot) {
      await Promise.race([
        socket.relayMessage(targetJid, fullMsg.message, { messageId: msgId }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout mengirim prompt ke Meta AI')), 10000))
      ]);
    }

    if (!sessionMetaAiLids.has(sessionId)) {
      await lookupMetaAiLidViaSignal(sessionId, socket);
    }
    return targetJid;
  }

  await simulateHumanMetaTyping(socket, targetJid, promptText);

  sessionLastPromptAt.set(sessionId, Date.now());
  const sentMsg: any = await Promise.race([
    socket.sendMessage(targetJid, { text: promptText }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout mengirim prompt ke Meta AI')), 10000))
  ]);
  if (sentMsg?.key?.id) {
    const realSecret = sentMsg?.message?.messageContextInfo?.messageSecret;
    if (realSecret?.length) {
      storePendingBotSecret(sessionId, sentMsg.key.id, sentMsg?.key?.remoteJid || targetJid, Buffer.from(realSecret));
    }
    waiter?.pendingAckMsgIds.add(sentMsg.key.id);
    waiter?.msgIdToTargetJid.set(sentMsg.key.id, sentMsg?.key?.remoteJid || targetJid);
  }
  if (sentMsg?.key?.remoteJid && typeof sentMsg.key.remoteJid === 'string') {
    rememberSessionMetaAiLid(sessionId, sentMsg.key.remoteJid);
  }
  if (!sessionMetaAiLids.has(sessionId)) {
    await lookupMetaAiLidViaSignal(sessionId, socket);
  }
  return sentMsg?.key?.remoteJid || targetJid;
}

async function sendPromptToMetaAi(
  sessionId: string,
  socket: any,
  promptText: string,
  waiter: PendingWaiter
): Promise<{ usedJid: string; remainingCandidates: string[] }> {
  let lastError: unknown = null;
  const candidates = await resolveMetaAiCandidateJids(sessionId, socket);
  for (let i = 0; i < candidates.length; i++) {
    const targetJid = candidates[i];
    try {
      const usedJid = await sendPromptToSingleJid(sessionId, socket, targetJid, promptText, waiter);
      if (usedJid) {
        sessionPreferredMetaJid.set(sessionId, usedJid);
        capMapSize(sessionPreferredMetaJid, MAX_TRACKED_SESSIONS);
      }
      return {
        usedJid,
        remainingCandidates: candidates.slice(i + 1)
      };
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError) {
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
  throw new Error('Tidak ada JID Meta AI yang dapat digunakan untuk mengirim pesan.');
}

export function getAllConnectedMetaAiSessions(): Array<{
  sessionId: string;
  userId?: string;
  phoneNumber?: string;
}> {
  if (!allSocketsProvider) return [];
  return allSocketsProvider()
    .filter((entry) => isSocketOpen(entry.socket))
    .map((entry) => ({
      sessionId: entry.sessionId,
      userId: entry.userId,
      phoneNumber: entry.phoneNumber
    }));
}

export function resetMetaAiSessionProbeCaches(sessionId: string) {
  if (!sessionId) return;
  sessionBotEntries.delete(sessionId);
  sessionRejectedBotJids.delete(sessionId);
  sessionCooldowns.delete(sessionId);
  sessionPreferredMetaJid.delete(sessionId);
  sessionLastMetaError.delete(sessionId);
  sessionDecryptHint.delete(sessionId);
  for (const key of Array.from(botSignalReadyCache.keys())) {
    if (key.startsWith(`${sessionId}::`)) {
      botSignalReadyCache.delete(key);
    }
  }
}

/**
 * Lightweight background cache warm-up after connection === 'open' so the first
 * customer message on shared hosting doesn't pay cold-start bot list / prekey IQ latency.
 */
export async function warmMetaAiSession(sessionId: string, socket: any): Promise<void> {
  if (!sessionId || !isSocketOpen(socket)) return;
  try {
    attachMetaAiRawSocketHandlers(socket, sessionId);
    const bots = await fetchAccountBotList(sessionId, socket);
    if (!isSocketOpen(socket)) return;
    if (!sessionMetaAiLids.has(sessionId)) {
      await lookupMetaAiLidViaSignal(sessionId, socket);
    }
    if (!isSocketOpen(socket)) return;
    const preferredBot =
      bots.find((b) => b.jid === DEFAULT_META_AI_BOT_JID || b.jid.startsWith('867051314767696'))?.jid ||
      bots[0]?.jid ||
      DEFAULT_META_AI_BOT_JID;
    if (preferredBot.endsWith('@bot')) {
      await ensureBotSignalSessionAndDevice(sessionId, socket, preferredBot);
    }
  } catch {
    // Best-effort non-blocking warm-up
  }
}

export function getMetaAiAvailabilityForUser(userId?: string, preferredSessionId?: string): {
  connected: boolean;
  sessionId?: string;
  phoneNumber?: string;
  activeQueueDepth: number;
  metaAiJid: string;
  lastError?: { code: string; message: string; at: number } | null;
} {
  const entry = socketProvider ? socketProvider(userId, preferredSessionId) : null;
  const open = Boolean(entry && isSocketOpen(entry.socket));
  const sessionId = open ? entry!.sessionId : undefined;
  const cachedBot = sessionId ? sessionBotEntries.get(sessionId)?.entries?.[0]?.jid : undefined;
  const lastError = sessionId ? sessionLastMetaError.get(sessionId) || null : null;
  return {
    connected: open,
    sessionId,
    phoneNumber: open ? entry!.phoneNumber : undefined,
    activeQueueDepth: sessionId ? sessionQueueDepth.get(sessionId) || 0 : 0,
    metaAiJid: cachedBot || DEFAULT_META_AI_JID,
    lastError
  };
}

export interface MetaAiVerificationResult {
  ok: boolean;
  connected: boolean;
  verified: boolean;
  code: 'WA_NOT_CONNECTED' | 'VERIFIED' | 'META_AI_NEEDS_FIRST_CHAT';
  sessionId?: string;
  phoneNumber?: string;
  hasOfficialBotEntry: boolean;
  botReplyPreview?: string;
  diagnosticReason?: string;
  message: string;
}

/**
 * Checks whether Meta AI is active on the user's connected WhatsApp account and attempts
 * a lightweight initial greeting probe ("Halo") to trigger/verify Meta AI directly from the app.
 */
export async function verifyAndInitMetaAiForUser(params: {
  userId?: string;
  sessionId?: string;
}): Promise<MetaAiVerificationResult> {
  if (!socketProvider) {
    return {
      ok: false,
      connected: false,
      verified: false,
      code: 'WA_NOT_CONNECTED',
      hasOfficialBotEntry: false,
      message: 'Provider sesi WhatsApp Baileys belum siap.'
    };
  }

  let entry = socketProvider(params.userId, params.sessionId);
  if (!entry || !isSocketOpen(entry.socket)) {
    entry = await ensureConnectedMetaAiSocketForUser(params.userId, params.sessionId);
  }
  if (!entry || !isSocketOpen(entry.socket)) {
    return {
      ok: false,
      connected: false,
      verified: false,
      code: 'WA_NOT_CONNECTED',
      hasOfficialBotEntry: false,
      message: 'Nomor WhatsApp belum terhubung. Silakan hubungkan perangkat WhatsApp terlebih dahulu di menu Koneksi.'
    };
  }

  // Clear negative caches so a fresh check after user chatted in WhatsApp succeeds immediately
  resetMetaAiSessionProbeCaches(entry.sessionId);

  let hasOfficialBotEntry = false;
  try {
    const bots = await fetchAccountBotList(entry.sessionId, entry.socket);
    hasOfficialBotEntry = bots.length > 0;
  } catch {
    hasOfficialBotEntry = false;
  }

  const PROBE_HARD_TIMEOUT_MS = 18000;
  const PROBE_RETRY_MS = 5500;
  const probePrompt = 'Halo, tes koneksi singkat ya. Cukup balas singkat saja.';

  try {
    const probeResult = await enqueueSessionTask(entry.sessionId, async () => {
      const liveEntry = socketProvider ? socketProvider(params.userId, entry.sessionId) : null;
      if (!liveEntry || !isSocketOpen(liveEntry.socket)) {
        return { ok: false, reason: 'Perangkat WhatsApp terputus saat verifikasi Meta AI.' };
      }

      attachMetaAiRawSocketHandlers(liveEntry.socket, liveEntry.sessionId);

      if (activeWaiters.has(liveEntry.sessionId)) {
        finalizeWaiter(liveEntry.sessionId, { ok: false, reason: 'Waiter digantikan oleh verifikasi Meta AI.' });
      }

      rememberPromptEcho(liveEntry.sessionId, probePrompt);

      return await new Promise<{ ok: boolean; text?: string; reason?: string }>(async (resolve) => {
        const hardTimer = setTimeout(() => {
          const current = activeWaiters.get(liveEntry.sessionId);
          if (current && !current.settled && current.latestText) {
            finalizeWaiter(liveEntry.sessionId, { ok: true, text: current.latestText });
          } else {
            finalizeWaiter(liveEntry.sessionId, {
              ok: false,
              reason:
                current?.lastAckError ||
                'Meta AI tidak merespons (kemungkinan akun WhatsApp ini belum pernah memulai chat atau menyetujui fitur Meta AI di WhatsApp).'
            });
          }
        }, PROBE_HARD_TIMEOUT_MS);

        const waiter: PendingWaiter = {
          sessionId: liveEntry.sessionId,
          promptSent: probePrompt,
          sentAt: Date.now(),
          latestText: '',
          hasSignal: false,
          settled: false,
          pendingAckMsgIds: new Set<string>(),
          msgIdToTargetJid: new Map<string, string>(),
          resolve,
          hardTimer,
          settleTimer: null,
          retryTimer: null
        };
        activeWaiters.set(liveEntry.sessionId, waiter);

        try {
          const sendRes = await sendPromptToMetaAi(liveEntry.sessionId, liveEntry.socket, probePrompt, waiter);
          if (sendRes.remainingCandidates.length > 0 && !waiter.settled && !waiter.hasSignal) {
            let candidateIdx = 0;
            const tryNextCandidate = async (): Promise<boolean> => {
              const current = activeWaiters.get(liveEntry.sessionId);
              if (!current || current.settled || current.hasSignal || current.latestText) return false;
              if (current.fallbackInProgress) return true;
              current.fallbackInProgress = true;
              try {
                while (candidateIdx < sendRes.remainingCandidates.length) {
                  const nextJid = sendRes.remainingCandidates[candidateIdx++];
                  try {
                    await sendPromptToSingleJid(liveEntry.sessionId, liveEntry.socket, nextJid, probePrompt, current);
                    if (candidateIdx >= sendRes.remainingCandidates.length) {
                      current.fallbackAttemptFn = undefined;
                    } else if (!current.settled && !current.hasSignal) {
                      current.retryTimer = setTimeout(() => {
                        void tryNextCandidate();
                      }, PROBE_RETRY_MS);
                    }
                    return true;
                  } catch {
                    // Continue trying next candidate JID
                  }
                }
                current.fallbackAttemptFn = undefined;
                return false;
              } finally {
                current.fallbackInProgress = false;
              }
            };
            waiter.fallbackAttemptFn = tryNextCandidate;
            waiter.retryTimer = setTimeout(() => {
              void tryNextCandidate();
            }, PROBE_RETRY_MS);
          }
        } catch (sendErr: any) {
          finalizeWaiter(liveEntry.sessionId, {
            ok: false,
            reason: sendErr?.message || 'Gagal mengirim sapaan awal ke Meta AI.'
          });
        }
      });
    });

    if (probeResult.ok && probeResult.text) {
      sessionCooldowns.delete(entry.sessionId);
      sessionLastMetaError.delete(entry.sessionId);
      const preview = cleanMetaAiReply(probeResult.text) || stripCustomerCodeTags(probeResult.text);
      return {
        ok: true,
        connected: true,
        verified: true,
        code: 'VERIFIED',
        sessionId: entry.sessionId,
        phoneNumber: entry.phoneNumber,
        hasOfficialBotEntry,
        botReplyPreview: preview.slice(0, 220),
        message: 'Meta AI aktif dan berhasil merespons! Fitur Meta AI Balas Otomatis siap diaktifkan.'
      };
    }

    // Do not keep a 3-minute cooldown after a failed manual verify probe so user can re-verify right after chatting on WA
    sessionCooldowns.delete(entry.sessionId);

    const lastErr = sessionLastMetaError.get(entry.sessionId);
    const diagnosticReason = probeResult.reason || lastErr?.message || 'Meta AI tidak merespons sapaan awal.';

    return {
      ok: false,
      connected: true,
      verified: false,
      code: 'META_AI_NEEDS_FIRST_CHAT',
      sessionId: entry.sessionId,
      phoneNumber: entry.phoneNumber,
      hasOfficialBotEntry,
      diagnosticReason,
      message:
        'Nomor WhatsApp ini belum pernah chat atau belum mengaktifkan Meta AI di aplikasi WhatsApp. Silakan chat Meta AI dulu di WhatsApp sampai dibalas, lalu klik Verifikasi.'
    };
  } catch (err: any) {
    sessionCooldowns.delete(entry.sessionId);
    return {
      ok: false,
      connected: true,
      verified: false,
      code: 'META_AI_NEEDS_FIRST_CHAT',
      sessionId: entry.sessionId,
      phoneNumber: entry.phoneNumber,
      hasOfficialBotEntry,
      diagnosticReason: err?.message || 'Gagal memverifikasi Meta AI.',
      message:
        'Belum menerima balasan dari Meta AI. Pastikan akun WhatsApp ini sudah pernah chat dengan Meta AI di aplikasi WhatsApp.'
    };
  }
}

export async function askMetaAiViaBaileys(
  params: MetaAiQueryParams,
  offlineFallbackText?: string
): Promise<MetaAiQueryResult> {
  const fallbackReply =
    (offlineFallbackText || '').trim() ||
    'Halo! Terima kasih telah menghubungi kami. Pesan Anda sudah kami terima dan akan segera ditindaklanjuti oleh tim CS kami.';

  const startedAt = Date.now();

  const cleanMessage = String(params.messageBody || '').trim();
  if (!cleanMessage) {
    return {
      replyText: fallbackReply,
      usedAi: false,
      isOfflineFallback: true,
      retryable: false,
      source: 'offline_fallback',
      sessionId: params.sessionId,
      errorReason: 'Pesan pelanggan kosong.'
    };
  }

  if (!socketProvider) {
    const err = 'Provider sesi WhatsApp Baileys belum diinisialisasi.';
    recordAiAuditEvent({
      level: 'ERROR',
      stage: 'socket_lookup',
      user_id: params.userId,
      session_id: params.sessionId,
      customer_code: params.customerCode,
      senderPhone: params.senderPhone,
      error_code: 'NO_SOCKET_PROVIDER',
      reason: err
    });
    return {
      replyText: fallbackReply,
      usedAi: false,
      isOfflineFallback: true,
      retryable: true,
      source: 'offline_fallback',
      errorReason: err
    };
  }

  let entry = socketProvider(params.userId, params.sessionId);
  if (!entry || !isSocketOpen(entry.socket)) {
    entry = await ensureConnectedMetaAiSocketForUser(params.userId, params.sessionId);
  }
  if (!entry || !isSocketOpen(entry.socket)) {
    const err = 'Belum ada perangkat WhatsApp Baileys yang terhubung untuk akun ini.';
    recordAiAuditEvent({
      level: 'WARN',
      stage: 'socket_lookup',
      user_id: params.userId,
      session_id: params.sessionId,
      customer_code: params.customerCode,
      senderPhone: params.senderPhone,
      error_code: 'SOCKET_DISCONNECTED',
      reason: err
    });
    return {
      replyText: fallbackReply,
      usedAi: false,
      isOfflineFallback: true,
      retryable: true,
      source: 'offline_fallback',
      errorReason: err
    };
  }

  const isManualTestChat = String(params.senderPhone || '').replace(/\D/g, '') === '628999000111';
  const hasIsolatedSessionState = Boolean(
    params.customerCode ||
    params.orderSummary ||
    (Array.isArray(params.customerHistory) && params.customerHistory.length > 0) ||
    (Array.isArray(params.catalogProducts) && params.catalogProducts.length > 0)
  );
  const canUseResponseCache = !isManualTestChat && !hasIsolatedSessionState && cleanMessage.length <= 240;

  const cacheKey = buildResponseCacheKey(
    params.userId,
    params.customSystemPrompt || '',
    cleanMessage,
    params.autoReplyRules,
    params.catalogShopName,
    params.catalogProducts
  );
  if (canUseResponseCache) {
    const cachedReply = getCachedMetaResponse(cacheKey);
    if (cachedReply) {
      return {
        replyText: cachedReply,
        usedAi: true,
        isOfflineFallback: false,
        retryable: false,
        source: 'meta_ai_whatsapp',
        sessionId: entry.sessionId
      };
    }
  }

  const activeCooldown = getActiveSessionCooldown(entry.sessionId);
  if (activeCooldown) {
    recordAiAuditEvent({
      level: 'WARN',
      stage: 'cooldown_guard',
      user_id: params.userId,
      session_id: entry.sessionId,
      customer_code: params.customerCode,
      senderPhone: params.senderPhone,
      error_code: 'COOLDOWN_ACTIVE',
      reason: activeCooldown.reason
    });
    const isPermanentBotUnavailable = activeCooldown.reason.includes('bot_unavailable_fanout');
    return {
      replyText: fallbackReply,
      usedAi: false,
      isOfflineFallback: true,
      retryable: !isPermanentBotUnavailable,
      source: 'offline_fallback',
      sessionId: entry.sessionId,
      errorReason: activeCooldown.reason
    };
  }

  if (!checkAndRecordSenderBurst(entry.sessionId, params.senderPhone)) {
    const err = 'Pengirim sedang dalam jeda anti-flood singkat untuk melindungi akun Meta AI.';
    recordAiAuditEvent({
      level: 'WARN',
      stage: 'anti_flood',
      user_id: params.userId,
      session_id: entry.sessionId,
      customer_code: params.customerCode,
      senderPhone: params.senderPhone,
      error_code: 'SENDER_BURST_LIMIT',
      reason: err
    });
    return {
      replyText: fallbackReply,
      usedAi: false,
      isOfflineFallback: true,
      retryable: true,
      source: 'offline_fallback',
      sessionId: entry.sessionId,
      errorReason: err
    };
  }

  const promptText = buildMetaAiPrompt(params);

  const runQueuedMetaQuery = async (targetSessionId: string): Promise<{ ok: boolean; text?: string; reason?: string; socketDropped?: boolean }> => {
    return await enqueueSessionTask(targetSessionId, async () => {
      const liveEntry = socketProvider ? socketProvider(params.userId, targetSessionId) : null;
      if (!liveEntry || !isSocketOpen(liveEntry.socket)) {
        return {
          ok: false,
          socketDropped: true,
          reason: 'Perangkat WhatsApp Baileys terputus sebelum mengirim ke Meta AI.'
        };
      }

      const cooldownInsideQueue = getActiveSessionCooldown(liveEntry.sessionId);
      if (cooldownInsideQueue) {
        return { ok: false, reason: cooldownInsideQueue.reason };
      }

      // Enforce natural inter-query spacing + periodic breather every 6 consecutive messages
      const lastAt = sessionLastPromptAt.get(liveEntry.sessionId) || 0;
      const consecutive = (sessionConsecutiveSends.get(liveEntry.sessionId) || 0) + 1;
      sessionConsecutiveSends.set(liveEntry.sessionId, consecutive);
      const breatherMs = consecutive % 6 === 0 ? crypto.randomInt(1800, 3000) : 0;
      const minGapMs = MIN_INTER_QUERY_MS + crypto.randomInt(0, INTER_QUERY_JITTER_MS) + breatherMs;
      const elapsed = Date.now() - lastAt;
      if (lastAt > 0 && elapsed < minGapMs) {
        await new Promise((r) => setTimeout(r, minGapMs - elapsed));
      }

      const rateCheck = await waitAndRecordSessionRateWindow(liveEntry.sessionId);
      if (!rateCheck.allowed) {
        return { ok: false, reason: rateCheck.reason };
      }

      // Ensure raw ws interception for msmsg/@bot is active on this socket
      attachMetaAiRawSocketHandlers(liveEntry.socket, liveEntry.sessionId);

      // Cancel any stale orphaned waiter if present
      if (activeWaiters.has(liveEntry.sessionId)) {
        finalizeWaiter(liveEntry.sessionId, { ok: false, reason: 'Waiter digantikan oleh antrean baru.' });
      }

      rememberPromptEcho(liveEntry.sessionId, promptText);

      return await new Promise<{ ok: boolean; text?: string; reason?: string; socketDropped?: boolean }>(async (resolve) => {
        const hardTimer = setTimeout(() => {
          const current = activeWaiters.get(liveEntry.sessionId);
          if (current && !current.settled && current.latestText) {
            finalizeWaiter(liveEntry.sessionId, { ok: true, text: current.latestText });
          } else {
            // Reset stale Signal/JID caches so next message retries fresh immediately without multi-minute freeze
            sessionPreferredMetaJid.delete(liveEntry.sessionId);
            for (const key of Array.from(botSignalReadyCache.keys())) {
              if (key.startsWith(`${liveEntry.sessionId}::`)) {
                botSignalReadyCache.delete(key);
              }
            }
            finalizeWaiter(liveEntry.sessionId, {
              ok: false,
              reason:
                current?.lastAckError ||
                'Meta AI di WhatsApp tidak merespons tepat waktu (timeout). Pastikan fitur Meta AI aktif pada akun WhatsApp yang tertaut.'
            });
          }
        }, HARD_TIMEOUT_MS);

        const waiter: PendingWaiter = {
          sessionId: liveEntry.sessionId,
          customerCode: params.customerCode,
          promptSent: promptText,
          sentAt: Date.now(),
          latestText: '',
          hasSignal: false,
          settled: false,
          pendingAckMsgIds: new Set<string>(),
          msgIdToTargetJid: new Map<string, string>(),
          resolve,
          hardTimer,
          settleTimer: null,
          retryTimer: null
        };
        activeWaiters.set(liveEntry.sessionId, waiter);

        try {
          const sendRes = await sendPromptToMetaAi(liveEntry.sessionId, liveEntry.socket, promptText, waiter);
          if (sendRes.remainingCandidates.length > 0 && !waiter.settled && !waiter.hasSignal) {
            let candidateIdx = 0;
            const tryNextCandidate = async (): Promise<boolean> => {
              const current = activeWaiters.get(liveEntry.sessionId);
              if (!current || current.settled || current.hasSignal || current.latestText) return false;
              if (current.fallbackInProgress) return true;
              current.fallbackInProgress = true;
              try {
                while (candidateIdx < sendRes.remainingCandidates.length) {
                  const nextJid = sendRes.remainingCandidates[candidateIdx++];
                  try {
                    await sendPromptToSingleJid(liveEntry.sessionId, liveEntry.socket, nextJid, promptText, current);
                    if (candidateIdx >= sendRes.remainingCandidates.length) {
                      current.fallbackAttemptFn = undefined;
                    } else if (!current.settled && !current.hasSignal) {
                      current.retryTimer = setTimeout(() => {
                        void tryNextCandidate();
                      }, SILENT_FALLBACK_RETRY_MS);
                    }
                    return true;
                  } catch {
                    // Continue trying next candidate JID
                  }
                }
                current.fallbackAttemptFn = undefined;
                return false;
              } finally {
                current.fallbackInProgress = false;
              }
            };
            waiter.fallbackAttemptFn = tryNextCandidate;
            waiter.retryTimer = setTimeout(() => {
              void tryNextCandidate();
            }, SILENT_FALLBACK_RETRY_MS);
          }
        } catch (sendErr: any) {
          const errStr = String(sendErr?.message || '');
          const droppedNow = !isSocketOpen(liveEntry.socket) || /closed|terputus|connection/i.test(errStr);
          finalizeWaiter(liveEntry.sessionId, {
            ok: false,
            reason: errStr || 'Gagal mengirim pesan ke kontak Meta AI.'
          });
          if (droppedNow) {
            // Best-effort annotation on result isn't needed separately because reason contains terputus/closed
          }
        }
      });
    });
  };

  try {
    let queryResult = await runQueuedMetaQuery(entry.sessionId);

    // Single-shot automatic reconnect retry if socket momentarily dropped or stalled mid-query
    const liveAfterFirstAttempt = socketProvider ? socketProvider(params.userId, entry.sessionId) : null;
    const lostSocketMidQuery =
      !queryResult.ok &&
      (queryResult.socketDropped ||
        !liveAfterFirstAttempt ||
        !isSocketOpen(liveAfterFirstAttempt.socket) ||
        !isSocketOpen(entry.socket) ||
        /terputus|closed|connection|not open|timeout mengirim prompt/i.test(queryResult.reason || ''));
    if (lostSocketMidQuery) {
      await new Promise((r) => setTimeout(r, 1200));
      const recovered = await ensureConnectedMetaAiSocketForUser(
        params.userId,
        params.sessionId || entry.sessionId,
        { forceReconnect: true }
      );
      if (recovered && isSocketOpen(recovered.socket)) {
        entry = recovered;
        queryResult = await runQueuedMetaQuery(recovered.sessionId);
      }
    }

    if (queryResult.ok && queryResult.text) {
      sessionCooldowns.delete(entry.sessionId);
      sessionLastMetaError.delete(entry.sessionId);
      const cleanedBase = cleanMetaAiReply(queryResult.text) || stripCustomerCodeTags(queryResult.text);
      const cleaned = reconcileCatalogImageLinksInReply(cleanedBase, cleanMessage, params.catalogProducts);

      // Zero-Leak Firewall: NEVER allow internal prompt scaffolding or prompt echoes to exit Meta AI service
      if (
        !cleaned ||
        isInternalPromptLeakText(queryResult.text) ||
        isInternalPromptLeakText(cleanedBase) ||
        isInternalPromptLeakText(cleaned) ||
        hasHighOverlapWithSentPrompt(cleaned, promptText)
      ) {
        responseCache.delete(cacheKey);
        const leakReason = 'Firewall memblokir respon Meta AI karena terdeteksi mengandung format prompt internal.';
        console.error(`[Meta AI Prompt-Leak Firewall] BLOCKED leaked prompt output on session ${entry.sessionId} (${params.customerCode || '-'})!`);
        recordAiAuditEvent({
          level: 'ERROR',
          stage: 'meta_ai_firewall',
          user_id: params.userId,
          session_id: entry.sessionId,
          customer_code: params.customerCode,
          senderPhone: params.senderPhone,
          error_code: 'PROMPT_LEAK_BLOCKED',
          reason: leakReason,
          latency_ms: Date.now() - startedAt
        });
        return {
          replyText: fallbackReply,
          usedAi: false,
          isOfflineFallback: true,
          retryable: true,
          source: 'offline_fallback',
          sessionId: entry.sessionId,
          errorReason: leakReason
        };
      }

      if (canUseResponseCache && cleaned) {
        storeCachedMetaResponse(cacheKey, cleaned);
      }
      recordAiAuditEvent({
        level: 'INFO',
        stage: 'meta_ai_reply',
        user_id: params.userId,
        session_id: entry.sessionId,
        customer_code: params.customerCode,
        senderPhone: params.senderPhone,
        reason: 'Meta AI berhasil merespons pelanggan.',
        latency_ms: Date.now() - startedAt
      });
      return {
        replyText: cleaned,
        usedAi: true,
        isOfflineFallback: false,
        retryable: false,
        source: 'meta_ai_whatsapp',
        sessionId: entry.sessionId
      };
    }

    const errReason = queryResult.reason || 'Meta AI tidak memberikan balasan.';
    const lowerReason = errReason.toLowerCase();
    const isPermanentUnavailable = lowerReason.includes('bot_unavailable_fanout');
    const isRetryableFailure = !isPermanentUnavailable;
    recordAiAuditEvent({
      level: 'ERROR',
      stage: lowerReason.includes('timeout') ? 'meta_ai_timeout' : 'meta_ai_reply',
      user_id: params.userId,
      session_id: entry.sessionId,
      customer_code: params.customerCode,
      senderPhone: params.senderPhone,
      error_code: lowerReason.includes('timeout') ? 'META_AI_TIMEOUT' : 'META_AI_NO_REPLY',
      reason: errReason,
      latency_ms: Date.now() - startedAt
    });
    return {
      replyText: fallbackReply,
      usedAi: false,
      isOfflineFallback: true,
      retryable: isRetryableFailure,
      source: 'offline_fallback',
      sessionId: entry.sessionId,
      errorReason: errReason
    };
  } catch (err: any) {
    const errMsg = err?.message || 'Gagal memproses antrean Meta AI.';
    recordAiAuditEvent({
      level: 'ERROR',
      stage: 'meta_ai_reply',
      user_id: params.userId,
      session_id: entry.sessionId,
      customer_code: params.customerCode,
      senderPhone: params.senderPhone,
      error_code: 'META_AI_QUEUE_EXCEPTION',
      reason: errMsg,
      latency_ms: Date.now() - startedAt
    });
    return {
      replyText: fallbackReply,
      usedAi: false,
      isOfflineFallback: true,
      retryable: true,
      source: 'offline_fallback',
      sessionId: entry.sessionId,
      errorReason: errMsg
    };
  }
}
