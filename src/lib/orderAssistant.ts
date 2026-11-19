import crypto from 'crypto';
import { CatalogPaymentAccount } from '../types/whatsapp.js';

export interface OrderCartItem {
  title: string;
  qty: number;
  unitPrice: number;
}

export interface CustomerConversationTurn {
  role: 'customer' | 'assistant';
  text: string;
  at: number;
}

export type CustomerOrderStage = 'browsing' | 'confirming_items' | 'awaiting_payment' | 'awaiting_payment_proof';

export interface CustomerOrderContext {
  key: string;
  customerCode: string;
  history: CustomerConversationTurn[];
  cart: OrderCartItem[];
  stage: CustomerOrderStage;
  invoiceNumber: string;
  selectedPaymentMethod?: 'qris' | 'rekening';
  notifiedPaidInvoices?: string[];
  updatedAt: number;
}

export interface ActiveCatalogPaymentInfo {
  enabled: boolean;
  shopName?: string;
  orderNotifyPhone?: string;
  products: Array<{
    title: string;
    description?: string;
    price: number;
    image_url?: string;
  }>;
  bankAccounts: CatalogPaymentAccount[];
  paymentNotes?: string;
  qrisImageUrl?: string;
  qrisPublicUrl?: string;
}

export interface DirectSystemOrderReply {
  text: string;
  sendQrisImage: boolean;
  qrisImageUrl?: string;
  qrisPublicUrl?: string;
  sendRekeningText: boolean;
  reason: string;
}

export interface ProcessedAiDirectiveResult {
  cleanText: string;
  sendQrisImage: boolean;
  qrisImageUrl?: string;
  qrisPublicUrl?: string;
  appendedRekening: boolean;
  orderPaidVerified: boolean;
}

const CUSTOMER_TTL_MS = 6 * 60 * 60 * 1000; // 6 jam
const MAX_TRACKED_CUSTOMERS = 1000;
const MAX_HISTORY_TURNS = 8;

const customerContexts = new Map<string, CustomerOrderContext>();

const maintenanceTimer = setInterval(() => {
  const cutoff = Date.now() - CUSTOMER_TTL_MS;
  for (const [k, v] of customerContexts.entries()) {
    if (v.updatedAt < cutoff) {
      customerContexts.delete(k);
    }
  }
}, 10 * 60 * 1000);
maintenanceTimer.unref?.();

function normalizePhoneKey(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return String(phone || 'guest').trim().toLowerCase();
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  return digits;
}

export function buildCustomerCode(scopeId: string, senderPhone: string): string {
  const norm = normalizePhoneKey(senderPhone);
  const digest = crypto.createHash('sha256').update(`${scopeId || 'global'}::${norm}`).digest();
  const num = 10000 + (digest.readUInt32BE(0) % 90000);
  return `customer_${num}`;
}

function generateInvoiceNumber(customerCode: string): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const suffix = customerCode.replace(/\D/g, '').slice(-3) || '001';
  const rand = crypto.randomInt(100, 999);
  return `INV-${ymd}-${suffix}${rand}`;
}

function evictOldestIfNeeded() {
  if (customerContexts.size <= MAX_TRACKED_CUSTOMERS) return;
  let oldestKey: string | null = null;
  let oldestTime = Infinity;
  for (const [k, v] of customerContexts.entries()) {
    if (v.updatedAt < oldestTime) {
      oldestTime = v.updatedAt;
      oldestKey = k;
    }
  }
  if (oldestKey) customerContexts.delete(oldestKey);
}

export function getOrCreateCustomerContext(scopeId: string, senderPhone: string): CustomerOrderContext {
  const normPhone = normalizePhoneKey(senderPhone);
  const key = `${scopeId || 'global'}::${normPhone}`;
  const now = Date.now();
  const existing = customerContexts.get(key);
  if (existing && now - existing.updatedAt < CUSTOMER_TTL_MS) {
    existing.updatedAt = now;
    return existing;
  }

  const customerCode = buildCustomerCode(scopeId, normPhone);
  const fresh: CustomerOrderContext = {
    key,
    customerCode,
    history: [],
    cart: [],
    stage: 'browsing',
    invoiceNumber: generateInvoiceNumber(customerCode),
    selectedPaymentMethod: undefined,
    notifiedPaidInvoices: [],
    updatedAt: now
  };
  customerContexts.set(key, fresh);
  evictOldestIfNeeded();
  return fresh;
}

