import React, { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../lib/csrfFetch';
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  MessageCircle,
  ExternalLink,
  Copy,
  Check,
  X,
  Smartphone,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';

interface MetaAiVerifyModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId?: string | null;
  phoneNumber?: string | null;
  autoEnableOnSuccess?: boolean;
  onVerified?: (payload: {
    user?: any;
    ai_enabled?: boolean;
    phone_number?: string | null;
  }) => void;
  onOpenConnectTab?: () => void;
}

type ModalPhase = 'idle' | 'checking' | 'verified' | 'needs_first_chat' | 'not_connected' | 'rate_limited';

export const MetaAiVerifyModal: React.FC<MetaAiVerifyModalProps> = ({
  isOpen,
  onClose,
  sessionId,
  phoneNumber,
  autoEnableOnSuccess = true,
  onVerified,
  onOpenConnectTab
}) => {
  const [phase, setPhase] = useState<ModalPhase>('idle');
  const [activePhone, setActivePhone] = useState<string | null>(phoneNumber || null);
  const [botReplyPreview, setBotReplyPreview] = useState<string | null>(null);
  const [diagnosticReason, setDiagnosticReason] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [copiedNumber, setCopiedNumber] = useState(false);
  const [linkedSessionId, setLinkedSessionId] = useState<string | null>(sessionId || null);
  const [linkedSessionPhone, setLinkedSessionPhone] = useState<string | null>(null);
  const [hasLinkedSession, setHasLinkedSession] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  const runVerificationProbe = useCallback(async () => {
    setPhase('checking');
    setDiagnosticReason(null);
    setStatusMessage('Mengecek kesiapan Meta AI & mencoba memicu chat awal dari aplikasi...');

    try {
      const res = await apiFetch('/api/ai/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId || undefined,
          auto_enable: autoEnableOnSuccess
        })
      });
      const data = await res.json();

      if (data.phone_number) {
        setActivePhone(data.phone_number);
      }
      if (data.session_id) {
        setLinkedSessionId(data.session_id);
      }
      setHasLinkedSession(Boolean(data.has_linked_session));
      setLinkedSessionPhone(data.linked_session_phone || null);

      if (res.status === 429) {
        setPhase('rate_limited');
        setStatusMessage(data.message || 'Mohon tunggu beberapa detik sebelum menguji verifikasi lagi.');
        return;
      }

      if (data.verified) {
        setPhase('verified');
        setBotReplyPreview(data.bot_reply_preview || null);
        setStatusMessage(data.message || 'Meta AI terverifikasi dan siap digunakan!');
        if (onVerified) {
          onVerified({
            user: data.user,
            ai_enabled: data.ai_enabled,
            phone_number: data.phone_number || phoneNumber || activePhone
          });
        }
        return;
      }

      if (data.code === 'WA_NOT_CONNECTED' || data.connected === false) {
        setPhase('not_connected');
        setStatusMessage(
          data.message || 'Nomor WhatsApp belum terhubung. Silakan hubungkan WhatsApp terlebih dahulu.'
        );
        return;
      }

      setPhase('needs_first_chat');
      setDiagnosticReason(data.diagnostic_reason || null);
      setStatusMessage(
        data.message ||
          'Akun WhatsApp ini belum pernah chat dengan Meta AI. Silakan chat dulu di WhatsApp sampai Meta AI membalas.'
      );
    } catch {
      setPhase('needs_first_chat');
      setDiagnosticReason('Koneksi ke server terganggu saat menguji Meta AI.');
      setStatusMessage('Gagal menghubungi server untuk mengecek Meta AI. Silakan coba verifikasi kembali.');
    }
  }, [sessionId, autoEnableOnSuccess, onVerified, phoneNumber, activePhone]);

  useEffect(() => {
    if (isOpen) {
      setActivePhone(phoneNumber || null);
      setBotReplyPreview(null);
      setCopiedNumber(false);
      void runVerificationProbe();
    } else {
      setPhase('idle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, phoneNumber, sessionId]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const formattedPhone = activePhone ? `+${String(activePhone).replace(/^\+/, '')}` : 'nomor WhatsApp Anda';

  const handleCopyMetaNumber = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText('+13135550002').catch(() => {});
    }
    setCopiedNumber(true);
    setTimeout(() => setCopiedNumber(false), 2000);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-[9999] flex items-start sm:items-center justify-center p-4 pt-16 sm:pt-6 pb-20 sm:pb-6 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg max-h-[calc(100dvh-5.5rem)] sm:max-h-[90dvh] flex flex-col overflow-hidden shadow-2xl text-slate-900 dark:text-slate-100 relative"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-2 text-xs font-black text-slate-700 dark:text-slate-200">
            <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Verifikasi Meta AI WhatsApp</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-300 dark:hover:text-white rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shrink-0"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-4">
        {/* PHASE: CHECKING */}
        {phase === 'checking' && (
          <div className="py-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
              <RefreshCw className="w-7 h-7 animate-spin" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                Mengecek &amp; Memicu Meta AI...
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-sm mx-auto">
                Sistem sedang mencoba mengirim sapaan awal otomatis ke <strong>Meta AI</strong> melalui sesi{' '}
                <span className="font-mono font-bold">{formattedPhone}</span> dan menunggu respons (maks. 18 detik).
              </p>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-[11px] text-slate-500 dark:text-slate-400">
              Jika akun WhatsApp ini sudah mendukung Meta AI, sistem akan langsung mengaktifkan fitur balas otomatis untuk Anda.
            </div>
          </div>
        )}

        {/* PHASE: VERIFIED */}
        {phase === 'verified' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Meta AI Berhasil Diverifikasi!
                </h3>
                <p className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">
                  {autoEnableOnSuccess
                    ? 'Meta AI Balas Otomatis sekarang AKTIF.'
                    : 'Akun WhatsApp siap menggunakan Meta AI.'}
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-300">Nomor Terverifikasi</span>
                <strong className="font-mono text-slate-900 dark:text-white">{formattedPhone}</strong>
              </div>
              {botReplyPreview && (
                <div className="pt-2 border-t border-emerald-200/70 dark:border-emerald-800/50 space-y-1">
                  <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 block">
                    Balasan Langsung dari Meta AI:
                  </span>
                  <p className="text-[11px] text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-emerald-200/60 dark:border-emerald-800/40 italic">
                    &quot;{botReplyPreview}&quot;
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl transition-colors min-h-[42px]"
              >
                Selesai &amp; Lanjutkan
              </button>
            </div>
          </div>
        )}

        {/* PHASE: WA NOT CONNECTED */}
        {phase === 'not_connected' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="w-11 h-11 rounded-2xl bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <Smartphone className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  {hasLinkedSession
                    ? 'Sesi WhatsApp Perlu Disambungkan Ulang'
                    : 'WhatsApp Belum Terhubung'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {hasLinkedSession && linkedSessionPhone
                    ? `Perangkat +${linkedSessionPhone} terdaftar namun WebSocket sedang terputus.`
                    : 'Hubungkan perangkat WhatsApp Anda terlebih dahulu.'}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {statusMessage}
            </p>

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl min-h-[42px]"
              >
                Tutup
              </button>
              {hasLinkedSession && linkedSessionId && (
                <button
                  type="button"
                  disabled={isReconnecting}
                  onClick={async () => {
                    setIsReconnecting(true);
                    try {
                      const recRes = await apiFetch(`/api/sessions/${linkedSessionId}/reconnect`, {
                        method: 'POST'
                      });
                      const recData = await recRes.json();
                      if (recData.connected) {
                        await runVerificationProbe();
                        return;
                      }
                      setStatusMessage(
                        recData.message ||
                          'Sesi perlu login ulang melalui Kode Pairing atau Scan QR di menu Koneksi.'
                      );
                    } catch {
                      setStatusMessage('Gagal menyambungkan ulang sesi WhatsApp.');
                    } finally {
                      setIsReconnecting(false);
                    }
                  }}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black rounded-xl flex items-center justify-center gap-1.5 min-h-[42px] disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isReconnecting ? 'animate-spin' : ''}`} />
                  <span>{isReconnecting ? 'Menyambungkan...' : 'Sambungkan Ulang'}</span>
                </button>
              )}
              {onOpenConnectTab && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenConnectTab();
                  }}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl flex items-center justify-center gap-1.5 min-h-[42px]"
                >
                  <span>Buka Menu Koneksi</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* PHASE: RATE LIMITED */}
        {phase === 'rate_limited' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="w-11 h-11 rounded-2xl bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Tunggu Sebentar
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Jeda singkat untuk menjaga keamanan akun WhatsApp.
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {statusMessage}
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl min-h-[42px]"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={runVerificationProbe}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black rounded-xl flex items-center gap-1.5 min-h-[42px]"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Coba Lagi</span>
              </button>
            </div>
          </div>
        )}

        {/* PHASE: NEEDS FIRST CHAT IN WHATSAPP */}
        {phase === 'needs_first_chat' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="w-11 h-11 rounded-2xl bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white leading-snug">
                  Kamu Belum Pernah Chat dengan Meta AI
                </h3>
                <p className="text-xs text-amber-700 dark:text-amber-400 font-semibold mt-0.5">
                  Nomor {formattedPhone} belum mengaktifkan Meta AI di WhatsApp.
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-2xl text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
              Aplikasi sudah mencoba memicu chat awal ke Meta AI secara otomatis, namun WhatsApp belum merespons karena akun{' '}
              <strong className="font-mono">{formattedPhone}</strong> belum pernah memulai chat atau menyetujui syarat fitur Meta AI di aplikasi WhatsApp HP.
            </div>

            {/* Detailed Step-by-Step Guide */}
            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2.5">
              <div className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Ikuti Langkah Ini di WhatsApp HP Anda:</span>
              </div>

              <ol className="space-y-2 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-bold flex items-center justify-center shrink-0 text-[11px] mt-0.5">
                    1
                  </span>
                  <span>
                    Buka aplikasi <strong>WhatsApp</strong> di HP yang login dengan nomor{' '}
                    <strong className="font-mono">{formattedPhone}</strong>.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-bold flex items-center justify-center shrink-0 text-[11px] mt-0.5">
                    2
                  </span>
                  <span>
                    Ketuk ikon lingkaran biru-ungu <strong>Meta AI</strong> di daftar chat WhatsApp, atau gunakan tombol <strong>Buka Chat Meta AI</strong> di bawah.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-bold flex items-center justify-center shrink-0 text-[11px] mt-0.5">
                    3
                  </span>
                  <span>
                    Kirim pesan pembuka (contoh: <strong>&quot;Halo&quot;</strong>). Jika muncul pop-up Syarat &amp; Ketentuan Meta AI di WhatsApp, ketuk <strong>Lanjutkan / Setuju</strong>.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-bold flex items-center justify-center shrink-0 text-[11px] mt-0.5">
                    4
                  </span>
                  <span>
                    <strong>Pastikan Meta AI membalas pesan Anda</strong> di WhatsApp HP tersebut.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold flex items-center justify-center shrink-0 text-[11px] mt-0.5">
                    5
                  </span>
                  <span>
                    Kembali ke sini lalu klik <strong>&quot;Saya Sudah Chat — Verifikasi Sekarang&quot;</strong> agar fitur Meta AI Balas Otomatis bisa diaktifkan.
                  </span>
                </li>
              </ol>

              {/* Quick WA.me link & Copy Meta AI number */}
              <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center gap-2">
                <a
                  href="https://wa.me/13135550002?text=Halo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-xl transition-colors"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Buka Chat Meta AI di WhatsApp</span>
                  <ExternalLink className="w-3 h-3 opacity-80" />
                </a>

                <button
                  type="button"
                  onClick={handleCopyMetaNumber}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-semibold rounded-xl transition-colors"
                >
                  {copiedNumber ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Tersalin (+13135550002)</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Salin +1 313-555-0002</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {diagnosticReason && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 px-1 leading-relaxed">
                Info deteksi: <span className="font-mono">{diagnosticReason}</span>
              </p>
            )}

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl min-h-[42px]"
              >
                Nanti Saja
              </button>
              <button
                type="button"
                onClick={runVerificationProbe}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black rounded-xl shadow-xs flex items-center justify-center gap-1.5 min-h-[42px]"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Saya Sudah Chat — Verifikasi Sekarang</span>
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};
