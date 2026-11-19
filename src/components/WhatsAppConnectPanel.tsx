import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { apiFetch } from '../lib/csrfFetch';
import { lazyWithRetry } from '../lib/lazyWithRetry';
import {
  QrCode,
  Smartphone,
  KeyRound,
  CheckCircle2,
  RefreshCw,
  Copy,
  Check,
  Trash2,
  Star,
  Plus,
  ShieldCheck,
  Send,
  Zap,
  Phone,
  AlertCircle,
  Clock,
  Radio,
  RotateCcw,
  Sparkles,
  ShieldAlert,
  Bot,
  Sliders,
  X,
  Loader2,
  Activity
} from 'lucide-react';
import { WhatsAppSession, UserAccount } from '../types/whatsapp';

const MetaAiVerifyModal = lazyWithRetry(() =>
  import('./MetaAiVerifyModal').then(m => ({ default: m.MetaAiVerifyModal }))
);

function normalizePhoneDigits(input?: string | null): string {
  if (!input) return '';
  let clean = String(input).replace(/\D/g, '');
  if (clean.startsWith('620')) clean = '62' + clean.slice(3);
  else if (clean.startsWith('0')) clean = '62' + clean.slice(1);
  else if (clean.startsWith('8')) clean = '62' + clean;
  return clean;
}

function formatPhonePreview(input: string): string {
  if (!input) return '';
  const clean = normalizePhoneDigits(input);
  return clean ? `+${clean}` : '';
}

// Live Countdown Timer for Connected WhatsApp Account Session Expiry
function SessionExpiryCountdown({
  session,
  onRenew,
  onReLogin
}: {
  session: WhatsAppSession;
  onRenew: (sessionId: string) => void;
  onReLogin?: (session: WhatsAppSession) => void;
}) {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    totalSeconds: number;
    isExpired: boolean;
  }>({ days: 0, hours: 0, minutes: 0, seconds: 0, totalSeconds: 0, isExpired: false });

  const [isRenewing, setIsRenewing] = useState(false);

  useEffect(() => {
    const calculateTime = () => {
      const expiryTime = session.expires_at
        ? new Date(session.expires_at).getTime()
        : (session.connected_at
          ? new Date(session.connected_at).getTime() + 30 * 24 * 60 * 60 * 1000
          : Date.now() + 30 * 24 * 60 * 60 * 1000);

      const diff = expiryTime - Date.now();
      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, totalSeconds: 0, isExpired: true });
        return;
      }

      const totalSec = Math.floor(diff / 1000);
      const days = Math.floor(totalSec / (24 * 3600));
      const hours = Math.floor((totalSec % (24 * 3600)) / 3600);
      const minutes = Math.floor((totalSec % 3600) / 60);
      const seconds = totalSec % 60;

      setTimeLeft({ days, hours, minutes, seconds, totalSeconds: totalSec, isExpired: false });
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [session.expires_at, session.connected_at]);

  const totalCycleSeconds = 30 * 24 * 3600;
  const progressPercent = Math.max(0, Math.min(100, (timeLeft.totalSeconds / totalCycleSeconds) * 100));

  let statusBadge = {
    label: 'Aktif',
    bg: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30',
    barColor: 'bg-emerald-500'
  };

  if (timeLeft.isExpired) {
    statusBadge = {
      label: 'Kedaluwarsa',
      bg: 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/30',
      barColor: 'bg-rose-500'
    };
  } else if (timeLeft.days <= 2) {
    statusBadge = {
      label: 'Segera Login Ulang',
      bg: 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/30',
      barColor: 'bg-rose-500'
    };
  } else if (timeLeft.days <= 7) {
    statusBadge = {
      label: 'Menipis',
      bg: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30',
      barColor: 'bg-amber-500'
    };
  }

  const handleRenewClick = async () => {
    setIsRenewing(true);
    try {
      await onRenew(session.id);
    } finally {
      setIsRenewing(false);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-2.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium tabular-nums">
          <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          {timeLeft.isExpired ? (
            <span className="text-rose-600 dark:text-rose-400 font-semibold">Sesi berakhir</span>
          ) : (
            <span>
              Sisa <strong className="text-slate-900 dark:text-white font-mono">{timeLeft.days}h {String(timeLeft.hours).padStart(2, '0')}j {String(timeLeft.minutes).padStart(2, '0')}m</strong>
            </span>
          )}
        </div>
        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border shrink-0 ${statusBadge.bg}`}>
          {statusBadge.label}
        </span>
      </div>

      <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-1000 ${statusBadge.barColor}`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleRenewClick}
          disabled={isRenewing}
          className="flex-1 justify-center text-[11px] bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-400 px-3 min-h-[38px] rounded-xl border border-emerald-200 dark:border-emerald-800 font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <RotateCcw className={`w-3 h-3 ${isRenewing ? 'animate-spin' : ''}`} />
          <span>{isRenewing ? 'Memproses...' : 'Perpanjang +30 Hr'}</span>
        </button>

        {onReLogin && (
          <button
            type="button"
            onClick={() => onReLogin(session)}
            className="flex-1 justify-center text-[11px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-3 min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 font-bold flex items-center gap-1 transition-colors cursor-pointer"
          >
            <KeyRound className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            <span>Login Ulang</span>
          </button>
        )}
      </div>
    </div>
  );
}

interface WhatsAppConnectPanelProps {
  currentUser?: UserAccount | null;
  initialSessions?: WhatsAppSession[];
  onSessionChange?: () => void;
  onUpdateUser?: (updatedUser: UserAccount) => void;
}

