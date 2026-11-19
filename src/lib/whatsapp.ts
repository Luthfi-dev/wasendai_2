import {
  getUserById,
  addMessageLog,
  getSystemConfig,
  canUseAiQuota,
  deductUserAiQuota,
  getActiveCatalogForAi,
  resolveOrderNotificationRecipientPhone,
  markUserMetaAiVerified,
  isPhoneMetaAiVerifiedForUser,
  getSessionById,
  resolveEffectiveSessionAiSettings,
  getUserAutoReplyStatus
} from './db.js';
import { WhatsAppMessageLog } from '../types/whatsapp.js';
import {
  askMetaAiViaBaileys,
  getMetaAiAvailabilityForUser,
  isInternalPromptLeakText
} from './metaAiService.js';
import {
  sendBaileysTextMessage,
  sendBaileysMediaMessage,
  sendOrQueueViaSuperadminWa
} from './baileysManager.js';
import {
  buildDeterministicOrderFallbackReply,
  completeAndConsumeVerifiedPaidOrder,
  formatOwnerOrderNotificationMessage,
  parseAndHandleAiPaymentDirectives,
  prepareOrderFlowForIncomingMessage,
  recordCustomerTurn
} from './orderAssistant.js';

interface SendWhatsAppMessageResult {
  success: boolean;
  wam_id?: string;
  error?: string;
}

/**
 * Sends a text message back to a WhatsApp user directly via connected Baileys Session
 */
export async function sendWhatsAppMessage(
  recipientPhone: string,
  text: string,
  userId?: string,
  allowAdminFallback = false
): Promise<SendWhatsAppMessageResult> {
  try {
    if (isInternalPromptLeakText(text)) {
      return {
        success: false,
        error: 'Pesan diblokir oleh firewall keamanan karena mengandung format prompt AI internal.'
      };
    }
    const baileysRes = await sendBaileysTextMessage('', recipientPhone, text, {
      userId,
      allowAdminFallback
    });
    return {
      success: true,
      wam_id: (baileysRes as any)?.wam_id || (baileysRes as any)?.key?.id || `baileys_${Date.now()}`
    };
  } catch (baileysErr: any) {
    return {
      success: false,
      error: baileysErr?.message || 'Sesi WhatsApp Web Baileys belum terhubung.'
    };
  }
}

export interface AutoReplySimulationResult {
  reply: string;
  source: 'keyword_rule' | 'meta_ai_whatsapp' | 'offline_fallback' | 'order_system';
  ai_generated: boolean;
  matched_rule_id?: string;
  ai_error?: string;
  ai_enabled: boolean;
  customer_code?: string;
  media_type?: 'image';
  media_url?: string;
  order_verified_paid?: boolean;
  order_notify_target?: string;
  order_notify_status?: 'sent' | 'queued' | 'simulated' | 'missing_target';
}

/**
 * Evaluates order assistant (customer_XXXXX isolation + QRIS/Rekening) and Meta AI for dashboard live test
 */