export function clearCustomerOrderContext(scopeId: string, senderPhone: string): void {
  const normPhone = normalizePhoneKey(senderPhone);
  customerContexts.delete(`${scopeId || 'global'}::${normPhone}`);
}

export function recordCustomerTurn(
  scopeId: string,
  senderPhone: string,
  role: 'customer' | 'assistant',
  text: string
): void {
  const clean = String(text || '').trim();
  if (!clean) return;
  const ctx = getOrCreateCustomerContext(scopeId, senderPhone);
  ctx.history.push({
    role,
    text: clean.slice(0, 600),
    at: Date.now()
  });
  if (ctx.history.length > MAX_HISTORY_TURNS) {
    ctx.history = ctx.history.slice(-MAX_HISTORY_TURNS);
  }
  ctx.updatedAt = Date.now();
}

export function formatRupiahId(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  return `Rp${safe.toLocaleString('id-ID')}`;
}

export function calculateCartTotal(cart: OrderCartItem[]): number {
  return cart.reduce((sum, item) => sum + Math.max(0, item.unitPrice) * Math.max(1, item.qty), 0);
}

export function formatInvoiceText(
  cart: OrderCartItem[],
  invoiceNumber: string,
  shopName?: string
): string {
  if (!cart || cart.length === 0) return '';
  const total = calculateCartTotal(cart);
  const header = shopName ? `🧾 *INVOICE PESANAN — ${shopName}*` : `🧾 *INVOICE PESANAN*`;
  const lines = cart.map((item, idx) => {
    const subtotal = item.unitPrice * item.qty;
    const unitInfo = item.unitPrice > 0 ? `${formatRupiahId(item.unitPrice)} x ${item.qty} = *${formatRupiahId(subtotal)}*` : `${item.qty} pcs (harga dikonfirmasi admin)`;
    return `${idx + 1}. ${item.title}\n   ${unitInfo}`;
  });
  return [
    header,
    `No. Invoice: \`${invoiceNumber}\``,
    '',
    ...lines,
    '',
    `💰 *Total Tagihan: ${total > 0 ? formatRupiahId(total) : 'Sesuai konfirmasi admin'}*`
  ].join('\n');
}

export function formatAvailablePaymentMethodsList(catalog: ActiveCatalogPaymentInfo): string {
  const opts: string[] = [];
  if (catalog.bankAccounts.length > 0 || catalog.paymentNotes) {
    const bankNames = catalog.bankAccounts.map(b => b.bank_name).filter(Boolean);
    opts.push(bankNames.length > 0 ? `🏦 *Transfer Rekening* (${bankNames.join(' / ')})` : `🏦 *Transfer Rekening*`);
  }
  if (catalog.qrisImageUrl) {
    opts.push(`📱 *QRIS* (Scan QR Instan)`);
  }
  return opts.join('\n');
}

export function formatRekeningDetailsText(catalog: ActiveCatalogPaymentInfo): string {
  const lines: string[] = ['🏦 *Detail Transfer Rekening Pembayaran:*'];
  for (const acc of catalog.bankAccounts) {
    const holder = acc.account_holder ? ` a.n. *${acc.account_holder}*` : '';
    lines.push(`• *${acc.bank_name}*: \`${acc.account_number}\`${holder}`);
  }
  if (catalog.paymentNotes) {
    lines.push('');
    lines.push(catalog.paymentNotes);
  }
  return lines.join('\n').trim();
}

const STOP_WORDS = new Set([
  'saya', 'aku', 'mau', 'pesan', 'pesankan', 'pesen', 'order', 'beli', 'ambil', 'tambah', 'tambahkan',
  'sebanyak', 'jumlah', 'qty', 'buah', 'pcs', 'unit', 'ekor', 'paket', 'bungkus', 'botol', 'box',
  'yang', 'yg', 'nya', 'dong', 'kak', 'min', 'admin', 'tolong', 'bisa', 'minta', 'ya', 'ada', 'harga',
  'berapa', 'berapaan', 'itu', 'ini', 'ke', 'di', 'dan', 'atau', 'sama', 'dengan', 'untuk', 'buat'
]);

const WORD_NUMBERS: Record<string, number> = {
  satu: 1,
  dua: 2,
  tiga: 3,
  empat: 4,
  lima: 5,
  enam: 6,
  tujuh: 7,
  delapan: 8,
  sembilan: 9,
  sepuluh: 10
};

