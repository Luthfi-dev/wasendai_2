import fs from 'fs';
import path from 'path';

export type AiAuditLevel = 'INFO' | 'WARN' | 'ERROR';

export type AiAuditStage =
  | 'auto_reply_gate'
  | 'ai_gate'
  | 'quota_gate'
  | 'socket_lookup'
  | 'cooldown_guard'
  | 'anti_flood'
  | 'rate_limit'
  | 'meta_ai_ack'
  | 'meta_ai_stanza'
  | 'msmsg_decrypt'
  | 'meta_ai_timeout'
  | 'meta_ai_reply'
  | 'meta_ai_firewall'
  | 'prompt_leak_firewall'
  | 'reply_send'
  | 'verify_probe';

export interface AiAuditRecord {
  timestamp: string;
  level: AiAuditLevel;
  stage: AiAuditStage;
  session_id?: string;
  user_id?: string;
  customer_code?: string;
  sender_masked?: string;
  error_code?: string;
  reason: string;
  latency_ms?: number;
}

const LOG_DIR = path.resolve(process.cwd(), 'logs');
const AUDIT_LOG_PATH = path.join(LOG_DIR, 'meta-ai-audit.log');
const AUDIT_ROTATED_PATH = path.join(LOG_DIR, 'meta-ai-audit.prev.log');
const MAX_AUDIT_FILE_BYTES = 2 * 1024 * 1024; // 2 MB auto-rotation
const MAX_RECENT_MEMORY = 250;

const recentMemoryAuditLogs: AiAuditRecord[] = [];

function isEphemeralTestMode(): boolean {
  return process.env.JAPRIIN_EPHEMERAL_DB === '1';
}

function sanitizeLogField(value: unknown, maxLen = 240): string {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/[\r\n\t\x00-\x1f\x7f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export function maskPhoneForAudit(phone?: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '-';
  if (digits.length <= 6) return `${digits.slice(0, 2)}***`;
  return `${digits.slice(0, 4)}****${digits.slice(-3)}`;
}

function ensureAuditLogDir(): boolean {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true, mode: 0o700 });
    }
    return true;
  } catch {
    return false;
  }
}

function rotateAuditLogIfNeeded(): void {
  try {
    if (!fs.existsSync(AUDIT_LOG_PATH)) return;
    const stat = fs.statSync(AUDIT_LOG_PATH);
    if (stat.size >= MAX_AUDIT_FILE_BYTES) {
      if (fs.existsSync(AUDIT_ROTATED_PATH)) {
        fs.unlinkSync(AUDIT_ROTATED_PATH);
      }
      fs.renameSync(AUDIT_LOG_PATH, AUDIT_ROTATED_PATH);
    }
  } catch {
    // Non-fatal rotation guard
  }
}

export function recordAiAuditEvent(input: Omit<AiAuditRecord, 'timestamp'> & { senderPhone?: string }): AiAuditRecord {
  const record: AiAuditRecord = {
    timestamp: new Date().toISOString(),
    level: input.level,
    stage: input.stage,
    session_id: sanitizeLogField(input.session_id, 80) || undefined,
    user_id: sanitizeLogField(input.user_id, 80) || undefined,
    customer_code: sanitizeLogField(input.customer_code, 40) || undefined,
    sender_masked: input.sender_masked
      ? sanitizeLogField(input.sender_masked, 32)
      : input.senderPhone
        ? maskPhoneForAudit(input.senderPhone)
        : undefined,
    error_code: sanitizeLogField(input.error_code, 64) || undefined,
    reason: sanitizeLogField(input.reason, 400) || '-',
    latency_ms:
      typeof input.latency_ms === 'number' && Number.isFinite(input.latency_ms)
        ? Math.max(0, Math.round(input.latency_ms))
        : undefined
  };

  recentMemoryAuditLogs.unshift(record);
  if (recentMemoryAuditLogs.length > MAX_RECENT_MEMORY) {
    recentMemoryAuditLogs.length = MAX_RECENT_MEMORY;
  }

  if (!isEphemeralTestMode() && ensureAuditLogDir()) {
    try {
      rotateAuditLogIfNeeded();
      const line = `${JSON.stringify(record)}\n`;
      fs.appendFileSync(AUDIT_LOG_PATH, line, { encoding: 'utf-8', mode: 0o600 });
    } catch {
      // Never break runtime message handling if disk write fails
    }
  }

  return record;
}

export function getAiAuditLogRelativePath(): string {
  return 'logs/meta-ai-audit.log';
}

export function getRecentAiAuditLogs(options?: {
  limit?: number;
  level?: AiAuditLevel | 'ALL';
}): AiAuditRecord[] {
  const limit = Math.max(1, Math.min(200, Number(options?.limit) || 50));
  const levelFilter = options?.level && options.level !== 'ALL' ? options.level : null;

  let items: AiAuditRecord[] = [];

  if (!isEphemeralTestMode() && fs.existsSync(AUDIT_LOG_PATH)) {
    try {
      const stat = fs.statSync(AUDIT_LOG_PATH);
      // Read at most last 256 KB from tail for fast bounded reads
      const maxReadBytes = Math.min(stat.size, 256 * 1024);
      const fd = fs.openSync(AUDIT_LOG_PATH, 'r');
      try {
        const buffer = Buffer.alloc(maxReadBytes);
        fs.readSync(fd, buffer, 0, maxReadBytes, Math.max(0, stat.size - maxReadBytes));
        const rawLines = buffer.toString('utf-8').split(/\r?\n/).filter(Boolean);
        // If we started mid-line from tail offset, drop the first possibly truncated line
        const lines = stat.size > maxReadBytes ? rawLines.slice(1) : rawLines;
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const parsed = JSON.parse(lines[i]) as AiAuditRecord;
            if (!parsed || !parsed.timestamp || !parsed.reason) continue;
            if (levelFilter && parsed.level !== levelFilter) continue;
            items.push(parsed);
            if (items.length >= limit) break;
          } catch {
            // Skip malformed lines safely
          }
        }
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      items = [];
    }
  }

  if (items.length === 0 && recentMemoryAuditLogs.length > 0) {
    items = recentMemoryAuditLogs
      .filter(entry => !levelFilter || entry.level === levelFilter)
      .slice(0, limit);
  }

  return items;
}
