import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/csrfFetch';
import {
  User,
  ShieldCheck,
  Smartphone,
  Key,
  Mail,
  Copy,
  Check,
  Sparkles,
  Award,
  Lock,
  RefreshCw,
  Zap,
  CheckCircle2,
  Calendar,
  CreditCard,
  Eye,
  EyeOff,
  Save,
  Trash2,
  MessageSquare,
  ChevronDown,
  ShieldAlert
} from 'lucide-react';
import { UserAccount, SubscriptionPlan } from '../types/whatsapp';
import { MetaAiVerifyModal } from './MetaAiVerifyModal';

interface ProfilePanelProps {
  currentUser: UserAccount | null;
  plans: SubscriptionPlan[];
  onOpenPinModal: () => void;
  onOpenUpgradeModal: (plan: SubscriptionPlan) => void;
  onUpdateUser: (updatedUser: UserAccount) => void;
  onOpenConnectTab?: () => void;
}

export const ProfilePanel: React.FC<ProfilePanelProps> = ({
  currentUser,
  plans,
  onOpenPinModal,
  onOpenUpgradeModal,
  onUpdateUser,
  onOpenConnectTab
}) => {
  const [copiedKey, setCopiedKey] = useState(false);
  const [isRegeneratingKey, setIsRegeneratingKey] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [showAiGuide, setShowAiGuide] = useState(false);
  const [isMetaAiVerifyOpen, setIsMetaAiVerifyOpen] = useState(false);

  // Personal AI Settings & Meta AI Status state
  const [metaAiStatus, setMetaAiStatus] = useState<{
    connected: boolean;
    verified: boolean;
    phone_number: string | null;
    session_id: string | null;
    queue_depth: number;
    meta_ai_jid: string;
    last_error: string | null;
    loading: boolean;
  }>({
    connected: false,
    verified: false,
    phone_number: null,
    session_id: null,
    queue_depth: 0,
    meta_ai_jid: '13135550002@s.whatsapp.net',
    last_error: null,
    loading: true
  });
  const [offlineMessageInput, setOfflineMessageInput] = useState('');
  const [allowedNumbersInput, setAllowedNumbersInput] = useState('');
  const [allowedNumbersList, setAllowedNumbersList] = useState<string[]>([]);
  const [isSavingMsg, setIsSavingMsg] = useState(false);
  const [isSavingNumbers, setIsSavingNumbers] = useState(false);

  // Email and WhatsApp Verification States
  const [emailOtp, setEmailOtp] = useState('');
  const [waOtp, setWaOtp] = useState('');
  const [isSendingEmailOtp, setIsSendingEmailOtp] = useState(false);
  const [isSendingWaOtp, setIsSendingWaOtp] = useState(false);
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);
  const [isVerifyingWa, setIsVerifyingWa] = useState(false);
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [showWaInput, setShowWaInput] = useState(false);
  const [verificationError, setVerificationError] = useState('');
  const [emailCooldown, setEmailCooldown] = useState<number>(0);
  const [waCooldown, setWaCooldown] = useState<number>(0);

  // Change Password States (Default Email)
  const [pwdResetMethod, setPwdResetMethod] = useState<'whatsapp' | 'email'>('email');
  const [pwdOtpSent, setPwdOtpSent] = useState(false);
  const [pwdOtpCode, setPwdOtpCode] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmNewPasswordInput, setConfirmNewPasswordInput] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isSendingPwdOtp, setIsSendingPwdOtp] = useState(false);
  const [isSubmittingNewPwd, setIsSubmittingNewPwd] = useState(false);
  const [pwdChangeError, setPwdChangeError] = useState('');
  const [pwdChangeSuccess, setPwdChangeSuccess] = useState('');
  const [pwdOtpCooldown, setPwdOtpCooldown] = useState<number>(0);

  // 30 seconds countdown timers for OTP sending
  useEffect(() => {
    if (emailCooldown <= 0) return;
    const timer = setInterval(() => setEmailCooldown(prev => (prev > 0 ? prev - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [emailCooldown]);

  useEffect(() => {
    if (waCooldown <= 0) return;
    const timer = setInterval(() => setWaCooldown(prev => (prev > 0 ? prev - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [waCooldown]);

  useEffect(() => {
    if (pwdOtpCooldown <= 0) return;
    const timer = setInterval(() => setPwdOtpCooldown(prev => (prev > 0 ? prev - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [pwdOtpCooldown]);

  const fetchMetaAiStatus = async () => {
    try {
      const res = await apiFetch('/api/ai/status');
      const data = await res.json();
      if (data?.success) {
        setMetaAiStatus({
          connected: Boolean(data.meta_ai_connected),
          verified: Boolean(data.meta_ai_verified),
          phone_number: data.phone_number || null,
          session_id: data.session_id || null,
          queue_depth: Number(data.queue_depth) || 0,
          meta_ai_jid: data.meta_ai_jid || '13135550002@s.whatsapp.net',
          last_error: data.last_error || null,
          loading: false
        });
      } else {
        setMetaAiStatus(prev => ({ ...prev, loading: false }));
      }
    } catch {
      setMetaAiStatus(prev => ({ ...prev, loading: false }));
    }
  };

  // Sync inputs with user account when it changes
  useEffect(() => {
    if (currentUser) {
      setOfflineMessageInput(currentUser.custom_offline_message || '');
      setAllowedNumbersList(currentUser.allowed_numbers || []);
      fetchMetaAiStatus();
    }
  }, [currentUser]);

  const handleSendEmailOtp = async () => {
    if (!currentUser || emailCooldown > 0 || isSendingEmailOtp) return;
    setIsSendingEmailOtp(true);
    setVerificationError('');
    setEmailCooldown(30);
    try {
      const res = await apiFetch('/api/user/send-email-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.id })
      });
      const data = await res.json().catch(() => null);
      if (data && data.success) {
        setShowEmailInput(true);
        setSuccessMsg('Kode verifikasi OTP telah dikirim ke email Anda!');
        if (data.cooldown_seconds) setEmailCooldown(data.cooldown_seconds);
        setTimeout(() => setSuccessMsg(''), 3000);
      } else if (data && data.cooldown_seconds) {
        setEmailCooldown(data.cooldown_seconds);
        setVerificationError(data.error);
      } else {
        setVerificationError(data?.error || 'Gagal mengirim email OTP.');
      }
    } catch (err) {
      setVerificationError('Terjadi kesalahan koneksi.');
    } finally {
      setIsSendingEmailOtp(false);
    }
  };

  const handleVerifyEmailOtp = async () => {
    if (!currentUser || !emailOtp) return;
    setIsVerifyingEmail(true);
    setVerificationError('');
    try {
      const res = await apiFetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.id, otp: emailOtp, type: 'email' })
      });
      const data = await res.json();
      if (data.success && data.user) {
        onUpdateUser(data.user);
        setShowEmailInput(false);
        setEmailOtp('');
        setSuccessMsg('✓ Email Anda berhasil diverifikasi!');
        setTimeout(() => setSuccessMsg(''), 4000);
      } else {
        setVerificationError(data.error || 'Kode OTP tidak cocok atau sudah kadaluarsa.');
      }
    } catch (err) {
      setVerificationError('Terjadi kesalahan verifikasi.');
    } finally {
      setIsVerifyingEmail(false);
    }
  };

  const handleSendWaOtp = async () => {
    if (!currentUser || waCooldown > 0 || isSendingWaOtp) return;
    setIsSendingWaOtp(true);
    setVerificationError('');
    setWaCooldown(30);
    try {
      const res = await apiFetch('/api/user/send-wa-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.id })
      });
      const data = await res.json().catch(() => null);
      if (data && data.success) {
        setShowWaInput(true);
        setSuccessMsg('Kode verifikasi OTP telah dikirim ke nomor WhatsApp Anda!');
        if (data.cooldown_seconds) setWaCooldown(data.cooldown_seconds);
        setTimeout(() => setSuccessMsg(''), 3000);
      } else if (data && data.cooldown_seconds) {
        setWaCooldown(data.cooldown_seconds);
        setVerificationError(data.error);
      } else {
        setVerificationError(data?.error || 'Gagal mengirim WhatsApp OTP.');
      }
    } catch (err) {
      setVerificationError('Terjadi kesalahan koneksi.');
    } finally {
      setIsSendingWaOtp(false);
    }
  };

  const handleVerifyWaOtp = async () => {
    if (!currentUser || !waOtp) return;
    setIsVerifyingWa(true);
    setVerificationError('');
    try {
      const res = await apiFetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.id, otp: waOtp, type: 'whatsapp' })
      });
      const data = await res.json();
      if (data.success && data.user) {
        onUpdateUser(data.user);
        setShowWaInput(false);
        setWaOtp('');
        setSuccessMsg('✓ Nomor WhatsApp Anda berhasil diverifikasi!');
        setTimeout(() => setSuccessMsg(''), 4000);
      } else {
        setVerificationError(data.error || 'Kode OTP tidak cocok atau sudah kadaluarsa.');
      }
    } catch (err) {
      setVerificationError('Terjadi kesalahan verifikasi.');
    } finally {
      setIsVerifyingWa(false);
    }
  };

  const handleRequestPasswordOtp = async () => {
    if (!currentUser || pwdOtpCooldown > 0 || isSendingPwdOtp) return;
    setPwdChangeError('');
    setPwdChangeSuccess('');

    if (pwdResetMethod === 'email' && !currentUser.email_verified) {
      setPwdChangeError('Email Anda belum terverifikasi. Silakan verifikasi email terlebih dahulu pada bagian Verifikasi Alamat Email di atas, atau gunakan metode utama WhatsApp.');
      return;
    }

    const identifier = pwdResetMethod === 'whatsapp' ? (currentUser.phone || currentUser.email) : currentUser.email;
    if (!identifier) {
      setPwdChangeError('Nomor WhatsApp atau Email tidak ditemukan pada akun Anda.');
      return;
    }

    setIsSendingPwdOtp(true);
    setPwdOtpCooldown(30);
    try {
      const res = await apiFetch('/api/auth/forgot-password/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, method: pwdResetMethod })
      });
      const data = await res.json().catch(() => null);
      if (data && data.success) {
        setPwdOtpSent(true);
        setPwdChangeSuccess(
          pwdResetMethod === 'whatsapp'
            ? 'Kode OTP rahasia untuk ganti password telah dikirim ke nomor WhatsApp Anda.'
            : 'Kode OTP rahasia untuk ganti password telah dikirim ke alamat Email terverifikasi Anda.'
        );
        if (data.cooldown_seconds) setPwdOtpCooldown(data.cooldown_seconds);
      } else if (data && data.cooldown_seconds) {
        setPwdOtpCooldown(data.cooldown_seconds);
        setPwdChangeError(data.error);
      } else {
        setPwdChangeError(data?.error || 'Gagal mengirim kode OTP ganti password.');
      }
    } catch (err) {
      setPwdChangeError('Terjadi kesalahan koneksi saat meminta OTP.');
    } finally {
      setIsSendingPwdOtp(false);
    }
  };

  const handleResetPasswordWithOtp = async () => {
    if (!currentUser) return;
    setPwdChangeError('');
    setPwdChangeSuccess('');

    if (!pwdOtpCode || pwdOtpCode.trim().length < 6) {
      setPwdChangeError('Masukkan 6-digit kode OTP terlebih dahulu.');
      return;
    }
    if (!newPasswordInput || newPasswordInput.length < 8) {
      setPwdChangeError('Password baru minimal harus terdiri dari 8 karakter.');
      return;
    }
    if (newPasswordInput !== confirmNewPasswordInput) {
      setPwdChangeError('Konfirmasi password baru tidak cocok.');
      return;
    }

    const identifier = pwdResetMethod === 'whatsapp' ? (currentUser.phone || currentUser.email) : currentUser.email;
    setIsSubmittingNewPwd(true);
    try {
      const res = await apiFetch('/api/auth/forgot-password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier,
          otp: pwdOtpCode.trim(),
          new_password: newPasswordInput
        })
      });
      const data = await res.json();
      if (data.success) {
        setPwdOtpSent(false);
        setPwdOtpCode('');
        setNewPasswordInput('');
        setConfirmNewPasswordInput('');
        setPwdChangeSuccess('✓ Password akun Anda berhasil diperbarui!');
        setSuccessMsg('✓ Password akun Anda berhasil diperbarui!');
        setTimeout(() => setSuccessMsg(''), 4000);
      } else {
        setPwdChangeError(data.error || 'Kode OTP tidak valid atau gagal mengganti password.');
      }
    } catch (err) {
      setPwdChangeError('Terjadi kesalahan koneksi saat memperbarui password.');
    } finally {
      setIsSubmittingNewPwd(false);
    }
  };

  const isAdmin = currentUser?.role === 'admin';
  const currentPlan = plans.find(p => p.id === currentUser?.plan_id) || plans[0];
  const dailyLimit = isAdmin ? 999999 : (currentPlan?.daily_msg_limit || 100);
  const sentToday = currentUser?.daily_messages_sent || 0;
  const percentUsed = isAdmin ? 5 : Math.min(100, Math.round((sentToday / dailyLimit) * 100));

  const handleCopyApiKey = () => {
    if (!currentUser?.api_key) return;
    navigator.clipboard.writeText(currentUser.api_key);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleRegenerateKey = async () => {
    if (!currentUser) return;
    setIsRegeneratingKey(true);
    try {
      const res = await apiFetch('/api/user/api-key/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.id })
      });
      const data = await res.json();
      if (data.success && data.api_key) {
        const updated = { ...currentUser, api_key: data.api_key };
        onUpdateUser(updated);
        setSuccessMsg('API Token baru berhasil digenerate!');
        setTimeout(() => setSuccessMsg(''), 3000);
      }
    } catch (err) {
      console.error('Failed to regenerate API key:', err);
    } finally {
      setIsRegeneratingKey(false);
    }
  };

  const handleSaveOfflineMessage = async () => {
    if (!currentUser) return;
    setIsSavingMsg(true);
    try {
      const res = await apiFetch('/api/user/offline-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.id, message: offlineMessageInput })
      });
      const data = await res.json();
      if (data.success && data.user) {
        onUpdateUser(data.user);
        setSuccessMsg(data.message || 'Kata balasan kustom berhasil disimpan!');
        setTimeout(() => setSuccessMsg(''), 3000);
      } else {
        setVerificationError(data.error || 'Gagal menyimpan pesan offline.');
      }
    } catch (err) {
      console.error('Failed to save offline message:', err);
    } finally {
      setIsSavingMsg(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-4xl mx-auto">
      {/* Compact Profile Header Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-extrabold text-xl sm:text-2xl shrink-0">
            {currentUser?.name?.charAt(0)?.toUpperCase() || 'U'}
          </div>

          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-xl font-extrabold text-slate-900 dark:text-white truncate">
                {currentUser?.name || 'Pengguna'}
              </h2>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                {isAdmin ? 'Admin' : currentPlan?.name || 'Starter'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate font-mono">
              @{currentUser?.username || 'user'}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400 pt-0.5">
              <span className="flex items-center gap-1 truncate max-w-full">
                <Mail className="w-3 h-3 shrink-0" />
                <span className="truncate">{currentUser?.email || '-'}</span>
              </span>
              <span className="flex items-center gap-1 font-mono">
                <Smartphone className="w-3 h-3 shrink-0" />
                <span>{currentUser?.phone || '-'}</span>
              </span>
            </div>
          </div>
        </div>

        {!isAdmin && (
          <button
            onClick={() => {
              const proPlan = plans.find(p => p.id === 'pro') || plans[plans.length - 1];
              onOpenUpgradeModal(proPlan);
            }}
            className="w-full sm:w-auto min-h-[44px] justify-center px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-xs transition-all shrink-0 flex items-center gap-1.5"
          >
            <Sparkles className="w-4 h-4" />
            <span>Upgrade Paket</span>
          </button>
        )}
      </div>

      {successMsg && (
        <div className="p-3.5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-2xl text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Grid Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {/* Card 1: Subscription & Quota */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <span className="p-2 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 rounded-xl shrink-0">
                <Award className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{isAdmin ? 'Kuota Sistem' : 'Langganan & Kuota'}</h3>
                <span className="text-[11px] text-slate-500">{isAdmin ? 'Akses penuh pengelola' : 'Reset tiap 00.00 WIB'}</span>
              </div>
            </div>
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 capitalize">
              {isAdmin ? 'Unlimited' : (currentUser?.plan_status || 'Aktif')}
            </span>
          </div>

          <div className="space-y-2.5">
            <div className="flex justify-between gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 tabular-nums">
              <span>Terpakai Hari Ini</span>
              <span>{sentToday} / {isAdmin ? '∞' : dailyLimit}</span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
              <div className="bg-emerald-600 h-full transition-all duration-300" style={{ width: `${percentUsed}%` }}></div>
            </div>
          </div>

          {!isAdmin && (
            <button
              onClick={() => {
                const proPlan = plans.find(p => p.id === 'pro') || plans[plans.length - 1];
                onOpenUpgradeModal(proPlan);
              }}
              className="w-full min-h-[42px] py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs rounded-xl transition-colors"
            >
              Lihat Paket Lainnya
            </button>
          )}
        </div>

        {/* Card 2: Security & PIN */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <span className="p-2 bg-amber-50 dark:bg-amber-500/10 text-amber-600 rounded-xl shrink-0">
                <Lock className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">PIN Bot WhatsApp</h3>
                <span className="text-[11px] text-slate-500">Konfirmasi perintah sensitif</span>
              </div>
            </div>
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">Aktif</span>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Melindungi aksi kirim pesan atau ubah data yang dikirim langsung melalui chat WhatsApp.
          </p>

          <button
            onClick={onOpenPinModal}
            className="w-full min-h-[44px] py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <Key className="w-4 h-4" />
            <span>Atur / Ganti PIN</span>
          </button>
        </div>
      </div>

      {/* Card: Account Verification (Email Verification Only) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex items-center space-x-2.5 pb-3 border-b border-slate-100 dark:border-slate-800">
          <span className="p-2.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 rounded-2xl shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </span>
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white">Status Verifikasi Akun (Email)</h3>
            <span className="text-xs text-slate-500">Akun diverifikasi cukup menggunakan alamat Email Anda dan langsung aktif penuh</span>
          </div>
        </div>

        {verificationError && (
          <div className="p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 text-rose-600 dark:text-rose-400 rounded-2xl text-xs font-bold">
            ⚠️ {verificationError}
          </div>
        )}

        <div className="pt-1">
          {/* Email Verification Block */}
          <div className="p-4 sm:p-5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1.5">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Mail className="w-4 h-4 text-emerald-600 shrink-0" /> Verifikasi Alamat Email Utama
              </span>
              <span className={`self-start sm:self-auto px-2.5 py-0.5 rounded-full text-[10px] font-black ${currentUser?.email_verified || currentUser?.is_active ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'}`}>
                {currentUser?.email_verified || currentUser?.is_active ? '✓ Akun Aktif & Terverifikasi' : 'Belum Verifikasi'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Email terdaftar Anda: <strong className="text-slate-700 dark:text-slate-300 font-extrabold break-all">{currentUser?.email}</strong>. Nomor kontak WhatsApp profil: <strong className="text-slate-700 dark:text-slate-300 font-extrabold">{currentUser?.phone || '-'}</strong>.
            </p>
            {!currentUser?.email_verified && !currentUser?.is_active && (
              <div className="space-y-2.5 pt-1">
                {!showEmailInput ? (
                  <button
                    onClick={handleSendEmailOtp}
                    disabled={isSendingEmailOtp || emailCooldown > 0}
                    className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center space-x-1.5 shadow-xs disabled:opacity-55"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSendingEmailOtp || emailCooldown > 0 ? 'animate-spin' : ''}`} />
                    <span>
                      {isSendingEmailOtp
                        ? 'Mengirim...'
                        : emailCooldown > 0
                        ? `Kirim Ulang (${emailCooldown}s)`
                        : 'Kirim Kode OTP ke Email'}
                    </span>
                  </button>
                ) : (
                  <div className="space-y-2.5">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <input
                        type="text"
                        value={emailOtp}
                        onChange={e => setEmailOtp(e.target.value)}
                        placeholder="Masukkan 6-digit OTP"
                        className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-xs font-bold tracking-widest text-center focus:outline-none"
                      />
                      <button
                        onClick={handleVerifyEmailOtp}
                        disabled={isVerifyingEmail || !emailOtp}
                        className="w-full sm:w-auto px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl shadow-xs disabled:opacity-55"
                      >
                        {isVerifyingEmail ? 'Verifikasi...' : 'Verifikasi'}
                      </button>
                    </div>
                    <button
                      onClick={handleSendEmailOtp}
                      disabled={isSendingEmailOtp || emailCooldown > 0}
                      className="text-[11px] text-slate-500 hover:underline block text-left disabled:opacity-50"
                    >
                      {emailCooldown > 0 ? `Kirim ulang kode OTP (${emailCooldown}s)` : 'Kirim ulang kode OTP'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Card: Ganti Password Akun (Default WhatsApp, Opsi Kedua Email Terverifikasi) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center space-x-2.5">
            <span className="p-2.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 rounded-2xl shrink-0">
              <Lock className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Ganti Password Akun</h3>
              <span className="text-xs text-slate-500">Verifikasi OTP default menggunakan WhatsApp atau opsi kedua menggunakan Email terverifikasi</span>
            </div>
          </div>
        </div>

        {pwdChangeError && (
          <div className="p-3.5 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 text-rose-600 dark:text-rose-400 rounded-2xl text-xs font-bold leading-relaxed">
            ⚠️ {pwdChangeError}
          </div>
        )}

        {pwdChangeSuccess && (
          <div className="p-3.5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 text-emerald-700 dark:text-emerald-300 rounded-2xl text-xs font-bold leading-relaxed">
            {pwdChangeSuccess}
          </div>
        )}

        <div className="space-y-4 pt-1">
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-2">
              Pilih Metode Pengiriman OTP Ganti Password:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setPwdResetMethod('whatsapp');
                  setPwdChangeError('');
                }}
                className={`p-3.5 rounded-2xl border text-left transition-all flex items-start gap-3 ${
                  pwdResetMethod === 'whatsapp'
                    ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500 text-emerald-900 dark:text-emerald-200 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                <Smartphone className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="text-xs font-black flex flex-wrap items-center gap-1.5">
                    <span>WhatsApp</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-600 text-white font-bold">Default Utama</span>
                  </div>
                  <p className="text-[11px] opacity-80">Kirim OTP ke nomor {currentUser?.phone || '-'}</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPwdResetMethod('email');
                  setPwdChangeError('');
                }}
                className={`p-3.5 rounded-2xl border text-left transition-all flex items-start gap-3 ${
                  pwdResetMethod === 'email'
                    ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-500 text-indigo-900 dark:text-indigo-200 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                <Mail className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="text-xs font-black flex flex-wrap items-center gap-1.5">
                    <span>Email (Opsi Kedua)</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      currentUser?.email_verified
                        ? 'bg-emerald-500/15 text-emerald-600'
                        : 'bg-amber-500/15 text-amber-600'
                    }`}>
                      {currentUser?.email_verified ? '✓ Email Terverifikasi' : 'Wajib Verif Dulu'}
                    </span>
                  </div>
                  <p className="text-[11px] opacity-80 break-all">
                    {currentUser?.email_verified
                      ? `Kirim OTP ke ${currentUser?.email}`
                      : 'Verifikasi email di atas terlebih dahulu agar bisa menerima OTP reset password'}
                  </p>
                </div>
              </button>
            </div>
          </div>

          {!pwdOtpSent ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {pwdResetMethod === 'whatsapp'
                  ? 'Kode OTP rahasia akan dikirimkan langsung ke nomor WhatsApp Anda.'
                  : currentUser?.email_verified
                  ? 'Kode OTP rahasia akan dikirimkan ke alamat email terverifikasi Anda.'
                  : 'Alamat email Anda belum diverifikasi. Silakan verifikasi email di bagian atas atau pilih metode WhatsApp.'}
              </p>
              <button
                type="button"
                onClick={handleRequestPasswordOtp}
                disabled={isSendingPwdOtp || (pwdResetMethod === 'email' && !currentUser?.email_verified) || pwdOtpCooldown > 0}
                className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl shadow-sm transition-all shrink-0 disabled:opacity-50"
              >
                {isSendingPwdOtp
                  ? 'Mengirim OTP...'
                  : pwdOtpCooldown > 0
                  ? `Tunggu (${pwdOtpCooldown}s)`
                  : `Kirim OTP via ${pwdResetMethod === 'whatsapp' ? 'WhatsApp' : 'Email'}`}
              </button>
            </div>
          ) : (
            <div className="p-4 sm:p-5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">Kode OTP (6 Digit)</label>
                  <input
                    type="text"
                    value={pwdOtpCode}
                    onChange={e => setPwdOtpCode(e.target.value)}
                    placeholder="Masukkan OTP"
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-bold tracking-widest text-center focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">Password Baru</label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      minLength={8}
                      value={newPasswordInput}
                      onChange={e => setNewPasswordInput(e.target.value)}
                      placeholder="Minimal 8 karakter"
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-3.5 pr-9 py-2.5 text-xs focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">Ulangi Password Baru</label>
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={confirmNewPasswordInput}
                    onChange={e => setConfirmNewPasswordInput(e.target.value)}
                    placeholder="Konfirmasi password"
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleRequestPasswordOtp}
                  disabled={isSendingPwdOtp || pwdOtpCooldown > 0}
                  className="text-xs text-slate-500 hover:text-emerald-600 font-bold text-left disabled:opacity-50"
                >
                  {pwdOtpCooldown > 0 ? `Kirim ulang kode OTP (${pwdOtpCooldown}s)` : 'Kirim ulang kode OTP'}
                </button>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPwdOtpSent(false);
                      setPwdOtpCode('');
                    }}
                    className="w-full sm:w-auto px-4 py-2.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleResetPasswordWithOtp}
                    disabled={isSubmittingNewPwd}
                    className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl shadow-sm disabled:opacity-50"
                  >
                    {isSubmittingNewPwd ? 'Menyimpan...' : 'Simpan Password Baru'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Card 3: Native Meta AI via Connected WhatsApp & Custom Offline Message */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-xs space-y-5">
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="p-2 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 rounded-xl shrink-0">
              <Sparkles className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Meta AI &amp; Pesan Offline</h3>
              <span className="text-[11px] text-slate-500">Status mesin AI &amp; balasan cadangan</span>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchMetaAiStatus}
            className="min-h-[36px] px-2.5 text-xs font-bold text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-xl flex items-center gap-1 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${metaAiStatus.loading ? 'animate-spin' : ''}`} />
            <span>Cek</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Meta AI via WhatsApp Baileys Status */}
          <div className="space-y-3">
            <div className={`p-3.5 rounded-2xl border space-y-2 ${
              metaAiStatus.connected && metaAiStatus.verified
                ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60'
                : 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60'
            }`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  {metaAiStatus.connected && !metaAiStatus.verified && (
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  )}
                  <span>
                    {metaAiStatus.connected && metaAiStatus.verified
                      ? 'Meta AI Siap & Terverifikasi'
                      : metaAiStatus.connected
                        ? 'Perlu Verifikasi Meta AI'
                        : 'WhatsApp Offline'}
                  </span>
                </span>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                  metaAiStatus.connected && metaAiStatus.verified
                    ? 'bg-emerald-600 text-white'
                    : 'bg-amber-500 text-slate-950'
                }`}>
                  {metaAiStatus.connected && metaAiStatus.verified
                    ? 'Terverifikasi'
                    : metaAiStatus.connected
                      ? 'Belum Chat'
                      : 'Offline'}
                </span>
              </div>

              <div className="text-[11px] text-slate-600 dark:text-slate-300 space-y-0.5 tabular-nums">
                <div>
                  Nomor Aktif: <strong className="font-mono text-slate-900 dark:text-white">{metaAiStatus.phone_number || 'Belum terhubung'}</strong>
                </div>
                <div>
                  Antrean AI: <strong>{metaAiStatus.queue_depth}</strong>
                </div>
              </div>

              {metaAiStatus.connected && (
                <button
                  type="button"
                  onClick={() => setIsMetaAiVerifyOpen(true)}
                  className={`w-full mt-1.5 py-2 px-3 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors ${
                    metaAiStatus.verified
                      ? 'bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{metaAiStatus.verified ? 'Uji Ulang Meta AI' : 'Cek & Aktifkan Meta AI'}</span>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowAiGuide(prev => !prev)}
              className="w-full min-h-[40px] px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between"
            >
              <span>Cara kerja Meta AI</span>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showAiGuide ? 'rotate-180' : ''}`} />
            </button>

            {showAiGuide && (
              <ol className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 rounded-2xl list-decimal list-inside space-y-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                <li>Hubungkan WhatsApp lewat menu <strong>Koneksi</strong>.</li>
                <li>Aktifkan <strong>AI Customer Service</strong> di menu <strong>Balasan</strong>.</li>
                <li>Semua pesan pelanggan yang masuk diteruskan langsung ke chat Meta AI.</li>
                <li>Jika bot offline atau AI mati, sistem memakai <strong>Pesan Offline</strong>.</li>
              </ol>
            )}
          </div>

          {/* Custom Offline Message */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-1 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                Pesan Offline Default
              </label>
              <p className="text-[11px] text-slate-500 mb-2">
                Dipakai saat AI dimatikan/offline. Variabel: <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-emerald-600">{`{nama}`}</code>
              </p>
              <textarea
                value={offlineMessageInput}
                onChange={(e) => setOfflineMessageInput(e.target.value)}
                placeholder="Halo {nama}, maaf saat ini petugas kami sedang offline..."
                rows={3}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-emerald-500 leading-relaxed"
              />
            </div>

            <button
              onClick={handleSaveOfflineMessage}
              disabled={isSavingMsg}
              className="w-full sm:w-auto min-h-[42px] justify-center px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs disabled:opacity-55"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSavingMsg ? 'Menyimpan...' : 'Simpan Balasan'}</span>
            </button>
          </div>

          {/* Allowed Numbers Section */}
          <div className="md:col-span-2 space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <div>
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-1.5 flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-indigo-600" />
                Nomor Diizinkan (Perintah via Chat WA)
              </label>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="text"
                  value={allowedNumbersInput}
                  onChange={e => setAllowedNumbersInput(e.target.value)}
                  placeholder="Contoh: 628123456789"
                  className="flex-1 min-h-[42px] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (allowedNumbersInput && !allowedNumbersList.includes(allowedNumbersInput)) {
                      setAllowedNumbersList([...allowedNumbersList, allowedNumbersInput]);
                      setAllowedNumbersInput('');
                    }
                  }}
                  className="w-full sm:w-auto min-h-[42px] px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold"
                >
                  Tambah
                </button>
              </div>
            </div>
            {allowedNumbersList.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {allowedNumbersList.map((num, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl text-xs font-mono">
                    <span>{num}</span>
                    <button
                      type="button"
                      onClick={() => setAllowedNumbersList(allowedNumbersList.filter((_, i) => i !== idx))}
                      className="p-1 text-slate-500 hover:text-rose-500"
                      aria-label={`Hapus ${num}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              disabled={isSavingNumbers}
              onClick={async () => {
                setIsSavingNumbers(true);
                try {
                  const res = await apiFetch('/api/user/allowed-numbers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: currentUser!.id, allowed_numbers: allowedNumbersList })
                  });
                  const data = await res.json();
                  if (data.success) {
                    onUpdateUser(data.user);
                    setSuccessMsg('Nomor diizinkan berhasil disimpan!');
                    setTimeout(() => setSuccessMsg(''), 3000);
                  }
                } finally {
                  setIsSavingNumbers(false);
                }
              }}
              className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors disabled:opacity-55"
            >
              {isSavingNumbers ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Simpan Nomor Diizinkan'}
            </button>
          </div>
        </div>
      </div>

      {/* Card 4: Developer API Token */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center space-x-2.5">
            <span className="p-2.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 rounded-2xl shrink-0">
              <Key className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Developer API Token v1</h3>
              <span className="text-xs text-slate-500">Token rahasia untuk integrasi aplikasi luar dengan Japriin</span>
            </div>
          </div>

          <button
            onClick={handleRegenerateKey}
            disabled={isRegeneratingKey}
            className="w-full sm:w-auto justify-center px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-bold rounded-xl flex items-center space-x-1.5 border border-slate-200 dark:border-slate-700"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRegeneratingKey ? 'animate-spin' : ''}`} />
            <span>Generate Ulang</span>
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <input
            type="text"
            readOnly
            value={currentUser?.api_key || 'mgw_live_token_sample'}
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-xs font-mono text-slate-700 dark:text-slate-300"
          />
          <button
            onClick={handleCopyApiKey}
            className="w-full sm:w-auto justify-center px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center space-x-1.5 shadow-sm shrink-0"
          >
            {copiedKey ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copiedKey ? 'Tersalin' : 'Salin Token'}</span>
          </button>
        </div>
      </div>
      {/* Meta AI Verification & Initial Chat Trigger Modal */}
      <MetaAiVerifyModal
        isOpen={isMetaAiVerifyOpen}
        onClose={() => setIsMetaAiVerifyOpen(false)}
        sessionId={metaAiStatus.session_id}
        phoneNumber={metaAiStatus.phone_number}
        autoEnableOnSuccess={true}
        onOpenConnectTab={onOpenConnectTab}
        onVerified={(payload) => {
          setMetaAiStatus(prev => ({
            ...prev,
            connected: true,
            verified: true,
            phone_number: payload.phone_number || prev.phone_number,
            last_error: null
          }));
          if (payload.user) {
            onUpdateUser(payload.user);
          }
          setSuccessMsg('✓ Meta AI berhasil diverifikasi dan diaktifkan!');
          setTimeout(() => setSuccessMsg(''), 4000);
        }}
      />
    </div>
  );
};