function parseQtyNearMatch(messageLower: string, titleLower: string): number {
  const escaped = titleLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const afterTitle = messageLower.match(new RegExp(`${escaped}\\s*(?:sebanyak|jumlah|qty|x|kali)?\\s*(\\d{1,3})\\b`, 'i'));
  if (afterTitle) return Math.min(999, Math.max(1, Number(afterTitle[1])));

  const beforeTitle = messageLower.match(new RegExp(`\\b(\\d{1,3})\\s*(?:pcs|buah|paket|unit|box|x)?\\s*${escaped}`, 'i'));
  if (beforeTitle) return Math.min(999, Math.max(1, Number(beforeTitle[1])));

  const genericSebanyak = messageLower.match(/\b(?:sebanyak|jumlah|qty|order|pesan|pesankan|beli)\s+(\d{1,3})\b/i);
  if (genericSebanyak) return Math.min(999, Math.max(1, Number(genericSebanyak[1])));

  const standaloneQty = messageLower.match(/\b(\d{1,3})\s*(?:pcs|buah|paket|unit|box|botol|item|x)\b/i);
  if (standaloneQty) return Math.min(999, Math.max(1, Number(standaloneQty[1])));

  for (const [word, num] of Object.entries(WORD_NUMBERS)) {
    if (new RegExp(`\\b(?:sebanyak|pesan|pesankan|beli|order)\\s+${word}\\b|\\b${word}\\s+${escaped}`, 'i').test(messageLower)) {
      return num;
    }
  }

  return 1;
}

