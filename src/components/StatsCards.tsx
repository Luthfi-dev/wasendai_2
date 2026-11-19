import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/csrfFetch';
import {
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Zap,
  Database,
  RefreshCw,
  Sparkles,
  Wifi,
  WifiOff,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { BotStats, UserAccount } from '../types/whatsapp';

interface StatsCardsProps {
  stats: BotStats | null;
  isAdmin?: boolean;
  currentUser?: UserAccount | null;
}

export const StatsCards: React.FC<StatsCardsProps> = ({ stats, isAdmin = false, currentUser }) => {
  const [isTestingDb, setIsTestingDb] = useState(false);
  const [showDbDetail, setShowDbDetail] = useState(false);
  const [dbStatus, setDbStatus] = useState<{
    connected: boolean;
    message?: string;
    version?: string;
    host?: string;
    port?: number;
    database?: string;
    errorCode?: string;
    errorReason?: string;
    hint?: string;
  } | null>(null);

  const checkCloudDbConnection = async () => {
    setIsTestingDb(true);
    try {
      const res = await apiFetch('/api/mysql/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (data.success && data.data?.connected) {
        setDbStatus({
          connected: true,
          message: 'Koneksi ke Database Cloud Online stabil & siap digunakan.',
          version: data.data.version || 'MySQL Online',
          host: data.data.host || 'Cloud Cluster',
          port: data.data.port || 3306,
          database: data.data.database || 'Cloud DB'
        });
      } else {
        setDbStatus({
          connected: false,
          message: 'Belum terhubung ke Database Cloud Online.',
          errorCode: data.data?.error_code || (!res.ok ? `HTTP_${res.status}` : 'MYSQL_DISCONNECTED'),
          errorReason:
            data.data?.error_detail ||
            data.data?.message ||
            data.error ||
            'Server database cloud belum merespons atau kredensial host belum dikonfigurasi.',
          hint: data.data?.hint,
          host: data.data?.host || '',
          port: data.data?.port || 3306,
          database: data.data?.database || ''
        });
      }
    } catch (err: any) {
      setDbStatus({
        connected: false,
        message: 'Koneksi ke Database Cloud terputus.',
        errorCode: 'NETWORK_ERROR',
        errorReason: err?.message || 'Gagal menghubungi server backend untuk pengecekan MySQL.',
        hint: 'Seluruh data tetap tersimpan di penyimpanan lokal sistem.'
      });
    } finally {
      setIsTestingDb(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      checkCloudDbConnection();
    }
  }, [isAdmin]);

  const totalIncoming = stats?.total_incoming || 0;
  const totalAutoReplied = stats?.total_auto_replied || 0;
  const totalAiReplied = stats?.total_ai_replied || 0;
  const totalFailed = stats?.total_failed || 0;

  const successRate = totalIncoming > 0
    ? Math.round((totalAutoReplied / totalIncoming) * 100)
    : 100;

  const firstName = currentUser?.name?.split(' ')[0] || (isAdmin ? 'Admin' : 'Operator');
  const dailySent = stats?.daily_messages_sent ?? currentUser?.daily_messages_sent ?? 0;
  const dailyLimit = stats?.daily_msg_limit ?? 100;
  const dailyQuotaPct = Math.min(100, Math.round((dailySent / Math.max(1, dailyLimit)) * 100));
  const dailyAiSent = stats?.daily_ai_sent ?? 0;
  const dailyAiLimit = stats?.daily_ai_limit ?? 50;
  const dailyAiPct = Math.min(100, Math.round((dailyAiSent / Math.max(1, dailyAiLimit)) * 100));

  return (
    <div className="space-y-3 mb-5">
      {/* Compact Context Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
              Halo, {firstName}
            </h2>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="truncate max-w-[160px] sm:max-w-xs">
                {stats?.active_session_name || 'Gateway Siap'}
              </span>
            </span>
          </div>
        </div>

        {/* Admin Compact Cloud DB Pill & Expandable Toggle */}
        {isAdmin && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowDbDetail(prev => !prev)}
              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border flex items-center gap-1.5 transition-colors min-h-[36px] ${
                dbStatus?.connected
                  ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
                  : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30'
              }`}
            >
              {dbStatus?.connected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span>{dbStatus?.connected ? 'Cloud DB' : 'DB Lokal'}</span>
              {showDbDetail ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={checkCloudDbConnection}
              disabled={isTestingDb}
              className="w-9 h-9 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl flex items-center justify-center transition-colors disabled:opacity-50"
              title="Cek Koneksi Cloud DB"
              aria-label="Cek Koneksi Cloud DB"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTestingDb ? 'animate-spin text-emerald-600' : ''}`} />
            </button>
          </div>
        )}
      </div>

      {/* Collapsible Admin Cloud DB Diagnostics (Hidden by default so mobile stays ultra-clean) */}
      {isAdmin && showDbDetail && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
              <Database className="w-4 h-4 text-emerald-600" />
              <span>{dbStatus?.connected ? 'Cloud DB Online Terhubung' : 'Mode Lokal Aktif (Cloud Standby)'}</span>
            </div>
            {dbStatus?.errorCode && !dbStatus.connected && (
              <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-mono text-[10px]">
                {dbStatus.errorCode}
              </span>
            )}
          </div>

          {dbStatus?.connected ? (
            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
              {dbStatus.host}:{dbStatus.port} / {dbStatus.database} · Sinkronisasi cloud aktif.
            </p>
          ) : (
            <div className="space-y-1.5 text-[11px] text-slate-600 dark:text-slate-300">
              <p className="font-mono bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 break-words">
                {dbStatus?.errorReason || 'Host Cloud DB belum dikonfigurasi. Data tersimpan aman di penyimpanan lokal.'}
              </p>
              {dbStatus?.hint && (
                <p className="text-amber-700 dark:text-amber-300">
                  <strong>Tips:</strong> {dbStatus.hint}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Clean 2x2 Mobile / 4-Col Desktop Bento Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {/* Card 1: Kuota Pesan */}
        <div className="bg-emerald-950 dark:bg-emerald-950/80 border border-emerald-800/70 rounded-2xl p-3.5 sm:p-4 text-white flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between gap-1.5 mb-2">
            <span className="text-[11px] font-semibold text-emerald-200 truncate">
              Kuota Harian
            </span>
            <Zap className="w-4 h-4 text-emerald-300 shrink-0" />
          </div>

          <div className="min-w-0">
            <div className="text-xl sm:text-2xl font-extrabold tracking-tight tabular-nums truncate">
              {isAdmin ? '∞' : `${dailySent} / ${dailyLimit}`}
            </div>
            <p className="text-[11px] text-emerald-200/80 mt-0.5 truncate tabular-nums">
              {isAdmin
                ? 'Akses tanpa batas'
                : `Bulan: ${stats?.monthly_messages_sent ?? currentUser?.monthly_messages_sent ?? 0}/${stats?.monthly_msg_limit ?? 3000}`}
            </p>
          </div>

          {!isAdmin && (
            <div className="mt-2.5 w-full bg-emerald-900 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-emerald-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${dailyQuotaPct}%` }}
              />
            </div>
          )}
        </div>

        {/* Card 2: Pesan Masuk */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between gap-1.5 mb-2">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">
              Pesan Masuk
            </span>
            <MessageSquare className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
          </div>

          <div className="min-w-0">
            <div className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight tabular-nums">
              {totalIncoming}
            </div>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5 truncate tabular-nums">
              {totalAutoReplied} terbalas otomatis
            </p>
          </div>
        </div>

        {/* Card 3: Respon Meta AI */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between gap-1.5 mb-2">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">
              Respon AI
            </span>
            <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
          </div>

          <div className="min-w-0">
            <div className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight tabular-nums truncate">
              {isAdmin ? totalAiReplied : `${dailyAiSent} / ${dailyAiLimit}`}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate tabular-nums">
              {isAdmin
                ? 'Meta AI WhatsApp'
                : `Bulan: ${stats?.monthly_ai_sent ?? 0}/${stats?.monthly_ai_limit ?? 1500}`}
            </p>
          </div>

          {!isAdmin && (
            <div className="mt-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${dailyAiPct}%` }}
              />
            </div>
          )}
        </div>

        {/* Card 4: Tingkat Keberhasilan */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between gap-1.5 mb-2">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">
              Keberhasilan
            </span>
            {totalFailed > 0 ? (
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            )}
          </div>

          <div className="min-w-0">
            <div className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight tabular-nums">
              {successRate}%
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1 truncate tabular-nums">
              <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{totalFailed > 0 ? `${totalFailed} gagal` : 'Anti-ban aktif'}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