export async function simulateAutoReplyForTest(params: {
  senderPhone: string;
  senderName: string;
  messageText: string;
  userId?: string;
  sessionId?: string;
}): Promise<AutoReplySimulationResult> {
  const { senderPhone, senderName, messageText, userId, sessionId } = params;
  const cleanName = senderName || 'Pelanggan';
  const cleanText = messageText.trim();
  const scopeId = userId || 'test_scope';

  const applyVars = (tpl: string) =>
    tpl.replace(/{nama}/g, cleanName).replace(/{pesan}/g, cleanText);

  const sysConfig = getSystemConfig();
  const user = userId ? getUserById(userId) : null;
  const arStatus = user ? getUserAutoReplyStatus(user, sysConfig) : null;
  if (arStatus && !arStatus.allowed) {
    return {
      reply: '',
      source: 'offline_fallback',
      ai_generated: false,
      ai_enabled: false,
      ai_error: arStatus.reason || 'Respon pesan otomatis sedang nonaktif. Aktifkan sakelar respon otomatis terlebih dahulu.'
    };
  }

  const targetSession = sessionId ? getSessionById(sessionId) : null;
  const effectiveAi = resolveEffectiveSessionAiSettings({
    user,
    session: targetSession,
    sysConfig
  });
  const isAiAllowed = effectiveAi.aiEnabled;

  const activeCatalog = getActiveCatalogForAi(userId);
  const orderFlow = prepareOrderFlowForIncomingMessage({
    scopeId,
    senderPhone,
    messageText: cleanText,
    catalog: activeCatalog
  });
  const priorHistory = orderFlow.context.history.slice(-6).map(h => ({ role: h.role, text: h.text }));
  recordCustomerTurn(scopeId, senderPhone, 'customer', cleanText);

  if (orderFlow.directReply) {
    const reply = applyVars(orderFlow.directReply.text);
    recordCustomerTurn(scopeId, senderPhone, 'assistant', reply);
    return {
      reply,
      source: 'order_system',
      ai_generated: false,
      ai_enabled: isAiAllowed,
      customer_code: orderFlow.context.customerCode,
      media_type: orderFlow.directReply.sendQrisImage ? 'image' : undefined,
      media_url: orderFlow.directReply.sendQrisImage
        ? (orderFlow.directReply.qrisImageUrl || orderFlow.directReply.qrisPublicUrl)
        : undefined
    };
  }

  let aiErrorReason: string | undefined;

  if (!isAiAllowed) {
    aiErrorReason =
      user && user.role !== 'admin'
        ? 'Fitur Meta AI pada akun Anda sedang nonaktif. Aktifkan sakelar AI terlebih dahulu.'
        : 'Fitur Meta AI Auto-Reply sedang dinonaktifkan pada pengaturan sistem.';
  } else {
    const quotaCheck = userId ? canUseAiQuota(userId) : { allowed: true as const, message: undefined };
    if (!quotaCheck.allowed) {
      aiErrorReason = quotaCheck.message || 'Kuota balasan AI Anda sudah habis.';
    } else {
      try {
        const aiResult = await askMetaAiViaBaileys({
          userId,
          sessionId: targetSession?.id,
          senderPhone,
          senderName: cleanName,
          messageBody: cleanText,
          customSystemPrompt: effectiveAi.systemPrompt,
          catalogShopName: activeCatalog.shopName,
          catalogProducts: activeCatalog.enabled ? activeCatalog.products : undefined,
          customerCode: orderFlow.context.customerCode,
          customerHistory: priorHistory,
          orderSummary: orderFlow.orderSummaryForPrompt || undefined,
          paymentSummary: orderFlow.paymentSummaryForPrompt || undefined
        });

        if (aiResult.usedAi && aiResult.replyText && !isInternalPromptLeakText(aiResult.replyText)) {
          if (userId) {
            deductUserAiQuota(userId);
            const avail = getMetaAiAvailabilityForUser(userId, targetSession?.id);
            if (avail.phoneNumber && user && !isPhoneMetaAiVerifiedForUser(user, avail.phoneNumber)) {
              markUserMetaAiVerified(userId, avail.phoneNumber);
            }
          }
          const directive = parseAndHandleAiPaymentDirectives(applyVars(aiResult.replyText), activeCatalog, {
            customerContext: orderFlow.context,
            isPaymentSubmission: orderFlow.isPaymentSubmission
          });
          recordCustomerTurn(scopeId, senderPhone, 'assistant', directive.cleanText);

          let orderNotifyTarget: string | undefined;
          let orderNotifyStatus: AutoReplySimulationResult['order_notify_status'];
          if (directive.orderPaidVerified) {
            const paidSnapshot = completeAndConsumeVerifiedPaidOrder(scopeId, senderPhone);
            if (paidSnapshot) {
              orderNotifyTarget =
                resolveOrderNotificationRecipientPhone(userId) ||
                activeCatalog.orderNotifyPhone ||
                undefined;
              orderNotifyStatus = orderNotifyTarget ? 'simulated' : 'missing_target';
            }
          }

          return {
            reply: directive.cleanText,
            source: 'meta_ai_whatsapp',
            ai_generated: true,
            ai_enabled: true,
            customer_code: orderFlow.context.customerCode,
            media_type: directive.sendQrisImage ? 'image' : undefined,
            media_url: directive.sendQrisImage ? (directive.qrisImageUrl || directive.qrisPublicUrl) : undefined,
            order_verified_paid: directive.orderPaidVerified || undefined,
            order_notify_target: orderNotifyTarget,
            order_notify_status: orderNotifyStatus
          };
        }
        aiErrorReason = aiResult.errorReason || 'Meta AI belum memberikan balasan.';
      } catch (e: any) {
        aiErrorReason = e?.message || 'Gagal menghubungi Meta AI melalui sesi WhatsApp Baileys.';
      }
    }
  }

  if (orderFlow.context.cart.length > 0) {
    const deterministicOrderReply = buildDeterministicOrderFallbackReply({
      context: orderFlow.context,
      catalog: activeCatalog,
      messageText: cleanText,
      isPaymentSubmission: orderFlow.isPaymentSubmission
    });
    if (deterministicOrderReply) {
      recordCustomerTurn(scopeId, senderPhone, 'assistant', deterministicOrderReply);
      return {
        reply: deterministicOrderReply,
        source: 'order_system',
        ai_generated: false,
        ai_error: aiErrorReason,
        ai_enabled: isAiAllowed,
        customer_code: orderFlow.context.customerCode
      };
    }
  }

  const isCsEnabled = user
    ? (user.role === 'admin' ? user.default_cs_reply_enabled !== false : user.default_cs_reply_enabled === true)
    : true;
  const offlineTpl = isCsEnabled
    ? (user?.default_cs_reply_text ||
        user?.custom_offline_message ||
        sysConfig.ai_config.offline_fallback_message ||
        'Halo kak *{nama}*! Terima kasih telah menghubungi kami. Tim Customer Service kami akan segera membalas pesan Anda sesegera mungkin.')
    : '';

  const fallbackReply = applyVars(offlineTpl);
  if (fallbackReply) {
    recordCustomerTurn(scopeId, senderPhone, 'assistant', fallbackReply);
  }
  return {
    reply: fallbackReply,
    source: 'offline_fallback',
    ai_generated: false,
    ai_error: aiErrorReason,
    ai_enabled: isAiAllowed,
    customer_code: orderFlow.context.customerCode
  };
}

