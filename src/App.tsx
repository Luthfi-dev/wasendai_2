import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { apiFetch } from './lib/csrfFetch';
import { lazyWithRetry } from './lib/lazyWithRetry';
import { DEFAULT_PUBLIC_LOGO_URL, resolveLogoUrl } from './lib/branding';
import {
  MessageSquare,
  Bot,
  Zap,
  Sliders,
  Users,
  ShieldCheck,
  Database,
  QrCode,
  Smartphone,
  LogOut,
  Home,
  CheckCircle2,
  Clock,
  Sparkles,
  RefreshCw,
  Sun,
  Moon,
  Cloud,
  Menu,
  X,
  CreditCard,
  User,
  Shield,
  Key,
  Send,
  Code,
  ShieldAlert,
  Mail,
  Store
} from 'lucide-react';

import {
  WhatsAppMessageLog,
  BotStats,
  EnvConfigMasked,
  UserAccount,
  SubscriptionPlan,
  WhatsAppSession,
  AppWhitelabelConfig,
  QrisConfig
} from './types/whatsapp';

import { Header } from './components/Header';
import { StatsCards } from './components/StatsCards';
import { MessageLogsTable } from './components/MessageLogsTable';

const AutoReplyRules = lazyWithRetry(() =>
  import('./components/AutoReplyRules').then(m => ({ default: m.AutoReplyRules }))
);
const AntiBanPanel = lazyWithRetry(() =>
  import('./components/AntiBanPanel').then(m => ({ default: m.AntiBanPanel }))
);
const UserManagementPanel = lazyWithRetry(() =>
  import('./components/UserManagementPanel').then(m => ({ default: m.UserManagementPanel }))
);
const ConfigPanel = lazyWithRetry(() =>
  import('./components/ConfigPanel').then(m => ({ default: m.ConfigPanel }))
);
const SqlSchemaViewer = lazyWithRetry(() =>
  import('./components/SqlSchemaViewer').then(m => ({ default: m.SqlSchemaViewer }))
);
const WhatsAppConnectPanel = lazyWithRetry(() =>
  import('./components/WhatsAppConnectPanel').then(m => ({ default: m.WhatsAppConnectPanel }))
);
const LandingPage = lazyWithRetry(() =>
  import('./components/LandingPage').then(m => ({ default: m.LandingPage }))
);
const AuthModal = lazyWithRetry(() =>
  import('./components/AuthModal').then(m => ({ default: m.AuthModal }))
);
const PaymentUpgradeModal = lazyWithRetry(() =>
  import('./components/PaymentUpgradeModal').then(m => ({ default: m.PaymentUpgradeModal }))
);
const ApiDocsPanel = lazyWithRetry(() =>
  import('./components/ApiDocsPanel').then(m => ({ default: m.ApiDocsPanel }))
);
const SuperadminMasterPanel = lazyWithRetry(() =>
  import('./components/SuperadminMasterPanel').then(m => ({ default: m.SuperadminMasterPanel }))
);
const SecurityPinModal = lazyWithRetry(() =>
  import('./components/SecurityPinModal').then(m => ({ default: m.SecurityPinModal }))
);
const BroadcastPanel = lazyWithRetry(() =>
  import('./components/BroadcastPanel').then(m => ({ default: m.BroadcastPanel }))
);
const ProfilePanel = lazyWithRetry(() =>
  import('./components/ProfilePanel').then(m => ({ default: m.ProfilePanel }))
);
const CatalogShopPanel = lazyWithRetry(() =>
  import('./components/CatalogShopPanel').then(m => ({ default: m.CatalogShopPanel }))
);

