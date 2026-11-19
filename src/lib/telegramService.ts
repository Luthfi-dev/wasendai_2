import { getActiveTelegramTargets, getWhitelabelConfig } from './db.js';

const telegramAlertCooldowns = new Map<string, number>();

export function escapeTelegramHtml(input: unknown): string {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function capCooldownMap() {
  if (telegramAlertCooldowns.size <= 500) return;
  const now = Date.now();
  for (const [k, exp] of telegramAlertCooldowns.entries()) {
    if (exp <= now) telegramAlertCooldowns.delete(k);
  }
  while (telegramAlertCooldowns.size > 500) {
    const oldest = telegramAlertCooldowns.keys().next().value;
    if (!oldest) break;
    telegramAlertCooldowns.delete(oldest);
  }
}

async function postTelegramSendMessage(params: {
  botToken: string;
  chatId: string;
  text: string;
  parseMode?: 'HTML' | null;
}): Promise<{ ok: boolean; status?: number; error?: string }> {
  const token = String(params.botToken || '').trim();
  const chatId = String(params.chatId || '').trim();
  if (!token || !chatId) {
    return { ok: false, error: 'Bot token atau Chat ID Telegram kosong.' };
  }

  // Strictly enforce Telegram official API host only (never allow arbitrary URLs)
  const endpoint = `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`;
  const bodyPayload: Record<string, unknown> = {
    chat_id: chatId,
    text: String(params.text || '').slice(0, 3900),
    disable_web_page_preview: true
  };
  if (params.parseMode !== null) {
    bodyPayload.parse_mode = params.parseMode || 'HTML';
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload),
      signal: AbortSignal.timeout(7000)
    });

    const data: any = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      const desc =
        typeof data?.description === 'string' && data.description
          ? data.description.slice(0, 220)
          : `HTTP ${res.status}`;
      return { ok: false, status: res.status, error: desc };
    }
    return { ok: true, status: res.status };
  } catch (err: any) {
    return { ok: false, error: err?.message ? String(err.message).slice(0, 180) : 'Timeout / gagal terhubung ke Telegram API' };
  }
}

export async function testTelegramNotification(params: {
  botToken: string;
  chatId: string;
  label?: string;
  appId?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const appName = getWhitelabelConfig()?.app_name || 'Japriin';
  const msg =
    `✅ <b>Tes Notifikasi Telegram Berhasil</b>\n\n` +
    `• Aplikasi: <b>${escapeTelegramHtml(appName)}</b>\n` +
    (params.label ? `• Label Target: ${escapeTelegramHtml(params.label)}\n` : '') +
    (params.appId ? `• Node APP_ID: <code>${escapeTelegramHtml(params.appId)}</code>\n` : '') +
    `• Waktu: ${escapeTelegramHtml(new Date().toLocaleString('id-ID'))}\n\n` +
    `Saluran ini siap menerima alert otomatis jika ada app mati/offline, failover sesi WA, konflik 440, atau kendala cluster lainnya.`;

  return postTelegramSendMessage({
    botToken: params.botToken,
    chatId: params.chatId,
    text: msg,
    parseMode: 'HTML'
  });
}

export async function sendTelegramAlert(params: {
  title: string;
  lines: string[];
  severity?: 'info' | 'warn' | 'critical' | 'success';
  dedupKey?: string;
  cooldownMs?: number;
}): Promise<{ sent: number; failed: number; skippedCooldown?: boolean }> {
  if (params.dedupKey) {
    const now = Date.now();
    const existingUntil = telegramAlertCooldowns.get(params.dedupKey) || 0;
    if (existingUntil > now) {
      return { sent: 0, failed: 0, skippedCooldown: true };
    }
    const cd = Math.max(5_000, params.cooldownMs ?? 120_000);
    telegramAlertCooldowns.set(params.dedupKey, now + cd);
    capCooldownMap();
  }

  const targets = getActiveTelegramTargets();
  if (targets.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const appName = getWhitelabelConfig()?.app_name || 'Japriin';
  const icon =
    params.severity === 'critical'
      ? '🚨'
      : params.severity === 'warn'
        ? '⚠️'
        : params.severity === 'success'
          ? '✅'
          : 'ℹ️';

  const bodyLines = (params.lines || []).filter(Boolean).join('\n');
  const fullMessage =
    `${icon} <b>${escapeTelegramHtml(params.title)}</b>\n` +
    `<i>${escapeTelegramHtml(appName)} · ${escapeTelegramHtml(new Date().toLocaleString('id-ID'))}</i>\n\n` +
    bodyLines;

  let sent = 0;
  let failed = 0;
  const results = await Promise.allSettled(
    targets.map(t =>
      postTelegramSendMessage({
        botToken: t.botToken,
        chatId: t.chatId,
        text: fullMessage,
        parseMode: 'HTML'
      })
    )
  );

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.ok) {
      sent++;
    } else {
      failed++;
      const errMsg = r.status === 'fulfilled' ? r.value.error : String(r.reason || 'unknown');
      console.warn('[Telegram Alert] Gagal mengirim notifikasi:', errMsg);
    }
  }

  return { sent, failed };
}