/**
 * Processes incoming message with order assistant & native Meta AI via Baileys
 */
export async function handleIncomingWhatsAppMessage(params: {
  senderPhone: string;
  senderName: string;
  messageText: string;
  wamId?: string;
  userId?: string;
  skipSend?: boolean;
}): Promise<WhatsAppMessageLog> {
  const { senderPhone, senderName, messageText, wamId, userId, skipSend } = params;
  const cleanName = senderName || 'Pelanggan';
  const cleanText = messageText.trim();
  const scopeId = userId || 'sim_scope';

  const sysConfig = getSystemConfig();
  const user = userId ? getUserById(userId) : null;
  const arStatus = user ? getUserAutoReplyStatus(user, sysConfig) : null;
  if (arStatus && !arStatus.allowed) {
    return addMessageLog({
      wam_id: wamId || `wam_sim_${Date.now()}`,
      user_id: userId,
      sender_phone: senderPhone,
      sender_name: cleanName,
      message_body: cleanText,
      direction: 'incoming',
      status: 'Diterima',
      reply_body: arStatus.reason || 'Respon pesan otomatis sedang nonaktif.',
      ai_generated: false
    });
  }

  let matchedResponse: string | null = null;
  let isAiGenerated = false;
  let aiDiagnosticReason: string | undefined;
  let sendQrisImage = false;
  let qrisUrl: string | undefined;
  let orderPaidVerified = false;

  const effectiveAi = resolveEffectiveSessionAiSettings({ user, sysConfig });
  const isAiAllowed = effectiveAi.aiEnabled;

  const activeCatalog = getActiveCatalogForAi(userId);
  const orderFlow = prepareOrderFlowForIncomingMessage({
    scopeId,
    senderPhone,
    messageText: cleanText,
    catalog: activeCatalog
  });
  const priorHistory = orderFlow.context.history.slice(-6).map(h => ({ role: h.role, text: h.text }));
  recordCustomerTurn(scopeId, senderPhone, 'customer', cleanText);

  if (orderFlow.directReply) {
    matchedResponse = orderFlow.directReply.text;
    sendQrisImage = orderFlow.directReply.sendQrisImage;
    qrisUrl = orderFlow.directReply.qrisPublicUrl || orderFlow.directReply.qrisImageUrl;
  }

  // Forward directly to Meta AI via Baileys
  if (!matchedResponse && isAiAllowed) {
    const quotaCheck = userId ? canUseAiQuota(userId) : { allowed: true };
    if (quotaCheck.allowed) {
      try {
        console.log(`[Meta AI Fallback] Forwarding ${orderFlow.context.customerCode || 'customer'} via Baileys Meta AI...`);
        const aiResult = await askMetaAiViaBaileys({
          userId,
          senderPhone,
          senderName: cleanName,
          messageBody: cleanText,
          customSystemPrompt: effectiveAi.systemPrompt,
          catalogShopName: activeCatalog.shopName,
          catalogProducts: activeCatalog.enabled ? activeCatalog.products : undefined,
          customerCode: orderFlow.context.customerCode,
          customerHistory: priorHistory,
          orderSummary: orderFlow.orderSummaryForPrompt || undefined,
          paymentSummary: orderFlow.paymentSummaryForPrompt || undefined
        });

        if (aiResult.usedAi && aiResult.replyText && !isInternalPromptLeakText(aiResult.replyText)) {
          const directive = parseAndHandleAiPaymentDirectives(aiResult.replyText, activeCatalog, {
            customerContext: orderFlow?.context,
            isPaymentSubmission: orderFlow?.isPaymentSubmission
          });
          matchedResponse = directive.cleanText;
          sendQrisImage = directive.sendQrisImage;
          qrisUrl = directive.qrisPublicUrl || directive.qrisImageUrl;
          orderPaidVerified = directive.orderPaidVerified;
          isAiGenerated = true;
          if (userId) {
            deductUserAiQuota(userId);
          }
        } else if (aiResult.errorReason || isInternalPromptLeakText(aiResult.replyText)) {
          aiDiagnosticReason = `[Meta AI] ${aiResult.errorReason || 'Respon diblokir firewall prompt internal.'}`;
        }
      } catch (e: any) {
        aiDiagnosticReason = `[Meta AI Exception] ${e?.message || 'Error memanggil Meta AI'}`;
        console.error('[Meta AI Fallback Error]', e);
      }
    } else {
      aiDiagnosticReason = `[Kuota AI Habis] ${(quotaCheck as any).message || 'Kuota AI habis.'}`;
    }
  } else if (!matchedResponse && !isAiAllowed) {
    aiDiagnosticReason = '[Meta AI Nonaktif] Fitur Meta AI sedang dinonaktifkan.';
  }

  if (!matchedResponse && orderFlow && orderFlow.context.cart.length > 0) {
    const deterministicOrderReply = buildDeterministicOrderFallbackReply({
      context: orderFlow.context,
      catalog: activeCatalog,
      messageText: cleanText,
      isPaymentSubmission: orderFlow.isPaymentSubmission
    });
    if (deterministicOrderReply) {
      matchedResponse = deterministicOrderReply;
    }
  }

  // 3. Fallback template if neither rule nor Meta AI matched
  const isCsEnabled = user
    ? (user.role === 'admin' ? user.default_cs_reply_enabled !== false : user.default_cs_reply_enabled === true)
    : true;
  if (!matchedResponse && isCsEnabled) {
    matchedResponse =
      user?.default_cs_reply_text ||
      user?.custom_offline_message ||
      sysConfig.ai_config.offline_fallback_message ||
      `Halo kak *{nama}*! Terima kasih telah menghubungi kami. Tim Customer Service kami akan segera membalas pesan Anda sesegera mungkin.`;
  }

  // 4. Format template placeholders & final prompt leak guard
  let finalReplyText = (matchedResponse || '')
    .replace(/{nama}/g, cleanName)
    .replace(/{pesan}/g, cleanText);
  if (isInternalPromptLeakText(finalReplyText)) {
    aiDiagnosticReason = 'Respon diblokir oleh firewall keamanan prompt internal.';
    finalReplyText = '';
    isAiGenerated = false;
  }

  if (finalReplyText) {
    recordCustomerTurn(scopeId, senderPhone, 'assistant', finalReplyText);
  }

  // 5. Send message via Baileys unless skipSend is true (e.g. UI AI test simulator)
  const isSimDummy = senderPhone === '628999000111' || Boolean(skipSend);
  let sendResult: SendWhatsAppMessageResult = { success: true, wam_id: undefined, error: undefined };
  if (finalReplyText && !isSimDummy) {
    if (sendQrisImage && qrisUrl && /^https?:\/\//i.test(qrisUrl)) {
      try {
        const res = await sendBaileysMediaMessage('', senderPhone, {
          mediaType: 'image',
          mediaUrl: qrisUrl,
          caption: finalReplyText
        }, { userId, skipLog: true, skipQuota: true });
        sendResult = { success: true, wam_id: res.wam_id };
      } catch {
        sendResult = await sendWhatsAppMessage(senderPhone, finalReplyText, userId);
      }
    } else {
      sendResult = await sendWhatsAppMessage(senderPhone, finalReplyText, userId);
    }
  }

  if (orderPaidVerified && orderFlow && !isSimDummy) {
    const paidSnapshot = completeAndConsumeVerifiedPaidOrder(scopeId, senderPhone);
    if (paidSnapshot) {
      const ownerTargetPhone =
        resolveOrderNotificationRecipientPhone(userId) ||
        activeCatalog.orderNotifyPhone ||
        '';
      if (ownerTargetPhone) {
        const ownerMsg = formatOwnerOrderNotificationMessage({
          snapshot: paidSnapshot,
          shopName: activeCatalog.shopName,
          customerPhone: senderPhone,
          customerName: cleanName,
          customerNote: cleanText
        });
        await sendOrQueueViaSuperadminWa({
          recipientPhone: ownerTargetPhone,
          message: ownerMsg,
          category: 'order_notification',
          ownerUserId: userId,
          invoiceNumber: paidSnapshot.invoiceNumber
        }).catch(err => console.warn('[Webhook Order Notify Error]', err?.message || err));
      }
    }
  }

  // Status calculation
  const isSuccess = sendResult.success;
  const combinedError = [aiDiagnosticReason, sendResult.error].filter(Boolean).join(' | ') || undefined;
  const logStatus = !isSuccess || (!finalReplyText && aiDiagnosticReason) ? 'Gagal' : (isSuccess && finalReplyText ? 'Sukses' : 'Diterima');

  // 6. Save to DB isolated by user
  const savedLog = addMessageLog({
    wam_id: sendResult.wam_id || wamId || `wam_sim_${Date.now()}`,
    user_id: userId,
    sender_phone: senderPhone,
    sender_name: cleanName,
    message_body: cleanText,
    direction: 'incoming',
    status: logStatus,
    reply_body: finalReplyText || 'Tidak ada balasan otomatis terkonfigurasi.',
    error_detail: combinedError,
    ai_generated: isAiGenerated
  });

  return savedLog;
}