class ChunkErrorBoundary extends React.Component<
  { children: React.ReactNode; resetKey?: string },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; resetKey?: string }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidUpdate(prevProps: { resetKey?: string }) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-500/30 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 text-center shadow-sm">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
            Gagal memuat modul halaman.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
            Sesi modul diperbarui atau koneksi terputus sementara. Klik tombol di bawah untuk memuat ulang halaman.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => this.setState({ hasError: false })}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl"
            >
              Coba Lagi
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl"
            >
              Muat Ulang Halaman
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ChunkLoaderFallback({ label = 'Memuat modul...' }: { label?: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 text-center shadow-sm">
      <div className="w-7 h-7 rounded-full border-2 border-emerald-500/30 border-t-emerald-600 animate-spin" />
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

function normalizeUserClient(u: any, prev?: UserAccount | null): UserAccount {
  const emailVerified = Boolean(u?.email_verified === true || u?.email_verified === 1 || u?.email_verified === '1' || u?.email_verified === 'true');
  const isActive = Boolean(u?.is_active === true || u?.is_active === 1 || u?.is_active === '1' || u?.is_active === 'true');
  const waVerified = Boolean(u?.wa_verified === true || u?.wa_verified === 1 || u?.wa_verified === '1' || u?.wa_verified === 'true');
  const metaAiVerified = Boolean(
    u?.meta_ai_verified === true ||
    u?.meta_ai_verified === 1 ||
    u?.meta_ai_verified === '1' ||
    u?.meta_ai_verified === 'true'
  );
  return {
    ...prev,
    ...u,
    wa_verified: waVerified,
    email_verified: emailVerified,
    is_active: isActive,
    meta_ai_verified: metaAiVerified,
    meta_ai_verified_phones: Array.isArray(u?.meta_ai_verified_phones)
      ? u.meta_ai_verified_phones
      : (Array.isArray(prev?.meta_ai_verified_phones) ? prev.meta_ai_verified_phones : []),
    auto_reply_enabled:
      u?.role === 'admin'
        ? u?.auto_reply_enabled !== false
        : Boolean(u?.auto_reply_enabled === true),
    auto_reply_activated_at: u?.auto_reply_activated_at ?? prev?.auto_reply_activated_at ?? '',
    auto_reply_status: u?.auto_reply_status ?? prev?.auto_reply_status,
    ai_enabled:
      u?.role === 'admin'
        ? u?.ai_enabled !== false
        : Boolean(u?.ai_enabled === true),
    default_cs_reply_enabled:
      u?.role === 'admin'
        ? u?.default_cs_reply_enabled !== false
        : Boolean(u?.default_cs_reply_enabled === true),
    plan_status: u?.plan_status || (isActive ? 'active' : 'none')
  };
}

export function App() {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    try {
      const saved = localStorage.getItem('japriin_auth_user');
      return saved ? normalizeUserClient(JSON.parse(saved)) : null;
    } catch {
      return null;
    }
  });
  const [currentRole, setCurrentRole] = useState<'admin' | 'user'>(() => {
    try {
      const saved = localStorage.getItem('japriin_auth_user');
      if (saved) {
        const u = JSON.parse(saved);
        return u.role === 'admin' ? 'admin' : 'user';
      }
    } catch {}
    return 'user';
  });
  const [viewMode, setViewMode] = useState<'landing' | 'app'>(() => {
    try {
      const saved = localStorage.getItem('japriin_auth_user');
      return saved ? 'app' : 'landing';
    } catch {
      return 'landing';
    }
  });
  const [actionToast, setActionToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showActionToast = useCallback((type: 'success' | 'error', text: string) => {
    setActionToast({ type, text });
    setTimeout(() => setActionToast(null), 4500);
  }, []);

  const authEpochRef = useRef<number>(0);

  // Re-sync persistent session with server via HttpOnly session cookie
  useEffect(() => {
    const mountEpoch = authEpochRef.current;

    apiFetch('/api/auth/me')
      .then(async r => {
        if (mountEpoch !== authEpochRef.current) return null;
        if (r.status === 401) {
          localStorage.removeItem('japriin_auth_user');
          setCurrentUser(null);
          setCurrentRole('user');
          setViewMode('landing');
          return null;
        }
        return r.json();
      })
      .then(res => {
        if (mountEpoch !== authEpochRef.current) return;
        if (res && res.success && res.authenticated && res.user) {
          const normalized = normalizeUserClient(res.user);
          setCurrentUser(normalized);
          setCurrentRole(normalized.role === 'admin' ? 'admin' : 'user');
          localStorage.setItem('japriin_auth_user', JSON.stringify(normalized));
        }
      })
      .catch(() => {});
  }, []);

  // Navigation State
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isMobileMoreOpen, setIsMobileMoreOpen] = useState<boolean>(false);

  // Pending Email Verification States for logged-in sessions
  const [waPendingOtp, setWaPendingOtp] = useState('');
  const [pendingVerifyMethod, setPendingVerifyMethod] = useState<'whatsapp' | 'email'>('email');
  const [isVerifyingWaPending, setIsVerifyingWaPending] = useState(false);
  const [waPendingError, setWaPendingError] = useState('');
  const [waPendingSuccess, setWaPendingSuccess] = useState('');
  const [isResendingWaPending, setIsResendingWaPending] = useState(false);
  const [waPendingCooldown, setWaPendingCooldown] = useState<number>(0);

  // Timer hitungan mundur 30 detik untuk kirim ulang OTP WhatsApp pending
  useEffect(() => {
    if (waPendingCooldown <= 0) return;
    const timer = setInterval(() => {
      setWaPendingCooldown(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [waPendingCooldown]);

  // Security PIN Modal State
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);

  // Dark/Light Theme state
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('japriin_theme') === 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    const themeMeta = document.getElementById('theme-color-meta');
    if (isDarkMode) {
      root.classList.add('dark');
      localStorage.setItem('japriin_theme', 'dark');
      if (themeMeta) themeMeta.setAttribute('content', '#0f172a');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('japriin_theme', 'light');
      if (themeMeta) themeMeta.setAttribute('content', '#ffffff');
    }
  }, [isDarkMode]);

  const handleToggleTheme = () => {
    setIsDarkMode(prev => !prev);
  };

  // Auth Modal State
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const [selectedPlanId, setSelectedPlanId] = useState<string>('free');

  // Upgrade / QRIS Payment Modal State
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const [targetPaidPlan, setTargetPaidPlan] = useState<SubscriptionPlan | null>(null);

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [whitelabel, setWhitelabel] = useState<AppWhitelabelConfig>({
    app_name: 'Japriin',
    tagline: 'Whitelabel WhatsApp Gateway, Interactive REST API & Remote AI Bot',
    logo_url: DEFAULT_PUBLIC_LOGO_URL,
    company_name: 'Maudigi Teknologi Indonesia',
    support_phone: '081234567890',
    primary_bot_phone: '085761010112',
    primary_bot_name: 'Japriin Assistant Pusat',
    footer_text: 'Dikelola secara profesional oleh maudigi.com',
    api_enabled: true
  });
  const [qrisConfig, setQrisConfig] = useState<QrisConfig | null>(null);
  const [logs, setLogs] = useState<WhatsAppMessageLog[]>([]);
  const [sessions, setSessions] = useState<WhatsAppSession[]>([]);
  const [stats, setStats] = useState<BotStats | null>(null);
  const [config, setConfig] = useState<EnvConfigMasked | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Dynamically sync browser document title & favicon with whitelabel config
  useEffect(() => {
    if (whitelabel?.app_name) {
      document.title = `${whitelabel.app_name}${whitelabel.tagline ? ` — ${whitelabel.tagline}` : ''}`;
    }
    const resolvedIcon = resolveLogoUrl(whitelabel?.logo_url);
    document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="apple-touch-icon"]').forEach(link => {
      link.href = resolvedIcon;
    });
  }, [whitelabel]);

  // Listen to immediate Superadmin updates
  useEffect(() => {
    const onWlUpdate = (e: Event) => {
      const custom = e as CustomEvent<AppWhitelabelConfig>;
      if (custom.detail) setWhitelabel(custom.detail);
    };
    const onPlansUpdate = (e: Event) => {
      const custom = e as CustomEvent<SubscriptionPlan[]>;
      if (custom.detail) setPlans(custom.detail);
    };
    const onQrisUpdate = (e: Event) => {
      const custom = e as CustomEvent<QrisConfig>;
      if (custom.detail) setQrisConfig(custom.detail);
    };
    window.addEventListener('whitelabel-updated', onWlUpdate);
    window.addEventListener('plans-updated', onPlansUpdate);
    window.addEventListener('qris-updated', onQrisUpdate);
    return () => {
      window.removeEventListener('whitelabel-updated', onWlUpdate);
      window.removeEventListener('plans-updated', onPlansUpdate);
      window.removeEventListener('qris-updated', onQrisUpdate);
    };
  }, []);

  // Helper for resilient JSON fetching without crashing Promise.all on temporary network glitches
  const safeFetchJson = async (url: string, fallback: any = { success: false, data: [] }) => {
    try {
      const res = await apiFetch(url);
      if (!res.ok) return fallback;
      return await res.json();
    } catch {
      return fallback;
    }
  };

  // Fetch plans, whitelabel & qris on mount
  useEffect(() => {
    safeFetchJson('/api/plans', { success: true, data: [] })
      .then(res => {
        if (res.success && res.data) setPlans(res.data);
      });
    safeFetchJson('/api/whitelabel', { success: false, data: null })
      .then(res => {
        if (res.success && res.data) setWhitelabel(res.data);
      });
    safeFetchJson('/api/qris', { success: false, data: null })
      .then(res => {
        if (res.success && res.data) setQrisConfig(res.data);
      });
  }, []);

  const currentUserId = currentUser?.id;
  const currentUserRole = currentUser?.role;

  // Fetch all initial dashboard data (only when authenticated)
  const fetchData = useCallback(async (showLoading = false) => {
    if (!currentUserId) {
      setLogs([]);
      setSessions([]);
      setStats(null);
      setConfig(null);
      setIsLoading(false);
      return;
    }

    if (showLoading) setIsLoading(true);
    const fetchEpoch = authEpochRef.current;
    try {
      const uId = currentUserId;
      const [msgRes, statsRes, configRes, meRes, sessionsRes, wlRes, plansRes, qrisRes] = await Promise.all([
        safeFetchJson(`/api/messages?userId=${encodeURIComponent(uId)}`, { success: true, data: [] }),
        safeFetchJson(`/api/stats?userId=${encodeURIComponent(uId)}`, { success: true, data: null }),
        currentUserRole === 'admin' ? safeFetchJson('/api/config', { success: true, data: null }) : Promise.resolve({ success: false, data: null }),
        safeFetchJson('/api/auth/me', { success: false, authenticated: false, user: null }),
        safeFetchJson(`/api/sessions?userId=${encodeURIComponent(uId)}`, { success: true, data: [] }),
        safeFetchJson('/api/whitelabel', { success: false, data: null }),
        safeFetchJson('/api/plans', { success: false, data: null }),
        safeFetchJson('/api/qris', { success: false, data: null })
      ]);

      if (fetchEpoch !== authEpochRef.current) return;

      if (msgRes.success) setLogs(msgRes.data || []);
      if (statsRes.success) {
        setStats(statsRes.data || null);
      }
      if (configRes.success) setConfig(configRes.data || null);
      if (sessionsRes.success) setSessions(sessionsRes.data || []);
      if (wlRes.success && wlRes.data) setWhitelabel(wlRes.data);
      if (plansRes.success && Array.isArray(plansRes.data)) setPlans(plansRes.data);
      if (qrisRes.success && qrisRes.data) setQrisConfig(qrisRes.data);

      if (meRes.success && meRes.authenticated && meRes.user) {
        setCurrentUser(prev => {
          const normalized = normalizeUserClient(meRes.user, prev);
          if (!prev || JSON.stringify(prev) !== JSON.stringify(normalized)) {
            localStorage.setItem('japriin_auth_user', JSON.stringify(normalized));
            return normalized;
          }
          return prev;
        });
        setCurrentRole(meRes.user.role === 'admin' ? 'admin' : 'user');
      }
    } catch (err) {
      console.warn('Dashboard fetch warning (will retry automatically):', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentUserId, currentUserRole]);

  useEffect(() => {
    fetchData(true);
    if (!currentUserId) return;

    let pollTick = 0;
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      pollTick += 1;
      const uId = currentUserId;
      const pollEpoch = authEpochRef.current;

      safeFetchJson(`/api/messages?userId=${encodeURIComponent(uId)}`, { success: false })
        .then(res => {
          if (pollEpoch === authEpochRef.current && res.success) {
            const nextLogs = res.data || [];
            setLogs(prev => {
              if (
                prev.length === nextLogs.length &&
                prev[0]?.id === nextLogs[0]?.id &&
                prev[0]?.status === nextLogs[0]?.status &&
                prev[0]?.reply_body === nextLogs[0]?.reply_body
              ) {
                return prev;
              }
              return nextLogs;
            });
          }
        });

      safeFetchJson(`/api/stats?userId=${encodeURIComponent(uId)}`, { success: false })
        .then(res => {
          if (pollEpoch === authEpochRef.current && res.success) {
            const nextStats = res.data || null;
            setStats(prev => (JSON.stringify(prev) === JSON.stringify(nextStats) ? prev : nextStats));
          }
        });

      // Poll whitelabel, sessions & auth status every 3rd tick (60s) to cut server load
      if (pollTick % 3 === 0) {
        safeFetchJson(`/api/sessions?userId=${encodeURIComponent(uId)}`, { success: false })
          .then(res => {
            if (pollEpoch === authEpochRef.current && res.success && Array.isArray(res.data)) {
              setSessions(prev => (JSON.stringify(prev) === JSON.stringify(res.data) ? prev : res.data));
            }
          });

        safeFetchJson('/api/whitelabel', { success: false })
          .then(res => {
            if (pollEpoch === authEpochRef.current && res.success && res.data) {
              setWhitelabel(prev => (JSON.stringify(prev) === JSON.stringify(res.data) ? prev : res.data));
            }
          });

        apiFetch('/api/auth/me')
          .then(async r => {
            if (pollEpoch !== authEpochRef.current) return null;
            if (r.status === 401) {
              localStorage.removeItem('japriin_auth_user');
              setCurrentUser(null);
              setCurrentRole('user');
              setViewMode('landing');
              return null;
            }
            return r.json();
          })
          .then(res => {
            if (pollEpoch !== authEpochRef.current) return;
            if (res && res.success && res.authenticated && res.user) {
              setCurrentUser(prev => {
                const normalized = normalizeUserClient(res.user, prev);
                if (!prev || JSON.stringify(normalized) !== JSON.stringify(prev)) {
                  localStorage.setItem('japriin_auth_user', JSON.stringify(normalized));
                  return normalized;
                }
                return prev;
              });
              setCurrentRole(res.user.role === 'admin' ? 'admin' : 'user');
            }
          })
          .catch(() => {});
      }
    }, 20000);

    return () => clearInterval(interval);
  }, [fetchData, currentUserId]);

  const handleOpenAuthModal = (mode: 'login' | 'register', defaultPlanId: string = 'free') => {
    setAuthMode(mode);
    setSelectedPlanId(defaultPlanId);
    setIsAuthOpen(true);
  };

  const handleLoginSuccess = (user: UserAccount) => {
    authEpochRef.current += 1;
    const normalized = normalizeUserClient(user);
    setCurrentUser(normalized);
    setCurrentRole(normalized.role === 'admin' ? 'admin' : 'user');
    setViewMode('app');
    setIsAuthOpen(false);
    localStorage.setItem('japriin_auth_user', JSON.stringify(normalized));
  };

  const handleLogout = async () => {
    authEpochRef.current += 1;
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network errors during logout cleanup
    }
    setCurrentUser(null);
    setCurrentRole('user');
    setLogs([]);
    setSessions([]);
    setStats(null);
    setConfig(null);
    setViewMode('landing');
    localStorage.removeItem('japriin_auth_user');
  };

  // Clear Message Logs
  const handleClearLogs = async () => {
    try {
      const res = await apiFetch('/api/messages', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setLogs([]);
        fetchData();
      }
    } catch (err) {
      console.error('Failed to clear logs:', err);
    }
  };

  const handleSelectPaidPlan = (plan: SubscriptionPlan) => {
    setTargetPaidPlan(plan);
    setIsUpgradeOpen(true);
  };

  const handleVerifyPendingWa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !waPendingOtp.trim()) return;
    setIsVerifyingWaPending(true);
    setWaPendingError('');
    setWaPendingSuccess('');
    try {
      const res = await apiFetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.id,
          otp: waPendingOtp.trim(),
          type: pendingVerifyMethod
        })
      });
      const data = await res.json();
      if (data.success && data.user) {
        const normalized = normalizeUserClient(data.user, currentUser);
        setWaPendingSuccess(`✓ Verifikasi ${pendingVerifyMethod === 'whatsapp' ? 'WhatsApp' : 'Email'} berhasil! Akun Anda aktif.`);
        setCurrentUser(normalized);
        setCurrentRole(normalized.role);
        localStorage.setItem('japriin_auth_user', JSON.stringify(normalized));
        setWaPendingOtp('');
        fetchData();
      } else {
        setWaPendingError(data.error || 'Kode OTP tidak cocok atau sudah kadaluarsa.');
      }
    } catch {
      setWaPendingError('Gagal memverifikasi OTP. Periksa jaringan Anda.');
    } finally {
      setIsVerifyingWaPending(false);
    }
  };

  const handleResendPendingWa = async (methodOverride?: 'whatsapp' | 'email') => {
    const targetMethod = methodOverride || pendingVerifyMethod;
    if (!currentUser || ( !methodOverride && waPendingCooldown > 0 ) || isResendingWaPending) return;
    setIsResendingWaPending(true);
    setWaPendingError('');
    setWaPendingSuccess('');

    try {
      const res = await apiFetch('/api/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.id,
          method: targetMethod
        })
      });
      const data = await res.json().catch(() => null);
      if (data && data.success) {
        setWaPendingSuccess(data.message || `Kode OTP baru berhasil dikirim ke ${targetMethod === 'email' ? 'Email' : 'WhatsApp'} Anda.`);
        setWaPendingCooldown(data.cooldown_seconds || 30);
      } else if (data && data.cooldown_seconds) {
        setWaPendingCooldown(data.cooldown_seconds);
        setWaPendingError(data.error);
      } else {
        setWaPendingError(data?.error || 'Gagal mengirim ulang OTP.');
      }
    } catch {
      setWaPendingError('Gagal menghubungi server.');
    } finally {
      setIsResendingWaPending(false);
    }
  };

  const handleUpgradeSuccess = (user: UserAccount) => {
    setCurrentUser(user);
    setCurrentRole(user.role);
    setViewMode('app');
    setIsUpgradeOpen(false);
    fetchData();
  };

  // RENDER LANDING PAGE IF IN LANDING VIEW MODE
  if (viewMode === 'landing') {
    return (
      <div className="min-h-screen max-w-full overflow-x-hidden bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-200">
        <ChunkErrorBoundary resetKey={viewMode}>
        <Suspense
          fallback={
            <div className="min-h-screen flex items-center justify-center p-6">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-emerald-500/30 border-t-emerald-600 animate-spin" />
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Memuat halaman...</span>
              </div>
            </div>
          }
        >
          <LandingPage
            plans={plans}
            onLoginSuccess={handleLoginSuccess}
            onOpenAuthModal={handleOpenAuthModal}
            onSelectPaidPlan={handleSelectPaidPlan}
            isDarkMode={isDarkMode}
            onToggleTheme={handleToggleTheme}
            whitelabel={whitelabel}
          />
        </Suspense>
        </ChunkErrorBoundary>
        {isAuthOpen && (
          <Suspense fallback={null}>
            <AuthModal
              isOpen={isAuthOpen}
              mode={authMode}
              defaultPlanId={selectedPlanId}
              plans={plans}
              onClose={() => setIsAuthOpen(false)}
              onLoginSuccess={handleLoginSuccess}
              onSwitchMode={(m) => setAuthMode(m)}
              whitelabel={whitelabel}
            />
          </Suspense>
        )}
        {isUpgradeOpen && (
          <Suspense fallback={null}>
            <PaymentUpgradeModal
              isOpen={isUpgradeOpen}
              selectedPlan={targetPaidPlan}
              plan={targetPaidPlan}
              currentUser={currentUser}
              onClose={() => setIsUpgradeOpen(false)}
              onSuccess={handleUpgradeSuccess}
              onRequireLogin={() => {
                setIsUpgradeOpen(false);
                handleOpenAuthModal('login', targetPaidPlan?.id || 'pro');
              }}
            />
          </Suspense>
        )}
      </div>
    );
  }

  // RENDER APP DASHBOARD
  return (
    <div className="min-h-screen max-w-full overflow-x-hidden bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans selection:bg-emerald-500 selection:text-white pb-24 md:pb-12 transition-colors duration-200">
      {/* Top Navigation Header */}
      <Header
        stats={stats}
        onRefresh={fetchData}
        isLoading={isLoading}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentRole={currentRole}
        setCurrentRole={setCurrentRole}
        isDarkMode={isDarkMode}
        onToggleTheme={handleToggleTheme}
        onGoHome={() => setViewMode('landing')}
        onLogout={handleLogout}
        currentUserName={currentUser?.name}
        onOpenPinModal={() => setIsPinModalOpen(true)}
        onOpenUpgrade={() => {
          const proPlan = plans.find(p => p.id === 'pro') || plans[plans.length - 1] || null;
          setTargetPaidPlan(proPlan);
          setIsUpgradeOpen(true);
        }}
        planLabel={currentUser?.role === 'admin' ? 'Admin' : `Paket ${(currentUser?.plan_id || 'PRO').toUpperCase()}`}
        whitelabel={whitelabel}
      />

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pb-24 lg:pb-8">
        {actionToast && (
          <div className={`mb-4 p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between gap-2 ${
            actionToast.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
              : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
          }`}>
            <span>{actionToast.text}</span>
            <button onClick={() => setActionToast(null)} className="text-[11px] underline opacity-75">Tutup</button>
          </div>
        )}
        {/* CHECK IF USER IS UNVERIFIED (Email is not verified yet) */}
        {currentUser && currentUser.role !== 'admin' && !currentUser.is_active && !currentUser.email_verified ? (
          <div className="bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-500/40 rounded-3xl p-6 sm:p-8 max-w-xl mx-auto text-center shadow-xl space-y-5 my-6">
            <div className="w-16 h-16 rounded-3xl bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30 mx-auto flex items-center justify-center">
              <Mail className="w-8 h-8" />
            </div>

            <div className="space-y-1.5">
              <span className="px-3 py-1 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30 rounded-full text-[11px] font-black uppercase">
                Verifikasi Email Diperlukan
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                Verifikasi Kode OTP Email Anda
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 max-w-md mx-auto leading-relaxed">
                Halo <strong>{currentUser.name}</strong> (@{currentUser.username}), silakan masukkan 6 digit kode OTP yang dikirim ke alamat email <strong>{currentUser.email || '-'}</strong> agar akun Anda langsung aktif dan dapat menggunakan seluruh fitur Dashboard.
              </p>
            </div>

            {waPendingError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-400 rounded-xl text-xs flex items-center space-x-2 text-left">
                <span>{waPendingError}</span>
              </div>
            )}

            {waPendingSuccess && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300 rounded-xl text-xs flex items-center space-x-2 text-left">
                <span>{waPendingSuccess}</span>
              </div>
            )}

            <form onSubmit={handleVerifyPendingWa} className="space-y-4">
              <div>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={waPendingOtp}
                  onChange={e => setWaPendingOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••••"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-center text-lg font-mono font-bold tracking-widest text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isVerifyingWaPending || waPendingOtp.length < 4}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl shadow-md transition-all disabled:opacity-50 min-h-[44px]"
              >
                {isVerifyingWaPending ? 'Memverifikasi...' : 'Verifikasi OTP Email & Aktifkan Akun'}
              </button>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => handleResendPendingWa('email')}
                  disabled={isResendingWaPending || waPendingCooldown > 0}
                  className={`py-2.5 px-4 font-bold text-xs rounded-xl border transition-all ${
                    waPendingCooldown > 0
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed border-slate-200 dark:border-slate-700'
                      : 'bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
                  }`}
                >
                  {waPendingCooldown > 0
                    ? `Kirim Ulang (${waPendingCooldown}s)`
                    : isResendingWaPending
                    ? 'Mengirim...'
                    : 'Kirim Ulang OTP ke Email'}
                </button>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="py-2.5 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs rounded-xl transition-colors"
                >
                  Keluar Akun
                </button>
              </div>
            </form>
          </div>
        ) : currentUser && currentUser.role !== 'admin' && currentUser.plan_status === 'pending_approval' && currentUser.plan_id !== 'free' ? (
          <div className="bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-500/40 rounded-3xl p-6 sm:p-8 max-w-2xl mx-auto text-center shadow-xl space-y-5 my-6">
            <div className="w-16 h-16 rounded-3xl bg-amber-50 dark:bg-amber-500/20 text-amber-500 border border-amber-300 dark:border-amber-500/30 mx-auto flex items-center justify-center animate-pulse">
              <Clock className="w-8 h-8" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">Pendaftaran Anda Menunggu Konfirmasi</h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 max-w-md mx-auto leading-relaxed">
                Halo <strong>{currentUser.name}</strong>, pendaftaran paket <strong>{currentUser.plan_id.toUpperCase()}</strong> Anda berhasil dicatat. Admin kami akan segera mengaktifkan akun Anda.
              </p>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-left text-xs space-y-2 text-slate-700 dark:text-slate-300">
              <div className="flex justify-between font-bold text-amber-600 dark:text-amber-400 pb-2 border-b border-slate-200 dark:border-slate-800">
                <span>Rincian Pembayaran:</span>
                <span>{qrisConfig ? `${qrisConfig.bank_name} ${qrisConfig.account_number} a.n ${qrisConfig.account_name}` : `Transfer Resmi a.n ${whitelabel.company_name || whitelabel.app_name}`}</span>
              </div>
              <p>Catatan Transfer Anda: <code className="text-emerald-600 dark:text-emerald-400 font-mono font-bold">{currentUser.payment_note || 'Sudah Transfer'}</code></p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row justify-center gap-3">
              <a
                href={`https://wa.me/${(whitelabel.support_phone || whitelabel.primary_bot_phone || '6281234567890').replace(/\D/g, '').replace(/^0/, '62')}?text=Halo%20Admin,%20saya%20sudah%20mendaftar%20username:%20${currentUser.username},%20mohon%20diaktifkan.`}
                target="_blank"
                rel="noreferrer"
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center space-x-2"
              >
                <Smartphone className="w-4 h-4" />
                <span>Konfirmasi via WhatsApp CS</span>
              </a>
            </div>
          </div>
        ) : (
          <ChunkErrorBoundary resetKey={activeTab}>
          <Suspense fallback={<ChunkLoaderFallback />}>
            {/* TAB 0: WHATSAPP CONNECT & BARCODE / PAIRING */}
            {activeTab === 'connect' && (
              <div>
                <WhatsAppConnectPanel
                  currentUser={currentUser}
                  initialSessions={sessions}
                  onSessionChange={fetchData}
                  onUpdateUser={(updated) => {
                    const normalized = normalizeUserClient(updated, currentUser);
                    setCurrentUser(normalized);
                    localStorage.setItem('japriin_auth_user', JSON.stringify(normalized));
                  }}
                />
              </div>
            )}

            {/* TAB 1: DASHBOARD & MESSAGE LOGS */}
            {activeTab === 'dashboard' && (
              <div className="space-y-6">
                <StatsCards stats={stats} isAdmin={currentRole === 'admin'} currentUser={currentUser} />
                <MessageLogsTable
                  logs={logs}
                  onClearLogs={handleClearLogs}
                  onRefresh={fetchData}
                  isLoading={isLoading}
                />
              </div>
            )}

            {/* TAB 2: AUTO REPLY RULES */}
            {activeTab === 'rules' && (
              <div>
                <AutoReplyRules
                  currentUser={currentUser}
                  onUpdateUser={(updated) => {
                    const normalized = normalizeUserClient(updated, currentUser);
                    setCurrentUser(normalized);
                    localStorage.setItem('japriin_auth_user', JSON.stringify(normalized));
                  }}
                  onOpenCatalog={() => setActiveTab('catalog')}
                  onOpenConnectTab={() => setActiveTab('connect')}
                  onOpenUpgrade={() => {
                    const proPlan = plans.find(p => p.id === 'pro') || plans[plans.length - 1] || null;
                    setTargetPaidPlan(proPlan);
                    setIsUpgradeOpen(true);
                  }}
                />
              </div>
            )}

            {/* TAB: MINI SHOP / KATALOG PRODUK */}
            {activeTab === 'catalog' && (
              <div>
                <CatalogShopPanel currentUser={currentUser} onNavigateTab={setActiveTab} />
              </div>
            )}

            {/* TAB: BROADCAST & SCHEDULED MESSAGES */}
            {activeTab === 'broadcast' && (
              <div>
                <BroadcastPanel currentUser={currentUser} sessions={sessions} stats={stats} />
              </div>
            )}

            {/* TAB: PROFILE & ACCOUNT */}
            {activeTab === 'profile' && (
              <div>
                <ProfilePanel
                  currentUser={currentUser}
                  plans={plans}
                  onOpenPinModal={() => setIsPinModalOpen(true)}
                  onOpenUpgradeModal={(plan) => {
                    setTargetPaidPlan(plan);
                    setIsUpgradeOpen(true);
                  }}
                  onUpdateUser={(updated) => {
                    const normalized = normalizeUserClient(updated, currentUser);
                    setCurrentUser(normalized);
                    localStorage.setItem('japriin_auth_user', JSON.stringify(normalized));
                  }}
                  onOpenConnectTab={() => setActiveTab('connect')}
                />
              </div>
            )}

            {/* TAB: INTERACTIVE DEVELOPER REST API v1 */}
            {activeTab === 'apidocs' && (
              <div>
                <ApiDocsPanel currentUser={currentUser} />
              </div>
            )}

            {/* TAB: SUPERADMIN MASTER PANEL (MASTER PIN PROTECTED) */}
            {activeTab === 'master' && currentRole === 'admin' && (
              <div>
                <SuperadminMasterPanel
                  onWhitelabelUpdated={(updatedWl) => {
                    setWhitelabel(updatedWl);
                    fetchData();
                  }}
                  onPlansUpdated={(updatedPlans) => {
                    setPlans(updatedPlans);
                    fetchData();
                  }}
                  onQrisUpdated={(updatedQris) => {
                    setQrisConfig(updatedQris);
                    fetchData();
                  }}
                />
              </div>
            )}

            {/* TAB 3: ANTI-BAN ENGINE (ADMIN ONLY) */}
            {activeTab === 'antiban' && currentRole === 'admin' && (
              <div>
                <AntiBanPanel />
              </div>
            )}

            {/* TAB 4: USER MANAGEMENT (ADMIN ONLY) */}
            {activeTab === 'users' && currentRole === 'admin' && (
              <div>
                <UserManagementPanel />
              </div>
            )}

            {/* TAB 5: CREDENTIALS & CONFIG (ADMIN ONLY) */}
            {activeTab === 'config' && currentRole === 'admin' && (
              <div>
                <ConfigPanel config={config} />
              </div>
            )}

            {/* TAB 6: DATABASE CLOUD & MIGRATION (ADMIN ONLY) */}
            {activeTab === 'sql' && currentRole === 'admin' && (
              <div>
                <SqlSchemaViewer />
              </div>
            )}
          </Suspense>
          </ChunkErrorBoundary>
        )}
      </main>

      {/* MOBILE NATIVE BOTTOM NAVIGATION BAR */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-slate-900/95 border-t border-slate-200/80 dark:border-slate-800 backdrop-blur-xl z-40 lg:hidden pb-safe">
        <div className="grid grid-cols-5 items-center h-[60px]">
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className={`flex flex-col items-center justify-center min-h-[48px] transition-colors ${
              activeTab === 'dashboard'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Zap className="w-5 h-5" />
            <span className="text-[10px] font-semibold tracking-tight mt-1 whitespace-nowrap">Beranda</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('connect')}
            className={`flex flex-col items-center justify-center min-h-[48px] transition-colors ${
              activeTab === 'connect'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <QrCode className="w-5 h-5" />
            <span className="text-[10px] font-semibold tracking-tight mt-1 whitespace-nowrap">Koneksi</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('broadcast')}
            className={`flex flex-col items-center justify-center min-h-[48px] transition-colors ${
              activeTab === 'broadcast'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Send className="w-5 h-5" />
            <span className="text-[10px] font-semibold tracking-tight mt-1 whitespace-nowrap">Broadcast</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('rules')}
            className={`flex flex-col items-center justify-center min-h-[48px] transition-colors ${
              activeTab === 'rules'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Bot className="w-5 h-5" />
            <span className="text-[10px] font-semibold tracking-tight mt-1 whitespace-nowrap">Balasan</span>
          </button>

          <button
            type="button"
            onClick={() => setIsMobileMoreOpen(true)}
            className={`flex flex-col items-center justify-center min-h-[48px] transition-colors ${
              ['catalog', 'profile', 'apidocs', 'master', 'antiban', 'users', 'config', 'sql'].includes(activeTab)
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Menu className="w-5 h-5" />
            <span className="text-[10px] font-semibold tracking-tight mt-1 whitespace-nowrap">Menu</span>
          </button>
        </div>
      </nav>

      {/* MOBILE BOTTOM ACTION SHEET */}
      {isMobileMoreOpen && (
        <div
          onClick={() => setIsMobileMoreOpen(false)}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl px-5 pt-3 pb-6 pb-safe border-t sm:border border-slate-200 dark:border-slate-800 space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto"
          >
            <div className="w-10 h-1 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto sm:hidden" />

            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-full bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold text-sm shrink-0">
                  {currentUser?.name?.charAt(0)?.toUpperCase() || 'U'}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {currentUser?.name || 'Pengguna'}
                  </h3>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate">
                    {currentRole === 'admin' ? 'Administrator' : `Paket ${(currentUser?.plan_id || 'PRO').toUpperCase()}`}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileMoreOpen(false)}
                className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full bg-slate-100 dark:bg-slate-800"
                aria-label="Tutup Menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {currentRole !== 'admin' && (
              <button
                type="button"
                onClick={() => {
                  const proPlan = plans.find(p => p.id === 'pro') || plans[plans.length - 1] || null;
                  setTargetPaidPlan(proPlan);
                  setIsUpgradeOpen(true);
                  setIsMobileMoreOpen(false);
                }}
                className="w-full min-h-[44px] px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-bold flex items-center justify-between transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-200" />
                  <span>Tingkatkan Paket</span>
                </span>
                <span className="text-[11px] opacity-90">Buka →</span>
              </button>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('catalog');
                  setIsMobileMoreOpen(false);
                }}
                className={`p-3 rounded-2xl border text-left text-xs font-semibold transition-colors flex items-center gap-2.5 min-h-[48px] ${
                  activeTab === 'catalog'
                    ? 'bg-emerald-600 text-white border-emerald-500'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <Store className={`w-4 h-4 shrink-0 ${activeTab === 'catalog' ? 'text-white' : 'text-emerald-600'}`} />
                <span className="truncate">Katalog Toko</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('profile');
                  setIsMobileMoreOpen(false);
                }}
                className={`p-3 rounded-2xl border text-left text-xs font-semibold transition-colors flex items-center gap-2.5 min-h-[48px] ${
                  activeTab === 'profile'
                    ? 'bg-emerald-600 text-white border-emerald-500'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <User className={`w-4 h-4 shrink-0 ${activeTab === 'profile' ? 'text-white' : 'text-emerald-600'}`} />
                <span className="truncate">Profil Akun</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('apidocs');
                  setIsMobileMoreOpen(false);
                }}
                className={`p-3 rounded-2xl border text-left text-xs font-semibold transition-colors flex items-center gap-2.5 min-h-[48px] ${
                  activeTab === 'apidocs'
                    ? 'bg-emerald-600 text-white border-emerald-500'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <Code className={`w-4 h-4 shrink-0 ${activeTab === 'apidocs' ? 'text-white' : 'text-emerald-600'}`} />
                <span className="truncate">REST API v1</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsPinModalOpen(true);
                  setIsMobileMoreOpen(false);
                }}
                className="p-3 rounded-2xl border text-left text-xs font-semibold transition-colors flex items-center gap-2.5 min-h-[48px] bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300"
              >
                <Key className="w-4 h-4 shrink-0 text-amber-500" />
                <span className="truncate">PIN Bot</span>
              </button>

              {currentRole === 'admin' && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('master');
                      setIsMobileMoreOpen(false);
                    }}
                    className={`p-3 rounded-2xl border text-left text-xs font-semibold transition-colors flex items-center gap-2.5 min-h-[48px] ${
                      activeTab === 'master'
                        ? 'bg-purple-600 text-white border-purple-500'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <ShieldAlert className={`w-4 h-4 shrink-0 ${activeTab === 'master' ? 'text-white' : 'text-amber-500'}`} />
                    <span className="truncate">Master Panel</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('antiban');
                      setIsMobileMoreOpen(false);
                    }}
                    className={`p-3 rounded-2xl border text-left text-xs font-semibold transition-colors flex items-center gap-2.5 min-h-[48px] ${
                      activeTab === 'antiban'
                        ? 'bg-purple-600 text-white border-purple-500'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Sliders className={`w-4 h-4 shrink-0 ${activeTab === 'antiban' ? 'text-white' : 'text-emerald-600'}`} />
                    <span className="truncate">Anti-Ban</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('users');
                      setIsMobileMoreOpen(false);
                    }}
                    className={`p-3 rounded-2xl border text-left text-xs font-semibold transition-colors flex items-center gap-2.5 min-h-[48px] ${
                      activeTab === 'users'
                        ? 'bg-purple-600 text-white border-purple-500'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Users className={`w-4 h-4 shrink-0 ${activeTab === 'users' ? 'text-white' : 'text-teal-500'}`} />
                    <span className="truncate">Pengguna</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('config');
                      setIsMobileMoreOpen(false);
                    }}
                    className={`p-3 rounded-2xl border text-left text-xs font-semibold transition-colors flex items-center gap-2.5 min-h-[48px] ${
                      activeTab === 'config'
                        ? 'bg-purple-600 text-white border-purple-500'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <ShieldCheck className={`w-4 h-4 shrink-0 ${activeTab === 'config' ? 'text-white' : 'text-amber-500'}`} />
                    <span className="truncate">Kredensial</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('sql');
                      setIsMobileMoreOpen(false);
                    }}
                    className={`p-3 rounded-2xl border text-left text-xs font-semibold transition-colors flex items-center gap-2.5 min-h-[48px] ${
                      activeTab === 'sql'
                        ? 'bg-teal-600 text-white border-teal-500'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Cloud className={`w-4 h-4 shrink-0 ${activeTab === 'sql' ? 'text-white' : 'text-teal-500'}`} />
                    <span className="truncate">Database</span>
                  </button>
                </>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setViewMode('landing');
                  setIsMobileMoreOpen(false);
                }}
                className="min-h-[44px] px-3 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Home className="w-4 h-4 text-emerald-600" />
                <span>Halaman Depan</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  handleLogout();
                  setIsMobileMoreOpen(false);
                }}
                className="min-h-[44px] px-3 text-xs font-semibold text-rose-600 flex items-center gap-1.5 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/30"
              >
                <LogOut className="w-4 h-4" />
                <span>Keluar Akun</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Whitelabel Footer (Desktop Only) */}
      <footer className="hidden md:block border-t border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 py-5 text-center text-xs text-slate-500 dark:text-slate-400 transition-colors">
        <div className="max-w-7xl mx-auto px-6 flex justify-between items-center gap-3">
          <div className="flex items-center gap-x-2">
            <span className="font-bold text-slate-800 dark:text-slate-200">
              {whitelabel.app_name || 'Japriin'}
            </span>
            {whitelabel.company_name && (
              <>
                <span className="text-slate-300 dark:text-slate-600">•</span>
                <span>{whitelabel.company_name}</span>
              </>
            )}
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
              {whitelabel.footer_text || 'Dikelola secara profesional'}
            </span>
          </div>

          <div className="flex items-center gap-3 text-[11px]">
            {currentRole === 'admin' ? (
              <span>Penyimpanan: <strong className="text-emerald-600 dark:text-emerald-400 font-semibold">{stats?.db_status === 'online' ? 'Cloud DB Online' : 'Lokal Aktif'}</strong></span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                Otomasi Aktif
              </span>
            )}
            <span>•</span>
            <span>Tanpa Watermark</span>
          </div>
        </div>
      </footer>

      {isAuthOpen && (
        <Suspense fallback={null}>
          <AuthModal
            isOpen={isAuthOpen}
            mode={authMode}
            defaultPlanId={selectedPlanId}
            plans={plans}
            onClose={() => setIsAuthOpen(false)}
            onLoginSuccess={handleLoginSuccess}
            onSwitchMode={(m) => setAuthMode(m)}
            whitelabel={whitelabel}
          />
        </Suspense>
      )}

      {isUpgradeOpen && (
        <Suspense fallback={null}>
          <PaymentUpgradeModal
            isOpen={isUpgradeOpen}
            selectedPlan={targetPaidPlan}
            plan={targetPaidPlan}
            currentUser={currentUser}
            onClose={() => setIsUpgradeOpen(false)}
            onSuccess={handleUpgradeSuccess}
            onRequireLogin={() => {
              setIsUpgradeOpen(false);
              setAuthMode('login');
              setIsAuthOpen(true);
            }}
          />
        </Suspense>
      )}

      {isPinModalOpen && (
        <Suspense fallback={null}>
          <SecurityPinModal
            isOpen={isPinModalOpen}
            user={currentUser}
            onClose={() => setIsPinModalOpen(false)}
            onSuccess={(updated) => {
              setCurrentUser(updated);
              fetchData();
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

export default App;