function detectOrderedProducts(
  messageText: string,
  products: ActiveCatalogPaymentInfo['products']
): OrderCartItem[] {
  if (!Array.isArray(products) || products.length === 0) return [];
  const lower = messageText.toLowerCase();

  // Only detect an order mutation when there's an explicit order intent OR stage-relevant product + quantity
  const hasOrderVerb =
    /\b(pesan(?:kan)?|pesen|order|beli|checkout|cekout|tambah(?:kan)?|ambil(?:kan)?|mau\s+(?:beli|pesan|order|ambil))\b/i.test(lower);
  const hasExplicitQty = /\b\d{1,3}\s*(?:pcs|buah|paket|unit|box|botol|item|x)?\b/i.test(lower);
  if (!hasOrderVerb && !hasExplicitQty) return [];

  // Split multi-item segments by comma or "dan" / "sama"
  const segments = lower.split(/(?:,|\bdan\b|\bsama\b|\+|\n)+/).map(s => s.trim()).filter(Boolean);
  const detected: Map<string, OrderCartItem> = new Map();

  for (const segment of segments.length > 0 ? segments : [lower]) {
    let bestProduct: ActiveCatalogPaymentInfo['products'][number] | null = null;
    let bestScore = 0;

    for (const p of products) {
      const titleLower = p.title.toLowerCase().trim();
      if (!titleLower) continue;

      let score = 0;
      if (segment.includes(titleLower)) {
        score = 100 + titleLower.length;
      } else {
        const tokens = titleLower
          .split(/[^a-z0-9]+/i)
          .filter(t => t.length >= 2 && !STOP_WORDS.has(t));
        if (tokens.length > 0) {
          let hits = 0;
          for (const t of tokens) {
            if (new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(segment)) {
              hits++;
            }
          }
          if (hits > 0 && (hits === tokens.length || (tokens.length >= 2 && hits >= Math.ceil(tokens.length * 0.6)))) {
            score = hits * 20;
          }
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestProduct = p;
      }
    }

    if (bestProduct && bestScore >= 20) {
      const qty = parseQtyNearMatch(segment, bestProduct.title.toLowerCase().trim());
      const prev = detected.get(bestProduct.title);
      if (prev) {
        prev.qty += qty;
      } else {
        detected.set(bestProduct.title, {
          title: bestProduct.title,
          qty,
          unitPrice: Math.max(0, Math.round(Number(bestProduct.price) || 0))
        });
      }
    }
  }

  return Array.from(detected.values());
}

function isCancelOrderIntent(lower: string): boolean {
  return /\b(batal(?:kan)?|cancel|kosongkan|reset\s*pesanan|ganti\s*semua|ga\s*jadi|gak\s*jadi|tidak\s*jadi)\b/i.test(lower);
}

function isConfirmNoMoreItemsIntent(lower: string): boolean {
  if (lower.length > 90) return false;
  return /^(?:tidak|nggak|enggak|engga|gak|ga|tdk|no|nope|tidak\s*ada|nggak\s*ada|gak\s*ada|tdk\s*ada|cukup|sudah|udah|udh|oke|ok|okey|siap|pas|lanjut|checkout|cekout|total(?:in|kan)?|mau\s*bayar|lanjut\s*bayar)(?:\s+(?:kak|min|admin|terima\s*kasih|makasih|aja|saja|kok|ya|nih|deh|itu\s*aja|itu\s*saja))*[!.\s]*$/i.test(
    lower.trim()
  ) || /\b(tidak\s+ada\s+tambahan|sudah\s+(?:oke|ok|cukup|pas|semua)|itu\s+(?:aja|saja)|lanjut\s+checkout|proses\s+checkout|mau\s+bayar\s+sekarang)\b/i.test(lower);
}

function detectPaymentSelection(
  lower: string,
  stage: CustomerOrderStage,
  catalog: ActiveCatalogPaymentInfo
): 'qris' | 'rekening' | null {
  const isGeneralInquiry =
    /\b(metode\s*(?:pembayaran|bayar)|bayar(?:nya)?\s*(?:pakai|pake|via|lewat)\s*apa|pembayaran\s*apa|bisa\s*bayar\s*apa|pilihan\s*bayar)\b/i.test(lower);

  const wantsQris =
    /\b(qris|qr\s*code|kode\s*qr|barcode\s*qris|scan\s*qr|pake\s*qris|pakai\s*qris|bayar\s*qris|via\s*qris|minta\s*qris|kirim\s*qris)\b/i.test(lower) ||
    (stage === 'awaiting_payment' && /\bqr\b/i.test(lower));

  const bankNames = catalog.bankAccounts
    .map(b => b.bank_name.toLowerCase().trim())
    .filter(n => n.length >= 2);
  const mentionsBankName = bankNames.some(name => {
    const firstWord = name.split(/\s+/)[0];
    return firstWord.length >= 2 && new RegExp(`\\b${firstWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lower);
  });

  const wantsRek =
    /\b(rek|rekening|no\s*rek|norek|transfer(?:\s+bank)?|tf|via\s*bank|pake\s*rek|pakai\s*rek|bayar\s*rek|minta\s*rek|kirim\s*rek)\b/i.test(lower) ||
    mentionsBankName;

  if (isGeneralInquiry && wantsQris && wantsRek) {
    return null;
  }
  if (wantsQris && wantsRek) {
    return null;
  }

  if (wantsQris && catalog.qrisImageUrl) {
    return 'qris';
  }
  if (wantsRek && (catalog.bankAccounts.length > 0 || catalog.paymentNotes)) {
    return 'rekening';
  }

  return null;
}

export function isPaymentProofOrConfirmationIntent(
  messageText: string,
  hasMediaAttachment = false
): boolean {
  const lower = String(messageText || '').trim().toLowerCase();
  if (hasMediaAttachment && (!lower || /\b(bukti|struk|tf|transfer|bayar|qris|lunas|transaksi|berhasil|sukses|resi|mutasi|ss)\b/i.test(lower))) {
    return true;
  }
  return (
    /\b(sudah|udah|udh|telah|selesai|baru\s*saja|brsn)\s*(bayar|transfer|tf|kirim(?:\s+uang|\s+dana)?|scan|qris|lunas|checkout\s*bayar)\b/i.test(lower) ||
    /\b(ini\s*bukti(?:nya)?|bukti\s*(?:bayar|transfer|tf|pembayaran|qris)|pembayaran\s*(?:berhasil|sukses|selesai|lunas)|sudah\s*lunas|done\s*(?:bayar|transfer|tf)|terima\s*kasih\s*sudah\s*tf)\b/i.test(lower)
  );
}

export function prepareOrderFlowForIncomingMessage(params: {
  scopeId: string;
  senderPhone: string;
  messageText: string;
  catalog: ActiveCatalogPaymentInfo;
  hasMediaAttachment?: boolean;
}): {
  context: CustomerOrderContext;
  directReply: DirectSystemOrderReply | null;
  orderSummaryForPrompt: string;
  paymentSummaryForPrompt: string;
  isPaymentSubmission: boolean;
} {
  const { scopeId, senderPhone, messageText, catalog, hasMediaAttachment = false } = params;
  const ctx = getOrCreateCustomerContext(scopeId, senderPhone);
  const cleanMsg = String(messageText || '').trim();
  const lower = cleanMsg.toLowerCase();

  if (isCancelOrderIntent(lower)) {
    ctx.cart = [];
    ctx.stage = 'browsing';
    ctx.selectedPaymentMethod = undefined;
    ctx.invoiceNumber = generateInvoiceNumber(ctx.customerCode);
    ctx.updatedAt = Date.now();
  }

  const isPaymentSubmission =
    ctx.cart.length > 0 && isPaymentProofOrConfirmationIntent(cleanMsg, hasMediaAttachment);

  // 1. Check if customer selects payment method (QRIS or Rekening) -> FAST SYSTEM DISPATCH!
  // Guard: If customer already confirmed payment ("sudah transfer ke BCA" / "ini bukti qris"), DO NOT re-send payment QR/rekening fast-path; let AI verify!
  const paymentChoice = isPaymentSubmission ? null : detectPaymentSelection(lower, ctx.stage, catalog);
  if (paymentChoice === 'qris' && catalog.qrisImageUrl) {
    const invoiceBlock = ctx.cart.length > 0 ? `${formatInvoiceText(ctx.cart, ctx.invoiceNumber, catalog.shopName)}\n\n` : '';
    const caption =
      `${invoiceBlock}📱 *Pembayaran via QRIS*\n` +
      `Silakan scan kode QRIS di atas untuk menyelesaikan pembayaran.${ctx.cart.length > 0 ? `\n\nJika sudah melakukan pembayaran, mohon kirimkan bukti transfer / konfirmasi bayar beserta nomor invoice \`${ctx.invoiceNumber}\` ya kak.` : ''}`;
    ctx.stage = ctx.cart.length > 0 ? 'awaiting_payment_proof' : 'browsing';
    if (ctx.cart.length > 0) ctx.selectedPaymentMethod = 'qris';
    ctx.updatedAt = Date.now();
    return {
      context: ctx,
      directReply: {
        text: caption,
        sendQrisImage: true,
        qrisImageUrl: catalog.qrisImageUrl,
        qrisPublicUrl: catalog.qrisPublicUrl,
        sendRekeningText: false,
        reason: 'direct_qris_dispatch'
      },
      orderSummaryForPrompt: '',
      paymentSummaryForPrompt: '',
      isPaymentSubmission: false
    };
  }

  if (paymentChoice === 'rekening' && (catalog.bankAccounts.length > 0 || catalog.paymentNotes)) {
    const invoiceBlock = ctx.cart.length > 0 ? `${formatInvoiceText(ctx.cart, ctx.invoiceNumber, catalog.shopName)}\n\n` : '';
    const rekText = formatRekeningDetailsText(catalog);
    const fullText =
      `${invoiceBlock}${rekText}` +
      (ctx.cart.length > 0
        ? `\n\nJika sudah melakukan transfer, silakan kirim bukti pembayaran / konfirmasi bayar beserta nomor invoice \`${ctx.invoiceNumber}\` ya kak. Terima kasih!`
        : '');
    ctx.stage = ctx.cart.length > 0 ? 'awaiting_payment_proof' : 'browsing';
    if (ctx.cart.length > 0) ctx.selectedPaymentMethod = 'rekening';
    ctx.updatedAt = Date.now();
    return {
      context: ctx,
      directReply: {
        text: fullText,
        sendQrisImage: false,
        sendRekeningText: true,
        reason: 'direct_rekening_dispatch'
      },
      orderSummaryForPrompt: '',
      paymentSummaryForPrompt: '',
      isPaymentSubmission: false
    };
  }

  // 2. Detect product additions to cart
  if (catalog.enabled && catalog.products.length > 0) {
    const ordered = isPaymentSubmission ? [] : detectOrderedProducts(cleanMsg, catalog.products);
    if (ordered.length > 0) {
      if (ctx.cart.length === 0) {
        ctx.invoiceNumber = generateInvoiceNumber(ctx.customerCode);
        ctx.selectedPaymentMethod = undefined;
      }
      for (const item of ordered) {
        const existing = ctx.cart.find(c => c.title.toLowerCase() === item.title.toLowerCase());
        if (existing) {
          existing.qty += item.qty;
          existing.unitPrice = item.unitPrice;
        } else {
          ctx.cart.push(item);
        }
      }
      ctx.stage = 'confirming_items';
      ctx.updatedAt = Date.now();
    } else if (ctx.cart.length > 0 && ctx.stage === 'confirming_items' && isConfirmNoMoreItemsIntent(lower)) {
      ctx.stage = 'awaiting_payment';
      ctx.updatedAt = Date.now();
    }
  }

  // Build prompt context summaries
  let orderSummaryForPrompt = '';
  if (ctx.cart.length > 0) {
    const itemsDesc = ctx.cart
      .map(i => `${i.title} x${i.qty} @ Rp${i.unitPrice.toLocaleString('id-ID')} = Rp${(i.unitPrice * i.qty).toLocaleString('id-ID')}`)
      .join('; ');
    const total = calculateCartTotal(ctx.cart);
    const methodInfo = ctx.selectedPaymentMethod ? `, metode_dipilih=${ctx.selectedPaymentMethod.toUpperCase()}` : '';
    const paymentVerifyHint = isPaymentSubmission
      ? ` PENTING VERIFIKASI PEMBAYARAN: Pembeli mengirim konfirmasi/bukti pembayaran (${hasMediaAttachment ? 'dengan lampiran foto/dokumen' : 'konfirmasi teks'}). Evaluasi apakah orderan sudah lengkap & pembayaran oke/valid; jika sudah oke dan terverifikasi dibayar, balas ramah bahwa pembayaran diterima & pesanan diteruskan ke admin/owner serta WAJIB akhiri balasanmu dengan tag [[ORDER_PAID]].`
      : '';
    orderSummaryForPrompt =
      `Status keranjang ${ctx.customerCode} (Invoice ${ctx.invoiceNumber}, tahap=${ctx.stage}${methodInfo}): ` +
      `${itemsDesc}. Total tagihan = Rp${total.toLocaleString('id-ID')}.${paymentVerifyHint}`;
  }

  const paymentParts: string[] = [];
  if (catalog.bankAccounts.length > 0 || catalog.paymentNotes) {
    const banks = catalog.bankAccounts.map(b => `${b.bank_name} ${b.account_number}${b.account_holder ? ` a.n ${b.account_holder}` : ''}`).join(' | ');
    paymentParts.push(banks ? `Transfer Rekening (${banks})` : 'Transfer Rekening');
  }
  if (catalog.qrisImageUrl) {
    paymentParts.push('QRIS (gambar QR akan dikirim otomatis oleh sistem jika balasanku menyertakan [[SEND_QRIS]])');
  }
  const paymentSummaryForPrompt = paymentParts.length > 0 ? paymentParts.join(' dan ') : '';

  return {
    context: ctx,
    directReply: null,
    orderSummaryForPrompt,
    paymentSummaryForPrompt,
    isPaymentSubmission
  };
}

export function buildDeterministicOrderFallbackReply(params: {
  context: CustomerOrderContext;
  catalog: ActiveCatalogPaymentInfo;
  messageText: string;
  isPaymentSubmission?: boolean;
}): string | null {
  const { context, catalog, isPaymentSubmission } = params;
  if (!context.cart || context.cart.length === 0) return null;

  const invoiceText = formatInvoiceText(context.cart, context.invoiceNumber, catalog.shopName);
  const paymentMethodsList = formatAvailablePaymentMethodsList(catalog);

  if (isPaymentSubmission) {
    return `${invoiceText}\n\n⏳ Terima kasih! Konfirmasi pembayaran untuk invoice \`${context.invoiceNumber}\` sudah diterima dan sedang menunggu verifikasi AI/Admin.`;
  }

  if (context.stage === 'awaiting_payment' || context.stage === 'awaiting_payment_proof') {
    if (context.stage === 'awaiting_payment_proof') {
      return `${invoiceText}\n\nSilakan kirimkan bukti transfer / konfirmasi pembayaran untuk invoice \`${context.invoiceNumber}\` ya kak agar bisa segera diverifikasi dan diproses.`;
    }
    if (paymentMethodsList) {
      return `${invoiceText}\n\n✅ Semua pesanan sudah ditotalkan ya kak.\nMau bayar pakai metode apa?\n\n${paymentMethodsList}\n\nBalas dengan pilihan metode bayarnya (misal ketik *Rekening* atau *QRIS*) ya kak.`;
    }
    return `${invoiceText}\n\n✅ Pesanan sudah kami totalkan ya kak. Admin kami akan segera menginformasikan detail pembayarannya.`;
  }

  return `${invoiceText}\n\nApakah ada produk lain yang ingin ditambahkan lagi kak? Jika sudah cukup dan tidak ada tambahan, balas *cukup* / *checkout* untuk melanjutkan ke pemilihan metode pembayaran.`;
}

function isPositiveAiPaymentVerificationReply(cleanReply: string): boolean {
  const lower = cleanReply.toLowerCase();
  const hasNegative =
    /\b(belum|tidak|gagal|kurang|salah|mohon\s+kirim(?:kan)?\s+ulang|kirim\s+bukti|belum\s+kami\s+terima|harap\s+transfer|silakan\s+transfer|pilih\s+metode)\b/i.test(
      lower
    );
  if (hasNegative) return false;

  return /\b(terverifikasi|verifikasi\s*(?:berhasil|selesai|ok|oke)|pembayaran(?:nya)?\s*(?:sudah\s*)?(?:kami\s*)?(?:terima|diterima|masuk|berhasil|sukses|valid|lunas|oke|ok)|pesanan(?:nya)?\s*(?:segera\s*)?(?:kami\s*)?(?:proses|diproses|diteruskan|disiapkan)|terima\s*kasih\s*(?:atas\s*)?pembayaran(?:nya)?)\b/i.test(
    lower
  );
}

export function parseAndHandleAiPaymentDirectives(
  aiReplyText: string,
  catalog: ActiveCatalogPaymentInfo,
  options?: {
    customerContext?: CustomerOrderContext;
    isPaymentSubmission?: boolean;
  }
): ProcessedAiDirectiveResult {
  let cleanText = String(aiReplyText || '').trim();
  const hasQrisDirective = /\[\[\s*SEND_QRIS\s*\]\]|\[SEND_QRIS\]/i.test(cleanText);
  const hasRekDirective = /\[\[\s*SEND_REK\s*\]\]|\[SEND_REK\]/i.test(cleanText);
  const hasPaidDirective = /\[\[\s*ORDER_PAID\s*\]\]|\[ORDER_PAID\]/i.test(cleanText);

  cleanText = cleanText
    .replace(/\[\[?\s*SEND_QRIS\s*\]?\]/gi, '')
    .replace(/\[\[?\s*SEND_REK\s*\]?\]/gi, '')
    .replace(/\[\[?\s*ORDER_PAID\s*\]?\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  let appendedRekening = false;
  if (hasRekDirective && (catalog.bankAccounts.length > 0 || catalog.paymentNotes)) {
    const firstAcc = catalog.bankAccounts[0]?.account_number || '';
    if (!firstAcc || !cleanText.includes(firstAcc)) {
      const rekBlock = formatRekeningDetailsText(catalog);
      cleanText = cleanText ? `${cleanText}\n\n${rekBlock}` : rekBlock;
      appendedRekening = true;
    }
  }

  const sendQrisImage = Boolean(hasQrisDirective && catalog.qrisImageUrl);
  if (sendQrisImage && !cleanText) {
    cleanText = '📱 Berikut kode QRIS untuk pembayaran pesanan Anda. Silakan scan dan kirimkan bukti pembayaran jika sudah selesai ya kak.';
  }

  const ctx = options?.customerContext;
  const hasActiveOrder = Boolean(ctx && ctx.cart.length > 0);
  const alreadyNotified = Boolean(
    ctx && ctx.notifiedPaidInvoices && ctx.notifiedPaidInvoices.includes(ctx.invoiceNumber)
  );
  const semanticPaidConfirmed = Boolean(
    hasActiveOrder &&
      options?.isPaymentSubmission &&
      (ctx?.stage === 'awaiting_payment' || ctx?.stage === 'awaiting_payment_proof' || ctx?.stage === 'confirming_items') &&
      isPositiveAiPaymentVerificationReply(cleanText)
  );

  const orderPaidVerified = Boolean(
    hasActiveOrder && !alreadyNotified && (hasPaidDirective || semanticPaidConfirmed)
  );

  if (orderPaidVerified && !cleanText) {
    cleanText =
      '✅ Terima kasih! Pembayaran Anda telah diverifikasi dan pesanan Anda langsung kami teruskan ke pemilik toko untuk segera diproses.';
  }

  return {
    cleanText,
    sendQrisImage,
    qrisImageUrl: sendQrisImage ? catalog.qrisImageUrl : undefined,
    qrisPublicUrl: sendQrisImage ? catalog.qrisPublicUrl : undefined,
    appendedRekening,
    orderPaidVerified
  };
}

export interface VerifiedPaidOrderSnapshot {
  customerCode: string;
  invoiceNumber: string;
  cart: OrderCartItem[];
  totalAmount: number;
  selectedPaymentMethod?: 'qris' | 'rekening';
}

export function completeAndConsumeVerifiedPaidOrder(
  scopeId: string,
  senderPhone: string
): VerifiedPaidOrderSnapshot | null {
  const ctx = getOrCreateCustomerContext(scopeId, senderPhone);
  if (!ctx.cart || ctx.cart.length === 0) return null;
  if (!Array.isArray(ctx.notifiedPaidInvoices)) ctx.notifiedPaidInvoices = [];
  if (ctx.notifiedPaidInvoices.includes(ctx.invoiceNumber)) {
    return null;
  }

  const snapshot: VerifiedPaidOrderSnapshot = {
    customerCode: ctx.customerCode,
    invoiceNumber: ctx.invoiceNumber,
    cart: ctx.cart.map(i => ({ ...i })),
    totalAmount: calculateCartTotal(ctx.cart),
    selectedPaymentMethod: ctx.selectedPaymentMethod
  };

  ctx.notifiedPaidInvoices.push(ctx.invoiceNumber);
  if (ctx.notifiedPaidInvoices.length > 30) {
    ctx.notifiedPaidInvoices = ctx.notifiedPaidInvoices.slice(-30);
  }
  ctx.cart = [];
  ctx.stage = 'browsing';
  ctx.selectedPaymentMethod = undefined;
  ctx.invoiceNumber = generateInvoiceNumber(ctx.customerCode);
  ctx.updatedAt = Date.now();

  return snapshot;
}

export function formatOwnerOrderNotificationMessage(params: {
  snapshot: VerifiedPaidOrderSnapshot;
  shopName?: string;
  customerPhone: string;
  customerName?: string;
  customerNote?: string;
  hasMediaAttachment?: boolean;
}): string {
  const { snapshot, shopName, customerPhone, customerName, customerNote, hasMediaAttachment } = params;
  const cleanCustDigits = String(customerPhone || '').replace(/\D/g, '');
  const waLink = cleanCustDigits.length >= 8 ? `https://wa.me/${cleanCustDigits}` : '-';
  const methodLabel =
    snapshot.selectedPaymentMethod === 'qris'
      ? 'QRIS'
      : snapshot.selectedPaymentMethod === 'rekening'
        ? 'Transfer Rekening'
        : 'Terverifikasi AI';

  const itemLines = snapshot.cart.map((item, idx) => {
    const subtotal = item.unitPrice * item.qty;
    const priceText =
      item.unitPrice > 0
        ? `${item.qty} x ${formatRupiahId(item.unitPrice)} = *${formatRupiahId(subtotal)}*`
        : `${item.qty} pcs`;
    return `${idx + 1}. *${item.title}*\n   ${priceText}`;
  });

  const cleanNote = String(customerNote || '').trim().slice(0, 220);
  const proofNote = hasMediaAttachment
    ? `${cleanNote ? `${cleanNote} ` : ''}(+ lampiran bukti transfer/foto)`
    : cleanNote || 'Konfirmasi pembayaran via chat';

  const titleLine = shopName
    ? `🛒 *ORDERAN BARU TERVERIFIKASI — ${shopName.toUpperCase()}*`
    : `🛒 *ORDERAN BARU TERVERIFIKASI LUNAS*`;

  return [
    titleLine,
    '',
    `🧾 *No. Invoice:* \`${snapshot.invoiceNumber}\``,
    `🆔 *ID Chat:* \`${snapshot.customerCode}\``,
    `👤 *Pelanggan:* ${customerName || 'Pelanggan'} (+${cleanCustDigits || customerPhone})`,
    `💬 *Chat Customer:* ${waLink}`,
    '',
    `📦 *Daftar Pesanan:*`,
    ...itemLines,
    '',
    `💰 *Total Tagihan:* *${snapshot.totalAmount > 0 ? formatRupiahId(snapshot.totalAmount) : 'Sesuai kesepakatan'}*`,
    `💳 *Metode Pembayaran:* ${methodLabel} ✅ _(Terverifikasi AI)_`,
    `📝 *Catatan Pembayaran:* ${proofNote}`,
    `🕒 *Waktu Verifikasi:* ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`
  ].join('\n');
}
