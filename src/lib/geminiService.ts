import { askMetaAiViaBaileys, getMetaAiAvailabilityForUser } from './metaAiService.js';

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024; // 5 MB max upload ceiling
const MIN_RECEIPT_BYTES = 100;

function hasValidImageMagicBytes(buf: Buffer, mimeType: string): boolean {
  if (buf.length < 12) return false;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
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

  // JPEG: FF D8 FF
  if (mimeType === 'image/jpeg') {
    return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }

  // WEBP: RIFF....WEBP
  if (mimeType === 'image/webp') {
    return (
      buf.toString('ascii', 0, 4) === 'RIFF' &&
      buf.toString('ascii', 8, 12) === 'WEBP'
    );
  }

  // GIF: GIF87a or GIF89a
  if (mimeType === 'image/gif') {
    const header = buf.toString('ascii', 0, 6);
    return header === 'GIF87a' || header === 'GIF89a';
  }

  return false;
}

/**
 * Compatibility wrapper: delegates AI auto-reply to native Meta AI via connected Baileys WhatsApp.
 * No external Gemini API key or @google/genai SDK is used.
 */
export async function generateGeminiAutoReply(params: {
  senderPhone: string;
  senderName: string;
  messageBody: string;
  customSystemPrompt?: string;
  customApiKey?: string;
  userId?: string;
}): Promise<{ reply: string; usedAi: boolean; usedKeyName?: string; usedModel?: string }> {
  const res = await askMetaAiViaBaileys({
    userId: params.userId,
    senderPhone: params.senderPhone,
    senderName: params.senderName,
    messageBody: params.messageBody,
    customSystemPrompt: params.customSystemPrompt
  });

  return {
    reply: res.replyText,
    usedAi: res.usedAi,
    usedKeyName: res.usedAi ? 'Meta AI WhatsApp (Baileys)' : undefined,
    usedModel: 'meta-ai-whatsapp'
  };
}

/**
 * Checks native Meta AI availability via connected Baileys socket instead of calling Gemini API.
 */
export async function testGeminiApiKey(
  _apiKey?: string,
  userId?: string
): Promise<{ success: boolean; message: string }> {
  const status = getMetaAiAvailabilityForUser(userId);
  if (status.connected) {
    return {
      success: true,
      message: `Meta AI WhatsApp siap digunakan melalui sesi Baileys (${status.phoneNumber || status.sessionId}). Tidak memerlukan API Key Gemini.`
    };
  }
  return {
    success: false,
    message:
      'Aplikasi sekarang menggunakan Meta AI bawaan WhatsApp (tanpa API Key Gemini). Hubungkan minimal 1 nomor WhatsApp di menu Koneksi WA terlebih dahulu.'
  };
}

/**
 * Strict payment receipt file validator (fail-closed: always requires manual Superadmin audit).
 * Validates MIME allowlist, file size bounds (100 B - 5 MB), and binary magic bytes (PNG/JPEG/WEBP/GIF).
 */
export async function verifyPaymentReceiptWithAi(params: {
  receiptBase64?: string;
  paymentNote?: string;
  expectedPrice: number;
  planName: string;
}): Promise<{
  isValid: boolean;
  confidence: 'high' | 'medium' | 'low';
  amountDetected: number;
  bankOrWallet: string;
  transactionRef: string;
  reason: string;
  autoApproved: boolean;
}> {
  if (!params.expectedPrice || params.expectedPrice <= 0) {
    return {
      isValid: false,
      confidence: 'low',
      amountDetected: 0,
      bankOrWallet: '-',
      transactionRef: 'ERR_INVALID_PLAN',
      reason: 'Paket berbayar tidak valid.',
      autoApproved: false
    };
  }

  if (!params.receiptBase64 || typeof params.receiptBase64 !== 'string') {
    return {
      isValid: false,
      confidence: 'low',
      amountDetected: 0,
      bankOrWallet: '-',
      transactionRef: 'MISSING_RECEIPT',
      reason: 'Foto/screenshot bukti transfer wajib diunggah sebelum mengirim permohonan upgrade.',
      autoApproved: false
    };
  }

  const base64Match = params.receiptBase64.match(
    /^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i
  );
  if (!base64Match) {
    return {
      isValid: false,
      confidence: 'low',
      amountDetected: 0,
      bankOrWallet: '-',
      transactionRef: 'INVALID_IMAGE_FORMAT',
      reason: 'Format gambar bukti transfer tidak didukung. Gunakan file JPG, PNG, WEBP, atau GIF asli.',
      autoApproved: false
    };
  }

  const rawMime = base64Match[1].toLowerCase();
  const mimeType = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime;
  const pureBase64 = base64Match[2].replace(/\s+/g, '');
  const decoded = Buffer.from(pureBase64, 'base64');

  if (decoded.length < MIN_RECEIPT_BYTES || decoded.length > MAX_RECEIPT_BYTES) {
    return {
      isValid: false,
      confidence: 'low',
      amountDetected: 0,
      bankOrWallet: '-',
      transactionRef: 'INVALID_IMAGE_SIZE',
      reason: 'Ukuran file bukti transfer harus antara 100 byte hingga 5 MB.',
      autoApproved: false
    };
  }

  if (!hasValidImageMagicBytes(decoded, mimeType)) {
    return {
      isValid: false,
      confidence: 'low',
      amountDetected: 0,
      bankOrWallet: '-',
      transactionRef: 'INVALID_MAGIC_BYTES',
      reason: 'Konten binary gambar bukti transfer tidak sesuai dengan signature JPG/PNG/WEBP/GIF yang sah.',
      autoApproved: false
    };
  }

  // Always fail-closed to pending_approval so Superadmin manually verifies payment before activating paid plan
  return {
    isValid: false,
    confidence: 'medium',
    amountDetected: 0,
    bankOrWallet: 'Menunggu Audit Superadmin',
    transactionRef: `MANUAL_REVIEW_${Date.now()}`,
    reason: 'Bukti gambar valid diterima. Permintaan upgrade masuk antrean persetujuan manual Superadmin.',
    autoApproved: false
  };
}
