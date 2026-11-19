import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/csrfFetch';
import { Power, Sparkles, Check, AlertCircle, RefreshCw, Send, MessageSquare, CheckCircle2, Store, ShieldAlert } from 'lucide-react';
import { AutoReplyStatusInfo } from '../types/whatsapp';
import { MetaAiVerifyModal } from './MetaAiVerifyModal';

interface AutoReplyRulesProps {
  currentUser: any;
  onUpdateUser?: (updatedUser: any) => void;
  onOpenCatalog?: () => void;
  onOpenConnectTab?: () => void;
  onOpenUpgrade?: () => void;
}

export const AutoReplyRules: React.FC<AutoReplyRulesProps> = ({
  currentUser,
  onUpdateUser,
  onOpenCatalog,
  onOpenConnectTab
}) => {
  const isAdmin = currentUser?.role === 'admin';

  // Master Auto-Reply Switch & Free-Plan Time Quota State
  const [autoReplyStatus, setAutoReplyStatus] = useState<AutoReplyStatusInfo | null>(
    currentUser?.auto_reply_status || null
  );
  const [isTogglingMaster, setIsTogglingMaster] = useState(false);
  const [masterToast, setMasterToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // AI Auto-Reply Toggle & System Prompt State
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [metaAiConnected, setMetaAiConnected] = useState(false);
  const [metaAiVerified, setMetaAiVerified] = useState(false);
  const [metaAiPhone, setMetaAiPhone] = useState<string | null>(null);
  const [metaAiSessionId, setMetaAiSessionId] = useState<string | null>(null);
  const [linkedSessionsCount, setLinkedSessionsCount] = useState(0);
  const [linkedSessionPhone, setLinkedSessionPhone] = useState<string | null>(null);
  const [sessionRuntimeStatus, setSessionRuntimeStatus] = useState<'connected' | 'connecting' | 'disconnected'>('disconnected');
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);
  const [isReconnectingWs, setIsReconnectingWs] = useState(false);
  const [metaAiLastError, setMetaAiLastError] = useState<string | null>(null);
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);
  const [isSavingAi, setIsSavingAi] = useState(false);
  const [aiToast, setAiToast] = useState('');
  const [showAiHelp, setShowAiHelp] = useState(false);

  // Live AI Test Reply Simulator State
  const [testPrompt, setTestPrompt] = useState('Apakah layanan ini tersedia dan bagaimana cara pemesanannya?');
  const [isTestingAi, setIsTestingAi] = useState(false);
  const [testResult, setTestResult] = useState<{
    reply: string;
    source?: 'meta_ai_whatsapp' | 'order_system' | 'offline_fallback';
    ai_generated?: boolean;
    matched_rule_id?: string;
    customer_code?: string | null;
    media_type?: string | null;
    media_url?: string | null;
    order_verified_paid?: boolean;
    order_notify_target?: string | null;
    order_notify_status?: string | null;
    fallback_reason?: string | null;
    meta_ai_connected?: boolean;
    elapsed_ms?: number;
    error?: string;
  } | null>(null);

  const fetchAiStatusAndConfig = () => {
    if (!currentUser) return;

    setIsRefreshingStatus(true);
    apiFetch('/api/ai/status')
      .then(r => r.json())
      .then(res => {
        if (res?.success) {
          setMetaAiConnected(Boolean(res.meta_ai_connected));
          setMetaAiVerified(Boolean(res.meta_ai_verified));
          setMetaAiPhone(res.phone_number || null);
          setMetaAiSessionId(res.session_id || null);
          setLinkedSessionsCount(Number(res.linked_sessions_count) || 0);
          setLinkedSessionPhone(res.linked_session_phone || null);
          setSessionRuntimeStatus(res.session_runtime_status || 'disconnected');
          setMetaAiLastError(res.last_error || null);
          if (currentUser.role !== 'admin' && typeof res.ai_enabled === 'boolean') {
            setAiEnabled(res.ai_enabled);
          }
          if (res.auto_reply_status) {
            setAutoReplyStatus(res.auto_reply_status);
          }
        }
      })
      .catch(() => {})
      .finally(() => setIsRefreshingStatus(false));

    if (currentUser.role === 'admin') {
      apiFetch('/api/config')
        .then(r => r.json())
        .then(res => {
          if (res.success && res.fullConfig?.ai_config) {
            setAiEnabled(Boolean(res.fullConfig.ai_config.enabled));
            setAiPrompt(res.fullConfig.ai_config.system_prompt || '');
          }
        })
        .catch(() => {});
    }
  };

  useEffect(() => {
    if (currentUser) {
      if (currentUser.role !== 'admin') {
        setAiEnabled(currentUser.ai_enabled === true);
        setAiPrompt(currentUser.custom_system_prompt || '');
      }
      if (currentUser.auto_reply_status) {
        setAutoReplyStatus(currentUser.auto_reply_status);
      }
      fetchAiStatusAndConfig();
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || metaAiConnected || sessionRuntimeStatus !== 'connecting') {
      return;
    }
    const timer = setInterval(() => {
      fetchAiStatusAndConfig();
    }, 4000);
    return () => clearInterval(timer);
  }, [currentUser, metaAiConnected, sessionRuntimeStatus]);

  const handleReconnectAndVerify = async () => {
    if (isReconnectingWs || isRefreshingStatus) return;
    setIsReconnectingWs(true);
    try {
      if (metaAiSessionId && !metaAiConnected) {
        await apiFetch(`/api/sessions/${encodeURIComponent(metaAiSessionId)}/reconnect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        }).catch(() => null);
      }

      const statusRes = await apiFetch('/api/ai/status').then(r => r.json()).catch(() => null);
      if (statusRes?.success) {
        const connectedNow = Boolean(statusRes.meta_ai_connected);
        const verifiedNow = Boolean(statusRes.meta_ai_verified);
        setMetaAiConnected(connectedNow);
        setMetaAiVerified(verifiedNow);
        setMetaAiPhone(statusRes.phone_number || null);
        setMetaAiSessionId(statusRes.session_id || null);
        setLinkedSessionsCount(Number(statusRes.linked_sessions_count) || 0);
        setLinkedSessionPhone(statusRes.linked_session_phone || null);
        setSessionRuntimeStatus(statusRes.session_runtime_status || 'disconnected');
        setMetaAiLastError(statusRes.last_error || null);

        if (connectedNow && verifiedNow) {
          setAiToast('✓ Koneksi WhatsApp tersambung kembali & Meta AI aktif!');
          setTimeout(() => setAiToast(''), 4000);
          return;
        }
      }
      setIsVerifyModalOpen(true);
    } finally {
      setIsReconnectingWs(false);
    }
  };

  const effectiveAutoReplyEnabled =
    autoReplyStatus?.enabled ?? (isAdmin ? currentUser?.auto_reply_enabled !== false : currentUser?.auto_reply_enabled === true);
  const isFreePlan = autoReplyStatus?.is_free_plan ?? (!isAdmin && (currentUser?.plan_id || 'free') === 'free');

  const handleToggleMasterAutoReply = async (nextEnabled: boolean) => {
    setIsTogglingMaster(true);
    setMasterToast(null);
    try {
      const res = await apiFetch('/api/user/auto-reply-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextEnabled })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data?.status) setAutoReplyStatus(data.status);
        if (data?.user && onUpdateUser) onUpdateUser(data.user);
        setMasterToast({
          type: 'error',
          text: data?.error || 'Gagal mengubah status respon pesan otomatis.'
        });
        return;
      }
      if (data.status) setAutoReplyStatus(data.status);
      if (data.user && onUpdateUser) onUpdateUser(data.user);
      setMasterToast({
        type: 'success',
        text: data.message || (nextEnabled ? 'Respon pesan otomatis diaktifkan!' : 'Respon pesan otomatis dinonaktifkan.')
      });
      setTimeout(() => setMasterToast(null), 4500);
    } catch {
      setMasterToast({ type: 'error', text: 'Gagal menghubungi server.' });
    } finally {
      setIsTogglingMaster(false);
    }
  };

  const handleToggleAi = async (enabled: boolean) => {
    if (enabled && (!metaAiConnected || !metaAiVerified)) {
      setIsVerifyModalOpen(true);
      return;
    }

    setAiEnabled(enabled);
    setIsSavingAi(true);
    try {
      if (!isAdmin && currentUser) {
        const res = await apiFetch('/api/user/ai-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: currentUser.id, enabled })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          setAiEnabled(false);
          if (data?.code === 'META_AI_NOT_VERIFIED' || data?.code === 'WA_NOT_CONNECTED') {
            if (data.code === 'META_AI_NOT_VERIFIED') setMetaAiVerified(false);
            setIsVerifyModalOpen(true);
          } else {
            setAiToast(`⚠️ ${data?.error || 'Gagal memperbarui status Meta AI.'}`);
            setTimeout(() => setAiToast(''), 4000);
          }
          return;
        }
        if (data.user && onUpdateUser) {
          onUpdateUser(data.user);
        }
      } else {
        const res = await apiFetch('/api/ai/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled, fallback_when_no_rule: true })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          setAiEnabled(false);
          if (data?.code === 'META_AI_NOT_VERIFIED' || data?.code === 'WA_NOT_CONNECTED') {
            if (data.code === 'META_AI_NOT_VERIFIED') setMetaAiVerified(false);
            setIsVerifyModalOpen(true);
          } else {
            setAiToast(`⚠️ ${data?.error || 'Gagal memperbarui status Meta AI.'}`);
            setTimeout(() => setAiToast(''), 4000);
          }
          return;
        }
      }
      setAiToast(`✓ Balas Pesan dengan Meta AI ${enabled ? 'Diaktifkan' : 'Dinonaktifkan'}!`);
      setTimeout(() => setAiToast(''), 4000);
    } catch {
      setAiEnabled(!enabled);
    } finally {
      setIsSavingAi(false);
    }
  };

  const handleSavePrompt = async () => {
    setIsSavingAi(true);
    try {
      if (!isAdmin && currentUser) {
        const res = await apiFetch('/api/user/ai-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: currentUser.id, system_prompt: aiPrompt })
        });
        const data = await res.json();
        if (data.success && data.user && onUpdateUser) {
          onUpdateUser(data.user);
        }
      } else {
        await apiFetch('/api/ai/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ system_prompt: aiPrompt, enabled: aiEnabled, fallback_when_no_rule: true })
        });
      }
      setAiToast('✓ Karakter instruksi Meta AI berhasil disimpan!');
      setTimeout(() => setAiToast(''), 3000);
    } catch (e) {
    } finally {
      setIsSavingAi(false);
    }
  };

  const handleTestAiChat = async () => {
    if (!testPrompt.trim()) return;
    setIsTestingAi(true);
    setTestResult(null);

    try {
      const res = await apiFetch('/api/ai/test-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: testPrompt.trim() })
      });
      const data = await res.json();
      if (data.success) {
        if (typeof data.meta_ai_connected === 'boolean') {
          setMetaAiConnected(data.meta_ai_connected);
        }
        if (typeof data.meta_ai_verified === 'boolean') {
          setMetaAiVerified(data.meta_ai_verified);
        }
        if (data.source === 'offline_fallback') {
          fetchAiStatusAndConfig();
        }
        setTestResult({
          reply: data.reply,
          source: data.source || (data.ai_generated ? 'meta_ai_whatsapp' : 'offline_fallback'),
          ai_generated: data.ai_generated,
          matched_rule_id: data.matched_rule_id,
          customer_code: data.customer_code || null,
          media_type: data.media_type || null,
          media_url: data.media_url || null,
          order_verified_paid: Boolean(data.order_verified_paid),
          order_notify_target: data.order_notify_target || null,
          order_notify_status: data.order_notify_status || null,
          fallback_reason: data.fallback_reason || null,
          meta_ai_connected: data.meta_ai_connected,
          elapsed_ms: data.elapsed_ms
        });
      } else {
        setTestResult({
          reply: '',
          error: data.error || 'Gagal menguji balasan AI.'
        });
      }
    } catch (e) {
      setTestResult({
        reply: '',
        error: 'Gagal menghubungi server backend.'
      });
    } finally {
      setIsTestingAi(false);
    }
  };

  return (
    <div id="rules-container" className="space-y-5 mb-8 transition-colors duration-200">
      {/* MASTER AUTO-REPLY STATUS & FREE-PLAN TIME QUOTA CARD */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              effectiveAutoReplyEnabled
                ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
            }`}>
              <Power className="w-5 h-5" />
            </div>

            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  Status Respon Pesan Otomatis
                </h3>
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                  effectiveAutoReplyEnabled
                    ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}>
                  {effectiveAutoReplyEnabled ? 'Aktif Merespon' : 'Nonaktif (Standby)'}
                </span>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {!effectiveAutoReplyEnabled
                  ? 'Respon pesan otomatis sedang nonaktif. Koneksi WhatsApp tetap standby, WA Blast & REST API tetap dapat digunakan kapan saja.'
                  : 'Bot aktif membalas seluruh pesan masuk 24/7 secara penuh menggunakan Meta AI & Asisten Order Katalog.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
            {isFreePlan && (
              <div className="px-3 py-1.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 text-right">
                <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 block">
                  Akses Paket Gratis
                </span>
                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-200 flex items-center gap-1 justify-end">
                  Penuh · Tanpa Batas Jam
                </span>
              </div>
            )}

            <label className={`relative inline-flex items-center min-h-[44px] pl-1 ${
              isTogglingMaster ? 'cursor-not-allowed opacity-55' : 'cursor-pointer'
            }`}>
              <input
                type="checkbox"
                checked={effectiveAutoReplyEnabled}
                onChange={e => handleToggleMasterAutoReply(e.target.checked)}
                disabled={isTogglingMaster}
                className="sr-only peer"
                aria-label="Aktifkan Respon Pesan Otomatis"
              />
              <div className="w-12 h-6 bg-slate-200 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-6 peer-checked:after:border-white after:content-[''] after:absolute after:top-1/2 after:-translate-y-1/2 after:left-[6px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600" />
            </label>
          </div>
        </div>

        {masterToast && (
          <div className={`p-3 rounded-xl text-xs font-semibold border flex items-center gap-2 ${
            masterToast.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300'
          }`}>
            {masterToast.type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{masterToast.text}</span>
          </div>
        )}
      </div>

      {/* AI AUTO-REPLY CARD */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                  Meta AI Auto-Reply
                </h3>
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full shrink-0 ${
                  metaAiConnected && metaAiVerified
                    ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : metaAiConnected
                      ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}>
                  {metaAiConnected && metaAiVerified
                    ? (metaAiPhone ? `Terverifikasi · +${metaAiPhone}` : 'Terverifikasi')
                    : metaAiConnected
                      ? (metaAiPhone ? `Perlu Verifikasi · +${metaAiPhone}` : 'Perlu Verifikasi')
                      : 'Offline'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Balas chat otomatis via Meta AI WhatsApp (tanpa API key).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={fetchAiStatusAndConfig}
              className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center transition-colors"
              title="Cek Status Meta AI"
              aria-label="Cek Status Meta AI"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <label className="relative inline-flex items-center cursor-pointer min-h-[44px] pl-1">
              <input
                type="checkbox"
                checked={aiEnabled}
                onChange={e => handleToggleAi(e.target.checked)}
                disabled={isSavingAi}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-1/2 after:-translate-y-1/2 after:left-[6px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600" />
            </label>
          </div>
        </div>

        {metaAiConnected && !metaAiVerified && (
          <div className="p-3.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
              <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-bold block">
                  Nomor +{metaAiPhone} Belum Terverifikasi Meta AI
                </span>
                <span className="text-[11px] opacity-90 block leading-relaxed">
                  {metaAiLastError
                    ? 'Akun ini belum pernah chat/menyetujui Meta AI di WhatsApp. Klik tombol di samping agar sistem memicu chat awal atau menampilkan panduan.'
                    : 'Sebelum Meta AI Balas Otomatis dapat diaktifkan, sistem perlu mengecek & memicu chat awal Meta AI di nomor WhatsApp ini.'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsVerifyModalOpen(true)}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black rounded-xl shrink-0 transition-colors flex items-center justify-center gap-1.5 min-h-[40px]"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Cek &amp; Aktifkan Meta AI</span>
            </button>
          </div>
        )}

        {!metaAiConnected && (
          <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
            <span className="text-slate-600 dark:text-slate-300 leading-relaxed">
              {linkedSessionsCount > 0
                ? sessionRuntimeStatus === 'connecting'
                  ? `Perangkat +${linkedSessionPhone || 'WhatsApp'} sedang menyambungkan ulang koneksi WebSocket. Tunggu sebentar lalu cek ulang.`
                  : `Perangkat +${linkedSessionPhone || 'WhatsApp'} tercatat di Perangkat Tertaut, namun koneksi WebSocket saat ini terputus / perlu disambungkan ulang.`
                : 'Hubungkan nomor WhatsApp terlebih dahulu agar Meta AI Auto-Reply dapat diverifikasi dan diaktifkan.'}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              {linkedSessionsCount > 0 && (
                <button
                  type="button"
                  onClick={handleReconnectAndVerify}
                  disabled={isRefreshingStatus || isReconnectingWs}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${(isRefreshingStatus || isReconnectingWs) ? 'animate-spin' : ''}`} />
                  <span>{isReconnectingWs ? 'Menyambungkan...' : 'Cek & Sambungkan'}</span>
                </button>
              )}
              {onOpenConnectTab && (
                <button
                  type="button"
                  onClick={onOpenConnectTab}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shrink-0"
                >
                  {linkedSessionsCount > 0 ? 'Menu Koneksi' : 'Hubungkan WhatsApp'}
                </button>
              )}
            </div>
          </div>
        )}

        {aiToast && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-semibold flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{aiToast}</span>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Karakter &amp; Gaya Jawab AI
            </label>
            <button
              type="button"
              onClick={() => setShowAiHelp(v => !v)}
              className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              {showAiHelp ? 'Tutup info' : 'Cara kerja'}
            </button>
          </div>

          {showAiHelp && (
            <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-[11px] text-slate-600 dark:text-slate-300 space-y-1.5 leading-relaxed">
              <p>
                Seluruh pesan masuk pelanggan langsung ditangani oleh Meta AI di WhatsApp Anda sesuai karakter &amp; katalog toko, lalu balasannya dikirim otomatis ke pelanggan.
              </p>
              {onOpenCatalog && (
                <button
                  type="button"
                  onClick={onOpenCatalog}
                  className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                >
                  <Store className="w-3.5 h-3.5" />
                  <span>Kelola Katalog Produk untuk Meta AI →</span>
                </button>
              )}
            </div>
          )}

          <textarea
            rows={2}
            value={aiPrompt}
            onChange={e => setAiPrompt(e.target.value)}
            placeholder="Contoh: Kamu adalah CS yang ramah, singkat, dan membantu menjawab pertanyaan produk serta harga..."
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 leading-relaxed"
          />

          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Berlaku sebagai pengaturan utama akun (default); bisa di-override per nomor di menu{' '}
            {onOpenConnectTab ? (
              <button
                type="button"
                onClick={onOpenConnectTab}
                className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Koneksi WA → Atur AI
              </button>
            ) : (
              <strong>Koneksi WA → Atur AI</strong>
            )}
            .
          </p>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            {onOpenCatalog ? (
              <button
                type="button"
                onClick={onOpenCatalog}
                className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1.5 min-h-[36px]"
              >
                <Store className="w-3.5 h-3.5" />
                <span>Katalog Toko</span>
              </button>
            ) : <span />}

            <button
              type="button"
              onClick={handleSavePrompt}
              disabled={isSavingAi}
              className="px-4 min-h-[40px] bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
            >
              {isSavingAi ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              <span>Simpan Karakter</span>
            </button>
          </div>
        </div>

        {/* Live Simulator */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>Tes Simulasi Balas AI</span>
          </span>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={testPrompt}
              onChange={e => setTestPrompt(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleTestAiChat()}
              placeholder="Ketik contoh pertanyaan pelanggan..."
              className="flex-1 min-w-0 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 min-h-[42px] text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={handleTestAiChat}
              disabled={isTestingAi || !testPrompt.trim()}
              className="px-4 min-h-[42px] bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 disabled:opacity-50 shrink-0"
            >
              {isTestingAi ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>Tes</span>
            </button>
          </div>

          {testResult && (
            <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs space-y-2">
              {testResult.error ? (
                <div className="text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{testResult.error}</span>
                </div>
              ) : testResult.source === 'offline_fallback' ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-amber-700 dark:text-amber-400">Fallback Offline</span>
                    <span className="text-slate-400 font-mono tabular-nums">{testResult.elapsed_ms || 0}ms</span>
                  </div>
                  <p className="text-[11px] text-amber-700 dark:text-amber-300">
                    {testResult.fallback_reason || 'Sesi Meta AI belum siap atau timeout.'}
                  </p>
                  {testResult.reply && (
                    <div className="text-slate-700 dark:text-slate-300 whitespace-pre-line bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                      {testResult.reply}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-emerald-700 dark:text-emerald-400">
                        {testResult.source === 'order_system'
                          ? 'Sistem Order & Pembayaran'
                          : 'Meta AI WhatsApp'}
                      </span>
                      {testResult.customer_code && (
                        <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-mono text-[10px] font-bold">
                          {testResult.customer_code}
                        </span>
                      )}
                    </div>
                    <span className="text-slate-400 font-mono tabular-nums">{testResult.elapsed_ms || 120}ms</span>
                  </div>
                  {testResult.media_type === 'image' && testResult.media_url && (
                    <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 inline-block">
                      <img
                        src={testResult.media_url}
                        alt="Lampiran Gambar Sistem"
                        className="max-h-48 w-auto rounded object-contain"
                      />
                    </div>
                  )}
                  {testResult.order_verified_paid && (
                    <div className="p-2.5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-lg text-[11px] text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span>
                        Orderan terverifikasi lunas oleh AI! Notifikasi rincian pesanan akan dikirim oleh <strong>WA Superadmin</strong> ke:{' '}
                        <strong className="font-mono">
                          {testResult.order_notify_target ? `+${testResult.order_notify_target}` : 'Belum ada nomor pemilik usaha/akun'}
                        </strong>
                      </span>
                    </div>
                  )}
                  <div className="text-slate-800 dark:text-slate-200 whitespace-pre-line bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800 leading-relaxed">
                    {testResult.reply}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Meta AI Verification & Initial Chat Trigger Modal */}
      <MetaAiVerifyModal
        isOpen={isVerifyModalOpen}
        onClose={() => setIsVerifyModalOpen(false)}
        sessionId={metaAiSessionId}
        phoneNumber={metaAiPhone || linkedSessionPhone}
        autoEnableOnSuccess={true}
        onOpenConnectTab={onOpenConnectTab}
        onVerified={(payload) => {
          setMetaAiConnected(true);
          setMetaAiVerified(true);
          setMetaAiLastError(null);
          setAiEnabled(payload.ai_enabled !== false);
          if (payload.phone_number) {
            setMetaAiPhone(payload.phone_number);
          }
          if (payload.user && onUpdateUser) {
            onUpdateUser(payload.user);
          }
          setAiToast('✓ Meta AI terverifikasi & Balas Otomatis diaktifkan!');
          setTimeout(() => setAiToast(''), 4000);
        }}
      />
    </div>
  );
};