export function WhatsAppConnectPanel({
  currentUser,
  initialSessions = [],
  onSessionChange,
  onUpdateUser
}: WhatsAppConnectPanelProps) {
  const [sessions, setSessions] = useState<WhatsAppSession[]>(initialSessions);
  const [isLoadingSessions, setIsLoadingSessions] = useState<boolean>(initialSessions.length === 0);
  const [isRefreshingSessions, setIsRefreshingSessions] = useState<boolean>(false);
  const [verifiedPhonesFromServer, setVerifiedPhonesFromServer] = useState<string[]>([]);
  const [metaAiVerifyTarget, setMetaAiVerifyTarget] = useState<{ sessionId: string; phoneNumber: string } | null>(null);
  const [aiConfigSession, setAiConfigSession] = useState<WhatsAppSession | null>(null);
  const [aiModeInput, setAiModeInput] = useState<'inherit' | 'on' | 'off'>('inherit');
  const [aiPromptInput, setAiPromptInput] = useState<string>('');
  const [isSavingSessionAi, setIsSavingSessionAi] = useState<boolean>(false);
  const [sessionAiError, setSessionAiError] = useState<string>('');
  // Method 1: Pairing Code, Method 2: QR Code
  const [loginMethod, setLoginMethod] = useState<'pair' | 'qr'>('pair');
  const [showPairGuide, setShowPairGuide] = useState<boolean>(false);

  // Pair Code State
  const [pairPhone, setPairPhone] = useState<string>('628123456789');
  const [pairSessionName, setPairSessionName] = useState<string>('WhatsApp CS Utama');
  const [generatedPairCode, setGeneratedPairCode] = useState<string>('');
  const [copiedPairCode, setCopiedPairCode] = useState<boolean>(false);
  const [isGeneratingPair, setIsGeneratingPair] = useState<boolean>(false);
  const [pairError, setPairError] = useState<string>('');
  const [pairCountdown, setPairCountdown] = useState<number>(0);
  const [pairPollGraceUntil, setPairPollGraceUntil] = useState<number>(0);

  // Sync pairPhone with logged-in user phone if available
  useEffect(() => {
    if (currentUser?.phone && (!pairPhone || pairPhone === '628123456789')) {
      setPairPhone(currentUser.phone);
    }
  }, [currentUser?.phone]);

  // Live countdown timer for active pairing code (120s limit by WhatsApp)
  useEffect(() => {
    if (pairCountdown <= 0) return;
    const interval = setInterval(() => {
      setPairCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [pairCountdown]);

  // Handler to prepare re-login for an expiring or expired session
  const handleReLogin = (session: WhatsAppSession) => {
    setLoginMethod('pair');
    setPairPhone(session.phone_number || '');
    setPairSessionName(session.session_name || `WA Pair - ${session.phone_number}`);
    setGeneratedPairCode('');
    setPairError('');
    setPairCountdown(0);
    setPairPollGraceUntil(0);
    window.scrollTo({ top: 100, behavior: 'smooth' });
    showToast(`👉 Nomor +${session.phone_number} siap dihubungkan ulang. Klik 'Dapatkan Kode Pairing' untuk meminta kode dari WhatsApp!`);
  };

  // QR State
  const [qrImage, setQrImage] = useState<string>('');
  const [qrToken, setQrToken] = useState<string>('');
  const [countdown, setCountdown] = useState<number>(20);
  const [isLoadingQr, setIsLoadingQr] = useState<boolean>(false);
  const [qrError, setQrError] = useState<string>('');

  // Quick Test Message State
  const [testModalSession, setTestModalSession] = useState<WhatsAppSession | null>(null);
  const [testRecipient, setTestRecipient] = useState<string>('6281234567890');
  const [testMessage, setTestMessage] = useState<string>('Halo, ini uji coba pesan dari Japriin Pro (100% Bersih Tanpa Watermark).');
  const [testStatus, setTestStatus] = useState<string>('');

  // Delete Session Modal State
  const [sessionToDelete, setSessionToDelete] = useState<{ id: string; phone: string; name: string } | null>(null);
  const [isDeletingSession, setIsDeletingSession] = useState<boolean>(false);

  // Live Connection & WhatsApp Chat Send Health Check State (non-aggressive, no reconnect)
  const [testingHealthId, setTestingHealthId] = useState<string | null>(null);
  const [healthTestResults, setHealthTestResults] = useState<Record<string, { ok: boolean; can_send: boolean; message: string; multi_location_active?: boolean; latency_ms?: number }>>({});

  // Toast feedback
  const [toastMsg, setToastMsg] = useState<string>('');

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3500);
  };

  // Fetch connected sessions immediately (decoupled from /api/ai/status so device list appears right away)
  const fetchSessions = useCallback(async (opts?: { silent?: boolean }) => {
    const isSilent = Boolean(opts?.silent);
    if (!isSilent) {
      setIsRefreshingSessions(true);
      setSessions(prev => {
        if (prev.length === 0) setIsLoadingSessions(true);
        return prev;
      });
    }
    try {
      const url = currentUser?.id ? `/api/sessions?userId=${encodeURIComponent(currentUser.id)}` : '/api/sessions';
      if (currentUser?.id) {
        void apiFetch('/api/ai/status')
          .then(r => (r.ok ? r.json() : null))
          .then(aiData => {
            if (aiData?.success && Array.isArray(aiData.meta_ai_verified_phones)) {
              setVerifiedPhonesFromServer(
                aiData.meta_ai_verified_phones.map((p: string) => normalizePhoneDigits(p)).filter(Boolean)
              );
            }
          })
          .catch(() => {});
      }

      const sessRes = await apiFetch(url);
      const data = await sessRes.json();
      if (data.success) {
        setSessions(data.data || []);
      }
    } catch (err) {
      console.error('Gagal mengambil daftar sesi WA:', err);
    } finally {
      setIsLoadingSessions(false);
      setIsRefreshingSessions(false);
    }
  }, [currentUser?.id]);

  const isSessionMetaAiVerified = useCallback(
    (phoneNumber?: string | null) => {
      const clean = normalizePhoneDigits(phoneNumber);
      if (!clean) return false;
      const userList = Array.isArray(currentUser?.meta_ai_verified_phones)
        ? currentUser.meta_ai_verified_phones.map(p => normalizePhoneDigits(p)).filter(Boolean)
        : [];
      if (userList.includes(clean) || verifiedPhonesFromServer.includes(clean)) return true;
      if (currentUser?.meta_ai_verified && currentUser?.meta_ai_verified_phone) {
        return normalizePhoneDigits(currentUser.meta_ai_verified_phone) === clean;
      }
      return false;
    },
    [currentUser?.meta_ai_verified, currentUser?.meta_ai_verified_phone, currentUser?.meta_ai_verified_phones, verifiedPhonesFromServer]
  );

  // Fetch dynamic QR code from server
  const fetchQrCode = useCallback(async () => {
    setIsLoadingQr(true);
    setQrError('');
    try {
      const targetSessionId = currentUser?.id ? `session_user_${currentUser.id}` : 'session_primary_default';
      const payload: Record<string, any> = { session_id: targetSessionId, user_id: currentUser?.id };
      const res = await apiFetch('/api/sessions/qr/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success && data.delegated) {
        setQrImage('');
        setQrError('');
        setActivePairingSessionId(data.session_id || targetSessionId);
        showToast(data.message || '✓ Permintaan QR sedang diproses di server gateway.');
        fetchSessions();
      } else if (res.ok && data.success && data.qr_image) {
        setQrImage(data.qr_image);
        setQrToken(data.session_id || targetSessionId);
        setActivePairingSessionId(data.session_id || targetSessionId);
        setCountdown(20);
        setQrError('');
      } else if (res.ok && data.success && data.status === 'connected') {
        setQrImage('');
        setQrError('');
        setActivePairingSessionId(data.session_id || targetSessionId);
        fetchSessions();
      } else {
        const errMsg = data?.error || 'Gagal membuat QR Code sesi WhatsApp.';
        setQrImage('');
        setQrError(errMsg);
        showToast(`⚠️ ${errMsg}`);
      }
    } catch (err) {
      console.error('Gagal generate QR Code:', err);
      setQrError('Gagal menghubungi server untuk membuat QR Code.');
    } finally {
      setIsLoadingQr(false);
    }
  }, [currentUser?.id, fetchSessions]);

  const [activePairingSessionId, setActivePairingSessionId] = useState<string>('session_primary_default');
  const [notifiedConnected, setNotifiedConnected] = useState<boolean>(false);

  // Poll socket status every 2.5 seconds while waiting on QR scan or pairing confirmation (including brief 515 restart handoff grace)
  const isWaitingForConnection =
    (loginMethod === 'qr' && Boolean(qrImage)) ||
    (loginMethod === 'pair' && Boolean(generatedPairCode) && (pairCountdown > 0 || pairPollGraceUntil > Date.now()));

  useEffect(() => {
    if (!isWaitingForConnection) return;
    let isSubscribed = true;
    const pollInterval = setInterval(async () => {
      if (loginMethod === 'pair' && pairCountdown <= 0 && pairPollGraceUntil <= Date.now()) {
        return;
      }
      try {
        const targetSessionId = activePairingSessionId || (currentUser?.id ? `session_user_${currentUser.id}` : 'session_primary_default');
        const res = await apiFetch(`/api/sessions/status/${targetSessionId}`);
        const data = await res.json();
        if (isSubscribed && data.success && data.data) {
          if (data.data.status === 'connected') {
            if (!notifiedConnected) {
              setNotifiedConnected(true);
              showToast(`🎉 WhatsApp ${data.data.phoneNumber || ''} berhasil terhubung!`);
              setGeneratedPairCode('');
              setPairPollGraceUntil(0);
              setQrImage('');
              fetchSessions();
              if (onSessionChange) onSessionChange();
            }
          } else {
            if (notifiedConnected) setNotifiedConnected(false);
            if (data.data.status === 'connecting' && loginMethod === 'pair' && pairCountdown <= 0) {
              setPairPollGraceUntil(prev => Math.max(prev, Date.now() + 10000));
            }
            if (data.data.qrCodeUrl && data.data.qrCodeUrl !== qrImage) {
              setQrImage(data.data.qrCodeUrl);
            }
          }
        }
      } catch (err) {
        // Silent poll error
      }
    }, 2500);

    return () => {
      isSubscribed = false;
      clearInterval(pollInterval);
    };
  }, [isWaitingForConnection, qrImage, activePairingSessionId, fetchSessions, onSessionChange, notifiedConnected, currentUser?.id, loginMethod, pairCountdown, pairPollGraceUntil]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Auto-poll silently ONLY while a device is actively in connecting state
  const hasConnectingSession = sessions.some(s => (s.runtime_status || s.status) === 'connecting');
  useEffect(() => {
    if (!hasConnectingSession) return;
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchSessions({ silent: true });
    }, 3500);
    return () => clearInterval(timer);
  }, [hasConnectingSession, fetchSessions]);

  const isAnySessionConnected = sessions.some(s => s.status === 'connected');

  // Only start QR socket when user explicitly switches to the QR tab and has no connected device yet
  useEffect(() => {
    if (loginMethod === 'qr' && !isAnySessionConnected) {
      fetchQrCode();
    }
  }, [loginMethod, isAnySessionConnected, fetchQrCode]);

  // QR Countdown Timer auto refresh - only if on QR tab, not connected, and no blocking error
  useEffect(() => {
    if (loginMethod !== 'qr' || isAnySessionConnected || qrError) return;

    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchQrCode();
          return 20;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [loginMethod, fetchQrCode, isAnySessionConnected, qrError]);

  // Generate 8-Digit Pairing Code
  const handleGeneratePairCode = async () => {
    if (!pairPhone) {
      setPairError('Nomor WhatsApp wajib diisi.');
      return;
    }
    setIsGeneratingPair(true);
    setPairError('');
    setGeneratedPairCode('');

    try {
      let cleanPhone = pairPhone.replace(/\D/g, '');
      if (cleanPhone.startsWith('620')) cleanPhone = '62' + cleanPhone.slice(3);
      else if (cleanPhone.startsWith('0')) cleanPhone = '62' + cleanPhone.slice(1);
      else if (cleanPhone.startsWith('8')) cleanPhone = '62' + cleanPhone;

      if (!cleanPhone || cleanPhone.length < 9) {
        setPairError('Format nomor tidak valid. Pastikan nomor WhatsApp memiliki minimal 9 digit angka.');
        setIsGeneratingPair(false);
        return;
      }

      const pairSessionId = `session_user_${currentUser?.id || 'guest'}_${cleanPhone}`;
      setActivePairingSessionId(pairSessionId);

      const pairPayload: Record<string, any> = {
        phone_number: cleanPhone,
        user_id: currentUser?.id,
        session_id: pairSessionId
      };

      const res = await apiFetch('/api/sessions/pair-code/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pairPayload)
      });
      const data = await res.json();
      if (data.success && data.delegated) {
        if (data.session_id) {
          setActivePairingSessionId(data.session_id);
        }
        showToast(data.message || '✓ Permintaan pairing sedang diproses di server gateway.');
        fetchSessions();
      } else if (data.success && data.pairing_code) {
        const expiresSec = Number(data.expires_in || 120);
        setGeneratedPairCode(data.pairing_code);
        setPairCountdown(expiresSec);
        setPairPollGraceUntil(Date.now() + (expiresSec + 20) * 1000);
        if (data.session_id) {
          setActivePairingSessionId(data.session_id);
        }
        showToast('🔑 Kode Pairing berhasil dibuat! Masukkan 8 digit kode ini di WhatsApp HP Anda.');
      } else {
        setPairError(data.details || data.error || 'Gagal meminta Kode Pairing dari WhatsApp.');
      }
    } catch (err: any) {
      console.error('Gagal generate pairing code:', err);
      setPairError('Terjadi kesalahan koneksi ke server WhatsApp. Silakan coba beberapa saat lagi.');
    } finally {
      setIsGeneratingPair(false);
    }
  };

  // Non-aggressive Live Send & Connection Check
  const handleVerifyLiveConnection = async (session: WhatsAppSession) => {
    setTestingHealthId(session.id);
    try {
      const res = await apiFetch(`/api/sessions/${encodeURIComponent(session.id)}/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ send_chat_probe: true })
      });
      const data = await res.json();
      setHealthTestResults(prev => ({
        ...prev,
        [session.id]: {
          ok: Boolean(data.ok),
          can_send: Boolean(data.can_send),
          message: data.message || data.error || 'Pengecekan selesai.',
          multi_location_active: Boolean(data.multi_location_active),
          latency_ms: data.latency_ms
        }
      }));
      if (data.ok) {
        showToast(data.message || '✓ WhatsApp aman terkoneksi & siap kirim pesan!');
        fetchSessions({ silent: true });
      } else {
        showToast(`⚠️ ${data.message || data.error || 'Koneksi belum merespons.'}`);
      }
    } catch {
      setHealthTestResults(prev => ({
        ...prev,
        [session.id]: {
          ok: false,
          can_send: false,
          message: 'Gagal menghubungi server untuk uji koneksi.'
        }
      }));
      showToast('⚠️ Gagal menguji koneksi WhatsApp.');
    } finally {
      setTestingHealthId(null);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setTestModalSession(null);
        setSessionToDelete(null);
        setAiConfigSession(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Renew / Extend session validity +30 days
  const handleRenewSession = async (sessionId: string) => {
    try {
      const res = await apiFetch(`/api/sessions/${sessionId}/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 30 })
      });
      const data = await res.json();
      if (data.success) {
        showToast('🎉 Masa aktif sesi WhatsApp berhasil diperpanjang +30 hari!');
        fetchSessions();
        if (onSessionChange) onSessionChange();
      } else {
        showToast(data.error || 'Gagal memperpanjang masa aktif sesi.');
      }
    } catch (err) {
      console.error('Gagal memperpanjang sesi:', err);
      showToast('Terjadi kesalahan saat memperpanjang sesi.');
    }
  };

  // Set Primary Session
  const handleSetPrimary = async (id: string) => {
    try {
      const res = await apiFetch(`/api/sessions/${id}/primary`, { method: 'PUT' });
      const data = await res.json();
      if (data.success) {
        showToast('⭐️ Nomor utama berhasil diperbarui.');
        fetchSessions();
        if (onSessionChange) onSessionChange();
      }
    } catch (err) {
      console.error('Gagal set nomor utama:', err);
    }
  };

  // Open Delete Confirm Modal
  const handleOpenDeleteModal = (session: WhatsAppSession) => {
    setSessionToDelete({
      id: session.id,
      phone: session.phone_number,
      name: session.session_name
    });
  };

  // Execute Delete Session
  const handleConfirmDelete = async () => {
    if (!sessionToDelete) return;
    setIsDeletingSession(true);
    try {
      const res = await apiFetch(`/api/sessions/${sessionToDelete.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast(`🗑️ Sesi ${sessionToDelete.name} (${sessionToDelete.phone}) berhasil dihapus.`);
        setSessionToDelete(null);
        fetchSessions();
        if (onSessionChange) onSessionChange();
      } else {
        showToast('Gagal menghapus sesi.');
      }
    } catch (err) {
      console.error('Gagal delete session:', err);
    } finally {
      setIsDeletingSession(false);
    }
  };

  // Send Test WhatsApp Message
  const handleSendTestMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testModalSession || !testRecipient) return;

    setTestStatus('Mengirim pesan pengujian...');
    try {
      const res = await apiFetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: testRecipient,
          message: testMessage,
          session_id: testModalSession.id
        })
      });
      const data = await res.json();
      if (data.success) {
        setTestStatus('✅ Pesan WhatsApp terbukti berhasil terkirim ke ponsel tujuan!');
        showToast('🚀 Pesan WhatsApp berhasil terkirim!');
      } else {
        setTestStatus(`❌ ${data.details || data.error || 'Gagal mengirim pesan.'}`);
      }
    } catch (err) {
      setTestStatus('❌ Error koneksi ke server saat mengirim pesan.');
    }
  };

  const openSessionAiConfig = (session: WhatsAppSession) => {
    setAiConfigSession(session);
    setAiModeInput(session.ai_enabled === true ? 'on' : session.ai_enabled === false ? 'off' : 'inherit');
    setAiPromptInput(session.custom_system_prompt || '');
    setSessionAiError('');
  };

  const handleSaveSessionAi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiConfigSession) return;
    setIsSavingSessionAi(true);
    setSessionAiError('');
    try {
      const nextAiEnabled = aiModeInput === 'inherit' ? null : aiModeInput === 'on';
      const res = await apiFetch(`/api/sessions/${aiConfigSession.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ai_enabled: nextAiEnabled,
          custom_system_prompt: aiPromptInput.trim()
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data?.code === 'META_AI_NOT_VERIFIED' || data?.code === 'WA_NOT_CONNECTED') {
          const targetSessionId = data.session_id || aiConfigSession.id;
          const targetPhone = data.phone_number || aiConfigSession.phone_number;
          setAiConfigSession(null);
          setMetaAiVerifyTarget({ sessionId: targetSessionId, phoneNumber: targetPhone });
          return;
        }
        setSessionAiError(data?.error || 'Gagal menyimpan pengaturan AI perangkat.');
        return;
      }

      if (data.data) {
        setSessions(prev => prev.map(s => (s.id === data.data.id ? { ...s, ...data.data } : s)));
      } else {
        fetchSessions();
      }
      setAiConfigSession(null);
      if (onSessionChange) onSessionChange();
      showToast(`✓ Pengaturan AI untuk +${aiConfigSession.phone_number} berhasil disimpan.`);
    } catch {
      setSessionAiError('Gagal menghubungi server saat menyimpan pengaturan AI perangkat.');
    } finally {
      setIsSavingSessionAi(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPairCode(true);
    setTimeout(() => setCopiedPairCode(false), 2000);
  };

  return (
    <div id="wa-connect-panel" className="space-y-6 mb-8 transition-colors duration-200">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-50 bg-slate-900 dark:bg-slate-800 text-white font-bold text-xs px-4 py-3 rounded-2xl shadow-2xl border border-emerald-500/40 flex items-center gap-2.5 max-w-sm animate-in fade-in slide-in-from-bottom-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="leading-snug">{toastMsg}</span>
        </div>
      )}

      {/* CONNECT CARD */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              Hubungkan Nomor WhatsApp
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Pilih kode pairing 8-digit atau scan QR (maks. 1 nomor WhatsApp per akun). Sesi tanpa aktivitas pesan selama 3 hari akan dibersihkan otomatis.
            </p>
          </div>

          {/* Segmented Method Switcher */}
          <div className="grid grid-cols-2 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 sm:w-64 shrink-0">
            <button
              type="button"
              onClick={() => setLoginMethod('pair')}
              className={`min-h-[38px] px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                loginMethod === 'pair'
                  ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Kode Pairing</span>
            </button>
            <button
              type="button"
              onClick={() => setLoginMethod('qr')}
              className={`min-h-[38px] px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                loginMethod === 'qr'
                  ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Scan QR</span>
            </button>
          </div>
        </div>

        {/* METHOD 1: PAIRING CODE */}
        {loginMethod === 'pair' && (
          <div className="bg-slate-50 dark:bg-slate-950 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Nomor WhatsApp
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={pairPhone}
                    onChange={(e) => setPairPhone(e.target.value)}
                    placeholder="08123456789"
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white pl-10 pr-3.5 min-h-[44px] rounded-xl font-mono focus:outline-none focus:border-emerald-500 font-semibold tabular-nums"
                  />
                </div>
                {pairPhone && (
                  <p className="mt-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 tabular-nums">
                    Format terdeteksi: {formatPhonePreview(pairPhone)}
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Nama Label Perangkat
                </label>
                <input
                  type="text"
                  value={pairSessionName}
                  onChange={(e) => setPairSessionName(e.target.value)}
                  placeholder="Contoh: WA Toko Utama"
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white px-3.5 min-h-[44px] rounded-xl focus:outline-none focus:border-emerald-500 font-medium"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleGeneratePairCode}
              disabled={isGeneratingPair}
              className="w-full sm:w-auto px-5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 min-h-[44px]"
            >
              <KeyRound className="w-4 h-4" />
              <span>{isGeneratingPair ? 'Memproses Kode...' : 'Minta Kode Pairing'}</span>
            </button>

            {pairError && (
              <div className="p-3.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-xl text-xs text-amber-900 dark:text-amber-300 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{pairError}</span>
                </div>
                <p className="text-[11px] opacity-80">
                  Jika limit pairing sementara tercapai, gunakan tab <strong>Scan QR</strong> di atas.
                </p>
              </div>
            )}

            {generatedPairCode && (
              <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-emerald-300 dark:border-emerald-500/40 text-center space-y-3.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-slate-700 dark:text-slate-300">
                    Kode Pairing Anda
                  </span>
                  {pairCountdown > 0 ? (
                    <span className="px-2.5 py-0.5 bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 font-mono text-xs font-bold rounded-full tabular-nums">
                      {Math.floor(pairCountdown / 60)}:{String(pairCountdown % 60).padStart(2, '0')}
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 text-xs font-bold rounded-full">
                      Kedaluwarsa
                    </span>
                  )}
                </div>

                {pairCountdown <= 0 ? (
                  <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-800 dark:text-rose-300 space-y-2">
                    <p className="font-bold">Masa berlaku kode habis (120 detik).</p>
                    <button
                      type="button"
                      onClick={handleGeneratePairCode}
                      disabled={isGeneratingPair}
                      className="px-4 min-h-[40px] bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl"
                    >
                      {isGeneratingPair ? 'Membuat...' : 'Buat Kode Baru'}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-center gap-2">
                      <div className="font-mono text-2xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 tracking-widest bg-emerald-50 dark:bg-emerald-500/10 px-5 py-3 rounded-xl border border-emerald-200 dark:border-emerald-500/30 tabular-nums">
                        {generatedPairCode}
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(generatedPairCode)}
                        className="w-11 h-11 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0"
                        title="Salin Kode"
                        aria-label="Salin Kode"
                      >
                        {copiedPairCode ? <Check className="w-5 h-5 text-emerald-600" /> : <Copy className="w-5 h-5" />}
                      </button>
                    </div>

                    <p className="text-[11px] text-slate-600 dark:text-slate-300">
                      Buka WhatsApp di HP &gt; <strong>Perangkat Tertaut</strong> &gt; <strong>Tautkan dengan nomor telepon</strong>.
                    </p>

                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowPairGuide(v => !v)}
                        className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline px-2 py-1"
                      >
                        {showPairGuide ? 'Sembunyikan panduan' : 'Kendala / lihat panduan lengkap'}
                      </button>
                      <button
                        type="button"
                        onClick={handleGeneratePairCode}
                        disabled={isGeneratingPair}
                        className="px-3.5 min-h-[38px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs rounded-xl flex items-center gap-1.5"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingPair ? 'animate-spin' : ''}`} />
                        <span>Kode Baru</span>
                      </button>
                    </div>

                    {showPairGuide && (
                      <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-left text-[11px] text-slate-600 dark:text-slate-300 space-y-2">
                        <ol className="list-decimal list-inside space-y-1">
                          <li>Pastikan WhatsApp di HP memakai nomor <strong>{formatPhonePreview(pairPhone)}</strong>.</li>
                          <li>Buka Perangkat Tertaut &gt; Tautkan Perangkat &gt; Tautkan dengan nomor telepon saja.</li>
                          <li>Ketik 8 karakter kode di atas sebelum timer habis.</li>
                        </ol>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* METHOD 2: QR CODE */}
        {loginMethod === 'qr' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 bg-slate-50 dark:bg-slate-950 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="lg:col-span-5 flex flex-col items-center justify-center bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <div className="relative mb-3">
                {isLoadingQr ? (
                  <div className="w-[200px] h-[200px] bg-slate-100 dark:bg-slate-800 rounded-xl flex flex-col items-center justify-center text-slate-400 gap-2">
                    <RefreshCw className="w-7 h-7 animate-spin text-emerald-600" />
                    <span className="text-xs font-medium">Memuat QR...</span>
                  </div>
                ) : qrImage ? (
                  <div className="p-2 bg-white rounded-xl border border-slate-200">
                    <img src={qrImage} alt="WhatsApp Login Barcode QR" className="w-[190px] h-[190px] object-contain rounded-lg" />
                  </div>
                ) : qrError ? (
                  <div className="w-[210px] min-h-[160px] bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 rounded-xl p-3 flex flex-col items-center justify-center text-rose-700 dark:text-rose-300 text-xs gap-2">
                    <AlertCircle className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0" />
                    <span className="font-bold leading-snug">{qrError}</span>
                  </div>
                ) : (
                  <div className="w-[200px] h-[200px] bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-400 text-xs">
                    QR belum tersedia
                  </div>
                )}
              </div>

              <div className="w-full space-y-1.5 mb-3">
                <div className="flex justify-between items-center text-[11px] text-slate-500 font-medium tabular-nums">
                  <span>Perbarui otomatis</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">{countdown}d</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-600 h-full transition-all duration-1000"
                    style={{ width: `${(countdown / 20) * 100}%` }}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={fetchQrCode}
                disabled={isLoadingQr}
                className="w-full px-3 min-h-[40px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingQr ? 'animate-spin text-emerald-600' : ''}`} />
                <span>Refresh QR</span>
              </button>
            </div>

            <div className="lg:col-span-7 flex flex-col justify-center space-y-2.5">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                Cara Scan QR di HP
              </h3>
              <ol className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                <li className="flex items-center gap-2.5 bg-white dark:bg-slate-900 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="w-5 h-5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
                  <span>Buka <strong>WhatsApp</strong> &gt; menu <strong>Perangkat Tertaut</strong>.</span>
                </li>
                <li className="flex items-center gap-2.5 bg-white dark:bg-slate-900 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="w-5 h-5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
                  <span>Ketuk <strong>Tautkan Perangkat</strong> lalu arahkan kamera ke QR di samping.</span>
                </li>
              </ol>
            </div>
          </div>
        )}
      </div>

      {/* CONNECTED WHATSAPP SESSIONS LIST */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            <Smartphone className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
              Perangkat Tertaut ({sessions.length})
            </h3>
            {(isLoadingSessions || isRefreshingSessions) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-500/30">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Memuat...</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {sessions.length > 0 && (
              <button
                type="button"
                onClick={() => sessions.forEach(s => handleRenewSession(s.id))}
                className="px-3 min-h-[38px] bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 text-xs font-bold rounded-xl flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Perpanjang Semua</span>
                <span className="sm:hidden">+30 Hr</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => fetchSessions()}
              disabled={isLoadingSessions || isRefreshingSessions}
              className="w-9 h-9 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl flex items-center justify-center disabled:opacity-60"
              aria-label="Refresh Sesi"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSessions || isRefreshingSessions ? 'animate-spin text-emerald-600' : ''}`} />
            </button>
          </div>
        </div>

        {isRefreshingSessions && sessions.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            <span>Memperbarui status koneksi perangkat terhubung...</span>
          </div>
        )}

        {isLoadingSessions && sessions.length === 0 ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300">
              <Loader2 className="w-4 h-4 text-emerald-600 animate-spin shrink-0" />
              <span>Sedang memuat daftar perangkat WhatsApp terhubung...</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {[0, 1].map((idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70 space-y-3 animate-pulse"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-300 dark:bg-emerald-700" />
                      <div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 rounded-md" />
                    </div>
                    <div className="h-5 w-16 bg-slate-200 dark:bg-slate-800 rounded-full" />
                  </div>
                  <div className="h-9 w-full bg-slate-200/80 dark:bg-slate-800/80 rounded-xl" />
                  <div className="h-8 w-full bg-slate-200/60 dark:bg-slate-800/60 rounded-xl" />
                  <div className="h-10 w-full bg-slate-200/70 dark:bg-slate-800/70 rounded-xl" />
                </div>
              ))}
            </div>
          </div>
        ) : sessions.length === 0 ? (
          <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-1.5">
            <Smartphone className="w-8 h-8 text-slate-400 mx-auto opacity-60" />
            <p className="text-xs text-slate-700 dark:text-slate-300 font-bold">Belum ada perangkat terhubung</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Gunakan Kode Pairing atau Scan QR di atas.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {sessions.map((session) => {
              const effectiveRuntime = session.runtime_status || session.status;
              const isLiveConnected = effectiveRuntime === 'connected';
              const isConnecting = effectiveRuntime === 'connecting';

              return (
              <div
                key={session.id}
                className={`p-4 rounded-2xl border flex flex-col justify-between ${
                  session.is_primary
                    ? 'bg-emerald-50/40 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/30'
                    : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          isLiveConnected
                            ? 'bg-emerald-500'
                            : isConnecting
                              ? 'bg-amber-500 animate-pulse'
                              : 'bg-rose-500'
                        }`}
                      />
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                        {session.session_name}
                      </h4>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {(isLiveConnected || isConnecting) && (
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                            isLiveConnected
                              ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
                              : 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30'
                          }`}
                        >
                          {isLiveConnected ? 'Online' : 'Menyambung...'}
                        </span>
                      )}
                      {session.is_primary && (
                        <span className="px-2 py-0.5 bg-emerald-600 text-white text-[10px] font-bold rounded-full flex items-center gap-1">
                          <Star className="w-2.5 h-2.5 fill-white" />
                          <span>Utama</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 px-3 py-2 rounded-xl border border-slate-200/80 dark:border-slate-800">
                    <strong className="text-slate-900 dark:text-white font-mono tabular-nums">+{session.phone_number}</strong>
                    <div className="flex items-center gap-1.5">
                      {session.multi_location_active && isLiveConnected && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30">
                          Aktif Multi-Lokasi · Aman
                        </span>
                      )}
                      <span className="text-[10px] font-semibold uppercase text-emerald-600 dark:text-emerald-400">
                        {session.auth_method === 'pairing_code' ? 'Pairing' : 'QR'}
                      </span>
                    </div>
                  </div>

                  {healthTestResults[session.id] && (
                    <div
                      className={`mt-2 px-3 py-2 rounded-xl border text-[10px] font-semibold leading-snug ${
                        healthTestResults[session.id].ok
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                          : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                      }`}
                    >
                      {healthTestResults[session.id].message}
                    </div>
                  )}

                  {/* Meta AI Readiness Strip */}
                  <div className="mt-2.5 flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/70 text-[11px]">
                    {isSessionMetaAiVerified(session.phone_number) ? (
                      <>
                        <span className="flex items-center gap-1.5 font-bold text-emerald-700 dark:text-emerald-400">
                          <Sparkles className="w-3.5 h-3.5 shrink-0" />
                          <span>Meta AI Terverifikasi</span>
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setMetaAiVerifyTarget({
                              sessionId: session.id,
                              phoneNumber: session.phone_number
                            })
                          }
                          className="text-[10px] font-bold text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 underline"
                        >
                          Tes Ulang
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-400">
                          <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                          <span>Meta AI Belum Verifikasi</span>
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setMetaAiVerifyTarget({
                              sessionId: session.id,
                              phoneNumber: session.phone_number
                            })
                          }
                          className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold rounded-lg shrink-0 transition-colors"
                        >
                          Cek &amp; Aktifkan
                        </button>
                      </>
                    )}
                  </div>

                  {/* Hybrid AI Per-Number Strip */}
                  <div className="mt-2 flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/50 text-[11px]">
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                      <Bot className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          session.ai_enabled === true
                            ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            : session.ai_enabled === false
                              ? 'bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300'
                              : 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                        }`}
                      >
                        {session.ai_enabled === true
                          ? 'AI: Aktif Khusus'
                          : session.ai_enabled === false
                            ? 'AI: Nonaktif Khusus'
                            : 'AI: Ikuti Akun'}
                      </span>
                      {session.custom_system_prompt && session.custom_system_prompt.trim() && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300">
                          Prompt Khusus
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => openSessionAiConfig(session)}
                      className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-bold rounded-lg shrink-0 flex items-center gap-1 transition-colors"
                    >
                      <Sliders className="w-3 h-3" />
                      <span>Atur AI</span>
                    </button>
                  </div>

                  <SessionExpiryCountdown
                    session={session}
                    onRenew={handleRenewSession}
                    onReLogin={handleReLogin}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-3 mt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => handleVerifyLiveConnection(session)}
                    disabled={testingHealthId === session.id}
                    className="flex-1 min-w-[130px] px-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 min-h-[40px] disabled:opacity-60"
                    title="Tes kirim WhatsApp untuk memastikan koneksi aman tanpa memaksa putus/reconnect"
                  >
                    <Activity className={`w-3.5 h-3.5 ${testingHealthId === session.id ? 'animate-spin' : ''}`} />
                    <span>{testingHealthId === session.id ? 'Menguji...' : 'Cek Status & Kirim'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTestModalSession(session);
                      setTestStatus('');
                    }}
                    className="px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 min-h-[40px]"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Tes Pesan</span>
                  </button>

                  {!session.is_primary && (
                    <button
                      type="button"
                      onClick={() => handleSetPrimary(session.id)}
                      className="px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1 min-h-[40px]"
                    >
                      <Star className="w-3.5 h-3.5 text-amber-500" />
                      <span>Utama</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleOpenDeleteModal(session)}
                    className="w-10 h-10 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors flex items-center justify-center shrink-0"
                    title="Putuskan Nomor"
                    aria-label="Putuskan Nomor"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* TEST MESSAGE MODAL */}
      {testModalSession && (
        <div
          className="fixed inset-0 z-[9999] flex items-start sm:items-center justify-center p-4 pt-16 sm:pt-6 pb-20 sm:pb-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setTestModalSession(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full max-h-[calc(100dvh-5.5rem)] sm:max-h-[90dvh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <h3 className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Send className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Uji Coba Pengiriman Pesan WhatsApp</span>
              </h3>
              <button
                type="button"
                onClick={() => setTestModalSession(null)}
                aria-label="Tutup modal"
                className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-white rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSendTestMessage} className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-3.5 text-xs">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Dari Nomor:</label>
                  <div className="bg-slate-100 dark:bg-slate-800 p-2.5 rounded-xl font-mono text-slate-700 dark:text-slate-300">
                    +{testModalSession.phone_number} ({testModalSession.session_name})
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Nomor Tujuan WhatsApp:</label>
                  <input
                    type="text"
                    required
                    value={testRecipient}
                    onChange={(e) => setTestRecipient(e.target.value)}
                    placeholder="Contoh: 6281234567890"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Isi Pesan:</label>
                  <textarea
                    rows={3}
                    required
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 resize-none leading-relaxed"
                  />
                </div>

                {testStatus && (
                  <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl font-medium text-[11px] leading-relaxed">
                    {testStatus}
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-2 px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={() => setTestModalSession(null)}
                  className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-xl font-bold min-h-[38px] text-xs"
                >
                  Tutup
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black shadow-md min-h-[38px] text-xs"
                >
                  Kirim Pesan Sekarang
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM MODAL */}
      {sessionToDelete && (
        <div
          className="fixed inset-0 z-[9999] flex items-start sm:items-center justify-center p-4 pt-16 sm:pt-6 pb-20 sm:pb-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setSessionToDelete(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full max-h-[calc(100dvh-5.5rem)] sm:max-h-[90dvh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <span className="font-black text-xs text-slate-900 dark:text-white">Konfirmasi Putus Sesi</span>
              <button
                type="button"
                onClick={() => setSessionToDelete(null)}
                aria-label="Tutup modal"
                className="p-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-300 rounded-full bg-slate-100 dark:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-center overflow-y-auto">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 mx-auto flex items-center justify-center">
                <Trash2 className="w-6 h-6" />
              </div>

              <div className="space-y-1">
                <h3 className="font-black text-base text-slate-900 dark:text-white">Putuskan Sesi WhatsApp?</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Sesi <strong>{sessionToDelete.name}</strong> (+{sessionToDelete.phone}) akan dihapus dari sistem.
                </p>
              </div>
            </div>

            <div className="flex gap-2 px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setSessionToDelete(null)}
                className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold min-h-[40px]"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeletingSession}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black shadow-md min-h-[40px]"
              >
                {isDeletingSession ? 'Menghapus...' : 'Ya, Putuskan'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Meta AI Verification & Initial Chat Trigger Modal */}
      {metaAiVerifyTarget && (
        <Suspense fallback={null}>
          <MetaAiVerifyModal
            isOpen={Boolean(metaAiVerifyTarget)}
            onClose={() => setMetaAiVerifyTarget(null)}
            sessionId={metaAiVerifyTarget?.sessionId}
            phoneNumber={metaAiVerifyTarget?.phoneNumber}
            autoEnableOnSuccess={true}
            onVerified={(payload) => {
              const clean = normalizePhoneDigits(payload.phone_number || metaAiVerifyTarget?.phoneNumber);
              if (clean) {
                setVerifiedPhonesFromServer(prev => (prev.includes(clean) ? prev : [...prev, clean]));
              }
              if (payload.user && onUpdateUser) {
                onUpdateUser(payload.user);
              }
              if (onSessionChange) onSessionChange();
              showToast('✓ Meta AI berhasil diverifikasi dan siap membalas otomatis!');
            }}
          />
        </Suspense>
      )}

      {/* Hybrid Per-Device AI Configuration Modal */}
      {aiConfigSession && (
        <div
          className="fixed inset-0 z-[9999] flex items-start sm:items-center justify-center p-4 pt-16 sm:pt-6 pb-20 sm:pb-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setAiConfigSession(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full max-h-[calc(100dvh-5.5rem)] sm:max-h-[90dvh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div className="min-w-0 pr-2">
                <h3 className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <Bot className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span className="truncate">Atur AI Per Nomor (Hybrid)</span>
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono truncate">
                  +{aiConfigSession.phone_number} · {aiConfigSession.session_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAiConfigSession(null)}
                className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-white rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 shrink-0"
                aria-label="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSessionAi} className="flex-1 min-h-0 flex flex-col text-xs">
              <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
                {sessionAiError && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50 rounded-xl text-rose-700 dark:text-rose-300 font-semibold flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{sessionAiError}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 dark:text-slate-300 block">
                    Status Meta AI untuk Nomor Ini
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setAiModeInput('inherit')}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        aiModeInput === 'inherit'
                          ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-500/15 text-indigo-800 dark:text-indigo-200'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <div className="font-bold text-[11px]">Ikuti Akun</div>
                      <div className="text-[10px] opacity-80">Default global akun</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAiModeInput('on')}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        aiModeInput === 'on'
                          ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <div className="font-bold text-[11px]">Aktif Khusus</div>
                      <div className="text-[10px] opacity-80">Selalu aktif di nomor ini</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAiModeInput('off')}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        aiModeInput === 'off'
                          ? 'border-rose-500 bg-rose-50/70 dark:bg-rose-500/15 text-rose-800 dark:text-rose-200'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <div className="font-bold text-[11px]">Matikan Khusus</div>
                      <div className="text-[10px] opacity-80">Cocok untuk nomor broadcast</div>
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="font-bold text-slate-700 dark:text-slate-300">
                      Prompt / Karakter AI Khusus Nomor Ini (Opsional)
                    </label>
                    {aiPromptInput.trim() && (
                      <button
                        type="button"
                        onClick={() => setAiPromptInput('')}
                        className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        Reset ke Default Akun
                      </button>
                    )}
                  </div>
                  <textarea
                    rows={4}
                    maxLength={4000}
                    value={aiPromptInput}
                    onChange={(e) => setAiPromptInput(e.target.value)}
                    placeholder="Kosongkan untuk mengikuti Karakter AI Utama Akun. Isi jika nomor ini punya peran berbeda, misal: 'Kamu adalah CS khusus klaim garansi...' atau 'Kamu adalah admin cabang Bandung...'"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 leading-relaxed"
                  />
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Mode <strong>Hybrid</strong>: Jika dikosongkan, nomor ini otomatis memakai prompt utama di tab <em>Auto-Reply AI</em>. Jika diisi, nomor ini memakai instruksi khusus di atas.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={() => setAiConfigSession(null)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-xl font-bold min-h-[38px]"
                >
                  Tutup
                </button>
                <button
                  type="submit"
                  disabled={isSavingSessionAi}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black shadow-md min-h-[38px] flex items-center gap-1.5 disabled:opacity-60"
                >
                  {isSavingSessionAi ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>{isSavingSessionAi ? 'Menyimpan...' : 'Simpan Pengaturan Nomor'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
